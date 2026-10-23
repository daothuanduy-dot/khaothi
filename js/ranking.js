export function checkRankingGroup(group,configs,classes,examMode='default'){
  const sets=group.class_codes.map(code=>({class_code:code,subjects:[...new Set(configs.filter(row=>row.class_code===code&&row.is_counted).map(row=>row.subject_code))].sort()}));
  const issues=[];
  if(examMode!=='default')issues.push('Kỳ thi theo môn chưa có bộ môn tính điểm theo lớp để đối chiếu.');
  if(!sets.length)issues.push('Ban chưa có lớp.');
  for(const item of sets){
    if(!classes.some(row=>row.class_code===item.class_code&&row.grade_code===group.grade_code))issues.push(`${item.class_code}: chưa có trong đúng khối/học kỳ hoặc kỳ thi.`);
    if(!item.subjects.length)issues.push(`${item.class_code}: chưa có môn Tính điểm.`);
  }
  if(new Set(sets.map(row=>JSON.stringify(row.subjects))).size>1)issues.push('Các lớp có bộ môn Tính điểm khác nhau.');
  return {compatible:!issues.length,issues,sets};
}

export function wireRanking({state,$,esc,message}){
  let examId='',periodId='',version=null,groups=[],periods=[],classes=[],configs=[],candidateClasses=[],dirty=false,busy=false,editId=null;
  const notify=(text,type='info')=>message($('ranking-message'),text,type);
  const admin=()=>{if(state.role!=='admin'||!state.client)throw new Error('Chỉ Admin được cấu hình ban.')};
  async function check(query){const {data,error}=await query;if(error){if(['PGRST202','42P01','PGRST205'].includes(error.code))throw new Error('Cần chạy migration 136 để liên kết học kỳ và cấu hình ban.');throw new Error(error.message)}return data}
  async function all(table,columns,configure=q=>q){const rows=[];for(let offset=0;;offset+=500){const page=await check(configure(state.client.from(table).select(columns)).range(offset,offset+499));rows.push(...page);if(page.length<500)return rows}}
  const year=value=>String(value||'').replace(/[–—/]/g,'-').replace(/\s/g,'');
  const exam=()=>state.exams.find(row=>row.id===examId);
  const eligible=()=>classes.filter(row=>candidateClasses.includes(row.class_code));
  const discard=()=>!dirty&&$('ranking-editor').hidden||confirm('Có cấu hình ban đang sửa hoặc chưa lưu. Bỏ thay đổi này?');
  function render(){
    $('ranking-period').innerHTML='<option value="">-- Chọn học kỳ --</option>'+periods.filter(row=>year(row.school_year)===year(exam()?.school_year)).map(row=>`<option value="${esc(row.id)}">${esc(row.school_year)} · Học kỳ ${row.semester}</option>`).join('');$('ranking-period').value=periodId;
    $('ranking-save').disabled=busy||!examId||!periodId||!dirty;
    $('ranking-new').disabled=busy||!examId||!periodId;
    const assigned=new Set(groups.flatMap(row=>row.class_codes));const pending=candidateClasses.filter(code=>!assigned.has(code));
    $('ranking-summary').textContent=!examId?'Chọn kỳ thi để thiết lập.':`${groups.length} ban · ${assigned.size} lớp đã gán · ${dirty?'Có thay đổi chưa lưu':'Đã tải cấu hình'}${pending.length?` · Lớp chưa có ban: ${pending.join(', ')}`:''}`;
    $('ranking-list').innerHTML=`<table><thead><tr><th>Khối</th><th>Ban</th><th>Lớp</th><th>Kiểm tra môn tính điểm</th><th>Thao tác</th></tr></thead><tbody>${groups.map(group=>{
      const result=checkRankingGroup(group,configs,eligible(),exam()?.exam_mode);
      const detail=result.sets.map(row=>`${row.class_code}: ${row.subjects.join(', ')||'Chưa có'}`).join(' · ');
      return `<tr><td>${esc(group.grade_code)}</td><td>${esc(group.name)}</td><td>${esc(group.class_codes.join(', '))}</td><td>${esc(result.compatible?'Cùng bộ môn tính điểm':result.issues.join(' '))}<br><small>${esc(detail)}</small></td><td><button type="button" data-ranking-edit="${esc(group.id)}">Sửa</button> <button type="button" data-ranking-remove="${esc(group.id)}">Bỏ ban</button></td></tr>`;
    }).join('')||'<tr><td colspan="5">Chưa có ban. Có thể lưu liên kết học kỳ trước rồi thêm ban.</td></tr>'}</tbody></table>`;
  }
  async function readClasses(id){return id?all('school_teaching_classes','class_code,grade_code',q=>q.eq('period_id',id).order('class_code')):[]}
  async function load(id){
    admin();if(!id){examId='';periodId='';groups=[];dirty=false;render();return}
    const results=await Promise.allSettled([
      check(state.client.rpc('exam_get_ranking_setup',{p_exam_id:id})),
      all('school_teaching_periods','id,school_year,semester',q=>q.order('school_year',{ascending:false}).order('semester')),
      all('exam_subject_class_configs','class_code,subject_code,is_counted',q=>q.eq('exam_id',id).order('class_code').order('subject_code'))
    ]);
    const failure=results.find(row=>row.status==='rejected');if(failure)throw failure.reason;
    const data=results[0].value,nextClasses=await readClasses(data.period_id);
    examId=id;periodId=data.period_id||'';version=data.version??null;groups=data.groups;candidateClasses=data.candidate_classes;
    periods=results[1].value;configs=results[2].value;classes=nextClasses;dirty=false;editId=null;$('ranking-editor').hidden=true;render();
  }
  async function run(fn){if(busy)return;busy=true;const controls=[...$('ranking-setup').querySelectorAll('input,select,button')],previous=controls.map(row=>row.disabled);controls.forEach(row=>row.disabled=true);
    try{admin();await fn()}catch(error){notify(error.message||String(error),'error')}finally{busy=false;controls.forEach((row,index)=>row.disabled=previous[index]);render()}}
  function choices(){
    const grade=$('ranking-grade').value,group=groups.find(row=>row.id===editId),selected=new Set(group?.class_codes||[]);
    const occupied=new Set(groups.filter(row=>row.id!==editId).flatMap(row=>row.class_codes));
    const rows=eligible().filter(row=>row.grade_code===grade);
    $('ranking-classes').innerHTML=rows.map(row=>`<label><input type="checkbox" data-ranking-class value="${esc(row.class_code)}" ${selected.has(row.class_code)?'checked':''} ${occupied.has(row.class_code)?'disabled':''}> ${esc(row.class_code)}${occupied.has(row.class_code)?' (đã thuộc ban khác)':''}</label>`).join('')||'<p>Chưa có lớp thuộc khối này trong cả kỳ thi và học kỳ. Hãy bổ sung lớp trước.</p>';
  }
  function open(id=null){editId=id;const group=groups.find(row=>row.id===id);$('ranking-name').value=group?.name||'';
    const grades=[...new Set([...eligible().map(row=>row.grade_code),...(group?[group.grade_code]:[])])].sort();
    $('ranking-grade').innerHTML=grades.map(code=>`<option value="${esc(code)}">${esc(code)}</option>`).join('');$('ranking-grade').value=group?.grade_code||grades[0]||'';
    $('ranking-editor').hidden=false;choices();
  }
  $('ranking-period').onchange=()=>{const id=$('ranking-period').value;if(!$('ranking-editor').hidden&&!confirm('Đổi học kỳ sẽ đóng phần ban đang sửa. Tiếp tục?')){$('ranking-period').value=periodId;return}return run(async()=>{try{const rows=await readClasses(id);periodId=id;classes=rows;dirty=true;$('ranking-editor').hidden=true}catch(error){$('ranking-period').value=periodId;throw error}})};
  $('ranking-grade').onchange=choices;
  $('ranking-new').onclick=()=>{if(!busy)open()};$('ranking-cancel').onclick=()=>{$('ranking-editor').hidden=true;editId=null};
  $('ranking-apply').onclick=()=>run(async()=>{
    const name=$('ranking-name').value.trim(),grade_code=$('ranking-grade').value;
    const class_codes=[...$('ranking-classes').querySelectorAll('[data-ranking-class]:checked')].map(row=>row.value);
    if(!name||!grade_code||!class_codes.length)throw new Error('Nhập tên ban, chọn khối và ít nhất một lớp.');
    if(groups.some(row=>row.id!==editId&&row.grade_code===grade_code&&row.name===name))throw new Error('Tên ban đã có trong khối.');
    if(groups.some(row=>row.id!==editId&&row.class_codes.some(code=>class_codes.includes(code))))throw new Error('Có lớp đã thuộc ban khác.');
    const group={id:editId||crypto.randomUUID(),name,grade_code,class_codes};groups=groups.filter(row=>row.id!==editId);groups.push(group);dirty=true;$('ranking-editor').hidden=true;editId=null;
  });
  $('ranking-list').onclick=event=>{if(busy)return;const edit=event.target.closest('[data-ranking-edit]'),remove=event.target.closest('[data-ranking-remove]');
    if(edit)open(edit.dataset.rankingEdit);if(remove&&confirm('Bỏ ban khỏi cấu hình? Chỉ có hiệu lực khi nhấn Lưu.')){groups=groups.filter(row=>row.id!==remove.dataset.rankingRemove);dirty=true;render()}};
  $('ranking-save').onclick=()=>run(async()=>{
    if(!$('ranking-editor').hidden)throw new Error('Đưa ban đang sửa vào danh sách hoặc Hủy sửa ban trước khi lưu.');
    if(!periodId)throw new Error('Chọn học kỳ.');
    const data=await check(state.client.rpc('exam_save_ranking_setup',{p_exam_id:examId,p_period_id:periodId,p_expected_version:version,p_groups:groups}));
    version=data.version;groups=data.groups;dirty=false;notify('Đã lưu liên kết học kỳ và các ban. Các cảnh báo bộ môn cần được xử lý trước khi xếp hạng.','success');
  });
  $('ranking-refresh').onclick=()=>run(async()=>{if(discard())await load($('settings-exam-select').value)});
  $('settings-exam-select').addEventListener('change',()=>{const id=$('settings-exam-select').value;if(busy){$('settings-exam-select').value=examId;return}if(!discard()){$('settings-exam-select').value=examId;return}run(async()=>{try{await load(id)}catch(error){$('settings-exam-select').value=examId;throw error}})});
  window.addEventListener('beforeunload',event=>{if(dirty||!$('ranking-editor').hidden){event.preventDefault();event.returnValue=''}});
  return {refresh:()=>busy||dirty||!$('ranking-editor').hidden?Promise.resolve():run(()=>load($('settings-exam-select').value))};
}
