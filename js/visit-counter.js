// v0.1.311: shared visits, authenticated presence, admin-only online user names.
import {publicConfig,validatePublicConfig} from './public-config.js?v=0.1.148';
const root=document.getElementById('exam-visit-widget');
if(root && window.supabase?.createClient){
 const online=root.querySelector('[data-visit-online]');
 const total=root.querySelector('[data-visit-total]');
 const staffPanel=document.getElementById('exam-online-users');
 const staffList=document.getElementById('exam-online-users-list');
 const portal=document.body.dataset.visitPortal==='student'?'student':'staff';
 let client=null,first=true,busy=false;
 try{
  const {url,key}=validatePublicConfig(publicConfig);
  // Uses the same Supabase Auth storage key as the application. No service-role key.
  client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
 }catch{root.title='Chưa cấu hình kết nối thống kê';}
 const format=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('vi-VN'):'—';
 let visitorId;
 try{
  visitorId=sessionStorage.getItem('exam-visit-session-v310');
  if(!visitorId || !/^[0-9a-f-]{36}$/i.test(visitorId)){
   visitorId=crypto.randomUUID();sessionStorage.setItem('exam-visit-session-v310',visitorId);
  }
 }catch{visitorId=crypto.randomUUID();}
 const showNames=async()=>{
  if(!staffPanel||!staffList||!client)return;
  const {data,error}=await client.rpc('exam_visit_online_users');
  if(error){staffPanel.hidden=true;return;}
  staffList.replaceChildren();
  const users=Array.isArray(data?.users)?data.users:[];
  for(const item of users){
   const li=document.createElement('li');
   li.textContent=`${item.name || 'Tài khoản'} · ${item.portal==='student'?'Cổng học sinh':'Cổng quản trị/giáo viên'}`;
   staffList.appendChild(li);
  }
  if(!users.length){const li=document.createElement('li');li.textContent='Chưa có tài khoản đăng nhập đang hoạt động';staffList.appendChild(li);}
  staffPanel.hidden=false;
 };
 async function update(){
  if(!client||busy||document.visibilityState==='hidden')return;
  busy=true;
  try{
   const {data,error}=await client.rpc('exam_visit_ping',{
    p_session_id:visitorId,p_count_visit:first,p_portal:portal
   });
   if(error)throw error;
   first=false;
   online.textContent=format(data?.online);
   total.textContent=format(data?.total);
   root.title='Trực tuyến: số phiên hoạt động trong 2 phút; tổng lượt truy cập cộng dồn';
   if(staffPanel)await showNames();
  }catch{root.title='Chưa tải được thống kê. Kiểm tra SQL v0.1.310 và v0.1.311.';}
  finally{busy=false;}
 }
 update();setInterval(update,30000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')update();});
}
