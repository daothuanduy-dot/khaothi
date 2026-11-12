import {SUBJECTS} from './rooming.js?v=0.1.119';

export function wireAccounts({state,$,esc,message}){
  let users=[],groups=[],generation=0,busy=false;
  const teacherTab=$('accounts-tab-teachers'),studentTab=$('accounts-tab-students');
  const teacherPanel=$('accounts-panel-teachers'),studentPanel=$('accounts-panel-students');
  function switchAccountTab(tab){
    const isStudent=tab==='students';
    teacherPanel.hidden=isStudent;
    studentPanel.hidden=!isStudent;
    teacherTab.setAttribute('aria-selected',String(!isStudent));
    studentTab.setAttribute('aria-selected',String(isStudent));
    teacherTab.className=isStudent?'btn btn-light':'btn btn-primary';
    studentTab.className=isStudent?'btn btn-primary':'btn btn-light';
    if(isStudent&&!studentPanel.dataset.loaded){studentPanel.dataset.loaded='1';loadStudents()}
  }
  teacherTab.onclick=()=>switchAccountTab('teachers');
  studentTab.onclick=()=>switchAccountTab('students');

  const subjects=[{code:'TOAN',name:'Toán'},{code:'VAN',name:'Ngữ văn'},...SUBJECTS];
  const options='<option value="">Chọn môn</option>'+subjects.map(s=>`<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('');
  $('accounts-subject').innerHTML=options;$('accounts-group-subject').innerHTML=options;
  const notify=(text,type='info')=>message($('accounts-dialog').open?$('accounts-form-message'):$('accounts-message'),text,type);
  function renderUsers(){
    const term=$('accounts-search').value.trim().toLocaleLowerCase('vi');
    const rows=users.filter(user=>[user.full_name,user.report_name,user.email].some(value=>String(value||'').toLocaleLowerCase('vi').includes(term)));
    $('accounts-count').textContent=`Hiển thị ${rows.length}/${users.length} tài khoản`;
    $('accounts-list').innerHTML=rows.map(user=>`<tr><td>${esc(user.full_name||'—')}</td><td>${esc(user.report_name||'—')}</td><td>${esc(user.email||'—')}</td><td>${esc(user.role==='admin'?'Admin':user.role==='grader'?'Giáo viên':user.role==='appeal_entry'?'Nhập phúc khảo':'Chưa phân quyền')}</td><td>${esc(subjects.find(subject=>subject.code===user.subject_code)?.name||user.subject_code||'—')}</td><td><button type="button" class="btn btn-light" data-account-edit="${esc(user.user_id)}">Sửa</button></td></tr>`).join('')||`<tr><td colspan="6" class="empty">${users.length?'Không có tài khoản phù hợp.':'Chưa có tài khoản.'}</td></tr>`;
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
    $('accounts-role').value=['admin','grader','appeal_entry'].includes(user?.role)?user.role:'grader';$('accounts-subject').value=user?.subject_code||'';$('accounts-appeal-permission').checked=!!user?.can_enter_appeals||user?.role==='appeal_entry';
    $('accounts-subject').disabled=$('accounts-role').value!=='grader';
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
    const rows=await rpc('exam_manage_accounts');if(token!==generation)return;users=rows||[];const grants=await rpc('exam_admin_appeal_entry_permissions');const byId=new Map((grants||[]).map(x=>[x.user_id,x.enabled]));for(const u of users)u.can_enter_appeals=byId.get(u.user_id)||u.role==='appeal_entry';
    renderUsers();
    await loadGroups();if(groups.some(group=>group.id===previousGroup)){$('accounts-group-select').value=previousGroup;renderGroup()}
  }
  function action(id,fn){$(id).onclick=async()=>{$(id).disabled=true;try{await fn()}catch(error){notify(error.message||String(error),'error')}finally{$(id).disabled=false}}}
  $('accounts-role').onchange=()=>{$('accounts-subject').disabled=$('accounts-role').value!=='grader'};
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
      try{await rpc('exam_set_account_role',{p_user_id:data.user_id,p_role:role,p_subject_code:role==='grader'?subject:null});await rpc('exam_admin_set_appeal_entry_permission',{p_user_id:data.user_id,p_enabled:role==='appeal_entry'||$('accounts-appeal-permission').checked})}
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

  // Quản trị liên kết hồ sơ học sinh. RPC chỉ trả dữ liệu cho Admin.
  let studentLinkRecord=null, studentRows=[], studentPage=0, studentTotal=0, studentRequest=0;
  const studentPageSize=30;
  let allStudentRecords=null, studentSummaryLoading=false;
  const normClass=value=>String(value||'').trim().toUpperCase();
  const gradeOf=value=>(normClass(value).match(/^(10|11|12)/)||[])[1]||'';
  const selectedClass=()=>normClass($('student-link-class').value);
  function classSort(a,b){return a.localeCompare(b,'vi',{numeric:true,sensitivity:'base'})}
  function filteredAllStudents(){
    const grade=$('student-link-grade').value,cls=selectedClass();
    return (allStudentRecords||[]).filter(r=>(!grade||gradeOf(r.class_code)===grade)&&(!cls||normClass(r.class_code)===cls));
  }
  function updateClassOptions(){
    const grade=$('student-link-grade').value,previous=$('student-link-class').value;
    const known=allStudentRecords?allStudentRecords.map(r=>normClass(r.class_code)):[];
    // When a complete roster is not yet loaded, classes are populated from the current page.
    const classes=[...new Set([...known,...studentRows.map(r=>normClass(r.class_code))].filter(c=>c&&(!grade||gradeOf(c)===grade)))].sort(classSort);
    $('student-link-class').innerHTML='<option value="">Tất cả lớp</option>'+classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if(classes.includes(previous))$('student-link-class').value=previous;
  }
  function renderSummary(){
    if(!allStudentRecords)return;
    const grouped=new Map();
    for(const r of filteredAllStudents()){
      const cls=normClass(r.class_code)||'Chưa xác định';
      if(!grouped.has(cls))grouped.set(cls,{name:cls,total:0,linked:0});
      const item=grouped.get(cls);item.total++;
      if(r.account_status==='active')item.linked++;
    }
    const groups=[...grouped.values()].sort((a,b)=>classSort(a.name,b.name));
    const totals=groups.reduce((a,r)=>({total:a.total+r.total,linked:a.linked+r.linked}),{total:0,linked:0});
    const percent=(a,b)=>b?(100*a/b).toFixed(1)+'%':'0%';
    const row=r=>`<tr><td>${esc(r.name)}</td><td>${r.total}</td><td>${r.linked}</td><td>${r.total-r.linked}</td><td>${percent(r.linked,r.total)}</td></tr>`;
    $('student-link-summary-rows').innerHTML=groups.map(row).join('')+`<tr style="font-weight:bold"><td>Tổng cộng</td><td>${totals.total}</td><td>${totals.linked}</td><td>${totals.total-totals.linked}</td><td>${percent(totals.linked,totals.total)}</td></tr>`;
    $('student-link-summary-note').textContent=`${groups.length} lớp · ${totals.total} học sinh · ${totals.linked} đã liên kết · ${totals.total-totals.linked} chưa liên kết`;
    $('student-link-summary').hidden=false;
    $('student-link-print').disabled=!groups.length;
  }
  async function loadFullStudentRoster(){
    if(studentSummaryLoading)return;
    studentSummaryLoading=true;
    $('student-link-summary-load').disabled=true;
    $('student-link-print').disabled=true;
    linkMsg('Đang đọc đầy đủ hồ sơ học sinh để thống kê, vui lòng chờ...');
    try{
      const rows=[],size=100;let offset=0,total=null;
      while(total===null||offset<total){
        const result=await rpc('exam_admin_student_accounts_list',{p_search:'',p_status:'all',p_limit:size,p_offset:offset});
        const batch=Array.isArray(result?.rows)?result.rows:[];
        const reported=Number(result?.total);
        if(!Number.isFinite(reported)||reported<0)throw new Error('Máy chủ không trả tổng số hồ sơ hợp lệ.');
        if(total===null)total=reported;
        if(reported!==total)throw new Error('Danh sách học sinh thay đổi trong lúc thống kê. Hãy tải lại.');
        if(!batch.length&&offset<total)throw new Error('Không tải đủ hồ sơ. Hãy kiểm tra giới hạn phân trang của Supabase.');
        rows.push(...batch);offset+=batch.length;
        if(rows.length>total)throw new Error('Dữ liệu phân trang không nhất quán.');
      }
      // Reject duplicates rather than silently double-counting linked students.
      const ids=rows.map(r=>r.student_id).filter(Boolean);
      if(new Set(ids).size!==ids.length)throw new Error('Danh sách có hồ sơ trùng lặp; chưa thể thống kê chính xác.');
      allStudentRecords=rows;
      updateClassOptions();renderSummary();
      linkMsg(`Đã tải ${rows.length} hồ sơ và tổng hợp theo lớp.`,'success');
    }catch(error){allStudentRecords=null;$('student-link-summary').hidden=true;linkMsg(error.message||String(error),'error')}
    finally{studentSummaryLoading=false;$('student-link-summary-load').disabled=false}
  }
  function printStudentSummary(){
    if(!allStudentRecords)return;
    const list=filteredAllStudents();
    const byClass=new Map();
    for(const r of list){const c=normClass(r.class_code)||'Chưa xác định';if(!byClass.has(c))byClass.set(c,[]);byClass.get(c).push(r)}
    const classes=[...byClass.keys()].sort(classSort);
    const safe=val=>esc(String(val??''));
    const sections=classes.map(cls=>{
      const rows=byClass.get(cls).sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'vi'));
      const linked=rows.filter(r=>r.account_status==='active').length;
      return `<section><h3>Lớp ${safe(cls)} — ${linked}/${rows.length} đã liên kết</h3><table><thead><tr><th>STT</th><th>Họ và tên</th><th>Mã định danh Bộ GDĐT</th><th>Trạng thái</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${safe(r.full_name)}</td><td>${safe(r.student_code)}</td><td>${r.account_status==='active'?'Đã liên kết':'Chưa liên kết'}</td></tr>`).join('')}</tbody></table></section>`;
    }).join('');
    const popup=window.open('','_blank');
    if(!popup){linkMsg('Trình duyệt đã chặn cửa sổ in. Hãy cho phép pop-up rồi thử lại.','error');return}
    popup.document.open();popup.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thống kê tài khoản học sinh</title><style>@page{size:A4 portrait;margin:13mm}body{font-family:Arial,sans-serif;font-size:11pt;color:#111}h2{text-align:center;font-size:15pt;margin:10px 0 5px}p{text-align:center}h3{font-size:12pt;margin:18px 0 8px}table{border-collapse:collapse;width:100%;font-size:10pt}th,td{border:1px solid #444;padding:5px 7px}th{background:#eee}td:first-child{text-align:center;width:45px}section{break-inside:avoid-page;margin-top:15px}thead{display:table-header-group}@media print{button{display:none}}</style></head><body><h2>THỐNG KÊ TÀI KHOẢN HỌC SINH ĐÃ LIÊN KẾT</h2><p>${classes.length} lớp · ${list.length} học sinh · ${list.filter(r=>r.account_status==='active').length} đã liên kết</p>${sections}<script>window.onload=()=>window.print()</script></body></html>`);popup.document.close();
  }
  $('student-link-grade').onchange=async()=>{studentPage=0;if(!allStudentRecords)await loadFullStudentRoster();updateClassOptions();if(allStudentRecords)renderSummary();loadStudents()};
  $('student-link-class').onchange=async()=>{studentPage=0;if(!allStudentRecords)await loadFullStudentRoster();if(allStudentRecords)renderSummary();loadStudents()};
  $('student-link-summary-load').onclick=loadFullStudentRoster;
  $('student-link-print').onclick=printStudentSummary;
  const linkMsg=(txt,type='info')=>message($('student-link-message'),txt,type);
  function studentSelect(row){
    studentLinkRecord=row;
    emailCheck=null;
    $('student-link-result').hidden=false;
    $('student-link-reason').value='';
    $('student-link-selected').textContent=`${row.full_name||'—'} · ${row.class_code||'—'} · ${row.email||'Chưa có email'}`;
    $('student-link-unlink').disabled=!(row.account_status==='active'&&row.auth_user_id);
    $('student-reset-password').disabled=!(['active','provisioned'].includes(row.account_status)&&row.auth_user_id&&row.email);
    $('student-reset-result').hidden=true;$('student-reset-secret').textContent='';$('student-reset-reason').value='';
    $('student-email-new').value='';$('student-email-reason').value='';$('student-email-verified').checked=false; $('student-email-apply').disabled=true;$('student-email-result').textContent='';
  }
  function renderStudents(){
    const visible=studentRows;
    $('student-link-rows').innerHTML=visible.map((row,i)=>`<tr><td>${esc(row.full_name||'—')}</td><td>${esc(row.class_code||'—')}</td><td>${esc(row.student_code||'—')}</td><td>${esc(row.email||'—')}</td><td>${esc(row.account_status==='active'?'Đã liên kết':'Chưa liên kết')}</td><td>${['active','provisioned'].includes(row.account_status)?`<button type="button" class="btn btn-light" data-student-unlink="${i}">Quản lý tài khoản</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="6">Không tìm thấy học sinh phù hợp.</td></tr>';
    $('student-link-count').textContent=`${studentTotal} hồ sơ phù hợp`;
    $('student-link-page').textContent=`Trang ${studentPage+1}`;
    $('student-link-prev').disabled=studentPage===0;
    $('student-link-next').disabled=(studentPage+1)*studentPageSize>=studentTotal;
  }
  async function loadStudents(){
    const token=++studentRequest;
    $('student-link-find').disabled=true;$('student-link-reload').disabled=true;
    studentLinkRecord=null;$('student-link-result').hidden=true;
    try{
      const classFilter=selectedClass(),gradeFilter=$('student-link-grade').value;
      if(allStudentRecords&&(classFilter||gradeFilter)){
        const term=$('student-link-search').value.trim().toLocaleLowerCase('vi');
        const status=$('student-link-status').value;
        const filtered=filteredAllStudents().filter(r=>(status==='all'||(status==='active'?r.account_status==='active':r.account_status!=='active'))&&(!term||[r.full_name,r.class_code,r.student_code,r.email].some(v=>String(v||'').toLocaleLowerCase('vi').includes(term))));
        studentTotal=filtered.length;studentRows=filtered.slice(studentPage*studentPageSize,(studentPage+1)*studentPageSize);renderStudents();return;
      }
      const data=await rpc('exam_admin_student_accounts_list',{
        p_search:$('student-link-search').value.trim(),
        p_status:$('student-link-status').value,
        p_limit:studentPageSize,p_offset:studentPage*studentPageSize
      });
      if(token!==studentRequest)return;
      studentRows=Array.isArray(data?.rows)?data.rows:[];
      studentTotal=Number(data?.total||0);updateClassOptions();renderStudents();
    }catch(e){if(token===studentRequest)linkMsg(e.message||String(e),'error')}
    finally{if(token===studentRequest){$('student-link-find').disabled=false;$('student-link-reload').disabled=false}}
  }
  $('student-link-find').onclick=()=>{studentPage=0;loadStudents()};
  $('student-link-reload').onclick=()=>{studentPage=0;allStudentRecords=null;$('student-link-summary').hidden=true;$('student-link-print').disabled=true;loadStudents()};
  $('student-link-search').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();studentPage=0;loadStudents()}};
  $('student-link-status').onchange=()=>{studentPage=0;loadStudents()};
  $('student-link-prev').onclick=()=>{if(studentPage>0){studentPage--;loadStudents()}};
  $('student-link-next').onclick=()=>{if((studentPage+1)*studentPageSize<studentTotal){studentPage++;loadStudents()}};
  $('student-link-rows').onclick=e=>{
    const btn=e.target.closest('[data-student-unlink]');if(!btn)return;
    const row=studentRows[Number(btn.dataset.studentUnlink)];if(row)studentSelect(row);
  };
  let emailCheck=null;
  const emailResetCheck=()=>{emailCheck=null;$('student-email-apply').disabled=true;$('student-email-result').textContent='';};
  ['student-email-new','student-email-reason'].forEach(id=>$(id).addEventListener('input',emailResetCheck));
  $('student-email-verified').onchange=emailResetCheck;
  async function studentEmailCall(actionName){
    const row=studentLinkRecord;
    if(!row||!row.auth_user_id||row.account_status!=='active')throw new Error('Chỉ hỗ trợ tài khoản học sinh đang active.');
    const email=$('student-email-new').value.trim().toLowerCase(),reason=$('student-email-reason').value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('Email mới không hợp lệ.');
    if(reason.length<10||reason.length>500)throw new Error('Lý do phải dài 10–500 ký tự.');
    if(!$('student-email-verified').checked)throw new Error('Phải xác nhận đã kiểm tra danh tính và quyền sở hữu email.');
    const {data,error}=await state.client.functions.invoke('student-admin-email-change',{body:{action:actionName,student_id:row.student_id,auth_user_id:row.auth_user_id,email,reason}});
    if(error||!data?.ok)throw new Error(data?.error||error?.message||'Không thể xử lý email.');
    return data;
  }
  $('student-email-check').onclick=async()=>{
    const btn=$('student-email-check');btn.disabled=true;emailResetCheck();
    try{
      const result=await studentEmailCall('check');
      emailCheck={student_id:studentLinkRecord.student_id,auth_user_id:studentLinkRecord.auth_user_id,email:$('student-email-new').value.trim().toLowerCase(),check_token:result.check_token};
      $('student-email-result').textContent='Email chưa bị tài khoản khác sử dụng. Có thể xác nhận thay đổi.';
      $('student-email-apply').disabled=false;
    }catch(e){$('student-email-result').textContent=e.message||String(e);linkMsg(e.message||String(e),'error')}
    finally{btn.disabled=false}
  };
  $('student-email-apply').onclick=async()=>{
    if(!emailCheck||!studentLinkRecord||emailCheck.student_id!==studentLinkRecord.student_id||emailCheck.auth_user_id!==studentLinkRecord.auth_user_id||emailCheck.email!==$('student-email-new').value.trim().toLowerCase())return;
    if(!confirm('Xác nhận cập nhật email đăng nhập của đúng học sinh? Thao tác sẽ được ghi nhật ký.'))return;
    const btn=$('student-email-apply');btn.disabled=true;
    try{
      const row=studentLinkRecord;
      const result=await studentEmailCall('apply');
      row.email=result.email;
      $('student-link-selected').textContent=`${row.full_name||'—'} · ${row.class_code||'—'} · ${row.email}`;
      $('student-email-result').textContent='Đã đổi email thành công. Học sinh đăng nhập và khôi phục mật khẩu qua email mới.';
      linkMsg('Đã cập nhật email liên kết.','success');renderStudents();
    }catch(e){$('student-email-result').textContent=e.message||String(e);linkMsg(e.message||String(e),'error')}
    finally{emailCheck=null}
  };
  $('student-reset-hide').onclick=()=>{$('student-reset-secret').textContent='';$('student-reset-result').hidden=true};
  $('student-reset-password').onclick=async()=>{
    const row=studentLinkRecord,reason=$('student-reset-reason').value.trim();
    if(!row||!['active','provisioned'].includes(row.account_status)||!row.auth_user_id)return;
    if(reason.length<10){linkMsg('Vui lòng nhập lý do cấp lại mật khẩu tối thiểu 10 ký tự.','error');return;}
    if(!confirm(`Cấp lại mật khẩu cho ${row.full_name} (${row.email})? Tài khoản sẽ tạm khóa xem điểm đến khi học sinh đổi mật khẩu.`))return;
    const btn=$('student-reset-password');btn.disabled=true;
    $('student-reset-result').hidden=true;$('student-reset-secret').textContent='';
    try{
      const {data,error}=await state.client.functions.invoke('student-admin-password-reset',{body:{action:'reset',student_id:row.student_id,auth_user_id:row.auth_user_id,reason}});
      if(error||!data?.ok)throw new Error(data?.error||error?.message||'Không thể cấp lại mật khẩu.');
      $('student-reset-secret').textContent=data.temporary_password;
      $('student-reset-result').hidden=false;
      linkMsg('Đã cấp mật khẩu tạm thời. Hãy bàn giao riêng cho đúng học sinh.','success');
      row.account_status='provisioned';renderStudents();
    }catch(e){linkMsg(e.message||String(e),'error');btn.disabled=false;}
  };
  $('student-link-cancel').onclick=()=>{studentLinkRecord=null;$('student-link-result').hidden=true};
  $('student-link-unlink').onclick=async()=>{
    const row=studentLinkRecord,reason=$('student-link-reason').value.trim();
    if(!row||!['active','provisioned'].includes(row.account_status)||!row.auth_user_id)return;
    if(reason.length<10){linkMsg('Vui lòng nhập lý do tối thiểu 10 ký tự.','error');return}
    if(!confirm(`Xác nhận hủy liên kết của ${row.full_name||row.email}? Tài khoản sẽ mất quyền xem hồ sơ hiện tại.`))return;
    $('student-link-unlink').disabled=true;
    try{
      const res=await rpc('exam_admin_student_link_unlink',{p_auth_user_id:row.auth_user_id,p_expected_student_id:row.student_id,p_reason:reason});
      if(!res?.ok)throw new Error('Chưa thể hủy liên kết.');
      linkMsg('Đã hủy liên kết. Học sinh đăng nhập lại và nhập mã định danh chính xác.','success');
      await loadStudents();
    }catch(e){linkMsg(e.message||String(e),'error');$('student-link-unlink').disabled=false}
  };

  return {refresh:()=>refresh().catch(error=>notify(error.message,'error'))};
}
