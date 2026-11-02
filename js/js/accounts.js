import {SUBJECTS} from './rooming.js?v=0.1.119';

export function wireAccounts({state,$,esc,message}){
  let users=[],groups=[],generation=0,busy=false;
  const subjects=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];
  const options='<option value="">Chọn môn</option>'+subjects.map(s=>`<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('');
  $('accounts-subject').innerHTML=options;$('accounts-group-subject').innerHTML=options;
  const notify=(text,type='info')=>message($('accounts-dialog').open?$('accounts-form-message'):$('accounts-message'),text,type);
  function renderUsers(){
    const term=$('accounts-search').value.trim().toLocaleLowerCase('vi');
    const rows=users.filter(user=>[user.full_name,user.report_name,user.email].some(value=>String(value||'').toLocaleLowerCase('vi').includes(term)));
    $('accounts-count').textContent=`Hiển thị ${rows.length}/${users.length} tài khoản`;
    $('accounts-list').innerHTML=rows.map(user=>`<tr><td>${esc(user.full_name||'—')}</td><td>${esc(user.report_name||'—')}</td><td>${esc(user.email||'—')}</td><td>${esc(user.role==='admin'?'Admin':user.role==='grader'?'Giáo viên':'Chưa phân quyền')}</td><td>${esc(subjects.find(subject=>subject.code===user.subject_code)?.name||user.subject_code||'—')}</td><td><button type="button" class="btn btn-light" data-account-edit="${esc(user.user_id)}">Sửa</button></td></tr>`).join('')||`<tr><td colspan="6" class="empty">${users.length?'Không có tài khoản phù hợp.':'Chưa có tài khoản.'}</td></tr>`;
  }
  function closeEditor(){if(busy)return;$('accounts-password').value='';$('accounts-dialog').close();}
  function openEditor(id=''){
    if(busy)return;
    $('accounts-user').value=id;showUser();
    $('accounts-form-message').classList.add('hidden');
    if(!$('accounts-dialog').open)$('accounts-dialog').showModal();
    $('accounts-full-name').focus();
  }
  async function rpc(name,args){
    if(state.role!=='admin'||!state.client)throw new Error('Chỉ Admin được quản lý tài khoản.');
    const {data,error}=await state.client.rpc(name,args);
    if(error){
      if(error.code==='PGRST202'||/schema cache|Could not find the function/i.test(error.message||''))throw new Error('Cơ sở dữ liệu chưa có chức năng này. Quản trị cần chạy các migration SQL mới trong Supabase SQL Editor, sau đó tải lại trang.');
      throw error;
    }
    return data;
  }
  const selectedUser=()=>users.find(u=>u.user_id===$('accounts-user').value);
  const selectedGroup=()=>groups.find(group=>group.id===$('accounts-group-select').value);
  const selectedMemberIds=()=>[...document.querySelectorAll('[data-accounts-group-member]:checked')].map(box=>box.value);
  function showUser(){
    const user=selectedUser();
    $('accounts-email').value=user?.email||'';$('accounts-full-name').value=user?.full_name||'';$('accounts-password').value='';
    $('accounts-report-name').value=user?.report_name||'';
    $('accounts-role').value=user?.role==='admin'?'admin':'grader';$('accounts-subject').value=user?.subject_code||'';
    $('accounts-subject').disabled=$('accounts-role').value==='admin';
    $('accounts-create').hidden=!!user;$('accounts-update').hidden=!user;
    $('accounts-delete').hidden=!user||user.user_id===state.session?.user?.id;
    $('accounts-form-title').textContent=user?'Sửa tài khoản':'Thêm tài khoản';
  }
  async function loadGroups(){
    const subject=$('accounts-group-subject').value,select=$('accounts-group-select');
    groups=[];select.innerHTML='<option value="">-- Tạo nhóm mới --</option>';$('accounts-group-members').innerHTML='';
    $('accounts-group-name').value='';$('accounts-group-delete').disabled=true;
    if(!subject)return;
    const{data,error}=await state.client.from('exam_grader_groups').select('id,name').eq('subject_code',subject).order('name');
    if(error)throw new Error(`Không tải được nhóm: ${error.message}`);groups=data||[];
    const{data:members,error:memberError}=groups.length?await state.client.from('exam_grader_group_members').select('group_id,user_id').in('group_id',groups.map(group=>group.id)):{data:[],error:null};
    if(memberError)throw new Error(`Không tải được thành viên nhóm: ${memberError.message}`);
    const byGroup=new Map();for(const member of members||[]){if(!byGroup.has(member.group_id))byGroup.set(member.group_id,[]);byGroup.get(member.group_id).push(member.user_id)}
    for(const group of groups)group.user_ids=byGroup.get(group.id)||[];
    select.innerHTML='<option value="">-- Tạo nhóm mới --</option>'+groups.map(group=>`<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('');renderGroup();
  }
  function renderGroup(){
    const group=selectedGroup(),subject=$('accounts-group-subject').value,selected=new Set(group?.user_ids||[]);
    $('accounts-group-name').value=group?.name||'';$('accounts-group-delete').disabled=!group;
    const candidates=users.filter(user=>user.role==='grader'&&user.subject_code===subject);
    $('accounts-group-members').innerHTML=`<table><thead><tr><th>Chọn</th><th>Giáo viên</th><th>Email</th></tr></thead><tbody>${candidates.map(user=>
      `<tr><td><input type="checkbox" data-accounts-group-member value="${esc(user.user_id)}" ${selected.has(user.user_id)?'checked':''}></td><td>${esc(user.full_name||'—')}</td><td>${esc(user.email||'—')}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">Chưa có giáo viên cùng môn. Hãy tạo tài khoản và lưu môn phụ trách trước.</td></tr>'}</tbody></table>`;
  }
  async function refresh(){
    const token=++generation,previousGroup=$('accounts-group-select').value;
    const rows=await rpc('exam_manage_accounts');if(token!==generation)return;users=rows||[];
    renderUsers();
    await loadGroups();if(groups.some(group=>group.id===previousGroup)){$('accounts-group-select').value=previousGroup;renderGroup()}
  }
  function action(id,fn){$(id).onclick=async()=>{$(id).disabled=true;try{await fn()}catch(error){notify(error.message||String(error),'error')}finally{$(id).disabled=false}}}
  $('accounts-role').onchange=()=>{$('accounts-subject').disabled=$('accounts-role').value==='admin'};
  $('accounts-search').oninput=renderUsers;
  $('accounts-list').onclick=event=>{const edit=event.target.closest('[data-account-edit]');if(edit)openEditor(edit.dataset.accountEdit)};
  $('accounts-close').onclick=closeEditor;$('accounts-cancel').onclick=closeEditor;
  $('accounts-dialog').oncancel=event=>{if(busy)event.preventDefault();else $('accounts-password').value=''};
  $('accounts-group-subject').onchange=()=>loadGroups().catch(error=>notify(error.message,'error'));
  $('accounts-group-select').onchange=renderGroup;action('accounts-refresh',refresh);
  async function manage(actionName){
    if(state.role!=='admin'||!state.client)throw new Error('Chỉ Admin được quản lý tài khoản.');
    const user=selectedUser();if(actionName!=='create'&&!user)throw new Error('Hãy chọn tài khoản cần sửa hoặc xóa.');
    if(actionName==='delete'&&user.user_id===state.session?.user?.id)throw new Error('Không được xóa tài khoản đang đăng nhập.');
    const role=$('accounts-role').value,subject=$('accounts-subject').value;
    if(actionName!=='delete'&&role==='grader'&&!subject)throw new Error('Hãy chọn môn phụ trách cho giáo viên.');
    const email=$('accounts-email').value.trim(),full_name=$('accounts-full-name').value.trim(),password=$('accounts-password').value;
    const report_name=$('accounts-report-name').value.trim();
    if(actionName!=='delete'&&report_name.length>40)throw new Error('Tên trên thống kê tối đa 40 ký tự.');
    if(actionName!=='delete'&&(!email||!full_name))throw new Error('Nhập họ tên và email.');
    if(actionName==='create'&&password.length<8)throw new Error('Mật khẩu tài khoản mới cần ít nhất 8 ký tự.');
    if(actionName==='update'&&password&&password.length<8)throw new Error('Mật khẩu mới cần ít nhất 8 ký tự.');
    if(actionName==='delete'&&!confirm(`Xóa tài khoản ${user.email}? Thao tác không thể hoàn tác.`))return;
    const body=actionName==='delete'?{action:actionName,user_id:user.user_id}:{action:actionName,email,full_name,report_name,...(password?{password}:{}),...(user&&actionName==='update'?{user_id:user.user_id}:{})};
    const{data,error}=await state.client.functions.invoke('manage-exam-accounts',{body});
    if(error)throw new Error('Không gọi được chức năng quản lý tài khoản. Kiểm tra Edge Function và phiên đăng nhập.');
    if(data?.error)throw new Error(data.error);$('accounts-password').value='';
    if(actionName!=='delete'){
      if(!data?.user_id)throw new Error('Máy chủ chưa trả mã tài khoản. Hãy tải lại danh sách trước khi thử tiếp.');
      // Switch to edit immediately: role failure must never cause a duplicate create.
      $('accounts-user').value=data.user_id;
      $('accounts-create').hidden=true;$('accounts-update').hidden=false;
      try{await rpc('exam_set_account_role',{p_user_id:data.user_id,p_role:role,p_subject_code:role==='grader'?subject:null})}
      catch(error){
        // Keep a selectable local account even if the following refresh is unavailable.
        if(!users.some(row=>row.user_id===data.user_id))users.push({user_id:data.user_id,email,full_name,report_name,role:'unassigned'});
        renderUsers();
        throw new Error(`Đã lưu tài khoản nhưng chưa lưu được vai trò/môn: ${error.message}. Chọn Lưu thay đổi để thử lại.`);
      }
    }
    $('accounts-dialog').close();
    notify(actionName==='create'?'Đã tạo tài khoản và lưu vai trò/môn phụ trách.':actionName==='delete'?'Đã xóa tài khoản.':'Đã lưu thay đổi tài khoản.','success');
    try{await refresh()}catch(error){notify(`Đã lưu nhưng chưa tải lại được danh sách: ${error.message}`,'error')}
  }
  action('accounts-new',async()=>openEditor());
  async function saveAccount(actionName){
    if(busy)return;busy=true;
    const controls=['accounts-create','accounts-update','accounts-delete','accounts-close','accounts-cancel'];
    controls.forEach(id=>$(id).disabled=true);
    try{await manage(actionName)}catch(error){notify(error.message||String(error),'error')}
    finally{busy=false;controls.forEach(id=>$(id).disabled=false)}
  }
  $('accounts-form').onsubmit=event=>{event.preventDefault();return saveAccount($('accounts-user').value?'update':'create')};
  $('accounts-delete').onclick=()=>saveAccount('delete');
  action('accounts-group-create',async()=>{
    const subject=$('accounts-group-subject').value,name=$('accounts-group-name').value.trim(),group=selectedGroup();
    if(!subject||!name)throw new Error('Chọn môn và nhập tên nhóm.');
    const data=await rpc('exam_save_grader_group',{p_exam_id:null,p_subject_code:subject,p_group_id:group?.id||null,p_name:name,p_user_ids:selectedMemberIds()});
    await loadGroups();$('accounts-group-select').value=data;renderGroup();notify(group?'Đã đổi tên/cập nhật nhóm.':'Đã tạo nhóm. Chọn tài khoản rồi bấm Gán vào nhóm.','success');
  });
  action('accounts-group-assign',async()=>{
    const group=selectedGroup();if(!group)throw new Error('Tạo hoặc chọn nhóm trước.');
    await rpc('exam_save_grader_group',{p_exam_id:null,p_subject_code:$('accounts-group-subject').value,p_group_id:group.id,p_name:$('accounts-group-name').value.trim(),p_user_ids:selectedMemberIds()});
    await loadGroups();$('accounts-group-select').value=group.id;renderGroup();notify('Đã gán danh sách tài khoản vào nhóm.','success');
  });
  action('accounts-group-delete',async()=>{
    const group=selectedGroup();if(!group)throw new Error('Chọn nhóm cần xóa.');if(!confirm(`Xóa nhóm "${group.name}"?`))return;
    await rpc('exam_delete_grader_group',{p_group_id:group.id});await loadGroups();notify('Đã xóa nhóm.','success');
  });
  return {refresh:()=>refresh().catch(error=>notify(error.message,'error'))};
}
