export function wireSubjectAmendments({state,$,esc,message,subjectName,onChanged,createPrintFrame}){
 let context=null,preview=null,busy=false,sequence=0;
 const notify=(s,type='info')=>message($('amend-message'),s,type);
 const invalidate=()=>{preview=null;$('amend-apply').disabled=true;$('amend-preview-result').innerHTML='';};
 const rpc=async(name,args)=>{const {data,error}=await state.client.rpc(name,args);if(error)throw new Error(error.message);return data;};
 const scope=()=>{if(state.role!=='admin'||!context||context.examId!==state.selectedExam)throw new Error('Kỳ thi đã đổi. Hãy tải lại danh sách điều chỉnh.');};
 const read=async(table,configure)=>{const rows=[];for(let offset=0;;offset+=500){const {data,error}=await configure(state.client.from(table).select('*')).range(offset,offset+499);if(error)throw new Error(error.message);rows.push(...data);if(data.length<500)return rows;}};
 const selectedPlan=()=>context?.plans.find(p=>p.id===$('amend-plan').value);
 const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
 function candidateChanged(){
  invalidate();const a=selectedPlan()?.assignments.find(a=>a.candidate_id===$('amend-candidate').value);
  $('amend-old').innerHTML=[a?.ca1_subject_code,a?.ca2_subject_code].filter(Boolean).map(c=>option(c,subjectName(c))).join('');
 }
 function planChanged(){
  invalidate();const p=selectedPlan();
  $('amend-candidate').innerHTML=option('','Chọn học sinh')+(p?.assignments||[]).map(a=>{const c=context.candidates.find(c=>c.id===a.candidate_id);return option(a.candidate_id,`${a.sbd} — ${c?.student_name||''} — ${c?.class_code||''}`);}).join('');
  $('amend-room').innerHTML=option('','Chọn phòng cùng ca')+(p?.rooms||[]).map(r=>option(r.room_code,r.room_code)).join('');
  $('amend-new').innerHTML=option('','Chọn môn mới')+(context.subjects||[]).filter(s=>Number(s.round_no)===Number(p?.round_no)&&s.subject_type==='elective').map(s=>option(s.subject_code,subjectName(s.subject_code))).join('');
  candidateChanged();
 }
 function describe(v){return `<p><strong>${esc(v.student_name)} — ${esc(v.class_code)} — SBD ${esc(v.sbd)}</strong></p><p>Đợt ${esc(v.round_no)}, ca ${esc(v.slot)}: ${esc(subjectName(v.old_subject))} (${esc(v.old_room)}) → ${esc(subjectName(v.new_subject))} (${esc(v.new_room)}).</p><p>Sĩ số ca sau điều chỉnh: ${esc(v.occupancy_after)}/${esc(v.capacity)}. Giữ nguyên SBD và các môn khác.</p><p>Lý do: ${esc(v.reason)}</p>`;}
 function history(){
  $('amend-history').innerHTML=context.history.length?`<table><thead><tr><th>SBD</th><th>Điều chỉnh</th><th>Thời gian / người lưu</th><th>Thông báo</th></tr></thead><tbody>${context.history.map(m=>`<tr><td>${esc(m.sbd)}</td><td>${esc(subjectName(m.old_subject))} (${esc(m.old_room)}) → ${esc(subjectName(m.new_subject))} (${esc(m.new_room)}), ca ${esc(m.slot)}</td><td>${esc(new Date(m.changed_at).toLocaleString('vi-VN'))}<br>${esc(m.changed_by)}</td><td><button type="button" data-amend-print="${esc(m.id)}">In thông báo</button></td></tr>`).join('')}</tbody></table>`:'Chưa có điều chỉnh.';
 }
 async function load(){
  invalidate();context=null;const request=++sequence,examId=state.selectedExam;
  if(!examId||state.role!=='admin')throw new Error('Chọn kỳ thi với quyền Admin.');
  if(state.exams.find(e=>e.id===examId)?.exam_mode!=='choice')throw new Error('Chức năng dành cho kỳ thi lựa chọn đã chốt phòng theo đợt.');
  const [plans,candidates,subjects,audit]=await Promise.all([
   read('exam_effective_rooming_round_plans',q=>q.eq('exam_id',examId).eq('status','official').eq('plan_type','elective').order('id')),
   read('exam_candidates',q=>q.eq('exam_id',examId).order('sbd').order('id')),
   read('exam_round_subjects',q=>q.eq('exam_id',examId).order('round_no').order('subject_code')),
   read('exam_subject_amendments',q=>q.eq('exam_id',examId).order('changed_at',{ascending:false}).order('id'))]);
  if(request!==sequence||examId!==state.selectedExam)return;
  context={examId,plans,candidates,subjects,history:audit};
  $('amend-plan').innerHTML=plans.map(p=>option(p.id,`Đợt ${p.round_no} — ${p.assignments.length} học sinh`)).join('');planChanged();history();
  notify(plans.length?'Đã tải dữ liệu có hiệu lực. Chọn học sinh, môn mới và phòng thi cùng ca.':'Chưa có phương án lựa chọn đã chốt theo đợt.');
 }
 async function check(){
  invalidate();scope();const examId=context.examId;
  const args={p_plan_id:$('amend-plan').value,p_candidate_id:$('amend-candidate').value,p_old_subject:$('amend-old').value,p_new_subject:$('amend-new').value,p_new_room:$('amend-room').value,p_reason:$('amend-reason').value.trim()};
  const v=await rpc('exam_preview_subject_amendment',args);
  if(examId!==state.selectedExam)return;
  preview=v;$('amend-preview-result').innerHTML=describe(v);$('amend-apply').disabled=false;
  notify('Kiểm tra thông tin trên trước khi xác nhận lưu. Chưa thay đổi dữ liệu.');
 }
 async function apply(){
  scope();if(!preview)throw new Error('Cần xem trước lại.');const v=preview;invalidate();
  const result=await rpc('exam_apply_subject_amendment',{p_preview:v});
  await onChanged?.();
  if(state.selectedExam===v.exam_id){await load();notify(`Đã lưu điều chỉnh ${result.sbd}. Giữ nguyên SBD và bản chốt; tải lại biểu mẫu/điểm để dùng dữ liệu mới.`,'success');}
 }
 async function action(fn){if(busy)return;busy=true;for(const id of ['amend-load','amend-check','amend-plan','amend-candidate','amend-old','amend-new','amend-room','amend-reason'])$(id).disabled=true;try{await fn();}catch(e){invalidate();notify(e.message,'error');}finally{busy=false;for(const id of ['amend-load','amend-check','amend-plan','amend-candidate','amend-old','amend-new','amend-room','amend-reason'])$(id).disabled=false;}}
 $('amend-load').onclick=()=>action(load);$('amend-check').onclick=()=>action(check);$('amend-apply').onclick=()=>action(apply);
 $('amend-plan').onchange=planChanged;$('amend-candidate').onchange=candidateChanged;
 for(const id of ['amend-old','amend-new','amend-room','amend-reason'])$(id).addEventListener('input',invalidate);
 $('amend-history').onclick=e=>{const id=e.target.closest('[data-amend-print]')?.dataset.amendPrint;if(!id)return;try{scope();const m=context.history.find(m=>m.id===id);const win=createPrintFrame();win.document.write(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Thông báo điều chỉnh môn</title><body><h2>Thông báo điều chỉnh môn thi</h2><p>${esc(state.exams.find(e=>e.id===context.examId)?.name||'')}</p>${describe(m.before_data)}<p>Mã điều chỉnh: ${esc(m.id)}<br>Lưu lúc: ${esc(new Date(m.changed_at).toLocaleString('vi-VN'))}</p><p>Thông báo riêng kèm bản niêm yết gốc. Không thay đổi SBD.</p></body></html>`);win.document.close();win.focus();win.print();}catch(e){notify(e.message,'error');}};
 return {invalidate};
}
