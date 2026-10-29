const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function absentScoreTotal(row,mcq,essay){
 const parse=value=>value==null||String(value).trim()===''?null:Number(String(value).replace(',','.'));
 const m=parse(mcq),e=parse(essay),needsM=['mcq','combined'].includes(row.score_mode),needsE=['essay','combined'].includes(row.score_mode);
 if(!['mcq','essay','combined'].includes(row.score_mode))throw new Error('Chưa cấu hình hình thức tính điểm.');
 for(const [required,value,max,step,label] of [[needsM,m,Number(row.mcq_max),0.001,'Trắc nghiệm'],[needsE,e,Number(row.essay_max),Number(row.essay_step),'Tự luận']]){
  if(!required){if(value!==null)throw new Error(label+': môn này không có thành phần này.');continue}
  if(value===null||!Number.isFinite(value)||!Number.isFinite(max)||max<=0||value<0||value>max||!Number.isFinite(step)||step<=0||Math.abs(value/step-Math.round(value/step))>1e-7)throw new Error(label+': kiểm tra điểm, thang và bước điểm.');
 }
 if(needsE&&(!Number.isInteger(Number(row.decimal_places))||Math.abs(e-Number(e.toFixed(Number(row.decimal_places))))>1e-8))throw new Error('Tự luận: quá số chữ số lẻ cấu hình.');
 const total=(m??0)+(e??0);if(total>10+1e-8)throw new Error('Tổng bài thi không vượt quá 10.');
 return {mcq_score:m,essay_score:e,total_score:Math.round(total*1000)/1000};
}

export async function openAbsentScores({state,examId='',subjectName=code=>code}){
 document.getElementById('absent-score-dialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='absent-score-dialog';dialog.style.cssText='width:min(1200px,96vw);max-height:94vh;overflow:auto;padding:20px';
 dialog.innerHTML=`<h2>Nhập điểm học sinh vắng</h2><p>Giáo viên đúng môn/lớp nhập theo cấu hình bài thi. Giữ trạng thái vắng; điểm này không tính thống kê hoặc xếp SBD kỳ sau.</p><div data-message role="status"></div><label>Kỳ thi<select data-exam></select></label><section data-config hidden><h3>Bật cho kỳ thi và chọn phân công giảng dạy</h3><label>Năm học / học kỳ<select data-period></select></label><label><input type="checkbox" data-enabled> Cho phép nhập điểm học sinh vắng</label><button type="button" data-save-config>Lưu cấu hình</button><p>Phải cấu hình thành phần điểm từng môn và phân công giáo viên đúng lớp, đúng môn. Quản trị chỉ nhập khi đồng thời là giáo viên được phân công.</p></section><div class="form-actions"><button type="button" data-load>Tải lại</button><button type="button" data-close>Đóng</button></div><div data-rows></div><section data-history></section>`;
 document.body.append(dialog);dialog.showModal();const $=s=>dialog.querySelector(s);
 let rows=[],busy=false,dirty=false,current='';
 const notice=(text,error=false)=>{$('[data-message]').textContent=text;$('[data-message]').style.color=error?'#b91c1c':'#166534'};
 const rpc=async(name,args={})=>{const {data,error}=await state.client.rpc(name,args);if(error)throw new Error(error.message+(error.code==='PGRST202'?' — Cần cài SQL 191.':''));return data};
 const run=async fn=>{if(busy)return;busy=true;const controls=[...dialog.querySelectorAll('button,input,select')],disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);try{await fn()}catch(e){notice(e.message,true)}finally{busy=false;controls.forEach((c,i)=>{if(c.isConnected)c.disabled=disabled[i]})}};
 const discard=()=>!dirty||window.confirm('Có điểm chưa lưu. Bỏ các thay đổi để tải/đóng?');
 async function load(){
  current=$('[data-exam]').value;rows=[];$('[data-history]').innerHTML='';if(!current){$('[data-config]').hidden=true;$('[data-rows]').textContent='Chưa có kỳ thi được bật và phân công cho tài khoản này.';return}
  const data=await rpc('exam_absent_score_workspace',{p_exam:current});rows=data.rows||[];
  $('[data-config]').hidden=!data.admin;
  $('[data-period]').innerHTML=(data.periods||[]).map(p=>`<option value="${esc(p.id)}">${esc(p.school_year)} · Học kỳ ${p.semester}</option>`).join('');
  if(data.settings?.period_id)$('[data-period]').value=data.settings.period_id;
  $('[data-enabled]').checked=data.settings?.enabled===true;
  $('[data-rows]').innerHTML=`<p>${rows.length} học sinh/môn vắng có cấu hình điểm trong phạm vi của bạn. ${data.settings?.enabled?'Đã bật nhập điểm.':'Chưa bật nhập điểm.'}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th>SBD / Mã HS</th><th>Họ tên / lớp</th><th>Môn</th><th>Trắc nghiệm</th><th>Tự luận</th><th>Tổng</th><th>Lưu / trạng thái</th></tr></thead><tbody>${rows.map((r,i)=>{
   const input=(kind,needed,max,step,value)=>needed?`<input data-${kind} type="number" min="0" max="${esc(max)}" step="${esc(step)}" value="${esc(value)}" ${r.can_edit?'':'disabled'} style="width:95px"><small> / ${esc(max)}</small>`:'—';
   let total='—';try{total=absentScoreTotal(r,r.mcq_score,r.essay_score).total_score}catch{}
   return `<tr data-row="${i}"><td>${esc(r.sbd)}<br>${esc(r.student_code)}</td><td>${esc(r.student_name)}<br>${esc(r.class_code)}</td><td>${esc(subjectName(r.subject_code))}</td><td>${input('mcq',['mcq','combined'].includes(r.score_mode),r.mcq_max,0.001,r.mcq_score)}</td><td>${input('essay',['essay','combined'].includes(r.score_mode),r.essay_max,r.essay_step,r.essay_score)}</td><td data-total>${total}</td><td><button type="button" data-save="${i}" ${r.can_edit?'':'disabled'}>Lưu</button><button type="button" data-history-row="${i}">Lịch sử</button><span data-status>${r.version?'Đã lưu · '+esc(r.updated_at):r.can_edit?'Chưa nhập':'Chưa được phân công nhập'}</span></td></tr>`;
  }).join('')}</tbody></table>`;dirty=false;notice('Điểm lưu riêng cho học sinh vắng; không sửa điểm bài thi theo phách.');
 }
 dialog.addEventListener('input',event=>{const tr=event.target.closest('[data-row]');if(!tr)return;dirty=true;tr.dataset.dirty='1';try{const score=absentScoreTotal(rows[Number(tr.dataset.row)],tr.querySelector('[data-mcq]')?.value,tr.querySelector('[data-essay]')?.value);tr.querySelector('[data-total]').textContent=score.total_score;tr.querySelector('[data-status]').textContent='Chưa lưu'}catch(e){tr.querySelector('[data-total]').textContent='—';tr.querySelector('[data-status]').textContent=e.message}});
 $('[data-exam]').onchange=()=>{if(!discard()){$('[data-exam]').value=current;return}run(load)};
 $('[data-load]').onclick=()=>{if(discard())run(load)};
 $('[data-save-config]').onclick=()=>run(async()=>{if(!discard())return;const period=$('[data-period]').value;if(!period)throw new Error('Chưa có học kỳ phân công phù hợp năm học.');await rpc('exam_configure_absent_scores',{p_exam:current,p_period:period,p_enabled:$('[data-enabled]').checked});await load()});
 dialog.addEventListener('click',event=>{const button=event.target.closest('[data-history-row]');if(!button)return;const r=rows[Number(button.dataset.historyRow)];run(async()=>{const history=await rpc('exam_absent_score_history',{p_exam:current,p_candidate:r.candidate_id,p_subject:r.subject_code});$('[data-history]').innerHTML='<h3>Lịch sử: '+esc(r.student_name)+' / '+esc(subjectName(r.subject_code))+'</h3>'+history.map(a=>'<p>'+esc(a.changed_at)+' · '+esc(a.changed_by)+' · TN: '+esc(a.old_value?.mcq_score)+' → '+esc(a.new_value.mcq_score)+' · TL: '+esc(a.old_value?.essay_score)+' → '+esc(a.new_value.essay_score)+'</p>').join('')})});
 dialog.addEventListener('click',event=>{const b=event.target.closest('[data-save]');if(!b)return;const i=Number(b.dataset.save),r=rows[i],tr=b.closest('[data-row]');run(async()=>{
  const score=absentScoreTotal(r,tr.querySelector('[data-mcq]')?.value,tr.querySelector('[data-essay]')?.value);
  const saved=await rpc('exam_save_absent_score',{p_exam:current,p_candidate:r.candidate_id,p_subject:r.subject_code,p_mcq:score.mcq_score,p_essay:score.essay_score,p_version:r.version});
  Object.assign(r,saved);delete tr.dataset.dirty;dirty=!!dialog.querySelector('[data-dirty]');tr.querySelector('[data-status]').textContent='Đã lưu';tr.querySelector('[data-total]').textContent=score.total_score;notice('Đã lưu điểm học sinh vắng. Quản trị tải lại Tổng hợp điểm để xem kết quả.');
 })});
 $('[data-close]').onclick=()=>{if(!busy&&discard()){dialog.close();dialog.remove()}};dialog.addEventListener('cancel',event=>{if(busy||!discard())event.preventDefault()});
 await run(async()=>{const exams=await rpc('exam_absent_score_exams');$('[data-exam]').innerHTML=exams.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.school_year)})</option>`).join('');if(exams.some(e=>e.id===examId))$('[data-exam]').value=examId;await load()});
}
