// v0.1.250 - scoped teacher score entry. Supabase RPC enforces authorization.
export function wireScoreAssignments({state,esc,message}){
 const $=id=>document.getElementById(id);
 const host=$('score-assignments-host'),teacherHost=$('grader-assigned-host');if(!host||!teacherHost)return {refresh:async()=>{},refreshTeacher:async()=>{}};
 const admin=()=>state.role==='admin';let assignments=[],rows=[],workspace=null,busy=false,teacherProfiles=[],teachingRows=[],availableClasses=[],availableRooms=[],teacherLoadError="";
 const notice=(s,type='info')=>message($('score-assignment-message'),s,type);
 const rpc=async(name,args={})=>{const {data,error}=await state.client.rpc(name,args);if(error)throw Error(error.message);return data};
 const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
 const subjects=[['TOAN','Toán'],['VAN','Ngữ văn'],['LY','Vật lý'],['HOA','Hóa học'],['SINH','Sinh học'],['SU','Lịch sử'],['DIA','Địa lý'],['GDKTPL','KTPL'],['TIN','Tin học'],['N1','Ngoại ngữ']];
 host.innerHTML=`<section class="panel"><h2>Phân công nhập điểm</h2><p>Giao đúng môn, khối, lớp hoặc phòng. Theo phách không hiển thị danh tính thí sinh.</p><div id="score-assignment-message" class="notice hidden" role="status"></div>
 <div id="score-assignment-admin"><div class="form-grid"><label>Kỳ thi<select id="sa-exam"></select></label><label>Môn thi<select id="sa-subject">${subjects.map(x=>option(...x)).join('')}</select></label><label>Giáo viên<select id="sa-teacher"></select></label><label>Khối<select id="sa-grade">${['10','11','12'].map(x=>option(x,'Khối '+x)).join('')}</select></label><label>Phạm vi<select id="sa-scope"><option value="class">Theo lớp / SBD</option><option value="room">Theo phòng / phách</option><option value="grade">Toàn khối (theo lớp)</option></select></label><div class="sa-picker"><strong id="sa-picker-label">Chọn lớp được phân công</strong><div id="sa-picker-status" class="muted" role="status"></div><div id="sa-checks" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:8px;padding:12px 0"></div></div></div><p>Với phạm vi toàn khối, không cần nhập danh sách. Với phòng thi, chỉ sử dụng khi môn đã đánh phách và khóa.</p><div class="form-actions"><button type="button" id="sa-save" class="btn btn-primary">Lưu phân công</button><button type="button" id="sa-disable" class="btn btn-light">Thu hồi phân công đang chọn</button></div></div>
 <h3>Danh sách phân công</h3><p class="muted">Quản trị viên chỉ giao nhiệm vụ và theo dõi; nhập điểm được thực hiện tại cổng giáo viên.</p><div id="sa-list" class="table-wrap"></div></section>`;

 teacherHost.innerHTML=`<section class="panel" id="sa-teacher-workspace"><h2>Danh sách bài thi được phân công</h2><p>Chỉ hiển thị nhiệm vụ của tài khoản đang đăng nhập. Theo phách không hiển thị tên hoặc SBD.</p><div id="sa-teacher-message" class="notice notice-info" role="status" aria-live="polite">Nhấn Tải phân công để kiểm tra nhiệm vụ được giao.</div><div class="form-grid"><label>Phân công của tôi<select id="sa-current"><option value="">-- Chưa tải phân công --</option></select></label></div><div class="form-actions"><button type="button" id="sa-teacher-refresh" class="btn btn-light">Tải lại phân công</button><button type="button" id="sa-load" class="btn btn-primary">Tải bài thi</button><button type="button" id="sa-submit" class="btn btn-primary" disabled>Lưu điểm đã thay đổi</button></div><p id="sa-progress" role="status"></p><div id="sa-rows" class="table-wrap"></div></section>`;
 const teacherNotice=(s,type='info')=>{const el=$('sa-teacher-message');el.textContent=s;el.className='notice notice-'+(type==='error'?'error':type==='success'?'success':'info')};
 async function run(fn){if(busy)return;busy=true;try{if(state.role!=='admin')teacherNotice('Đang xử lý, vui lòng chờ...');else notice('Đang xử lý dữ liệu, vui lòng chờ...');await fn()}catch(e){if(state.role!=='admin')teacherNotice(e.message||String(e),'error');else notice(e.message||String(e),'error')}finally{busy=false}}
 async function loadTeacherProfiles(){
  const {data,error}=await state.client.from('exam_user_profiles').select('user_id,full_name,email,report_name').limit(1000);
  if(error)throw Error('Không tải được tên giáo viên: '+error.message);
  teacherProfiles=data||[];
 }
 async function loadTeachingAssignments(){
  const {data,error}=await state.client.from('school_teaching_assignments').select('teacher_user_id,subject_code,period_id,class_code').limit(5000);
  if(error){teacherLoadError=error.message;teachingRows=[];return;}
  const {data:periods,error:pe}=await state.client.from('school_teaching_periods').select('id,school_year').limit(200);
  if(pe){teacherLoadError=pe.message;teachingRows=[];return;}
  const years=new Map((periods||[]).map(p=>[p.id,p.school_year]));
  teachingRows=(data||[]).map(t=>({...t,school_year:years.get(t.period_id)}));teacherLoadError='';
 }
 function renderTeachers(){
  const exam=(state.exams||[]).find(e=>e.id===$('sa-exam').value);
  const year=String(exam?.school_year||'').replace(/[–—/]/g,'-').replace(/\s/g,'');
  const subject=$('sa-subject').value;
  const ids=new Set(teachingRows.filter(t=>t.subject_code===subject&&String(t.school_year||'').replace(/[–—/]/g,'-')===year).map(t=>t.teacher_user_id));
  const previous=$('sa-teacher').value;
  const matching=teacherProfiles.filter(t=>ids.has(t.user_id)).sort((a,b)=>(a.full_name||a.email||'').localeCompare(b.full_name||b.email||'','vi'));
  $('sa-teacher').innerHTML='<option value="">-- Chọn giáo viên --</option>'+matching.map(t=>option(t.user_id,[t.full_name||t.email||'Chưa có tên',t.report_name?`(${t.report_name})`:''].filter(Boolean).join(' '))).join('');
  if(matching.some(t=>t.user_id===previous))$('sa-teacher').value=previous;
  if(teacherLoadError)$('sa-picker-status').textContent='Không tải được phân công giảng dạy: '+teacherLoadError;
  else if(!matching.length)$('sa-picker-status').textContent='Chưa có giáo viên được phân công giảng dạy môn này trong năm học của kỳ thi. Hãy cấu hình tại Phân công giảng dạy.';
 }
 function renderChecks(){
  const scope=$('sa-scope').value, items=scope==='room'?availableRooms:availableClasses;
  $('sa-picker-label').textContent=scope==='room'?'Chọn phòng thi':scope==='class'?'Chọn lớp trong khối':'Toàn bộ khối';
  const node=$('sa-checks');node.innerHTML='';
  if(scope==='grade'){$('sa-picker-status').textContent='Toàn khối: không cần chọn lớp hoặc phòng.';return;}
  if(!items.length){$('sa-picker-status').textContent=scope==='room'?'Chưa có phòng thi đã khóa cho môn/khối này.':'Không có lớp thuộc môn/khối đã chọn.';return;}
  $('sa-picker-status').textContent=`Có ${items.length} ${scope==='room'?'phòng':'lớp'}; tích chọn để phân công.`;
  for(const code of items){const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:7px';const input=document.createElement('input');input.type='checkbox';input.value=code;label.append(input,document.createTextNode(code));node.append(label)}
 }
 async function refreshPickers(){
  const examId=$('sa-exam').value,subject=$('sa-subject').value,grade=$('sa-grade').value;
  renderTeachers();availableClasses=[];availableRooms=[];
  if(!examId){renderChecks();return;}
  const exam=(state.exams||[]).find(e=>e.id===examId);
  const table=exam?.exam_mode==='subject'?'exam_round_subjects':'exam_subject_class_configs';
  if(table==='exam_subject_class_configs'){
   const {data,error}=await state.client.from(table).select('class_code').eq('exam_id',examId).eq('subject_code',subject).limit(1000);
   if(error)throw Error('Không tải được lớp: '+error.message);
   availableClasses=[...new Set((data||[]).map(x=>x.class_code).filter(x=>x&&x.startsWith(grade)))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  }else{
   const {data,error}=await state.client.from('exam_candidates').select('class_code').eq('exam_id',examId).limit(5000);
   if(error)throw Error('Không tải được lớp: '+error.message);
   availableClasses=[...new Set((data||[]).map(x=>x.class_code).filter(x=>x&&x.startsWith(grade)))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  }
  const {data:runs,error:re}=await state.client.from('exam_script_runs').select('id').eq('exam_id',examId).eq('subject_code',subject).eq('status','locked').order('locked_at',{ascending:false}).limit(1);
  if(!re&&runs?.length){const {data:records,error:rr}=await state.client.from('exam_script_records').select('room_code').eq('run_id',runs[0].id).limit(5000);
   if(!rr)availableRooms=[...new Set((records||[]).map(r=>r.room_code).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));}
  renderChecks();
 }
 async function refresh(){if(!state.client||!state.session)return;await run(async()=>{
  if(!admin())return;
  $('score-assignment-admin').hidden=false;
  if(admin()){
   const exams=state.exams||[];$('sa-exam').innerHTML=exams.map(e=>option(e.id,e.name||e.title||e.id)).join('');
   if(state.selectedExam&&exams.some(e=>e.id===state.selectedExam))$('sa-exam').value=state.selectedExam;
   await loadTeacherProfiles();
   await loadTeachingAssignments();
   await refreshPickers();
  }
  assignments=await rpc('exam_score_assignment_list',{});
  const profileMap=new Map(teacherProfiles.map(p=>[p.user_id,p]));
  $('sa-list').innerHTML=`<table><thead><tr><th>Giáo viên</th><th>Kỳ thi</th><th>Môn</th><th>Khối</th><th>Phạm vi</th><th>Danh sách</th><th>Trạng thái</th></tr></thead><tbody>${assignments.map(a=>`<tr><td>${esc(profileMap.get(a.teacher_id)?.full_name||profileMap.get(a.teacher_id)?.email||a.teacher_id)}</td><td>${esc((state.exams||[]).find(e=>e.id===a.exam_id)?.name||a.exam_id)}</td><td>${esc(a.subject_code)}</td><td>${esc(a.grade_code)}</td><td>${esc(a.scope_type)}</td><td>${esc((a.scope_values||[]).join(', '))}</td><td>${a.is_active?'Đang giao':'Đã thu hồi'}</td></tr>`).join('')}</tbody></table>`;
  notice(`Đã tải ${assignments.length} phân công.`,'success');
 })}
 async function refreshTeacher(){
  if(!state.client||!state.session||!['grader','teacher'].includes(state.role))return;
  teacherNotice('Đang tải phân công từ Supabase...');
  $('sa-current').innerHTML='<option value="">-- Đang tải --</option>';
  $('sa-rows').innerHTML='';$('sa-submit').disabled=true;workspace=null;rows=[];
  try{
   const all=await rpc('exam_score_assignment_list',{});
   assignments=(Array.isArray(all)?all:[]).filter(a=>a.is_active&&a.teacher_id===state.session.user.id);
   $('sa-current').innerHTML='<option value="">-- Chọn nhiệm vụ --</option>'+assignments.map(a=>option(a.id,`${a.subject_code} · Khối ${a.grade_code} · ${a.scope_type==='room'?'Theo phách':a.scope_type==='grade'?'Toàn khối':'Theo lớp'} · ${(a.scope_values||[]).join(', ')}`)).join('');
   teacherNotice(assignments.length?`Đã nhận ${assignments.length} phân công. Chọn nhiệm vụ và nhấn Tải bài thi.`:'Tài khoản này chưa có phân công nhập điểm đang hoạt động. Hãy liên hệ quản trị viên để kiểm tra đúng tài khoản và môn thi.',assignments.length?'success':'info');
  }catch(e){teacherNotice('Không tải được phân công: '+(e.message||e),'error');}
 }
 async function save(active){await run(async()=>{
  const vals=[...$('sa-checks').querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value);
  if($('sa-scope').value!=='grade'&&!vals.length)throw Error('Hãy chọn ít nhất một lớp hoặc phòng.');
  if(!$('sa-teacher').value)throw Error('Chưa có giáo viên phù hợp với môn đã chọn.');
  await rpc('exam_score_assignment_manage',{p_exam_id:$('sa-exam').value,p_teacher_id:$('sa-teacher').value,p_subject_code:$('sa-subject').value,p_grade_code:$('sa-grade').value,p_scope_type:$('sa-scope').value,p_scope_values:vals,p_active:active});
  notice(active?'Đã lưu phân công.':'Đã thu hồi phân công.','success');
 });await refresh()}
 async function load(){await run(async()=>{
  const id=$('sa-current').value;if(!id)throw Error('Chưa chọn phân công.');workspace=await rpc('exam_assigned_score_workspace',{p_assignment_id:id});rows=workspace.rows||[];
  const phach=workspace.scope_type==='room';
  $('sa-rows').innerHTML=`<table><thead><tr>${phach?'<th>Phòng</th><th>Mã phách</th>':'<th>SBD</th><th>Họ tên</th><th>Lớp</th>'}<th>Điểm tự luận</th></tr></thead><tbody>${rows.map((r,i)=>`<tr>${phach?`<td>${esc(r.room_code)}</td><td>${esc(r.phach_code)}</td>`:`<td>${esc(r.sbd)}</td><td>${esc(r.student_name)}</td><td>${esc(r.class_code)}</td>`}<td><input type="number" data-sa-score="${i}" min="0" max="${esc(workspace.maximum_score)}" step="any" value="${r.score??''}" style="width:110px"></td></tr>`).join('')}</tbody></table>`;
  $('sa-submit').disabled=!rows.length;
  $('sa-progress').textContent=`${rows.length} bài · ${rows.filter(r=>r.score!==null).length} đã có điểm · thang 0–${workspace.maximum_score}`;
  teacherNotice('Đã tải bài thi. Điểm chỉ được lưu khi nhấn Lưu điểm đã thay đổi.','success');
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
 $('sa-load').onclick=load;$('sa-submit').onclick=submit;$('sa-teacher-refresh').onclick=refreshTeacher;
 $('sa-exam').addEventListener('change',()=>refreshPickers().catch(e=>notice(e.message,'error')));
 $('sa-subject').addEventListener('change',()=>refreshPickers().catch(e=>notice(e.message,'error')));
 $('sa-grade').addEventListener('change',()=>refreshPickers().catch(e=>notice(e.message,'error')));
 $('sa-scope').addEventListener('change',()=>renderChecks());
 return {refresh,refreshTeacher};
}
