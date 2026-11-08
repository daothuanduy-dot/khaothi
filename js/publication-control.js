// v0.1.273 — Admin-only publication controls. No student score access is granted.
export function initPublicationControls({client,examId,role}) {
 const host=document.getElementById('publication-control');
 if(!host || role!=='admin')return;
 const status=host.querySelector('[data-pub-status]');
 const table=host.querySelector('[data-pub-rows]');
 const refresh=host.querySelector('[data-pub-refresh]');
 let busy=false;
 const safe=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function load(){
  if(busy)return;
  const id=examId();
  table.innerHTML='';
  if(!id){status.textContent='Hãy chọn kỳ thi ở tab Kỳ thi.';return;}
  status.textContent='Đang tải trạng thái công bố...';
  const {data,error}=await client().rpc('exam_admin_publication_status',{p_exam_id:id});
  if(error){status.textContent='Không tải được trạng thái công bố: '+error.message;return;}
  if(id!==examId()){status.textContent='Kỳ thi đã thay đổi; vui lòng làm mới.';return;}
  status.textContent='Chỉ quản trị viên được thay đổi trạng thái. Chưa cấp quyền xem điểm cho học sinh trong phiên bản này.';
  for(const item of data||[]){
   const row=document.createElement('tr');
   const grade=document.createElement('td');grade.textContent='Khối '+item.grade_code;
   const state=document.createElement('td');state.textContent=item.is_published?'Đã công bố':'Chưa công bố';
   const action=document.createElement('td');
   const button=document.createElement('button');button.type='button';button.className='btn btn-light';
   button.textContent=item.is_published?'Thu hồi':'Công bố';
   button.onclick=async()=>{
    if(busy)return;
    const publish=!item.is_published;
    if(!confirm((publish?'Công bố':'Thu hồi')+' trạng thái kết quả khối '+item.grade_code+' của kỳ thi đang chọn?'))return;
    busy=true;button.disabled=true;
    try{
     const {error}=await client().rpc('exam_admin_set_publication',{p_exam_id:id,p_grade_code:item.grade_code,p_publish:publish});
     if(error)throw error;
     status.textContent='Đã cập nhật trạng thái khối '+item.grade_code+'.';
    }catch(e){status.textContent='Không cập nhật được: '+e.message;}
    finally{busy=false;await load();}
   };
   action.appendChild(button);row.append(grade,state,action);table.appendChild(row);
  }
 }
 refresh.addEventListener('click',load);
 return {refresh:load};
}
