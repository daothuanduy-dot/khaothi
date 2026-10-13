import {optimizeElectiveRooms,SUBJECTS} from './rooming.js';
const APP_VERSION='v0.1.27';
const APP_BUILD='2026-10-14';
const $=id=>document.getElementById(id);
const state={client:null,session:null,exams:[],candidates:[],selectedCandidateIds:[],selectedExam:null,preview:null,config:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const subjectName=code=>{const key=String(code??'').trim().toUpperCase();if(!key)return '';const all=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];return all.find(s=>String(s.code).toUpperCase()===key)?.name||String(code)};
function message(el,text,type='info'){el.textContent=text;el.className=`notice notice-${type}`;el.classList.remove('hidden')}
function hide(el){el.classList.add('hidden')}
function showScreen(name){for(const id of ['setup-screen','login-screen','app-screen'])$(id).classList.toggle('hidden',id!==name)}
function setConnection(text,ok=false){$('connection-state').textContent=text;$('connection-state').style.background=ok?'#166534':'transparent';$('connection-state').style.color=ok?'white':'#dce8fb'}
function saveConfig(url,key){localStorage.setItem('exam_supabase_url',url);localStorage.setItem('exam_supabase_key',key)}
function readConfig(){return {url:localStorage.getItem('exam_supabase_url')||'',key:localStorage.getItem('exam_supabase_key')||''}}
async function connect(url,key){if(!window.supabase?.createClient)throw new Error('Không tải được thư viện Supabase. Kiểm tra kết nối Internet.');const client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data,error}=await client.auth.getSession();if(error)throw error;state.client=client;state.session=data.session;setConnection('Đã kết nối Supabase',true);const{data:authData}=await client.auth.getUser();if(authData?.user){await enterApp(authData.user)}else showScreen('login-screen')}
function updateVersionDisplay(){const label=`Phiên bản ${APP_VERSION} · build ${APP_BUILD}`;const top=$('app-version');if(top)top.textContent=label;const foot=$('footer-version');if(foot)foot.textContent=`Khảo thí trực tuyến · ${label}`;document.documentElement.dataset.appVersion=APP_VERSION;}
async function enterApp(user){state.session={user};updateVersionDisplay();$('user-email').textContent=user.email||'';$('logout-btn').classList.remove('hidden');showScreen('app-screen');await loadExams();renderSubjects();}
async function signOut(){await state.client?.auth.signOut();state.session=null;state.selectedExam=null;state.preview=null;$('user-email').textContent='';$('logout-btn').classList.add('hidden');showScreen('login-screen')}
async function loadExams(){const body=$('exam-table-body');body.innerHTML='<tr><td colspan="6" class="empty">Đang tải...</td></tr>';const{data,error}=await state.client.from('exam_sessions').select('id,name,school_year,status,created_at,exam_mode').order('created_at',{ascending:false});if(error){body.innerHTML=`<tr><td colspan="6" class="empty">${esc(error.message)}</td></tr>`;return}state.exams=data||[];body.innerHTML='';if(!state.exams.length)body.innerHTML='<tr><td colspan="6" class="empty">Chưa có kỳ thi. Hãy tạo kỳ thi đầu tiên.</td></tr>';for(const exam of state.exams){const tr=document.createElement('tr');const mode=exam.exam_mode==='choice'?'Kỳ thi lựa chọn':'Kỳ thi mặc định';tr.innerHTML=`<td><b>${esc(exam.name)}</b><br><small>${esc(exam.id)}</small></td><td>${esc(exam.school_year)}</td><td><span class="tag">${mode}</span></td><td><span class="tag">${esc(exam.status)}</span></td><td>${exam.created_at?new Date(exam.created_at).toLocaleDateString('vi-VN'):'—'}</td><td><button class="small-btn" data-select-exam="${esc(exam.id)}">Chọn kỳ thi</button> <button class="small-btn" data-edit-exam="${esc(exam.id)}">Sửa</button> <button class="small-btn" data-delete-exam="${esc(exam.id)}">Xóa</button></td>`;body.append(tr)}for(const id of ['rooming-exam-select','subject-exam-select']){const select=$(id),current=select.value;select.innerHTML='<option value="">-- Chọn kỳ thi --</option>'+state.exams.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.school_year)})</option>`).join('');select.value=state.selectedExam&&state.exams.some(e=>e.id===state.selectedExam)?state.selectedExam:(current&&state.exams.some(e=>e.id===current)?current:(state.exams.length===1?state.exams[0].id:''))}state.selectedExam=$('rooming-exam-select').value||$('subject-exam-select').value||null;await loadCandidates()} 
async function createExam(event){event.preventDefault();const name=$('new-exam-name').value.trim(),school_year=$('new-exam-year').value.trim(),exam_mode=$('new-exam-mode').value;const{data,error}=await state.client.from('exam_sessions').insert({name,school_year,status:'draft',exam_mode}).select().single();if(error){message($('global-message'),error.message,'error');return}state.selectedExam=data.id;$('new-exam-name').value='';message($('global-message'),`Đã tạo ${exam_mode==='choice'?'kỳ thi lựa chọn':'kỳ thi mặc định'}.`,'success');await loadExams();$('rooming-exam-select').value=data.id;$('subject-exam-select').value=data.id;state.selectedExam=data.id;syncSubjectExamMode();switchTab('subjects')}
function syncSubjectExamMode(){
  const examId=$('subject-exam-select').value;
  const exam=state.exams.find(x=>x.id===examId);
  const mode=exam?.exam_mode==='choice'?'choice':'default';
  $('subject-config-kind').value=mode;
  const modeSelect=$('subject-mode');
  // The previous implementation only changed the value, leaving `disabled`
  // unchanged. This made the dropdown greyed out when switching from default to choice.
  modeSelect.disabled=mode!=='choice';
  if(mode!=='choice')modeSelect.value='required';
  $('subject-order-wrap').classList.toggle('hidden',mode!=='choice'||modeSelect.value!=='elective');
  $('subject-scope').dispatchEvent(new Event('change'));
  const note=$('subject-mode-note');
  if(note)note.textContent=mode==='choice'
    ?'Đây là kỳ thi lựa chọn: có thể đăng ký môn bắt buộc và môn lựa chọn cho lớp hoặc từng học sinh.'
    :'Đây là kỳ thi mặc định: chỉ cấu hình môn bắt buộc theo khối/lớp. Muốn đăng ký môn lựa chọn, hãy tạo/chọn kỳ thi loại “Kỳ thi lựa chọn”.';
}
function switchTab(tab){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('hidden',p.id!==`tab-${tab}`));if(tab==='candidates')loadCandidates();if(tab==='subjects')loadSubjectRegistrations()}
function renderSubjects(){$('subject-catalog').innerHTML='<div class="subject-card"><span class="tag">BẮT BUỘC</span><strong>Toán</strong><small>Lịch thi cứng, cấu hình riêng.</small></div><div class="subject-card"><span class="tag">BẮT BUỘC</span><strong>Ngữ văn</strong><small>Lịch thi cứng, cấu hình riêng.</small></div>'+SUBJECTS.map(s=>`<div class="subject-card"><span class="tag">LỰA CHỌN</span><strong>${esc(s.name)}</strong><small>Mã môn: <code>${s.code}</code></small></div>`).join('')}
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

async function importCsv(event){event.preventDefault();const examId=$('rooming-exam-select').value;if(!examId){message($('global-message'),'Hãy tạo hoặc chọn kỳ thi trước khi nhập hồ sơ thí sinh.','error');return}const file=$('candidate-csv').files[0];if(!file)return;try{const rows=await parseUploadFile(file);const required=['student_code','student_name','grade_code','class_code'];if(!rows.length)throw new Error('File Excel không có dữ liệu.');const missing=required.filter(k=>!(k in rows[0]));if(missing.length)throw new Error(`Thiếu cột: ${missing.join(', ')}.`);const errors=[],seen=new Set();const payload=rows.map((r,i)=>{const code=r.student_code.trim();if(!code||!r.student_name.trim()||!String(r.grade_code||'').trim()||!r.class_code.trim())errors.push(`Dòng ${i+2}: thiếu mã học sinh, họ tên, khối hoặc lớp.`);if(seen.has(code))errors.push(`Dòng ${i+2}: mã học sinh ${code} bị trùng trong file.`);seen.add(code);let dob=null;try{dob=r.date_of_birth?normalizeExcelTextDate(r.date_of_birth):null}catch(dateError){errors.push(`Dòng ${i+2}: ${dateError.message}`)}return{exam_id:examId,sbd:null,student_code:code,student_name:r.student_name.trim(),grade_code:String(r.grade_code||'').trim().replace(/^khối\s*/i,''),class_code:r.class_code.trim(),date_of_birth:dob,gender:r.gender||null,ethnicity:r.ethnicity||null,elective_1:null,elective_2:null}});if(errors.length)throw new Error(errors.slice(0,15).join('\n')+(errors.length>15?`\n... còn ${errors.length-15} lỗi.`:''));$('import-preview').innerHTML=`<div class="notice notice-info">Đã kiểm tra ${payload.length} hồ sơ. Chưa nhập SBD hoặc môn thi ở bước này.</div><button id="confirm-import" class="btn btn-primary" type="button">Xác nhận nhập ${payload.length} hồ sơ</button>`;$('confirm-import').onclick=async()=>{const{error}=await state.client.from('exam_candidates').upsert(payload,{onConflict:'exam_id,student_code'});if(error){message($('global-message'),error.message,'error');return}message($('global-message'),`Đã nhập/cập nhật ${payload.length} hồ sơ thí sinh. SBD và môn thi chưa được gán.`,'success');$('import-preview').innerHTML='';$('candidate-csv').value='';await loadCandidates()}}catch(e){message($('global-message'),e.message,'error')}}
async function loadCandidates(){
  state.selectedCandidateIds=[];
  const examId=$('rooming-exam-select').value,body=$('candidate-table-body');
  if(!examId){body.innerHTML='<tr><td colspan="9" class="empty">Chọn hoặc tạo kỳ thi.</td></tr>';state.candidates=[];return}
  const {data,error}=await state.client.from('exam_candidates')
    .select('id,sbd,student_code,student_name,date_of_birth,gender,ethnicity,grade_code,class_code')
    .eq('exam_id',examId).order('grade_code').order('class_code').order('student_name');
  if(error){body.innerHTML=`<tr><td colspan="9" class="empty">${esc(error.message)}</td></tr>`;return}
  state.candidates=data||[];
  populateCandidateFilters();
  renderCandidateTable();
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
  else{$('candidate-form-title').textContent='Thêm thí sinh';$('candidate-save').textContent='Thêm thí sinh';$('candidate-modal').showModal()}
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
  $('candidate-edit-ethnicity').value=c.ethnicity||'';$('candidate-edit-class').value=c.class_code||'';
  $('candidate-form-title').textContent='Sửa hồ sơ thí sinh';$('candidate-save').textContent='Lưu thay đổi';
  $('candidate-modal').showModal();
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
  if(!confirm(`Bạn sắp xóa ${ids.length} thí sinh khỏi kỳ thi hiện tại. Các đăng ký môn liên quan có thể bị xóa theo ràng buộc cơ sở dữ liệu. Thao tác không thể tự hoàn tác. Bạn có muốn tiếp tục?`))return;

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
      // Batch delete reduces HTTP requests substantially versus one request per student.
      const {data,error}=await state.client.from('exam_candidates')
        .delete().eq('exam_id',examId).in('id',batch).select('id');
      if(!error){
        for(const row of (data||[]))deleted.add(row.id);
        // If RLS filtered rows without an explicit error, they won't appear in returned data.
        const returned=new Set((data||[]).map(row=>row.id));
        for(const id of batch){
          if(returned.has(id))continue;
          // Check whether the row still exists; this differentiates a no-op from a deleted row.
          const check=await state.client.from('exam_candidates').select('id').eq('id',id).eq('exam_id',examId).maybeSingle();
          if(check.error)failed.push({id,error:check.error.message});
          else if(check.data)failed.push({id,error:'Bản ghi vẫn tồn tại sau lệnh xóa (có thể do RLS hoặc ràng buộc dữ liệu).'});
          else deleted.add(id);
        }
      }else{
        // A batch can fail because one row is referenced by a rooming plan. Retry individually
        // so independent records can still be deleted and the failed IDs can be reported.
        for(let i=0;i<batch.length;i++){
          const id=batch[i];
          const {data:one,error:oneError}=await state.client.from('exam_candidates')
            .delete().eq('id',id).eq('exam_id',examId).select('id');
          if(oneError)failed.push({id,error:oneError.message});
          else if(one&&one.length)deleted.add(id);
          else{
            const check=await state.client.from('exam_candidates').select('id').eq('id',id).eq('exam_id',examId).maybeSingle();
            if(check.error)failed.push({id,error:check.error.message});
            else if(check.data)failed.push({id,error:'Bản ghi vẫn tồn tại sau lệnh xóa.'});
            else deleted.add(id);
          }
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
    message($('candidate-form-message'),`Đã xóa ${deleted.size}/${ids.length} thí sinh. Còn ${failed.length} bản ghi chưa xóa. Có thể bị ràng buộc bởi phương án xếp phòng hoặc chính sách RLS. Xem chi tiết tại thanh tiến độ.`, 'error');
  }
}
async function previewRooming(){const examId=$('rooming-exam-select').value;if(!examId){message($('rooming-message'),'Hãy chọn kỳ thi.','error');return}const{data:candidates,error}=await state.client.from('exam_candidates').select('id,sbd,student_code,student_name,class_code').eq('exam_id',examId).order('sbd');if(error){message($('rooming-message'),error.message,'error');return}const{data:regs,error:regError}=await state.client.from('exam_candidate_subjects').select('candidate_id,subject_code,subject_order').eq('exam_id',examId).eq('subject_type','elective').order('subject_order');if(regError){message($('rooming-message'),`Không tải được đăng ký môn. Hãy chạy migration v0.1.2. ${regError.message}`,'error');return}const byCandidate=new Map();for(const r of regs||[]){if(!byCandidate.has(r.candidate_id))byCandidate.set(r.candidate_id,[]);byCandidate.get(r.candidate_id).push(r)}const eligible=(candidates||[]).map(c=>({...c,sbd:c.sbd||c.student_code,elective_subjects:(byCandidate.get(c.id)||[]).sort((a,b)=>a.subject_order-b.subject_order).map(r=>r.subject_code)}));const result=optimizeElectiveRooms(eligible,{capacity:$('room-capacity').value,roomPrefix:$('room-prefix').value,firstRoomNumber:$('first-room-number').value});if(!result.ok){state.preview=null;$('save-rooming').disabled=true;$('lock-rooming').disabled=true;message($('rooming-message'),result.errors.join('\n'),'error');return}state.preview={examId,options:{capacity:Number($('room-capacity').value),roomPrefix:$('room-prefix').value,firstRoomNumber:Number($('first-room-number').value)},result};renderRooming(result);message($('rooming-message'),'Phương án xem trước hợp lệ. SBD chưa được cấp sẽ tạm dùng mã học sinh để nhận diện; cần cấp SBD chính thức trước khi khóa danh sách.','success');$('save-rooming').disabled=false;$('lock-rooming').disabled=true;$('export-rooming').disabled=false}
function renderRooming(result){$('rooming-summary').innerHTML=[['Thí sinh',result.summary.candidate_count],['Số phòng',result.summary.room_count],['Sức chứa',result.summary.capacity],['Cặp môn',result.summary.pair_count]].map(([l,v])=>`<div class="metric"><span>${l}</span><strong>${v}</strong></div>`).join('');$('rooming-table-body').innerHTML=result.rooms.map(r=>`<tr><td><b>${esc(r.room_code)}</b></td><td>${r.student_count}/${r.capacity}</td><td>${esc(r.ca1_subject_name)}</td><td>${esc(r.ca2_subject_name)}</td><td>${esc(r.sbd_first)} – ${esc(r.sbd_last)}</td></tr>`).join('');$('assignment-table-body').innerHTML=result.assignments.map(a=>`<tr><td>${esc(a.sbd)}</td><td>${esc(a.student_name)}</td><td>${esc(a.class_code)}</td><td>${esc(a.room_code)}</td><td>${esc(subjectName(a.ca1_subject_code))}</td><td>${esc(subjectName(a.ca2_subject_code))}</td></tr>`).join('')}
async function saveRooming(lock=false){if(!state.preview){message($('rooming-message'),'Hãy tạo phương án xem trước trước.','error');return}const{examId,options,result}=state.preview;const payload={p_exam_id:examId,p_capacity:options.capacity,p_room_prefix:options.roomPrefix,p_first_room_number:options.firstRoomNumber,p_rooms:result.rooms,p_assignments:result.assignments,p_lock:lock};const{data,error}=await state.client.rpc('exam_save_elective_room_plan',payload);if(error){message($('rooming-message'),`Không lưu được. Kiểm tra đã chạy đủ SQL migration và tài khoản có quyền quản trị.\n${error.message}`,'error');return}message($('rooming-message'),`${lock?'Đã khóa':'Đã lưu'} phương án ${data?.plan_id||''}.`,'success');$('save-rooming').disabled=lock;$('lock-rooming').disabled=lock;state.preview.saved=data}
function exportRooming(){if(!state.preview)return;const rows=[['SBD','Họ tên','Lớp','Phòng','Ca 1','Ca 2'],...state.preview.result.assignments.map(a=>[a.sbd,a.student_name,a.class_code,a.room_code,subjectName(a.ca1_subject_code),subjectName(a.ca2_subject_code)])];const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');download(csv,`phan-phong-${state.preview.examId}.csv`,'text/csv;charset=utf-8')}
function download(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
function downloadTemplate(){downloadExcelTemplate()}
function downloadSubjectTemplate(){
  if(!window.XLSX){message($('subject-message'),'Không tải được thư viện Excel. Hãy kiểm tra kết nối Internet.','error');return}
  const rows=[
    ['Mã DD Bộ GD&ĐT','Họ tên','Môn 1','Môn 2'],
    ['3156124098','Lưu Minh An','Tiếng Anh','Vật lí'],
    ['3151505467','Bùi Ngọc Anh','Vật lí','Tiếng Anh'],
    ['3168060544','Đào Phương Anh','Lịch sử','Địa lí']
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
  const aliases={
    toan:'TOAN',toanhoc:'TOAN',van:'VAN',nguvan:'VAN',nguvanhoc:'VAN',
    anh:'ANH',tienganh:'ANH',english:'ANH',
    ly:'LY',vatli:'LY',vatly:'LY',vatlyhoc:'LY',physics:'LY',
    hoa:'HOA',hoahoc:'HOA',chemistry:'HOA',
    su:'SU',lichsu:'SU',history:'SU',
    dia:'DIA',diali:'DIA',dialy:'DIA',geography:'DIA',
    sinh:'SINH',sinhhoc:'SINH',biology:'SINH',
    tin:'TIN',tinhoc:'TIN',informatics:'TIN',
    gdktpl:'GDKTPL',giaoduckinhtephapluat:'GDKTPL'
  };
  const all=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];
  for(const item of all){
    if(key===normalizeSubjectLabel(item.code)||key===normalizeSubjectLabel(item.name))return item.code;
  }
  return aliases[key]||'';
}
function initSubjectCatalog(){const select=$('subject-code');const all=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];select.innerHTML=all.map(s=>`<option value=\"${s.code}\">${s.name} (${s.code})</option>`).join('')}
function normalizeSubjectChoiceRows(rows){
  const cleanKey=v=>String(v??'').trim().toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
  const aliases={
    student_code:['student_code','ma dd bo gd&dt','ma dd bo gd dt','ma dinh danh','ma hoc sinh','ma dd','ma hoc sinh bo gd&dt'],
    student_name:['ho ten','ho va ten','student_name'],
    subject1:['mon 1','mon1','mon thu nhat','mon lua chon 1'],
    subject2:['mon 2','mon2','mon thu hai','mon lua chon 2']
  };
  const find=(row,names)=>{for(const [k,v] of Object.entries(row)){const key=cleanKey(k);if(names.some(n=>cleanKey(n)===key))return String(v??'').trim()}return ''};
  const codeByName=new Map();
  for(const item of [{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS]){
    codeByName.set(cleanKey(item.code),item.code);
    codeByName.set(cleanKey(item.name),item.code);
  }
  for(const [alias,code] of Object.entries({'anh':'ANH','tieng anh':'ANH','english':'ANH','ly':'LY','vat li':'LY','vat ly':'LY','hoa':'HOA','hoa hoc':'HOA','su':'SU','lich su':'SU','dia':'DIA','dia li':'DIA','dia ly':'DIA','sinh':'SINH','sinh hoc':'SINH','tin':'TIN','tin hoc':'TIN','gdktpl':'GDKTPL','giao duc kinh te va phap luat':'GDKTPL'}))codeByName.set(cleanKey(alias),code);
  const result=[];
  for(const [i,row] of rows.entries()){
    const studentCode=find(row,aliases.student_code)||String(row.student_code??'').trim();
    const studentName=find(row,aliases.student_name)||String(row.student_name??'').trim();
    const s1=find(row,aliases.subject1)||String(row.subject1??'').trim();
    const s2=find(row,aliases.subject2)||String(row.subject2??'').trim();
    if(s1||s2){
      if(!studentCode)throw new Error(`Dòng ${i+2}: thiếu Mã DD Bộ GD&ĐT.`);
      if(!s1||!s2)throw new Error(`Dòng ${i+2}: cần nhập đủ Môn 1 và Môn 2.`);
      const c1=codeByName.get(cleanKey(s1))||String(s1).trim().toUpperCase();
      const c2=codeByName.get(cleanKey(s2))||String(s2).trim().toUpperCase();
      if(c1===c2)throw new Error(`Dòng ${i+2}: Môn 1 và Môn 2 không được trùng nhau.`);
      result.push({student_code:studentCode,student_name:studentName,subject_code:c1,subject_order:1,subject_type:'elective'});
      result.push({student_code:studentCode,student_name:studentName,subject_code:c2,subject_order:2,subject_type:'elective'});
    }else result.push(row);
  }
  return result;
}
async function loadSubjectPickerCandidates(){
  const examId=$('subject-exam-select').value;
  const classBox=$('subject-class-picker'),studentClass=$('subject-student-class'),studentBox=$('subject-student-picker');
  classBox.innerHTML='';studentBox.innerHTML='';studentClass.innerHTML='<option value="">-- Chọn lớp --</option>';
  if(!examId){classBox.innerHTML='<div class="picker-empty">Hãy chọn kỳ thi trước.</div>';return}
  message($('subject-message'),'Đang tải danh sách lớp và học sinh...','info');
  const {data,error}=await state.client.from('exam_candidates').select('id,student_code,student_name,grade_code,class_code').eq('exam_id',examId).order('class_code').order('student_name');
  if(error){message($('subject-message'),`Không tải được danh sách lớp/học sinh: ${error.message}`,'error');return}
  state.subjectPickerCandidates=data||[];
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
  const code=$('subject-code').value;
  const order=type==='elective'?Number($('subject-order').value):null;
  try{
    let targets=[];
    if(scope==='file'){
      const f=$('subject-csv').files[0];
      if(!f)throw new Error('Hãy chọn file Excel .xlsx hoặc CSV .csv đăng ký môn.');
      message($('subject-message'),`Đang đọc file ${f.name}...`,'info');
      const rawRows=await parseUploadFile(f);
      if(!rawRows.length)throw new Error('File không có dữ liệu.');
      const rows=normalizeSubjectChoiceRows(rawRows);
      if(!rows.length)throw new Error('Không tìm thấy dòng đăng ký hợp lệ trong file.');
      const normHeader=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]/g,'');
      const get=(row,aliases)=>{for(const [k,v] of Object.entries(row)){if(aliases.includes(normHeader(k))&&String(v??'').trim())return String(v).trim()}return ''};
      const codeByName=value=>{
        const code=canonicalSubjectCode(value);
        if(!code)throw new Error(`Tên/mã môn "${String(value||'').trim()}" không khớp danh mục môn thi trong hệ thống. Hãy dùng đúng tên môn hoặc mã môn chuẩn.`);
        return code;
      };
      const {data:students,error}=await state.client.from('exam_candidates').select('id,student_code,student_name,grade_code,class_code').eq('exam_id',examId);
      if(error)throw error;
      const byCode=new Map((students||[]).map(st=>[normalizeStudentCode(st.student_code),st]));
      for(const [i,r] of rows.entries()){
        const studentCode=normalizeStudentCode(get(r,['studentcode','studentid','madinhdanh','maddbogddt','madd','mahs','student_code']));
        const classCode=get(r,['classcode','lop','malop','class_code']);
        const studentName=get(r,['studentname','hoten','hovaten','fullname']);
        // Official template layout: student code, full name, subject 1, subject 2.
        const oneSubject=get(r,['subjectcode','mamon','monthi']);
        const rowTypeRaw=get(r,['subjecttype','loaimon']);
        const rowType=normHeader(rowTypeRaw)==='batbuoc'||normHeader(rowTypeRaw)==='required'?'required':'elective';
        const rowOrderRaw=get(r,['subjectorder','thutu','cathi']);
        let student=studentCode?byCode.get(studentCode):null;
        if(!student&&studentName){
          const nameKey=studentName.trim().toLocaleLowerCase('vi-VN');
          const matches=(students||[]).filter(st=>String(st.student_name||'').trim().toLocaleLowerCase('vi-VN')===nameKey);
          if(matches.length===1)student=matches[0];
          else if(matches.length>1)throw new Error(`Dòng ${i+2}: mã "${studentCode}" không khớp CSDL và tên "${studentName}" trùng ở ${matches.length} học sinh. Cần đối chiếu lại mã định danh.`);
        }
        if(!student)throw new Error(`Dòng ${i+2}: không tìm thấy học sinh theo mã "${studentCode||'(trống)'}"${studentName?` hoặc họ tên "${studentName}"`:''}. Kiểm tra mã định danh trong Excel có khớp exam_candidates.student_code hay không.`);
        const rowSubject=codeByName(oneSubject||code);
        const rowOrder=rowType==='elective'?Number(rowOrderRaw||order):null;
        if(!studentCode&&!classCode)throw new Error(`Dòng ${i+2}: cần mã học sinh hoặc mã lớp. Nếu dùng mẫu có cột Môn 1/Môn 2, hãy điền mã định danh học sinh.`);
        if(!rowSubject)throw new Error(`Dòng ${i+2}: thiếu mã môn.`);
        if(rowType==='elective'&&![1,2].includes(rowOrder))throw new Error(`Dòng ${i+2}: môn lựa chọn cần thứ tự ca 1 hoặc 2.`);
        const matched=studentCode?((byCode.has(studentCode))?[byCode.get(studentCode)]:[]):(students||[]).filter(st=>String(st.class_code||'').trim().toUpperCase()===classCode.toUpperCase());
        if(!matched.length)throw new Error(`Dòng ${i+2}: không tìm thấy học sinh/lớp "${studentCode||classCode}".`);
        targets.push(...matched.map(st=>({candidate_id:st.id,subject_code:rowSubject,subject_order:rowOrder,subject_type:rowType})));
      }
    }else{
      const {data:students,error}=await state.client.from('exam_candidates').select('id,student_code,grade_code,class_code').eq('exam_id',examId);
      if(error)throw error;
      if(scope==='grade'){
        const grade=$('subject-grade').value;
        if(!grade)throw new Error('Hãy chọn khối áp dụng.');
        targets=(students||[]).filter(st=>String(st.grade_code||'')===grade);
      }else if(scope==='class'){
        const selectedClasses=[...document.querySelectorAll('.subject-class-check:checked')].map(el=>el.value);
        if(!selectedClasses.length)throw new Error('Hãy chọn ít nhất một lớp bằng checkbox.');
        const classSet=new Set(selectedClasses.map(c=>c.toUpperCase()));
        targets=(students||[]).filter(st=>classSet.has(String(st.class_code||'').trim().toUpperCase()));
      }else if(scope==='class_students'){
        const classCode=$('subject-student-class').value;
        if(!classCode)throw new Error('Hãy chọn lớp trước.');
        const ids=[...document.querySelectorAll('.subject-student-check:checked')].map(el=>String(el.value));
        if(!ids.length)throw new Error('Hãy chọn ít nhất một học sinh bằng checkbox.');
        const inClass=(students||[]).filter(st=>String(st.class_code||'').trim()===classCode);
        const byId=new Map(inClass.map(st=>[String(st.id),st]));
        const missing=ids.filter(id=>!byId.has(id));
        if(missing.length)throw new Error('Một số học sinh được chọn không thuộc lớp đã chọn. Hãy tải lại danh sách.');
        targets=ids.map(id=>byId.get(id));
      }else if(scope==='student'){
        const studentCode=$('subject-student-code').value.trim();
        if(!studentCode)throw new Error('Hãy nhập mã học sinh.');
        targets=(students||[]).filter(st=>st.student_code===studentCode);
      }
      targets=targets.map(st=>({candidate_id:st.id,subject_code:code,subject_order:order,subject_type:type}));
    }
    if(!targets.length)throw new Error('Không tìm thấy học sinh phù hợp với phạm vi áp dụng.');
    const payloadMap=new Map();
    for(const t of targets){
      const normalizedCode=String(t.subject_code||'').trim().toUpperCase();
      payloadMap.set(`${t.candidate_id}|${normalizedCode}`,{...t,subject_code:normalizedCode,exam_id:examId});
    }
    const payload=[...payloadMap.values()];
    message($('subject-message'),`Đã đối chiếu ${payload.length} lượt đăng ký. Đang ghi dữ liệu lên Supabase...`,'info');
    const batchSize=100;
    for(let offset=0;offset<payload.length;offset+=batchSize){
      const batch=payload.slice(offset,offset+batchSize);
      const {error}=await state.client.from('exam_candidate_subjects').upsert(batch,{onConflict:'exam_id,candidate_id,subject_code'});
      if(error)throw new Error(`Lỗi khi ghi lô ${Math.floor(offset/batchSize)+1} (đã gửi ${offset}/${payload.length} lượt): ${error.message}`);
      message($('subject-message'),`Đang ghi đăng ký môn: ${Math.min(offset+batch.length,payload.length)}/${payload.length} lượt...`,'info');
    }
    const uniqueCodes=[...new Set(payload.map(x=>x.subject_code))];
    const persistedByCode={};
    for(const subjectCode of uniqueCodes){
      const {count,error:verifyError}=await state.client.from('exam_candidate_subjects')
        .select('candidate_id',{count:'exact',head:true})
        .eq('exam_id',examId).eq('subject_code',subjectCode);
      if(verifyError)throw new Error(`Đã gửi dữ liệu nhưng không xác minh được môn ${subjectCode} trên CSDL: ${verifyError.message}`);
      persistedByCode[subjectCode]=count??0;
    }
    await loadSubjectRegistrations();
    message($('subject-message'),`Đã lưu và kiểm tra trên Supabase. ${uniqueCodes.map(c=>`${subjectName(c)} (${c}): ${persistedByCode[c]} lượt đăng ký`).join('; ')}.`, 'success');
  }catch(e){message($('subject-message'),e.message,'error')}
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
      .eq('exam_id',examId).order('subject_code').order('candidate_id')
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
  const [regRes,candRes]=await Promise.all([
    state.client.from('exam_candidate_subjects').select('candidate_id,subject_code,subject_type,subject_order').eq('exam_id',examId).eq('subject_code',code).eq('subject_type',type).order('candidate_id'),
    state.client.from('exam_candidates').select('id,student_code,student_name,class_code,grade_code').eq('exam_id',examId).order('class_code').order('student_name')
  ]);
  if(regRes.error||candRes.error){message($('subject-manage-message'),(regRes.error||candRes.error).message,'error');return}
  const registrations=regRes.data||[];
  const matches=registrations.filter(r=>type!=='elective'||String(r.subject_order??'')===String(order??''));
  const registeredIds=new Set(matches.map(r=>String(r.candidate_id)));
  const candidates=candRes.data||[];
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
function wire(){ $('setup-form').addEventListener('submit',async e=>{e.preventDefault();const url=$('supabase-url').value.trim().replace(/\/$/,''),key=$('supabase-key').value.trim();try{await connect(url,key);saveConfig(url,key)}catch(err){setConnection('Kết nối lỗi');message($('login-message'),err.message,'error');showScreen('setup-screen')}});$('clear-config').onclick=()=>{localStorage.removeItem('exam_supabase_url');localStorage.removeItem('exam_supabase_key');$('supabase-url').value='';$('supabase-key').value=''};$('change-config').onclick=()=>{showScreen('setup-screen');const c=readConfig();$('supabase-url').value=c.url;$('supabase-key').value=c.key};$('login-form').addEventListener('submit',async e=>{e.preventDefault();const{data,error}=await state.client.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});if(error){message($('login-message'),error.message,'error');return}await enterApp(data.user)});$('logout-btn').onclick=signOut;document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('create-exam-form').addEventListener('submit',createExam);$('reload-exams').onclick=loadExams;$('exam-table-body').addEventListener('click',async e=>{
  const selectBtn=e.target.closest('[data-select-exam]');
  const editBtn=e.target.closest('[data-edit-exam]');
  const deleteBtn=e.target.closest('[data-delete-exam]');
  if(selectBtn){
    state.selectedExam=selectBtn.dataset.selectExam;
    $('rooming-exam-select').value=state.selectedExam;
    $('subject-exam-select').value=state.selectedExam;
    syncSubjectExamMode();loadCandidates();switchTab('subjects');return;
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
    const modeInput=prompt('Loại kỳ thi: nhập 1 = Kỳ thi mặc định, 2 = Kỳ thi lựa chọn.',exam.exam_mode==='choice'?'2':'1');
    if(modeInput===null)return;
    const exam_mode=modeInput.trim()==='2'?'choice':modeInput.trim()==='1'?'default':null;
    if(!exam_mode){message($('global-message'),'Loại kỳ thi không hợp lệ. Hãy nhập 1 hoặc 2.','error');return;}
    const {error}=await state.client.from('exam_sessions').update({name:name.trim(),school_year:school_year.trim(),exam_mode}).eq('id',exam.id);
    if(error){message($('global-message'),`Không sửa được kỳ thi: ${error.message}`,'error');return;}
    message($('global-message'),'Đã cập nhật thông tin kỳ thi.','success');
    await loadExams();
    $('subject-exam-select').value=exam.id;$('rooming-exam-select').value=exam.id;
    syncSubjectExamMode();return;
  }
  if(deleteBtn){
    const exam=state.exams.find(x=>x.id===deleteBtn.dataset.deleteExam);
    if(!exam)return;
    const ok=confirm(`Bạn sắp xóa kỳ thi "${exam.name}" (${exam.school_year}). Thao tác có thể bị CSDL từ chối nếu kỳ thi đang có dữ liệu liên quan. Bạn có chắc chắn muốn xóa?`);
    if(!ok)return;
    const {error}=await state.client.from('exam_sessions').delete().eq('id',exam.id);
    if(error){
      message($('global-message'),`Không xóa được kỳ thi: ${error.message}. Có thể kỳ thi còn hồ sơ, đăng ký môn hoặc dữ liệu xếp phòng liên quan; hãy kiểm tra khóa ngoại trước khi xóa.`, 'error');
      return;
    }
    if(state.selectedExam===exam.id)state.selectedExam=null;
    message($('global-message'),'Đã xóa kỳ thi.','success');
    await loadExams();
    return;
  }
});$('rooming-exam-select').onchange=()=>{state.selectedExam=$('rooming-exam-select').value;state.preview=null;$('save-rooming').disabled=true;$('lock-rooming').disabled=true;loadCandidates()};$('download-csv-template').addEventListener('click',downloadExcelTemplate);$('import-form').addEventListener('submit',importCsv);$('candidate-edit-form').addEventListener('submit',saveCandidate);$('candidate-add-open').onclick=()=>openCandidateModal();$('candidate-cancel-edit').onclick=resetCandidateForm;$('candidate-modal-close').onclick=resetCandidateForm;$('candidate-search').addEventListener('input',renderCandidateTable);$('candidate-grade-filter').onchange=()=>{populateCandidateClassFilter();renderCandidateTable()};$('candidate-class-filter').onchange=renderCandidateTable;$('candidate-clear-filters').onclick=()=>{$('candidate-grade-filter').value='';populateCandidateClassFilter();$('candidate-class-filter').value='';$('candidate-search').value='';renderCandidateTable()};$('candidate-table-body').addEventListener('click',e=>{const edit=e.target.closest('[data-candidate-edit]');if(edit)openCandidateModal(edit.dataset.candidateEdit)});$('candidate-table-body').addEventListener('change',e=>{const box=e.target.closest('[data-candidate-check]');if(box)updateCandidateSelection(box.dataset.candidateCheck,box.checked)});const selectVisible=checked=>{const ids=getFilteredCandidates().map(c=>c.id);const s=new Set(state.selectedCandidateIds||[]);ids.forEach(id=>checked?s.add(id):s.delete(id));state.selectedCandidateIds=[...s];renderCandidateTable()};$('candidate-select-all').onchange=e=>selectVisible(e.target.checked);$('candidate-header-check').onchange=e=>selectVisible(e.target.checked);$('candidate-bulk-delete').onclick=deleteSelectedCandidates;$('download-subject-template').onclick=downloadSubjectTemplate;$('subject-manage-close').onclick=()=>{$('subject-manage-dialog').close();subjectManageContext=null};$('subject-manage-action').onchange=()=>{$('subject-manage-target-wrap').classList.toggle('hidden',$('subject-manage-action').value!=='move')};$('subject-manage-select-all').onclick=()=>document.querySelectorAll('.subject-manage-current-check').forEach(x=>x.checked=true);$('subject-manage-clear').onclick=()=>document.querySelectorAll('.subject-manage-current-check').forEach(x=>x.checked=false);$('subject-manage-add-all').onclick=()=>document.querySelectorAll('.subject-manage-add-check').forEach(x=>x.checked=true);$('subject-manage-add-clear').onclick=()=>document.querySelectorAll('.subject-manage-add-check').forEach(x=>x.checked=false);$('subject-manage-save').onclick=saveSubjectManager;$('subject-config-kind').onchange=async()=>{const choice=$('subject-config-kind').value==='choice';$('subject-mode').value=choice?'elective':'required';$('subject-mode').disabled=!choice;$('subject-order-wrap').classList.toggle('hidden',!choice);if(!choice&&['class_students','student'].includes($('subject-scope').value))$('subject-scope').value='class';$('subject-scope').dispatchEvent(new Event('change'));const examId=$('subject-exam-select').value;if(examId&&state.client){const{error}=await state.client.from('exam_sessions').update({exam_mode:choice?'choice':'default'}).eq('id',examId);if(error)message($('subject-message'),`Không lưu được hình thức kỳ thi: ${error.message}. Hãy chạy migration v0.1.21.`, 'error');else{const e=state.exams.find(x=>x.id===examId);if(e)e.exam_mode=choice?'choice':'default';message($('subject-message'),`Đã lưu hình thức kỳ thi: ${choice?'Kỳ thi lựa chọn':'Kỳ thi mặc định'}.`,'success')}}};$('subject-mode').onchange=()=>{$('subject-order-wrap').classList.toggle('hidden',$('subject-mode').value!=='elective')};$('subject-config-kind').dispatchEvent(new Event('change'));$('subject-mode').dispatchEvent(new Event('change'));$('apply-subject').onclick=async()=>{
  const b=$('apply-subject');const old=b.textContent;
  if(b.dataset.busy==='1')return;
  b.dataset.busy='1';b.disabled=true;b.textContent='Đang xử lý...';
  try{await applySubject()}finally{b.dataset.busy='0';b.disabled=false;b.textContent=old}
};$('load-subject-registrations').onclick=async()=>{const b=$('load-subject-registrations');b.disabled=true;const oldText=b.textContent;b.textContent='Đang tải...';try{await loadSubjectRegistrations()}catch(e){message($('subject-message'),`Không tải được danh sách đăng ký môn: ${e.message}`,'error')}finally{b.disabled=false;b.textContent=oldText}};$('subject-exam-select').onchange=()=>{syncSubjectExamMode();loadSubjectRegistrations()};$('subject-scope').onchange=()=>{const scope=$('subject-scope').value;$('subject-class-code').disabled=!['class','class_students'].includes(scope);$('subject-student-code').disabled=scope!=='student';$('subject-csv').disabled=false;$('subject-grade').disabled=scope!=='grade';$('subject-student-list').disabled=scope!=='class_students';$('subject-class-code-wrap').classList.add('hidden');$('subject-class-picker-wrap').classList.toggle('hidden',scope!=='class');$('subject-student-class-wrap').classList.toggle('hidden',scope!=='class_students');$('subject-student-picker-wrap').classList.toggle('hidden',scope!=='class_students');$('subject-student-code-wrap').classList.toggle('hidden',scope!=='student');$('subject-grade-wrap').classList.toggle('hidden',scope!=='grade');$('subject-student-list-wrap').classList.add('hidden');if(['class','class_students'].includes(scope)&&state.client)loadSubjectPickerCandidates();};$('subject-scope').dispatchEvent(new Event('change'));$('subject-student-class').onchange=renderSubjectStudentPicker;$('subject-exam-select').addEventListener('change',()=>{if(['class','class_students'].includes($('subject-scope').value))loadSubjectPickerCandidates()});$('subject-classes-select-all').onclick=()=>document.querySelectorAll('.subject-class-check').forEach(el=>el.checked=true);$('subject-classes-clear').onclick=()=>document.querySelectorAll('.subject-class-check').forEach(el=>el.checked=false);$('subject-students-select-all').onclick=()=>document.querySelectorAll('.subject-student-check').forEach(el=>el.checked=true);$('subject-students-clear').onclick=()=>document.querySelectorAll('.subject-student-check').forEach(el=>el.checked=false);$('subject-mode').onchange=()=>{const elective=$('subject-mode').value==='elective';$('subject-order-wrap').classList.toggle('hidden',!elective);if(!elective)$('subject-order').value='1'};$('subject-mode').dispatchEvent(new Event('change'));initSubjectCatalog();$('preview-rooming').onclick=previewRooming;$('save-rooming').onclick=()=>saveRooming(false);$('lock-rooming').onclick=()=>{if(confirm('Khóa phương án xếp phòng? Hãy chắc chắn đã kiểm tra danh sách.'))saveRooming(true)};$('export-rooming').onclick=exportRooming;}
async function boot(){wire();renderSubjects();const config=readConfig();if(!config.url||!config.key){showScreen('setup-screen');return}$('supabase-url').value=config.url;$('supabase-key').value=config.key;try{await connect(config.url,config.key)}catch(e){setConnection('Chưa kết nối');showScreen('setup-screen');message($('login-message'),`Không kết nối được: ${e.message}`,'error')}}
boot();
