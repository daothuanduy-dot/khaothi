import {publicConfig,validatePublicConfig} from './public-config.js?v=0.1.148';
const $=id=>document.getElementById(id);
const tabs=[...document.querySelectorAll('[data-tab]')];
let client=null,resetFlow=false;
const pendingKey="exam-student-pending-code-v276";
let isActive=false;
function pendingGet(email){try{const p=JSON.parse(sessionStorage.getItem(pendingKey)||"null");return p?.email?.toLowerCase()===email?.toLowerCase()?p.code:null;}catch{return null;}}
function pendingSave(email,code){sessionStorage.setItem(pendingKey,JSON.stringify({email,code}));}
function pendingClear(){sessionStorage.removeItem(pendingKey);}
function updateLinkedUI(active){isActive=active;const claimTab=document.querySelector('[data-tab="claim"]');claimTab.classList.toggle("hidden",active);$("claim").classList.toggle("hidden",active);$("active-account").classList.toggle("hidden",!active);if(active&&$("claim").classList.contains("active"))selectTab("login");}
function reasonMessage(reason){switch(reason){case "already_linked":return "Tài khoản này đã liên kết với hồ sơ khác. Vui lòng liên hệ quản trị viên.";case "unverified":return "Email chưa được xác minh. Hãy kiểm tra thư xác minh.";case "invalid":return "Mã định danh không hợp lệ.";case "unavailable":return "Không thể liên kết hồ sơ. Hãy kiểm tra mã định danh hoặc liên hệ quản trị viên nếu hồ sơ đã được đăng ký.";case "unauthorized":return "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.";default:return "Không thể liên kết hồ sơ. Vui lòng thử lại hoặc liên hệ quản trị viên.";}}
function msg(s,kind='info'){const el=$('message');el.textContent=s;el.className='message'+(kind==='error'?' error':kind==='success'?' success':'');el.classList.toggle('hidden',!s);}
function clearPasswords(){for(const id of ['login-password','reg-password','reg-confirm','reset-password','reset-confirm'])$(id).value='';}
let signedIn=false;
function showSession(user,active){
 signedIn=!!user;
 const tabsBox=document.querySelector('.tabs');
 const panel=$('account-panel');
 const detail=$('account-detail');
 panel.classList.toggle('hidden',!user);
 if(user){detail.textContent='Email: '+(user.email||'')+' · Xác minh: '+(user.email_confirmed_at?'Đã xác minh':'Chưa xác minh')+' · Hồ sơ: '+(active?'Đã kích hoạt':'Chưa liên kết');} else {$('student-summary').classList.add('hidden');$('student-summary').textContent='';}
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
 const user=await current();$('logout').classList.toggle('hidden',!user);$('identity').classList.toggle('hidden',!user);
 if(!user){updateLinkedUI(false);showSession(null,false);return null;}
 const {data,error}=await client.rpc('exam_student_my_activation_status');
 if(error){updateLinkedUI(false);$('identity').textContent='Email: '+(user.email||'')+' · Không đọc được trạng thái hồ sơ.';showSession(user,false);return user;}
 const active=data?.status==='active';updateLinkedUI(active);showSession(user,active);
 const summary=$('student-summary');summary.textContent='';summary.classList.add('hidden');
 if(active){const result=await client.rpc('exam_student_my_account_summary');if(!result.error&&result.data?.student_code){summary.textContent='Mã định danh Bộ GDĐT: '+result.data.student_code;summary.classList.remove('hidden');}}
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
 await status();if(data.session?.user&&!resetFlow){const pending=pendingGet(data.session.user.email);if(pending&&!isActive){$('student-code').value=pending;if(data.session.user.email_confirmed_at){try{await claimStudent(pending);}catch(e){err(e);}}}}
}
tabs.forEach(t=>t.addEventListener('click',()=>{if(t.dataset.tab==='claim'&&isActive)return;selectTab(t.dataset.tab);}));
$('register').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const email=$('reg-email').value.trim(),password=$('reg-password').value;
 if(password!==$('reg-confirm').value)throw new Error('Hai mật khẩu không khớp.');
 const code=$('reg-student-code').value.trim();if(!code||code.length>64)throw new Error('Mã định danh không hợp lệ.');
 const {error}=await client.auth.signUp({email,password,options:{emailRedirectTo:redirect()}});if(error)throw error;pendingSave(email,code);$('student-code').value=code;
 msg('Nếu đăng ký hợp lệ, Supabase sẽ gửi email xác minh. Hãy mở liên kết trong email. Sau khi xác minh, hệ thống sẽ thử liên kết hồ sơ; nếu cần, hãy đăng nhập và chọn Liên kết hồ sơ.','success');
});});
$('login').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const {error}=await client.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});if(error)throw error;
 await status();clearPasswords();if(isActive){pendingClear();msg('','success');return;}selectTab('claim');const pending=pendingGet($('login-email').value.trim());if(pending){$('student-code').value=pending;await claimStudent(pending);}else msg('Đăng nhập thành công. Nếu chưa liên kết hồ sơ, hãy nhập mã định danh.','success');
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
