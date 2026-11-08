import {publicConfig,validatePublicConfig} from './public-config.js?v=0.1.148';
const $=id=>document.getElementById(id);
const tabs=[...document.querySelectorAll('[data-tab]')];
let client=null,resetFlow=false;
const pendingKey="exam-student-pending-code-v275";
function msg(s,kind='info'){const el=$('message');el.textContent=s;el.className='message'+(kind==='error'?' error':kind==='success'?' success':'');}
function selectTab(name){for(const tab of tabs)tab.setAttribute('aria-selected',String(tab.dataset.tab===name));for(const form of document.querySelectorAll('form.tab'))form.classList.toggle('active',form.id===name);if(name==='new-password')$('new-password').classList.add('active');}
function err(e){msg(e?.message||'Có lỗi xảy ra. Vui lòng thử lại.','error');}
async function current(){const {data,error}=await client.auth.getUser();if(error)return null;return data.user;}
async function status(){const user=await current();$('logout').classList.toggle('hidden',!user);$('identity').classList.toggle('hidden',!user);if(!user)return null;
 const {data,error}=await client.rpc('exam_student_my_activation_status');
 if(error){$('identity').textContent='Email đăng nhập: '+(user.email||'')+' · Không đọc được trạng thái kích hoạt. Kiểm tra SQL B3.';return user;}
 $('identity').textContent='Email: '+(user.email||'')+' · Xác minh: '+(user.email_confirmed_at?'Đã xác minh':'Chưa xác minh')+' · Hồ sơ: '+(data?.status==='active'?'Đã kích hoạt':'Chưa liên kết');return user;}
async function busy(form,fn){const btn=form.querySelector('button[type="submit"]');btn.disabled=true;try{await fn()}catch(e){err(e)}finally{btn.disabled=false;}}
function redirect(){return new URL('./student-portal.html',location.href).href;}
async function init(){if(!window.supabase?.createClient)throw new Error('Không tải được thư viện Supabase.');
 const {url,key}=validatePublicConfig(publicConfig);
 client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'exam-student-auth-v1'}});
 client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){resetFlow=true;selectTab('new-password');msg('Vui lòng đặt mật khẩu mới.');}setTimeout(()=>{status().catch(()=>{})},0)});
 const {data,error}=await client.auth.getSession();if(error)throw error;
 if(location.hash.includes('type=recovery')||new URLSearchParams(location.search).get('type')==='recovery'){resetFlow=true;selectTab('new-password');}
 await status();if(data.session?.user&&!resetFlow){selectTab('claim');const pending=sessionStorage.getItem(pendingKey);if(pending){$('student-code').value=pending;if(data.session.user.email_confirmed_at)await claimStudent(pending);}}
}
tabs.forEach(t=>t.addEventListener('click',()=>selectTab(t.dataset.tab)));
$('register').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const email=$('reg-email').value.trim(),password=$('reg-password').value;
 if(password!==$('reg-confirm').value)throw new Error('Hai mật khẩu không khớp.');
 const code=$('reg-student-code').value.trim();if(!code||code.length>64)throw new Error('Mã định danh không hợp lệ.');
 const {error}=await client.auth.signUp({email,password,options:{emailRedirectTo:redirect()}});if(error)throw error;sessionStorage.setItem(pendingKey,code);$('student-code').value=code;
 msg('Nếu đăng ký hợp lệ, Supabase sẽ gửi email xác minh. Hãy mở liên kết trong email. Sau khi xác minh, hệ thống sẽ thử liên kết hồ sơ; nếu cần, hãy đăng nhập và chọn Liên kết hồ sơ.','success');
});});
$('login').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const {error}=await client.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});if(error)throw error;
 await status();selectTab('claim');const pending=sessionStorage.getItem(pendingKey);if(pending){$('student-code').value=pending;await claimStudent(pending);}else msg('Đăng nhập thành công. Nếu chưa liên kết hồ sơ, hãy nhập mã định danh.','success');
});});
async function claimStudent(code){
 const user=await current();if(!user)throw new Error('Bạn cần đăng nhập trước khi liên kết hồ sơ.');
 if(!user.email_confirmed_at)throw new Error('Bạn phải xác minh email trước khi liên kết hồ sơ.');
 const {data,error}=await client.functions.invoke('student-claim',{body:{student_code:code}});
 if(error||!data?.ok)throw new Error(data?.error||'Không thể liên kết hồ sơ. Mã định danh có thể đã được đăng ký.');
 sessionStorage.removeItem(pendingKey);await status();msg('Liên kết hồ sơ thành công. Chức năng xem điểm chưa được mở.','success');
}
$('claim').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,()=>claimStudent($('student-code').value.trim()));});
$('recover').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const {error}=await client.auth.resetPasswordForEmail($('recover-email').value.trim(),{redirectTo:redirect()});if(error)throw error;
 msg('Nếu email đã đăng ký, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu.','success');
});});
$('new-password').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{
 const password=$('reset-password').value;if(password!==$('reset-confirm').value)throw new Error('Hai mật khẩu không khớp.');
 const {error}=await client.auth.updateUser({password});if(error)throw error;resetFlow=false;selectTab('login');msg('Đổi mật khẩu thành công.','success');
});});
$('logout').addEventListener('click',async()=>{try{await client.auth.signOut();await status();selectTab('login');msg('Đã đăng xuất.','success')}catch(e){err(e)}});
$('check').addEventListener('click',async()=>{try{const user=await status();msg(user?'Đã cập nhật trạng thái tài khoản.':'Chưa có phiên đăng nhập học sinh.')}catch(e){err(e)}});
init().catch(err);
