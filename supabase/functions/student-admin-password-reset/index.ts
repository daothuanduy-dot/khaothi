import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(code:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status:code,headers});
const url=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const securePassword=()=>{
 const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
 const bytes=new Uint32Array(24);crypto.getRandomValues(bytes);
 return [...bytes].map(n=>chars[n%chars.length]).join('');
};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
 try{
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return reply(401,{error:'Phiên đăng nhập không hợp lệ.'});
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user)return reply(401,{error:'Phiên đăng nhập không hợp lệ.'});
  const body=await req.json();
  if(body.action==='reset'){
   const {data:profile,error:pe}=await admin.from('exam_profiles').select('is_admin').eq('user_id',user.id).maybeSingle();
   if(pe||!profile?.is_admin)return reply(403,{error:'Chỉ quản trị viên được cấp lại mật khẩu.'});
   const reason=String(body.reason||'').trim();
   if(reason.length<10||reason.length>500)return reply(400,{error:'Lý do phải từ 10 đến 500 ký tự.'});
   const studentId=String(body.student_id||'');const authId=String(body.auth_user_id||'');
   const {data:link,error:le}=await admin.from('exam_student_auth_links').select('student_id,auth_user_id,account_status').eq('student_id',studentId).eq('auth_user_id',authId).maybeSingle();
   if(le||!link||!['active','provisioned'].includes(link.account_status))return reply(409,{error:'Tài khoản không đủ điều kiện cấp lại mật khẩu.'});
   if(link.account_status==='provisioned'){const {data:existing}=await admin.from('exam_student_admin_password_resets').select('id').eq('student_id',studentId).eq('auth_user_id',authId).eq('status','pending').limit(1).maybeSingle();if(!existing)return reply(409,{error:'Tài khoản đang chờ kích hoạt, không thể cấp lại mật khẩu.'});}
   const {data:target,error:te}=await admin.auth.admin.getUserById(authId);
   if(te||!target?.user?.email)return reply(409,{error:'Tài khoản không có email đăng nhập.'});
   // Deny data access before rotating the password; status provisioned is checked by score/appeal RPCs.
   const {error:lockError}=await admin.from('exam_student_auth_links').update({account_status:'provisioned',updated_at:new Date().toISOString()}).eq('student_id',studentId).eq('auth_user_id',authId).eq('account_status','active');
   if(lockError)return reply(500,{error:'Không thể khóa tạm tài khoản.'});
   const temporary=securePassword();
   const metadata={...(target.user.app_metadata||{}),exam_admin_reset_required:true};
   const {error:updateError}=await admin.auth.admin.updateUserById(authId,{password:temporary,app_metadata:metadata});
   if(updateError)return reply(500,{error:'Không thể cấp mật khẩu. Tài khoản đã tạm khóa; vui lòng liên hệ quản trị kỹ thuật.'});
   await admin.from('exam_student_admin_password_resets').update({status:'cancelled'}).eq('student_id',studentId).eq('auth_user_id',authId).eq('status','pending');
   const {error:logError}=await admin.from('exam_student_admin_password_resets').insert({student_id:studentId,auth_user_id:authId,requested_by:user.id,reason,status:'pending'});
   if(logError)return reply(500,{error:'Đã thay đổi mật khẩu nhưng ghi nhật ký thất bại. Không cấp mật khẩu cho học sinh; liên hệ quản trị kỹ thuật.'});
   return reply(200,{ok:true,temporary_password:temporary,email:target.user.email});
  }
  if(body.action==='complete'){
   const temporary=String(body.temporary_password||'');const next=String(body.new_password||'');
   if(temporary.length<12||next.length<12||next.length>128||temporary===next)return reply(400,{error:'Mật khẩu mới phải khác mật khẩu tạm thời và có ít nhất 12 ký tự.'});
   const {data:link}=await admin.from('exam_student_auth_links').select('student_id,account_status').eq('auth_user_id',user.id).maybeSingle();
   if(!link||link.account_status!=='provisioned')return reply(403,{error:'Không có yêu cầu cấp lại mật khẩu đang chờ.'});
   const {data:pending}=await admin.from('exam_student_admin_password_resets').select('id').eq('auth_user_id',user.id).eq('student_id',link.student_id).eq('status','pending').order('created_at',{ascending:false}).limit(1).maybeSingle();
   if(!pending)return reply(403,{error:'Không tìm thấy yêu cầu hợp lệ.'});
   const {data:target}=await admin.auth.admin.getUserById(user.id);
   if(!target?.user?.email||!target.user.app_metadata?.exam_admin_reset_required)return reply(403,{error:'Tài khoản không ở trạng thái yêu cầu đổi mật khẩu.'});
   const check=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:login,error:loginError}=await check.auth.signInWithPassword({email:target.user.email,password:temporary});
   if(loginError||login.user?.id!==user.id)return reply(403,{error:'Mật khẩu tạm thời không chính xác.'});
   const metadata={...target.user.app_metadata,exam_admin_reset_required:false};
   const {error:pwError}=await admin.auth.admin.updateUserById(user.id,{password:next,app_metadata:metadata});
   if(pwError)return reply(500,{error:'Không thể đổi mật khẩu.'});
   const {error:unlockError}=await admin.from('exam_student_auth_links').update({account_status:'active',updated_at:new Date().toISOString()}).eq('student_id',link.student_id).eq('auth_user_id',user.id).eq('account_status','provisioned');
   if(unlockError)return reply(500,{error:'Đã đổi mật khẩu nhưng chưa thể kích hoạt. Liên hệ quản trị viên.'});
   await admin.from('exam_student_admin_password_resets').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',pending.id);
   return reply(200,{ok:true});
  }
  return reply(400,{error:'Yêu cầu không hợp lệ.'});
 }catch(e){console.error('student-admin-password-reset',e);return reply(500,{error:'Không thể xử lý yêu cầu.'});}
});
