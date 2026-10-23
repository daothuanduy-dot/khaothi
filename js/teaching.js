// Teaching assignments never grant grading permissions or change exam configuration.
const cellKey=(classCode,subjectCode='')=>JSON.stringify([classCode,subjectCode]);
export function createTeachingDraft(assignments=[],homerooms=[]){
  const original=new Map(),changes=new Map();
  for(const row of [...assignments,...homerooms])original.set(cellKey(row.class_code,row.subject_code||''),row);
  return {
    original,changes,
    value(cls,subject=''){const key=cellKey(cls,subject);return changes.has(key)?changes.get(key).teacher_user_id:original.get(key)?.teacher_user_id||''},
    set(cls,subject,teacher){
      const key=cellKey(cls,subject),previous=original.get(key);
      if((previous?.teacher_user_id||'')===(teacher||''))changes.delete(key);
      else changes.set(key,{class_code:cls,subject_code:subject||null,teacher_user_id:teacher||null,expected_updated_at:previous?.updated_at||null});
    }
  };
}

export function wireTeaching({state,$,esc,message,subjects=[]}){
  let periods=[],classes=[],catalog=[],teachers=[],draft=createTeachingDraft(),periodId='',busy=false;
  const notice=(text,type='info')=>message($('teaching-message'),text,type);
  const requireAdmin=()=>{if(state.role!=='admin'||!state.client)throw new Error('Chỉ Admin được quản lý phân công giảng dạy.')};
  async function checked(request){const {data,error}=await request;if(error){
    if(['42P01','42703','PGRST202','PGRST205'].includes(error.code))throw new Error('Cần chạy migration 130 và 132 để dùng phân công giảng dạy.');
    throw new Error(error.message||String(error));
  }return data}
  // Supabase returns at most a page by default; assignments can exceed 1,000 cells.
  async function all(table,columns,configure=query=>query){
    const result=[];
    for(let offset=0;;offset+=500){const rows=await checked(configure(state.client.from(table).select(columns)).range(offset,offset+499));result.push(...rows);if(rows.length<500)return result}
  }
  function periodRequired(){if(!periodId)throw new Error('Hãy chọn hoặc tạo kỳ học trước.');}
  function mayDiscard(){return !draft.changes.size||confirm('Có phân công chưa lưu. Bỏ các thay đổi này?')}
  function teacherOptions(value=''){
    const rows=teachers.map(row=>`<option value="${esc(row.user_id)}" ${row.user_id===value?'selected':''}>${esc([row.full_name||row.email,row.report_name?`(${row.report_name})`:''].filter(Boolean).join(' '))}</option>`).join('');
    const missing=value&&!teachers.some(row=>row.user_id===value)?`<option value="${esc(value)}" selected>Giáo viên ${esc(value)}</option>`:'';
    return `<option value="">-- Chưa phân công --</option>${rows}${missing}`;
  }
  const visibleClasses=()=>classes.filter(row=>(!$('teaching-grade').value||row.grade_code===$('teaching-grade').value)
    &&row.class_code.toLocaleLowerCase('vi').includes($('teaching-search').value.trim().toLocaleLowerCase('vi'))
    &&(!$('teaching-missing').checked||!draft.value(row.class_code)||catalog.some(subject=>!draft.value(row.class_code,subject.subject_code))));
  function render(){
    const rows=visibleClasses();
    let filled=0,homerooms=0;
    for(const cls of classes){if(draft.value(cls.class_code))homerooms++;for(const subject of catalog)if(draft.value(cls.class_code,subject.subject_code))filled++}
    $('teaching-summary').textContent=periodId?`${classes.length} lớp · ${catalog.length} môn · Đã phân công ${filled}/${classes.length*catalog.length} ô môn · GVCN ${homerooms}/${classes.length} · ${draft.changes.size} thay đổi chưa lưu`:'Chọn hoặc tạo kỳ học để bắt đầu.';
    $('teaching-save').disabled=busy||!draft.changes.size;$('teaching-discard').disabled=busy||!draft.changes.size;
    const select=(cls,subject='')=>{
      const teacher=draft.value(cls,subject),key=cellKey(cls,subject),profile=teachers.find(row=>row.user_id===teacher);
      return `<td class="${teacher?'':'teaching-empty'} ${draft.changes.has(key)?'teaching-dirty':''}"><select data-teaching-class="${esc(cls)}" data-teaching-subject="${esc(subject)}" aria-label="${esc(`${cls} - ${subject||'GVCN'}`)}" title="${esc(profile?.full_name||'Chưa phân công')}" ${busy?'disabled':''}>${teacherOptions(teacher)}</select></td>`;
    };
    $('teaching-matrix').innerHTML=!periodId?'<p>Chọn hoặc tạo kỳ học để phân công.</p>':
      `<table><thead><tr><th>Lớp</th><th>GVCN</th>${catalog.map(subject=>`<th>${esc(subject.subject_name)}</th>`).join('')}</tr></thead><tbody>${rows.map(cls=>`<tr><th>${esc(cls.class_code)}</th>${select(cls.class_code)}${catalog.map(subject=>select(cls.class_code,subject.subject_code)).join('')}</tr>`).join('')||`<tr><td colspan="${catalog.length+2}">Chưa có lớp phù hợp. Thêm lớp trong phần Thiết lập.</td></tr>`}</tbody></table>`;
  }
  function fillControls(){
    const label=row=>`${row.school_year} · Học kỳ ${row.semester}`;
    $('teaching-period').innerHTML='<option value="">-- Chọn năm học / học kỳ --</option>'+periods.map(row=>`<option value="${esc(row.id)}">${esc(label(row))}</option>`).join('');
    $('teaching-period').value=periodId;
    $('teaching-copy-period').innerHTML='<option value="">-- Chọn kỳ nguồn --</option>'+periods.filter(row=>row.id!==periodId).map(row=>`<option value="${esc(row.id)}">${esc(label(row))}</option>`).join('');
    const grade=$('teaching-grade').value;
    $('teaching-grade').innerHTML='<option value="">Tất cả khối</option>'+[...new Set(classes.map(row=>row.grade_code))].sort().map(code=>`<option value="${esc(code)}">${esc(code)}</option>`).join('');
    if(classes.some(row=>row.grade_code===grade))$('teaching-grade').value=grade;
    $('teaching-bulk-subject').innerHTML='<option value="">Giáo viên chủ nhiệm</option>'+catalog.map(row=>`<option value="${esc(row.subject_code)}">${esc(row.subject_name)}</option>`).join('');
    $('teaching-bulk-teacher').innerHTML=teacherOptions();
  }
  async function readPeriod(id){
    if(!id)return {classes:[],assignments:[],homerooms:[]};
    const queries=[
      all('school_teaching_classes','class_code,grade_code',q=>q.eq('period_id',id).order('class_code')),
      all('school_teaching_assignments','class_code,subject_code,teacher_user_id,updated_at',q=>q.eq('period_id',id).order('class_code').order('subject_code')),
      all('school_homeroom_assignments','class_code,teacher_user_id,updated_at',q=>q.eq('period_id',id).order('class_code'))
    ];
    const results=await Promise.allSettled(queries);
    const error=results.find(result=>result.status==='rejected');if(error)throw error.reason;
    return {classes:results[0].value,assignments:results[1].value,homerooms:results[2].value};
  }
  async function load(id=periodId){
    requireAdmin();
    const results=await Promise.allSettled([
      all('school_teaching_periods','id,school_year,semester',q=>q.order('school_year',{ascending:false}).order('semester',{ascending:false})),
      all('school_teaching_subjects','subject_code,subject_name,is_active',q=>q.order('subject_code')),
      all('exam_user_profiles','user_id,full_name,email,report_name',q=>q.order('user_id')),
      readPeriod(id)
    ]);
    const error=results.find(result=>result.status==='rejected');if(error)throw error.reason;
    periods=results[0].value;catalog=results[1].value;teachers=results[2].value;
    teachers.sort((a,b)=>(a.full_name||a.email).localeCompare(b.full_name||b.email,'vi'));
    const data=results[3].value;
    periodId=periods.some(row=>row.id===id)?id:'';classes=data.classes;draft=createTeachingDraft(data.assignments,data.homerooms);
    fillControls();render();
  }
  // Disable editing and navigation during requests so responses cannot replace a newer draft.
  async function run(fn){
    if(busy)return;busy=true;
    const controls=[...$('tab-teaching').querySelectorAll('input,select,button')];
    const previous=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true);
    try{requireAdmin();await fn()}catch(error){notice(error.message||String(error),'error')}
    finally{busy=false;controls.forEach((control,index)=>control.disabled=previous[index]);render()}
  }
  const button=(id,fn)=>$(id).onclick=()=>run(fn);
  const form=(id,fn)=>$(id).onsubmit=event=>{event.preventDefault();return run(fn)};
  $('teaching-period').onchange=()=>{const id=$('teaching-period').value;if(!mayDiscard()){$('teaching-period').value=periodId;return}return run(async()=>{try{await load(id)}catch(error){$('teaching-period').value=periodId;throw error}})};
  $('teaching-grade').onchange=render;$('teaching-search').oninput=render;$('teaching-missing').onchange=render;
  $('teaching-matrix').onchange=event=>{
    const input=event.target.closest('[data-teaching-class]');if(!input||busy)return;
    draft.set(input.dataset.teachingClass,input.dataset.teachingSubject,input.value);render();
  };
  button('teaching-refresh',async()=>{if(mayDiscard())await load()});
  button('teaching-discard',async()=>{if(mayDiscard()){draft.changes.clear();render()}});
  button('teaching-save',async()=>{
    periodRequired();if(!draft.changes.size)return;
    const rows=[...draft.changes.values()];
    await checked(state.client.rpc('school_save_teaching_matrix',{p_period_id:periodId,p_rows:rows}));
    // A successful write must never be sent again with stale expected timestamps.
    for(const row of rows){const key=cellKey(row.class_code,row.subject_code||'');
      if(row.teacher_user_id)draft.original.set(key,{...row,updated_at:null});else draft.original.delete(key);
    }
    draft.changes.clear();
    try{await load();notice(`Đã lưu ${rows.length} thay đổi phân công.`,'success')}
    catch(error){notice(`Đã lưu phân công nhưng chưa tải lại được: ${error.message}. Hãy tải lại trước khi sửa tiếp.`,'error');classes=[]}
  });
  form('teaching-period-form',async()=>{
    if(!mayDiscard())return;
    const year=$('teaching-year').value.trim(),semester=Number($('teaching-semester').value);
    if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1)throw new Error('Năm học phải có dạng 2026-2027, gồm hai năm liên tiếp.');
    const row=await checked(state.client.from('school_teaching_periods').upsert({school_year:year,semester},{onConflict:'school_year,semester'}).select('id').single());
    await load(row.id);notice('Đã mở kỳ học. Thêm lớp và môn để phân công.','success');
  });
  form('teaching-class-form',async()=>{
    periodRequired();if(draft.changes.size)throw new Error('Lưu hoặc bỏ thay đổi phân công trước khi thêm lớp.');
    const class_code=$('teaching-class-code').value.trim(),grade_code=$('teaching-class-grade').value.trim();
    if(!class_code||!grade_code)throw new Error('Nhập lớp và khối.');
    await checked(state.client.from('school_teaching_classes').insert({period_id:periodId,class_code,grade_code}));
    await load();notice(`Đã thêm lớp ${class_code}.`,'success');
  });
  button('teaching-load-classes',async()=>{
    periodRequired();if(draft.changes.size)throw new Error('Lưu hoặc bỏ thay đổi phân công trước khi bổ sung lớp.');
    const students=await all('school_students','id,class_code,grade_code',q=>q.order('id'));
    const unique=new Map();for(const row of students){if(!row.class_code||!row.grade_code)continue;
      if(unique.has(row.class_code)&&unique.get(row.class_code).grade_code!==row.grade_code)throw new Error(`Lớp ${row.class_code} có nhiều mã khối trong danh sách học sinh. Hãy kiểm tra lại.`);
      unique.set(row.class_code,{period_id:periodId,class_code:row.class_code,grade_code:row.grade_code});
    }
    const rows=[...unique.values()].filter(row=>!classes.some(cls=>cls.class_code===row.class_code));
    if(!rows.length){notice('Không có lớp mới để bổ sung.');return}
    if(!confirm(`Bổ sung ${rows.length} lớp từ danh sách học sinh vào kỳ ${periods.find(row=>row.id===periodId)?.school_year}?`))return;
    await checked(state.client.from('school_teaching_classes').upsert(rows,{onConflict:'period_id,class_code',ignoreDuplicates:true}));
    await load();notice(`Đã bổ sung ${rows.length} lớp.`,'success');
  });
  form('teaching-subject-form',async()=>{
    if(draft.changes.size)throw new Error('Lưu hoặc bỏ thay đổi phân công trước khi thêm môn.');
    const subject_code=$('teaching-subject-code').value.trim().toUpperCase(),subject_name=$('teaching-subject-name').value.trim();
    if(!subject_code||!subject_name)throw new Error('Nhập mã và tên môn.');
    await checked(state.client.from('school_teaching_subjects').insert({subject_code,subject_name}));await load();notice('Đã thêm môn học.','success');
  });
  button('teaching-standard-subjects',async()=>{
    if(draft.changes.size)throw new Error('Lưu hoặc bỏ thay đổi phân công trước khi bổ sung môn.');
    const rows=[...new Map([{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...subjects].map(row=>[row.code,{subject_code:row.code,subject_name:row.name}])).values()];
    await checked(state.client.from('school_teaching_subjects').upsert(rows,{onConflict:'subject_code',ignoreDuplicates:true}));await load();notice('Đã bổ sung danh mục môn, giữ nguyên các môn đã có.','success');
  });
  button('teaching-bulk-apply',async()=>{
    periodRequired();const subject=$('teaching-bulk-subject').value,teacher=$('teaching-bulk-teacher').value,rows=visibleClasses();
    if(!teacher)throw new Error('Chọn giáo viên để gán nhanh.');
    if(!$('teaching-bulk-empty').checked&&!confirm(`Gán giáo viên cho ${rows.length} lớp đang hiển thị, bao gồm ô đã phân công?`))return;
    for(const cls of rows)if(!$('teaching-bulk-empty').checked||!draft.value(cls.class_code,subject))draft.set(cls.class_code,subject,teacher);
    notice('Đã điền bảng. Kiểm tra và nhấn Lưu thay đổi.');
  });
  button('teaching-copy',async()=>{
    periodRequired();const source=$('teaching-copy-period').value;
    if(!source||source===periodId)throw new Error('Chọn kỳ nguồn khác kỳ đang mở.');
    const data=await readPeriod(source),allowed=new Set(classes.map(row=>row.class_code)),codes=new Set(catalog.map(row=>row.subject_code));let count=0;
    for(const row of [...data.assignments,...data.homerooms]){
      const subject=row.subject_code||'';
      if(allowed.has(row.class_code)&&(!subject||codes.has(subject))&&!draft.value(row.class_code,subject)){
        draft.set(row.class_code,subject,row.teacher_user_id);count++;
      }
    }
    notice(`Đã điền ${count} ô trống cho các lớp/môn trùng mã. Kiểm tra và nhấn Lưu thay đổi.`);
  });
  window.addEventListener('beforeunload',event=>{if(draft.changes.size){event.preventDefault();event.returnValue=''}});
  return {refresh:()=>{if(busy||draft.changes.size)return Promise.resolve();return run(()=>load())}};
}
