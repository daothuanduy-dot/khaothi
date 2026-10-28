import {createSbdGroupEditor} from './sbd-group-editor.js?v=156';
let sbdGroupEditor;
import {optimizeByGroups,allocateByGroups,validateRoomGroups,validateGroupSbdSequence,editFreeRoom,groupClassMap} from './group-rooming.js?v=158';
import {orderSbdGroups,sumPreviousResults} from './sbd-groups.js?v=154';
import {orderElectiveRoomPlan,numberSavedElectiveRooms,adjustRoomPlanCount,allocateCandidatesToRoomPlan as baseAllocateRooms,isValidSbd,optimizeElectiveRooms as baseElectiveRooms,optimizeMandatoryRooms as baseMandatoryRooms,restoreRoomingPlan,roomExportRowPositions,SUBJECTS} from './rooming.js?v=0.1.147';
import {loadTabModules} from './module-loader.js?v=0.1.147&choice=152&sbd=161&forms=163&statistics=168&manual=172';
import {wireOperations,createPrintFrame} from './operations.js?v=0.1.147&forms=163&precision=168';
import {wireAccounts} from './accounts.js?v=0.1.147';
import {wireTeaching} from './teaching.js?v=0.1.147';
import {wireRanking} from './ranking.js?v=0.1.147';
import {wireViolations} from './violations.js?v=0.1.147';
import {createStudentPicker} from './student-picker.js?v=0.1.147';
import {wireScoreControl} from './score-control.js?v=0.1.147';
import {wireClassReport} from './class-report.js?v=0.1.147&classreport=168';
import {wireChoiceReports} from './choice-report.js?v=0.1.147&choice=151&precision=168';
import {loadExamRounds} from './rounds.js?v=0.1.147';
import {publicConfig,validatePublicConfig} from './public-config.js?v=0.1.148';
const APP_VERSION='v0.1.147';
const APP_BUILD='2026-10-28-manual-roster-172';
const $=id=>document.getElementById(id);
const state={client:null,session:null,role:null,exams:[],candidates:[],selectedCandidateIds:[],selectedExam:null,preview:null,config:null,rosterCandidates:[],rosterRegs:[],rosterPage:0,rosterPageSize:50,rosterDirty:new Map(),formData:null,absenceRows:[],scriptRooms:[],scriptFinalizationId:null,graderWork:[],graderQueue:[],graderQueueIndex:0};
let rosterLoadedExamId=null;
let operations=null;
let accounts=null;
let teaching=null;
let ranking=null;
let violations=null;
let scoreControl=null;
let classReport=null;
let choiceReports=null;
let schoolStudents=[];
let schoolStudentCatalog=[];
let schoolStudentLoadToken=0;
let schoolStudentsLoaded=false;
let schoolStudentsLoading=false;
let schoolStudentFilterTimer=null;
const selectedSchoolStudentCodes=new Set();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const subjectName=code=>{const key=String(code??'').trim().toUpperCase();if(!key)return '';if(key==='ANH')return 'Tiếng Anh (mã cũ)';const all=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];return all.find(s=>String(s.code).toUpperCase()===key)?.name||String(code)};
function candidateClassOptions(candidates,grade){
  return [...new Set((candidates||[])
    .filter(candidate=>String(candidate.grade_code||'').trim()===String(grade||'').trim())
    .map(candidate=>String(candidate.class_code||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
}
async function selectAllPages(buildQuery,pageSize=500){
  const rows=[];
  for(let offset=0;;offset+=pageSize){
    const {data,error}=await buildQuery().range(offset,offset+pageSize-1);
    if(error)throw error;
    const page=data||[];
    rows.push(...page);
    if(page.length<pageSize)return rows;
  }
}
function message(el,text,type='info'){el.textContent=text;el.className=`notice notice-${type}`;el.classList.remove('hidden')}
function hide(el){el.classList.add('hidden')}
function showScreen(name){for(const id of ['setup-screen','login-screen','app-screen','grader-screen'])$(id).classList.toggle('hidden',id!==name)}
function setConnection(text,ok=false){$('connection-state').textContent=text;$('connection-state').style.background=ok?'#166534':'transparent';$('connection-state').style.color=ok?'white':'#dce8fb'}
function saveConfig(url,key){localStorage.setItem('exam_supabase_url',url);localStorage.setItem('exam_supabase_key',key)}
function readConfig(){return validatePublicConfig(publicConfig)}
async function connect(url,key){
  ({url,key}=validatePublicConfig({url,key}));
  state.client=null;state.session=null;
  if(!window.supabase?.createClient)throw new Error('Không tải được thư viện Supabase JS từ CDN. Kiểm tra kết nối Internet, tiện ích chặn quảng cáo hoặc mở CDN jsDelivr.');
  let parsed;
  try{parsed=new URL(url)}catch{throw new Error('URL project không hợp lệ. Hãy sao chép nguyên URL trong Supabase → Settings → API.')}
  if(parsed.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/i.test(parsed.hostname)||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('URL chưa đúng định dạng. Chỉ nhập dạng https://<project-ref>.supabase.co, không thêm /rest/v1 hoặc đường dẫn khác.');
  url=parsed.origin;
  if(!key||key.length<20)throw new Error('Publishable/anon key đang trống hoặc quá ngắn. Sao chép khóa public/publishable hoặc anon trong Supabase → Settings → API Keys; không dùng service_role.');
  if(/^eyJ[a-zA-Z0-9_-]+\./.test(key)){/* legacy anon JWT is accepted */}
  else if(!key.startsWith('sb_publishable_'))throw new Error('Khóa không có định dạng publishable/anon được hỗ trợ. Hãy sao chép lại đúng khóa public/publishable hoặc anon của project.');
  // Verify network reachability. Some projects/proxies reject the Auth health
  // route while PostgREST is reachable, so try both endpoints before failing.
  const probeErrors=[];
  let reachable=false;
  for (const endpoint of [`${url}/auth/v1/health`, `${url}/rest/v1/`]) {
    try {
      const response=await fetch(endpoint,{method:'GET',headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'},cache:'no-store'});
      if(response.ok){reachable=true;break;}
      let detail='';try{detail=(await response.text()).slice(0,180)}catch{}
      probeErrors.push(`${new URL(endpoint).pathname}: HTTP ${response.status}${detail?` — ${detail}`:''}`);
      // An Auth health route may be unsupported by an intermediary. Continue to REST.
    } catch(e) {
      probeErrors.push(`${new URL(endpoint).pathname}: ${e?.message||'NetworkError'}`);
    }
  }
  if(!reachable)throw new Error('Không xác minh được kết nối tới Supabase. Kiểm tra URL project, khóa publishable/anon, trạng thái project và kết nối mạng. Chi tiết: '+probeErrors.join(' | '));
  const client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data,error}=await client.auth.getSession();
  if(error)throw new Error('Đã tới được Supabase nhưng không đọc được phiên xác thực trong trình duyệt: '+error.message);
  state.client=client;state.session=data.session||null;
  setConnection('Đã kết nối Supabase',true);
}
async function openConnectedApp(){
  if(state.session?.user)await enterApp(state.session.user);
  else showScreen('login-screen');
}
function showConnectionFailure(error){
  const detail=error?.message||String(error);
  if(state.client){
    setConnection('Đã kết nối Supabase',true);
    showScreen('login-screen');
    message($('login-message'),`Đã kết nối Supabase nhưng không khởi tạo được ứng dụng: ${detail}`,'error');
    return;
  }
  setConnection('Kết nối lỗi');
  showScreen('login-screen');
  $('login-submit').disabled=true;$('google-login').disabled=true;
  message($('login-message'),'Chưa kết nối được hệ thống. Vui lòng tải lại trang hoặc liên hệ quản trị nhà trường.','error');
}
function updateVersionDisplay(){const label=`Phiên bản ${APP_VERSION} · build ${APP_BUILD}`;const top=$('app-version');if(top)top.textContent=label;const foot=$('footer-version');if(foot)foot.textContent=`Khảo thí trực tuyến · ${label}`;document.documentElement.dataset.appVersion=APP_VERSION;}
function updateSelectedExamTitle(){
  const exam=state.exams.find(item=>item.id===state.selectedExam);
  const title=exam?`Quản lý kỳ thi — ${exam.name} (${exam.school_year})`:'Quản lý kỳ thi';
  $('app-title').textContent=title;
  document.title=exam?`${title} | Khảo thí trực tuyến`:'Khảo thí trực tuyến | THPT Lê Hồng Phong';
}
function notifyExamSelected(exam,created=false){
  if(!exam)return;
  window.alert(`${created?'Đã tạo và chọn kỳ thi':'Đã chọn kỳ thi'}: ${exam.name} (${exam.school_year}).`);
}
const examDeleteTableActions={
  exam_elective_room_plans:'Xử lý phương án xếp phòng môn lựa chọn đang lưu. Kiểm tra tab Xếp phòng thi; nếu không có nút xóa phương án, cần chức năng dọn phương án an toàn trước khi xóa kỳ thi.',
  exam_rooming_plan_snapshots:'Xử lý bản chụp phương án xếp phòng. Hãy lưu trữ hoặc dọn theo quy trình quản lý xếp phòng.',
  exam_rooming_finalizations:'Đây là phân phòng chính thức được bảo vệ. Cần xử lý/đóng hồ sơ phân phòng theo quy trình lưu trữ trước khi xóa kỳ thi.',
  exam_room_assignments:'Đây là danh sách phân phòng chính thức. Cần lưu trữ hoặc gỡ phân phòng theo quy trình quản lý xếp phòng.',
  exam_candidates:'Còn hồ sơ thí sinh trong kỳ thi. Xóa hồ sơ thí sinh trước; nếu CSDL chặn, xử lý các bản ghi điểm, phách, báo vắng hoặc phân phòng đang tham chiếu.',
  exam_candidate_subjects:'Còn lượt đăng ký môn. Dùng mục Xóa đăng ký / phân công môn thi trong tab Môn thi.',
  exam_absences:'Còn dữ liệu báo vắng. Xóa hoặc lưu trữ dữ liệu báo vắng trước khi thử lại.',
  exam_script_runs:'Còn đợt đánh phách. Xử lý dữ liệu phách và điểm liên quan theo quy trình quản lý phách trước.',
  exam_subject_assessment_configs:'Còn cấu hình chấm môn. Xóa hoặc lưu trữ cấu hình chấm trước khi xóa kỳ thi.',
  exam_grader_assignments:'Còn phân công giám khảo. Gỡ phân công giám khảo trước khi thử lại.',
  exam_grader_groups:'Còn nhóm giám khảo. Xóa nhóm sau khi xử lý thành viên và các phân công túi bài liên quan.',
  exam_mcq_scores:'Còn điểm trắc nghiệm. Lưu trữ hoặc xóa bảng điểm theo quy trình quản lý điểm trước.',
  exam_script_records:'Còn bản ghi bài thi đã đánh phách. Xử lý các bản ghi phách/điểm theo quy trình quản lý phách.',
  exam_script_bag_assignments:'Còn phân công túi bài. Gỡ phân công túi bài và xử lý dữ liệu phách liên quan trước.'
};
async function examDeleteBlockerMessage(examId,deleteError){
  const original=deleteError?.message||String(deleteError);
  try{
    const{data,error}=await state.client.rpc('exam_get_delete_blockers',{p_exam_id:examId});
    if(error)throw error;
    const blockers=Array.isArray(data?.blockers)?data.blockers:[];
    if(!blockers.length)return `Không xóa được kỳ thi: ${original}\nCSDL không trả về danh sách khóa ngoại đang chặn. Hãy chạy migration v0.1.76 để bật chẩn đoán chi tiết, sau đó tải lại và thử xóa.`;
    const steps=blockers.map((blocker,index)=>{
      const table=String(blocker.table_name||'bảng chưa xác định');
      const action=examDeleteTableActions[table]||`Xử lý các bản ghi ở bảng ${table} theo nghiệp vụ tương ứng; không xóa trực tiếp nếu cần giữ lịch sử.`;
      return `${index+1}. ${action} (còn ${Number(blocker.row_count)||0} bản ghi; bảng ${table}; ràng buộc ${blocker.constraint_name||'không rõ'}).`;
    });
    return `Chưa xóa được kỳ thi "${state.exams.find(exam=>exam.id===examId)?.name||examId}". Lý do CSDL: ${original}\nViệc cần làm trước khi thử lại:\n${steps.join('\n')}\nSau khi xử lý các mục trên, nhấn Xóa kỳ thi lần nữa. Không xóa dữ liệu trực tiếp nếu cần bảo toàn hồ sơ chính thức.`;
  }catch(diagnosticError){
    return `Không xóa được kỳ thi: ${original}\nKhông lấy được danh sách việc cần xử lý (${diagnosticError?.message||String(diagnosticError)}). Hãy chạy migration v0.1.76 rồi thử lại để xem các bảng và số bản ghi đang chặn.`;
  }
}
async function submitLogin(event){
  event.preventDefault();
  const button=$('login-submit');
  if(button.disabled)return;
  const google=$('google-login');
  hide($('login-message'));button.disabled=true;google.disabled=true;
  button.textContent='Đang đăng nhập…';$('login-form').setAttribute('aria-busy','true');
  try{
    if(!state.client)throw new Error('Chưa kết nối hệ thống. Vui lòng liên hệ quản trị nhà trường.');
    const {data,error}=await state.client.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
    if(error)throw error;
    $('login-password').value='';
    await enterApp(data.user);
  }catch(error){
    const raw=error?.message||String(error);
    const text=/invalid login credentials/i.test(raw)?'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.':
      /email not confirmed/i.test(raw)?'Tài khoản chưa xác nhận email. Vui lòng liên hệ quản trị.':
      /rate limit|too many requests/i.test(raw)?'Bạn thử đăng nhập quá nhiều lần. Vui lòng đợi rồi thử lại.':
      /failed to fetch|network/i.test(raw)?'Không kết nối được hệ thống. Kiểm tra mạng và thử lại.':raw;
    message($('login-message'),text,'error');
  }finally{
    button.disabled=false;google.disabled=false;button.textContent='Đăng nhập';
    $('login-form').setAttribute('aria-busy','false');
    $('login-password').type='password';$('login-toggle-password').textContent='Hiện';
    $('login-toggle-password').setAttribute('aria-pressed','false');
    $('login-toggle-password').setAttribute('aria-label','Hiện mật khẩu');
  }
}

async function enterApp(user){
  state.session={user};
  const{data:role,error:roleError}=await state.client.rpc('exam_current_user_role');
  if(roleError)throw new Error(`Không xác định được quyền tài khoản. Hãy chạy migration v0.1.59. ${roleError.message}`);
  state.role=role;
  updateVersionDisplay();$('user-email').textContent=user.email||'';
  if(role==='grader'){
    $('grader-back-admin').classList.add('hidden');
    $('logout-btn').classList.add('hidden');
    showScreen('grader-screen');
    try{await operations?.enterAsGrader()}
    catch(error){message($('grader-message'),error?.message||String(error),'error')}
    return;
  }
  if(role!=='admin'){
    await state.client.auth.signOut();state.session=null;state.role=null;showScreen('login-screen');
    $('user-email').textContent='';$('logout-btn').classList.add('hidden');
    message($('login-message'),'Tài khoản chưa được cấp quyền. Vui lòng liên hệ quản trị để được phân công môn nhập điểm.','error');return;
  }
  $('logout-btn').classList.remove('hidden');showScreen('app-screen');await loadExams();renderSubjects();
}
async function signOut(){await state.client?.auth.signOut();state.session=null;state.role=null;state.selectedExam=null;state.preview=null;state.formData=null;updateSelectedExamTitle();$('user-email').textContent='';$('logout-btn').classList.add('hidden');showScreen('login-screen')}
async function loadExams(){
  const body=$('exam-table-body');
  body.innerHTML='<tr><td colspan="6" class="empty">Đang tải...</td></tr>';
  const{data,error}=await state.client.from('exam_sessions')
    .select('id,name,school_year,status,created_at,exam_mode,managing_authority,institution_name,form_exam_title,form_font_family,form_font_size,form_print_settings').order('created_at',{ascending:false});
  if(error){body.innerHTML=`<tr><td colspan="6" class="empty">${esc(error.message)}</td></tr>`;return}
  state.exams=data||[];
  operations?.refreshExamSelectors();
  body.innerHTML='';
  if(!state.exams.length)body.innerHTML='<tr><td colspan="6" class="empty">Chưa có kỳ thi. Hãy tạo kỳ thi đầu tiên.</td></tr>';
  for(const exam of state.exams){
    const tr=document.createElement('tr'),mode=exam.exam_mode==='manual'?'Kỳ thi tổ chức thủ công':exam.exam_mode==='subject'||exam.exam_mode==='choice'?'Kỳ thi theo môn':'Kỳ thi mặc định';
    tr.innerHTML=`<td><b>${esc(exam.name)}</b><br><small>${esc(exam.id)}</small></td><td>${esc(exam.school_year)}</td><td><span class="tag">${mode}</span></td><td><span class="tag">${esc(exam.status)}</span></td><td>${exam.created_at?new Date(exam.created_at).toLocaleDateString('vi-VN'):'—'}</td><td><button class="small-btn" data-select-exam="${esc(exam.id)}">Chọn kỳ thi</button> <button class="small-btn" data-edit-exam="${esc(exam.id)}">Sửa</button> <button class="small-btn" data-delete-exam="${esc(exam.id)}">Xóa</button></td>`;
    if(exam.exam_mode==='manual')tr.lastElementChild.insertAdjacentHTML('afterbegin',`<button class="small-btn" data-manual-exam="${esc(exam.id)}">Tổ chức riêng</button> `);
    body.append(tr);
  }
  for(const id of ['rooming-exam-select','subject-exam-select','settings-exam-select','sbd-exam-select','forms-exam','absence-exam','script-exam','school-student-exam']){
    const select=$(id),current=select.value;
    select.innerHTML='<option value="">-- Chọn kỳ thi --</option>'+state.exams.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.school_year)})</option>`).join('');
    select.value=state.selectedExam&&state.exams.some(e=>e.id===state.selectedExam)?state.selectedExam:(current&&state.exams.some(e=>e.id===current)?current:(state.exams.length===1?state.exams[0].id:''));
  }
  const previous=$('room-previous-exam');
  if(previous){
    const current=previous.value;
    previous.innerHTML='<option value="">-- Chọn kỳ thi trước --</option>'+state.exams.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.school_year)})</option>`).join('');
    previous.value=current&&state.exams.some(e=>e.id===current)?current:'';
  }
  state.selectedExam=$('rooming-exam-select').value||$('subject-exam-select').value||null;
  if($('subject-delete-registrations'))$('subject-delete-registrations').disabled=!$('subject-exam-select').value;
  updateSelectedExamTitle();
  if($('forms-exam').value)await operations?.refreshFormRounds?.($('forms-exam').value)
    .catch(error=>message($('forms-message'),error.message,'error'));
  await loadCandidates();
}
async function createExam(event){
  event.preventDefault();
  const name=$('new-exam-name').value.trim(),school_year=$('new-exam-year').value.trim(),exam_mode=$('new-exam-mode').value;
  const{data,error}=await state.client.from('exam_sessions').insert({name,school_year,status:'draft',exam_mode}).select().single();
  if(error){message($('global-message'),error.message,'error');return}
  state.selectedExam=data.id;
  $('new-exam-name').value='';
  await loadExams();
  $('rooming-exam-select').value=data.id;$('subject-exam-select').value=data.id;$('sbd-exam-select').value=data.id;$('school-student-exam').value=data.id;
  state.selectedExam=data.id;
  syncSubjectExamMode();
  updateSelectedExamTitle();
  message($('global-message'),`Đã tạo ${exam_mode==='manual'?'kỳ tổ chức thủ công. Nhập học sinh rồi mở Tổ chức riêng tại danh sách kỳ thi':exam_mode==='subject'?'kỳ thi theo môn':'kỳ thi mặc định'}.`,'success');
  notifyExamSelected(data,true);
}
function syncSubjectExamMode(){
  const examId=$('subject-exam-select').value;
  const exam=state.exams.find(x=>x.id===examId);
  if(exam?.exam_mode==='manual')return;
  const mode=exam?.exam_mode==='subject'||exam?.exam_mode==='choice'?'subject':'default';
  $('subject-config-kind').value=mode;
  const modeSelect=$('subject-mode');
  // The previous implementation only changed the value, leaving `disabled`
  // unchanged. This made the dropdown greyed out when switching from default to choice.
  modeSelect.disabled=mode!=='subject';
  if(mode!=='subject')modeSelect.value='required';
  $('subject-order-wrap').classList.toggle('hidden',mode!=='subject'||modeSelect.value!=='elective');
  $('subject-scope').dispatchEvent(new Event('change'));
  const note=$('subject-mode-note');
  if(note)note.textContent=mode==='subject'
    ?'Đây là kỳ thi theo môn: danh sách dự thi được quản lý theo từng môn; SBD được cấp riêng cho từng môn.'
    :'Đây là kỳ thi mặc định: dùng SBD chung trong kỳ thi và cấu hình môn theo khối/lớp.';
}
async function loadDefaultSubjectClassConfig(){
 const examId=$('settings-exam-select').value, panel=$('default-subject-class-config'), listPanel=$('default-config-list-panel'), box=$('default-config-classes');
 const enabled=!!examId&&!isSubjectExam(examId)&&!isManualExam(examId);panel.classList.toggle('hidden',!enabled);listPanel.classList.toggle('hidden',!enabled);
 $('settings-subject-mode-note').classList.toggle('hidden',!!examId&&!isSubjectExam(examId));
 if(!enabled){$('default-config-list-body').innerHTML='<tr><td colspan="6" class="empty">Chọn một kỳ thi mặc định để cấu hình.</td></tr>';return}
 const candidates=await selectAllPages(()=>state.client.from('exam_candidates').select('class_code').eq('exam_id',examId).order('class_code'));
 const classes=[...new Set(candidates.map(row=>String(row.class_code||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
 const catalog=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];
 const subjectSelect=$('default-config-subject'), selected=subjectSelect.value;
 subjectSelect.innerHTML=catalog.map(item=>`<option value="${esc(item.code)}">${esc(item.name)} (${esc(item.code)})</option>`).join('');
 subjectSelect.value=catalog.some(item=>item.code===selected)?selected:catalog[0].code;
 const{data,error}=await state.client.from('exam_subject_class_configs').select('subject_code,class_code,exam_method,subject_type,is_counted').eq('exam_id',examId).order('subject_code').order('class_code');
 if(error)throw new Error(`Không tải được cấu hình môn – lớp. Hãy chạy migration v0.1.126. ${error.message}`);
 const allRows=data||[],method=$('default-config-method').value,subjectRows=allRows.filter(row=>row.subject_code===subjectSelect.value),rows=subjectRows.filter(row=>row.exam_method===method),occupied=new Set(subjectRows.filter(row=>row.exam_method!==method).map(row=>row.class_code));
 const available=classes.filter(code=>!occupied.has(code));
 box.innerHTML=available.map(code=>`<label class="picker-option"><input class="default-config-class" type="checkbox" value="${esc(code)}"> <span>${esc(code)}</span></label>`).join('')||'<div class="picker-empty">Không còn lớp có thể chọn theo hình thức thi này.</div>';
 for(const row of rows){const input=box.querySelector(`[value="${CSS.escape(row.class_code)}"]`);if(input)input.checked=true}
 const unavailable=[...occupied].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
 $('default-config-availability').textContent=unavailable.length?`Đã ẩn ${unavailable.join(', ')} vì các lớp này đã được cấu hình ${method==='room'?'thi tại lớp':'thi chia phòng'} cho môn này.`:'Các lớp chưa được cấu hình theo hình thức còn lại đều có thể chọn.';
 const configRow=rows[0]||subjectRows[0];
 if(configRow){$('default-config-subject-type').value=configRow.subject_type;$('default-config-counted').checked=configRow.is_counted}
 else{$('default-config-subject-type').value='required';$('default-config-counted').checked=true}
 renderDefaultSubjectConfigList(allRows,catalog);
}
function renderDefaultSubjectConfigList(rows,catalog){
 const body=$('default-config-list-body'), byCode=new Map(catalog.map(item=>[item.code,item.name]));
 const groups=new Map();for(const row of rows){const key=`${row.subject_code}:${row.exam_method}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
 if(!groups.size){body.innerHTML='<tr><td colspan="6" class="empty">Chưa có môn nào được cấu hình.</td></tr>';return}
 body.innerHTML=[...groups.values()].map(items=>{const first=items[0],code=first.subject_code,classes=items.map(item=>item.class_code).join(', ');return `<tr><td><b>${esc(byCode.get(code)||code)}</b><br><small>${esc(code)}</small></td><td>${first.subject_type==='elective'?'Lựa chọn':'Bắt buộc'}</td><td>${first.exam_method==='class'?'Thi tại lớp':'Thi chia phòng'}</td><td>${esc(classes)}</td><td>${first.is_counted?'Có':'Không'}</td><td><button class="small-btn" data-default-config-edit="${esc(code)}" data-default-config-method="${esc(first.exam_method)}">Sửa</button> <button class="small-btn danger-btn" data-default-config-delete="${esc(code)}">Xóa</button></td></tr>`}).join('');
}
function resetDefaultSubjectClassConfig(){
 $('default-config-subject').selectedIndex=0;$('default-config-method').value='room';$('default-config-subject-type').value='required';$('default-config-counted').checked=true;
 loadDefaultSubjectClassConfig().catch(error=>message($('default-config-message'),error.message,'error'));
 $('default-config-message').classList.add('hidden');
}
async function saveDefaultSubjectClassConfig(){
 const examId=$('settings-exam-select').value,classes=[...document.querySelectorAll('.default-config-class:checked')].map(input=>input.value);
 const{error}=await state.client.rpc('exam_save_subject_class_config',{p_exam_id:examId,p_subject_code:$('default-config-subject').value,p_exam_method:$('default-config-method').value,p_subject_type:$('default-config-subject-type').value,p_is_counted:$('default-config-counted').checked,p_class_codes:classes});
 if(error)throw new Error(error.message);await loadDefaultSubjectClassConfig();
 message($('default-config-message'),'Đã lưu cấu hình môn – lớp và danh sách học sinh dự thi.','success');
}
async function deleteDefaultSubjectClassConfig(subjectCode){
 const examId=$('settings-exam-select').value, name=subjectName(subjectCode);
 if(!confirm(`Xóa cấu hình môn ${name}? Danh sách dự thi của môn được tạo từ cấu hình này cũng sẽ bị xóa.`))return;
 const{error}=await state.client.rpc('exam_delete_subject_class_config',{p_exam_id:examId,p_subject_code:subjectCode});
 if(error)throw new Error(error.message);resetDefaultSubjectClassConfig();await loadDefaultSubjectClassConfig();
 message($('default-config-message'),`Đã xóa cấu hình môn ${name}.`,'success');
}
function switchTab(tab){
  if(isManualExam(state.selectedExam)&&['subjects','sbd','rooming','forms','scripts','scores','absences','settings'].includes(tab)){
    openManualExamWorkspace(state.selectedExam).catch(error=>message($('global-message'),error.message,'error'));return;
  }
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('hidden',p.id!==`tab-${tab}`));
  if(tab==='school-students'){
    if(!schoolStudentsLoaded)loadSchoolStudents();
    else renderSchoolStudents();
  }
  if(tab==='candidates')loadCandidates();
  if(tab==='subjects'){loadSubjectRegistrations();loadRosterData()}
  if(tab==='rooming')refreshRoomingRoundOptions().catch(error=>message($('rooming-message'),error.message,'error'));
  if(tab==='forms')operations?.refreshForms?.($('forms-exam').value)
    .catch(error=>message($('forms-message'),error.message,'error'));
  if(tab==='forms'&&!operations)message($('forms-message'),'Chức năng biểu mẫu chưa khởi tạo được. Hãy cập nhật đồng bộ các tệp ứng dụng rồi tải lại trang.','error');
  if(tab==='scripts')operations?.refreshScriptConfigs();
  if(tab==='accounts')accounts?.refresh();
  if(tab==='scores'){operations?.refreshScores();scoreControl?.refresh();classReport?.refresh();choiceReports?.refresh();}
  if(tab==='absences')operations?.refreshAbsences(state.selectedExam||'')
    .then(ready=>{if(ready)return violations?.refresh()})
    .catch(error=>message($('absence-message'),error.message,'error'));
  if(tab==='teaching'){
    if(teaching)teaching.refresh();
    else message($('teaching-message')||$('global-message'),'Chưa khởi tạo được phân công giảng dạy. Hãy cập nhật đồng bộ index.html, js/app.js, js/module-loader.js, js/teaching.js và modules/teaching.html, sau đó tải lại bằng Ctrl+F5.','error');
  }
  if(tab==='sbd')refreshSbdRoomControls().catch(error=>message($('sbd-message'),error.message,'error'));
  if(tab==='settings'){ranking?.refresh();loadDefaultSubjectClassConfig().catch(error=>message($('default-config-message'),error.message,'error'))}
}
function renderSubjects(){
  // The current subjects panel no longer includes the legacy catalog cards.
  const catalog=$('subject-catalog');
  if(!catalog)return;
  catalog.innerHTML='<div class="subject-card"><span class="tag">BẮT BUỘC</span><strong>Toán</strong><small>Lịch thi cứng, cấu hình riêng.</small></div><div class="subject-card"><span class="tag">BẮT BUỘC</span><strong>Ngữ văn</strong><small>Lịch thi cứng, cấu hình riêng.</small></div>'+SUBJECTS.map(s=>`<div class="subject-card"><span class="tag">LỰA CHỌN</span><strong>${esc(s.name)}</strong><small>Mã môn: <code>${s.code}</code></small></div>`).join('');
}
function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'&&quoted&&next==='"'){cell+='"';i++}
    else if(ch==='"'){quoted=!quoted}
    else if(ch===','&&!quoted){row.push(cell);cell=''}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}
    else cell+=ch;
  }
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  if(!rows.length)return[];
  const headers=rows.shift().map(h=>h.trim().replace(/^\uFEFF/,''));
  return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,(values[i]??'').trim()])));
}
async function readCsvText(file){
  const buf=await file.arrayBuffer();
  const bytes=new Uint8Array(buf);
  // UTF-8 is preferred; support legacy Vietnamese CSV exported by some Windows applications.
  let text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
  if(text.includes('\uFFFD')){
    try{text=new TextDecoder('windows-1258').decode(bytes)}catch{}
  }
  return text.replace(/^\uFEFF/,'');
}
async function parseUploadFile(file){
  if(/\.csv$/i.test(file.name)){
    const text=await readCsvText(file);
    const rows=parseCsv(text);
    if(!rows.length)throw new Error('File CSV không có dữ liệu. Hãy kiểm tra dòng tiêu đề và dữ liệu.');
    return rows;
  }
  if(!/\.xlsx$/i.test(file.name))throw new Error('Chỉ nhận file Excel .xlsx hoặc CSV .csv mã hóa UTF-8.');
  if(!window.XLSX)throw new Error('Không tải được thư viện đọc Excel. Hãy kiểm tra kết nối Internet.');
  const buf=await file.arrayBuffer();
  const wb=window.XLSX.read(buf,{type:'array',cellDates:false,raw:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  if(!ws)throw new Error('File Excel không có trang tính.');
  const range=window.XLSX.utils.decode_range(ws['!ref']||'A1');
  if(range.e.r<1)throw new Error('File Excel chưa có dòng dữ liệu.');
  const headers=[];
  for(let c=range.s.c;c<=range.e.c;c++){
    const cell=ws[window.XLSX.utils.encode_cell({r:range.s.r,c})];
    headers.push(String(cell?.v??'').trim());
  }
  const rows=[];
  for(let r=range.s.r+1;r<=range.e.r;r++){
    const obj={};let hasValue=false;
    for(let c=range.s.c;c<=range.e.c;c++){
      const header=headers[c-range.s.c];if(!header)continue;
      const cell=ws[window.XLSX.utils.encode_cell({r,c})];
      if(cell&&cell.v!==undefined&&cell.v!==null&&String(cell.v)!=='')hasValue=true;
      if(['student_code','date_of_birth','grade_code','class_code','student_name','gender','ethnicity'].includes(header)
        &&cell&&cell.v!==undefined&&cell.v!==null&&cell.v!==''){
        if(cell.t==='n'||cell.t==='d'){
          const label=header==='student_code'?'Mã định danh':header==='date_of_birth'?'Ngày sinh':header;
          throw new Error(`Dòng ${r+1}, cột ${label} đang là ô số/ngày của Excel. Hãy nhập lại dưới dạng Text để tránh mất số 0 đầu hoặc đảo ngày tháng.`);
        }
        if(cell.f)throw new Error(`Dòng ${r+1}, cột ${header} đang dùng công thức. Hãy sao chép và dán giá trị dưới dạng Text.`);
      }
      obj[header]=cell?.v===undefined||cell?.v===null?'':String(cell.v).trim();
    }
    if(hasValue)rows.push(obj);
  }
  return rows;
}

function normalizedSchoolStudentValue(value){
  return String(value??'').normalize('NFKC').trim().toLocaleLowerCase('vi');
}
function schoolStudentSelectionKey(value){
  return normalizedSchoolStudentValue(value);
}
function schoolStudentMatches(student,{grade='',classCode='',query=''}={}){
  const normalizedGrade=normalizedSchoolStudentValue(grade);
  const normalizedClass=normalizedSchoolStudentValue(classCode);
  const normalizedQuery=normalizedSchoolStudentValue(query);
  const studentGrade=normalizedSchoolStudentValue(student.grade_code);
  const studentClass=normalizedSchoolStudentValue(student.class_code);
  const searchable=[student.student_code,student.student_name].map(normalizedSchoolStudentValue);
  return (!normalizedGrade||studentGrade===normalizedGrade)
    &&(!normalizedClass||studentClass===normalizedClass)
    &&(!normalizedQuery||searchable.some(value=>value.includes(normalizedQuery)));
}
function schoolStudentSort(a,b){
  return String(a.grade_code||'').localeCompare(String(b.grade_code||''),'vi',{numeric:true})
    ||String(a.class_code||'').localeCompare(String(b.class_code||''),'vi',{numeric:true})
    ||String(a.student_name||'').localeCompare(String(b.student_name||''),'vi');
}
function schoolStudentFilters(){
  const grade=$('school-student-grade'),classSelect=$('school-student-class');
  const selectedGrade=grade.value,selectedClass=classSelect.value;
  const grades=[...new Set(schoolStudentCatalog.map(student=>String(student.grade_code||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  grade.innerHTML='<option value="">Tất cả các khối</option>'+grades.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
  const selectedGradeValue=normalizedSchoolStudentValue(selectedGrade);
  grade.value=grades.find(value=>normalizedSchoolStudentValue(value)===selectedGradeValue)||'';
  const classes=[...new Set(schoolStudentCatalog.filter(student=>!grade.value||
      normalizedSchoolStudentValue(student.grade_code)===normalizedSchoolStudentValue(grade.value))
    .map(student=>String(student.class_code||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  classSelect.innerHTML='<option value="">Tất cả các lớp</option>'+classes.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
  const selectedClassValue=normalizedSchoolStudentValue(selectedClass);
  classSelect.value=classes.find(value=>normalizedSchoolStudentValue(value)===selectedClassValue)||'';
  return {grade:grade.value.trim(),classCode:classSelect.value.trim()};
}
function schoolStudentFilterValues(){
  return {
    grade:$('school-student-grade').value.trim(),
    classCode:$('school-student-class').value.trim(),
    query:$('school-student-search').value.trim()
  };
}
const schoolStudentColumns='id,student_code,student_name,date_of_birth,gender,ethnicity,grade_code,class_code';
function buildSchoolStudentQuery({grade='',classCode='',query='',searchField=''}={}){
  let request=state.client.from('school_students').select(schoolStudentColumns)
    .order('grade_code').order('class_code').order('student_name');
  if(grade)request=request.eq('grade_code',grade);
  if(classCode)request=request.eq('class_code',classCode);
  if(query&&searchField)request=request.ilike(searchField,`%${query}%`);
  return request;
}
async function queryFilteredSchoolStudents(filters=schoolStudentFilterValues()){
  const {grade,classCode,query}=filters;
  if(!query){
    return selectAllPages(()=>buildSchoolStudentQuery({grade,classCode}));
  }
  const [byCode,byName]=await Promise.all([
    selectAllPages(()=>buildSchoolStudentQuery({grade,classCode,query,searchField:'student_code'})),
    selectAllPages(()=>buildSchoolStudentQuery({grade,classCode,query,searchField:'student_name'}))
  ]);
  const rows=new Map();
  for(const student of [...byCode,...byName])rows.set(String(student.id),student);
  return [...rows.values()].sort(schoolStudentSort);
}
function scheduleSchoolStudentFilterRefresh(){
  schoolStudentFilters();
  ++schoolStudentLoadToken;
  schoolStudents=[];
  renderSchoolStudents();
  clearTimeout(schoolStudentFilterTimer);
  schoolStudentFilterTimer=setTimeout(()=>refreshSchoolStudentsFromDatabase(),180);
}
async function refreshSchoolStudentsFromDatabase(){
  if(!schoolStudentsLoaded)return;
  const loadToken=++schoolStudentLoadToken;
  const filters=schoolStudentFilterValues();
  try{
    const rows=(await queryFilteredSchoolStudents(filters)).filter(student=>schoolStudentMatches(student,filters));
    if(loadToken!==schoolStudentLoadToken)return;
    schoolStudents=rows;
    renderSchoolStudents();
  }catch(error){
    if(loadToken!==schoolStudentLoadToken)return;
    message($('school-student-message'),`Không lọc được danh sách học sinh: ${error.message||String(error)}`,'error');
  }
}
function filteredSchoolStudents(){
  const source=schoolStudentCatalog.length?schoolStudentCatalog:schoolStudents;
  return source.filter(student=>schoolStudentMatches(student,{
    grade:$('school-student-grade').value,
    classCode:$('school-student-class').value,
    query:$('school-student-search').value
  }));
}
function updateSchoolStudentSelection(){
  const visible=filteredSchoolStudents();
  $('school-student-enroll').disabled=!visible.length||!selectedSchoolStudentCodes.size||!$('school-student-exam').value;
  $('school-student-check-all').checked=visible.length>0&&visible.every(student=>selectedSchoolStudentCodes.has(schoolStudentSelectionKey(student.student_code)));
  $('school-student-check-all').indeterminate=visible.some(student=>selectedSchoolStudentCodes.has(schoolStudentSelectionKey(student.student_code)))&&!$('school-student-check-all').checked;
  $('school-student-enroll').textContent=`Thêm đã chọn (${selectedSchoolStudentCodes.size}) vào kỳ thi`;
}
function renderSchoolStudents(){
  const body=$('school-student-body'),rows=filteredSchoolStudents();
  if(!rows.length){
    body.innerHTML=`<tr><td colspan="9" class="empty">${schoolStudentCatalog.length?'Không có học sinh khớp bộ lọc.':'Chưa có dữ liệu học sinh toàn trường. Hãy nhập danh sách Excel hoặc thêm học sinh.'}</td></tr>`;
    updateSchoolStudentSelection();
    return;
  }
  body.innerHTML=rows.map(student=>`<tr>
    <td><input type="checkbox" data-school-student-check="${esc(schoolStudentSelectionKey(student.student_code))}" aria-label="Chọn ${esc(student.student_name)}" ${selectedSchoolStudentCodes.has(schoolStudentSelectionKey(student.student_code))?'checked':''}></td>
    <td>${esc(student.student_code)}</td><td>${esc(student.student_name)}</td><td>${esc(student.date_of_birth||'—')}</td>
    <td>${esc(student.gender||'—')}</td><td>${esc(student.ethnicity||'—')}</td><td>${esc(student.grade_code)}</td><td>${esc(student.class_code)}</td>
    <td><button class="small-btn" type="button" data-school-student-edit="${esc(student.id)}">Sửa</button> <button class="small-btn danger-btn" type="button" data-school-student-delete="${esc(student.id)}">Xóa</button></td>
  </tr>`).join('');
  updateSchoolStudentSelection();
}
async function loadSchoolStudents(){
  if(schoolStudentsLoading)return;
  schoolStudentsLoading=true;
  const loadToken=++schoolStudentLoadToken;
  schoolStudentsLoaded=false;
  const body=$('school-student-body');
  body.innerHTML='<tr><td colspan="9" class="empty">Đang tải danh sách học sinh toàn trường...</td></tr>';
  try{
    schoolStudentCatalog=await selectAllPages(()=>buildSchoolStudentQuery());
  }catch(error){
    if(loadToken!==schoolStudentLoadToken)return;
    schoolStudentsLoading=false;
    body.innerHTML=`<tr><td colspan="9" class="empty">${esc(error.message||String(error))}</td></tr>`;
    message($('school-student-message'),`Không tải được danh sách học sinh. Hãy chạy migration v0.1.72: ${error.message||String(error)}`,'error');
    return;
  }
  if(loadToken!==schoolStudentLoadToken)return;
  schoolStudentsLoading=false;
  schoolStudentsLoaded=true;
  schoolStudentCatalog.sort(schoolStudentSort);
  schoolStudents=schoolStudentCatalog.slice();
  const known=new Set(schoolStudentCatalog.map(student=>schoolStudentSelectionKey(student.student_code)));
  selectedSchoolStudentCodes.forEach(code=>{if(!known.has(code))selectedSchoolStudentCodes.delete(code)});
  schoolStudentFilters();
  // The browser may restore grade/class/checkbox values before the data load
  // finishes. Re-query using those values before the first render so the
  // controls and table can never describe different datasets.
  await refreshSchoolStudentsFromDatabase();
}
function openSchoolStudentForm(student=null){
  const form=$('school-student-form');
  form.reset();
  $('school-student-id').value=student?.id||'';
  $('school-student-form-title').textContent=student?'Sửa thông tin học sinh':'Thêm học sinh';
  $('school-student-save').textContent=student?'Lưu thay đổi':'Lưu học sinh';
  if(student){
    $('school-student-code').value=student.student_code||'';
    $('school-student-name').value=student.student_name||'';
    $('school-student-form-grade').value=student.grade_code||'';
    $('school-student-form-class').value=student.class_code||'';
    $('school-student-dob').value=student.date_of_birth||'';
    $('school-student-gender').value=student.gender||'';
    $('school-student-ethnicity').value=student.ethnicity||'';
  }
  $('school-student-dialog').showModal();
}
function closeSchoolStudentForm(){
  if($('school-student-dialog').open)$('school-student-dialog').close();
  $('school-student-form').reset();
  $('school-student-id').value='';
}
async function saveSchoolStudent(event){
  event.preventDefault();
  const id=$('school-student-id').value;
  const student={
    student_code:$('school-student-code').value.trim(),
    student_name:$('school-student-name').value.trim(),
    grade_code:$('school-student-form-grade').value.trim().replace(/^khối\s*/i,''),
    class_code:$('school-student-form-class').value.trim(),
    date_of_birth:$('school-student-dob').value||null,
    gender:$('school-student-gender').value||null,
    ethnicity:$('school-student-ethnicity').value.trim()||null
  };
  if(!student.student_code||!student.student_name||!student.grade_code||!student.class_code){
    message($('school-student-message'),'Mã học sinh, họ tên, khối và lớp là bắt buộc.','error');
    return;
  }
  const button=$('school-student-save');
  button.disabled=true;
  try{
    const query=id
      ?state.client.from('school_students').update(student).eq('id',id).select('id').maybeSingle()
      :state.client.from('school_students').insert(student).select('id').single();
    const{data,error}=await query;
    if(error)throw error;
    if(!data)throw new Error('Không tìm thấy hồ sơ học sinh để cập nhật. Danh sách có thể đã thay đổi; hãy tải lại và thử lại.');
    if(id){
      const previous=schoolStudents.find(item=>item.id===id);
      if(previous&&previous.student_code!==student.student_code)selectedSchoolStudentCodes.delete(schoolStudentSelectionKey(previous.student_code));
    }
    closeSchoolStudentForm();
    message($('school-student-message'),id?'Đã cập nhật hồ sơ trong danh sách toàn trường. Hồ sơ kỳ thi đã tạo không thay đổi.':'Đã thêm học sinh vào danh sách toàn trường.','success');
    await loadSchoolStudents();
  }catch(error){
    message($('school-student-message'),`Không lưu được học sinh: ${error.message||String(error)}`,'error');
  }finally{
    button.disabled=false;
  }
}
async function deleteSchoolStudent(id){
  const student=schoolStudents.find(item=>item.id===id);
  if(!student)return;
  if(!confirm(`Xóa ${student.student_name} (${student.student_code}) khỏi danh sách học sinh toàn trường? Hồ sơ đã được tạo trong các kỳ thi sẽ được giữ nguyên.`))return;
  try{
    const{data,error}=await state.client.from('school_students').delete().eq('id',id).select('id');
    if(error)throw error;
    if(!data?.length)throw new Error('Không tìm thấy hồ sơ để xóa. Hãy tải lại danh sách.');
    selectedSchoolStudentCodes.delete(schoolStudentSelectionKey(student.student_code));
    message($('school-student-message'),'Đã xóa học sinh khỏi danh sách toàn trường. Hồ sơ các kỳ thi cũ vẫn được giữ nguyên.','success');
    await loadSchoolStudents();
  }catch(error){
    message($('school-student-message'),`Không xóa được học sinh: ${error.message||String(error)}`,'error');
  }
}
async function importSchoolStudents(event){
  event.preventDefault();
  const file=$('school-student-file').files[0];
  if(!file)return;
  const preview=$('school-student-import-preview');
  try{
    const rows=await parseUploadFile(file),required=['student_code','student_name','grade_code','class_code'];
    if(!rows.length)throw new Error('File không có dữ liệu học sinh.');
    const missing=required.filter(key=>!(key in rows[0]));
    if(missing.length)throw new Error(`Thiếu cột: ${missing.join(', ')}.`);
    const errors=[],seen=new Set();
    const payload=rows.map((row,index)=>{
      const code=String(row.student_code||'').trim(),name=String(row.student_name||'').trim();
      const grade=String(row.grade_code||'').trim().replace(/^khối\s*/i,'');
      const classCode=String(row.class_code||'').trim();
      if(!code||!name||!grade||!classCode)errors.push(`Dòng ${index+2}: thiếu mã học sinh, họ tên, khối hoặc lớp.`);
      if(code&&seen.has(code))errors.push(`Dòng ${index+2}: mã học sinh ${code} bị trùng trong file.`);
      if(code)seen.add(code);
      let dob=null;
      try{dob=row.date_of_birth?normalizeDateForSupabase(row.date_of_birth):null}
      catch(dateError){errors.push(`Dòng ${index+2}: ${dateError.message}`)}
      return{student_code:code,student_name:name,date_of_birth:dob,gender:String(row.gender||'').trim()||null,
        ethnicity:String(row.ethnicity||'').trim()||null,grade_code:grade,class_code:classCode};
    });
    if(errors.length)throw new Error(errors.slice(0,15).join('\n')+(errors.length>15?`\n... còn ${errors.length-15} lỗi.`:''));
    preview.innerHTML=`<div class="notice notice-info">Đã kiểm tra ${payload.length} hồ sơ. Mã đã tồn tại trong danh sách toàn trường sẽ cập nhật thông tin gốc; hồ sơ các kỳ thi cũ không bị thay đổi.</div><button id="school-student-confirm-import" class="btn btn-primary" type="button">Xác nhận nhập ${payload.length} học sinh</button>`;
    $('school-student-confirm-import').onclick=async()=>{
      const button=$('school-student-confirm-import');button.disabled=true;
      try{
        let processed=0;
        for(let offset=0;offset<payload.length;offset+=500){
          const batch=payload.slice(offset,offset+500);
          const{error}=await state.client.rpc('exam_import_school_students',{p_students:batch});
          if(error)throw new Error(`Không ghi được đợt ${Math.floor(offset/500)+1} (đã xử lý ${processed}/${payload.length}): ${error.message}`);
          processed+=batch.length;
        }
        message($('school-student-message'),`Đã thêm/cập nhật ${processed} hồ sơ trong danh sách học sinh toàn trường.`,'success');
        preview.innerHTML='';$('school-student-file').value='';
        await loadSchoolStudents();
      }catch(error){
        message($('school-student-message'),`Không nhập được danh sách: ${error.message||String(error)}`,'error');
        button.disabled=false;
      }
    };
  }catch(error){
    preview.innerHTML='';
    message($('school-student-message'),`File chưa hợp lệ: ${error.message||String(error)}`,'error');
  }
}
async function enrollSchoolStudents(){
  const examId=$('school-student-exam').value;
  const codes=[...selectedSchoolStudentCodes].map(key=>schoolStudentCatalog.find(student=>schoolStudentSelectionKey(student.student_code)===key)?.student_code||key);
  if(!examId){message($('school-student-message'),'Hãy chọn kỳ thi trước khi thêm học sinh.','error');return}
  if(!codes.length){message($('school-student-message'),'Hãy tích chọn ít nhất một học sinh.','error');return}
  const button=$('school-student-enroll');button.disabled=true;
  let inserted=0,existing=0,missing=0,processed=0;
  try{
    for(let offset=0;offset<codes.length;offset+=5000){
      const batch=codes.slice(offset,offset+5000);
      const{data,error}=await state.client.rpc('exam_add_school_students_to_exam',{p_exam_id:examId,p_student_codes:batch});
      if(error)throw new Error(`Đã xử lý ${processed}/${codes.length} học sinh trước khi gặp lỗi: ${error.message}`);
      inserted+=Number(data?.inserted_count||0);
      existing+=Number(data?.already_in_exam_count||0);
      missing+=Number(data?.not_found_count||0);
      processed+=batch.length;
      if(processed<codes.length)message($('school-student-message'),`Đang thêm học sinh vào kỳ thi: ${processed}/${codes.length}...`,'info');
    }
    selectedSchoolStudentCodes.clear();
    message($('school-student-message'),`Đã thêm ${inserted} học sinh vào kỳ thi. Bỏ qua ${existing} đã có sẵn và ${missing} không còn trong danh sách toàn trường. SBD và dữ liệu kỳ thi hiện có được giữ nguyên.`,missing?'info':'success');
    state.selectedExam=examId;
    for(const id of ['rooming-exam-select','subject-exam-select','sbd-exam-select','forms-exam','absence-exam','script-exam'])$(id).value=examId;
    updateSelectedExamTitle();
    await loadCandidates();
    renderSchoolStudents();
  }catch(error){
    message($('school-student-message'),`Không thêm được học sinh vào kỳ thi: ${error.message||String(error)}`,'error');
  }finally{
    updateSchoolStudentSelection();
  }
}
function wireSchoolStudents(){
  $('school-student-add').onclick=()=>openSchoolStudentForm();
  $('school-student-form').addEventListener('submit',saveSchoolStudent);
  $('school-student-cancel').onclick=closeSchoolStudentForm;
  $('school-student-dialog-close').onclick=closeSchoolStudentForm;
  $('school-student-template').onclick=downloadExcelTemplate;
  $('school-student-import-form').addEventListener('submit',importSchoolStudents);
  $('school-student-grade').onchange=scheduleSchoolStudentFilterRefresh;
  $('school-student-class').onchange=scheduleSchoolStudentFilterRefresh;
  $('school-student-search').oninput=scheduleSchoolStudentFilterRefresh;
  $('school-student-exam').onchange=()=>{
    const examId=$('school-student-exam').value||null;
    if(examId){
      state.selectedExam=examId;
      for(const id of ['rooming-exam-select','subject-exam-select','sbd-exam-select','forms-exam','absence-exam','script-exam'])$(id).value=examId;
      updateSelectedExamTitle();
    }
    updateSchoolStudentSelection();
  };
  $('school-student-body').addEventListener('change',event=>{
    const checkbox=event.target.closest('[data-school-student-check]');
    if(!checkbox)return;
    if(checkbox.checked)selectedSchoolStudentCodes.add(schoolStudentSelectionKey(checkbox.dataset.schoolStudentCheck));
    else selectedSchoolStudentCodes.delete(checkbox.dataset.schoolStudentCheck);
    updateSchoolStudentSelection();
  });
  $('school-student-body').addEventListener('click',event=>{
    const edit=event.target.closest('[data-school-student-edit]');
    if(edit){
      openSchoolStudentForm(schoolStudents.find(student=>student.id===edit.dataset.schoolStudentEdit));
      return;
    }
    const remove=event.target.closest('[data-school-student-delete]');
    if(remove)deleteSchoolStudent(remove.dataset.schoolStudentDelete);
  });
  $('school-student-check-all').onchange=event=>{
    filteredSchoolStudents().forEach(student=>{
      const key=schoolStudentSelectionKey(student.student_code);
      if(event.target.checked)selectedSchoolStudentCodes.add(key);
      else selectedSchoolStudentCodes.delete(key);
    });
    renderSchoolStudents();
  };
  $('school-student-select-visible').onclick=()=>{
    filteredSchoolStudents().forEach(student=>selectedSchoolStudentCodes.add(schoolStudentSelectionKey(student.student_code)));
    renderSchoolStudents();
  };
  $('school-student-clear-selection').onclick=()=>{selectedSchoolStudentCodes.clear();renderSchoolStudents()};
  $('school-student-enroll').onclick=enrollSchoolStudents;
}

function downloadExcelTemplate(){
  if(!window.XLSX){message($('global-message'),'Không tải được thư viện Excel. Hãy kiểm tra Internet.','error');return}
  const headers=['student_code','student_name','date_of_birth','gender','ethnicity','grade_code','class_code'];
  const example=['001234567890','Nguyễn Văn A','24/08/2009','Nam','Kinh','12','12A1'];
  const ws={};
  ws['!ref']='A1:G2';
  headers.forEach((header,c)=>{
    const address=window.XLSX.utils.encode_cell({r:0,c});
    ws[address]={t:'s',v:header,z:'@'};
    const value=example[c];
    ws[window.XLSX.utils.encode_cell({r:1,c})]={t:'s',v:value,z:'@'};
  });
  ws['!cols']=headers.map(()=>({wch:22}));
  ws['!autofilter']={ref:'A1:G2'};
  const wb=window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb,ws,'HoSoThiSinh');
  window.XLSX.writeFile(wb,'mau-ho-so-thi-sinh-v0.1.10.xlsx',{cellStyles:true});
}

function normalizeDateForSupabase(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();
  let m;

  // ISO date (including timestamp).
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (isValidCalendarDate(y, mo, d)) return `${String(y).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    throw new Error(`Ngày sinh "${raw}" không hợp lệ.`);
  }

  // Vietnamese day-first date: 24/08/2009, 24-08-2009, 24.08.2009.
  m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    if (isValidCalendarDate(y, mo, d)) return `${String(y).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    throw new Error(`Ngày sinh "${raw}" không hợp lệ.`);
  }

  throw new Error(`Không nhận dạng được ngày sinh "${raw}". Dùng dd/MM/yyyy hoặc yyyy-MM-dd.`);
}
function isValidCalendarDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeExcelTextDate(value){
  const s=String(value??'').trim();
  if(!s)return null;
  const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m)throw new Error(`Ngày sinh "${s}" không đúng định dạng dd/mm/yyyy. Ví dụ: 24/08/2009.`);
  const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]);
  if(!isValidCalendarDate(y,mo,d))throw new Error(`Ngày sinh "${s}" không hợp lệ.`);
  return `${String(y).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

async function importCsv(event){
 event.preventDefault();
 const examId=$('rooming-exam-select').value;
 if(!examId){message($('global-message'),'Hãy tạo hoặc chọn kỳ thi trước khi nhập hồ sơ thí sinh.','error');return}
 const file=$('candidate-csv').files[0];if(!file)return;
 try{
  const rows=await parseUploadFile(file),required=['student_code','student_name','grade_code','class_code'];
  if(!rows.length)throw new Error('File Excel không có dữ liệu.');
  const missing=required.filter(k=>!(k in rows[0]));
  if(missing.length)throw new Error(`Thiếu cột: ${missing.join(', ')}.`);
  const errors=[],seen=new Set();
  const payload=rows.map((r,i)=>{
   const code=String(r.student_code||'').trim(),name=String(r.student_name||'').trim(),grade=String(r.grade_code||'').trim(),classCode=String(r.class_code||'').trim();
   if(!code||!name||!grade||!classCode)errors.push(`Dòng ${i+2}: thiếu mã học sinh, họ tên, khối hoặc lớp.`);
   if(seen.has(code))errors.push(`Dòng ${i+2}: mã học sinh ${code} bị trùng trong file.`);
   seen.add(code);
   let dob=null;try{dob=r.date_of_birth?normalizeExcelTextDate(r.date_of_birth):null}catch(dateError){errors.push(`Dòng ${i+2}: ${dateError.message}`)}
   return{student_code:code,student_name:name,grade_code:grade.replace(/^khối\s*/i,''),class_code:classCode,date_of_birth:dob,gender:r.gender||null,ethnicity:r.ethnicity||null};
  });
  if(errors.length)throw new Error(errors.slice(0,15).join('\n')+(errors.length>15?`\n... còn ${errors.length-15} lỗi.`:''));
  $('import-preview').innerHTML=`<div class="notice notice-info">Đã kiểm tra ${payload.length} hồ sơ. Hồ sơ trùng mã sẽ cập nhật thông tin cá nhân nhưng giữ nguyên SBD và đăng ký môn.</div><button id="confirm-import" class="btn btn-primary" type="button">Xác nhận nhập ${payload.length} hồ sơ</button>`;
  $('confirm-import').onclick=async()=>{
   const button=$('confirm-import');button.disabled=true;let inserted=0,updated=0;
   try{
    for(let offset=0;offset<payload.length;offset+=100){
     const batch=payload.slice(offset,offset+100);
     const {data,error}=await state.client.rpc('exam_import_candidates_preserve_sbd',{p_exam_id:examId,p_candidates:batch});
     if(error)throw new Error(`Không ghi được đợt ${Math.floor(offset/100)+1} (đã xử lý ${offset}/${payload.length}). Hãy chạy migration v0.1.44. ${error.message}`);
     inserted+=Number(data?.inserted_count||0);updated+=Number(data?.updated_count||0);
     message($('global-message'),`Đang nhập hồ sơ: ${Math.min(offset+batch.length,payload.length)}/${payload.length}...`,'info');
    }
    message($('global-message'),`Đã xử lý ${payload.length} hồ sơ: thêm ${inserted}, cập nhật ${updated}. SBD và đăng ký môn cũ được giữ nguyên.`,'success');
    $('import-preview').innerHTML='';$('candidate-csv').value='';await loadCandidates();
   }catch(error){message($('global-message'),error.message||String(error),'error');button.disabled=false}
  };
 }catch(error){message($('global-message'),error.message||String(error),'error')}
}
async function loadCandidates(){
  state.selectedCandidateIds=[];
  const examId=$('rooming-exam-select').value,body=$('candidate-table-body');
  if(!examId){body.innerHTML='<tr><td colspan="9" class="empty">Chọn hoặc tạo kỳ thi.</td></tr>';state.candidates=[];return}
  try{
    state.candidates=await selectAllPages(()=>state.client.from('exam_candidates')
      .select('id,sbd,student_code,student_name,date_of_birth,gender,ethnicity,grade_code,class_code,is_overage')
      .eq('exam_id',examId).order('grade_code').order('class_code').order('student_name').order('id'));
    populateCandidateFilters();
    renderCandidateTable();
  }catch(error){
    state.candidates=[];
    body.innerHTML=`<tr><td colspan="9" class="empty">${esc(error.message)}</td></tr>`;
  }
}
function populateCandidateFilters(){
  const grades=[...new Set((state.candidates||[]).map(c=>String(c.grade_code||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  const gradeSelect=$('candidate-grade-filter'),oldGrade=gradeSelect.value;
  gradeSelect.innerHTML='<option value="">Tất cả các khối</option>'+grades.map(g=>`<option value="${esc(g)}">${esc(/^khối/i.test(g)?g:'Khối '+g)}</option>`).join('');
  if(grades.includes(oldGrade))gradeSelect.value=oldGrade;
  populateCandidateClassFilter();
}
function populateCandidateClassFilter(){
  const grade=$('candidate-grade-filter').value,select=$('candidate-class-filter'),old=select.value;
  const classes=[...new Set((state.candidates||[]).filter(c=>!grade||String(c.grade_code)===grade).map(c=>String(c.class_code||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  select.innerHTML='<option value="">Tất cả các lớp</option>'+classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if(classes.includes(old))select.value=old;
}
function getFilteredCandidates(){
  const grade=$('candidate-grade-filter').value,cls=$('candidate-class-filter').value,q=($('candidate-search').value||'').trim().toLocaleLowerCase('vi');
  return (state.candidates||[]).filter(c=>(!grade||String(c.grade_code)===grade)&&(!cls||c.class_code===cls)&&[c.student_code,c.student_name,c.class_code,c.grade_code].some(v=>String(v||'').toLocaleLowerCase('vi').includes(q)));
}
function renderCandidateTable(){
  const body=$('candidate-table-body'),rows=getFilteredCandidates(),selected=new Set(state.selectedCandidateIds||[]);
  body.innerHTML='';
  for(const c of rows){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><input type="checkbox" class="candidate-row-check" data-candidate-check="${esc(c.id)}" ${selected.has(c.id)?'checked':''} aria-label="Chọn ${esc(c.student_name)}"></td><td>${esc(c.student_code)}</td><td>${esc(c.student_name)}</td><td>${esc(c.date_of_birth||'—')}</td><td>${esc(c.gender||'—')}</td><td>${esc(c.ethnicity||'—')}</td><td>${esc(c.grade_code||'—')}</td><td>${esc(c.class_code)}</td><td class="candidate-actions"><button type="button" class="small-btn" data-candidate-edit="${esc(c.id)}">Sửa</button></td>`;
    body.append(tr);
  }
  if(!rows.length)body.innerHTML='<tr><td colspan="9" class="empty">Không có thí sinh phù hợp.</td></tr>';
  const visibleIds=rows.map(c=>c.id),visibleSelected=visibleIds.filter(id=>selected.has(id)).length;
  $('candidate-select-all').checked=visibleIds.length>0&&visibleSelected===visibleIds.length;
  $('candidate-header-check').checked=$('candidate-select-all').checked;
  $('candidate-selected-count').textContent=`Đã chọn ${selected.size} thí sinh`;
  $('candidate-bulk-delete').disabled=selected.size===0;
}
function updateCandidateSelection(id,checked){
  state.selectedCandidateIds=state.selectedCandidateIds||[];
  const s=new Set(state.selectedCandidateIds);
  if(checked)s.add(id);else s.delete(id);
  state.selectedCandidateIds=[...s];
  const n=$('candidate-select-all');
  const visible=getFilteredCandidates().map(c=>c.id),sel=new Set(state.selectedCandidateIds);
  n.checked=visible.length>0&&visible.every(x=>sel.has(x));
  $('candidate-header-check').checked=n.checked;
  $('candidate-selected-count').textContent=`Đã chọn ${sel.size} thí sinh`;
  $('candidate-bulk-delete').disabled=sel.size===0;
}
function openCandidateModal(id=null){
  resetCandidateForm();
  if(id)beginEditCandidate(id);
  else{
    $('candidate-form-title').textContent='Thêm thí sinh';$('candidate-save').textContent='Thêm thí sinh';
    populateCandidateEditClasses();$('candidate-modal').showModal()
  }
}
function resetCandidateForm(){
  $('candidate-edit-form').reset();$('candidate-edit-id').value='';
  $('candidate-edit-code').disabled=false;
  $('candidate-form-title').textContent='Thêm thí sinh';
  $('candidate-save').textContent='Thêm thí sinh';
  if($('candidate-modal').open)$('candidate-modal').close();
}
function beginEditCandidate(id){
  const c=(state.candidates||[]).find(x=>x.id===id);if(!c)return;
  $('candidate-edit-id').value=c.id;$('candidate-edit-code').value=c.student_code||'';
  $('candidate-edit-code').disabled=true;
  $('candidate-edit-name').value=c.student_name||'';$('candidate-edit-grade').value=String(c.grade_code||'');
  $('candidate-edit-dob').value=c.date_of_birth||'';$('candidate-edit-gender').value=c.gender||'';
  $('candidate-edit-ethnicity').value=c.ethnicity||'';
  populateCandidateEditClasses(c.class_code||'',true);
  $('candidate-form-title').textContent='Sửa hồ sơ thí sinh';$('candidate-save').textContent='Lưu thay đổi';
  $('candidate-modal').showModal();
}
function populateCandidateEditClasses(selectedClass='',preserveMissing=false){
  const grade=$('candidate-edit-grade').value,select=$('candidate-edit-class');
  select.disabled=!grade;
  const classes=candidateClassOptions(state.candidates,grade);
  if(preserveMissing&&selectedClass&&!classes.includes(selectedClass))classes.push(selectedClass);
  classes.sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  const placeholder=!grade?'-- Chọn khối trước --':classes.length?'-- Chọn lớp --':'-- Khối này chưa có lớp --';
  select.innerHTML=`<option value="">${placeholder}</option>`+classes.map(classCode=>
    `<option value="${esc(classCode)}">${esc(classCode)}</option>`).join('');
  if(classes.includes(selectedClass))select.value=selectedClass;
}
function ensureCandidateClassDropdown(){
  const control=$('candidate-edit-class');
  if(control.tagName==='SELECT')return;
  if(control.tagName!=='INPUT')throw new Error('Không tìm thấy trường lớp của hồ sơ thí sinh.');
  const select=document.createElement('select');
  select.id=control.id;select.required=control.required;select.disabled=true;
  select.className=control.className;
  select.innerHTML='<option value="">-- Chọn khối trước --</option>';
  control.replaceWith(select);
}
async function saveCandidate(event){
  event.preventDefault();
  const examId=$('rooming-exam-select').value;
  if(!examId){message($('candidate-form-message'),'Hãy tạo hoặc chọn kỳ thi trước.','error');return}
  const id=$('candidate-edit-id').value.trim();
  const payload={exam_id:examId,student_code:$('candidate-edit-code').value.trim(),student_name:$('candidate-edit-name').value.trim(),
    grade_code:$('candidate-edit-grade').value,date_of_birth:$('candidate-edit-dob').value||null,
    gender:$('candidate-edit-gender').value||null,ethnicity:$('candidate-edit-ethnicity').value.trim()||null,
    class_code:$('candidate-edit-class').value.trim()};
  if(!payload.student_code||!payload.student_name||!payload.grade_code||!payload.class_code){message($('candidate-form-message'),'Mã định danh, họ tên, khối và lớp là bắt buộc.','error');return}
  try{
    let result;
    if(id)result=await state.client.from('exam_candidates').update({student_name:payload.student_name,grade_code:payload.grade_code,
      date_of_birth:payload.date_of_birth,gender:payload.gender,ethnicity:payload.ethnicity,class_code:payload.class_code}).eq('id',id).eq('exam_id',examId);
    else result=await state.client.from('exam_candidates').insert({...payload,sbd:null,elective_1:null,elective_2:null});
    if(result.error)throw result.error;
    resetCandidateForm();message($('candidate-form-message'),id?'Đã cập nhật hồ sơ thí sinh.':'Đã thêm thí sinh mới.','success');await loadCandidates();
  }catch(e){message($('candidate-form-message'),e.message,'error')}
}
function setCandidateDeleteProgress({title,count,total,detail,kind='running',visible=true}){
  const panel=$('candidate-delete-progress');
  panel.classList.remove('hidden','done','failed');
  if(!visible){panel.classList.add('hidden');return}
  if(kind==='done')panel.classList.add('done');
  if(kind==='failed')panel.classList.add('failed');
  $('candidate-delete-progress-title').textContent=title;
  $('candidate-delete-progress-count').textContent=`${count}/${total}`;
  $('candidate-delete-progress-bar').style.width=`${total?Math.min(100,Math.round(count/total*100)):0}%`;
  $('candidate-delete-progress-detail').textContent=detail;
}
async function deleteSelectedCandidates(){
  const ids=[...(state.selectedCandidateIds||[])];
  if(!ids.length)return;
  const examId=$('rooming-exam-select').value;
  if(!examId){message($('candidate-form-message'),'Hãy chọn kỳ thi trước khi xóa.','error');return}
  if(!confirm(`Bạn sắp xóa ${ids.length} thí sinh khỏi kỳ thi hiện tại. Phân công trong các phương án xếp phòng lựa chọn chưa khóa sẽ bị gỡ cùng hồ sơ; dữ liệu phương án đã khóa hoặc dữ liệu nghiệp vụ khác sẽ được giữ lại và có thể ngăn xóa. Thao tác không thể tự hoàn tác. Bạn có muốn tiếp tục?`))return;

  const button=$('candidate-bulk-delete');
  button.disabled=true;
  $('candidate-add-open').disabled=true;
  const selectedSet=new Set(ids),deleted=new Set(),failed=[];
  const batchSize=100;
  const batches=Math.ceil(ids.length/batchSize);
  setCandidateDeleteProgress({title:'Đang xóa hồ sơ thí sinh...',count:0,total:ids.length,detail:`Đang xử lý ${ids.length} bản ghi theo ${batches} đợt, mỗi đợt tối đa ${batchSize} bản ghi.`});
  message($('candidate-form-message'),'Đang xóa dữ liệu. Vui lòng chờ thông báo hoàn tất.','info');

  try{
    for(let offset=0;offset<ids.length;offset+=batchSize){
      const batch=ids.slice(offset,offset+batchSize);
      const batchNo=Math.floor(offset/batchSize)+1;
      setCandidateDeleteProgress({
        title:`Đang xử lý đợt ${batchNo}/${batches}`,
        count:deleted.size+failed.length,total:ids.length,
        detail:`Đã gửi yêu cầu cho ${offset} bản ghi trước đợt này; đang xử lý ${batch.length} bản ghi.`
      });
      // The RPC first removes references from editable elective-room plans and
      // then deletes exam records atomically, preserving locked plans and history.
      const {data,error}=await state.client.rpc('exam_delete_candidates_from_exam',{
        p_exam_id:examId,p_candidate_ids:batch
      });
      if(!error){
        if(Number(data?.deleted_count)!==batch.length){
          for(const id of batch)failed.push({id,error:`RPC báo đã xóa ${Number(data?.deleted_count)||0}/${batch.length} hồ sơ; cần kiểm tra lại dữ liệu.`});
        }else{
          for(const id of batch)deleted.add(id);
        }
      }else{
        // A batch can fail because one row is retained by finalized/history data. Retry individually
        // so independent records can still be deleted and the failed IDs can be reported.
        for(let i=0;i<batch.length;i++){
          const id=batch[i];
          const {data:one,error:oneError}=await state.client.rpc('exam_delete_candidates_from_exam',{
            p_exam_id:examId,p_candidate_ids:[id]
          });
          if(oneError)failed.push({id,error:oneError.message});
          else if(Number(one?.deleted_count)===1)deleted.add(id);
          else failed.push({id,error:'RPC không xác nhận đã xóa hồ sơ.'});
          if((i+1)%10===0||i===batch.length-1){
            setCandidateDeleteProgress({
              title:`Đang xử lý đợt ${batchNo}/${batches}`,
              count:deleted.size+failed.length,total:ids.length,
              detail:`Đợt này gặp ràng buộc; đang thử từng bản ghi để xóa được các bản ghi độc lập. Đã xử lý ${deleted.size+failed.length}/${ids.length}.`
            });
          }
        }
      }
      setCandidateDeleteProgress({
        title:`Đã xử lý ${Math.min(offset+batch.length,ids.length)}/${ids.length} bản ghi`,
        count:deleted.size+failed.length,total:ids.length,
        detail:`Xóa thành công ${deleted.size}; chưa xóa được ${failed.length}.`
      });
    }
  }catch(e){
    failed.push({id:null,error:e?.message||String(e)});
  }finally{
    state.selectedCandidateIds=ids.filter(id=>!deleted.has(id));
    await loadCandidates();
    button.disabled=!(state.selectedCandidateIds||[]).length;
    $('candidate-add-open').disabled=false;
  }

  const count=deleted.size+failed.length;
  if(failed.length===0){
    setCandidateDeleteProgress({title:'Đã xóa xong!',count:ids.length,total:ids.length,detail:`Xóa thành công ${deleted.size} thí sinh. Danh sách đã được tải lại.`,kind:'done'});
    message($('candidate-form-message'),`Hoàn tất: đã xóa thành công ${deleted.size}/${ids.length} thí sinh.`, 'success');
  }else{
    const examples=failed.slice(0,5).map(x=>`${x.id?`ID ${x.id}: `:''}${x.error}`).join(' | ');
    setCandidateDeleteProgress({title:'Đã kết thúc nhưng còn bản ghi chưa xóa',count:count,total:ids.length,detail:`Xóa thành công ${deleted.size}; thất bại ${failed.length}. Chi tiết đầu tiên: ${examples}`,kind:'failed'});
    message($('candidate-form-message'),`Đã xóa ${deleted.size}/${ids.length} thí sinh. Còn ${failed.length} bản ghi chưa xóa; có thể đang được dữ liệu đã khóa hoặc dữ liệu điểm/phách tham chiếu. Xem chi tiết tại thanh tiến độ.`, 'error');
  }
}
async function loadPreviousScores(previousExamId){
 const exam=state.exams.find(e=>e.id===previousExamId);
 const isDefault=exam?.exam_mode==='default';
 const configs=await selectAllPages(()=>state.client.from(isDefault?'exam_subject_class_configs':'exam_candidate_subjects')
   .select(isDefault?'subject_code,class_code,is_counted':'subject_code,candidate_id').eq('exam_id',previousExamId));
 const eligible=isDefault?configs.filter(c=>c.is_counted):configs;
 if(!eligible.length)throw new Error('Kỳ thi trước chưa có môn thuộc phạm vi tính điểm.');
 const rows=[];
 for(const subject of [...new Set(eligible.map(c=>c.subject_code))]){
   const data=await selectAllPages(()=>state.client.rpc('exam_get_subject_results',{p_exam_id:previousExamId,p_subject_code:subject}));
   rows.push(...data.filter(row=>eligible.some(c=>c.subject_code===subject&&(isDefault?c.class_code===row.class_code:c.candidate_id===row.candidate_id))));
 }
 const map=sumPreviousResults(rows);
 if(!map.size)throw new Error('Kỳ thi trước chưa có kết quả hợp lệ để tính tổng điểm.');
 return {map};
}
function selectedRoomingRound(){return Number($('rooming-round')?.value||0)}
function selectedRoomingMode(){return $('rooming-adjustment-mode')?.value||'automatic'}
async function refreshRoomingRoundOptions(){
  const select=$('rooming-round'),examId=$('rooming-exam-select')?.value;
  if(!select||!examId||!state.client)return;
  const previous=select.value;
  select.innerHTML='<option value="">-- Chọn đợt thi --</option>';
  const rounds=await loadExamRounds(state.client,examId);
  select.innerHTML=rounds.map(round=>`<option value="${round.round_no}">${esc(round.name)}</option>`).join('');
  const available=rounds.map(round=>String(round.round_no));
  select.value=available.includes(previous)?previous:(available[0]||'');
  if(select.value)await refreshRoomingSubjectOptions();
}
async function openRoundManagement(){
  const examId=$('rooming-exam-select')?.value;
  if(!examId){message($('rooming-message'),'Hãy chọn kỳ thi trước khi quản lý đợt thi.','error');return}
  let dialog=$('round-management-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='round-management-dialog';dialog.className='modal-dialog';document.body.appendChild(dialog)}
  dialog.innerHTML=`<form method="dialog" class="round-candidate-form"><div class="modal-header"><div><h3>Quản lý đợt thi</h3><p>Đợt thi thuộc riêng kỳ thi đang chọn. Tối đa 2 đợt theo quy tắc dữ liệu hiện tại.</p></div><button value="cancel" class="btn btn-light" type="submit">Đóng</button></div><div class="form-grid"><label>Số đợt<select id="round-management-no"><option value="1">Đợt 1</option><option value="2">Đợt 2</option></select></label><label>Tên đợt<input id="round-management-name" maxlength="120" placeholder="Ví dụ: Đợt 1"></label></div><div class="form-actions"><button id="round-management-create" class="btn btn-primary" type="button">Thêm đợt</button><button id="round-management-refresh" class="btn btn-light" type="button">Tải lại</button></div><div id="round-management-message" class="notice hidden"></div><div class="table-wrap"><table><thead><tr><th>Đợt</th><th>Tên</th><th>${'Trạng thái'}</th><th>Thí sinh</th><th>Môn</th><th>Thao tác</th></tr></thead><tbody id="round-management-body"></tbody></table></div></form>`;
  const body=dialog.querySelector('#round-management-body'),nameInput=dialog.querySelector('#round-management-name'),noInput=dialog.querySelector('#round-management-no'),notice=dialog.querySelector('#round-management-message');
  const showError=text=>message(notice,text,'error');
  const load=async()=>{body.innerHTML='<tr><td colspan="6" class="empty">Đang tải...</td></tr>';const {data,error}=await state.client.rpc('exam_list_rounds',{p_exam_id:examId});if(error){showError(`Không tải được danh sách đợt: ${error.message}`);return []}const rows=data||[];body.innerHTML=rows.length?rows.map(row=>`<tr><td>${esc(row.round_no)}</td><td>${esc(row.name)}</td><td>${row.is_active?'Đang hoạt động':'Đã tắt'}</td><td>${Number(row.candidate_count)||0}</td><td>${Number(row.subject_count)||0}</td><td><button type="button" class="small-btn" data-round-edit="${esc(row.round_no)}">Sửa</button> <button type="button" class="small-btn danger-btn" data-round-delete="${esc(row.round_no)}">Xoá</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">Kỳ thi chưa có đợt thi.</td></tr>';return rows};
  dialog.querySelector('#round-management-create').onclick=async()=>{const roundNo=Number(noInput.value),name=nameInput.value.trim()||`Đợt ${roundNo}`;try{const {error}=await state.client.rpc('exam_create_round',{p_exam_id:examId,p_round_no:roundNo,p_name:name});if(error)throw error;message(notice,`Đã thêm ${name}.`,'success');await load();await refreshRoomingRoundOptions()}catch(error){showError(error.message||String(error))}};
  dialog.querySelector('#round-management-refresh').onclick=()=>load();
  body.onclick=async event=>{const edit=event.target.closest('[data-round-edit]'),del=event.target.closest('[data-round-delete]');if(edit){const rowNo=Number(edit.dataset.roundEdit),row=[...(await load())].find(item=>Number(item.round_no)===rowNo);if(!row)return;const name=prompt('Tên đợt thi:',row.name);if(name===null)return;const active=confirm('Đợt này có được hiển thị để cấu hình và xếp phòng không?');try{const {error}=await state.client.rpc('exam_update_round',{p_exam_id:examId,p_round_no:rowNo,p_name:name.trim(),p_is_active:active});if(error)throw error;message(notice,'Đã cập nhật đợt thi.','success');await load();await refreshRoomingRoundOptions()}catch(error){showError(error.message||String(error))}return}if(del){const rowNo=Number(del.dataset.roundDelete);if(!confirm(`Xoá cấu hình đợt ${rowNo}? Danh sách học sinh và môn của đợt sẽ bị xoá. Phương án phòng chính thức sẽ được bảo vệ.`))return;try{const {error}=await state.client.rpc('exam_delete_round',{p_exam_id:examId,p_round_no:rowNo});if(error)throw error;message(notice,`Đã xoá đợt ${rowNo}.`,'success');await load();await refreshRoomingRoundOptions()}catch(error){showError(error.message||String(error))}}};
  await load();dialog.showModal();
}
async function refreshRoomingSubjectOptions(){
  const examId=$('rooming-exam-select')?.value,roundNo=selectedRoomingRound();
  if(!examId||!state.client)return;
  const {data,error}=await state.client.from('exam_round_subjects').select('subject_code,subject_type').eq('exam_id',examId).eq('round_no',roundNo).order('subject_type').order('subject_code');
  if(error)return;
  const all=[...new Map((data||[]).filter(row=>row.subject_type!=='elective').map(row=>[String(row.subject_code).toUpperCase(),String(row.subject_code).toUpperCase()])).keys()];
  const fallback=[...new Set((await selectAllPages(()=>state.client.from('exam_candidate_subjects').select('subject_code').eq('exam_id',examId))).map(row=>String(row.subject_code||'').toUpperCase()))];
  const codes=all.length?all:fallback;
  const options=codes.map(code=>`<option value="${esc(code)}">${esc(subjectName(code))} (${esc(code)})</option>`).join('');
  $('mandatory-subject').innerHTML=options||'<option value="TOAN">Toán (TOAN)</option>';
  $('rooming-subject').innerHTML=options||'<option value="TOAN">Toán (TOAN)</option>';
}
function normalizeRoundSubjectRows(rows){
  const seen=new Set();
  return (rows||[]).map(row=>{
    const code=String(row.subject_code||'').trim().toUpperCase();
    const rawType=String(row.subject_type||'').trim().toLowerCase();
    const type=rawType==='required'?'mandatory':rawType==='class'?'class':'elective';
    return {subject_code:code,subject_type:type,subject_order:Number(row.subject_order)||1};
  }).filter(row=>row.subject_code).filter(row=>{const key=`${row.subject_code}|${row.subject_type}`;if(seen.has(key))return false;seen.add(key);return true});
}
async function configureRoomingRoundFromSelection(selectedIds){
  const examId=$('rooming-exam-select').value,roundNo=selectedRoomingRound();
  if(!examId)throw new Error('Hãy chọn kỳ thi trước.');
  const ids=(selectedIds||[]).map(String);
  if(!ids.length)throw new Error('Chưa chọn học sinh vào đợt.');
  if(roundNo===2){const first=await state.client.from('exam_round_candidates').select('candidate_id').eq('exam_id',examId).eq('round_no',1);const excluded=new Set((first.data||[]).map(row=>String(row.candidate_id)));const overlap=ids.filter(id=>excluded.has(id));if(overlap.length)throw new Error(`${overlap.length} học sinh đã thuộc đợt 1, không thể đưa vào đợt 2.`)}
  const subjectRows=await selectAllPages(()=>state.client.from('exam_candidate_subjects').select('subject_code,subject_type,subject_order').eq('exam_id',examId));
  const subjects=normalizeRoundSubjectRows(subjectRows);
  if(!subjects.length)subjects.push({subject_code:String($('rooming-subject')?.value||$('mandatory-subject')?.value||'TOAN').toUpperCase(),subject_type:'mandatory',subject_order:1});
  const {data,error}=await state.client.rpc('exam_configure_round',{p_exam_id:examId,p_round_no:roundNo,p_candidate_ids:ids,p_subjects:subjects,p_name:`Đợt ${roundNo}`});
  if(error)throw error;
  message($('rooming-message'),`Đã cấu hình đợt ${roundNo}: ${data.candidate_count} thí sinh, ${data.subject_count} môn. SBD vẫn dùng chung theo kỳ thi.`,'success');
  await loadCandidates();
}
async function openRoundCandidateDialog(){
  const examId=$('rooming-exam-select').value,roundNo=selectedRoomingRound();
  if(!examId){message($('rooming-message'),'Hãy chọn kỳ thi trước.','error');return}
  const button=$('configure-rooming-round');button.disabled=true;
  try{
    if(!state.candidates.length)await loadCandidates();
    const firstRows=roundNo===2?await selectAllPages(()=>state.client.from('exam_round_candidates').select('candidate_id').eq('exam_id',examId).eq('round_no',1)):[];
    const excluded=new Set(firstRows.map(row=>String(row.candidate_id)));
    const currentRows=await selectAllPages(()=>state.client.from('exam_round_candidates').select('candidate_id').eq('exam_id',examId).eq('round_no',roundNo));
    const current=new Set(currentRows.map(row=>String(row.candidate_id)));
    const eligible=state.candidates.filter(candidate=>!excluded.has(String(candidate.id)));
    const initiallySelected=current.size?new Set([...current].filter(id=>eligible.some(candidate=>String(candidate.id)===id))):new Set(eligible.map(candidate=>String(candidate.id)));
    let dialog=$('round-candidate-dialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='round-candidate-dialog';dialog.className='modal-dialog';document.body.appendChild(dialog)}
    dialog.innerHTML=`<form method="dialog" class="round-candidate-form"><div class="modal-header"><div><h3>Nạp học sinh vào đợt ${roundNo}</h3><p>Chọn khối, lớp và tích chọn học sinh. Số báo danh vẫn giữ nguyên theo kỳ thi.</p></div><button value="cancel" class="btn btn-light" type="submit">Đóng</button></div><div class="form-grid round-candidate-filters"><label>Khối<select id="round-candidate-grade"><option value="">Tất cả khối</option></select></label><label>Lớp<select id="round-candidate-class"><option value="">Tất cả lớp</option></select></label><label>Tìm học sinh<input id="round-candidate-search" placeholder="Mã hoặc họ tên"></label></div><div class="form-actions"><button id="round-candidate-select-visible" class="btn btn-light" type="button">Chọn tất cả đang lọc</button><button id="round-candidate-clear-visible" class="btn btn-light" type="button">Bỏ chọn đang lọc</button><span id="round-candidate-count" class="muted"></span></div><div id="round-candidate-list" class="round-candidate-list"></div><div class="modal-actions"><button value="cancel" class="btn btn-light" type="submit">Hủy</button><button id="round-candidate-save" value="default" class="btn btn-primary" type="submit">Lưu danh sách vào đợt ${roundNo}</button></div></form>`;
    const gradeSelect=dialog.querySelector('#round-candidate-grade'),classSelect=dialog.querySelector('#round-candidate-class'),searchInput=dialog.querySelector('#round-candidate-search'),list=dialog.querySelector('#round-candidate-list'),count=dialog.querySelector('#round-candidate-count');
    const grades=[...new Set(eligible.map(row=>String(row.grade_code||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    gradeSelect.innerHTML='<option value="">Tất cả khối</option>'+grades.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
    const selected=new Set(initiallySelected);
    const refreshClasses=()=>{const grade=gradeSelect.value;const classes=[...new Set(eligible.filter(row=>!grade||String(row.grade_code)===grade).map(row=>String(row.class_code||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));const old=classSelect.value;classSelect.innerHTML='<option value="">Tất cả lớp</option>'+classes.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');if(classes.includes(old))classSelect.value=old};
    const render=()=>{const grade=gradeSelect.value,cls=classSelect.value,q=String(searchInput.value||'').trim().toLocaleLowerCase('vi');const rows=eligible.filter(row=>(!grade||String(row.grade_code)===grade)&&(!cls||String(row.class_code)===cls)&&(!q||[row.student_code,row.student_name,row.class_code].some(value=>String(value||'').toLocaleLowerCase('vi').includes(q))));list.innerHTML=rows.length?rows.map(row=>{const id=String(row.id);return `<label class="round-candidate-row"><input type="checkbox" data-round-candidate="${esc(id)}" ${selected.has(id)?'checked':''}><span>${esc(row.student_code||'')} · ${esc(row.student_name||'')}</span><small>Khối ${esc(row.grade_code||'')} · ${esc(row.class_code||'')}</small></label>`}).join(''):'<div class="empty">Không có học sinh phù hợp.</div>';count.textContent=`Đã chọn ${selected.size}/${eligible.length} học sinh`;list.querySelectorAll('[data-round-candidate]').forEach(input=>input.onchange=()=>{const id=input.dataset.roundCandidate;if(input.checked)selected.add(id);else selected.delete(id);count.textContent=`Đã chọn ${selected.size}/${eligible.length} học sinh`})};
    const visibleIds=()=>[...list.querySelectorAll('[data-round-candidate]')].map(input=>input.dataset.roundCandidate);
    gradeSelect.onchange=()=>{refreshClasses();render()};classSelect.onchange=render;searchInput.oninput=render;
    dialog.querySelector('#round-candidate-select-visible').onclick=()=>{visibleIds().forEach(id=>selected.add(id));render()};dialog.querySelector('#round-candidate-clear-visible').onclick=()=>{visibleIds().forEach(id=>selected.delete(id));render()};
    dialog.querySelector('#round-candidate-save').onclick=async event=>{event.preventDefault();const save=dialog.querySelector('#round-candidate-save');save.disabled=true;try{await configureRoomingRoundFromSelection([...selected]);dialog.close()}catch(error){message($('rooming-message'),error.message||String(error),'error');save.disabled=false}};
    refreshClasses();render();dialog.showModal();
  }catch(error){message($('rooming-message'),error.message||String(error),'error')}finally{button.disabled=false}
}
async function configureRoomingRound(){
  const examId=$('rooming-exam-select').value,roundNo=selectedRoomingRound();
  if(!examId){message($('rooming-message'),'Hãy chọn kỳ thi trước.','error');return}
  const candidates=await selectAllPages(()=>state.client.from('exam_candidates').select('id').eq('exam_id',examId));
  if(!candidates.length){message($('rooming-message'),'Kỳ thi chưa có thí sinh.','error');return}
  const subjectRows=await selectAllPages(()=>state.client.from('exam_candidate_subjects').select('subject_code,subject_type,subject_order').eq('exam_id',examId));
  const planType=$('room-plan-type').value,mandatory=$('mandatory-subject')?.value||'TOAN';
  const subjects=planType==='mandatory'?[{subject_code:mandatory,subject_type:'mandatory',subject_order:1}]:[...new Map(subjectRows.filter(row=>row.subject_type==='elective').map(row=>[row.subject_code,{subject_code:row.subject_code,subject_type:'elective',subject_order:row.subject_order||1}])).values()];
  const ids=candidates.map(row=>row.id);
  if(roundNo===2){const first=await state.client.from('exam_round_candidates').select('candidate_id').eq('exam_id',examId).eq('round_no',1);const excluded=new Set((first.data||[]).map(row=>row.candidate_id));ids.splice(0,ids.length,...ids.filter(id=>!excluded.has(id)));}
  const {data,error}=await state.client.rpc('exam_configure_round',{p_exam_id:examId,p_round_no:roundNo,p_candidate_ids:ids,p_subjects:subjects,p_name:`Đợt ${roundNo}`});
  if(error)throw error;
  message($('rooming-message'),`Đã cấu hình đợt ${roundNo}: ${data.candidate_count} thí sinh, ${data.subject_count} môn. SBD vẫn dùng chung theo kỳ thi.`,'success');
  await loadCandidates();
}
function roomingSubjectFilter(query,planType,subjectCode){return ['mandatory','subject'].includes(planType)?query.eq('subject_code',subjectCode):query.is('subject_code',null)}
async function findCurrentRoundPlan(examId,roundNo,planType,subjectCode,status){
 let query=state.client.from('exam_rooming_round_plans').select('*')
  .eq('exam_id',examId).eq('round_no',roundNo).eq('plan_type',planType).eq('status',status);
 query=roomingSubjectFilter(query,planType,subjectCode);
 const{data,error}=await query.order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(error)throw new Error(`Khong doc duoc phuong an dot ${roundNo}. Hay chay migration SQL v0.1.92. ${error.message}`);
 return data||null;
}
async function findOfficialRoundCandidateIds(examId){
 const{data,error}=await state.client.from('exam_rooming_round_plans').select('assignments')
  .eq('exam_id',examId).eq('round_no',1).eq('status','official');
 if(error)throw new Error(`Khong kiem tra duoc thi sinh da thi dot 1. Hay chay migration SQL v0.1.92. ${error.message}`);
 const ids=new Set((data||[]).flatMap(row=>Array.isArray(row.assignments)?row.assignments:[]).map(row=>String(row.candidate_id||'')));
 if(ids.size)return ids;
 const legacy=await selectAllPages(()=>state.client.from('exam_rooming_finalizations').select('id').eq('exam_id',examId).eq('is_current',true));
 if(legacy.length){const assignments=await selectAllPages(()=>state.client.from('exam_room_assignments').select('candidate_id').in('finalization_id',legacy.map(row=>row.id)));for(const row of assignments)ids.add(String(row.candidate_id||''));}
 return ids;
}
async function findCurrentRoomingFinalization(examId,planType,subjectCode,roundNo=1){
 const roundPlan=await findCurrentRoundPlan(examId,roundNo,planType,subjectCode,'official');
 if(roundPlan)return {record:{...roundPlan,finalization_id:roundPlan.id,assignment_count:roundPlan.assignments.length,room_count:roundPlan.rooms.length},assignments:roundPlan.assignments,roundPlan:true};
 if(roundNo!==1)return null;
 let query=state.client.from('exam_rooming_finalizations').select('*')
  .eq('exam_id',examId).eq('plan_type',planType).eq('is_current',true);
 query=planType==='mandatory'?query.eq('subject_code',subjectCode):query.is('subject_code',null);
 const{data,error}=await query.order('finalized_at',{ascending:false}).limit(1).maybeSingle();
 if(error)throw new Error(`Không đọc được phân phòng chính thức đã lưu. Hãy kiểm tra migration v0.1.45 và quyền xem hồ sơ trong Supabase. ${error.message}`);
 if(!data)return null;
 const assignments=await selectAllPages(()=>state.client.from('exam_room_assignments')
  .select('candidate_id,room_code,sbd,subject_code,ca1_subject_code,ca2_subject_code')
  .eq('finalization_id',data.id).order('sbd'));
 if(assignments.length!==Number(data.assignment_count))
  throw new Error(`Hồ sơ phân phòng ${data.id} khai báo ${data.assignment_count} thí sinh nhưng chỉ đọc được ${assignments.length} phân công. Không tiếp tục bằng dữ liệu thiếu.`);
 return{record:data,assignments};
}
async function findLatestRoomingSnapshot(examId,planType,subjectCode,roundNo=1){
 const roundPlan=await findCurrentRoundPlan(examId,roundNo,planType,subjectCode,'saved');
 if(roundPlan)return {...roundPlan,source_plan_id:roundPlan.id,assignment_count:roundPlan.assignments.length,room_count:roundPlan.rooms.length};
 if(roundNo!==1)return null;
 let query=state.client.from('exam_rooming_plan_snapshots').select('*')
  .eq('exam_id',examId).eq('plan_type',planType);
 query=planType==='mandatory'?query.eq('subject_code',subjectCode):query.is('subject_code',null);
 const{data,error}=await query.order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(error)throw new Error(`Không đọc được phương án phân phòng đã lưu. Hãy kiểm tra migration v0.1.45 và quyền xem hồ sơ trong Supabase. ${error.message}`);
 return data||null;
}
function restoreSavedRooming(record,assignments,candidates,{examId,planType,subjectCode,roundNo=1,adjustmentMode='automatic',finalized,pool}){
 const restored=restoreRoomingPlan(record.rooms,assignments,candidates,{
  planType,subjectCode,capacity:record.capacity,allowMissingCandidates:!finalized
 });
 if(!restored.ok)throw new Error(`Hồ sơ phân phòng ${record.id||record.finalization_id} không toàn vẹn: ${restored.errors.join(' ')}`);
 const currentIds=new Set((pool||[]).map(poolCandidateId));
 const storedIds=new Set(restored.result.assignments.map(assignment=>String(assignment.candidate_id)));
 const assignmentRosterMatches=Boolean(finalized)||
  (currentIds.size===storedIds.size&&[...currentIds].every(id=>storedIds.has(id)));
 const firstRoom=[...restored.result.rooms].sort((a,b)=>Number(a.room_number)-Number(b.room_number))[0];
 const roomPrefix=String(firstRoom?.room_code||'').replace(/\d+$/,'')||$('room-prefix').value||'P';
 const firstRoomNumber=Number(firstRoom?.room_number)||1;
 $('room-capacity').value=Number(record.capacity);
 $('room-prefix').value=roomPrefix;
 $('first-room-number').value=firstRoomNumber;
 const saved=finalized?{snapshot_id:record.source_plan_id}:record;
 $('rooming-round').value=String(roundNo);$('rooming-adjustment-mode').value=record.adjustment_mode||adjustmentMode;
 state.preview={
  examId,roundNo,planType,subjectCode:subjectCode||null,adjustmentMode:record.adjustment_mode||adjustmentMode,
  pool:finalized?restored.result.assignments.map(assignment=>assignment):pool,
  options:{capacity:Number(record.capacity),regularCapacity:Number(record.rooms?.[0]?.regular_capacity)||Number(record.capacity),roomPrefix,firstRoomNumber,sortMode:'sbd',previousExamId:null},
  result:restored.result,assignmentsCreated:true,suggestionValid:true,
  saved,sourcePlanId:finalized?record.source_plan_id:record.id,
  finalized:finalized?record:null,restoredFromDatabase:true,assignmentRosterMatches
 };
 renderRooming(state.preview.result,planType);
 $('preview-rooming').textContent='Lập phương án mới';
 return assignmentRosterMatches;
}
async function previewRooming(){
 const examId=$('rooming-exam-select').value;
 if(isManualExam(examId)){await openManualExamWorkspace(examId);return}
 if(!examId){message($('rooming-message'),'Hãy chọn kỳ thi.','error');return}
 if(state.preview&&!state.preview.restoredFromDatabase){
  message($('rooming-message'),'Phương án hiện tại đang được chỉnh sửa. Hãy tiếp tục điều chỉnh hoặc lưu; không cần bấm xem trước lại.','info');
  return;
 }
 const creatingNewPlan=Boolean(state.preview?.restoredFromDatabase);
 if(creatingNewPlan)state.preview=null;
 state.preview=null;clearRoomingPreview();
 const previewButton=$('preview-rooming');
 previewButton.disabled=true;previewButton.textContent='Đang tải phương án...';
 message($('rooming-message'),'Đang tải thí sinh và lập phương án sĩ số phòng...','info');
 try{
  const planType=$('room-plan-type')?.value||'elective';
  const roundNo=selectedRoomingRound(),adjustmentMode=selectedRoomingMode();
  if(!roundNo)throw new Error('Hãy chọn đợt thi đã được cấu hình trước khi xếp phòng.');
  const subjectCode=planType==='mandatory'?$('mandatory-subject')?.value||'TOAN':planType==='subject'?$('rooming-subject')?.value||'TOAN':null;
  let {data:candidates,error:roundCandidatesError}=await state.client.rpc('exam_get_round_candidates',{p_exam_id:examId,p_round_no:roundNo});
  if(roundCandidatesError)throw new Error(`Chưa thể nạp thí sinh đợt ${roundNo}: ${roundCandidatesError.message}`);
  state.candidates=candidates;
  if(!candidates?.length)throw new Error('Kỳ thi chưa có danh sách thí sinh.');
  if(planType==='subject'){
    const registrations=await selectAllPages(()=>state.client.from('exam_candidate_subjects').select('candidate_id,subject_code,subject_type').eq('exam_id',examId).eq('subject_code',subjectCode));
    const eligibleIds=new Set((registrations||[]).map(row=>String(row.candidate_id)));
    candidates=candidates.filter(candidate=>eligibleIds.has(String(candidate.id)));
    if(!candidates.length)throw new Error(`Chưa có học sinh đăng ký môn ${subjectName(subjectCode)} trong kỳ thi/đợt đang chọn.`);
  }
  const groupText=roomGroupText(examId);
  if(groupText!==null)validateGroupSbdSequence(candidates,groupText);
  const withoutSbd=candidates.filter(c=>!String(c.sbd||'').trim());
  const sbdValues=candidates.map(c=>String(c.sbd||'').trim()).filter(Boolean);
  if(withoutSbd.length&&planType!=='elective')throw new Error(`Còn ${withoutSbd.length} thí sinh chưa có SBD. Hãy xếp phòng tổ hợp và cấp SBD trước khi xếp phòng môn này.`);
  const invalidSbd=candidates.filter(c=>String(c.sbd||'').trim()&&!isValidSbd(c.sbd));
  if(invalidSbd.length){
    const examples=invalidSbd.slice(0,10).map(c=>`${c.student_code||c.id}: "${c.sbd}"`).join('; ');
    throw new Error(`Có ${invalidSbd.length} thí sinh có SBD không hợp lệ (SBD phải gồm đúng 6 hoặc 8 chữ số). Hãy sửa/cấp lại SBD trước khi xếp phòng. Ví dụ: ${examples}${invalidSbd.length>10?'…':''}`);
  }
  if(new Set(sbdValues).size!==sbdValues.length)throw new Error('Phát hiện SBD trùng trong kỳ thi. Hãy cấp lại SBD trước khi xếp phòng.');
  candidates.sort((a,b)=>String(a.sbd).localeCompare(String(b.sbd),'vi',{numeric:true}));
  if(!creatingNewPlan){
   const current=await findCurrentRoomingFinalization(examId,planType,subjectCode,roundNo);
   if(current){
    restoreSavedRooming(current.record,current.assignments,candidates,{
      examId,roundNo,planType,subjectCode,adjustmentMode,finalized:true,pool:null
    });
    const count=current.assignments.length,roomCount=current.record.room_count;
    message($('rooming-message'),`Đã khôi phục phân phòng chính thức từ CSDL: ${count} thí sinh tại ${roomCount} phòng. Hồ sơ này vẫn được giữ nguyên; bấm “Lập phương án mới” nếu cần lập phương án thay thế.`,'success');
    return;
   }
  }
  const requestedCapacity=Number($('room-capacity').value);if(!Number.isInteger(requestedCapacity)||requestedCapacity<1)throw new Error('Sức chứa phòng phải là số nguyên dương do người xếp phòng nhập.');
  const distributionMode=$('rooming-distribution-mode')?.value||'room';
  const sortMode=planType==='elective'&&withoutSbd.length?'abc':distributionMode==='class'?'class':'sbd';
  let sortedCandidates=[...candidates];
  if(roundNo===2){const roundOneIds=await findOfficialRoundCandidateIds(examId);sortedCandidates=sortedCandidates.filter(candidate=>!roundOneIds.has(String(candidate.id)));}
  // SBD đã phản ánh quy tắc sắp xếp được chọn ở bước cấp số; không sắp xếp lại ở bước xếp phòng.
  let result,invalid=[];
  if(planType==='mandatory'||planType==='subject'){
    if(planType==='subject'){
      result=optimizeMandatoryRooms(sortedCandidates,{capacity:Number($('room-capacity').value),roomPrefix:$('room-prefix').value||'M',firstRoomNumber:$('first-room-number').value,sortMode,subjectCode});
      if(!result.ok)throw new Error((result.errors||['Không tạo được phương án theo môn thi.']).join('\n'));
      state.preview={examId,roundNo,planType,subjectCode,adjustmentMode,pool:sortedCandidates,options:{capacity:Number($('room-capacity').value),roomPrefix:$('room-prefix').value||'M',firstRoomNumber:Number($('first-room-number').value),sortMode,previousExamId:null},result};
    } else {
    const otherMandatorySubject=subjectCode==='TOAN'?'VAN':'TOAN';
    const fixedSeatPlan=await findCurrentRoomingFinalization(examId,'mandatory',otherMandatorySubject,roundNo);
    if(fixedSeatPlan){
      const restored=restoreRoomingPlan(fixedSeatPlan.record.rooms,fixedSeatPlan.assignments,sortedCandidates,{
        planType,subjectCode,capacity:fixedSeatPlan.record.capacity
      });
      if(!restored.ok)throw new Error(`Không thể kế thừa vị trí cố định từ môn ${subjectName(otherMandatorySubject)}: ${restored.errors.join(' ')}`);
      result=restored.result;
      result.assignments=result.assignments.map(assignment=>({
        ...assignment,subject_code:subjectCode,subject_name:subjectName(subjectCode)
      }));
      result.rooms=result.rooms.map(room=>({
        ...room,subject_code:subjectCode,ca1_subject_codes:[subjectCode],
        ca1_subject_name:subjectName(subjectCode),ca2_subject_codes:[],ca2_subject_name:'—'
      }));
      const firstRoom=[...result.rooms].sort((a,b)=>Number(a.room_number)-Number(b.room_number))[0];
      const roomPrefix=String(firstRoom?.room_code||'').replace(/\d+$/,'')||'M';
      const firstRoomNumber=Number(firstRoom?.room_number)||1;
      $('room-capacity').value=Number(fixedSeatPlan.record.capacity);
      $('room-prefix').value=roomPrefix;
      $('first-room-number').value=firstRoomNumber;
      state.preview={
        examId,roundNo,planType,subjectCode,adjustmentMode,pool:sortedCandidates,
        options:{capacity:Number(fixedSeatPlan.record.capacity),roomPrefix,firstRoomNumber,sortMode,previousExamId:null,fixedSeats:true},
        result,assignmentsCreated:true,suggestionValid:true
      };
      renderRooming(result,planType);
      message($('rooming-message'),`Đã kế thừa nguyên vị trí phòng và chỗ ngồi theo SBD từ môn ${subjectName(otherMandatorySubject)}. Không thể thay đổi sĩ số hoặc thứ tự chỗ của riêng môn này.`,'success');
      return;
    }
    if(!creatingNewPlan){
      const snapshot=await findLatestRoomingSnapshot(examId,planType,subjectCode,roundNo);
      if(snapshot){
        restoreSavedRooming(snapshot,snapshot.assignments,candidates,{examId,roundNo,planType,subjectCode,adjustmentMode,finalized:false,pool:sortedCandidates});
        const matches=state.preview.assignmentRosterMatches;
        message($('rooming-message'),matches
          ?`Đã khôi phục phương án phân công đã lưu từ CSDL: ${snapshot.assignments.length} thí sinh tại ${snapshot.rooms.length} phòng. Có thể phân phòng chính thức.`
          :'Đã khôi phục hồ sơ đã lưu nhưng danh sách thí sinh hiện tại đã thay đổi. Hồ sơ được giữ nguyên và không thể chốt; bấm “Lập phương án mới” để tạo phương án phù hợp roster hiện tại.',
          matches?'success':'error');
        return;
      }
    }
    result=optimizeMandatoryRooms(sortedCandidates,{capacity:Number($('room-capacity').value),roomPrefix:$('room-prefix').value||'M',
      firstRoomNumber:$('first-room-number').value,sortMode,subjectCode});
    if(!result.ok)throw new Error((result.errors||['Không tạo được phương án môn bắt buộc.']).join('\n'));
    state.preview={examId,roundNo,planType,subjectCode,adjustmentMode,pool:sortedCandidates,options:{capacity:Number($('room-capacity').value),roomPrefix:$('room-prefix').value||'M',
      firstRoomNumber:Number($('first-room-number').value),sortMode,previousExamId:$('room-previous-exam')?.value||null},result};
    }
  }else{
    const savedSnapshot=creatingNewPlan?null:await findLatestRoomingSnapshot(examId,planType,null,roundNo);
    const regs=await selectAllPages(()=>state.client.from('exam_candidate_subjects')
      .select('candidate_id,subject_code,subject_order,subject_type').eq('exam_id',examId).eq('subject_type','elective').order('subject_order').order('candidate_id'));
    const byCandidate=new Map();
    for(const r of regs||[]){const id=String(r.candidate_id);if(!byCandidate.has(id))byCandidate.set(id,[]);byCandidate.get(id).push({code:String(r.subject_code||'').trim().toUpperCase(),order:Number(r.subject_order)})}
    const eligible=[];
    for(const c of sortedCandidates){
      const rows=byCandidate.get(String(c.id))||[],slot1=[...new Set(rows.filter(r=>r.order===1).map(r=>r.code).filter(Boolean))],slot2=[...new Set(rows.filter(r=>r.order===2).map(r=>r.code).filter(Boolean))];
      if(slot1.length!==1||slot2.length!==1||slot1[0]===slot2[0]){
        invalid.push({code:c.student_code||c.sbd||c.id,reason:!rows.length?'chưa đăng ký môn':slot1.length!==1||slot2.length!==1?'cần đúng 1 môn ở Môn 1 và 1 môn ở Môn 2':'hai môn đang trùng nhau'});continue;
      }
      eligible.push({...c,elective_subjects:[slot1[0],slot2[0]]});
    }
    if(!eligible.length&&!savedSnapshot)throw new Error(`Không có thí sinh đủ điều kiện xếp phòng môn lựa chọn. Tổng ${candidates.length}; ${invalid.length} chưa đủ hai môn khác nhau. Ví dụ: ${invalid.slice(0,10).map(x=>`${x.code} (${x.reason})`).join('; ')}${invalid.length>10?'…':''}`);
    if(savedSnapshot){
        restoreSavedRooming(savedSnapshot,savedSnapshot.assignments,candidates,{examId,roundNo,planType,subjectCode:null,adjustmentMode,finalized:false,pool:eligible});
        const matches=state.preview.assignmentRosterMatches;
        message($('rooming-message'),matches
          ?`Đã khôi phục phương án phân công đã lưu từ CSDL: ${savedSnapshot.assignments.length} thí sinh tại ${savedSnapshot.rooms.length} phòng. Có thể phân phòng chính thức.`
          :'Đã khôi phục hồ sơ đã lưu nhưng danh sách thí sinh hiện tại đã thay đổi. Hồ sơ được giữ nguyên và không thể chốt; bấm “Lập phương án mới” để tạo phương án phù hợp roster hiện tại.',
          matches?'success':'error');
        return;
    }
    if(!eligible.length)throw new Error(`Không có thí sinh đủ điều kiện xếp phòng môn lựa chọn. Tổng ${candidates.length}; ${invalid.length} chưa đủ hai môn khác nhau. Ví dụ: ${invalid.slice(0,10).map(x=>`${x.code} (${x.reason})`).join('; ')}${invalid.length>10?'…':''}`);
    result=optimizeElectiveRooms(eligible,{capacity:Number($('room-capacity').value),roomPrefix:$('room-prefix').value,
      firstRoomNumber:$('first-room-number').value,sortMode});
    if(!result.ok)throw new Error((result.errors||['Không tạo được phương án xếp phòng.']).join('\n'));
    state.preview={examId,roundNo,planType,adjustmentMode,pool:eligible,options:{capacity:Number($('room-capacity').value),roomPrefix:$('room-prefix').value,
      firstRoomNumber:Number($('first-room-number').value),sortMode,previousExamId:$('room-previous-exam')?.value||null},result};
  }
  const preview=state.preview;
  preview.suggestedAssignments=result.assignments.map(assignment=>({...assignment}));
  preview.suggestedRoomCounts=result.rooms.map(room=>({room_code:room.room_code,student_count:room.student_count}));
  preview.assignmentsCreated=false;
  preview.suggestionValid=true;
  renderRooming(result,planType);
  const warning=invalid.length?` Đã loại khỏi phương án ${invalid.length} thí sinh chưa đủ hai môn: ${invalid.slice(0,8).map(x=>`${x.code} (${x.reason})`).join('; ')}${invalid.length>8?'…':''}.`:'';
  const note=planType==='mandatory'
    ?`Đã lập phương án sĩ số môn ${$('mandatory-subject').selectedOptions[0]?.text||''}: ${preview.pool.length} thí sinh tại ${result.summary.room_count} phòng. Chưa gán thí sinh vào phòng.`
    :`Đã lập phương án sĩ số môn lựa chọn: ${preview.pool.length} thí sinh tại ${result.summary.room_count} phòng. Chưa gán thí sinh vào phòng.`;
  message($('rooming-message'),note+warning,invalid.length?'error':'success');
  state.preview.saved=null;state.preview.finalized=null;
  updateRoomingActions();$('export-rooming').disabled=true;$('print-rooming-pdf').disabled=true;
 }catch(e){state.preview=null;clearRoomingPreview();message($('rooming-message'),e.message||String(e),'error')}
 finally{
  previewButton.disabled=false;
  previewButton.textContent=state.preview?.restoredFromDatabase?'Lập phương án mới':'Xem trước phương án phòng';
 }
}
function clearRoomingPreview(){
 $('rooming-summary').innerHTML='';
 $('room-plan-status').textContent='Chưa lập phương án phòng.';
 const mandatory=['mandatory','subject'].includes($('room-plan-type')?.value);
 const roomHead=$('rooming-table-body')?.closest('table')?.querySelector('thead');
 if(roomHead)roomHead.innerHTML=mandatory
  ?'<tr><th>STT</th><th>Phòng</th><th>Sĩ số dự kiến / thực tế</th><th>SBD đầu–cuối</th><th>Thao tác</th></tr>'
  :'<tr><th>STT</th><th>Phòng</th><th>Sĩ số dự kiến / thực tế</th><th>Ca 1 (các môn)</th><th>Ca 2 (các môn)</th><th>SBD đầu–cuối</th><th>Thao tác</th></tr>';
 $('private-room-controls')?.classList.add('hidden');
 const assignmentHead=$('assignment-table-body')?.closest('table')?.querySelector('thead');
 if(assignmentHead)assignmentHead.innerHTML=mandatory
  ?'<tr><th>SBD</th><th>Họ tên</th><th>Lớp</th><th>Phòng</th><th>Vị trí cố định</th></tr>'
  :'<tr><th>SBD</th><th>Họ tên</th><th>Lớp</th><th>Phòng</th><th>Ca 1</th><th>Ca 2</th></tr>';
 $('rooming-table-body').innerHTML=`<tr><td colspan="${mandatory?5:7}" class="empty">Chưa có phương án.</td></tr>`;
 $('assignment-table-body').innerHTML=`<tr><td colspan="${mandatory?5:6}" class="empty">Chưa có phân công.</td></tr>`;
 ['room-capacity','room-prefix','first-room-number'].forEach(id=>$(id).disabled=false);
 updateRoomingActions();
}
function renderRooming(result,planType='elective'){
 const preview=state.preview;
 const grouped=preview&&roomGroupText(preview.examId)!==null;
 ['room-capacity','room-prefix','first-room-number'].forEach(id=>$(id).disabled=Boolean(preview?.options.fixedSeats));
 if(preview?.assignmentsCreated)syncRoomingResult(result,planType);
 else if(preview){
  result.summary.candidate_count=preview.pool.length;
  result.summary.room_count=result.rooms.length;
  result.summary.full_rooms=result.rooms.filter(room=>room.student_count===room.capacity).length;
  result.summary.partial_rooms=result.rooms.filter(room=>room.student_count<room.capacity).length;
 }
 $('rooming-summary').innerHTML=[['Thí sinh',result.summary.candidate_count],['Số phòng',result.summary.room_count],
 ['Phòng đủ sĩ số',result.summary.full_rooms??'—'],['Phòng chưa đủ sĩ số',result.summary.partial_rooms??'—'],
 ['Lượt môn trong phòng',preview&&!preview.assignmentsCreated?'Đề xuất':result.summary.subject_count??'—']].map(([l,v])=>`<div class="metric"><span>${l}</span><strong>${v}</strong></div>`).join('');
 const th=$('rooming-table-body')?.closest('table')?.querySelector('thead');
 if(th)th.innerHTML=['mandatory','subject'].includes(planType)
  ?'<tr><th>STT</th><th>Phòng</th><th>Sĩ số dự kiến / thực tế</th><th>SBD đầu–cuối</th><th>Thao tác</th></tr>'
  :'<tr><th>STT</th><th>Phòng</th><th>Sĩ số dự kiến / thực tế</th><th>Ca 1 (các môn)</th><th>Ca 2 (các môn)</th><th>SBD đầu–cuối</th><th>Thao tác</th></tr>';
 $('rooming-table-body').innerHTML=result.rooms.map((r,i)=>{
  const count=`<input class="room-count-input" type="number" min="1" step="1" value="${r.student_count}" data-room-count="${esc(r.room_code)}" aria-label="Sĩ số phòng ${esc(r.room_code)}" ${r.is_private||preview?.finalized||preview?.saving||preview?.finalizing||preview?.options.fixedSeats?'disabled':''}> / ${r.capacity}`;
 const subjects=['mandatory','subject'].includes(planType)?'':`<td>${esc(r.ca1_subject_name||'Chưa gán')}</td><td>${esc(r.ca2_subject_name||'Chưa gán')}</td>`;
  const sbd=preview?.assignmentsCreated?`${esc(r.sbd_first)} – ${esc(r.sbd_last)}`
   :preview?.suggestionValid===false?'Chưa khớp sĩ số — cần điều chỉnh':preview?`Dự kiến: ${esc(r.sbd_first)} – ${esc(r.sbd_last)}`:'Chưa gán';
  const actions=preview?.assignmentsCreated?'':`<button class="small-btn" type="button" data-remove-room="${esc(r.room_code)}" ${result.rooms.length<=1||preview?.saving?'disabled':''}>Xóa phòng</button>`;
  const edit=grouped&&!preview.assignmentsCreated&&!preview.options.fixedSeats&&!preview.saving&&!preview.finalizing?`<button class="small-btn" type="button" data-edit-free-room="${esc(r.room_code)}">Sửa phòng</button> `:'';
  return `<tr><td>${i+1}</td><td><b>${esc(r.room_code)}</b>${r.is_private?'<br><small>Phòng riêng</small>':''}${grouped&&r.group_index!=null?`<br><small>Nhóm ${r.group_index+1}</small>`:''}</td><td>${count}</td>${subjects}<td>${sbd}</td><td>${edit}${actions}</td></tr>`;
 }).join('');
 $('add-room-plan').disabled=!preview||preview.assignmentsCreated||preview.finalized||preview.saving||preview.finalizing;
 const privateEditable=Boolean($('private-room-controls')&&$('private-room-target')&&preview&&!preview.finalized&&!preview.saving&&!preview.finalizing&&!preview.options.fixedSeats);
 $('private-room-controls')?.classList.toggle('hidden',!privateEditable);
 if($('private-room-target'))$('private-room-target').innerHTML=result.rooms.filter(r=>r.is_private).map(r=>'<option value="'+esc(r.room_code)+'">'+esc(r.room_code)+'</option>').join('');
 const assignmentHead=$('assignment-table-body')?.closest('table')?.querySelector('thead');
 if(assignmentHead)assignmentHead.innerHTML=['mandatory','subject'].includes(planType)
  ?`<tr><th>SBD</th><th>Họ tên</th><th>Ngày sinh</th><th>Mã học sinh</th><th>Lớp</th><th>Phòng</th><th>Vị trí cố định</th>${preview?.adjustmentMode==='manual'&&!preview?.finalized?'<th>Điều chỉnh</th>':''}</tr>`
  :`<tr><th>SBD</th><th>Họ tên</th><th>Ngày sinh</th><th>Mã học sinh</th><th>Lớp</th><th>Phòng</th><th>Ca 1</th><th>Ca 2</th>${preview?.adjustmentMode==='manual'&&!preview?.finalized?'<th>Điều chỉnh</th>':''}</tr>`;
 const seatNumbers=new Map();
 if(['mandatory','subject'].includes(planType)){
  for(const room of result.rooms){
   result.assignments.filter(assignment=>assignment.room_code===room.room_code)
    .sort((a,b)=>String(a.sbd).localeCompare(String(b.sbd),'vi',{numeric:true}))
    .forEach((assignment,index)=>seatNumbers.set(String(assignment.candidate_id),index+1));
  }
 }
 const manualEditing=preview?.adjustmentMode==='manual'&&!preview?.finalized&&!preview?.saving&&!preview?.finalizing;
 const roomPicker=manualEditing?assignment=>`<span class="rooming-drag-handle" title="Kéo để đổi thứ tự" aria-hidden="true">↕</span><select data-room-assignment="${esc(assignment.candidate_id)}" aria-label="Phòng của ${esc(assignment.student_name)}">${result.rooms.map(room=>`<option value="${esc(room.room_code)}" ${room.room_code===assignment.room_code?'selected':''}>${esc(room.room_code)}</option>`).join('')}</select>`:'';
 const identities=new Map([...(preview?.pool||[]),...(state.candidates||[])].map(c=>[poolCandidateId(c),c]));
 const identityCells=a=>{const c=identities.get(String(a.candidate_id))||a;return `<td>${esc(normalizedDOB(c.date_of_birth||a.date_of_birth)||'Chưa có')}</td><td>${esc(c.student_code||a.student_code||'')}</td>`};
 $('assignment-table-body').innerHTML=result.assignments.length?result.assignments.map(a=>['mandatory','subject'].includes(planType)
  ?`<tr data-assignment-row="${esc(a.candidate_id)}" ${manualEditing?'draggable="true"':''}><td>${esc(a.sbd)}</td><td>${esc(a.student_name)}</td>${identityCells(a)}<td>${esc(a.class_code)}</td><td>${esc(a.room_code)}</td><td>${a.seat_number??seatNumbers.get(String(a.candidate_id))??''}</td>${roomPicker?`<td>${roomPicker(a)}</td>`:''}</tr>`
  :`<tr data-assignment-row="${esc(a.candidate_id)}" ${manualEditing?'draggable="true"':''}><td>${esc(a.sbd)}</td><td>${esc(a.student_name)}</td>${identityCells(a)}<td>${esc(a.class_code)}</td><td>${esc(a.room_code)}</td><td>${esc(subjectName(a.ca1_subject_code))}</td><td>${esc(subjectName(a.ca2_subject_code))}</td>${roomPicker?`<td>${roomPicker(a)}</td>`:''}</tr>`).join('')
  :`<tr><td colspan="${planType==='mandatory'?5:6}" class="empty">Chưa gán thí sinh. Điều chỉnh sĩ số phòng rồi bấm “Lưu phân bổ phòng”.</td></tr>`;
 if(privateEditable){assignmentHead.querySelector('tr').insertAdjacentHTML('afterbegin','<th><input type="checkbox" id="private-select-all" aria-label="Chọn tất cả học sinh"></th>');
 for(const row of $('assignment-table-body').querySelectorAll('[data-assignment-row]'))row.insertAdjacentHTML('afterbegin','<td><input type="checkbox" data-private-candidate="'+esc(row.dataset.assignmentRow)+'" aria-label="Chọn học sinh"></td>');
 $('private-select-all').onchange=event=>$('assignment-table-body').querySelectorAll('[data-private-candidate]').forEach(box=>box.checked=event.target.checked);}
 const planned=preview?.result.rooms.reduce((sum,room)=>sum+Number(room.student_count||0),0)||0;
 $('room-plan-status').textContent=preview
  ?preview.restoredFromDatabase
   ?`${preview.finalized?'Đã khôi phục phân phòng chính thức':'Đã khôi phục phương án đã lưu'} từ CSDL · ${preview.result.assignments.length} thí sinh · ${preview.result.rooms.length} phòng${preview.assignmentRosterMatches?'':' · roster đã thay đổi, không thể chốt hồ sơ này'}`
   :`Tổng sĩ số dự kiến ${planned}/${preview.pool.length} thí sinh đủ điều kiện${preview.assignmentsCreated?' · Đã gán theo phương án':preview.suggestionValid===false?' · Danh sách bên dưới là gợi ý gần nhất, chưa khớp sĩ số vừa chỉnh':' · Danh sách và môn dưới đây là phương án gợi ý; sĩ số phòng cuối tự cân đối khi điều chỉnh'}`
  :'Chưa lập phương án phòng.';
 updateRoomingActions();
}
function syncRoomingResult(result,planType){
 const assignments=result.assignments;
 for(const room of result.rooms){
  const members=assignments.filter(a=>a.room_code===room.room_code);
  const sbds=members.map(a=>String(a.sbd||'')).filter(Boolean).sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  room.student_count=members.length;room.candidate_ids=members.map(a=>a.candidate_id);
  room.sbd_first=sbds[0]||'';room.sbd_last=sbds[sbds.length-1]||'';
  if(planType==='elective'){
   room.ca1_subject_codes=[...new Set(members.map(a=>a.ca1_subject_code).filter(Boolean))].sort();
   room.ca2_subject_codes=[...new Set(members.map(a=>a.ca2_subject_code).filter(Boolean))].sort();
   room.ca1_subject_name=room.ca1_subject_codes.map(subjectName).join(', ');
   room.ca2_subject_name=room.ca2_subject_codes.map(subjectName).join(', ')||'—';
  }
 }
 const occupiedRooms=result.rooms.filter(room=>room.student_count>0);
 result.summary.candidate_count=assignments.length;
 result.summary.room_count=occupiedRooms.length;
 result.summary.full_rooms=occupiedRooms.filter(r=>r.student_count===r.capacity).length;
 result.summary.partial_rooms=occupiedRooms.filter(r=>r.student_count<r.capacity).length;
 if(planType==='elective')result.summary.subject_count=result.rooms.reduce((sum,r)=>sum+r.ca1_subject_codes.length+r.ca2_subject_codes.length,0);
}
function rebuildRoomingFromAssignments(preview){
 const assignments=preview.result.assignments||[],byRoom=new Map(preview.result.rooms.map(room=>[room.room_code,{...room,student_count:0,candidate_ids:[],ca1_subject_codes:[],ca2_subject_codes:[]}]))
 for(const assignment of assignments){
  const room=byRoom.get(String(assignment.room_code));if(!room)continue;
  room.student_count++;room.candidate_ids.push(assignment.candidate_id);
  if(preview.planType==='elective'){if(assignment.ca1_subject_code&&!room.ca1_subject_codes.includes(assignment.ca1_subject_code))room.ca1_subject_codes.push(assignment.ca1_subject_code);if(assignment.ca2_subject_code&&!room.ca2_subject_codes.includes(assignment.ca2_subject_code))room.ca2_subject_codes.push(assignment.ca2_subject_code)}
 }
 preview.result.rooms=[...byRoom.values()].map(room=>({...room,ca1_subject_codes:room.ca1_subject_codes.sort(),ca2_subject_codes:room.ca2_subject_codes.sort(),ca1_subject_name:room.ca1_subject_codes.map(subjectName).join(', '),ca2_subject_name:room.ca2_subject_codes.map(subjectName).join(', ')||'—'}));
 syncRoomingResult(preview.result,preview.planType);
 renumberRoomingAssignments(preview);
}
function renumberRoomingAssignments(preview){
 const roomOrder=new Map((preview.result.rooms||[]).map((room,index)=>[room.room_code,index]));
 const nextByRoom=new Map();
 for(const assignment of preview.result.assignments||[]){
  const next=(nextByRoom.get(assignment.room_code)||0)+1;
  nextByRoom.set(assignment.room_code,next);
  assignment.seat_number=next;
 }
 preview.result.assignments.sort((a,b)=>(roomOrder.get(a.room_code)??9999)-(roomOrder.get(b.room_code)??9999)||Number(a.seat_number)-Number(b.seat_number));
}

function roomGroupText(examId){
 if(isSubjectExam(examId))return null;
 if($('sbd-groups')?.dataset.examId===examId)return $('sbd-groups').value;
 try{return localStorage.getItem('sbd-groups:'+examId)||''}catch{return ''}
}
function optimizeMandatoryRooms(candidates,options){
 const text=roomGroupText($('rooming-exam-select').value);
 return text===null?baseMandatoryRooms(candidates,options):optimizeByGroups(candidates,options,text,baseMandatoryRooms);
}
function optimizeElectiveRooms(candidates,options){
 const text=roomGroupText($('rooming-exam-select').value);
 return text===null?baseElectiveRooms(candidates,options):optimizeByGroups(candidates,options,text,baseElectiveRooms);
}
function allocateCandidatesToRoomPlan(candidates,rooms,options){
 const text=roomGroupText(state.preview?.examId||$('rooming-exam-select').value);
 return text===null?baseAllocateRooms(candidates,rooms,options):allocateByGroups(candidates,rooms,options,text,baseAllocateRooms);
}

function validateRoomingPlan(preview){
 if(!preview)return {ok:false,errors:['Chưa có phương án xếp phòng.']};
 const errors=[],rooms=preview.result.rooms||[],assignments=preview.result.assignments||[],poolIds=new Set((preview.pool||[]).map(poolCandidateId)),roomMap=new Map();
 const groupText=roomGroupText(preview.examId);
 if(groupText!==null){try{
  const actual=validateRoomGroups(assignments.filter(a=>!rooms.some(r=>r.room_code===a.room_code&&r.is_private)),preview.pool||[],groupText);
  validateGroupSbdSequence(preview.pool||[],groupText);
  let previous=-1;
  for(const room of rooms){if(room.is_private)continue;const group=actual.get(room.room_code);if(group===undefined)continue;if(group<previous||(room.group_index!=null&&room.group_index!==group))throw new Error(`Phòng ${room.room_code} không đúng thứ tự/nhóm đã chọn. Hãy xếp hết nhóm trước rồi đến nhóm sau.`);previous=group}
 }catch(e){errors.push(e.message)}}
 if(!rooms.length)errors.push('Phương án chưa có phòng.');
 for(const room of rooms){const count=Number(room.student_count);if(!room.room_code||roomMap.has(room.room_code))errors.push(`Mã phòng ${room.room_code||'(trống)'} bị trùng hoặc trống.`);if(!Number.isInteger(count)||count<1)errors.push(`Sĩ số phòng ${room.room_code||'(trống)'} phải là số nguyên dương.`);if(Number.isInteger(preview.options.capacity)&&count>preview.options.capacity)errors.push(`Phòng ${room.room_code} vượt sĩ số nhập là ${preview.options.capacity}.`);roomMap.set(room.room_code,room)}
 const seen=new Set(),countByRoom=new Map();
 for(const assignment of assignments){const id=String(assignment.candidate_id||'');if(!poolIds.has(id))errors.push(`Thí sinh ${assignment.student_code||assignment.sbd||id} không thuộc danh sách đợt này.`);if(seen.has(id))errors.push(`Thí sinh ${assignment.student_code||assignment.sbd||id} bị xếp trùng phòng.`);seen.add(id);const room=roomMap.get(assignment.room_code);if(!room)errors.push(`Thí sinh ${assignment.student_code||assignment.sbd||id} chưa có phòng hợp lệ.`);countByRoom.set(assignment.room_code,(countByRoom.get(assignment.room_code)||0)+1);
  if(['mandatory','subject'].includes(preview.planType)){if(String(assignment.subject_code||'').toUpperCase()!==String(preview.subjectCode||'').toUpperCase())errors.push(`Thí sinh ${assignment.student_code||assignment.sbd||id} không khớp môn bắt buộc.`)}else{const candidate=(preview.pool||[]).find(item=>poolCandidateId(item)===id),registered=new Set((candidate?.elective_subjects||[]).map(subject=>String(subject?.code ?? subject ?? '').trim().toUpperCase()).filter(Boolean)),c1=String(assignment.ca1_subject_code||'').trim().toUpperCase(),c2=String(assignment.ca2_subject_code||'').trim().toUpperCase();if(!c1||!c2||c1===c2||!registered.has(c1)||!registered.has(c2))errors.push(`Cặp môn của thí sinh ${assignment.student_code||assignment.sbd||id} không khớp đăng ký.`)}
 }
 if(seen.size!==(preview.pool||[]).length)errors.push(`Đã phân ${seen.size}/${(preview.pool||[]).length} thí sinh; còn thiếu ${Math.max(0,(preview.pool||[]).length-seen.size)} thí sinh.`);
 for(const room of rooms){const actual=countByRoom.get(room.room_code)||0;if(actual!==Number(room.student_count))errors.push(`Phòng ${room.room_code} khai báo ${room.student_count} nhưng thực tế có ${actual} thí sinh.`);if(preview.planType==='elective'){const c1=new Set(assignments.filter(a=>a.room_code===room.room_code).map(a=>a.ca1_subject_code).filter(Boolean)),c2=new Set(assignments.filter(a=>a.room_code===room.room_code).map(a=>a.ca2_subject_code).filter(Boolean));for(const code of c1)if(c2.has(code))errors.push(`Môn ${subjectName(code)} đang xuất hiện ở cả Ca 1 và Ca 2 trong phòng ${room.room_code}.`)}}
 return {ok:errors.length===0,errors:[...new Set(errors)]};
}
function updateRoomingActions(){
 const preview=state.preview;
 const planned=(preview?.result.rooms||[]).reduce((sum,room)=>sum+Number(room.student_count||0),0);
 const total=preview?.pool?.length||0;
 const assigned=Boolean(preview?.assignmentsCreated);
 const planMatchesRoster=Boolean(preview&&planned===total&&preview.result.rooms.every(room=>room.student_count>=1&&room.student_count<=room.capacity));
 const assignmentsMatchRoster=!assigned||(preview.result.assignments.length===total&&
  new Set(preview.result.assignments.map(assignment=>String(assignment.candidate_id))).size===total&&
  preview.pool.every(candidate=>preview.result.assignments.some(assignment=>String(assignment.candidate_id)===poolCandidateId(candidate))));
 const saved=Boolean(preview?.saved),finalized=Boolean(preview?.finalized);
 // Keep the action enabled so manual users can click it and see the complete
 // validation report. saveRooming() validates again before calling the RPC.
 $('save-rooming').disabled=!preview||!planMatchesRoster||!assignmentsMatchRoster||preview?.assignmentRosterMatches===false||saved||finalized||preview?.saving||preview?.finalizing;
 $('lock-rooming').disabled=!preview||!saved||!assigned||!assignmentsMatchRoster||preview?.result.assignments.some(row=>!isValidSbd(row.sbd))||preview?.assignmentRosterMatches===false||finalized||preview?.finalizing;
 $('lock-rooming').textContent=finalized?'Đã phân phòng chính thức':'Phân phòng chính thức';
 $('export-rooming').disabled=!finalized;
 $('print-rooming-pdf').disabled=!finalized;
 $('add-room-plan').disabled=!preview||assigned||finalized||preview?.saving||preview?.finalizing;
}
async function changePrivateRoom(action){
 const preview=state.preview;if(!preview||preview.finalized||preview.saving||preview.finalizing||preview.options.fixedSeats)return;
 try{
  const selectedIds=[...$('assignment-table-body').querySelectorAll('[data-private-candidate]:checked')].map(box=>box.dataset.privateCandidate);
  if(preview.pool.some(c=>!isValidSbd(c.sbd)))throw new Error('Hãy cấp SBD theo nhóm trước khi tách phòng riêng. Với môn lựa chọn: lưu phòng tổ hợp, cấp SBD, rồi tải lại phương án để tách phòng.');
  if(action!=='redistribute'&&!selectedIds.length)throw new Error('Hãy chọn học sinh trong danh sách phân bổ.');
  const roomCode=action==='create'?$('private-room-name').value.trim():action==='add'?$('private-room-target').value:undefined;
  if((action==='create'||action==='add')&&!roomCode)throw new Error('Hãy nhập tên hoặc chọn phòng riêng.');
  let redistributePrivateRooms;
  try{({redistributePrivateRooms}=await import('./private-rooming.js?v=159'))}
  catch(error){throw new Error('Không tải được chức năng phòng riêng. Hãy cập nhật js/private-rooming.js, js/group-rooming.js và js/rooming.js cùng bộ website, rồi tải lại bằng Ctrl+Shift+R. '+(error.message||String(error)))}
  if(state.preview!==preview||preview.finalized||preview.saving||preview.finalizing)return;
  const result=redistributePrivateRooms(preview,roomGroupText(preview.examId),{selectedIds,roomCode,release:action==='release'});
  preview.options.regularCapacity??=preview.options.capacity;
  preview.result=result;preview.options.capacity=result.rooms[0]?.capacity||preview.options.capacity;
  preview.adjustmentMode='manual';$('rooming-adjustment-mode').value='manual';
  preview.assignmentsCreated=true;preview.saved=null;preview.sourcePlanId=null;preview.suggestionValid=true;
  rebuildRoomingFromAssignments(preview);preview.suggestedAssignments=result.assignments.map(a=>({...a}));
  renderRooming(result,preview.planType);
  message($('rooming-message'),'Đã cập nhật phòng riêng và phân bổ lại các học sinh còn lại. SBD được giữ nguyên. Hãy kiểm tra và lưu.','success');
 }catch(error){message($('rooming-message'),error.message,'error')}
}
function poolCandidateId(candidate){return String(candidate?.id??candidate?.candidate_id??'')}
function invalidateRoomAssignments(preview){
 preview.assignmentsCreated=false;preview.saved=null;preview.finalized=null;preview.sourcePlanId=null;
 preview.suggestionValid=false;
}
function refreshSuggestedRoomAssignments(preview){
 const plan=preview.result.rooms.map(({room_code,room_number,student_count,capacity,group_index})=>
  ({room_code,room_number,student_count,capacity,group_index}));
 const allocation=allocateCandidatesToRoomPlan(preview.pool,plan,{
  capacity:preview.options.capacity,planType:preview.planType,subjectCode:preview.subjectCode,
  suggestedAssignments:preview.suggestedAssignments
 });
 if(!allocation.ok)return allocation;
 preview.result={...preview.result,...allocation};
 preview.suggestedAssignments=allocation.assignments.map(assignment=>({...assignment}));
 preview.suggestionValid=true;
 return allocation;
}
function openFreeRoom(code){
 const preview=state.preview;
 if(!preview||preview.assignmentsCreated||preview.finalized||preview.options.fixedSeats)return;
 const map=groupClassMap(roomGroupText(preview.examId)),groups=new Map();
 for(const [cls,index] of map){if(!groups.has(index))groups.set(index,[]);groups.get(index).push(cls)}
 $('free-room-group').innerHTML=[...groups].map(([index,classes])=>`<option value="${index}">Nhóm ${index+1}: ${esc(classes.join(', '))}</option>`).join('');
 const room=preview.result.rooms.find(r=>r.room_code===code);
 $('free-room-old-code').value=room?.room_code||'';
 $('free-room-name').value=room?.room_code||'';
 $('free-room-count').value=room?.student_count||1;
 $('free-room-group').value=String(room?.group_index??0);
 $('free-room-error').classList.add('hidden');$('free-room-dialog').showModal();
}
function applyFreeRoomChange(change){
 const preview=state.preview;if(!preview||preview.assignmentsCreated||preview.options.fixedSeats)return false;
 try{
  preview.result.rooms=editFreeRoom(preview.result.rooms,change);
  preview.options.capacity=Math.max(...preview.result.rooms.map(r=>r.student_count));
  invalidateRoomAssignments(preview);
  const allocation=refreshSuggestedRoomAssignments(preview);
  renderRooming(preview.result,preview.planType);
  message($('rooming-message'),allocation.ok?'Đã cập nhật phòng và danh sách SBD theo nhóm.':'Đã giữ bản nháp phòng. Cần sửa sĩ số từng nhóm trước khi lưu: '+allocation.errors.join(' '),allocation.ok?'success':'info');
  return true;
 }catch(e){message($('free-room-error'),e.message,'error');message($('rooming-message'),e.message,'error');renderRooming(preview.result,preview.planType);return false}
}
async function updateRoomPlanCount(event){
 const input=event.target.closest('[data-room-count]'),preview=state.preview;
 if(!input||!preview||preview.finalized||preview.saving||preview.finalizing||preview.options.fixedSeats)return;
 if(preview.result.assignments.length&&preview.suggestionValid!==false){
  const code=input.dataset.roomCount,count=Number(input.value),target=preview.result.rooms.find(r=>r.room_code===code);
  if(!target||count===Number(target.student_count))return;
  preview.saving=true;updateRoomingActions();input.disabled=true;
  try{
   const {cascadeRoomCount}=await import('./rooming.js?v=161');
   if(state.preview!==preview)return;
   const text=roomGroupText(preview.examId);
   const normal=preview.result.assignments.filter(a=>!preview.result.rooms.some(r=>r.room_code===a.room_code&&r.is_private));
   const groups=text===null?null:validateRoomGroups(normal,preview.pool,text);
   const current={...preview.result,rooms:preview.result.rooms.map(r=>({...r,group_index:r.is_private?r.group_index:groups?.get(r.room_code)??r.group_index??0}))};
   const result=cascadeRoomCount(current,code,count);
   preview.result=result;preview.options.capacity=result.rooms[0]?.capacity||preview.options.capacity;
   preview.assignmentsCreated=true;preview.adjustmentMode='manual';$('rooming-adjustment-mode').value='manual';
   preview.saved=null;preview.sourcePlanId=null;preview.restoredFromDatabase=false;preview.suggestionValid=true;
   syncRoomingResult(result,preview.planType);
   preview.suggestedAssignments=result.assignments.map(a=>({...a}));
   message($('rooming-message'),'Đã điều chỉnh lũy tiến đến cuối nhóm, giữ nguyên SBD và phòng riêng. Kiểm tra danh sách rồi lưu phân bổ trước khi chốt.','success');
  }catch(error){message($('rooming-message'),error.message||String(error),'error')}
  finally{preview.saving=false;if(state.preview===preview)renderRooming(preview.result,preview.planType)}
  return;
 }
 if(roomGroupText(preview.examId)!==null){
  const room=preview.result.rooms.find(r=>r.room_code===input.dataset.roomCount);
  applyFreeRoomChange({oldCode:room.room_code,code:room.room_code,count:input.value,groupIndex:room.group_index});return;
 }
 const adjusted=adjustRoomPlanCount(preview.result.rooms,input.dataset.roomCount,input.value);
 if(!adjusted.ok){
  message($('rooming-message'),(adjusted.errors||['Không thể điều chỉnh sĩ số phòng.']).join('\n'),'error');
  renderRooming(preview.result,preview.planType);return;
 }
 preview.result.rooms=adjusted.rooms;
 invalidateRoomAssignments(preview);
 const allocation=refreshSuggestedRoomAssignments(preview);
 renderRooming(preview.result,preview.planType);
 if(!allocation.ok)message($('rooming-message'),(allocation.errors||['Không thể cập nhật danh sách gợi ý theo sĩ số đã chỉnh.']).join('\n'),'error');
 else message($('rooming-message'),'Đã cập nhật danh sách thí sinh và môn dự kiến theo sĩ số phòng mới.','success');
}
function addRoomToPlan(){
 const preview=state.preview;if(!preview||preview.assignmentsCreated)return;
 if(roomGroupText(preview.examId)!==null){openFreeRoom();return}
 const roomNumber=Math.max(preview.options.firstRoomNumber-1,...preview.result.rooms.map(room=>Number(room.room_number)||0))+1;
 const roomCode=`${preview.options.roomPrefix}${String(roomNumber).padStart(2,'0')}`;
 if(preview.result.rooms.some(room=>room.room_code===roomCode)){
  message($('rooming-message'),`Mã phòng ${roomCode} đã tồn tại. Hãy đổi tiền tố hoặc số phòng bắt đầu.`,'error');return;
 }
 const donor=[...preview.result.rooms].sort((a,b)=>b.student_count-a.student_count)
  .find(room=>room.student_count>1);
 if(!donor){message($('rooming-message'),'Không thể thêm phòng vì mỗi phòng hiện đã có sĩ số tối thiểu. Hãy giảm sĩ số phòng trước rồi thử lại.','error');return}
 donor.student_count--;
 preview.result.rooms.push({room_number:roomNumber,room_code:roomCode,student_count:1,
  capacity:preview.options.capacity,subject_code:preview.subjectCode,subject_name:subjectName(preview.subjectCode),
  ca1_subject_codes:[],ca2_subject_codes:[],ca1_subject_name:'Chưa gán',ca2_subject_name:'Chưa gán',
  sbd_first:'',sbd_last:'',candidate_ids:[]});
 invalidateRoomAssignments(preview);
 const allocation=refreshSuggestedRoomAssignments(preview);
 renderRooming(preview.result,preview.planType);
 if(!allocation.ok)message($('rooming-message'),(allocation.errors||['Không thể cập nhật danh sách gợi ý theo phòng mới.']).join('\n'),'error');
 else message($('rooming-message'),'Đã cập nhật danh sách gợi ý theo phương án có phòng mới.','success');
}
function removeRoomFromPlan(roomCode){
 const preview=state.preview;if(!preview||preview.assignmentsCreated||preview.options.fixedSeats||preview.result.rooms.length<=1)return;
 const removed=preview.result.rooms.find(room=>room.room_code===roomCode);
 if(!removed)return;
 if(roomGroupText(preview.examId)!==null){
  preview.result.rooms=preview.result.rooms.filter(r=>r.room_code!==roomCode);
  invalidateRoomAssignments(preview);const allocation=refreshSuggestedRoomAssignments(preview);
  renderRooming(preview.result,preview.planType);
  if(!allocation.ok)message($('rooming-message'),'Đã xóa phòng. Hãy sửa/thêm phòng để đủ sĩ số riêng từng nhóm: '+allocation.errors.join(' '),'info');return;
 }
 const remaining=preview.result.rooms.filter(room=>room.room_code!==roomCode).map(room=>({...room}));
 let excess=Number(removed.student_count);
 for(const room of [...remaining].reverse()){
  const free=room.capacity-room.student_count,added=Math.min(free,excess);
  room.student_count+=added;excess-=added;
  if(!excess)break;
 }
 if(excess){
  message($('rooming-message'),'Không thể xóa phòng vì các phòng còn lại đã đủ sức chứa. Hãy điều chỉnh sĩ số trước.','error');return;
 }
 preview.result.rooms=remaining;
 invalidateRoomAssignments(preview);
 const allocation=refreshSuggestedRoomAssignments(preview);
 renderRooming(preview.result,preview.planType);
 if(!allocation.ok)message($('rooming-message'),(allocation.errors||['Không thể cập nhật danh sách gợi ý sau khi xóa phòng.']).join('\n'),'error');
 else message($('rooming-message'),'Đã cập nhật danh sách gợi ý sau khi xóa phòng.','success');
}
function assignRoomingCandidates(){
 const preview=state.preview;if(!preview)return false;
 if(preview.assignmentsCreated)return true;
 const plan=preview.result.rooms.map(({room_code,room_number,student_count,capacity,group_index})=>
  ({room_code,room_number,student_count,capacity,group_index}));
 const result=allocateCandidatesToRoomPlan(preview.pool,plan,{
  capacity:preview.options.capacity,planType:preview.planType,subjectCode:preview.subjectCode,
  suggestedAssignments:preview.suggestedAssignments
 });
 if(!result.ok){message($('rooming-message'),(result.errors||['Không thể gán thí sinh theo sĩ số phòng đã định.']).join('\n'),'error');return false}
 preview.result={...preview.result,...result};
 preview.assignmentsCreated=true;preview.saved=null;preview.finalized=null;preview.sourcePlanId=null;
 renderRooming(preview.result,preview.planType);
 return true;
}
async function saveRooming(){
 if(!state.preview){message($('rooming-message'),'Hãy tạo phương án xem trước trước.','error');return}
 if(state.preview.adjustmentMode==='manual'){
  const validation=validateRoomingPlan(state.preview);
  if(!validation.ok){message($('rooming-message'),`Chưa thể lưu phương án thủ công:\n${validation.errors.join('\n')}`,'error');return}
  state.preview.assignmentsCreated=true;rebuildRoomingFromAssignments(state.preview);renderRooming(state.preview.result,state.preview.planType);
 }else if(!state.preview.assignmentsCreated&&!assignRoomingCandidates())return;
 const preSaveValidation=validateRoomingPlan(state.preview);
 if(!preSaveValidation.ok){message($('rooming-message'),`Chưa thể lưu phương án:\n${preSaveValidation.errors.join('\n')}`,'error');return}
 const preview=state.preview;if(preview.saving)return;
 preview.saving=true;updateRoomingActions();
 $('preview-rooming').disabled=true;$('rooming-exam-select').disabled=true;$('room-plan-type').disabled=true;
 try{
  if(preview.planType==='elective'&&preview.adjustmentMode!=='manual'&&preview.result.assignments.every(row=>!String(row.sbd||'').trim())){
   preview.result=orderElectiveRoomPlan(preview.result);
   renderRooming(preview.result,preview.planType);
  }else if(preview.adjustmentMode==='manual')renumberRoomingAssignments(preview);
  const{examId,roundNo,planType,subjectCode,adjustmentMode,options,result}=preview;
  const rooms=result.rooms.filter(room=>room.student_count>0);
  const{data,error}=await state.client.rpc('exam_save_rooming_round_plan',{p_exam_id:examId,p_round_no:roundNo,p_plan_type:planType,p_subject_code:subjectCode||null,p_adjustment_mode:adjustmentMode||'automatic',p_capacity:options.capacity,p_room_prefix:options.roomPrefix,p_first_room_number:options.firstRoomNumber,p_rooms:rooms,p_assignments:result.assignments,p_lock:false});
  if(error)throw new Error(`Không lưu được phương án đợt ${roundNo}. Hãy chạy lại migration SQL v0.1.91 sau khi cập nhật điều kiện kiểm tra môn lựa chọn. ${error.message}`);
  const snapshotId=data?.plan_id;
  if(typeof snapshotId!=='string')throw new Error('RPC không trả về plan_id hợp lệ; chưa thể phân phòng chính thức.');
  if(state.preview!==preview)return;
  preview.saved={...data,plan_id:snapshotId};preview.sourcePlanId=snapshotId;preview.finalized=null;
  message($('rooming-message'),result.assignments.some(row=>!isValidSbd(row.sbd))?`Đã lưu phòng tổ hợp đợt ${roundNo}. Vào Quản lý SBD → Theo phòng thi tổ hợp đã xếp để cấp số, sau đó tải lại phòng và phân phòng chính thức.`:`Đã lưu phân bổ đợt ${roundNo}. Kiểm tra danh sách, sau đó chọn “Phân phòng chính thức”.`,'success');
 }catch(error){
  if(state.preview===preview)message($('rooming-message'),error.message||String(error),'error');
 }finally{
  preview.saving=false;
  $('preview-rooming').disabled=false;$('rooming-exam-select').disabled=false;$('room-plan-type').disabled=false;
  if(state.preview===preview)updateRoomingActions();
 }
}
async function finalizeRooming(){
 const preview=state.preview;
 if(!preview)return;
 if(preview.result.assignments.some(row=>!isValidSbd(row.sbd))){message($('rooming-message'),'Hãy cấp SBD theo phòng đã lưu, sau đó tải lại phương án trước khi phân phòng chính thức.','error');return}
 const finalValidation=validateRoomingPlan(preview);
 if(!finalValidation.ok){message($('rooming-message'),`Chưa thể phân phòng chính thức:\n${finalValidation.errors.join('\n')}`,'error');return}
 if(preview.assignmentRosterMatches===false){
  message($('rooming-message'),'Roster đã thay đổi so với phương án đã lưu. Hồ sơ cũ được giữ nguyên; hãy lập phương án mới trước khi phân phòng chính thức.','error');return;
 }
 const assignedIds=new Set(preview.result.assignments.map(a=>String(a.candidate_id)));
 const unassigned=(preview.pool||[]).filter(c=>!assignedIds.has(poolCandidateId(c)));
 if(unassigned.length){
  message($('rooming-message'),`Còn ${unassigned.length} thí sinh chưa được xếp phòng. Hãy thêm vào phòng trước khi phân phòng chính thức.`,'error');return;
 }
 if(!preview.saved){message($('rooming-message'),'Hãy lưu phân bổ phòng trước khi phân phòng chính thức.','error');return}
 if(!confirm('Xác nhận phân phòng chính thức? Thao tác sẽ lưu danh sách thí sinh/phòng vào CSDL và bật chức năng xuất/in.'))return;
 preview.finalizing=true;updateRoomingActions();
 $('preview-rooming').disabled=true;$('rooming-exam-select').disabled=true;$('room-plan-type').disabled=true;
 try{
  const occupiedRooms=preview.result.rooms.filter(room=>room.student_count>0);
  const {data,error}=await state.client.rpc('exam_finalize_rooming_round_plan',{p_plan_id:preview.sourcePlanId});
  if(error)throw new Error(`Không thể phân phòng chính thức đợt ${preview.roundNo||1}. Hãy chạy migration SQL v0.1.92. ${error.message}`);
  preview.result.rooms=occupiedRooms;
  preview.finalized=data;
  updateRoomingActions();
  renderRooming(preview.result,preview.planType);
  message($('rooming-message'),`Đã lưu phân phòng chính thức (${data?.assignment_count||preview.result.assignments.length} thí sinh, ${data?.room_count||preview.result.rooms.length} phòng). Có thể xuất Excel hoặc in PDF.`,'success');
 }catch(error){
  message($('rooming-message'),error.message||String(error),'error');
 }finally{
  preview.finalizing=false;
  $('preview-rooming').disabled=false;$('rooming-exam-select').disabled=false;$('room-plan-type').disabled=false;
  if(state.preview===preview)updateRoomingActions();
 }
}
function roomingRows(){
 if(!state.preview)return [];
 const {result,planType,subjectCode}=state.preview;
 const source=result.assignments.map(a=>{
   const candidate=(state.candidates||[]).find(c=>String(c.id)===String(a.candidate_id))||{};
   return {...a,date_of_birth:a.date_of_birth||candidate.date_of_birth||candidate.ngay_sinh||'',subject_name:a.subject_name|| (planType==='mandatory'?subjectName(subjectCode):''),
    ca1_name:a.ca1_subject_code?subjectName(a.ca1_subject_code):'',ca2_name:a.ca2_subject_code?subjectName(a.ca2_subject_code):''};
 });
 const rows=source.sort((a,b)=>String(a.room_code).localeCompare(String(b.room_code),'vi',{numeric:true})||Number(a.seat_number||0)-Number(b.seat_number||0)||String(a.sbd||'').localeCompare(String(b.sbd||''),'vi',{numeric:true}));
 if(planType==='mandatory'){
  const roomSeats=new Map();
  for(const row of rows){
   const next=(roomSeats.get(row.room_code)||0)+1;
   roomSeats.set(row.room_code,next);
   row.seat_number=next;
  }
 }
 return rows;
}
function normalizedDOB(v){
 if(!v)return '';
 const s=String(v);
 if(/^\d{4}-\d{2}-\d{2}/.test(s)){const [y,m,d]=s.slice(0,10).split('-');return `${d}/${m}/${y}`}
 return s;
}
function roomSubjectsFor(a){
 return state.preview?.planType==='mandatory' ? (a.subject_name||subjectName(state.preview.subjectCode)) : [a.ca1_name,a.ca2_name].filter(Boolean).join(' / ');
}
function exportRooming(){
 if(!state.preview)return;
 if(!window.XLSX){message($('rooming-message'),'Không tải được thư viện Excel. Hãy kiểm tra kết nối Internet.','error');return}
 const rows=roomingRows(),{planType,subjectCode}=state.preview;
 const examTitle=$('rooming-exam-select').selectedOptions[0]?.text||'Kỳ thi';
 const roomMap=new Map();rows.forEach(a=>{if(!roomMap.has(a.room_code))roomMap.set(a.room_code,[]);roomMap.get(a.room_code).push(a)});
 const wb=window.XLSX.utils.book_new();
 const thin={style:'thin',color:{rgb:'000000'}};
 const border={top:thin,bottom:thin,left:thin,right:thin};
 const baseFont={name:'Times New Roman',sz:12};
 const center={horizontal:'center',vertical:'center',wrapText:true};
 const left={horizontal:'left',vertical:'center',wrapText:true};
 function cell(ws,row,col,style){
  const address=window.XLSX.utils.encode_cell({r:row,c:col});
  if(!ws[address])ws[address]={t:'s',v:''};
  ws[address].s=style;
 }
 function styleSheet(ws,{columnWidths,tableRanges,titleRows,boldRows,breaks,nameColumn=2}){
  ws['!cols']=columnWidths.map(wch=>({wch}));
  ws['!margins']={left:0.15,right:0.15,top:0.25,bottom:0.25,header:0.1,footer:0.1};
  ws['!pageSetup']={paperSize:9,orientation:'landscape',fitToWidth:1,fitToHeight:0};
  ws['!rowBreaks']=breaks;
  for(const [firstRow,lastRow,firstCol,lastCol] of tableRanges){
   for(let r=firstRow;r<=lastRow;r++)for(let c=firstCol;c<=lastCol;c++)
    cell(ws,r,c,{font:baseFont,border,alignment:r===firstRow?center:(c===nameColumn?left:center)});
  }
  for(const row of titleRows)for(let c=0;c<columnWidths.length;c++)
   cell(ws,row,c,{font:{...baseFont,bold:true},alignment:center});
  for(const row of boldRows)for(let c=0;c<columnWidths.length;c++)
   cell(ws,row,c,{font:{...baseFont,bold:true},alignment:center,border});
 }
 function addRoomHeading(data,merges,roomCode,columns,title){
  const start=data.length;
  const split=Math.floor(columns/2);
  data.push(['SỞ GDĐT HẢI PHÒNG',...Array(columns-1).fill('')]);
  data.push(['TRƯỜNG THPT LÊ HỒNG PHONG',...Array(split-1).fill(''),`${examTitle} — ${title}`,...Array(columns-split-1).fill('')]);
  data.push([`Phòng thi: ${roomCode}`,...Array(columns-1).fill('')]);
  data.push(columns===6
   ? ['STT','SBD','Họ và tên','Ngày sinh','Lớp','Môn thi']
   : columns===7
    ? ['STT','Vị trí','SBD','Họ và tên','Ngày sinh','Lớp','Môn thi']
    : columns===10
     ? ['TT','SBD','Họ và tên','Ngày sinh','Lớp','Môn thi','Mã đề','Số tờ','Ký nộp','Ghi chú']
     : ['TT','Vị trí','SBD','Họ và tên','Ngày sinh','Lớp','Môn thi','Mã đề','Số tờ','Ký nộp','Ghi chú']);
  merges.push({s:{r:start,c:0},e:{r:start,c:split-1}});
  merges.push({s:{r:start,c:split},e:{r:start,c:columns-1}});
  merges.push({s:{r:start+1,c:0},e:{r:start+1,c:split-1}});
  merges.push({s:{r:start+1,c:split},e:{r:start+1,c:columns-1}});
  merges.push({s:{r:start+2,c:0},e:{r:start+2,c:columns-1}});
  return start+3;
 }
 const listingData=[],listingMerges=[],listingTables=[],listingTitles=[],listingBold=[],listingBreaks=[];
 const receiptData=[],receiptMerges=[],receiptTables=[],receiptTitles=[],receiptBold=[],receiptBreaks=[];
 const listingColumns=planType==='mandatory'?7:6,receiptColumns=planType==='mandatory'?11:10;
 let roomIndex=0;
 for(const [roomCode,items] of roomMap){
  if(roomIndex++){
  listingBreaks.push({id:listingData.length-1,max:16383,man:1});
  receiptBreaks.push({id:receiptData.length-1,max:16383,man:1});
  }
  const listingStart=listingData.length;
 const listingHeaderRow=addRoomHeading(listingData,listingMerges,roomCode,listingColumns,'DANH SÁCH NIÊM YẾT THÍ SINH');
 const listingPositions=roomExportRowPositions(listingHeaderRow,items.length);
 listingTitles.push(listingStart,listingStart+1);listingBold.push(listingHeaderRow);
 items.forEach((a,i)=>listingData.push(listingColumns===7
  ?[i+1,a.seat_number,a.sbd,a.student_name,normalizedDOB(a.date_of_birth),a.class_code,roomSubjectsFor(a)]
  :[i+1,a.sbd,a.student_name,normalizedDOB(a.date_of_birth),a.class_code,roomSubjectsFor(a)]));
 listingTables.push([listingHeaderRow,listingPositions.dataEnd,0,listingColumns-1]);
  listingData.push([`Tổng số thí sinh: ${items.length}`,...Array(listingColumns-1).fill('')]);
 listingMerges.push({s:{r:listingPositions.totalRow,c:0},e:{r:listingPositions.totalRow,c:listingColumns-1}});
 listingBold.push(listingPositions.totalRow);
 listingData.push([]);

 const receiptStart=receiptData.length;
 const receiptHeaderRow=addRoomHeading(receiptData,receiptMerges,roomCode,receiptColumns,'PHIẾU THU BÀI');
 const receiptPositions=roomExportRowPositions(receiptHeaderRow,items.length);
 receiptTitles.push(receiptStart,receiptStart+1);receiptBold.push(receiptHeaderRow);
 items.forEach((a,i)=>receiptData.push(receiptColumns===11
  ?[i+1,a.seat_number,String(a.sbd||''),a.student_name,normalizedDOB(a.date_of_birth),a.class_code,roomSubjectsFor(a),'','','','']
  :[i+1,String(a.sbd||''),a.student_name,normalizedDOB(a.date_of_birth),a.class_code,roomSubjectsFor(a),'','','','']));
 receiptTables.push([receiptHeaderRow,receiptPositions.dataEnd,0,receiptColumns-1]);
  receiptData.push([]);
  receiptData.push(['Tổng số thí sinh:',items.length,'Số thí sinh vắng:','',...Array(receiptColumns-4).fill('')]);
  receiptData.push(['Tổng số bài:','','Tổng số tờ:','',...Array(receiptColumns-4).fill('')]);
  receiptData.push([]);
  receiptData.push(['Cán bộ coi thi số 1','','','','','Cán bộ coi thi số 2',...Array(receiptColumns-6).fill('')]);
  receiptData.push(['(Ký, ghi rõ họ tên)','','','','','(Ký, ghi rõ họ tên)',...Array(receiptColumns-6).fill('')]);
  receiptMerges.push(
  {s:{r:receiptPositions.totalRow+1,c:0},e:{r:receiptPositions.totalRow+1,c:1}},
  {s:{r:receiptPositions.totalRow+1,c:2},e:{r:receiptPositions.totalRow+1,c:3}},
  {s:{r:receiptPositions.totalRow+2,c:0},e:{r:receiptPositions.totalRow+2,c:1}},
  {s:{r:receiptPositions.totalRow+2,c:2},e:{r:receiptPositions.totalRow+2,c:3}},
  {s:{r:receiptPositions.totalRow+4,c:0},e:{r:receiptPositions.totalRow+4,c:4}},
  {s:{r:receiptPositions.totalRow+4,c:5},e:{r:receiptPositions.totalRow+4,c:receiptColumns-1}},
  {s:{r:receiptPositions.totalRow+5,c:0},e:{r:receiptPositions.totalRow+5,c:4}},
  {s:{r:receiptPositions.totalRow+5,c:5},e:{r:receiptPositions.totalRow+5,c:receiptColumns-1}}
 );
 receiptBold.push(receiptPositions.totalRow+1,receiptPositions.totalRow+2,receiptPositions.totalRow+4);
 receiptData.push([]);
 }
 const wsListing=window.XLSX.utils.aoa_to_sheet(listingData);
 wsListing['!merges']=listingMerges;
 styleSheet(wsListing,{columnWidths:listingColumns===7?[6,8,13,30,15,12,28]:[7,14,30,15,12,28],tableRanges:listingTables,titleRows:listingTitles,boldRows:listingBold,breaks:listingBreaks,nameColumn:listingColumns===7?3:2});
 window.XLSX.utils.book_append_sheet(wb,wsListing,'Danh sach niem yet');
 const wsReceipts=window.XLSX.utils.aoa_to_sheet(receiptData);
 wsReceipts['!merges']=receiptMerges;
 styleSheet(wsReceipts,{columnWidths:receiptColumns===11?[6,8,12,25,14,9,18,9,8,13,15]:[6,13,25,14,9,18,9,8,13,15],tableRanges:receiptTables,titleRows:receiptTitles,boldRows:receiptBold,breaks:receiptBreaks,nameColumn:receiptColumns===11?3:2});
 window.XLSX.utils.book_append_sheet(wb,wsReceipts,'Phieu thu bai');
 window.XLSX.writeFile(wb,`danh-sach-niem-yet_phieu-thu-bai_${planType==='mandatory'?subjectCode:'lua-chon'}.xlsx`,{cellStyles:true});
}
function compactPrintPages(pages){
 /* Legacy compatibility markers: @page{size:A4 landscape;margin:2mm}; .page{width:293mm;min-height:205mm;page-break-after:always}; @media print{html,body{width:293mm;margin:0!important}. */
 const normalize=value=>String(value||'').toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim();
 return pages.map(markup=>{const template=document.createElement('template');template.innerHTML=markup;template.content.querySelectorAll('table').forEach(table=>{const headerRow=table.querySelector('thead tr');if(!headerRow)return;const headers=[...headerRow.children];const removeIndexes=headers.map((cell,index)=>({index,label:normalize(cell.textContent)})).filter(item=>['vi tri','ma hoc sinh','ma dinh danh'].includes(item.label)).map(item=>item.index);[...removeIndexes].sort((a,b)=>b-a).forEach(index=>table.querySelectorAll('tr').forEach(row=>row.children[index]?.remove()));const currentHeaders=[...headerRow.children].map(cell=>normalize(cell.textContent));if(!currentHeaders.includes('ghi chu')){const cell=document.createElement('th');cell.textContent='Ghi chú';headerRow.appendChild(cell);table.querySelectorAll('tbody tr').forEach(row=>{const note=document.createElement('td');note.textContent='';row.appendChild(note)})}table.querySelectorAll('th,td').forEach(cell=>{const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(node=>{if(normalize(node.nodeValue).includes('giao duc kinh te va phap luat'))node.nodeValue='GDKT&PL'})})});return template.innerHTML});
}
function printRoomingPDF(){
 if(!state.preview)return;
 const rows=roomingRows(),{planType,subjectCode}=state.preview;
 const title=$('rooming-exam-select').selectedOptions[0]?.text||'Kỳ thi';
 const roomMap=new Map();rows.forEach(a=>{if(!roomMap.has(a.room_code))roomMap.set(a.room_code,[]);roomMap.get(a.room_code).push(a)});
 const escHtml=s=>esc(s).replace(/\n/g,' ');
 const hasSeats=false;
 const posting=[...roomMap.entries()].map(([room,items])=>`<section class="page"><header><div><b>SỞ GDĐT HẢI PHÒNG</b><br><b>TRƯỜNG THPT LÊ HỒNG PHONG</b></div><div><b>${escHtml(title)}</b><br><b>DANH SÁCH NIÊM YẾT THÍ SINH</b><br><b>PHÒNG ${escHtml(String(room).replace(/^phòng\s*/i,''))}</b></div></header><table class="${hasSeats?'mandatory':''}"><thead><tr><th>TT</th>${hasSeats?'<th>Vị trí</th>':''}<th>SBD</th><th>Họ và tên</th><th>Ngày sinh</th><th>Lớp</th><th>Môn thi</th></tr></thead><tbody>${items.map((a,i)=>`<tr><td>${i+1}</td>${hasSeats?`<td>${a.seat_number}</td>`:''}<td>${escHtml(a.sbd)}</td><td>${escHtml(a.student_name)}</td><td>${escHtml(normalizedDOB(a.date_of_birth))}</td><td>${escHtml(a.class_code)}</td><td>${escHtml(roomSubjectsFor(a))}</td></tr>`).join('')}</tbody></table><p class="totals">Tổng số thí sinh: ${items.length}</p></section>`).join('');
 const receipts=[...roomMap.entries()].map(([room,items])=>`<section class="page"><header><div><b>SỞ GDĐT HẢI PHÒNG</b><br>TRƯỜNG THPT LÊ HỒNG PHONG</div><div><b>${escHtml(title)}</b><br><b>PHIẾU THU BÀI</b><br>Phòng thi số: ${escHtml(room)}</div></header><table class="receipt ${hasSeats?'mandatory':''}"><thead><tr><th>TT</th>${hasSeats?'<th>Vị trí</th>':''}<th>SBD</th><th>Họ và tên</th><th>Ngày sinh</th><th>Lớp</th><th>Môn thi</th><th>Mã đề</th><th>Số tờ</th><th>Ký nộp</th><th>Ghi chú</th></tr></thead><tbody>${items.map((a,i)=>`<tr><td>${i+1}</td>${hasSeats?`<td>${a.seat_number}</td>`:''}<td>${escHtml(a.sbd)}</td><td>${escHtml(a.student_name)}</td><td>${escHtml(normalizedDOB(a.date_of_birth))}</td><td>${escHtml(a.class_code)}</td><td>${escHtml(roomSubjectsFor(a))}</td><td></td><td></td><td></td><td></td></tr>`).join('')}</tbody></table><p class="totals">Tổng số thí sinh: ............; số thí sinh vắng: ............</p><p class="totals">Tổng số bài: ............; Tổng số tờ: ............</p><footer><div><b>Cán bộ coi thi số 1</b><br><i>(Ký, ghi rõ họ tên)</i></div><div><b>Cán bộ coi thi số 2</b><br><i>(Ký, ghi rõ họ tên)</i></div></footer></section>`).join('');
 const win=createPrintFrame();
 win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Danh sách niêm yết và phiếu thu bài</title><style>
 @page{size:A4 portrait;margin:8mm}
 *{box-sizing:border-box}
 html,body{margin:0;padding:0}
 body{font-family:"Times New Roman",serif;color:#111;font-size:12pt;line-height:1}
 .page{width:190mm;min-height:277mm;page-break-after:always;break-after:page;break-inside:avoid;page-break-inside:avoid;padding:0}
 .page:last-child{page-break-after:auto;break-after:auto}
 header{display:grid;grid-template-columns:35% 65%;text-align:center;align-items:center;margin:0 0 2mm;font-size:12pt;line-height:1.05;white-space:nowrap}
 table{width:100%;border-collapse:collapse;table-layout:fixed;font-family:"Times New Roman",serif;font-size:12pt;page-break-inside:avoid;break-inside:avoid}
 thead{display:table-header-group}
 tr{break-inside:avoid;page-break-inside:avoid}
 th,td{border:1px solid #000;padding:1px 2px;text-align:center;vertical-align:middle;overflow-wrap:anywhere;line-height:1}
 th{font-weight:bold}td:nth-child(3){text-align:left}.mandatory td:nth-child(4){text-align:left}.receipt{font-size:12pt}
 .receipt th,.receipt td{padding:1px;line-height:1}
 .receipt th:nth-child(1){width:4%}.receipt th:nth-child(2){width:9%}.receipt th:nth-child(3){width:19%}
 .receipt th:nth-child(4){width:9%}.receipt th:nth-child(5){width:7%}.receipt th:nth-child(6){width:15%}
 .receipt th:nth-child(7){width:7%}.receipt th:nth-child(8){width:6%}.receipt th:nth-child(9){width:12%}.receipt th:nth-child(10){width:12%}
 .receipt.mandatory th:nth-child(1){width:4%}.receipt.mandatory th:nth-child(2){width:6%}.receipt.mandatory th:nth-child(3){width:9%}
 .receipt.mandatory th:nth-child(4){width:17%}.receipt.mandatory th:nth-child(5){width:8%}.receipt.mandatory th:nth-child(6){width:6%}
 .receipt.mandatory th:nth-child(7){width:14%}.receipt.mandatory th:nth-child(8){width:6%}.receipt.mandatory th:nth-child(9){width:5%}
 .receipt.mandatory th:nth-child(10){width:11%}.receipt.mandatory th:nth-child(11){width:14%}
 .totals{font-weight:normal;margin:2mm 0}
 footer{display:flex;justify-content:space-around;text-align:center;margin-top:4mm;line-height:1.2}
 footer div{width:40%}
 @media print{html,body{width:190mm;margin:0!important}.page{margin:0!important}}
 @media screen{body{max-width:1100px;margin:20px auto}.page{width:100%;min-height:0;margin-bottom:20px;border-bottom:1px dashed #aaa;padding-bottom:20px}}
 </style></head><body>${posting}${receipts}<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
 win.document.close();
}
let sbdRoomPreview=null,sbdRoundRequest=0;
let sbdRoster=[],sbdRosterContext='',sbdRosterRequest=0;
function currentSbdRosterContext(){const id=$('sbd-exam-select')?.value||'';return JSON.stringify([id,isSubjectExam(id)?$('sbd-subject')?.value||'':''])}
function clearSbdRoster(){
 ++sbdRosterRequest;sbdRoster=[];sbdRosterContext='';
 if(!$('sbd-roster-body'))return;
 $('sbd-roster-body').innerHTML='<tr><td colspan="6" class="empty">Bấm tải để xem SBD đã lưu của kỳ/môn đang chọn.</td></tr>';
 message($('sbd-roster-status'),'Danh sách chưa tải hoặc cần cập nhật lại từ CSDL.','info');
}
function renderSbdRoster(){
 if(!$('sbd-roster-body'))return;
 if(sbdRosterContext!==currentSbdRosterContext()){clearSbdRoster();return}
 const query=$('sbd-roster-search').value.trim().toLocaleLowerCase('vi'),cls=$('sbd-roster-class').value;
 const rows=sbdRoster.filter(c=>(!cls||c.class_code===cls)&&(!query||[c.sbd,c.student_code,c.student_name,normalizedDOB(c.date_of_birth)].some(v=>String(v||'').toLocaleLowerCase('vi').includes(query))));
 $('sbd-roster-body').innerHTML=rows.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.sbd||'Chưa cấp')}</td><td>${esc(c.student_code)}</td><td>${esc(c.student_name)}</td><td>${esc(normalizedDOB(c.date_of_birth)||'Chưa có')}</td><td>${esc(c.class_code)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Không có học sinh phù hợp.</td></tr>';
 message($('sbd-roster-status'),`Hiển thị ${rows.length}/${sbdRoster.length} học sinh · Đã có SBD: ${sbdRoster.filter(c=>c.sbd).length}.`,'info');
}
async function loadSbdRoster(){
 const examId=$('sbd-exam-select').value,context=currentSbdRosterContext(),request=++sbdRosterRequest;
 sbdRoster=[];sbdRosterContext='';
 $('sbd-roster-body').innerHTML='<tr><td colspan="6" class="empty">Đang tải...</td></tr>';
 try{
  if(!examId||!state.client)throw new Error('Hãy chọn kỳ thi và kết nối trước khi tải.');
  let rows=await selectAllPages(()=>state.client.from('exam_candidates').select('id,sbd,student_code,student_name,date_of_birth,class_code').eq('exam_id',examId).order('id'));
  if(isSubjectExam(examId)){
   const code=$('sbd-subject').value;if(!code)throw new Error('Hãy chọn môn thi.');
   const [regs,sbds]=await Promise.all([
    selectAllPages(()=>state.client.from('exam_candidate_subjects').select('candidate_id').eq('exam_id',examId).eq('subject_code',code).order('candidate_id')),
    selectAllPages(()=>state.client.from('exam_subject_candidate_sbds').select('candidate_id,sbd').eq('exam_id',examId).eq('subject_code',code).order('candidate_id'))
   ]);
   const ids=new Set(regs.map(r=>String(r.candidate_id))),byId=new Map(sbds.map(r=>[String(r.candidate_id),r.sbd]));
   rows=rows.filter(c=>ids.has(String(c.id))).map(c=>({...c,sbd:byId.get(String(c.id))||''}));
  }
  if(request!==sbdRosterRequest||context!==currentSbdRosterContext())return;
  sbdRoster=rows.sort((a,b)=>Number(!a.sbd)-Number(!b.sbd)||String(a.sbd||'').localeCompare(String(b.sbd||''),'vi',{numeric:true})||String(a.student_code).localeCompare(String(b.student_code),'vi',{numeric:true}));sbdRosterContext=context;
  const previous=$('sbd-roster-class').value,classes=[...new Set(rows.map(c=>c.class_code).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  $('sbd-roster-class').innerHTML='<option value="">Tất cả lớp</option>'+classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if(classes.includes(previous))$('sbd-roster-class').value=previous;
  renderSbdRoster();
 }catch(error){if(request!==sbdRosterRequest||context!==currentSbdRosterContext())return;$('sbd-roster-body').innerHTML='<tr><td colspan="6" class="empty">Không tải được danh sách.</td></tr>';message($('sbd-roster-status'),error.message,'error')}
}
function sbdRoomInputs(){
 return {examId:$('sbd-exam-select').value,roundNo:Number($('sbd-room-round').value),
  prefix:$('sbd-prefix').value.trim(),totalLength:Number($('sbd-length').value),prefixLength:Number($('sbd-prefix-length').value)};
}
function invalidateSbdRoomPreview(){sbdRoomPreview=null;$('sbd-room-preview-result').innerHTML=''}
function isManualExam(examId){return state.exams.find(exam=>exam.id===examId)?.exam_mode==='manual'}
async function openManualExamWorkspace(examId){
 const {openManualExam}=await import('./manual-exam.js?v=172');return openManualExam({state,examId,selectAllPages});
}
function isSubjectExam(examId){const mode=state.exams.find(exam=>exam.id===examId)?.exam_mode;return mode==='subject'||mode==='choice'}
async function refreshSubjectSbdControls(){
 const examId=$('sbd-exam-select').value,wrap=$('sbd-subject-wrap'),select=$('sbd-subject'),note=$('sbd-mode-note');
 const subjectExam=isSubjectExam(examId);wrap.classList.toggle('hidden',!subjectExam);
 for(const id of ['room-sort-mode','sbd-length','sbd-prefix-length','sbd-prefix','room-previous-exam'])$(id)?.closest('label')?.classList.toggle('hidden',subjectExam);
 if(!subjectExam){select.innerHTML='<option value="">-- Chọn môn thi --</option>';if(note)note.textContent='Kỳ thi mặc định dùng một SBD chung trong toàn kỳ thi.';return false}
 if(note)note.textContent='Kỳ thi theo môn: chọn môn để lập SBD riêng từ 0001 theo thứ tự họ và tên.';
 if(!examId||!state.client){select.innerHTML='<option value="">-- Chọn môn thi --</option>';return true}
 const previous=select.value;
 const registrations=await selectAllPages(()=>state.client.from('exam_candidate_subjects').select('subject_code').eq('exam_id',examId).order('subject_code'));
 const codes=[...new Set(registrations.map(row=>String(row.subject_code||'').trim().toUpperCase()).filter(Boolean))];
 select.innerHTML='<option value="">-- Chọn môn thi --</option>'+codes.map(code=>`<option value="${esc(code)}">${esc(subjectName(code))} (${esc(code)})</option>`).join('');
 select.value=codes.includes(previous)?previous:(codes.length===1?codes[0]:'');select.dataset.examId=examId;
 return true;
}
async function assignSubjectSbd(examId){
 const subjectCode=$('sbd-subject').value;
 if(!subjectCode)throw new Error('Hãy chọn môn thi trước khi đánh SBD theo môn.');
 const registrations=await selectAllPages(()=>state.client.from('exam_candidate_subjects').select('candidate_id').eq('exam_id',examId).eq('subject_code',subjectCode));
 const ids=[...new Set(registrations.map(row=>row.candidate_id).filter(Boolean))];
 if(!ids.length)throw new Error('Môn này chưa có học sinh đăng ký dự thi.');
 const candidates=await selectAllPages(()=>state.client.from('exam_candidates').select('id,student_code,student_name,class_code').eq('exam_id',examId).in('id',ids));
 if(candidates.length!==ids.length)throw new Error('Danh sách học sinh dự thi không còn đầy đủ. Hãy tải lại danh sách môn trước khi cấp SBD.');
 const ordered=[...candidates].sort((a,b)=>compareVietnameseName(a.student_name,b.student_name)||String(a.student_code||'').localeCompare(String(b.student_code||''),'vi',{numeric:true}));
 const assignments=ordered.map((candidate,index)=>({candidate_id:candidate.id,sbd:String(index+1).padStart(4,'0')}));
 const{error}=await state.client.rpc('exam_assign_subject_sbd',{p_exam_id:examId,p_subject_code:subjectCode,p_assignments:assignments});
 if(error)throw new Error(`Không lưu được SBD theo môn. Hãy chạy migration v0.1.125. ${error.message}`);
 clearSbdRoster();
 $('sbd-room-preview-result').innerHTML=`<p>Đã cấp ${assignments.length} SBD cho môn ${esc(subjectName(subjectCode))} (${esc(subjectCode)}).</p><div class="table-wrap"><table><thead><tr><th>SBD</th><th>Họ và tên</th><th>Lớp</th></tr></thead><tbody>${ordered.map((candidate,index)=>`<tr><td>${assignments[index].sbd}</td><td>${esc(candidate.student_name)}</td><td>${esc(candidate.class_code||'—')}</td></tr>`).join('')}</tbody></table></div>`;
 message($('sbd-message'),`Đã cấp ${assignments.length} SBD từ 0001 cho môn ${subjectName(subjectCode)}, theo thứ tự họ và tên.`,'success');
}
async function refreshSbdRoomControls(){
 const examId=$('sbd-exam-select').value;
 const subjectExam=await refreshSubjectSbdControls();
 if(sbdRosterContext&&sbdRosterContext!==currentSbdRosterContext())clearSbdRoster();
 const groupInput=$('sbd-groups');
 $('sbd-group-options').classList.toggle('hidden',subjectExam);
 if(groupInput.dataset.examId!==examId){
   groupInput.dataset.examId=examId;
   try{groupInput.value=localStorage.getItem('sbd-groups:'+examId)||''}catch{groupInput.value=''}
 }
 if(subjectExam){$('sbd-room-options').classList.add('hidden');return}
 await sbdGroupEditor?.load(examId);
 if($('sbd-exam-select').value!==examId)return;
 const active=$('room-sort-mode').value==='elective_rooms';
 $('sbd-room-options').classList.toggle('hidden',!active);
 if(!active)return;
 const select=$('sbd-room-round');
 if(!examId||!state.client){select.innerHTML='<option value="">-- Chọn kỳ thi --</option>';return}
 if(!isSubjectExam(examId))throw new Error('Cách cấp SBD theo tổ hợp chỉ áp dụng cho kỳ thi theo môn.');
 if(select.dataset.examId===examId&&select.value)return;
 const request=++sbdRoundRequest;select.disabled=true;
 try{
  const rounds=await loadExamRounds(state.client,examId);
  if(request!==sbdRoundRequest||$('sbd-exam-select').value!==examId)return;
  select.innerHTML=rounds.map(round=>`<option value="${round.round_no}">${esc(round.name)}</option>`).join('');select.dataset.examId=examId;
 }finally{if(request===sbdRoundRequest)select.disabled=false}
}
async function previewSbdRooms(){
 invalidateSbdRoomPreview();
 await refreshSbdRoomControls();
 const inputs=sbdRoomInputs(),{examId,roundNo}=inputs;
 if(!examId||!roundNo)throw new Error('Hãy chọn kỳ thi và đợt thi.');
 if($('room-sort-mode').value!=='elective_rooms')throw new Error('Hãy chọn cấp SBD theo tổ hợp môn và phòng thi.');
 if(inputs.prefix.length!==inputs.prefixLength)throw new Error('Tiền tố SBD không khớp số chữ số đã chọn.');
 const candidates=await selectAllPages(()=>state.client.rpc('exam_get_round_candidates',{p_exam_id:examId,p_round_no:roundNo}).order('id'));
 const plan=await findCurrentRoundPlan(examId,roundNo,'elective',null,'saved');
 if(!plan)throw new Error('Chưa có phòng tổ hợp đã lưu. Vào Xếp phòng thi → Môn lựa chọn → Kiểm tra và lưu phân bổ trước.');
 const candidateMap=new Map(candidates.map(row=>[String(row.id),row]));
 if(plan.assignments.some(row=>!candidateMap.has(String(row.candidate_id))||String(candidateMap.get(String(row.candidate_id)).sbd||'').trim()))throw new Error('Danh sách đã thay đổi hoặc thí sinh đã có SBD. Hãy kiểm tra lại phòng đã lưu.');
 const groupText=roomGroupText(examId);
 if(groupText!==null)validateRoomGroups(plan.assignments,candidates,groupText);
 const existing=await selectAllPages(()=>state.client.from('exam_candidates').select('sbd').eq('exam_id',examId).order('id'));
 const startNumber=1+existing.reduce((max,row)=>{const s=String(row.sbd||'');return s.length===inputs.totalLength&&s.startsWith(inputs.prefix)?Math.max(max,Number(s.slice(inputs.prefix.length))||0):max},0);
 const result=numberSavedElectiveRooms(plan,{...inputs,startNumber});
 if(JSON.stringify(inputs)!==JSON.stringify(sbdRoomInputs()))throw new Error('Thiết lập đã thay đổi trong khi tải. Hãy xem trước lại.');
 sbdRoomPreview={inputs,result,plan,startNumber,groupText};
 $('sbd-room-preview-result').innerHTML=`<p>${result.assignments.length} học sinh · ${result.rooms.length} phòng đã lưu. Giữ nguyên phòng và vị trí. Kiểm tra rồi bấm “Đánh số SBD và lưu CSDL”.</p><div class="table-wrap"><table><thead><tr><th>Phòng</th><th>SBD dự kiến</th><th>Họ tên</th><th>Lớp</th><th>Môn 1</th><th>Môn 2</th></tr></thead><tbody>${result.assignments.map(row=>`<tr><td>${esc(row.room_code)}</td><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.class_code)}</td><td>${esc(subjectName(row.ca1_subject_code))}</td><td>${esc(subjectName(row.ca2_subject_code))}</td></tr>`).join('')}</tbody></table></div>`;
 message($('sbd-message'),'Đã tải phòng đã lưu và xem trước SBD; chưa thay đổi dữ liệu.','info');
}
async function saveSbdRoomPreview(){
 const preview=sbdRoomPreview;
 if(!preview||JSON.stringify(preview.inputs)!==JSON.stringify(sbdRoomInputs()))throw new Error('Hãy tải phòng đã lưu và xem trước SBD theo thiết lập hiện tại trước khi lưu.');
 const {inputs,result}=preview;
 if(preview.groupText!==roomGroupText(inputs.examId))throw new Error('Nhóm lớp đã thay đổi. Hãy xem trước lại.');
 const {error}=await state.client.rpc('exam_number_saved_elective_plan',{p_plan_id:preview.plan.id,p_expected_rooms:preview.plan.rooms,p_expected_assignments:preview.plan.assignments,p_sbd_prefix:inputs.prefix,p_sbd_length:inputs.totalLength,p_start_number:preview.startNumber});
 if(error)throw new Error(`Không cấp được SBD theo phòng đã lưu. Cần migration v0.1.114. ${error.message}`);
 clearSbdRoster();
 invalidateSbdRoomPreview();
 if(state.preview?.examId===inputs.examId){state.preview=null;updateRoomingActions()}
 message($('sbd-message'),`Đã lưu ${result.assignments.length} SBD theo thứ tự ${result.rooms.length} phòng của đợt ${inputs.roundNo}. Vào Xếp phòng thi, chọn cùng kỳ thi/đợt và Môn lựa chọn để tải phương án đã lưu, kiểm tra và phân phòng chính thức.`,'success');
}
function wireSbdRoomMode(){
 if($('sbd-roster-load')){
  $('sbd-roster-load').onclick=loadSbdRoster;
  $('sbd-roster-search').oninput=renderSbdRoster;$('sbd-roster-class').onchange=renderSbdRoster;
  for(const id of ['sbd-exam-select','sbd-subject'])$(id)?.addEventListener('change',clearSbdRoster);
 }
 sbdGroupEditor=createSbdGroupEditor({root:$('sbd-group-editor'),input:$('sbd-groups'),escape:esc,
  loadCandidates:examId=>selectAllPages(()=>state.client.from('exam_candidates').select('id,class_code').eq('exam_id',examId).order('id')),
  onChange:()=>{
   invalidateSbdRoomPreview();
   try{localStorage.setItem('sbd-groups:'+$('sbd-groups').dataset.examId,$('sbd-groups').value)}catch{message($('sbd-message'),'Không lưu được nhóm trên trình duyệt. Giữ trang hiện tại để tiếp tục.','error')}
  }
 });
 const refresh=()=>refreshSbdRoomControls().catch(error=>message($('sbd-message'),error.message,'error'));
 for(const id of ['sbd-exam-select','sbd-subject','room-sort-mode','sbd-room-round','sbd-room-capacity','sbd-room-prefix','sbd-room-first','sbd-prefix','sbd-length','sbd-prefix-length']){
  const control=$(id);if(control)control.addEventListener('change',()=>{invalidateSbdRoomPreview();refresh()});
 }
 const previewButton=$('sbd-room-preview');
 if(previewButton)previewButton.onclick=async()=>{previewButton.disabled=true;try{await previewSbdRooms()}catch(error){message($('sbd-message'),error.message,'error')}finally{previewButton.disabled=false}};
 const resetButton=$('reset-sbd-old');
 if(resetButton)resetButton.onclick=resetSbdAndElectivePlan;
}
async function resetSbdAndElectivePlan(){
 const examId=$('sbd-exam-select')?.value;
 if(isManualExam(examId)){await openManualExamWorkspace(examId);return}
 if(!examId){message($('sbd-message'),'Hãy chọn kỳ thi trước khi xoá SBD cũ.','error');return}
 if(isSubjectExam(examId)){
  const subjectCode=$('sbd-subject').value;
  if(!subjectCode){message($('sbd-message'),'Hãy chọn môn thi trước khi xóa SBD theo môn.','error');return}
  if(!confirm(`Xóa SBD của môn ${subjectName(subjectCode)} để lập lại? Thao tác không xóa học sinh hoặc đăng ký môn.`))return;
  const button=$('reset-sbd-old');button.disabled=true;
  try{
   const{data,error}=await state.client.rpc('exam_reset_subject_sbd',{p_exam_id:examId,p_subject_code:subjectCode});
   if(error)throw new Error(`Không xóa được SBD theo môn. Hãy chạy migration v0.1.125. ${error.message}`);
   clearSbdRoster();
   $('sbd-room-preview-result').innerHTML='';message($('sbd-message'),`Đã xóa ${Number(data?.deleted_count)||0} SBD của môn ${subjectName(subjectCode)}. Có thể lập lại từ 0001.`,'success');
  }catch(error){message($('sbd-message'),error.message||String(error),'error')}
  finally{button.disabled=false}
  return;
 }
 const exam=state.exams.find(item=>item.id===examId);
 const confirmation=prompt(`Kỳ thi: ${exam?.name||examId}\nLưu trữ SBD và toàn bộ phương án phòng (kể cả chính thức, mọi môn và đợt), sau đó xoá SBD hiện tại để lập lại. Giữ nguyên thí sinh và đăng ký môn. Các danh sách đã in sẽ không còn hiệu lực; cần xếp và chốt lại tất cả phòng.\nHệ thống sẽ chặn nếu đã có điểm, phách hoặc báo vắng.\nNhập LAP LAI SBD để xác nhận:`);
 if(confirmation!=='LAP LAI SBD')return;
 const button=$('reset-sbd-old');if(button)button.disabled=true;
 try{
  const {data,error}=await state.client.rpc('exam_archive_rooming_and_reset_sbd',{p_exam_id:examId,p_confirmation:confirmation});
  if(error)throw new Error(`Không lập lại được SBD: ${error.message}${error.code==='PGRST202'?' — Cần chạy migration v0.1.113 trên Supabase.':''}`);
  invalidateSbdRoomPreview();clearSbdRoster();
  state.preview=null;state.formData=null;state.candidates=[];state.sbdExamId=null;state.sbdConfig=null;
  clearRoomingPreview();
  message($('sbd-message'),`Đã lưu trữ hồ sơ cũ (mã ${data.archive_id}), xoá ${Number(data?.cleared_count)||0} SBD và huỷ các phương án phòng hiện hành. Hãy tải lại trang để làm mới các module, rồi chọn “Theo tổ hợp môn và thứ tự phòng thi lựa chọn”. Cần lập và chốt lại phòng cho mọi môn.`,'success');
 }catch(error){message($('sbd-message'),error.message||String(error),'error')}
 finally{if(button)button.disabled=false}
}
async function assignSbdByRoom(){
 const examId=$('sbd-exam-select')?.value;
 if(isManualExam(examId)){await openManualExamWorkspace(examId);return}
 if(!examId){message($('sbd-message'),'Hãy chọn kỳ thi trước khi đánh số báo danh.','error');return}
 if(isSubjectExam(examId)){
   const btn=$('assign-sbd-rooming');btn.disabled=true;
   try{await assignSubjectSbd(examId)}catch(error){message($('sbd-message'),error.message||String(error),'error')}finally{btn.disabled=false}
   return;
 }
 const totalLength=Number($('sbd-length')?.value||6);
 const prefixLength=Number($('sbd-prefix-length')?.value||2);
 const prefix=String($('sbd-prefix')?.value||'').trim();
 if(![6,8].includes(totalLength)){message($('sbd-message'),'Độ dài SBD chỉ được chọn 6 hoặc 8 chữ số.','error');return}
 if(![2,3].includes(prefixLength)||prefix.length!==prefixLength||!/^\d+$/.test(prefix)){
   message($('sbd-message'),`Tiền tố SBD phải gồm đúng ${prefixLength} chữ số. Ví dụ: ${prefixLength===2?'01':'001'}.`,'error');return
 }
 const suffixLength=totalLength-prefixLength;
 const maxNumber=10**suffixLength-1;
 const btn=$('assign-sbd-rooming');btn.disabled=true;
 try{
   if($('room-sort-mode').value==='elective_rooms'){await saveSbdRoomPreview();return}
   const candidates=await selectAllPages(()=>state.client.from('exam_candidates')
     .select('id,sbd,student_code,student_name,class_code,grade_code,date_of_birth').eq('exam_id',examId)
     .order('student_code').order('id'));
   if(!candidates?.length)throw new Error('Kỳ thi chưa có danh sách thí sinh.');
   const alreadyAssigned=candidates.filter(c=>String(c.sbd||'').trim());
   if(alreadyAssigned.length)throw new Error(`Kỳ thi này đã có ${alreadyAssigned.length} thí sinh được cấp SBD. Để bảo đảm mỗi thí sinh chỉ có một SBD trong kỳ thi, hệ thống không cấp lại/ghi đè. Nếu bạn mới thêm thí sinh, cần dùng chức năng cấp bổ sung SBD riêng.`);
   if(candidates.length>maxNumber)throw new Error(`Tiền tố ${prefix} với SBD ${totalLength} chữ số chỉ cấp được ${maxNumber.toLocaleString('vi-VN')} số; danh sách có ${candidates.length} thí sinh.`);
   const sortMode=$('room-sort-mode')?.value||'abc';
   let ordered=[...candidates];
   if(sortMode==='previous'){
     const previousExamId=$('room-previous-exam')?.value;
     if(!previousExamId)throw new Error('Hãy chọn kỳ thi trước để cấp SBD theo kết quả.');
     if(previousExamId===examId)throw new Error('Kỳ thi lấy kết quả phải khác kỳ thi đang cấp SBD.');
     const previous=await loadPreviousScores(previousExamId);
     for(const c of ordered){
       const keys=[String(c.student_code||'').trim()];
       c.previous_score=keys.map(k=>previous.map.get(k)).find(v=>v!==undefined)??null;
     }
     const missing=ordered.filter(c=>c.previous_score===null).length;
     if(missing)throw new Error(`Không tìm thấy kết quả kỳ thi trước cho ${missing} thí sinh. Hãy kiểm tra mã học sinh giữa hai kỳ thi.`);
     ordered.sort((a,b)=>Number(b.previous_score)-Number(a.previous_score)||compareVietnameseName(a.student_name,b.student_name)||String(a.student_code||'').localeCompare(String(b.student_code||''),undefined,{numeric:true}));
   }else{
     ordered.sort((a,b)=>compareVietnameseName(a.student_name,b.student_name)||String(a.student_code||'').localeCompare(String(b.student_code||''),undefined,{numeric:true}));
   }
   ordered=orderSbdGroups(ordered,$('sbd-groups').value,compareVietnameseName,sortMode);
   if($('sbd-exam-select').value!==examId)throw new Error('Kỳ thi đã thay đổi. Hãy thực hiện lại.');
   const assignments=ordered.map((c,i)=>({candidate_id:c.id,sbd:prefix+String(i+1).padStart(suffixLength,'0')}));
   const {data,error:rpcError}=await state.client.rpc('exam_assign_candidate_sbd',{p_exam_id:examId,p_assignments:assignments});
   if(rpcError)throw new Error(`Không lưu được SBD. Hãy chạy migration v0.1.41 trên đúng project Supabase. ${rpcError.message}`);
   clearSbdRoster();
   state.candidates=ordered.map((c,i)=>({...c,sbd:assignments[i].sbd}));
   state.sbdExamId=examId;
   state.sbdConfig={totalLength,prefixLength,prefix,sortMode};
   if(state.preview?.examId===examId)state.preview=null;
   if($('rooming-exam-select').value===examId){state.preview=null;$('save-rooming').disabled=true;$('lock-rooming').disabled=true;$('export-rooming').disabled=true;$('print-rooming-pdf').disabled=true;}
   message($('sbd-message'),`Đã cấp và lưu ${assignments.length} SBD duy nhất cho kỳ thi với tiền tố ${prefix}. Tiếp theo, tạo phương án xếp phòng; SBD sẽ được giữ nguyên khi xếp lại phòng.`,'success');
 }catch(e){message($('sbd-message'),e.message||String(e),'error')}
 finally{btn.disabled=false}
}
function compareVietnameseName(a,b){
 const parts=s=>String(s||'').trim().normalize('NFC').split(/\s+/).filter(Boolean);
 const ap=parts(a),bp=parts(b);
 const ag=ap.at(-1)||'',bg=bp.at(-1)||'';
 const am=ap.slice(1,-1).join(' '),bm=bp.slice(1,-1).join(' ');
 const af=ap[0]||'',bf=bp[0]||'';
 return ag.localeCompare(bg,'vi',{sensitivity:'base'}) ||
   am.localeCompare(bm,'vi',{sensitivity:'base'}) ||
   af.localeCompare(bf,'vi',{sensitivity:'base'});
}
function download(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
function downloadTemplate(){downloadExcelTemplate()}
function downloadSubjectTemplate(){
  if(!window.XLSX){message($('subject-message'),'Không tải được thư viện Excel. Hãy kiểm tra kết nối Internet.','error');return}
  const rows=[
    ['Mã DD Bộ GD&ĐT','Họ tên','Môn 1','Môn 2'],
    ['3156124098','Lưu Minh An','ANH','LY'],
    ['3151505467','Bùi Ngọc Anh','LY','ANH'],
    ['3168060544','Đào Phương Anh','SU','DIA']
  ];
  const ws=window.XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:22},{wch:28},{wch:22},{wch:22}];
  const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,'Chon mon');
  window.XLSX.writeFile(wb,'mau-chon-mon-lua-chon.xlsx');
}
function normalizeStudentCode(value){
  let s=String(value??'').replace(/[\u200B-\u200D\uFEFF\u00A0]/g,' ').trim();
  if(/^\d+\.0+$/.test(s))s=s.replace(/\.0+$/,'');
  return s;
}
function normalizeSubjectLabel(value){
  return String(value??'').trim().toLocaleLowerCase('vi-VN').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
}
function canonicalSubjectCode(value){
  const key=normalizeSubjectLabel(value);
  if(key==='ktpl'||key==='gdktpl')return 'KTPL';
  const aliases={
    toan:'TOAN',toanhoc:'TOAN',van:'VAN',nguvan:'VAN',nguvanhoc:'VAN',
    anh:'N1',tienganh:'N1',english:'N1',
    tiengnga:'N2',russian:'N2',nga:'N2',
    tiengphap:'N3',french:'N3',phap:'N3',
    tiengtrungquoc:'N4',tiengtrung:'N4',chinese:'N4',trungquoc:'N4',
    tiengduc:'N5',german:'N5',duc:'N5',
    tiengnhat:'N6',japanese:'N6',nhat:'N6',
    tienghan:'N7',korean:'N7',han:'N7',
    ly:'LY',vatli:'LY',vatly:'LY',vatlyhoc:'LY',physics:'LY',
    hoa:'HOA',hoahoc:'HOA',chemistry:'HOA',
    su:'SU',lichsu:'SU',history:'SU',
    dia:'DIA',diali:'DIA',dialy:'DIA',geography:'DIA',
    sinh:'SINH',sinhhoc:'SINH',biology:'SINH',
    tin:'TIN',tinhoc:'TIN',informatics:'TIN',
    gdktpl:'KTPL',giaoduckinhtephapluat:'KTPL'
  };
  const all=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];
  for(const item of all){
    if(key===normalizeSubjectLabel(item.code)||key===normalizeSubjectLabel(item.name))return item.code;
  }
  return aliases[key]||'';
}
function importSubjectCode(value){const raw=String(value??'').trim().toUpperCase().replace(/[.\s_-]+/g,'');const code=['KTPL','GDKTPL'].includes(raw)?'KTPL':raw==='ANH'?'N1':raw;return ['N1','N2','N3','N4','N5','N6','N7','SU','DIA','KTPL','LY','HOA','SINH','TIN'].includes(code)?code:''}
function initSubjectCatalog(){const select=$('subject-code');const all=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];select.innerHTML=all.map(s=>`<option value=\"${s.code}\">${s.name} (${s.code})</option>`).join('');initSubjectDeleteSelector()}
function initSubjectDeleteSelector(){
  $('subject-delete-code').innerHTML='<option value="">Tất cả môn thi</option>'+[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS]
    .map(subject=>`<option value="${esc(subject.code)}">${esc(subject.name)} (${esc(subject.code)})</option>`).join('');
  $('subject-delete-registrations').disabled=!$('subject-exam-select').value;
  $('subject-delete-registrations').onclick=deleteSubjectRegistrations;
  $('subject-exam-select').addEventListener('change',()=>{
    $('subject-delete-registrations').disabled=!$('subject-exam-select').value;
    $('subject-delete-message').classList.add('hidden');
  });
}
async function deleteSubjectRegistrations(){
  const examId=$('subject-exam-select').value;
  if(!examId){message($('subject-delete-message'),'Hãy chọn kỳ thi trước.','error');return}
  const subjectCode=$('subject-delete-code').value||null;
  const subjectText=subjectCode?`${subjectName(subjectCode)} (${subjectCode})`:'tất cả các môn';
  const exam=state.exams.find(item=>item.id===examId);
  if(!confirm(`Xóa đăng ký ${subjectText} của tất cả học sinh trong kỳ thi "${exam?.name||examId}"? Thao tác chỉ xóa lượt đăng ký/phân công môn; không xóa hồ sơ học sinh, cấu hình môn, điểm hoặc lịch sử chấm. Không thể tự hoàn tác.`))return;
  const button=$('subject-delete-registrations');
  button.disabled=true;
  try{
    const{data,error}=await state.client.rpc('exam_delete_subject_registrations',{
      p_exam_id:examId,p_subject_code:subjectCode
    });
    if(error)throw error;
    const count=Number(data?.deleted_count);
    if(!Number.isInteger(count)||count<0)throw new Error('CSDL không trả về số lượt đăng ký đã xóa hợp lệ.');
    message($('subject-delete-message'),`Đã xóa ${count} lượt đăng ký ${subjectText} của kỳ thi. Hồ sơ học sinh, cấu hình môn và dữ liệu điểm/phách được giữ nguyên.`, 'success');
    await loadSubjectRegistrations();
    await loadRosterData();
  }catch(error){
    message($('subject-delete-message'),`Không xóa được đăng ký môn: ${error.message||String(error)}`,'error');
  }finally{
    button.disabled=!$('subject-exam-select').value;
  }
}
function normalizeSubjectChoiceRows(rows){
  const cleanKey=v=>String(v??'').trim().toLocaleLowerCase('vi-VN').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
  const aliases={
    student_code:['studentcode','studentid','madinhdanh','maddbogddt','madd','mahs','mahocsinh','maddbogddt'],
    student_name:['studentname','hoten','hovaten','fullname'],
    subject1:['mon1','monthi1','monluachon1','subject1'],
    subject2:['mon2','monthi2','monluachon2','subject2'],
    subject_code:['subjectcode','mamon','monthi'],
    subject_order:['subjectorder','thutu','cathi'],
    subject_type:['subjecttype','loaimon','nhommon'],
    class_code:['classcode','lop','malop']
  };
  const get=(row,names)=>{
    for(const [k,v] of Object.entries(row||{})) if(names.includes(cleanKey(k)) && String(v??'').trim()) return String(v).trim();
    return '';
  };
  const result=[];
  const invalidRows=[];
  for(const [i,row] of rows.entries()){
    const studentCode=get(row,aliases.student_code)||String(row.student_code??'').trim();
    const studentName=get(row,aliases.student_name)||String(row.student_name??'').trim();
    const s1=get(row,aliases.subject1)||String(row.subject1??'').trim();
    const s2=get(row,aliases.subject2)||String(row.subject2??'').trim();
    if(s1||s2){
      if(!studentCode) throw new Error(`Dòng ${i+2}: thiếu Mã DD Bộ GD&ĐT.`);
      if(!s1||!s2) throw new Error(`Dòng ${i+2}: cần nhập đủ Môn 1 và Môn 2.`);
      const c1=importSubjectCode(s1), c2=importSubjectCode(s2);
      if(!c1) throw new Error(`Dòng ${i+2}: Môn 1 phải là mã môn hợp lệ (N1–N7 cho ngoại ngữ; SU, DIA, KTPL, LY, HOA, SINH, TIN cho các môn khác), không dùng tên môn. Giá trị hiện tại: "${s1}".`);
      if(!c2) throw new Error(`Dòng ${i+2}: Môn 2 phải là mã môn hợp lệ (N1–N7 cho ngoại ngữ; SU, DIA, KTPL, LY, HOA, SINH, TIN cho các môn khác), không dùng tên môn. Giá trị hiện tại: "${s2}".`);
      if(c1===c2){invalidRows.push({line:i+2,code:studentCode,name:studentName,reason:`trùng môn ${c1}`});continue;}
      result.push({student_code:studentCode,student_name:studentName,subject_code:c1,subject_order:1,subject_type:'elective'});
      result.push({student_code:studentCode,student_name:studentName,subject_code:c2,subject_order:2,subject_type:'elective'});
      continue;
    }
    // Generic row format: one registration per row.
    const subjectCode=get(row,aliases.subject_code)||String(row.subject_code??'').trim();
    if(subjectCode){
      const normalized=importSubjectCode(subjectCode);
      if(!normalized) throw new Error(`Dòng ${i+2}: cột subject_code phải chứa mã môn hợp lệ (N1–N7 cho ngoại ngữ; SU, DIA, KTPL, LY, HOA, SINH, TIN cho các môn khác), không dùng tên môn.`);
      result.push({
        student_code:studentCode,
        student_name:studentName,
        class_code:get(row,aliases.class_code)||String(row.class_code??'').trim(),
        subject_code:normalized,
        subject_order:get(row,aliases.subject_order)||String(row.subject_order??'').trim(),
        subject_type:(()=>{const t=(get(row,aliases.subject_type)||String(row.subject_type??'')).trim().toLowerCase();return ['required','batbuoc','mandatory','monbatbuoc'].includes(t)?'required':['class','tailop','montailop','monhocollop'].includes(t)?'class':'elective'})()
      });
      continue;
    }
    throw new Error(`Dòng ${i+2}: không nhận diện được cột Môn 1/Môn 2 hoặc subject_code. Hãy dùng đúng file Excel mẫu.`);
  }
  result.invalidRows=invalidRows;
  return result;
}
async function loadSubjectPickerCandidates(){
  const examId=$('subject-exam-select').value;
  const classBox=$('subject-class-picker'),studentClass=$('subject-student-class'),studentBox=$('subject-student-picker');
  classBox.innerHTML='';studentBox.innerHTML='';studentClass.innerHTML='<option value="">-- Chọn lớp --</option>';
  if(!examId){classBox.innerHTML='<div class="picker-empty">Hãy chọn kỳ thi trước.</div>';return}
  message($('subject-message'),'Đang tải danh sách lớp và học sinh...','info');
  try{
   state.subjectPickerCandidates=await selectAllPages(()=>state.client.from('exam_candidates')
    .select('id,student_code,student_name,grade_code,class_code').eq('exam_id',examId).order('class_code').order('student_name').order('id'));
  }catch(error){message($('subject-message'),`Không tải được danh sách lớp/học sinh: ${error.message}`,'error');return}
  const classes=[...new Set(state.subjectPickerCandidates.map(s=>String(s.class_code||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  if(!classes.length){classBox.innerHTML='<div class="picker-empty">Kỳ thi chưa có hồ sơ thí sinh.</div>';studentBox.innerHTML='<div class="picker-empty">Chưa có học sinh.</div>';return}
  classBox.innerHTML=classes.map((c,i)=>`<label class="picker-option"><input type="checkbox" class="subject-class-check" value="${esc(c)}"><span>${esc(c)} <small>(${state.subjectPickerCandidates.filter(s=>String(s.class_code||'').trim()===c).length} học sinh)</small></span></label>`).join('');
  studentClass.innerHTML+='<option value="">-- Chọn lớp --</option>'+classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  studentBox.innerHTML='<div class="picker-empty">Chọn lớp để hiển thị danh sách học sinh.</div>';
  message($('subject-message'),'Đã tải danh sách lớp và học sinh.','success');
}
function renderSubjectStudentPicker(){
  const classCode=$('subject-student-class').value;
  const box=$('subject-student-picker');
  if(!classCode){box.innerHTML='<div class="picker-empty">Chọn lớp để hiển thị danh sách học sinh.</div>';return}
  const students=(state.subjectPickerCandidates||[]).filter(s=>String(s.class_code||'').trim()===classCode);
  if(!students.length){box.innerHTML='<div class="picker-empty">Lớp này chưa có học sinh trong kỳ thi.</div>';return}
  box.innerHTML=students.map(st=>`<label class="picker-option"><input type="checkbox" class="subject-student-check" value="${esc(st.id)}"><span>${esc(st.student_code||'')} — ${esc(st.student_name||'')}</span></label>`).join('');
}
async function applySubject(){
  const examId=$('subject-exam-select').value;
  if(!examId){message($('subject-message'),'Hãy chọn kỳ thi.','error');return}
  const scope=$('subject-scope').value;
  const type=$('subject-mode').value;
  const selectedCode=$('subject-code').value;
  const selectedOrder=type==='elective'?Number($('subject-order').value):null;
  try{
    let targets=[];
    let sourceStudentCount=0;
    const students=await selectAllPages(()=>state.client.from('exam_candidates')
      .select('id,student_code,student_name,grade_code,class_code').eq('exam_id',examId).order('student_code').order('id'));
    const byCode=new Map();
    for(const st of students){
      const k=normalizeStudentCode(st.student_code);
      if(k){if(byCode.has(k))throw new Error(`CSDL có mã học sinh trùng "${k}" trong kỳ thi. Cần xử lý trùng trước khi nhập.`);byCode.set(k,st)}
    }
    if(scope==='file'){
      const f=$('subject-csv').files[0];
      if(!f)throw new Error('Hãy chọn file Excel .xlsx hoặc CSV .csv đăng ký môn.');
      message($('subject-message'),`Đang đọc file ${f.name}...`,'info');
      const rawRows=await parseUploadFile(f);
      if(!rawRows.length)throw new Error('File không có dữ liệu.');
      const rows=normalizeSubjectChoiceRows(rawRows);
      if(!rows.length)throw new Error('Không tìm thấy dòng đăng ký hợp lệ trong file.');
      const seenPairs=new Set();
      const matchedStudentCodes=new Set();
      for(const [i,r] of rows.entries()){
        const studentCode=normalizeStudentCode(r.student_code);
        const classCode=String(r.class_code||'').trim();
        const studentName=String(r.student_name||'').trim();
        let student=studentCode?byCode.get(studentCode):null;
        if(!student && studentName){
          const nameMatches=students.filter(st=>String(st.student_name||'').trim().toLocaleLowerCase('vi-VN')===studentName.toLocaleLowerCase('vi-VN'));
          if(nameMatches.length===1)student=nameMatches[0];
          else if(nameMatches.length>1)throw new Error(`Dòng ${i+2}: họ tên "${studentName}" trùng ở nhiều hồ sơ; cần đối chiếu mã định danh.`);
        }
        if(!student && !studentCode && classCode){
          const classMatches=students.filter(st=>String(st.class_code||'').trim().toUpperCase()===classCode.toUpperCase());
          if(!classMatches.length)throw new Error(`Dòng ${i+2}: không tìm thấy lớp "${classCode}" trong kỳ thi.`);
          const rowSubject=canonicalSubjectCode(r.subject_code||selectedCode);
          if(!rowSubject)throw new Error(`Dòng ${i+2}: mã/tên môn không hợp lệ.`);
          const rowType=String(r.subject_type||type).trim().toLowerCase()==='required'?'required':'elective';
          const rowOrder=rowType==='elective'?Number(r.subject_order||selectedOrder):null;
          if(rowType==='elective'&&![1,2].includes(rowOrder))throw new Error(`Dòng ${i+2}: môn lựa chọn cần thứ tự ca 1 hoặc 2.`);
          for(const st of classMatches){
            const pair=`${st.id}|${rowSubject}|${rowType}|${rowOrder??''}`;
            if(!seenPairs.has(pair)){targets.push({candidate_id:st.id,subject_code:rowSubject,subject_order:rowOrder,subject_type:rowType});seenPairs.add(pair)}
          }
          continue;
        }
        if(!student)throw new Error(`Dòng ${i+2}: không tìm thấy học sinh theo mã "${studentCode||'(trống)'}"${studentName?` hoặc họ tên "${studentName}"`:''}. Mã trong Excel phải khớp exam_candidates.student_code.`);
        if(studentCode && normalizeStudentCode(student.student_code)!==studentCode)throw new Error(`Dòng ${i+2}: mã định danh không khớp hồ sơ.`);
        const rowSubject=canonicalSubjectCode(r.subject_code||selectedCode);
        if(!rowSubject)throw new Error(`Dòng ${i+2}: mã/tên môn "${r.subject_code||selectedCode}" không thuộc danh mục được phép.`);
        const rawType=String(r.subject_type||type).trim().toLowerCase();
      const rowType=['required','batbuoc','mandatory'].includes(rawType)?'required':['class','tai lop','tailop','mon tai lop'].includes(rawType)?'class':'elective';
        const rowOrder=rowType==='elective'?Number(r.subject_order||selectedOrder):null;
        if(rowType==='elective'&&![1,2].includes(rowOrder))throw new Error(`Dòng ${i+2}: môn lựa chọn cần thứ tự ca 1 hoặc 2.`);
        if(rowType==='required'&&rowOrder!==null)throw new Error(`Dòng ${i+2}: môn bắt buộc không được gán thứ tự ca lựa chọn.`);
        const pair=`${student.id}|${rowSubject}|${rowType}|${rowOrder??''}`;
        if(seenPairs.has(pair))throw new Error(`Dòng ${i+2}: đăng ký trùng ${rowSubject} cho học sinh ${studentCode||student.student_code}.`);
        seenPairs.add(pair);
        matchedStudentCodes.add(String(student.id));
        targets.push({candidate_id:student.id,subject_code:rowSubject,subject_order:rowOrder,subject_type:rowType});
      }
      sourceStudentCount=matchedStudentCodes.size || new Set(targets.map(t=>t.candidate_id)).size;
    }else{
      if(scope==='grade'){
        const grade=$('subject-grade').value;
        if(!grade)throw new Error('Hãy chọn khối áp dụng.');
        targets=students.filter(st=>String(st.grade_code||'')===grade);
      }else if(scope==='class'){
        const selectedClasses=[...document.querySelectorAll('.subject-class-check:checked')].map(el=>el.value);
        if(!selectedClasses.length)throw new Error('Hãy chọn ít nhất một lớp bằng checkbox.');
        const classSet=new Set(selectedClasses.map(c=>c.toUpperCase()));
        targets=students.filter(st=>classSet.has(String(st.class_code||'').trim().toUpperCase()));
      }else if(scope==='class_students'){
        const classCode=$('subject-student-class').value;
        if(!classCode)throw new Error('Hãy chọn lớp trước.');
        const ids=[...document.querySelectorAll('.subject-student-check:checked')].map(el=>String(el.value));
        if(!ids.length)throw new Error('Hãy chọn ít nhất một học sinh bằng checkbox.');
        const byId=new Map(students.filter(st=>String(st.class_code||'').trim()===classCode).map(st=>[String(st.id),st]));
        const missing=ids.filter(id=>!byId.has(id));
        if(missing.length)throw new Error('Một số học sinh được chọn không thuộc lớp đã chọn. Hãy tải lại danh sách.');
        targets=ids.map(id=>byId.get(id));
      }else if(scope==='student'){
        const studentCode=normalizeStudentCode($('subject-student-code').value);
        if(!studentCode)throw new Error('Hãy nhập mã học sinh.');
        const st=byCode.get(studentCode);targets=st?[st]:[];
      }else throw new Error('Phạm vi áp dụng không hợp lệ.');
      sourceStudentCount=targets.length;
      targets=targets.map(st=>({candidate_id:st.id,subject_code:selectedCode,subject_order:selectedOrder,subject_type:type}));
    }
    if(!targets.length)throw new Error('Không tìm thấy học sinh phù hợp với phạm vi áp dụng.');
    const allowed=new Set(['TOAN','VAN','N1','N2','N3','N4','N5','N6','N7','ANH','SU','DIA','KTPL','LY','HOA','SINH','TIN']);
    for(const t of targets){
      t.subject_code=canonicalSubjectCode(t.subject_code)||String(t.subject_code||'').trim().toUpperCase();
      if(!allowed.has(t.subject_code))throw new Error(`Mã môn "${t.subject_code}" không nằm trong danh mục CSDL cho phép.`);
      if(!['required','elective'].includes(t.subject_type))throw new Error(`Loại môn không hợp lệ: ${t.subject_type}.`);
      if(t.subject_type==='elective'&&![1,2].includes(Number(t.subject_order)))throw new Error(`Môn ${t.subject_code}: thứ tự ca phải là 1 hoặc 2.`);
      if(t.subject_type!=='elective')t.subject_order=null;
    }
    const payloadMap=new Map();
    for(const t of targets){
      const key=`${t.candidate_id}|${t.subject_code}`;
      if(payloadMap.has(key)){
        const previous=payloadMap.get(key);
        if(previous.subject_type!==t.subject_type||previous.subject_order!==t.subject_order)throw new Error(`Học sinh có đăng ký xung đột môn ${t.subject_code} ở nhiều loại/ca.`);
        continue;
      }
      payloadMap.set(key,{...t,exam_id:examId});
    }
    const payload=[...payloadMap.values()];
    const electivePayload=payload.filter(x=>x.subject_type==='elective');
    if(scope==='file'&&!electivePayload.length)throw new Error('File đã đọc nhưng không tạo ra đăng ký môn lựa chọn nào. Hãy kiểm tra cột Môn 1/Môn 2 và giá trị trong file.');
    message($('subject-message'),`Đã đối chiếu ${payload.length} lượt đăng ký của ${sourceStudentCount} học sinh. Đang ghi dữ liệu lên Supabase...`,'info');
    const batchSize=100;
    for(let offset=0;offset<payload.length;offset+=batchSize){
      const batch=payload.slice(offset,offset+batchSize);
      const {error}=await state.client.from('exam_candidate_subjects').upsert(batch,{onConflict:'exam_id,candidate_id,subject_code'});
      if(error)throw new Error(`Supabase từ chối lô ${Math.floor(offset/batchSize)+1} (đã gửi ${offset}/${payload.length} lượt). ${error.code||''} ${error.message||''} ${error.details||''} ${error.hint||''}`.trim());
      message($('subject-message'),`Đang ghi đăng ký môn: ${Math.min(offset+batch.length,payload.length)}/${payload.length} lượt...`,'info');
    }
    const electiveCodes=[...new Set(electivePayload.map(x=>x.subject_code))];
    const persistedByCode={},expectedByCode={};
    for(const subjectCode of electiveCodes){
      const records=electivePayload.filter(x=>x.subject_code===subjectCode);
      const expectedKeys=new Set(records.map(x=>`${x.candidate_id}|${x.subject_order}`));
      expectedByCode[subjectCode]=expectedKeys.size;
      const persistedKeys=new Set();
      for(const orderValue of [1,2]){
        const orderRecords=records.filter(x=>Number(x.subject_order)===orderValue);
        for(let offset=0;offset<orderRecords.length;offset+=100){
          const batch=orderRecords.slice(offset,offset+100);
          const ids=[...new Set(batch.map(x=>x.candidate_id))];
          const {data,error:verifyError}=await state.client.from('exam_candidate_subjects')
            .select('candidate_id,subject_code,subject_type,subject_order')
            .eq('exam_id',examId).eq('subject_code',subjectCode).eq('subject_type','elective')
            .eq('subject_order',orderValue).in('candidate_id',ids);
          if(verifyError)throw new Error(`Không xác minh được môn ${subjectCode}, ca ${orderValue} trên CSDL: ${verifyError.message}`);
          for(const row of data||[])persistedKeys.add(`${row.candidate_id}|${row.subject_order}`);
        }
      }
      persistedByCode[subjectCode]=[...expectedKeys].filter(k=>persistedKeys.has(k)).length;
    }
    await loadSubjectRegistrations();
    const verificationLines=electiveCodes.map(c=>`${subjectName(c)} (${c}): dự kiến ${expectedByCode[c]}, xác minh ${persistedByCode[c]}`);
    const mismatch=electiveCodes.some(c=>persistedByCode[c]!==expectedByCode[c]);
    if(mismatch){
      message($('subject-message'),`ĐÃ GHI NHƯNG XÁC MINH KHÔNG KHỚP. ${verificationLines.join('; ')}. Không nhập lại ngay; kiểm tra dữ liệu và lỗi Supabase trước.`,'error');
    }else{
      message($('subject-message'),`THÀNH CÔNG: đã xác minh ${sourceStudentCount} học sinh và ${electivePayload.length} lượt đăng ký lựa chọn trên Supabase. ${verificationLines.join('; ')}.`,'success');
    }
  }catch(e){message($('subject-message'),`Không hoàn tất nhập môn: ${e?.message||String(e)}`,'error')}
}
async function loadSubjectRegistrations(){
  const examId=$('subject-exam-select').value;
  const body=$('subject-table-body');
  // Keep headers synchronized even if an older index.html is cached or deployed.
  const subjectTable=body.closest('table');
  if(subjectTable){
    const thead=subjectTable.querySelector('thead');
    if(thead)thead.innerHTML='<tr><th>Mã môn</th><th>Tên môn</th><th>Loại môn</th><th>Thứ tự ca</th><th>Số học sinh đã áp dụng</th><th>Thao tác</th></tr>';
  }
  if(!examId){message($('subject-message'),'Hãy chọn kỳ thi.','error');body.innerHTML='';return}
  // Supabase/PostgREST can cap each response at 1,000 rows. Fetch all pages
  // so 533 TOAN + 533 VAN registrations are not truncated to 1,000 total.
  let regs=[];
  const pageSize=500;
  for(let offset=0;;offset+=pageSize){
    const {data:page,error}=await state.client.from('exam_candidate_subjects')
      .select('candidate_id,subject_code,subject_type,subject_order')
      .eq('exam_id',examId).order('subject_code').order('candidate_id').order('subject_order')
      .range(offset,offset+pageSize-1);
    if(error){message($('subject-message'),`Không tải được thống kê môn: ${error.message}`,'error');return}
    const batch=page||[];
    regs.push(...batch);
    if(batch.length<pageSize)break;
  }
  body.innerHTML='';
  if(!regs||!regs.length){
    const catalog=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];
    body.innerHTML=catalog.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>—</td><td>—</td><td><strong>0</strong></td><td>—</td></tr>`).join('');
    message($('subject-message'),'Đã truy vấn Supabase thành công nhưng kỳ thi này chưa có bản ghi đăng ký môn nào. Các môn hiển thị số 0.','info');
    return;
  }
  // Summarize by subject/type/order and count unique candidates, not raw rows.
  const summary=new Map();
  for(const r of regs){
    const code=String(r.subject_code||'').trim().toUpperCase();
    // TOAN and VAN are compulsory subjects; legacy rows may contain inconsistent type/order values.
    const isCompulsory=['TOAN','VAN'].includes(code)||r.subject_type==='required';
    const type=isCompulsory?'required':'elective';
    const order=isCompulsory?'':(r.subject_order??'');
    const key=[code,type,String(order)].join('|');
    if(!summary.has(key))summary.set(key,{code,type,order,students:new Set()});
    if(r.candidate_id!==null&&r.candidate_id!==undefined)summary.get(key).students.add(String(r.candidate_id));
  }
  const rows=[...summary.values()];
  const present=new Set(rows.map(r=>r.code));
  for(const item of [{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS]){
    if(!present.has(item.code))rows.push({code:item.code,type:'',order:'',students:new Set()});
  }
  rows.sort((a,b)=>a.code.localeCompare(b.code,'vi')||a.type.localeCompare(b.type)||Number(a.order||0)-Number(b.order||0));
  for(const r of rows){
    const name=subjectName(r.code)||({TOAN:'Toán',VAN:'Ngữ văn'}[r.code]||r.code);
    body.insertAdjacentHTML('beforeend',`<tr><td>${esc(r.code)}</td><td>${esc(name)}</td><td>${r.type==='required'?'Bắt buộc':r.type==='elective'?'Lựa chọn':'—'}</td><td>${r.order===''?'—':esc(r.order)}</td><td><strong>${r.students.size.toLocaleString('vi-VN')}</strong></td><td><button type="button" class="btn btn-light btn-small subject-manage-open" data-code="${esc(r.code)}" data-type="${esc(r.type||"elective")}" data-order="${esc(r.order)}">Sửa / Xóa</button></td></tr>`);
  }
  body.querySelectorAll('.subject-manage-open').forEach(btn=>btn.onclick=()=>openSubjectManager({
    examId,code:btn.dataset.code,type:btn.dataset.type,order:btn.dataset.order
  }));
  message($('subject-message'),`Đã tải ${regs.length} bản ghi đăng ký từ Supabase cho kỳ thi đang chọn. Số lượng trong bảng là số học sinh duy nhất theo môn/ca.`, 'success');

}
let subjectManageContext=null;
async function openSubjectManager(ctx){
  subjectManageContext=ctx;
  const dialog=$('subject-manage-dialog');
  $('subject-manage-title').textContent=`Quản lý môn ${ctx.code}`;
  $('subject-manage-subtitle').textContent=`${ctx.type==='required'?'Môn bắt buộc':'Môn lựa chọn'}${ctx.order?` · ca ${ctx.order}`:''}. Có thể xóa đăng ký hoặc chuyển học sinh sang môn khác.`;
  $('subject-manage-action').value='remove';
  $('subject-manage-target-wrap').classList.add('hidden');
  const opts=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS].filter(x=>x.code!==ctx.code);
  $('subject-manage-target').innerHTML=opts.map(x=>`<option value="${esc(x.code)}">${esc(x.name)} (${esc(x.code)})</option>`).join('');
  message($('subject-manage-message'),'Đang tải đăng ký môn...','info');
  dialog.showModal();
  await refreshSubjectManager();
}
async function refreshSubjectManager(){
  if(!subjectManageContext)return;
  const {examId,code,type,order}=subjectManageContext;
  const currentBox=$('subject-manage-current'),availableBox=$('subject-manage-available');
  let registrations,candidates;
  try{
   [registrations,candidates]=await Promise.all([
    selectAllPages(()=>state.client.from('exam_candidate_subjects').select('candidate_id,subject_code,subject_type,subject_order').eq('exam_id',examId).eq('subject_code',code).eq('subject_type',type).order('candidate_id').order('subject_order')),
    selectAllPages(()=>state.client.from('exam_candidates').select('id,student_code,student_name,class_code,grade_code').eq('exam_id',examId).order('class_code').order('student_name').order('id'))
   ]);
  }catch(error){message($('subject-manage-message'),error.message,'error');return}
  const matches=registrations.filter(r=>type!=='elective'||String(r.subject_order??'')===String(order??''));
  const registeredIds=new Set(matches.map(r=>String(r.candidate_id)));
  const byId=new Map(candidates.map(c=>[String(c.id),c]));
  currentBox.innerHTML=matches.length?matches.map(r=>{
    const c=byId.get(String(r.candidate_id));
    return c?`<label class="picker-option"><input type="checkbox" class="subject-manage-current-check" value="${esc(c.id)}"><span>${esc(c.student_code||'')} — ${esc(c.student_name||'')} <small>(${esc(c.class_code||'')})</small></span></label>`:'';
  }).join(''):'<div class="picker-empty">Chưa có học sinh đăng ký môn này.</div>';
  const available=candidates.filter(c=>!registeredIds.has(String(c.id)));
  availableBox.innerHTML=available.length?available.map(c=>`<label class="picker-option"><input type="checkbox" class="subject-manage-add-check" value="${esc(c.id)}"><span>${esc(c.student_code||'')} — ${esc(c.student_name||'')} <small>(${esc(c.class_code||'')})</small></span></label>`).join(''):'<div class="picker-empty">Tất cả học sinh đã đăng ký môn này.</div>';
  message($('subject-manage-message'),`Đã đăng ký: ${matches.length} học sinh. Có thể chọn học sinh ở danh sách dưới để thêm vào môn này.`,'success');
}
async function saveSubjectManager(){
  if(!subjectManageContext)return;
  const ctx=subjectManageContext;
  const action=$('subject-manage-action').value;
  const removeIds=[...document.querySelectorAll('.subject-manage-current-check:checked')].map(x=>x.value);
  const addIds=[...document.querySelectorAll('.subject-manage-add-check:checked')].map(x=>x.value);
  try{
    if(action==='remove'&&removeIds.length){
      const {error}=await state.client.from('exam_candidate_subjects').delete().eq('exam_id',ctx.examId).eq('subject_code',ctx.code).eq('subject_type',ctx.type).in('candidate_id',removeIds);
      if(error)throw error;
    }else if(action==='move'){
      if(!removeIds.length)throw new Error('Hãy chọn học sinh cần chuyển sang môn khác.');
      const targetCode=$('subject-manage-target').value;
      const targetOrder=ctx.type==='elective'?(ctx.order==='2'?2:1):null;
      const payload=removeIds.map(id=>({exam_id:ctx.examId,candidate_id:id,subject_code:targetCode,subject_type:ctx.type,subject_order:targetOrder}));
      const {error}=await state.client.from('exam_candidate_subjects').upsert(payload,{onConflict:'exam_id,candidate_id,subject_code'});
      if(error)throw error;
      const {error:delError}=await state.client.from('exam_candidate_subjects').delete().eq('exam_id',ctx.examId).eq('subject_code',ctx.code).eq('subject_type',ctx.type).in('candidate_id',removeIds);
      if(delError)throw delError;
    }
    if(addIds.length){
      const payload=addIds.map(id=>({exam_id:ctx.examId,candidate_id:id,subject_code:ctx.code,subject_type:ctx.type,subject_order:ctx.type==='elective'?(Number(ctx.order)||1):null}));
      const {error}=await state.client.from('exam_candidate_subjects').upsert(payload,{onConflict:'exam_id,candidate_id,subject_code'});
      if(error)throw error;
    }
    message($('subject-manage-message'),'Đã lưu thay đổi.','success');
    await refreshSubjectManager();
    await loadSubjectRegistrations();
  }catch(e){message($('subject-manage-message'),e.message,'error')}
}
const ROSTER_ELECTIVES=SUBJECTS.filter(s=>!['TOAN','VAN'].includes(s.code));
function rosterExamId(){return $('subject-exam-select').value||$('rooming-exam-select').value||state.selectedExam}
function rosterOptions(selected=''){return '<option value="">-- Chưa chọn --</option>'+ROSTER_ELECTIVES.map(s=>`<option value="${esc(s.code)}" ${s.code===selected?'selected':''}>${esc(s.name)} (${esc(s.code)})</option>`).join('')}
function fillSelect(id,values,placeholder,selected=''){const el=$(id);el.innerHTML=`<option value="">${placeholder}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(values.includes(selected))el.value=selected}
function rosterClassCodes(grade){return [...new Set(state.rosterCandidates.filter(c=>!grade||String(c.grade_code)===String(grade)).map(c=>String(c.class_code||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}))}
function rosterGrades(){return [...new Set(state.rosterCandidates.map(c=>String(c.grade_code||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}))}
async function loadRosterData(){
 const examId=rosterExamId();if(!examId){message($('roster-message'),'Hãy chọn kỳ thi trước.','error');return}
 message($('roster-message'),'Đang tải danh sách học sinh và môn đã đăng ký...','info');
 let candidates,regs;
 try{
  [candidates,regs]=await Promise.all([
   selectAllPages(()=>state.client.from('exam_candidates').select('id,student_code,student_name,grade_code,class_code,is_overage')
    .eq('exam_id',examId).order('grade_code').order('class_code').order('student_name').order('id')),
   selectAllPages(()=>state.client.from('exam_candidate_subjects').select('candidate_id,subject_code,subject_type,subject_order')
    .eq('exam_id',examId).order('candidate_id').order('subject_code').order('subject_order'))
  ]);
 }catch(error){
  message($('roster-message'),`Không tải đủ dữ liệu kỳ thi: ${error.message}. Nếu báo thiếu cột is_overage, hãy chạy migration SQL đi kèm.`, 'error');
  return;
 }
 state.rosterCandidates=candidates;state.rosterRegs=regs;rosterLoadedExamId=examId;state.rosterDirty.clear();state.rosterPage=0;
 const grades=rosterGrades();fillSelect('roster-grade',grades,'-- Chọn khối --',$('roster-grade').value);fillSelect('overage-grade',grades,'-- Chọn khối --',$('overage-grade').value);fillSelect('roster-stats-grade',grades,'-- Chọn khối --',$('roster-stats-grade').value);
 syncRosterClassFilters();syncOverageClassFilters();renderRosterTable();renderRosterStats();message($('roster-message'),`Đã tải ${candidates.length.toLocaleString('vi-VN')} học sinh và ${regs.length.toLocaleString('vi-VN')} lượt đăng ký môn.`, 'success');
}

async function importRosterElectivesFromExcel(){
  const importStatus=(text,type='info')=>{
    const status=$('roster-import-status');
    if(!status)return;
    status.textContent=text;
    status.style.color=type==='error'?'#b42318':type==='success'?'#166534':'#64748b';
  };
  const examId=rosterExamId(),file=$('roster-excel-file').files?.[0];
  if(!examId){importStatus('Chưa thực hiện: hãy chọn kỳ thi trước.','error');message($('roster-message'),'Hãy chọn kỳ thi trước khi nạp Excel.','error');return}
  if(!file){importStatus('Chưa thực hiện: hãy chọn file Excel hoặc CSV.','error');message($('roster-message'),'Hãy chọn file Excel/CSV cần nạp.','error');return}
  const btn=$('roster-import-btn');btn.disabled=true;const old=btn.textContent;btn.textContent='Đang kiểm tra...';
  importStatus(`Đang đọc và kiểm tra ${file.name}...`,'info');
  try{
    if(rosterLoadedExamId!==examId || !state.rosterCandidates.length || state.rosterCandidates.some(c=>!Object.prototype.hasOwnProperty.call(c,'id'))) await loadRosterData();
    if(rosterLoadedExamId!==examId || !state.rosterCandidates.length)throw new Error('Không tải được danh sách thí sinh của kỳ thi. Hãy kiểm tra kỳ thi đang chọn và thông báo tải danh sách ở phía trên trước khi nhập Excel.');
    const rawRows=await parseUploadFile(file);
    const parsed=normalizeSubjectChoiceRows(rawRows);
    const fileWarnings=parsed.invalidRows||[];
    if(!parsed.length)throw new Error(fileWarnings.length?`Không có học sinh hợp lệ để nhập. ${fileWarnings.length} dòng bị bỏ qua do trùng môn: ${fileWarnings.slice(0,8).map(x=>`dòng ${x.line} ${x.code} (${x.name}): ${x.reason}`).join('; ')}${fileWarnings.length>8?'…':''}`:'File không có dòng đăng ký môn hợp lệ.');
    const candidateByCode=new Map();
    for(const c of state.rosterCandidates){
      const code=normalizeStudentCode(c.student_code);
      if(!code)continue;
      if(candidateByCode.has(code))throw new Error(`Mã học sinh ${code} bị trùng trong danh sách thí sinh của kỳ thi; cần xử lý trùng trước khi import.`);
      candidateByCode.set(code,c);
    }
    const seen=new Set(),mapped=[],missing=[];
    for(let i=0;i<parsed.length;i++){
      const r=parsed[i],code=normalizeStudentCode(r.student_code);
      if(!code)throw new Error(`Dòng Excel ${i+2}: thiếu mã học sinh.`);
      const rowKey=`${code}|${Number(r.subject_order)}`;
      if(seen.has(rowKey))throw new Error(`Dòng Excel ${i+2}: mã học sinh ${code} bị lặp Môn ${r.subject_order}.`);
      seen.add(rowKey);
      const c=candidateByCode.get(code);
      if(!c){missing.push({line:i+2,code,name:r.student_name||''});continue}
      const m1=importSubjectCode(r.subject_code);
      // normalizeSubjectChoiceRows emits two records per student, preserving the subject_order.
      const subjectType=['required','class'].includes(r.subject_type)?r.subject_type:'elective';
      const subjectOrder=subjectType==='elective'?Number(r.subject_order):null;
      if(subjectType==='elective'&&![1,2].includes(subjectOrder))throw new Error(`Dòng Excel ${i+2}: môn lựa chọn phải có thứ tự ca 1 hoặc 2.`);
      mapped.push({candidate:c,code,subject_code:m1,subject_order:subjectOrder,subject_type:subjectType});
    }
    const missingWarning=missing.length?`${missing.length} mã học sinh trong Excel không có trong danh sách thí sinh của kỳ thi và đã được bỏ qua: ${missing.slice(0,8).map(x=>`dòng ${x.line}: ${x.code}${x.name?` (${x.name})`:''}`).join('; ')}${missing.length>8?'…':''}.` : '';
    if(!mapped.length)throw new Error(`Không tìm thấy mã học sinh nào trong file ở danh sách thí sinh của kỳ thi đang chọn. ${missingWarning} Hãy kiểm tra kỳ thi hoặc nạp hồ sơ thí sinh trước.`);
    const byCandidate=new Map();
    for(const r of mapped){
      if(!r.subject_code)throw new Error(`Dữ liệu môn không hợp lệ ở mã học sinh ${r.code}.`);
      const k=String(r.candidate.id);if(!byCandidate.has(k))byCandidate.set(k,{candidate:r.candidate,rows:[]});
      const item=byCandidate.get(k),duplicate=item.rows.some(x=>x.subject_code===r.subject_code&&x.subject_type===r.subject_type&&x.subject_order===r.subject_order);
      if(duplicate)throw new Error(`Mã học sinh ${r.code} bị trùng môn ${r.subject_code}.`);
      item.rows.push(r);
    }
    const invalidRows=fileWarnings.map(x=>`dòng ${x.line} — ${x.code}${x.name?` (${x.name})`:''}: ${x.reason}`),invalidCodes=new Set();
    for(const [id,item] of byCandidate){
      const elective=item.rows.filter(row=>row.subject_type==='elective');
      if(elective.length&&(!elective.some(row=>row.subject_order===1)||!elective.some(row=>row.subject_order===2))){invalidRows.push(`${item.candidate.student_code}: thiếu đủ Môn lựa chọn 1 và 2`);invalidCodes.add(id)}
    }
    const validCandidates=[...byCandidate.entries()].filter(([id])=>!invalidCodes.has(id));
    if(!validCandidates.length)throw new Error(`Không có học sinh nào đủ điều kiện nhập. ${invalidRows.slice(0,12).join('; ')}`);
    const payload=[];
    for(const [id,item] of validCandidates){
      for(const row of item.rows)payload.push({exam_id:examId,candidate_id:id,subject_code:row.subject_code,subject_type:row.subject_type,subject_order:row.subject_order});
    }
    message($('roster-message'),`Đã kiểm tra ${byCandidate.size} học sinh, ${payload.length} lượt môn. Đang lưu vào Supabase...`,'info');
    importStatus(`Đã kiểm tra ${byCandidate.size} học sinh. Đang ghi ${payload.length} lượt môn vào CSDL...`,'info');
    for(let offset=0;offset<payload.length;offset+=100){
      const batch=payload.slice(offset,offset+100);
      const {error}=await state.client.from('exam_candidate_subjects').upsert(batch,{onConflict:'exam_id,candidate_id,subject_code'});
      if(error)throw new Error(`Supabase từ chối dữ liệu ở lô ${Math.floor(offset/100)+1}: ${error.message}${error.details?` (${error.details})`:''}`);
      const saved=Math.min(offset+batch.length,payload.length);
      message($('roster-message'),`Đang lưu môn lựa chọn ${saved}/${payload.length}...`,'info');
      importStatus(`Đang ghi vào CSDL: ${saved}/${payload.length} lượt môn...`,'info');
    }
    // Remove old elective subjects no longer present for each imported student, preserving required subjects.
    let deleted=0;
    for(const [id,item] of validCandidates){
      const keep=new Set(item.rows.filter(row=>row.subject_type==='elective').map(row=>String(row.subject_code).toUpperCase()));
      const oldRows=state.rosterRegs.filter(r=>String(r.candidate_id)===id&&r.subject_type==='elective'&&!['TOAN','VAN'].includes(String(r.subject_code).toUpperCase()));
      if(!keep.size)continue;
      for(const oldRow of oldRows){
        if(keep.has(String(oldRow.subject_code).toUpperCase()))continue;
        const {error}=await state.client.from('exam_candidate_subjects').delete().eq('exam_id',examId).eq('candidate_id',id).eq('subject_code',oldRow.subject_code).eq('subject_type','elective');
        if(error)throw new Error(`Đã ghi môn mới nhưng chưa xóa được môn cũ ${oldRow.subject_code} của mã ${item.candidate.student_code}: ${error.message}. Tải lại danh sách và kiểm tra dữ liệu.`);
        deleted++;
      }
    }
    await loadRosterData();
    await loadSubjectRegistrations();
    const counts={};for(const p of payload)counts[p.subject_code]=(counts[p.subject_code]||0)+1;
    const summary=Object.entries(counts).sort((a,b)=>a[0].localeCompare(b[0])).map(([code,n])=>`${code}: ${n}`).join(', ');
    const warning=[missingWarning,invalidRows.length?` CẦN KIỂM TRA ${invalidRows.length} học sinh/dòng do thiếu hoặc trùng môn: ${invalidRows.slice(0,10).join('; ')}${invalidRows.length>10?'…':''}. Các dòng này được giữ nguyên, không bị ghi đè.`:''].filter(Boolean).join(' ');
    const resultType=invalidRows.length?'error':'success';
    const resultText=`NẠP THÀNH CÔNG: ${validCandidates.length} học sinh, ${payload.length} lượt đăng ký đã được lưu và tải xác minh lại từ Supabase. ${deleted} đăng ký cũ không còn trong file đã được loại bỏ. Thống kê theo mã môn: ${summary}.${warning}`;
    message($('roster-message'),resultText,resultType);
    importStatus(invalidRows.length?`Đã lưu xong nhưng cần kiểm tra ${invalidRows.length} dòng bị bỏ qua.`:`Nạp thành công: đã lưu ${validCandidates.length} học sinh và ${payload.length} lượt môn.` ,resultType);
    $('roster-excel-file').value='';
  }catch(e){
    const detail=e?.message||String(e);
    const hint=/exam_candidate_subjects_subject_code_check/i.test(detail)
      ?' CSDL chưa chạy migration v0.1.89 để chuẩn hóa GDKTPL về KTPL và cho phép mã môn hiện hành.'
      :'';
    importStatus(`Nạp thất bại: ${detail}${hint}`,'error');
    message($('roster-message'),`Không nạp được Excel: ${detail}${hint}`,'error')
  }
  finally{btn.disabled=false;btn.textContent=old}
}
function downloadRosterExcelTemplate(){
  if(!window.XLSX){message($('roster-message'),'Không tải được thư viện Excel.','error');return}
  const rows=[['Mã DD Bộ GD&ĐT','Họ tên','Môn 1','Môn 2','Mã môn','Loại môn','Thứ tự ca'],['3153467643','Phạm Hoàng An','HOA','SINH','','elective',''],['3156126154','Tạ Ngọc Song An','N1','LY','','elective',''],['3150000000','Ví dụ môn tại lớp','','','TIN','class','']];
  const wb=window.XLSX.utils.book_new(),ws=window.XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:22},{wch:28},{wch:14},{wch:14}];window.XLSX.utils.book_append_sheet(wb,ws,'Mon lua chon');
  window.XLSX.writeFile(wb,'Mau_nap_mon_lua_chon.xlsx');
}

function syncRosterClassFilters(){const g=$('roster-grade').value;fillSelect('roster-class',rosterClassCodes(g),'-- Chọn lớp --',$('roster-class').value);$('roster-class').disabled=!g}
function syncOverageClassFilters(){const g=$('overage-grade').value;fillSelect('overage-class',rosterClassCodes(g),'-- Chọn lớp --',$('overage-class').value);$('overage-class').disabled=!g;syncOverageStudents()}
function syncOverageStudents(){const grade=$('overage-grade').value,cls=$('overage-class').value;const list=state.rosterCandidates.filter(c=>String(c.grade_code)===grade&&String(c.class_code)===cls&&!c.is_overage);const sel=$('overage-student'),old=sel.value;sel.innerHTML='<option value="">-- Chọn học sinh --</option>'+list.map(c=>`<option value="${esc(c.id)}">${esc(c.student_code)} — ${esc(c.student_name)}</option>`).join('');if(list.some(c=>String(c.id)===old))sel.value=old;sel.disabled=!grade||!cls||!list.length}
function rosterStudentRegs(candidateId){return state.rosterRegs.filter(r=>String(r.candidate_id)===String(candidateId)&&r.subject_type==='elective'&&!['TOAN','VAN'].includes(String(r.subject_code).toUpperCase()))}

function printRosterChoices(){
 const examId=rosterExamId();
 if(!examId){message($('roster-message'),'Hãy chọn kỳ thi trước khi in danh sách.','error');return}
 const grade=$('roster-grade').value,cls=$('roster-class').value,q=$('roster-search').value.trim().toLocaleLowerCase('vi');
 if(!grade&&!cls){message($('roster-message'),'Hãy chọn ít nhất một khối hoặc một lớp trước khi in để tránh in nhầm toàn bộ trường.','error');return}
 const rows=state.rosterCandidates.filter(c=>(!grade||String(c.grade_code)===grade)&&(!cls||String(c.class_code)===cls)&&(!q||[c.student_code,c.student_name,c.class_code].some(v=>String(v||'').toLocaleLowerCase('vi').includes(q)))&&($('roster-show-overage').checked||!c.is_overage)).sort((a,b)=>String(a.class_code).localeCompare(String(b.class_code),'vi',{numeric:true})||String(a.student_name).localeCompare(String(b.student_name),'vi'));
 if(!rows.length){message($('roster-message'),'Không có học sinh trong bộ lọc để in.','error');return}
 const codeName=code=>{const item=ROSTER_ELECTIVES.find(x=>x.code===String(code||'').toUpperCase());return item?`${item.name} (${item.code})`:code||'Chưa chọn'};
 const groups=new Map();
 for(const row of rows){const key=String(row.class_code||'Chưa xếp lớp');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
 const examTitle=(state.exams.find(e=>e.id===examId)||{}).name||examId;
 const title=`Danh sách môn lựa chọn${cls?' — lớp '+cls:grade?' — khối '+grade:''}`;
 const w=createPrintFrame();
 const pages=[...groups.entries()].map(([classCode,classRows],pageIndex)=>{const body=classRows.map((c,i)=>{const regs=rosterStudentRegs(c.id),draft=state.rosterDirty.get(String(c.id));const m1=draft?draft.m1:regs.find(r=>Number(r.subject_order)===1)?.subject_code||'',m2=draft?draft.m2:regs.find(r=>Number(r.subject_order)===2)?.subject_code||'';return `<tr><td>${i+1}</td><td>${esc(c.student_code||'')}</td><td>${esc(c.student_name||'')}</td><td>${esc(c.class_code||'')}</td><td>${esc(codeName(m1))}</td><td>${esc(codeName(m2))}</td><td></td></tr>`}).join('');return `<section class="class-page${pageIndex===groups.size-1?' last':''}"><h2>TRƯỜNG THPT LÊ HỒNG PHONG</h2><h3>Danh sách môn lựa chọn — lớp ${esc(classCode)}</h3><p>Kỳ thi: ${esc(examTitle)}</p><table><thead><tr><th>STT</th><th>Mã học sinh</th><th>Họ và tên</th><th>Lớp</th><th>Môn 1</th><th>Môn 2</th><th>Ghi chú</th></tr></thead><tbody>${body}</tbody></table><p class="date">Ngày in: ${new Date().toLocaleDateString('vi-VN')}</p></section>`}).join('');
 w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}.class-page{min-height:calc(100vh - 16mm);page-break-after:always;break-after:page;break-inside:avoid;page-break-inside:avoid;padding:0}.class-page.last{page-break-after:auto;break-after:auto}h2,h3,p{text-align:center;margin:4px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:9px}th,td{border:1px solid #555;padding:4px;text-align:left;line-height:1.1}th{background:#eee}.date{text-align:right;margin-top:10px}@media screen{body{padding:20px}.class-page{border-bottom:1px dashed #999;margin-bottom:20px;padding-bottom:20px}}@media print{button{display:none}}</style></head><body>${pages}<script>window.onload=()=>window.print()</script></body></html>`);
 w.document.close();
}

function renderRosterTable(){
 const body=$('roster-table-body'),grade=$('roster-grade').value,cls=$('roster-class').value,q=$('roster-search').value.trim().toLocaleLowerCase('vi');
 const rows=state.rosterCandidates.filter(c=>(!grade||String(c.grade_code)===grade)&&(!cls||String(c.class_code)===cls)&&(!q||[c.student_code,c.student_name,c.class_code].some(v=>String(v||'').toLocaleLowerCase('vi').includes(q)))&&($('roster-show-overage').checked||!c.is_overage));
 const pages=Math.max(1,Math.ceil(rows.length/state.rosterPageSize));state.rosterPage=Math.min(state.rosterPage,pages-1);const shown=rows.slice(state.rosterPage*state.rosterPageSize,(state.rosterPage+1)*state.rosterPageSize);
 body.innerHTML='';for(const c of shown){const current=rosterStudentRegs(c.id);const m1=current.find(r=>Number(r.subject_order)===1)?.subject_code||'';const m2=current.find(r=>Number(r.subject_order)===2)?.subject_code||'';const draft=state.rosterDirty.get(String(c.id));const a=draft?draft.m1:m1,b=draft?draft.m2:m2;const tr=document.createElement('tr');tr.dataset.candidateId=c.id;tr.innerHTML=`<td>${esc(c.student_code||'')}</td><td>${esc(c.student_name||'')}</td><td>${esc(c.class_code||'—')}</td><td><select data-roster-subject="1" aria-label="Môn 1 của ${esc(c.student_name)}">${rosterOptions(a)}</select></td><td><select data-roster-subject="2" aria-label="Môn 2 của ${esc(c.student_name)}">${rosterOptions(b)}</select></td><td>${c.is_overage?'<span class="overage-tag">Vượt cấp</span>':'Thông thường'}</td><td><button type="button" class="btn btn-light btn-small" data-roster-save="${esc(c.id)}">Lưu</button></td>`;body.append(tr)}
 if(!shown.length)body.innerHTML='<tr><td colspan="7" class="empty">Không có học sinh phù hợp. Hãy kiểm tra khối/lớp hoặc nhập hồ sơ vào kỳ thi.</td></tr>';
 const complete=rows.filter(c=>{const d=state.rosterDirty.get(String(c.id));const r=rosterStudentRegs(c.id);const a=d?d.m1:r.find(x=>Number(x.subject_order)===1)?.subject_code,b=d?d.m2:r.find(x=>Number(x.subject_order)===2)?.subject_code;return a&&b&&a!==b}).length;
 $('roster-summary').innerHTML=`<div class="metric"><span>Học sinh theo bộ lọc</span><strong>${rows.length.toLocaleString('vi-VN')}</strong></div><div class="metric"><span>Đủ 2 môn</span><strong>${complete.toLocaleString('vi-VN')}</strong></div><div class="metric"><span>Chưa đủ / trùng môn</span><strong>${(rows.length-complete).toLocaleString('vi-VN')}</strong></div>`;
 $('roster-page-info').textContent=`Hiển thị ${rows.length?state.rosterPage*state.rosterPageSize+1:0}–${Math.min((state.rosterPage+1)*state.rosterPageSize,rows.length)} / ${rows.length} học sinh · ${state.rosterDirty.size} dòng chưa lưu`;$('roster-prev').disabled=state.rosterPage===0;$('roster-next').disabled=state.rosterPage>=pages-1;
}
function captureRosterEdit(select){const tr=select.closest('tr'),id=String(tr.dataset.candidateId);const values=[...tr.querySelectorAll('[data-roster-subject]')];const prev=state.rosterDirty.get(id)||{};state.rosterDirty.set(id,{m1:values[0].value,m2:values[1].value});tr.classList.add('roster-dirty');renderRosterStats();$('roster-page-info').textContent=$('roster-page-info').textContent.replace(/\d+ dòng chưa lưu$/,`${state.rosterDirty.size} dòng chưa lưu`)}
async function saveRosterStudent(id){const examId=rosterExamId(),key=String(id),draft=state.rosterDirty.get(key);if(!draft)return true;if(draft.m1&&draft.m1===draft.m2){message($('roster-message'),'Môn 1 và Môn 2 không được trùng nhau.','error');return false}const chosen=[draft.m1?{exam_id:examId,candidate_id:id,subject_code:draft.m1,subject_type:'elective',subject_order:1}:null,draft.m2?{exam_id:examId,candidate_id:id,subject_code:draft.m2,subject_type:'elective',subject_order:2}:null].filter(Boolean);if(chosen.length){const {error}=await state.client.from('exam_candidate_subjects').upsert(chosen,{onConflict:'exam_id,candidate_id,subject_code'});if(error){message($('roster-message'),`Không lưu được ${key}: ${error.message}`,'error');return false}}
 const existing=rosterStudentRegs(id);for(const r of existing){if(!chosen.some(x=>x.subject_code===r.subject_code)){const {error}=await state.client.from('exam_candidate_subjects').delete().eq('exam_id',examId).eq('candidate_id',id).eq('subject_code',r.subject_code).eq('subject_type','elective');if(error){message($('roster-message'),`Đã ghi một phần nhưng không xóa được môn cũ ${r.subject_code}: ${error.message}`,'error');return false}}}
 state.rosterRegs=state.rosterRegs.filter(r=>!(String(r.candidate_id)===key&&r.subject_type==='elective'&&!['TOAN','VAN'].includes(String(r.subject_code).toUpperCase()))).concat(chosen.map(x=>({candidate_id:id,subject_code:x.subject_code,subject_type:'elective',subject_order:x.subject_order})));state.rosterDirty.delete(key);return true}
async function saveRosterAll(){const ids=[...state.rosterDirty.keys()];if(!ids.length){message($('roster-message'),'Không có thay đổi cần lưu.','info');return}const btn=$('roster-save-all');btn.disabled=true;try{for(let i=0;i<ids.length;i++){if(!await saveRosterStudent(ids[i]))return;message($('roster-message'),`Đang lưu ${i+1}/${ids.length} học sinh...`,'info')}renderRosterTable();renderRosterStats();await loadSubjectRegistrations();message($('roster-message'),`Đã lưu ${ids.length} học sinh. Dữ liệu môn lựa chọn đã cập nhật.`, 'success')}finally{btn.disabled=false}}
async function addOverageStudent(){const id=$('overage-student').value;if(!id){message($('overage-message'),'Hãy chọn học sinh cần đánh dấu vượt cấp.','error');return}const st=state.rosterCandidates.find(c=>String(c.id)===id);if(!st)return;const {error}=await state.client.from('exam_candidates').update({is_overage:true}).eq('id',id).eq('exam_id',rosterExamId());if(error){message($('overage-message'),`Không cập nhật được. ${error.message}. Hãy chạy migration SQL v0.1.31.`, 'error');return}st.is_overage=true;syncOverageStudents();renderRosterTable();message($('overage-message'),`Đã đánh dấu ${st.student_name} (${st.class_code}) là học sinh vượt cấp trong kỳ thi này. Hồ sơ gốc không bị thay đổi.`, 'success')}
async function renderRosterStats(){
 const examId=rosterExamId(),scope=$('roster-stats-scope').value,grade=$('roster-stats-grade').value,cls=$('roster-stats-class').value;const body=$('roster-stats-body');if(!examId){body.innerHTML='<tr><td colspan="5" class="empty">Chọn kỳ thi.</td></tr>';return}
 const eligible=state.rosterCandidates.filter(c=>(scope==='all'||!grade||String(c.grade_code)===grade)&&(scope!=='class'||!cls||String(c.class_code)===cls));const ids=new Set(eligible.map(c=>String(c.id)));const regs=state.rosterRegs.filter(r=>ids.has(String(r.candidate_id))&&r.subject_type==='elective'&&!['TOAN','VAN'].includes(String(r.subject_code).toUpperCase()));const catalog=ROSTER_ELECTIVES;const stats=catalog.map(s=>{const set1=new Set(regs.filter(r=>r.subject_code===s.code&&Number(r.subject_order)===1).map(r=>String(r.candidate_id)));const set2=new Set(regs.filter(r=>r.subject_code===s.code&&Number(r.subject_order)===2).map(r=>String(r.candidate_id)));const all=new Set(regs.filter(r=>r.subject_code===s.code).map(r=>String(r.candidate_id)));return {...s,n1:set1.size,n2:set2.size,total:all.size}});body.innerHTML=stats.map(s=>`<tr><td><code>${esc(s.code)}</code></td><td>${esc(s.name)}</td><td>${s.n1}</td><td>${s.n2}</td><td><strong>${s.total}</strong></td></tr>`).join('');$('roster-stats-cards').innerHTML=stats.map(s=>`<div class="roster-stat-card"><span>${esc(s.name)} (${esc(s.code)})</span><strong>${s.total.toLocaleString('vi-VN')}</strong><small>Môn 1: ${s.n1} · Môn 2: ${s.n2}</small><div class="stat-bar"><i style="width:${Math.max(...stats.map(x=>x.total),1)?Math.min(100,s.total/Math.max(...stats.map(x=>x.total),1)*100):0}%"></i></div></div>`).join('');
}
function syncRosterStatsClass(){const g=$('roster-stats-grade').value;fillSelect('roster-stats-class',rosterClassCodes(g),'Tất cả lớp trong khối',$('roster-stats-class').value)}

function wire(){ if($('manual-grading-open'))$('manual-grading-open').onclick=async()=>{try{const{openManualGrading}=await import('./manual-exam.js?v=172');await openManualGrading({state})}catch(error){message($('grader-message'),error.message,'error')}}; $('accounts-open-grading').onclick=async()=>{if(state.role!=='admin')return;showScreen('grader-screen');$('grader-back-admin').classList.remove('hidden');try{await operations.enterAsGrader()}catch(e){message($('grader-message'),e.message,'error')}};$('grader-back-admin').onclick=()=>{if(state.role!=='admin')return;showScreen('app-screen');switchTab('accounts')}; $('google-login').onclick=async()=>{const button=$('google-login');button.disabled=true;try{const{error}=await state.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href}});if(error)throw error}catch(error){message($('login-message'),`Không đăng nhập được bằng Google: ${error?.message||String(error)}`,'error');button.disabled=false}};$('setup-form').addEventListener('submit',async e=>{e.preventDefault();const btn=$('setup-form').querySelector('button[type=submit]');const url=$('supabase-url').value.trim().replace(/\/$/,''),key=$('supabase-key').value.trim();hide($('setup-message'));hide($('login-message'));btn.disabled=true;const old=btn.textContent;btn.textContent='Đang kiểm tra kết nối...';try{await connect(url,key);saveConfig(url,key);await openConnectedApp()}catch(err){showConnectionFailure(err)}finally{btn.disabled=false;btn.textContent=old}});$('clear-config').onclick=()=>{localStorage.removeItem('exam_supabase_url');localStorage.removeItem('exam_supabase_key');$('supabase-url').value='';$('supabase-key').value=''};$('change-config').onclick=()=>{showScreen('setup-screen');const c=readConfig();$('supabase-url').value=c.url;$('supabase-key').value=c.key};$('login-toggle-password').onclick=()=>{const shown=$('login-password').type==='password';$('login-password').type=shown?'text':'password';$('login-toggle-password').textContent=shown?'Ẩn':'Hiện';$('login-toggle-password').setAttribute('aria-pressed',String(shown));$('login-toggle-password').setAttribute('aria-label',shown?'Ẩn mật khẩu':'Hiện mật khẩu')};$('login-form').addEventListener('submit',submitLogin);$('logout-btn').onclick=signOut;document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('create-exam-form').addEventListener('submit',createExam);$('reload-exams').onclick=loadExams;$('exam-table-body').addEventListener('click',async e=>{
  const selectBtn=e.target.closest('[data-select-exam]');
  const manualBtn=e.target.closest('[data-manual-exam]');
  if(manualBtn){try{await openManualExamWorkspace(manualBtn.dataset.manualExam)}catch(error){message($('global-message'),error.message,'error')}return;}
  const editBtn=e.target.closest('[data-edit-exam]');
  const deleteBtn=e.target.closest('[data-delete-exam]');
  if(selectBtn){
    state.selectedExam=selectBtn.dataset.selectExam;
    $('rooming-exam-select').value=state.selectedExam;
    $('subject-exam-select').value=state.selectedExam;$('sbd-exam-select').value=state.selectedExam;
    const exam=state.exams.find(item=>item.id===state.selectedExam);
    syncSubjectExamMode();updateSelectedExamTitle();loadCandidates();notifyExamSelected(exam);return;
  }
  if(editBtn){
    const exam=state.exams.find(x=>x.id===editBtn.dataset.editExam);
    if(!exam)return;
    const name=prompt('Tên kỳ thi:',exam.name);
    if(name===null)return;
    if(!name.trim()){message($('global-message'),'Tên kỳ thi không được để trống.','error');return;}
    const school_year=prompt('Năm học:',exam.school_year||'');
    if(school_year===null)return;
    if(!school_year.trim()){message($('global-message'),'Năm học không được để trống.','error');return;}
    const modeInput=exam.exam_mode==='manual'?'3':prompt('Loại kỳ thi: nhập 1 = Kỳ thi mặc định, 2 = Kỳ thi theo môn.',isSubjectExam(exam.id)?'2':'1');
    if(modeInput===null)return;
    const exam_mode=exam.exam_mode==='manual'?'manual':modeInput.trim()==='2'?'subject':modeInput.trim()==='1'?'default':null;
    if(!exam_mode){message($('global-message'),'Loại kỳ thi không hợp lệ. Hãy nhập 1 hoặc 2.','error');return;}
    const {error}=await state.client.from('exam_sessions').update({name:name.trim(),school_year:school_year.trim(),exam_mode}).eq('id',exam.id);
    if(error){message($('global-message'),`Không sửa được kỳ thi: ${error.message}`,'error');return;}
    message($('global-message'),'Đã cập nhật thông tin kỳ thi.','success');
    await loadExams();
    $('subject-exam-select').value=exam.id;$('rooming-exam-select').value=exam.id;$('sbd-exam-select').value=exam.id;
    state.selectedExam=exam.id;updateSelectedExamTitle();
    syncSubjectExamMode();return;
  }
  if(deleteBtn){
    const exam=state.exams.find(x=>x.id===deleteBtn.dataset.deleteExam);
    if(!exam)return;
    const ok=confirm(`Bạn sắp xóa kỳ thi "${exam.name}" (${exam.school_year}) cùng các dữ liệu không bị ràng buộc bảo vệ. Nếu còn hồ sơ chính thức, điểm/phách hoặc phương án xếp phòng, CSDL sẽ chặn và hiển thị danh sách việc cần làm. Bạn có chắc chắn muốn tiếp tục?`);
    if(!ok)return;
    const {data:deleted,error}=await state.client.rpc('exam_delete_exam_cascade',{p_exam_id:exam.id});
    if(error){
      message($('global-message'),`Không xoá được kỳ thi: ${error.message}. Không có dữ liệu nào bị xoá.`,'error');
      $('global-message').style.whiteSpace='pre-line';
      return;
    }
    $('global-message').style.whiteSpace='';
    if(state.selectedExam===exam.id)state.selectedExam=null;
    message($('global-message'),'Đã xóa kỳ thi.','success');
    await loadExams();
    return;
  }
});$('sbd-exam-select').onchange=()=>{state.selectedExam=$('sbd-exam-select').value||null;updateSelectedExamTitle();notifyExamSelected(state.exams.find(exam=>exam.id===state.selectedExam));$('sbd-message').classList.add('hidden')};$('rooming-exam-select').onchange=()=>{state.selectedExam=$('rooming-exam-select').value||null;updateSelectedExamTitle();notifyExamSelected(state.exams.find(exam=>exam.id===state.selectedExam));state.preview=null;$('save-rooming').disabled=true;$('lock-rooming').disabled=true;loadCandidates()};$('download-csv-template').addEventListener('click',downloadExcelTemplate);$('import-form').addEventListener('submit',importCsv);$('candidate-edit-form').addEventListener('submit',saveCandidate);$('candidate-add-open').onclick=()=>openCandidateModal();$('candidate-cancel-edit').onclick=resetCandidateForm;$('candidate-modal-close').onclick=resetCandidateForm;$('candidate-search').addEventListener('input',renderCandidateTable);$('candidate-grade-filter').onchange=()=>{populateCandidateClassFilter();renderCandidateTable()};$('candidate-class-filter').onchange=renderCandidateTable;$('candidate-clear-filters').onclick=()=>{$('candidate-grade-filter').value='';populateCandidateClassFilter();$('candidate-class-filter').value='';$('candidate-search').value='';renderCandidateTable()};$('candidate-table-body').addEventListener('click',e=>{const edit=e.target.closest('[data-candidate-edit]');if(edit)openCandidateModal(edit.dataset.candidateEdit)});$('candidate-table-body').addEventListener('change',e=>{const box=e.target.closest('[data-candidate-check]');if(box)updateCandidateSelection(box.dataset.candidateCheck,box.checked)});const selectVisible=checked=>{const ids=getFilteredCandidates().map(c=>c.id);const s=new Set(state.selectedCandidateIds||[]);ids.forEach(id=>checked?s.add(id):s.delete(id));state.selectedCandidateIds=[...s];renderCandidateTable()};$('candidate-select-all').onchange=e=>selectVisible(e.target.checked);$('candidate-header-check').onchange=e=>selectVisible(e.target.checked);$('candidate-bulk-delete').onclick=deleteSelectedCandidates;$('download-subject-template').onclick=downloadSubjectTemplate;$('subject-manage-close').onclick=()=>{$('subject-manage-dialog').close();subjectManageContext=null};$('subject-manage-action').onchange=()=>{$('subject-manage-target-wrap').classList.toggle('hidden',$('subject-manage-action').value!=='move')};$('subject-manage-select-all').onclick=()=>document.querySelectorAll('.subject-manage-current-check').forEach(x=>x.checked=true);$('subject-manage-clear').onclick=()=>document.querySelectorAll('.subject-manage-current-check').forEach(x=>x.checked=false);$('subject-manage-add-all').onclick=()=>document.querySelectorAll('.subject-manage-add-check').forEach(x=>x.checked=true);$('subject-manage-add-clear').onclick=()=>document.querySelectorAll('.subject-manage-add-check').forEach(x=>x.checked=false);$('subject-manage-save').onclick=saveSubjectManager;$('subject-config-kind').onchange=async()=>{const choice=$('subject-config-kind').value==='choice';$('subject-mode').value=choice?'elective':'required';$('subject-mode').disabled=!choice;$('subject-order-wrap').classList.toggle('hidden',!choice);if(!choice&&['class_students','student'].includes($('subject-scope').value))$('subject-scope').value='class';$('subject-scope').dispatchEvent(new Event('change'));const examId=$('subject-exam-select').value;if(examId&&state.client){const{error}=await state.client.from('exam_sessions').update({exam_mode:choice?'choice':'default'}).eq('id',examId);if(error)message($('subject-message'),`Không lưu được hình thức kỳ thi: ${error.message}. Hãy chạy migration v0.1.21.`, 'error');else{const e=state.exams.find(x=>x.id===examId);if(e)e.exam_mode=choice?'choice':'default';message($('subject-message'),`Đã lưu hình thức kỳ thi: ${choice?'Kỳ thi lựa chọn':'Kỳ thi mặc định'}.`,'success')}}};$('subject-mode').onchange=()=>{$('subject-order-wrap').classList.toggle('hidden',$('subject-mode').value!=='elective')};$('subject-config-kind').dispatchEvent(new Event('change'));$('subject-mode').dispatchEvent(new Event('change'));$('apply-subject').onclick=async()=>{
  const b=$('apply-subject');const old=b.textContent;
  if(b.dataset.busy==='1')return;
  b.dataset.busy='1';b.disabled=true;b.textContent='Đang xử lý...';
  try{await applySubject()}finally{b.dataset.busy='0';b.disabled=false;b.textContent=old}
};$('load-subject-registrations').onclick=async()=>{const b=$('load-subject-registrations');b.disabled=true;const oldText=b.textContent;b.textContent='Đang tải...';try{await loadSubjectRegistrations()}catch(e){message($('subject-message'),`Không tải được danh sách đăng ký môn: ${e.message}`,'error')}finally{b.disabled=false;b.textContent=oldText}};$('subject-exam-select').onchange=()=>{state.selectedExam=$('subject-exam-select').value||null;updateSelectedExamTitle();notifyExamSelected(state.exams.find(exam=>exam.id===state.selectedExam));syncSubjectExamMode();loadSubjectRegistrations();loadRosterData()};$('subject-scope').onchange=()=>{const scope=$('subject-scope').value;$('subject-class-code').disabled=!['class','class_students'].includes(scope);$('subject-student-code').disabled=scope!=='student';$('subject-csv').disabled=false;$('subject-grade').disabled=scope!=='grade';$('subject-student-list').disabled=scope!=='class_students';$('subject-class-code-wrap').classList.add('hidden');$('subject-class-picker-wrap').classList.toggle('hidden',scope!=='class');$('subject-student-class-wrap').classList.toggle('hidden',scope!=='class_students');$('subject-student-picker-wrap').classList.toggle('hidden',scope!=='class_students');$('subject-student-code-wrap').classList.toggle('hidden',scope!=='student');$('subject-grade-wrap').classList.toggle('hidden',scope!=='grade');$('subject-student-list-wrap').classList.add('hidden');if(['class','class_students'].includes(scope)&&state.client)loadSubjectPickerCandidates();};$('subject-scope').dispatchEvent(new Event('change'));$('subject-student-class').onchange=renderSubjectStudentPicker;$('subject-exam-select').addEventListener('change',()=>{if(['class','class_students'].includes($('subject-scope').value))loadSubjectPickerCandidates()});$('subject-classes-select-all').onclick=()=>document.querySelectorAll('.subject-class-check').forEach(el=>el.checked=true);$('subject-classes-clear').onclick=()=>document.querySelectorAll('.subject-class-check').forEach(el=>el.checked=false);$('subject-students-select-all').onclick=()=>document.querySelectorAll('.subject-student-check').forEach(el=>el.checked=true);$('subject-students-clear').onclick=()=>document.querySelectorAll('.subject-student-check').forEach(el=>el.checked=false);$('subject-mode').onchange=()=>{const elective=$('subject-mode').value==='elective';$('subject-order-wrap').classList.toggle('hidden',!elective);if(!elective)$('subject-order').value='1'};$('subject-mode').dispatchEvent(new Event('change'));initSubjectCatalog();$('room-sort-mode').onchange=()=>{$('previous-exam-wrap').classList.toggle('hidden',$('room-sort-mode').value!=='previous')};$('room-sort-mode').dispatchEvent(new Event('change'));$('sbd-prefix-length').onchange=()=>{const n=Number($('sbd-prefix-length').value);$('sbd-prefix').maxLength=n;$('sbd-prefix').value=String($('sbd-prefix').value||'').replace(/\D/g,'').slice(0,n).padStart(n,'0')};$('sbd-prefix').oninput=()=>{$('sbd-prefix').value=String($('sbd-prefix').value||'').replace(/\D/g,'').slice(0,Number($('sbd-prefix-length').value))};$('sbd-prefix').dispatchEvent(new Event('input'));
$('room-plan-type').onchange=()=>{const mandatory=$('room-plan-type').value==='mandatory';$('mandatory-subject-wrap').classList.toggle('hidden',!mandatory);$('room-prefix').value=mandatory?'M':'P';$('rooming-message').classList.add('hidden');state.preview=null;$('save-rooming').disabled=true;$('lock-rooming').disabled=true;$('export-rooming').disabled=true;const h=document.querySelector('#tab-rooming .section-heading h2');if(h)h.textContent=mandatory?'Xếp phòng thi môn bắt buộc':'Xếp phòng thi môn lựa chọn'};$('room-plan-type').dispatchEvent(new Event('change'));$('preview-rooming').onclick=previewRooming;$('save-rooming').onclick=()=>saveRooming(false);$('lock-rooming').onclick=()=>{if(confirm('Khóa phương án xếp phòng? Hãy chắc chắn đã kiểm tra danh sách.'))saveRooming(true)};$('export-rooming').onclick=exportRooming;$('print-rooming-pdf').onclick=printRoomingPDF;$('assign-sbd-rooming').onclick=assignSbdByRoom;
  $('roster-import-btn').onclick=importRosterElectivesFromExcel;$('roster-print-btn').onclick=printRosterChoices;$('roster-template-btn').onclick=downloadRosterExcelTemplate;$('roster-reload').onclick=loadRosterData;$('roster-grade').onchange=()=>{syncRosterClassFilters();state.rosterPage=0;renderRosterTable();renderRosterStats()};$('roster-class').onchange=()=>{state.rosterPage=0;renderRosterTable();renderRosterStats()};$('roster-search').oninput=()=>{state.rosterPage=0;renderRosterTable()};$('roster-show-overage').onchange=renderRosterTable;$('roster-prev').onclick=()=>{state.rosterPage=Math.max(0,state.rosterPage-1);renderRosterTable()};$('roster-next').onclick=()=>{state.rosterPage++;renderRosterTable()};$('roster-table-body').addEventListener('change',e=>{if(e.target.matches('[data-roster-subject]')){const tr=e.target.closest('tr'),sels=[...tr.querySelectorAll('[data-roster-subject]')];const id=String(tr.dataset.candidateId);state.rosterDirty.set(id,{m1:sels[0].value,m2:sels[1].value});tr.classList.add('roster-dirty');renderRosterTable();}});$('roster-table-body').addEventListener('click',async e=>{const btn=e.target.closest('[data-roster-save]');if(btn){btn.disabled=true;const ok=await saveRosterStudent(btn.dataset.rosterSave);if(ok){renderRosterTable();renderRosterStats();message($('roster-message'),'Đã lưu môn lựa chọn cho học sinh.','success')}btn.disabled=false}});$('roster-save-all').onclick=saveRosterAll;$('overage-grade').onchange=syncOverageClassFilters;$('overage-class').onchange=syncOverageStudents;$('overage-add').onclick=addOverageStudent;$('roster-stats-refresh').onclick=renderRosterStats;$('roster-stats-scope').onchange=()=>{if($('roster-stats-scope').value==='all'){$('roster-stats-grade').disabled=true;$('roster-stats-class').disabled=true}else{$('roster-stats-grade').disabled=false;$('roster-stats-class').disabled=$('roster-stats-scope').value!=='class'||!$('roster-stats-grade').value}renderRosterStats()};$('roster-stats-grade').onchange=()=>{syncRosterStatsClass();$('roster-stats-class').disabled=$('roster-stats-scope').value!=='class';renderRosterStats()};$('roster-stats-class').onchange=renderRosterStats;
}
function wireRoomingEditor(){
 const refreshRoomingTypeControls=()=>{const type=$('room-plan-type').value,subjectPlan=type==='subject';$('mandatory-subject-wrap').classList.toggle('hidden',type!=='mandatory');$('subject-rooming-wrap').classList.toggle('hidden',!subjectPlan);$('rooming-distribution-wrap').classList.remove('hidden');if(subjectPlan)$('room-prefix').value='P'};
 $('room-plan-type').addEventListener('change',refreshRoomingTypeControls);refreshRoomingTypeControls();
 $('manage-rounds').onclick=()=>openRoundManagement().catch(error=>message($('rooming-message'),error.message||String(error),'error'));
 if(!$('configure-rooming-round')){const b=document.createElement('button');b.id='configure-rooming-round';b.type='button';b.className='btn btn-light';b.textContent='Nạp thí sinh vào đợt đang chọn';$('preview-rooming').parentElement.prepend(b)}
 $('configure-rooming-round').onclick=async()=>{
  const button=$('configure-rooming-round');
  if(button.dataset.busy==='1')return;
  button.dataset.busy='1';button.disabled=true;
  try{await openRoundCandidateDialog()}catch(error){message($('rooming-message'),error.message||String(error),'error')}
  finally{button.dataset.busy='0';button.disabled=false}
 };
 $('rooming-round').onchange=()=>{state.preview=null;$('preview-rooming').textContent='Xem trước phương án phòng';clearRoomingPreview();refreshRoomingSubjectOptions().catch(()=>{});message($('rooming-message'),'Đã chuyển sang đợt thi mới. Hãy lập hoặc khôi phục phương án của đợt này.','info')};
 $('rooming-adjustment-mode').onchange=()=>{if(state.preview?.result.rooms.some(r=>r.is_private)){$('rooming-adjustment-mode').value='manual';return}if(state.preview&&!state.preview.finalized){state.preview.adjustmentMode=selectedRoomingMode();state.preview.assignmentsCreated=false;state.preview.saved=null;state.preview.sourcePlanId=null;renderRooming(state.preview.result,state.preview.planType);updateRoomingActions();message($('rooming-message'),state.preview.adjustmentMode==='manual'?'Đã chọn điều chỉnh thủ công. Có thể chuyển từng thí sinh giữa các phòng rồi kiểm tra và lưu.':'Đã chọn điều chỉnh tự động theo thuật toán.','info')}};
 $('rooming-exam-select').onchange=()=>{
  state.selectedExam=$('rooming-exam-select').value||null;state.preview=null;
  $('preview-rooming').textContent='Xem trước phương án phòng';
  updateSelectedExamTitle();notifyExamSelected(state.exams.find(exam=>exam.id===state.selectedExam));
  clearRoomingPreview();
  loadCandidates();refreshRoomingRoundOptions().catch(error=>message($('rooming-message'),error.message,'error'));
 };
 $('room-plan-type').onchange=()=>{
  state.preview=null;
  $('preview-rooming').textContent='Xem trước phương án phòng';
 const mandatory=['mandatory','subject'].includes($('room-plan-type').value);
  $('mandatory-subject-wrap').classList.toggle('hidden',!mandatory);
  $('room-prefix').value=mandatory?'M':'P';
  const heading=document.querySelector('#tab-rooming .section-heading h2');
  if(heading)heading.textContent=mandatory?'Xếp phòng thi môn bắt buộc':'Xếp phòng thi môn lựa chọn';
  clearRoomingPreview();
 };
 $('add-room-plan').onclick=addRoomToPlan;
 for(const action of ['create','add','release','redistribute']){const button=$('private-room-'+action);if(button)button.onclick=()=>changePrivateRoom(action)}
 $('free-room-cancel').onclick=()=>$('free-room-dialog').close();
 $('free-room-form').onsubmit=event=>{event.preventDefault();if(applyFreeRoomChange({oldCode:$('free-room-old-code').value||undefined,code:$('free-room-name').value,count:$('free-room-count').value,groupIndex:Number($('free-room-group').value)}))$('free-room-dialog').close()};
 $('rooming-table-body').addEventListener('click',event=>{const button=event.target.closest('[data-edit-free-room]');if(button)openFreeRoom(button.dataset.editFreeRoom)});
 $('save-rooming').onclick=saveRooming;
 $('lock-rooming').onclick=finalizeRooming;
 $('rooming-table-body').addEventListener('change',updateRoomPlanCount);
 let draggedAssignmentId=null;
 $('assignment-table-body').addEventListener('change',event=>{
  const select=event.target.closest('[data-room-assignment]'),preview=state.preview;
  if(!select||!preview||preview.adjustmentMode!=='manual'||preview.finalized)return;
  const assignment=preview.result.assignments.find(item=>String(item.candidate_id)===String(select.dataset.roomAssignment));
  if(!assignment)return;
  assignment.room_code=select.value;
  preview.assignmentsCreated=false;preview.saved=null;preview.finalized=null;preview.sourcePlanId=null;preview.suggestionValid=false;
  rebuildRoomingFromAssignments(preview);
  renderRooming(preview.result,preview.planType);
  const validation=validateRoomingPlan(preview);
  message($('rooming-message'),validation.ok?'Phương án thủ công hợp lệ, có thể lưu.':`Chưa thể lưu phương án thủ công:\n${validation.errors.join('\n')}`,validation.ok?'success':'error');
 });
 $('assignment-table-body').addEventListener('dragstart',event=>{
  const row=event.target.closest('[data-assignment-row]'),preview=state.preview;
  if(!row||!preview||preview.adjustmentMode!=='manual'||preview.finalized)return;
  draggedAssignmentId=String(row.dataset.assignmentRow);
  row.classList.add('rooming-dragging');
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',draggedAssignmentId);
 });
 $('assignment-table-body').addEventListener('dragover',event=>{
  const row=event.target.closest('[data-assignment-row]');
  if(row&&draggedAssignmentId){event.preventDefault();event.dataTransfer.dropEffect='move';}
 });
 $('assignment-table-body').addEventListener('drop',event=>{
  event.preventDefault();
  const targetRow=event.target.closest('[data-assignment-row]'),preview=state.preview;
  const sourceId=draggedAssignmentId||event.dataTransfer.getData('text/plain');
  if(!targetRow||!sourceId||!preview||preview.adjustmentMode!=='manual'||preview.finalized)return;
  const targetId=String(targetRow.dataset.assignmentRow);
  if(sourceId===targetId)return;
  const assignments=preview.result.assignments;
  const sourceIndex=assignments.findIndex(item=>String(item.candidate_id)===sourceId);
  const targetIndex=assignments.findIndex(item=>String(item.candidate_id)===targetId);
  if(sourceIndex<0||targetIndex<0)return;
  const [source]=assignments.splice(sourceIndex,1);
  const adjustedTargetIndex=sourceIndex<targetIndex?targetIndex-1:targetIndex;
  source.room_code=assignments[adjustedTargetIndex]?.room_code||source.room_code;
  assignments.splice(adjustedTargetIndex,0,source);
  preview.assignmentsCreated=false;preview.saved=null;preview.finalized=null;preview.sourcePlanId=null;preview.suggestionValid=false;
  rebuildRoomingFromAssignments(preview);
  renderRooming(preview.result,preview.planType);
  const validation=validateRoomingPlan(preview);
  message($('rooming-message'),validation.ok?'Đã sắp xếp lại thứ tự/phòng, có thể lưu.':`Chưa thể lưu phương án thủ công:\n${validation.errors.join('\n')}`,validation.ok?'success':'error');
 });
 $('assignment-table-body').addEventListener('dragend',event=>{
  event.target.closest('[data-assignment-row]')?.classList.remove('rooming-dragging');
  draggedAssignmentId=null;
 });
 $('rooming-table-body').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove-room]');
  if(button)removeRoomFromPlan(button.dataset.removeRoom);
 });
}
async function boot(){
  showScreen('login-screen');
  $('login-submit').disabled=true;$('google-login').disabled=true;
  try{
    const moduleVersion=await loadTabModules();
    if(`v${moduleVersion}`!==APP_VERSION)throw new Error(`Bộ tải giao diện v${moduleVersion} khác ứng dụng ${APP_VERSION}. Hãy cập nhật đồng bộ các tệp và tải lại bằng Ctrl+F5.`);
    ensureCandidateClassDropdown();
  }catch(error){
    showScreen('login-screen');
    console.error('Không tải được giao diện khi khởi động:',error);
    message($('login-message'),'Không tải được giao diện, ứng dụng chưa đến bước kết nối cơ sở dữ liệu. '+(error.message||String(error)),'error');
    return;
  }
  try{accounts=wireAccounts({state,$,esc,message})}
  catch(error){console.error('Không khởi tạo được quản lý tài khoản:',error)}
  try{teaching=wireTeaching({state,$,esc,message,subjects:SUBJECTS})}
  catch(error){console.error('Không khởi tạo được phân công giảng dạy:',error);message($('teaching-message'),`Không khởi tạo được phân công: ${error.message}`,'error')}
  try{ranking=wireRanking({state,$,esc,message})}
  catch(error){console.error('Không khởi tạo được cấu hình ban:',error);message($('ranking-message'),error.message,'error')}
  try{violations=wireViolations({state,$,esc,message,subjectName,createStudentPicker})}
  catch(error){console.error('Không khởi tạo được vi phạm:',error);message($('violation-message'),error.message,'error')}
  try{choiceReports=wireChoiceReports({state,$,esc,message,createPrintFrame})}catch(error){message($('choice-report-message'),error.message,'error')}
  try{classReport=wireClassReport({state,$,esc,message,createPrintFrame})}catch(error){message($('class-report-message'),error.message,'error')}
  try{scoreControl=wireScoreControl({state,$,esc,message,subjectName,onScoresCleared:()=>{operations?.invalidateCombinedScores();classReport?.invalidate();choiceReports?.invalidate()}})}
  catch(error){console.error('Không khởi tạo được kiểm soát điểm:',error);message($('score-control-message'),error.message,'error')}
  try{
    operations=wireOperations({state,$,esc,message,selectAllPages,subjects:SUBJECTS,subjectName,createStudentPicker,loadExamRounds:(client,examId)=>loadExamRounds(client,examId)});
  }catch(error){
    console.error('Không khởi tạo được operations.js:',error);
    message($('forms-message'),`Không khởi tạo được biểu mẫu: ${error.message||String(error)}. Hãy cập nhật đồng bộ các tệp ứng dụng.`,'error');
  }
  try{
    $('candidate-edit-grade').addEventListener('change',()=>{
      const currentClass=$('candidate-edit-class').value;
      const options=candidateClassOptions(state.candidates,$('candidate-edit-grade').value);
      populateCandidateEditClasses(options.includes(currentClass)?currentClass:'');
    });
  }catch(error){
    console.error('Không khởi tạo được bộ chọn lớp thí sinh:',error);
  }
  try{
    wire();
  }catch(error){
    console.error('Không khởi tạo được các handler nghiệp vụ:',error);
  }
  try{
    $('default-config-subject').onchange=()=>loadDefaultSubjectClassConfig().catch(error=>message($('default-config-message'),error.message,'error'));
    $('default-config-method').onchange=()=>loadDefaultSubjectClassConfig().catch(error=>message($('default-config-message'),error.message,'error'));
    $('default-config-select-all').onclick=()=>document.querySelectorAll('.default-config-class').forEach(input=>input.checked=true);
    $('default-config-clear').onclick=()=>document.querySelectorAll('.default-config-class').forEach(input=>input.checked=false);
    $('default-config-save').onclick=async()=>{const button=$('default-config-save');button.disabled=true;try{await saveDefaultSubjectClassConfig()}catch(error){message($('default-config-message'),error.message,'error')}finally{button.disabled=false}};
    $('default-config-reset').onclick=resetDefaultSubjectClassConfig;
    $('settings-exam-select').addEventListener('change',()=>loadDefaultSubjectClassConfig().catch(error=>message($('default-config-message'),error.message,'error')));
    $('default-config-list-body').addEventListener('click',event=>{
      const edit=event.target.closest('[data-default-config-edit]');
      if(edit){$('default-config-subject').value=edit.dataset.defaultConfigEdit;$('default-config-method').value=edit.dataset.defaultConfigMethod;loadDefaultSubjectClassConfig().catch(error=>message($('default-config-message'),error.message,'error'));return}
      const remove=event.target.closest('[data-default-config-delete]');
      if(remove)deleteDefaultSubjectClassConfig(remove.dataset.defaultConfigDelete).catch(error=>message($('default-config-message'),error.message,'error'));
    });
  }catch(error){console.error('Không khởi tạo được cấu hình môn – lớp:',error)}
  // Keep the school roster independent from every other module. A failure in
  // another module must never prevent its filters and actions from working.
  try{
    wireSchoolStudents();
  }catch(error){
    console.error('Không khởi tạo được danh sách học sinh:',error);
    message($('setup-message'),`Không khởi tạo được danh sách học sinh: ${error?.message||String(error)}`,'error');
  }
  try{wireSbdRoomMode()}catch(error){message($('sbd-message'),`Không khởi tạo được cấp SBD theo phòng: ${error.message}`,'error')}
  try{
    wireRoomingEditor();
  }catch(error){
    console.error('Không khởi tạo được trình chỉnh sửa phòng thi:',error);
  }
  renderSubjects();updateVersionDisplay();
  $('setup-form').dataset.connectionHandler='ready';
  $('setup-form').addEventListener('submit',()=>{
    message($('setup-message'),'Đang kiểm tra kết nối tới Supabase...','info');
    const submit=$('setup-form').querySelector('button[type=submit]');
    setTimeout(()=>{
      if(submit.disabled)message($('setup-message'),'Supabase chưa phản hồi sau 30 giây. Kiểm tra kết nối mạng hoặc tải lại trang rồi thử lại.','error');
    },30000);
  });
  try{
    const config=readConfig();
    await connect(config.url,config.key);
    $('login-submit').disabled=false;$('google-login').disabled=false;
    await openConnectedApp();
  }
  catch(e){showConnectionFailure(e)}
}
boot();
