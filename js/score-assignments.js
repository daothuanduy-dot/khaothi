// v0.1.250 - scoped teacher score entry. Supabase RPC enforces authorization.
export function wireScoreAssignments({state,esc,message}){
 const $=id=>document.getElementById(id);
 const host=$('score-assignments-host');if(!host)return {refresh:async()=>{}};
 const admin=()=>state.role==='admin';let assignments=[],rows=[],workspace=null,busy=false;
 const notice=(s,type='info')=>message($('score-assignment-message'),s,type);
 const rpc=async(name,args={})=>{const {data,error}=await state.client.rpc(name,args);if(error)throw Error(error.message);return data};
 const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
 const subjects=[['TOAN','Toán'],['VAN','Ngữ văn'],['LY','Vật lý'],['HOA','Hóa học'],['SINH','Sinh học'],['SU','Lịch sử'],['DIA','Địa lý'],['GDKTPL','KTPL'],['TIN','Tin học'],['N1','Ngoại ngữ']];
 host.innerHTML=`<section class="panel"><h2>Phân công nhập điểm</h2><p>Giao đúng môn, khối, lớp hoặc phòng. Theo phách không hiển thị danh tính thí sinh.</p><div id="score-assignment-message" class="notice hidden" role="status"></div>
 <div id="score-assignment-admin"><div class="form-grid"><label>Kỳ thi<select id="sa-exam"></select></label><label>Giáo viên<select id="sa-teacher"></select></label><label>Môn thi<select id="sa-subject">${subjects.map(x=>option(...x)).join('')}</select></label><label>Khối<select id="sa-grade">${['10','11','12'].map(x=>option(x,'Khối '+x)).join('')}</select></label><label>Phạm vi<select id="sa-scope"><option value="class">Theo lớp / SBD</option><option value="room">Theo phòng / phách</option><option value="grade">Toàn khối (theo lớp)</option></select></label><label>Danh sách lớp hoặc phòng (cách nhau bằng dấu phẩy)<input id="sa-values" placeholder="11A1,11A2 hoặc Phòng01,Phòng02"></label></div><p>Với phạm vi toàn khối, không cần nhập danh sách. Với phòng thi, chỉ sử dụng khi môn đã đánh phách và khóa.</p><div class="form-actions"><button type="button" id="sa-save" class="btn btn-primary">Lưu phân công</button><button type="button" id="sa-disable" class="btn btn-light">Thu hồi phân công đang chọn</button></div></div>
 <h3>Danh sách phân công</h3><div id="sa-list" class="table-wrap"></div><h3>Nhập điểm theo phân công</h3><label>Chọn phân công<select id="sa-current"></select></label><div class="form-actions"><button type="button" id="sa-load" class="btn btn-primary">Tải bài thi</button><button type="button" id="sa-submit" class="btn btn-light" disabled>Lưu điểm đã thay đổi</button></div><p id="sa-progress" role="status"></p><div id="sa-rows" class="table-wrap"></div></section>`;
 async function run(fn){if(busy)return;busy=true;try{notice('Đang xử lý dữ liệu, vui lòng chờ...');await fn()}catch(e){notice(e.message||String(e),'error')}finally{busy=false}}
 async function refresh(){if(!state.client||!state.session)return;await run(async()=>{
  $('score-assignment-admin').hidden=!admin();
  if(admin()){
   const exams=state.exams||[];$('sa-exam').innerHTML=exams.map(e=>option(e.id,e.name||e.title||e.id)).join('');
   if(state.selectedExam&&exams.some(e=>e.id===state.selectedExam))$('sa-exam').value=state.selectedExam;
   const {data,error}=await state.client.from('exam_grader_profiles').select('user_id,full_name').limit(500);
   if(!error)$('sa-teacher').innerHTML=(data||[]).map(t=>option(t.user_id,t.full_name||t.user_id)).join('');
   else {const {data:users,error:e2}=await state.client.from('exam_profiles').select('user_id').limit(500);if(!e2)$('sa-teacher').innerHTML=(users||[]).map(t=>option(t.user_id,t.user_id)).join('');}
  }
  assignments=await rpc('exam_score_assignment_list',{});
  $('sa-list').innerHTML=`<table><thead><tr><th>Môn</th><th>Khối</th><th>Phạm vi</th><th>Danh sách</th><th>Trạng thái</th></tr></thead><tbody>${assignments.map(a=>`<tr><td>${esc(a.subject_code)}</td><td>${esc(a.grade_code)}</td><td>${esc(a.scope_type)}</td><td>${esc((a.scope_values||[]).join(', '))}</td><td>${a.is_active?'Đang giao':'Đã thu hồi'}</td></tr>`).join('')}</tbody></table>`;
  $('sa-current').innerHTML=assignments.filter(a=>a.is_active).map(a=>option(a.id,`${a.subject_code} · Khối ${a.grade_code} · ${a.scope_type} · ${(a.scope_values||[]).join(', ')}`)).join('');
  notice(`Đã tải ${assignments.length} phân công.`,'success');
 })}
 async function save(active){await run(async()=>{
  const vals=$('sa-values').value.split(',').map(s=>s.trim()).filter(Boolean);
  await rpc('exam_score_assignment_manage',{p_exam_id:$('sa-exam').value,p_teacher_id:$('sa-teacher').value,p_subject_code:$('sa-subject').value,p_grade_code:$('sa-grade').value,p_scope_type:$('sa-scope').value,p_scope_values:vals,p_active:active});
  notice(active?'Đã lưu phân công.':'Đã thu hồi phân công.','success');
 });await refresh()}
 async function load(){await run(async()=>{
  const id=$('sa-current').value;if(!id)throw Error('Chưa chọn phân công.');workspace=await rpc('exam_assigned_score_workspace',{p_assignment_id:id});rows=workspace.rows||[];
  const phach=workspace.scope_type==='room';
  $('sa-rows').innerHTML=`<table><thead><tr>${phach?'<th>Phòng</th><th>Mã phách</th>':'<th>SBD</th><th>Họ tên</th><th>Lớp</th>'}<th>Điểm tự luận</th></tr></thead><tbody>${rows.map((r,i)=>`<tr>${phach?`<td>${esc(r.room_code)}</td><td>${esc(r.phach_code)}</td>`:`<td>${esc(r.sbd)}</td><td>${esc(r.student_name)}</td><td>${esc(r.class_code)}</td>`}<td><input type="number" data-sa-score="${i}" min="0" max="${esc(workspace.maximum_score)}" step="any" value="${r.score??''}" style="width:110px"></td></tr>`).join('')}</tbody></table>`;
  $('sa-submit').disabled=!rows.length;
  $('sa-progress').textContent=`${rows.length} bài · ${rows.filter(r=>r.score!==null).length} đã có điểm · thang 0–${workspace.maximum_score}`;
  notice('Đã tải bài thi. Điểm chỉ được lưu khi nhấn Lưu điểm đã thay đổi.','success');
 })}
 async function submit(){await run(async()=>{
  if(!workspace)throw Error('Cần tải bài thi trước.');const items=[];
  for(const input of host.querySelectorAll('[data-sa-score]')){
   const r=rows[Number(input.dataset.saScore)],raw=input.value.trim();
   if(raw===''||String(r.score??'')===raw||r.score!==null&&Number(r.score)===Number(raw))continue;
   const n=Number(raw),step=Number(workspace.score_step||0);
   if(!Number.isFinite(n)||n<0||n>Number(workspace.maximum_score)||Math.round(n*1000)!==n*1000||(step>0&&Math.abs(n/step-Math.round(n/step))>1e-7))throw Error(`Điểm không hợp lệ tại dòng ${Number(input.dataset.saScore)+1}.`);
   items.push(workspace.scope_type==='room'?{record_id:r.record_id,score:n,previous_score:r.score==null?'':String(r.score)}:{candidate_id:r.candidate_id,score:n,version:r.version||0});
  }
  if(!items.length){notice('Không có điểm thay đổi.');return}
  if(!confirm(`Xác nhận lưu ${items.length} bài thi?`))return;
  const result=await rpc('exam_assigned_score_save',{p_assignment_id:workspace.assignment_id,p_items:items});
  workspace=null;rows=[];$('sa-submit').disabled=true;$('sa-progress').textContent='Đã lưu. Nhấn Tải bài thi để xem dữ liệu mới nhất.';notice(`Đã lưu ${result.saved} bài thi.`,'success');
 })}
 $('sa-save').onclick=()=>save(true);$('sa-disable').onclick=()=>{if(confirm('Thu hồi phân công này?'))save(false)};
 $('sa-load').onclick=load;$('sa-submit').onclick=submit;
 $('sa-scope').onchange=()=>{$('sa-values').disabled=$('sa-scope').value==='grade'};
 return {refresh};
}
