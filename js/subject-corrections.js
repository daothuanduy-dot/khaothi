export function wireSubjectAmendments({state,$,esc,message,subjectName,onChanged}){
 let context=null,preview=null,busy=false,sequence=0;
 const notify=(text,type='info')=>message($('amend-message'),text,type);
 const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
 const invalidate=()=>{preview=null;$('amend-apply').disabled=true;$('amend-preview-result').innerHTML='';};
 const scope=()=>{if(state.role!=='admin'||!context||context.examId!==state.selectedExam)throw new Error('Hãy tải lại danh sách đúng kỳ thi với quyền Admin.');};
 async function read(table,configure){
  const rows=[];
  for(let offset=0;;offset+=500){const {data,error}=await configure(state.client.from(table).select('*')).range(offset,offset+499);if(error)throw new Error(error.message);rows.push(...data);if(data.length<500)return rows;}
 }
 function candidateChanged(){
  invalidate();$('amend-old').innerHTML=option('','Chọn môn cũ')+(context?.registrations||[])
   .filter(r=>r.candidate_id===$('amend-candidate').value&&r.subject_type==='elective').map(r=>option(r.subject_code,subjectName(r.subject_code))).join('');
 }
 async function load(){
  invalidate();context=null;const request=++sequence,examId=state.selectedExam;
  if(!examId||state.role!=='admin')throw new Error('Chọn kỳ thi với quyền Admin.');
  if(state.exams.find(e=>e.id===examId)?.exam_mode!=='choice')throw new Error('Chức năng dành cho kỳ thi lựa chọn.');
  const [candidates,registrations,configs,history]=await Promise.all([
   read('exam_candidates',q=>q.eq('exam_id',examId).order('sbd').order('id')),
   read('exam_candidate_subjects',q=>q.eq('exam_id',examId).order('candidate_id').order('subject_code')),
   read('exam_subject_assessment_configs',q=>q.eq('exam_id',examId).order('subject_code')),
   read('exam_subject_corrections',q=>q.eq('exam_id',examId).order('changed_at',{ascending:false}).order('id'))]);
  if(request!==sequence||examId!==state.selectedExam)return;
  context={examId,registrations};
  $('amend-candidate').innerHTML=option('','Chọn học sinh')+candidates.filter(c=>c.sbd).map(c=>option(c.id,`${c.sbd} — ${c.student_name} — ${c.class_code}`)).join('');
  $('amend-new').innerHTML=option('','Chọn môn mới')+configs.filter(c=>(c.score_mode||(c.is_essay?'combined':'mcq'))==='mcq'&&Number(c.mcq_maximum_score)>0).map(c=>option(c.subject_code,subjectName(c.subject_code))).join('');
  candidateChanged();
  $('amend-history').innerHTML=history.length?`<table><thead><tr><th>SBD</th><th>Đính chính</th><th>Lý do</th><th>Thời gian</th></tr></thead><tbody>${history.map(h=>`<tr><td>${esc(h.sbd)}</td><td>${esc(subjectName(h.old_subject))} → ${esc(subjectName(h.new_subject))}</td><td>${esc(h.reason)}</td><td>${esc(new Date(h.changed_at).toLocaleString('vi-VN'))}</td></tr>`).join('')}</tbody></table>`:'Chưa có đính chính.';
  notify('Đã tải đăng ký hiện tại. Không thay đổi phân phòng.');
 }
 async function rpc(apply,expected=null){
  const {data,error}=await state.client.rpc('exam_correct_mcq_subject',{
   p_exam_id:context.examId,p_candidate_id:$('amend-candidate').value,p_old_subject:$('amend-old').value,
   p_new_subject:$('amend-new').value,p_reason:$('amend-reason').value.trim(),p_apply:apply,p_expected:expected
  });if(error)throw new Error(error.message);return data;
 }
 async function check(){
  invalidate();scope();const examId=context.examId,v=await rpc(false);if(examId!==state.selectedExam)return;preview=v;
  $('amend-preview-result').innerHTML=`<p><strong>${esc(v.student_name)} — ${esc(v.class_code)} — SBD ${esc(v.sbd)}</strong></p><p>${esc(subjectName(v.old_subject))} → ${esc(subjectName(v.new_subject))}</p><p>Giữ nguyên SBD, phòng, ca thi, môn còn lại và điểm.</p><p>${esc(v.reason)}</p>`+
   (v.old_score_count||v.new_score_count?`<p>Đã có ${Number(v.old_score_count)} bản ghi điểm môn cũ và ${Number(v.new_score_count)} bản ghi điểm môn mới. Không chuyển hoặc xóa điểm. Môn cũ không còn thuộc kết quả dự thi hiện tại; điểm môn mới có sẵn được ghép theo quy tắc hiện hành.</p>`:'<p>Chưa có điểm ở hai môn. Nhập điểm môn mới bằng SBD hiện tại.</p>');
  $('amend-apply').disabled=false;notify('Chưa lưu. Kiểm tra thông tin và điểm liên quan trước khi xác nhận.');
 }
 async function apply(){
  scope();if(!preview)throw new Error('Cần xem trước lại.');const v=preview;invalidate();await rpc(true,v);
  try{await onChanged?.();if(state.selectedExam===v.exam_id){await load();notify(`Đã lưu đính chính SBD ${v.sbd}. Giữ nguyên phân phòng và điểm; tải lại kết quả/thống kê.`,'success');}}
  catch(error){notify(`Đã lưu thành công nhưng chưa tải lại được: ${error.message}. Hãy tải lại trang.`,'error');}
 }
 async function action(fn){
  if(busy)return;busy=true;const ids=['amend-load','amend-candidate','amend-old','amend-new','amend-reason','amend-check','amend-apply'];
  for(const id of ids)$(id).disabled=true;
  try{await fn();}catch(error){invalidate();notify(error.message,'error');}
  finally{busy=false;for(const id of ids)$(id).disabled=false;$('amend-apply').disabled=!preview;}
 }
 $('amend-load').onclick=()=>action(load);$('amend-check').onclick=()=>action(check);$('amend-apply').onclick=()=>action(apply);
 $('amend-candidate').onchange=candidateChanged;
 for(const id of ['amend-old','amend-new','amend-reason'])$(id).addEventListener('input',invalidate);
 return {invalidate};
}
