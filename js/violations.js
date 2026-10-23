export function penaltyValue(type,value){
  if(type==='zero')return 100;
  const text=String(value??'').trim().replace(',','.');
  if(type!=='percent'||!/^\d+(?:\.\d{1,2})?$/.test(text)||Number(text)>100)throw new Error('Nhập mức trừ từ 0 đến 100%, tối đa hai chữ số thập phân.');
  return Number(text);
}
export function wireViolations({state,$,esc,message,subjectName=code=>code,createStudentPicker}){
  let examId='',candidates=[],decisions=[],candidateId='',subject='',dirty=false,busy=false;
  let studentPicker=null;
  const notify=(text,type='info')=>message($('violation-message'),text,type);
  const current=()=>decisions.find(row=>row.candidate_id===candidateId&&row.subject_code===subject&&row.round_no===candidates.find(c=>c.id===candidateId)?.round_no);
  const discard=()=>!dirty||confirm('Có thông tin vi phạm chưa lưu. Bỏ thay đổi này?');
  async function rpc(name,args){
    if(state.role!=='admin'||!state.client)throw new Error('Chỉ Admin được cập nhật vi phạm.');
    const {data,error}=await state.client.rpc(name,args);if(error){if(error.code==='PGRST202')throw new Error('Cần chạy migration 137 để dùng chức năng vi phạm quy chế.');throw new Error(error.message)}return data;
  }
  const matches=c=>(!$('violation-class').value||c.class_code===$('violation-class').value)
    &&($('violation-round').value===''||String(c.round_no)===$('violation-round').value);
  function render(){
    const selected=candidates.find(row=>row.id===candidateId),visible=candidates.filter(matches);
    if(selected&&!visible.some(row=>row.id===selected.id))visible.push(selected);
    $('violation-candidate').innerHTML='<option value="">-- Chọn học sinh --</option>'+visible.map(c=>`<option value="${esc(c.id)}">${esc([c.class_code,c.sbd||c.student_code,c.student_name].filter(Boolean).join(' · '))}</option>`).join('');
    $('violation-candidate').value=candidateId;
    studentPicker?.setItems(visible,candidateId);
    $('violation-save').disabled=busy||!examId||examId!==$('absence-exam').value||!candidateId||!subject;
    $('violation-percent').disabled=busy||$('violation-type').value==='zero';
    $('violation-scope').textContent=selected?`${selected.student_name} · ${selected.class_code} · ${selected.round_no?`Đợt ${selected.round_no}`:'Chưa phân đợt'} · ${subjectName(subject)||'Chọn môn'}${dirty?' · Chưa lưu':''}`:'Chọn học sinh và môn trong kỳ thi ở đầu trang.';
    const rows=decisions.filter(row=>{
      const c=candidates.find(c=>c.id===row.candidate_id);
      return c&&(!candidateId||c.id===candidateId)&&(!$('violation-class').value||c.class_code===$('violation-class').value)
        &&($('violation-round').value===''||String(row.round_no)===$('violation-round').value);
    });
    $('violation-count').textContent=`${rows.length}/${decisions.length} vi phạm đã lưu`;
    $('violation-list').innerHTML=rows.map(row=>{
      const c=candidates.find(c=>c.id===row.candidate_id);
      return `<tr><td>${esc(c.student_name)}<br><small>${esc(c.sbd||c.student_code||'')}</small></td><td>${esc(c.class_code)}</td><td>${row.round_no||'Chưa phân'}</td><td>${esc(subjectName(row.subject_code))}</td><td>${row.penalty_type==='zero'?'Điểm 0':`Trừ ${esc(row.deduction_percent)}%`}</td><td>${esc(row.note)}</td><td><button type="button" data-violation-edit="${esc(row.id)}">Sửa</button> <button type="button" data-violation-delete="${esc(row.id)}">Xóa</button></td></tr>`;
    }).join('')||'<tr><td colspan="7">Không có vi phạm theo bộ lọc.</td></tr>';
  }
  function fillForm(){
    const c=candidates.find(row=>row.id===candidateId),row=current();
    $('violation-subject').innerHTML='<option value="">-- Chọn môn --</option>'+(c?.subjects||[]).map(code=>`<option value="${esc(code)}">${esc(subjectName(code))}</option>`).join('');$('violation-subject').value=subject;
    $('violation-type').value=row?.penalty_type||'percent';$('violation-percent').value=row?.deduction_percent??'';$('violation-note').value=row?.note||'';dirty=false;render();
  }
  async function load(id){
    if(!id){examId='';candidates=[];decisions=[];candidateId='';subject='';fillForm();return}
    const data=await rpc('exam_get_violation_context',{p_exam_id:id});
    examId=id;candidates=data.candidates;decisions=data.decisions;candidateId='';subject='';
    const selectedClass=$('violation-class').value;
    const classes=[...new Set(candidates.map(row=>row.class_code).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    $('violation-class').innerHTML='<option value="">Tất cả lớp</option>'+classes.map(code=>`<option value="${esc(code)}">${esc(code)}</option>`).join('');$('violation-class').value=classes.includes(selectedClass)?selectedClass:'';
    fillForm();
  }
  async function run(fn){if(busy)return;busy=true;const controls=[...$('violation-panel').querySelectorAll('input,select,textarea,button'),$('absence-exam')],previous=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
    try{await fn()}catch(error){notify(error.message||String(error),'error')}finally{busy=false;controls.forEach((c,i)=>c.disabled=previous[i]);render()}}
  $('violation-load').onclick=()=>run(async()=>{if(discard()){await load($('absence-exam').value);notify('Đã tải vi phạm đã lưu.','success')}});
  $('violation-class').onchange=render;$('violation-round').onchange=render;
  $('violation-candidate').onchange=()=>{const id=$('violation-candidate').value;if(!discard()){$('violation-candidate').value=candidateId;return}candidateId=id;subject='';fillForm()};
  $('violation-subject').onchange=()=>{const code=$('violation-subject').value;if(!discard()){$('violation-subject').value=subject;return}subject=code;fillForm()};
  if(createStudentPicker)studentPicker=createStudentPicker({root:$('violation-student-picker'),input:$('violation-student-input'),list:$('violation-student-options'),toggle:$('violation-student-toggle'),esc,emptyLabel:'-- Chọn học sinh --',onSelect:id=>{
    $('violation-candidate').value=id;$('violation-candidate').onchange();return candidateId===id;
  }});
  for(const id of ['violation-type','violation-percent','violation-note'])$(id).oninput=()=>{dirty=true;if($('violation-type').value==='zero')$('violation-percent').value='100';render()};
  $('violation-clear').onclick=()=>{if(discard())fillForm()};
  $('violation-save').onclick=()=>run(async()=>{
    if(examId!==$('absence-exam').value)throw new Error('Kỳ thi đã đổi. Hãy tải lại danh sách trước khi lưu.');
    const c=candidates.find(row=>row.id===candidateId);if(!c||!subject)throw new Error('Chọn học sinh và môn.');
    const row=await rpc('exam_save_violation',{p_exam_id:examId,p_candidate_id:c.id,p_round_no:c.round_no,p_subject_code:subject,
      p_penalty_type:$('violation-type').value,p_deduction_percent:penaltyValue($('violation-type').value,$('violation-percent').value),p_note:$('violation-note').value.trim(),p_expected_version:current()?.version??null,p_delete:false});
    decisions=decisions.filter(item=>item.id!==row.id);decisions.push(row);dirty=false;
    const penalty=row.penalty_type==='zero'?'Cho điểm 0 (trừ 100%)':`Trừ ${row.deduction_percent}% số điểm`;
    window.alert(`Đã lưu vi phạm quy chế thành công.\n\nHọc sinh: ${c.student_name}\nLớp: ${c.class_code}\nSBD / mã học sinh: ${c.sbd||c.student_code||''}\nMôn vi phạm: ${subjectName(row.subject_code)}\nMức xử lý: ${penalty}\n\nĐiểm gốc được giữ nguyên.`);
    candidateId='';subject='';
    $('violation-class').value='';$('violation-round').value='';
    studentPicker?.close();fillForm();
    $('violation-student-input').value='';
    notify('Đã lưu vi phạm. Chọn học sinh và môn để nhập trường hợp tiếp theo.','success');
  });
  $('violation-list').onclick=event=>{
    if(busy)return;const edit=event.target.closest('[data-violation-edit]'),remove=event.target.closest('[data-violation-delete]');
    if(edit){const row=decisions.find(row=>row.id===edit.dataset.violationEdit);if(!row||!discard())return;
      const c=candidates.find(c=>c.id===row.candidate_id);if(c?.round_no!==row.round_no||!c.subjects.includes(row.subject_code)){notify('Học sinh đã đổi đợt hoặc môn. Có thể xóa quyết định cũ, rồi tạo lại đúng phạm vi.','error');return}
      candidateId=row.candidate_id;subject=row.subject_code;fillForm();
    }
    if(remove)return run(async()=>{
      if(examId!==$('absence-exam').value)throw new Error('Kỳ thi đã đổi. Hãy tải lại trước khi xóa.');
      const row=decisions.find(row=>row.id===remove.dataset.violationDelete);if(!row||!discard()||!confirm('Xóa quyết định vi phạm này? Điểm gốc được giữ nguyên; thao tác có nhật ký.'))return;
      await rpc('exam_save_violation',{p_exam_id:examId,p_candidate_id:row.candidate_id,p_round_no:row.round_no,p_subject_code:row.subject_code,p_penalty_type:row.penalty_type,p_deduction_percent:row.deduction_percent,p_note:row.note,p_expected_version:row.version,p_delete:true});
      decisions=decisions.filter(item=>item.id!==row.id);fillForm();notify('Đã xóa vi phạm và giữ nhật ký.','success');
    });
  };
  $('absence-exam').addEventListener('change',event=>{
    if(busy||!discard()){$('absence-exam').value=examId;event.stopImmediatePropagation();return}
    const id=$('absence-exam').value;run(()=>load(id));
  },true);
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue=''}});
  return {refresh:()=>{
    if(busy||examId===$('absence-exam').value)return Promise.resolve();
    if(!discard())return Promise.resolve();
    return run(()=>load($('absence-exam').value));
  }};
}
