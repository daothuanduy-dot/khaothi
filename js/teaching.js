// Teaching assignments never grant grading permissions or change exam configuration.
const cellKey=(classCode,subjectCode='')=>JSON.stringify([classCode,subjectCode]);
export function teachingRosterClasses(students){
  const result=new Map();
  for(const student of students){
    const code=String(student.class_code||'').trim(),grade=String(student.grade_code||'').trim();
    if(!code)continue;
    if(!result.has(code))result.set(code,{class_code:code,grades:new Set(),student_count:0});
    const row=result.get(code);row.grades.add(grade);row.student_count++;
  }
  return [...result.values()].map(row=>({class_code:row.class_code,grade_code:row.grades.size===1?[...row.grades][0]:'',student_count:row.student_count}))
    .sort((a,b)=>a.class_code.localeCompare(b.class_code,'vi',{numeric:true}));
}
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
  let rosterClasses=[],selectedClasses=new Set();
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
    $('teaching-load-classes').disabled=busy||!periodId;
    $('teaching-class-add').disabled=busy||!periodId;
    const period=periods.find(row=>row.id===periodId);
    $('teaching-period-status').textContent=period?`Đang mở ${period.school_year} · Học kỳ ${period.semester} · ${classes.length} lớp đã gán`:'Tạo hoặc mở học kỳ ở trên để chọn lớp.';
    const select=(cls,subject='')=>{
      const teacher=draft.value(cls,subject),key=cellKey(cls,subject),profile=teachers.find(row=>row.user_id===teacher);
      return `<td class="${teacher?'':'teaching-empty'} ${draft.changes.has(key)?'teaching-dirty':''}"><select data-teaching-class="${esc(cls)}" data-teaching-subject="${esc(subject)}" aria-label="${esc(`${cls} - ${subject||'GVCN'}`)}" title="${esc(profile?.full_name||'Chưa phân công')}" ${busy?'disabled':''}>${teacherOptions(teacher)}</select></td>`;
    };
    $('teaching-matrix').innerHTML=!periodId?'<p>Chọn hoặc tạo kỳ học để phân công.</p>':
      `<table><thead><tr><th>Lớp</th><th>GVCN</th>${catalog.map(subject=>`<th>${esc(subject.subject_name)}</th>`).join('')}</tr></thead><tbody>${rows.map(cls=>`<tr><th>${esc(cls.class_code)}</th>${select(cls.class_code)}${catalog.map(subject=>select(cls.class_code,subject.subject_code)).join('')}</tr>`).join('')||`<tr><td colspan="${catalog.length+2}">Chưa có lớp phù hợp. Chọn lớp tại bước 2 ở trên hoặc kiểm tra bộ lọc.</td></tr>`}</tbody></table>`;
    renderClassPicker();
  }
  const pickerRows=()=>rosterClasses.filter(row=>(!$('teaching-picker-grade').value||row.grade_code===$('teaching-picker-grade').value)
    &&row.class_code.toLocaleLowerCase('vi').includes($('teaching-picker-search').value.trim().toLocaleLowerCase('vi')));
  const canSelectClass=row=>!!row.grade_code&&!classes.some(cls=>cls.class_code===row.class_code);
  function renderClassPicker(){
    if($('teaching-class-picker').hidden)return;
    const rows=pickerRows();
    $('teaching-picker-count').textContent=`${rosterClasses.length} lớp trong danh sách học sinh · Đã chọn ${selectedClasses.size} lớp mới`;
    $('teaching-picker-save').disabled=busy||!periodId||!selectedClasses.size;
    $('teaching-picker-list').innerHTML=`<table><thead><tr><th>Chọn</th><th>Lớp</th><th>Khối</th><th>Học sinh</th><th>Trạng thái</th></tr></thead><tbody>${rows.map(row=>{
      const assigned=classes.some(cls=>cls.class_code===row.class_code),allowed=canSelectClass(row);
      return `<tr><td><input type="checkbox" data-teaching-pick="${esc(row.class_code)}" aria-label="Chọn lớp ${esc(row.class_code)}" ${selectedClasses.has(row.class_code)?'checked':''} ${!allowed||busy?'disabled':''}></td><td>${esc(row.class_code)}</td><td>${esc(row.grade_code||'Cần kiểm tra')}</td><td>${row.student_count}</td><td>${assigned?'Đã có trong học kỳ':!row.grade_code?'Thiếu hoặc không thống nhất khối':'Chưa gán'}</td></tr>`;
    }).join('')||'<tr><td colspan="5">Không có lớp phù hợp trong danh sách học sinh. Có thể thêm lớp thủ công.</td></tr>'}</tbody></table>`;
  }
  async function openClassPicker(){
    periodRequired();
    rosterClasses=teachingRosterClasses(await all('school_students','id,class_code,grade_code',q=>q.order('id')));
    selectedClasses=new Set();$('teaching-picker-grade').value='';$('teaching-picker-search').value='';
    $('teaching-picker-grade').innerHTML='<option value="">Tất cả khối</option>'+[...new Set(rosterClasses.map(row=>row.grade_code).filter(Boolean))].sort().map(code=>`<option value="${esc(code)}">${esc(code)}</option>`).join('');
    $('teaching-class-picker').hidden=false;renderClassPicker();
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
    const nextId=periods.some(row=>row.id===id)?id:periods[0]?.id||'';
    const data=nextId===id?results[3].value:await readPeriod(nextId);
    if(periodId!==nextId){rosterClasses=[];selectedClasses.clear();$('teaching-class-picker').hidden=true}
    periodId=nextId;classes=data.classes;draft=createTeachingDraft(data.assignments,data.homerooms);
    for(const code of selectedClasses)if(classes.some(row=>row.class_code===code))selectedClasses.delete(code);
    const period=periods.find(row=>row.id===periodId);
    if(period){$('teaching-year').value=period.school_year;$('teaching-semester').value=String(period.semester)}
    else if(!$('teaching-year').value)$('teaching-year').value=state.exams?.find(row=>row.id===state.selectedExam)?.school_year||state.exams?.[0]?.school_year||'';
    fillControls();render();
  }
  // Disable editing and navigation during requests so responses cannot replace a newer draft.
  async function run(fn){
    if(busy)return;busy=true;
    $('teaching-message').classList?.add('hidden');
    const controls=[...$('tab-teaching').querySelectorAll('input,select,button')];
    const previous=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true);
    try{requireAdmin();await fn()}catch(error){notice(error.message||String(error),'error')}
    finally{busy=false;controls.forEach((control,index)=>control.disabled=previous[index]);render()}
  }
  const button=(id,fn)=>$(id).onclick=()=>run(fn);
  const group=(id,buttonId,fn)=>{
    button(buttonId,fn);
    $(id).onkeydown=event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();return run(fn)}};
  };
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
  group('teaching-period-form','teaching-period-open',async()=>{
    if(!mayDiscard())return;
    const year=$('teaching-year').value.trim().replace(/[–—/]/g,'-').replace(/\s/g,''),semester=Number($('teaching-semester').value);
    if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1)throw new Error('Năm học phải có dạng 2026-2027, gồm hai năm liên tiếp.');
    if(![1,2].includes(semester))throw new Error('Chọn học kỳ I hoặc II.');
    const row=periods.find(item=>item.school_year===year&&item.semester===semester)||await checked(state.client.from('school_teaching_periods').upsert({school_year:year,semester},{onConflict:'school_year,semester'}).select('id').single());
    await load(row.id);
    notice(`Đã mở ${year} · Học kỳ ${semester}. Chọn các lớp bên dưới để gán vào học kỳ.`,'success');
    try{await openClassPicker()}catch(error){notice(`Đã mở học kỳ, nhưng chưa tải được danh sách lớp: ${error.message}. Nhấn Chọn lớp để thử lại.`,'error')}
  });
  group('teaching-class-form','teaching-class-add',async()=>{
    periodRequired();if(draft.changes.size)throw new Error('Lưu hoặc bỏ thay đổi phân công trước khi thêm lớp.');
    const class_code=$('teaching-class-code').value.trim(),grade_code=$('teaching-class-grade').value.trim();
    if(!class_code||!grade_code)throw new Error('Nhập lớp và khối.');
    await checked(state.client.from('school_teaching_classes').insert({period_id:periodId,class_code,grade_code}));
    await load();notice(`Đã thêm lớp ${class_code}.`,'success');
  });
  button('teaching-load-classes',async()=>{
    await openClassPicker();notice('Chọn các lớp hoặc lọc khối rồi Chọn tất cả đang lọc, sau đó nhấn Gán các lớp đã chọn.');
  });
  $('teaching-picker-grade').onchange=renderClassPicker;$('teaching-picker-search').oninput=renderClassPicker;
  $('teaching-picker-list').onchange=event=>{
    const box=event.target.closest('[data-teaching-pick]');if(!box||busy)return;
    const row=rosterClasses.find(row=>row.class_code===box.dataset.teachingPick);if(!row||!canSelectClass(row))return;
    if(box.checked)selectedClasses.add(row.class_code);else selectedClasses.delete(row.class_code);renderClassPicker();
  };
  button('teaching-picker-all',async()=>{for(const row of pickerRows())if(canSelectClass(row))selectedClasses.add(row.class_code)});
  button('teaching-picker-none',async()=>{for(const row of pickerRows())selectedClasses.delete(row.class_code)});
  button('teaching-picker-save',async()=>{
    periodRequired();if(draft.changes.size)throw new Error('Lưu hoặc bỏ thay đổi phân công trước khi gán thêm lớp.');
    const rows=rosterClasses.filter(row=>selectedClasses.has(row.class_code)&&canSelectClass(row)).map(row=>({period_id:periodId,class_code:row.class_code,grade_code:row.grade_code}));
    if(!rows.length)throw new Error('Hãy chọn ít nhất một lớp chưa gán.');
    await checked(state.client.from('school_teaching_classes').upsert(rows,{onConflict:'period_id,class_code',ignoreDuplicates:true}));
    selectedClasses.clear();await load();notice(`Đã gán ${rows.length} lớp vào học kỳ đang mở.`,'success');
  });
  group('teaching-subject-form','teaching-subject-add',async()=>{
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
