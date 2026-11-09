import {publicConfig,validatePublicConfig} from './public-config.js?v=0.1.148';
const $=id=>document.getElementById(id);
const tabs=[...document.querySelectorAll('[data-tab]')];
let client=null,resetFlow=false;

let isActive=false;
let signedIn=false;
let examLoadSequence=0;
function pendingClear(){try{sessionStorage.removeItem("exam-student-pending-code-v276");}catch{}}
function updateLinkedUI(active){isActive=active;const claimTab=document.querySelector('[data-tab="claim"]');claimTab.classList.toggle("hidden",active || !signedIn);$("claim").classList.toggle("hidden",active);if(active&&$("claim").classList.contains("active"))selectTab("login");}
function reasonMessage(reason){switch(reason){case "already_linked":return "Tài khoản này đã liên kết với hồ sơ khác. Vui lòng liên hệ quản trị viên.";case "unverified":return "Email chưa được xác minh. Hãy kiểm tra thư xác minh.";case "invalid":return "Mã định danh không hợp lệ.";case "unavailable":return "Không thể liên kết hồ sơ. Hãy kiểm tra mã định danh hoặc liên hệ quản trị viên nếu hồ sơ đã được đăng ký.";case "unauthorized":return "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.";default:return "Không thể liên kết hồ sơ. Vui lòng thử lại hoặc liên hệ quản trị viên.";}}
function msg(s,kind='info'){const el=$('message');el.textContent=s;el.className='message'+(kind==='error'?' error':kind==='success'?' success':'');el.classList.toggle('hidden',!s);}

async function loadStudentExams(active){
 const sequence=++examLoadSequence;
 const section=$('student-exams');
 if(!section)return;
 section.classList.toggle('hidden',!active);
 if(!active)return;
 const info=$('student-exams-status');
 const list=$('student-exams-list');
 list.replaceChildren();
 info.textContent='Đang tải danh sách kỳ thi...';
 const {data,error}=await client.rpc('exam_student_my_exam_list');
 if(sequence!==examLoadSequence)return;
 if(error){info.textContent='Chưa tải được danh sách kỳ thi.';return;}
 const rawItems=Array.isArray(data)?data:[];
 const seen=new Set();
 const items=rawItems.filter(item=>{
  const key=String(item.exam_id||'').trim();
  if(!key)return true;
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
 if(!items.length){info.textContent='Chưa tìm thấy kỳ thi liên kết với hồ sơ này.';return;}
 info.textContent='';
 for(const item of items){
  const card=document.createElement('div');
  card.className='note exam-card';
  card.style.marginTop='10px';
  const title=document.createElement('strong');
  title.className='exam-title';title.textContent=item.exam_name||'Kỳ thi';
  const detail=document.createElement('p');
  detail.className='exam-meta';detail.append(document.createTextNode('Khối '+(item.grade_code||'—')+' · '));const statusBadge=document.createElement('span');statusBadge.className='exam-status'+(item.is_published?' published':'');statusBadge.textContent=item.is_published?'Đã công bố':'Chưa công bố';detail.append(statusBadge);
  card.append(title,detail);
  if(item.is_published && item.exam_id){
   const btn=document.createElement('button');btn.type='button';btn.className='secondary view-scores';btn.textContent='Xem điểm đã công bố';
   const result=document.createElement('div');result.className='exam-results';result.setAttribute('aria-live','polite');
   btn.addEventListener('click',async()=>{
    btn.disabled=true;result.textContent='Đang tải kết quả...';
    try{
     const {data:scores,error:e}=await client.rpc('exam_student_my_published_scores',{p_exam_id:item.exam_id});
     if(e){result.textContent=e.code==='42501'?'Tài khoản chưa đủ điều kiện xem điểm. Hãy xác nhận email và liên kết hồ sơ học sinh.':'Không thể tải điểm: '+e.message;return;}
     result.replaceChildren();
     if(!Array.isArray(scores)||!scores.length){result.textContent='Chưa có kết quả được phép hiển thị.';return;}
     const wrapper=document.createElement('div');wrapper.className='student-score-scroll';const table=document.createElement('table');table.className='student-score-table';
     const header=document.createElement('tr');
     for(const text of ['Môn','Trắc nghiệm','Tự luận','Tổng','Ghi chú']){const th=document.createElement('th');th.textContent=text;header.appendChild(th);}table.appendChild(header);
     const fmt=v=>v===null||v===undefined?'—':String(v);
     for(const score of scores){
      const tr=document.createElement('tr');
      const note=score.is_absent?'Vắng thi':score.no_paper?'Không có bài':score.essay_missing||score.mcq_missing?'Thiếu điểm':'';
      for(const value of [subjectName(score.subject_code),fmt(score.mcq_score),fmt(score.essay_score),fmt(score.total_score),note]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}table.appendChild(tr);
     }
     wrapper.appendChild(table);result.appendChild(wrapper);await renderAppeals(item.exam_id,scores,result);
    }catch(ex){result.textContent='Không tải được điểm: '+(ex?.message||'Lỗi không xác định');}
    finally{btn.disabled=false;}
   });
   card.append(btn,result);
  }
  list.append(card);
 }
}

async function renderAppeals(examId,scores,container){
 const box=document.createElement('div');box.className='appeal-box';
 const heading=document.createElement('strong');heading.textContent='Đề nghị phúc khảo';box.append(heading);
 const state=document.createElement('div');state.className='appeal-status';box.append(state);
 const {data:settings,error:se}=await client.rpc('exam_student_appeal_settings',{p_exam_id:examId});
 if(se){state.textContent='Chức năng phúc khảo chưa được thiết lập.';container.append(box);return;}
 const {data:requests,error:re}=await client.rpc('exam_student_my_appeals',{p_exam_id:examId});
 if(re){state.textContent='Chưa tải được thông tin phúc khảo.';container.append(box);return;}
 const current=Array.isArray(requests)?requests:[];
 const statusLabel={submitted:'Đã gửi',withdrawn:'Đã rút',reviewing:'Đang xử lý',resolved:'Đã xử lý',rejected:'Không tiếp nhận'};
 const showList=()=>{
  [...box.querySelectorAll('.appeal-entry')].forEach(el=>el.remove());
  for(const r of current){const line=document.createElement('div');line.className='appeal-entry appeal-status';
   line.textContent=subjectName(r.subject_code)+' · '+(r.component_type==='essay'?'Tự luận':'Trắc nghiệm')+' · '+(statusLabel[r.status]||r.status);
   if(r.status==='submitted' && settings?.is_open){const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='Rút đề nghị';cancel.onclick=async()=>{if(!confirm('Rút đề nghị phúc khảo này?'))return;cancel.disabled=true;const {error}=await client.rpc('exam_student_appeal_withdraw',{p_appeal_id:r.id});if(error){state.textContent='Không rút được đề nghị.';cancel.disabled=false;return;}r.status='withdrawn';state.textContent='Đã rút đề nghị.';showList();};line.append(cancel);}box.append(line);
  }
 };
 state.textContent=settings?.is_open?'Đang nhận đăng ký phúc khảo đến '+new Date(settings.deadline_at).toLocaleString('vi-VN')+'.':settings?.status==='expired'?'Đã hết thời gian đăng ký phúc khảo.':settings?.status==='upcoming'?'Chưa đến thời gian đăng ký phúc khảo.': 'Hiện chưa mở đăng ký phúc khảo.';
 if(settings?.is_open){
  const form=document.createElement('form');
  const hint=document.createElement('p');hint.className='appeal-status';hint.textContent='Chọn các môn và phần điểm cần phúc khảo. Có thể chọn nhiều môn và gửi trong một lần.';
  const grid=document.createElement('div');grid.className='appeal-choices';
  const active=new Set(current.filter(r=>r.status!=='withdrawn'&&r.status!=='rejected').map(r=>String(r.subject_code).toUpperCase()+':'+r.component_type));
  const choices=[];
  for(const sc of scores){
   if(sc.is_absent||sc.no_paper)continue;
   const kinds=[['mcq','Trắc nghiệm'],['essay','Tự luận']].filter(([kind])=>sc.score_mode===kind||sc.score_mode==='combined');
   if(!kinds.length)continue;
   const row=document.createElement('div');row.className='appeal-choice-row';
   const name=document.createElement('strong');name.textContent=subjectName(sc.subject_code);row.append(name);
   const controls=document.createElement('div');controls.className='appeal-choice-controls';
   for(const [kind,label] of kinds){
    const wrap=document.createElement('label');wrap.className='appeal-check';
    const check=document.createElement('input');check.type='checkbox';check.value=kind;
    check.disabled=active.has(String(sc.subject_code).toUpperCase()+':'+kind);
    wrap.append(check,document.createTextNode(label+(check.disabled?' (đã đăng ký)':'')));
    controls.append(wrap);choices.push({check,subject_code:sc.subject_code,component_type:kind});
   }
   row.append(controls);grid.append(row);
  }
  const reason=document.createElement('textarea');reason.maxLength=500;reason.placeholder='Lý do chung (không bắt buộc, tối đa 500 ký tự)';
  const reasonLabel=document.createElement('label');reasonLabel.textContent='Lý do đề nghị';reasonLabel.append(reason);
  const submit=document.createElement('button');submit.type='submit';submit.className='secondary';submit.textContent='Gửi các đề nghị đã chọn';
  const count=document.createElement('div');count.className='appeal-status';
  const update=()=>{const n=choices.filter(c=>c.check.checked).length;count.textContent='Đã chọn '+n+' phần điểm';submit.disabled=n===0;};
  choices.forEach(c=>c.check.addEventListener('change',update));update();
  form.append(hint,grid,reasonLabel,count,submit);
  form.onsubmit=async ev=>{
   ev.preventDefault();const selected=choices.filter(c=>c.check.checked);
   if(!selected.length)return;
   submit.disabled=true;
   const items=selected.map(c=>({subject_code:c.subject_code,component_type:c.component_type,note:reason.value}));
   const {data,error}=await client.rpc('exam_student_appeal_submit_batch',{p_exam_id:examId,p_items:items});
   if(error){state.textContent='Không gửi được đề nghị: '+error.message;update();return;}
   const ids=Array.isArray(data?.ids)?data.ids:[];
   selected.forEach((c,i)=>{c.check.checked=false;c.check.disabled=true;c.check.parentElement.lastChild.textContent=c.component_type==='essay'?'Tự luận (đã đăng ký)':'Trắc nghiệm (đã đăng ký)';current.unshift({id:ids[i],subject_code:c.subject_code,component_type:c.component_type,status:'submitted'});});
   reason.value='';state.textContent='Đã gửi thành công '+selected.length+' đề nghị phúc khảo.';update();showList();
  };
  if(choices.length)box.append(form);
 }
 showList();container.append(box);
}

const SUBJECT_NAMES={TOAN:'Toán',VAN:'Ngữ văn',N1:'Tiếng Anh',ANH:'Tiếng Anh',LY:'Vật lý',HOA:'Hóa học',SINH:'Sinh học',TIN:'Tin học',SU:'Lịch sử',DIA:'Địa lý',KTPL:'Giáo dục kinh tế và pháp luật',GDKTPL:'Giáo dục kinh tế và pháp luật'};
function subjectName(code){const key=String(code??'').trim().toUpperCase();return SUBJECT_NAMES[key]||String(code??'');}
function clearPasswords(){for(const id of ['login-password','reg-password','reg-confirm','reset-password','reset-confirm'])$(id).value='';}
let signedIn=false;
function showSession(user,active){
 signedIn=!!user;
 const tabsBox=document.querySelector('.tabs');
 const panel=$('account-panel');
 const detail=$('account-detail');
 panel.classList.toggle('hidden',!user);
 if(user){detail.textContent='Email: '+(user.email||'');} else {$('student-summary').classList.add('hidden');$('student-summary').textContent='';}
 tabsBox.classList.toggle('hidden',!!user && (active || !resetFlow));
 if(user && active && !resetFlow){
   for(const form of document.querySelectorAll('form.tab'))form.classList.remove('active');
   clearPasswords();
 } else if(user && !active && !resetFlow){
   selectTab('claim');
 }
 if(!user && !resetFlow && !document.querySelector('form.tab.active'))selectTab('login');
 $('check').classList.add('hidden');$('change-password').classList.toggle('hidden',!user);
}
function selectTab(name){for(const tab of tabs)tab.setAttribute('aria-selected',String(tab.dataset.tab===name));for(const form of document.querySelectorAll('form.tab'))form.classList.toggle('active',form.id===name);if(name==='new-password')$('new-password').classList.add('active');}
function err(e){msg(e?.message||'Có lỗi xảy ra. Vui lòng thử lại.','error');}
async function current(){const {data,error}=await client.auth.getUser();if(error)return null;return data.user;}
async function status(){
 const user=await current();signedIn=!!user;$('logout').classList.toggle('hidden',!user);$('identity').classList.toggle('hidden',!user);
 if(!user){updateLinkedUI(false);showSession(null,false);return null;}
 const {data,error}=await client.rpc('exam_student_my_activation_status');
 if(error){updateLinkedUI(false);$('identity').textContent='Email: '+(user.email||'')+' · Không đọc được trạng thái hồ sơ.';showSession(user,false);return user;}
 const active=data?.status==='active';updateLinkedUI(active);showSession(user,active);
 await loadStudentExams(active);
 const summary=$('student-summary');summary.textContent='';summary.classList.add('hidden');
 if(active){
  const result=await client.rpc('exam_student_my_profile');
  if(!result.error && result.data?.student_code){
    const d=result.data;
    const lines=[
      ['Mã định danh Bộ GDĐT',d.student_code],
      ['Họ và tên',d.full_name],
      ['Lớp',d.class_code],
      ['Khối',d.grade],
    ].filter(([,value])=>value!==null&&value!==undefined&&String(value).trim()!=='');
    summary.replaceChildren();
    for(const [label,value] of lines){
      const p=document.createElement('p');
      const strong=document.createElement('strong');
      strong.textContent=label+': ';
      p.append(strong,document.createTextNode(String(value)));
      summary.appendChild(p);
    }
    summary.classList.remove('hidden');
  }else{
    const old=await client.rpc('exam_student_my_account_summary');
    if(!old.error&&old.data?.student_code){
      summary.textContent='Mã định danh Bộ GDĐT: '+old.data.student_code+' · Thông tin hồ sơ bổ sung chưa sẵn sàng.';
      summary.classList.remove('hidden');
    }
  }
}
 $('identity').classList.add('hidden');return user;
}
async function busy(form,fn){const btn=form.querySelector('button[type="submit"]');btn.disabled=true;try{await fn()}catch(e){err(e)}finally{btn.disabled=false;}}
function redirect(){return new URL('./student-portal.html',location.href).href;}
async function init(){if(!window.supabase?.createClient)throw new Error('Không tải được thư viện Supabase.');
 const {url,key}=validatePublicConfig(publicConfig);
 client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'exam-student-auth-v1'}});
 client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){resetFlow=true;selectTab('new-password');msg('Vui lòng đặt mật khẩu mới.');}setTimeout(()=>{status().catch(()=>{})},0)});
 const {data,error}=await client.auth.getSession();if(error)throw error;
 if(location.hash.includes('type=recovery')||new URLSearchParams(location.search).get('type')==='recovery'){resetFlow=true;selectTab('new-password');}
 await status();
}
tabs.forEach(t=>t.addEventListener('click',()=>{if(t.dataset.tab==='claim'&&isActive)return;selectTab(t.dataset.tab);}));
$('register').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const email=$('reg-email').value.trim(),password=$('reg-password').value;
 if(password!==$('reg-confirm').value)throw new Error('Hai mật khẩu không khớp.');
 const {error}=await client.auth.signUp({email,password,options:{emailRedirectTo:redirect()}});if(error)throw error;
 msg('Đã gửi yêu cầu đăng ký. Hãy kiểm tra email để xác minh, sau đó đăng nhập và nhập mã định danh Bộ GDĐT để liên kết hồ sơ.','success');selectTab('login');
});});
$('login').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const {error}=await client.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});if(error)throw error;
 await status();clearPasswords();if(isActive){pendingClear();msg('','success');return;}selectTab('claim');msg('Đăng nhập thành công. Hãy nhập mã định danh Bộ GDĐT để liên kết hồ sơ.','success');
});});
async function claimStudent(code){
 const user=await current();if(!user)throw new Error('Bạn cần đăng nhập trước khi liên kết hồ sơ.');
 if(!user.email_confirmed_at)throw new Error('Bạn phải xác minh email trước khi liên kết hồ sơ.');
 if(isActive){pendingClear();msg('Tài khoản đã kích hoạt. Không cần liên kết lại.','success');return;}
 if(!code||code.length>64)throw new Error('Mã định danh không hợp lệ.');
 const {data,error}=await client.functions.invoke('student-claim',{body:{student_code:code}});
 if(error){let detail=data;try{if(!detail&&error.context?.json)detail=await error.context.json();}catch{}throw new Error(reasonMessage(detail?.reason));}
 if(!data?.ok)throw new Error(reasonMessage(data?.reason));
 pendingClear();await status();clearPasswords();msg('','success');
}
$('claim').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,()=>claimStudent($('student-code').value.trim()));});
$('recover').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const {error}=await client.auth.resetPasswordForEmail($('recover-email').value.trim(),{redirectTo:redirect()});if(error)throw error;
 msg('Nếu email đã đăng ký, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu.','success');
});});
$('new-password').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const password=$('reset-password').value;if(password!==$('reset-confirm').value)throw new Error('Hai mật khẩu không khớp.');
 const {error}=await client.auth.updateUser({password});if(error)throw error;resetFlow=false;clearPasswords();await status();if(!signedIn)selectTab('login');msg('Đổi mật khẩu thành công.','success');
});});
$('logout').addEventListener('click',async()=>{try{await client.auth.signOut();pendingClear();await status();clearPasswords();selectTab('login');msg('Đã đăng xuất.','success')}catch(e){err(e)}});
$('change-password').addEventListener('click',async()=>{try{const user=await current();if(!user?.email)throw new Error('Vui lòng đăng nhập.');const {error}=await client.auth.resetPasswordForEmail(user.email,{redirectTo:redirect()});if(error)throw error;msg('Nếu tài khoản hợp lệ, hệ thống sẽ gửi email đổi mật khẩu.','success');}catch(e){err(e)}});
$('check').addEventListener('click',async()=>{try{const user=await status();msg(user?'':'Chưa có phiên đăng nhập học sinh.')}catch(e){err(e)}});
init().catch(err);
