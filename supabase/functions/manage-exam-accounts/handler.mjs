// Auth Admin APIs are called only here, never with a service key in the browser.
export function accountHandler({createClient,url,anonKey,serviceKey}){
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'Chỉ hỗ trợ POST.'});
  const authorization=req.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer '))return reply(401,{error:'Hãy đăng nhập lại.'});
  try{
   const options={auth:{persistSession:false,autoRefreshToken:false}};
   const caller=createClient(url,anonKey,{...options,global:{headers:{Authorization:authorization}}});
   const {data:identity,error:identityError}=await caller.auth.getUser(authorization.slice(7));
   if(identityError||!identity?.user)return reply(401,{error:'Phiên đăng nhập không hợp lệ.'});
   const {data:allowed,error:roleError}=await caller.rpc('exam_is_admin');
   if(roleError||allowed!==true)return reply(403,{error:'Chỉ Admin được quản lý tài khoản.'});
   const {error:missing}=await caller.rpc('exam_manage_accounts');
   if(missing)return reply(503,{error:'Cần chạy migration v0.1.119_accounts_grading_security.sql trước khi quản lý tài khoản.'});
   let body;try{body=await req.json()}catch{return reply(400,{error:'Dữ liệu không hợp lệ.'})}
   const {action,user_id}=body||{};
   if(!['create','update','delete'].includes(action))return reply(400,{error:'Thao tác không hợp lệ.'});
   if(action!=='create'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id||''))return reply(400,{error:'Mã tài khoản không hợp lệ.'});
   if(action==='delete'&&user_id===identity.user.id)return reply(400,{error:'Không được xóa tài khoản đang đăng nhập.'});
   const email=typeof body.email==='string'?body.email.trim():'',name=typeof body.full_name==='string'?body.full_name.trim():'';
   const password=typeof body.password==='string'?body.password:'';
   if(action!=='delete'){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>160)return reply(400,{error:'Họ tên hoặc email không hợp lệ.'});
    if((action==='create'||password)&&(password.length<8||password.length>128))return reply(400,{error:'Mật khẩu phải có từ 8 đến 128 ký tự.'});
   }
   const admin=createClient(url,serviceKey,options).auth.admin;
   if(action==='delete'){
    // Existing RESTRICT foreign keys preserve score/audit ownership. Never cascade them here.
    const {error}=await admin.deleteUser(user_id);
    if(error)return reply(409,{error:'Không xóa được tài khoản. Tài khoản có thể đang gắn với phân công, điểm hoặc nhật ký; hãy thu hồi quyền nhập điểm để giữ lịch sử.'});
    return reply(200,{user_id});
   }
   const attributes={email,user_metadata:{full_name:name},...(password?{password}:{})};
   // Provisioning and permission assignment are separate: a new user has no grading role.
   const {data,error}=action==='create'?await admin.createUser({...attributes,email_confirm:true}):await admin.updateUserById(user_id,attributes);
   if(error)return reply(400,{error:'Không lưu được tài khoản. Kiểm tra email trùng, định dạng email và chính sách mật khẩu.'});
   return reply(200,{user_id:data.user.id});
  }catch{
   return reply(500,{error:'Không xử lý được yêu cầu. Kiểm tra cấu hình Edge Function.'});
  }
 };
}
