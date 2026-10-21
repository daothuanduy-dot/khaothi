import {SUBJECTS} from './rooming.js?v=0.1.119';

export function wireAccounts({state,$,esc,message}){
  let users=[],generation=0,windowRequest=0;
  const subjects=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];
  $('accounts-subject').innerHTML='<option value="">Chọn môn</option>'+subjects.map(s=>`<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('');
  const notify=(text,type='info')=>message($('accounts-message'),text,type);
  async function rpc(name,args){
    if(state.role!=='admin'||!state.client)throw new Error('Chỉ Admin được quản lý tài khoản.');
    const {data,error}=await state.client.rpc(name,args);
    if(error){
      if(error.code==='PGRST202'||/schema cache|Could not find the function/i.test(error.message||''))throw new Error('Cơ sở dữ liệu chưa có chức năng tài khoản/nhập điểm. Quản trị cần chạy sql/v0.1.119_accounts_grading_security.sql trong Supabase SQL Editor, sau đó tải lại trang. Tải tệp SQL lên GitHub không tự cập nhật CSDL.');
      throw error;
    }
    return data;
  }
  function selectedUser(){return users.find(u=>u.user_id===$('accounts-user').value)}
  function showUser(){
    const user=selectedUser();
    $('accounts-email').value=user?.email||'';
    $('accounts-full-name').value=user?.full_name||'';
    $('accounts-password').value='';
    $('accounts-role').value=user?.role==='admin'?'admin':'grader';
    $('accounts-subject').value=user?.subject_code||'';
    $('accounts-subject').disabled=$('accounts-role').value==='admin';
  }
  function examId(){
    const id=$('accounts-exam').value;
    if(!id)throw new Error('Hãy chọn kỳ thi.');
    return id;
  }
  function localDate(value){
    if(!value)return '';
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return '';
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  async function loadWindow(){
    const request=++windowRequest;
    $('accounts-start').value='';$('accounts-end').value='';$('accounts-audit').innerHTML='';
    if(!$('accounts-exam').value)return;
    const data=await rpc('exam_get_grading_window',{p_exam_id:examId()});
    if(request!==windowRequest)return;
    $('accounts-start').value=localDate(data?.starts_at);
    $('accounts-end').value=localDate(data?.ends_at);
  }
  async function refresh(){
    const token=++generation;
    const previous=$('accounts-user').value,previousExam=$('accounts-exam').value;
    const rows=await rpc('exam_manage_accounts');
    if(token!==generation)return;
    users=rows||[];
    $('accounts-user').innerHTML='<option value="">Chọn tài khoản</option>'+users.map(u=>`<option value="${esc(u.user_id)}">${esc(u.full_name||u.email||u.user_id)} — ${esc(u.email||'')} (${esc(u.role==='admin'?'Admin':u.subject_code||'Chưa phân môn')})</option>`).join('');
    $('accounts-user').value=users.some(u=>u.user_id===previous)?previous:'';
    $('accounts-exam').innerHTML='<option value="">Chọn kỳ thi</option>'+state.exams.map(e=>`<option value="${esc(e.id)}">${esc(e.form_exam_title||e.name||e.id)}</option>`).join('');
    $('accounts-exam').value=state.exams.some(e=>e.id===previousExam)?previousExam:'';
    showUser();await loadWindow();
  }
  function action(id,fn){
    $(id).onclick=async()=>{
      $(id).disabled=true;
      try{await fn()}catch(error){notify(error.message||String(error),'error')}
      finally{$(id).disabled=false}
    };
  }
  $('accounts-user').onchange=showUser;
  $('accounts-role').onchange=()=>{$('accounts-subject').disabled=$('accounts-role').value==='admin'};
  $('accounts-exam').onchange=()=>loadWindow().catch(e=>notify(e.message,'error'));
  action('accounts-refresh',refresh);
  async function manage(action){
    if(state.role!=='admin'||!state.client)throw new Error('Chỉ Admin được quản lý tài khoản.');
    const user=selectedUser();
    if(action!=='create'&&!user)throw new Error('Hãy chọn tài khoản cần sửa hoặc xóa.');
    if(action==='delete'&&user.user_id===state.session?.user?.id)throw new Error('Không được xóa tài khoản đang đăng nhập.');
    const email=$('accounts-email').value.trim(),full_name=$('accounts-full-name').value.trim(),password=$('accounts-password').value;
    if(action!=='delete'&&(!email||!full_name))throw new Error('Nhập họ tên và email.');
    if(action==='create'&&password.length<8)throw new Error('Mật khẩu tài khoản mới cần ít nhất 8 ký tự.');
    if(action==='update'&&password&&password.length<8)throw new Error('Mật khẩu mới cần ít nhất 8 ký tự.');
    if(action==='delete'&&!confirm(`Xóa tài khoản ${user.email}? Thao tác không thể hoàn tác. Tài khoản có dữ liệu liên quan có thể bị từ chối xóa.`))return;
    const body=action==='delete'?{action,user_id:user.user_id}:{action,email,full_name,...(password?{password}:{}),...(user&&action==='update'?{user_id:user.user_id}:{})};
    const {data,error}=await state.client.functions.invoke('manage-exam-accounts',{body});
    if(error){
      let detail='';try{detail=(await error.context?.json())?.error||''}catch{}
      throw new Error(detail||'Không gọi được chức năng quản lý tài khoản. Kiểm tra triển khai Edge Function manage-exam-accounts và phiên đăng nhập.');
    }
    if(data?.error)throw new Error(data.error);
    $('accounts-password').value='';
    await refresh();
    if(data?.user_id&&action!=='delete'){$('accounts-user').value=data.user_id;showUser()}
    notify(action==='create'?'Đã tạo tài khoản. Tiếp theo lưu vai trò/môn, cấp quyền kỳ thi và đặt thời hạn.':action==='delete'?'Đã xóa tài khoản.':'Đã cập nhật tài khoản.','success');
  }
  action('accounts-new',async()=>{$('accounts-user').value='';showUser();notify('Nhập họ tên, email và mật khẩu, sau đó chọn Tạo tài khoản.');});
  action('accounts-create',()=>manage('create'));
  action('accounts-update',()=>manage('update'));
  action('accounts-delete',()=>manage('delete'));
  action('accounts-save-role',async()=>{
    const user=selectedUser(),role=$('accounts-role').value,subject=$('accounts-subject').value;
    if(!user)throw new Error('Hãy chọn tài khoản.');
    if(role==='grader'&&!subject)throw new Error('Hãy chọn môn cho giáo viên.');
    if(!confirm('Lưu phân quyền? Khi đổi môn, quyền nhập các môn cũ sẽ bị thu hồi.'))return;
    await rpc('exam_set_account_role',{p_user_id:user.user_id,p_role:role,p_subject_code:role==='grader'?subject:null});
    await refresh();notify('Đã lưu phân quyền. Người dùng cần tải lại trang.','success');
  });
  for(const [id,active] of [['accounts-assign',true],['accounts-unassign',false]]){
    action(id,async()=>{
      const user=selectedUser();
      if(!user||user.role!=='grader'||!user.subject_code)throw new Error('Hãy lưu vai trò Giáo viên và môn trước.');
      await rpc('exam_assign_grader',{p_exam_id:examId(),p_subject_code:user.subject_code,p_user_id:user.user_id,p_active:active});
      notify(active?'Đã cấp quyền nhập điểm kỳ thi.':'Đã thu hồi quyền nhập điểm kỳ thi.','success');
    });
  }
  action('accounts-save-window',async()=>{
    const start=new Date($('accounts-start').value),end=new Date($('accounts-end').value);
    if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw new Error('Nhập đủ thời hạn; kết thúc phải sau bắt đầu.');
    await rpc('exam_set_grading_window',{p_exam_id:examId(),p_starts_at:start.toISOString(),p_ends_at:end.toISOString()});
    notify('Đã lưu thời hạn nhập điểm.','success');
  });
  action('accounts-load-audit',async()=>{
    const exam=examId(),token=generation,rows=[];
    for(let offset=0;;offset+=500){
      if(state.role!=='admin')throw new Error('Chỉ Admin được xem nhật ký.');
      const {data,error}=await state.client.rpc('exam_get_score_audit',{p_exam_id:exam}).range(offset,offset+499);
      if(error)throw error;
      rows.push(...(data||[]));
      if((data||[]).length<500)break;
    }
    if(token!==generation||exam!==$('accounts-exam').value)return;
    $('accounts-audit').innerHTML=rows.map(r=>`<tr>${[r.subject_code,r.phach_code,r.previous_score??'—',r.new_score,r.changed_by_email||r.changed_by,new Date(r.changed_at).toLocaleString('vi-VN')].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="6">Chưa có nhật ký.</td></tr>';
  });
  return {refresh:()=>refresh().catch(e=>notify(e.message,'error'))};
}
