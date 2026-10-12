import {optimizeElectiveRooms,SUBJECTS} from './rooming.js';
const $=id=>document.getElementById(id);
const state={client:null,session:null,exams:[],candidates:[],selectedCandidateIds:[],selectedExam:null,preview:null,config:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(el,text,type='info'){el.textContent=text;el.className=`notice notice-${type}`;el.classList.remove('hidden')}
function hide(el){el.classList.add('hidden')}
function showScreen(name){for(const id of ['setup-screen','login-screen','app-screen'])$(id).classList.toggle('hidden',id!==name)}
function setConnection(text,ok=false){$('connection-state').textContent=text;$('connection-state').style.background=ok?'#166534':'transparent';$('connection-state').style.color=ok?'white':'#dce8fb'}
function saveConfig(url,key){localStorage.setItem('exam_supabase_url',url);localStorage.setItem('exam_supabase_key',key)}
function readConfig(){return {url:localStorage.getItem('exam_supabase_url')||'',key:localStorage.getItem('exam_supabase_key')||''}}
async function connect(url,key){if(!window.supabase?.createClient)throw new Error('Không tải được thư viện Supabase. Kiểm tra kết nối Internet.');const client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data,error}=await client.auth.getSession();if(error)throw error;state.client=client;state.session=data.session;setConnection('Đã kết nối Supabase',true);const{data:authData}=await client.auth.getUser();if(authData?.user){await enterApp(authData.user)}else showScreen('login-screen')}
async function enterApp(user){state.session={user};$('user-email').textContent=user.email||'';$('logout-btn').classList.remove('hidden');showScreen('app-screen');await loadExams();renderSubjects();}
async function signOut(){await state.client?.auth.signOut();state.session=null;state.selectedExam=null;state.preview=null;$('user-email').textContent='';$('logout-btn').classList.add('hidden');showScreen('login-screen')}
async function loadExams(){const body=$('exam-table-body');body.innerHTML='<tr><td colspan="5" class="empty">Đang tải...</td></tr>';const{data,error}=await state.client.from('exam_sessions').select('id,name,school_year,status,created_at').order('created_at',{ascending:false});if(error){body.innerHTML=`<tr><td colspan="5" class="empty">${esc(error.message)}</td></tr>`;return}state.exams=data||[];body.innerHTML='';if(!state.exams.length)body.innerHTML='<tr><td colspan="5" class="empty">Chưa có kỳ thi. Hãy tạo kỳ thi đầu tiên.</td></tr>';for(const exam of state.exams){const tr=document.createElement('tr');tr.innerHTML=`<td><b>${esc(exam.name)}</b><br><small>${esc(exam.id)}</small></td><td>${esc(exam.school_year)}</td><td><span class="tag">${esc(exam.status)}</span></td><td>${exam.created_at?new Date(exam.created_at).toLocaleDateString('vi-VN'):'—'}</td><td><button class="small-btn" data-select-exam="${esc(exam.id)}">Chọn kỳ thi</button></td>`;body.append(tr)}for(const id of ['rooming-exam-select','subject-exam-select']){const select=$(id),current=select.value;select.innerHTML='<option value="">-- Chọn kỳ thi --</option>'+state.exams.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.school_year)})</option>`).join('');select.value=state.selectedExam&&state.exams.some(e=>e.id===state.selectedExam)?state.selectedExam:(current&&state.exams.some(e=>e.id===current)?current:(state.exams.length===1?state.exams[0].id:''))}state.selectedExam=$('rooming-exam-select').value||$('subject-exam-select').value||null;await loadCandidates()} 
async function createExam(event){event.preventDefault();const name=$('new-exam-name').value.trim(),school_year=$('new-exam-year').value.trim();const{data,error}=await state.client.from('exam_sessions').insert({name,school_year,status:'draft'}).select().single();if(error){message($('global-message'),error.message,'error');return}state.selectedExam=data.id;$('new-exam-name').value='';message($('global-message'),'Đã tạo kỳ thi.','success');await loadExams();$('rooming-exam-select').value=data.id;state.selectedExam=data.id;switchTab('rooming')}
function switchTab(tab){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('hidden',p.id!==`tab-${tab}`));if(tab==='candidates')loadCandidates();if(tab==='subjects')loadSubjectRegistrations()}
function renderSubjects(){$('subject-catalog').innerHTML='<div class="subject-card"><span class="tag">BẮT BUỘC</span><strong>Toán</strong><small>Lịch thi cứng, cấu hình riêng.</small></div><div class="subject-card"><span class="tag">BẮT BUỘC</span><strong>Ngữ văn</strong><small>Lịch thi cứng, cấu hình riêng.</small></div>'+SUBJECTS.map(s=>`<div class="subject-card"><span class="tag">LỰA CHỌN</span><strong>${esc(s.name)}</strong><small>Mã môn: <code>${s.code}</code></small></div>`).join('')}
function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'&&quoted&&next==='"'){cell+='"';i++}else if(ch==='"'){quoted=!quoted}else if(ch===','&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}else cell+=ch}row.push(cell);if(row.some(v=>v.trim()))rows.push(row);if(!rows.length)return[];const headers=rows.shift().map(h=>h.trim().replace(/^\uFEFF/,''));return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,(values[i]??'').trim()])))}
async function parseUploadFile(file){
  if(/\.xlsx?$/i.test(file.name)){
    if(!window.XLSX)throw new Error('Không tải được thư viện đọc Excel. Hãy kiểm tra Internet.');
    const buf=await file.arrayBuffer();
    const wb=window.XLSX.read(buf,{type:'array',cellDates:false});
    const ws=wb.Sheets[wb.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(ws,{defval:'',raw:false}).map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[String(k).trim(),String(v??'').trim()])));
  }
  const buf=await file.arrayBuffer();
  const bytes=new Uint8Array(buf);
  let text;
  try {
    if(bytes.length>=2 && bytes[0]===0xFF && bytes[1]===0xFE) text=new TextDecoder('utf-16le').decode(bytes);
    else if(bytes.length>=2 && bytes[0]===0xFE && bytes[1]===0xFF) text=new TextDecoder('utf-16be').decode(bytes);
    else text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  } catch {
    // Legacy Vietnamese CSV exported by desktop Excel may use Windows-1258.
    try { text=new TextDecoder('windows-1258').decode(bytes); }
    catch { throw new Error('Không xác định được mã hóa CSV. Hãy mở file bằng Excel và lưu thành CSV UTF-8 hoặc tải trực tiếp file .xlsx.'); }
  }
  return parseCsv(text);
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

async function importCsv(event){event.preventDefault();const examId=$('rooming-exam-select').value;if(!examId){message($('global-message'),'Hãy tạo hoặc chọn kỳ thi trước khi nhập hồ sơ thí sinh.','error');return}const file=$('candidate-csv').files[0];if(!file)return;try{const rows=await parseUploadFile(file);const required=['student_code','student_name','grade_code','class_code'];if(!rows.length)throw new Error('CSV không có dữ liệu.');const missing=required.filter(k=>!(k in rows[0]));if(missing.length)throw new Error(`Thiếu cột: ${missing.join(', ')}.`);const errors=[],seen=new Set();const payload=rows.map((r,i)=>{const code=r.student_code.trim();if(!code||!r.student_name.trim()||!String(r.grade_code||'').trim()||!r.class_code.trim())errors.push(`Dòng ${i+2}: thiếu mã học sinh, họ tên, khối hoặc lớp.`);if(seen.has(code))errors.push(`Dòng ${i+2}: mã học sinh ${code} bị trùng trong file.`);seen.add(code);let dob=null;try{dob=normalizeDateForSupabase(r.date_of_birth)}catch(dateError){errors.push(`Dòng ${i+2}: ${dateError.message}`)}return{exam_id:examId,sbd:null,student_code:code,student_name:r.student_name.trim(),grade_code:String(r.grade_code||'').trim().replace(/^khối\s*/i,''),class_code:r.class_code.trim(),date_of_birth:dob,gender:r.gender||null,ethnicity:r.ethnicity||null,elective_1:null,elective_2:null}});if(errors.length)throw new Error(errors.slice(0,15).join('\n')+(errors.length>15?`\n... còn ${errors.length-15} lỗi.`:''));$('import-preview').innerHTML=`<div class="notice notice-info">Đã kiểm tra ${payload.length} hồ sơ. Chưa nhập SBD hoặc môn thi ở bước này.</div><button id="confirm-import" class="btn btn-primary" type="button">Xác nhận nhập ${payload.length} hồ sơ</button>`;$('confirm-import').onclick=async()=>{const{error}=await state.client.from('exam_candidates').upsert(payload,{onConflict:'exam_id,student_code'});if(error){message($('global-message'),error.message,'error');return}message($('global-message'),`Đã nhập/cập nhật ${payload.length} hồ sơ thí sinh. SBD và môn thi chưa được gán.`,'success');$('import-preview').innerHTML='';$('candidate-csv').value='';await loadCandidates()}}catch(e){message($('global-message'),e.message,'error')}}
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
function downloadTemplate(){download('student_code,student_name,date_of_birth,gender,ethnicity,grade_code,class_code\r\nHS0001,Nguyen Van A,2009-05-20,Nam,Kinh,12,12A1\r\nHS0002,Tran Thi B,2009-11-12,Nu,Kinh,12,12A1\r\n','mau-ho-so-thi-sinh.csv','text/csv;charset=utf-8')}
function downloadSubjectTemplate(){download('student_code,class_code,subject_code,subject_order,subject_type\r\nHS0001,,HOA,1,elective\r\nHS0001,,LY,2,elective\r\n,12A1,TOAN,,required\r\n','mau-dang-ky-mon-thi.csv','text/csv;charset=utf-8')}
function initSubjectCatalog(){const select=$('subject-code');const all=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];select.innerHTML=all.map(s=>`<option value=\"${s.code}\">${s.name} (${s.code})</option>`).join('')}
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
      if(!f)throw new Error('Hãy chọn file CSV hoặc Excel đăng ký môn.');
      const rows=await parseUploadFile(f);
      if(!rows.length)throw new Error('File không có dữ liệu.');
      const {data:students,error}=await state.client.from('exam_candidates').select('id,student_code,grade_code,class_code').eq('exam_id',examId);
      if(error)throw error;
      for(const [i,r] of rows.entries()){
        const studentCode=(r.student_code||'').trim();
        const classCode=(r.class_code||'').trim();
        const rowSubject=(r.subject_code||code).trim().toUpperCase();
        const rowType=(r.subject_type||type)==='required'?'required':'elective';
        const rowOrder=rowType==='elective'?Number(r.subject_order||order):null;
        if(!studentCode&&!classCode)throw new Error(`Dòng ${i+2}: cần student_code hoặc class_code.`);
        if(!rowSubject)throw new Error(`Dòng ${i+2}: thiếu subject_code.`);
        if(rowType==='elective'&&![1,2].includes(rowOrder))throw new Error(`Dòng ${i+2}: môn lựa chọn phải có subject_order là 1 hoặc 2.`);
        const matched=(students||[]).filter(st=>studentCode?st.student_code===studentCode:st.class_code===classCode);
        if(!matched.length)throw new Error(`Dòng ${i+2}: không tìm thấy học sinh/lớp áp dụng.`);
        targets.push(...matched.map(st=>({candidate_id:st.id,subject_code:rowSubject,subject_order:rowOrder,subject_type:rowType})));
      }
    }else{
      const {data:students,error}=await state.client.from('exam_candidates').select('id,student_code,grade_code,class_code').eq('exam_id',examId);
      if(error)throw error;
      const classCode=$('subject-class-code').value.trim();
      if(scope==='grade'){
        const grade=$('subject-grade').value;
        if(!grade)throw new Error('Hãy chọn khối áp dụng.');
        targets=(students||[]).filter(st=>String(st.grade_code||'')===grade);
      }else if(scope==='class'){
        if(!classCode)throw new Error('Hãy nhập lớp áp dụng.');
        targets=(students||[]).filter(st=>st.class_code.trim().toUpperCase()===classCode.toUpperCase());
      }else if(scope==='class_students'){
        if(!classCode)throw new Error('Hãy nhập lớp trước khi chọn học sinh.');
        const codes=$('subject-student-list').value.split(/[\n,;\t ]+/).map(v=>v.trim()).filter(Boolean);
        if(!codes.length)throw new Error('Hãy nhập ít nhất một mã học sinh.');
        const inClass=(students||[]).filter(st=>st.class_code.trim().toUpperCase()===classCode.toUpperCase());
        const byCode=new Map(inClass.map(st=>[st.student_code,st]));
        const missing=codes.filter(c=>!byCode.has(c));
        if(missing.length)throw new Error(`Các mã sau không thuộc lớp ${classCode} hoặc không tồn tại: ${missing.slice(0,10).join(', ')}`);
        const unique=[...new Set(codes)];
        targets=unique.map(c=>byCode.get(c));
      }else if(scope==='student'){
        const studentCode=$('subject-student-code').value.trim();
        if(!studentCode)throw new Error('Hãy nhập mã học sinh.');
        targets=(students||[]).filter(st=>st.student_code===studentCode);
      }
      targets=targets.map(st=>({candidate_id:st.id,subject_code:code,subject_order:order,subject_type:type}));
    }
    if(!targets.length)throw new Error('Không tìm thấy học sinh phù hợp với phạm vi áp dụng.');
    const payload=targets.map(t=>({...t,exam_id:examId}));
    const {error}=await state.client.from('exam_candidate_subjects').upsert(payload,{onConflict:'exam_id,candidate_id,subject_code'});
    if(error)throw error;
    message($('subject-message'),`Đã áp dụng ${code} (${type==='required'?'môn bắt buộc':'môn lựa chọn'}) cho ${payload.length} lượt đăng ký.`, 'success');
    await loadSubjectRegistrations();
  }catch(e){message($('subject-message'),e.message,'error')}
}
async function loadSubjectRegistrations(){const examId=$('subject-exam-select').value;if(!examId){message($('subject-message'),'Hãy chọn kỳ thi.','error');return}const{data,error}=await state.client.from('exam_candidate_subjects').select('candidate_id,subject_code,subject_type,subject_order,exam_candidates(student_code,student_name,class_code)').eq('exam_id',examId).order('subject_code');if(error){message($('subject-message'),error.message,'error');return}const body=$('subject-table-body');body.innerHTML='';for(const r of data||[]){const s=r.exam_candidates||{};body.insertAdjacentHTML('beforeend',`<tr><td>${esc(s.student_code)}</td><td>${esc(s.student_name)}</td><td>${esc(s.class_code)}</td><td>${esc(r.subject_code)}</td><td>${esc(subjectName(r.subject_code)||({TOAN:'Toán',VAN:'Ngữ văn'}[r.subject_code]||r.subject_code))}</td><td>${r.subject_type==='required'?'Bắt buộc':'Lựa chọn'}</td><td>${esc(r.subject_order||'—')}</td></tr>`)}if(!data?.length)body.innerHTML='<tr><td colspan=\"7\" class=\"empty\">Chưa có đăng ký môn thi.</td></tr>'}
function wire(){ $('setup-form').addEventListener('submit',async e=>{e.preventDefault();const url=$('supabase-url').value.trim().replace(/\/$/,''),key=$('supabase-key').value.trim();try{await connect(url,key);saveConfig(url,key)}catch(err){setConnection('Kết nối lỗi');message($('login-message'),err.message,'error');showScreen('setup-screen')}});$('clear-config').onclick=()=>{localStorage.removeItem('exam_supabase_url');localStorage.removeItem('exam_supabase_key');$('supabase-url').value='';$('supabase-key').value=''};$('change-config').onclick=()=>{showScreen('setup-screen');const c=readConfig();$('supabase-url').value=c.url;$('supabase-key').value=c.key};$('login-form').addEventListener('submit',async e=>{e.preventDefault();const{data,error}=await state.client.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});if(error){message($('login-message'),error.message,'error');return}await enterApp(data.user)});$('logout-btn').onclick=signOut;document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('create-exam-form').addEventListener('submit',createExam);$('reload-exams').onclick=loadExams;$('exam-table-body').addEventListener('click',e=>{const b=e.target.closest('[data-select-exam]');if(b){state.selectedExam=b.dataset.selectExam;$('rooming-exam-select').value=state.selectedExam;loadCandidates();switchTab('rooming')}});$('rooming-exam-select').onchange=()=>{state.selectedExam=$('rooming-exam-select').value;state.preview=null;$('save-rooming').disabled=true;$('lock-rooming').disabled=true;loadCandidates()};$('import-form').addEventListener('submit',importCsv);$('candidate-edit-form').addEventListener('submit',saveCandidate);$('candidate-add-open').onclick=()=>openCandidateModal();$('candidate-cancel-edit').onclick=resetCandidateForm;$('candidate-modal-close').onclick=resetCandidateForm;$('candidate-search').addEventListener('input',renderCandidateTable);$('candidate-grade-filter').onchange=()=>{populateCandidateClassFilter();renderCandidateTable()};$('candidate-class-filter').onchange=renderCandidateTable;$('candidate-clear-filters').onclick=()=>{$('candidate-grade-filter').value='';populateCandidateClassFilter();$('candidate-class-filter').value='';$('candidate-search').value='';renderCandidateTable()};$('candidate-table-body').addEventListener('click',e=>{const edit=e.target.closest('[data-candidate-edit]');if(edit)openCandidateModal(edit.dataset.candidateEdit)});$('candidate-table-body').addEventListener('change',e=>{const box=e.target.closest('[data-candidate-check]');if(box)updateCandidateSelection(box.dataset.candidateCheck,box.checked)});const selectVisible=checked=>{const ids=getFilteredCandidates().map(c=>c.id);const s=new Set(state.selectedCandidateIds||[]);ids.forEach(id=>checked?s.add(id):s.delete(id));state.selectedCandidateIds=[...s];renderCandidateTable()};$('candidate-select-all').onchange=e=>selectVisible(e.target.checked);$('candidate-header-check').onchange=e=>selectVisible(e.target.checked);$('candidate-bulk-delete').onclick=deleteSelectedCandidates;$('download-csv-template').onclick=downloadTemplate;$('download-subject-template').onclick=downloadSubjectTemplate;$('apply-subject').onclick=applySubject;$('load-subject-registrations').onclick=loadSubjectRegistrations;$('subject-exam-select').onchange=loadSubjectRegistrations;$('subject-scope').onchange=()=>{const scope=$('subject-scope').value;$('subject-class-code').disabled=!['class','class_students'].includes(scope);$('subject-student-code').disabled=scope!=='student';$('subject-csv').disabled=scope!=='file';$('subject-grade').disabled=scope!=='grade';$('subject-student-list').disabled=scope!=='class_students';$('subject-student-code-wrap').classList.toggle('hidden',scope!=='student');$('subject-grade-wrap').classList.toggle('hidden',scope!=='grade');$('subject-student-list-wrap').classList.toggle('hidden',scope!=='class_students');};$('subject-scope').dispatchEvent(new Event('change'));$('subject-mode').onchange=()=>{const elective=$('subject-mode').value==='elective';$('subject-order-wrap').classList.toggle('hidden',!elective);if(!elective)$('subject-order').value='1'};$('subject-mode').dispatchEvent(new Event('change'));initSubjectCatalog();$('preview-rooming').onclick=previewRooming;$('save-rooming').onclick=()=>saveRooming(false);$('lock-rooming').onclick=()=>{if(confirm('Khóa phương án xếp phòng? Hãy chắc chắn đã kiểm tra danh sách.'))saveRooming(true)};$('export-rooming').onclick=exportRooming;}
async function boot(){wire();renderSubjects();const config=readConfig();if(!config.url||!config.key){showScreen('setup-screen');return}$('supabase-url').value=config.url;$('supabase-key').value=config.key;try{await connect(config.url,config.key)}catch(e){setConnection('Chưa kết nối');showScreen('setup-screen');message($('login-message'),`Không kết nối được: ${e.message}`,'error')}}
boot();
