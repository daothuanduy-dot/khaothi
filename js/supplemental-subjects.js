// Supplemental scopes are separate from graduation registrations and main statistics.
export function wireSupplementalSubjects({state,$,esc,message,subjects}){
 let context=null, loadedExam='', token=0, busy=false;
 const examId=()=>$('settings-exam-select').value;
 const checked=kind=>[...$('supplemental-scopes').querySelectorAll(`input[data-kind="${kind}"]:checked`)].map(x=>x.value);
 function render(){
  const subject=$('supplemental-subject').value;
  const scope=context?.scopes?.find(x=>x.subject_code===subject)||{};
  const classes=[...new Set((context?.candidates||[]).map(x=>x.class_code).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  $('supplemental-scopes').innerHTML='<h4>Áp dụng theo lớp</h4><div class="checkbox-grid">'+classes.map(c=>`<label><input type="checkbox" data-kind="class" value="${esc(c)}" ${(scope.class_codes||[]).includes(c)?'checked':''}> ${esc(c)}</label>`).join('')+'</div><details><summary>Bổ sung riêng từng học sinh (ngoài các lớp đã chọn)</summary><div class="checkbox-grid">'+(context?.candidates||[]).map(c=>`<label><input type="checkbox" data-kind="student" value="${esc(c.id)}" ${(scope.candidate_ids||[]).includes(c.id)?'checked':''}> ${esc(c.sbd||'Chưa có SBD')} — ${esc(c.student_name)} — ${esc(c.class_code)}</label>`).join('')+'</div></details>';
  $('supplemental-summary').textContent=(context?.scopes||[]).map(s=>`${subjects.find(x=>x.code===s.subject_code)?.name||s.subject_code}: ${(s.class_codes||[]).join(', ')||'không chọn lớp'}; ${(s.candidate_ids||[]).length} học sinh riêng`).join(' | ')||'Chưa cấu hình môn bổ sung.';
 }
 async function refresh(){
  const current=++token, id=examId();
  const visible=state.role==='admin'&&state.exams.find(e=>e.id===id)?.exam_mode==='choice';
  $('supplemental-panel').classList.toggle('hidden',!visible);
  context=null;loadedExam='';$('supplemental-save').disabled=true;
  if(!visible)return;
  try{
   const {data,error}=await state.client.rpc('exam_get_supplemental_config',{p_exam_id:id});
   if(current!==token)return;
   if(error)throw new Error(`Không tải được môn bổ sung. Cần triển khai migration 202. ${error.message}`);
   context=data;loadedExam=id;render();$('supplemental-save').disabled=false;
   message($('supplemental-message'),'','info');
  }catch(error){if(current===token)message($('supplemental-message'),error.message,'error')}
 }
 $('supplemental-subject').innerHTML=subjects.map(s=>`<option value="${esc(s.code)}">${esc(s.name)} (${esc(s.code)})</option>`).join('');
 $('supplemental-subject').addEventListener('change',()=>{if(context)render()});
 $('supplemental-refresh').addEventListener('click',refresh);
 $('supplemental-save').addEventListener('click',async()=>{
  if(busy||!context||loadedExam!==examId())return;
  const id=examId(),subject=$('supplemental-subject').value;
  const classes=checked('class'),students=checked('student');
  if(!globalThis.confirm('Lưu phạm vi môn bổ sung? Giữ nguyên đăng ký lựa chọn, SBD, phòng và điểm hiện có.'))return;
  busy=true;$('supplemental-save').disabled=true;$('supplemental-subject').disabled=true;
  try{
   const {error}=await state.client.rpc('exam_save_supplemental_config',{p_exam_id:id,p_subject_code:subject,p_class_codes:classes,p_candidate_ids:students});
   if(error)throw error;
   state.statisticsRevision=(state.statisticsRevision||0)+1;
   if(id===examId()){await refresh();message($('supplemental-message'),'Đã lưu. Nhập điểm tại tab Điểm; xuất đầy đủ điểm tại mục ghi Excel CSDL.','success')}
  }catch(error){if(id===examId())message($('supplemental-message'),error.message,'error')}
  finally{busy=false;$('supplemental-subject').disabled=false;$('supplemental-save').disabled=!context||loadedExam!==examId()}
 });
 return {refresh};
}
