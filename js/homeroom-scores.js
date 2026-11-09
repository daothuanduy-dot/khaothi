// v0.1.307 - Bảng điểm GVCN. Quyền dữ liệu kiểm tra trong RPC, không dựa vào bộ lọc trình duyệt.
const byId=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let currentClient=null, rows=[], exams=[], selected=null;
const labels={TOAN:'Toán',VAN:'Ngữ văn',N1:'Ngoại ngữ',ANH:'Tiếng Anh',LY:'Vật lý',HOA:'Hóa học',SINH:'Sinh học',TIN:'Tin học',SU:'Lịch sử',DIA:'Địa lý',GDKTPL:'GDKT&PL',KTPL:'GDKT&PL'};
const stateText=(msg,isError=false)=>{const el=byId('homeroom-status');el.textContent=msg;el.style.color=isError?'#b91c1c':''};
async function rpc(name,args){const {data,error}=await currentClient.rpc(name,args);if(error)throw Error(error.message);return data}
function fmt(v){return v===null||v===undefined?'':String(v).replace('.',',')}
function render(){
 const body=byId('homeroom-body'),head=byId('homeroom-head');
 if(!rows.length){head.innerHTML='';body.innerHTML='<tr><td>Chưa có dữ liệu điểm cho lựa chọn này.</td></tr>';return}
 const subjects=[...new Set(rows.map(r=>r.subject_code))].sort((a,b)=>a.localeCompare(b,'vi'));
 const students=new Map();for(const r of rows){if(!students.has(r.candidate_id))students.set(r.candidate_id,{...r,grades:{}});students.get(r.candidate_id).grades[r.subject_code]=r}
 head.innerHTML='<tr><th>STT</th><th>SBD</th><th>Mã định danh</th><th>Họ tên</th>'+subjects.map(s=>`<th>${escapeHtml(labels[s]||s)}</th>`).join('')+'</tr>';
 body.innerHTML=[...students.values()].sort((a,b)=>a.student_name.localeCompare(b.student_name,'vi')).map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+escapeHtml(r.sbd)+'</td><td>'+escapeHtml(r.student_code)+'</td><td>'+escapeHtml(r.student_name)+'</td>'+subjects.map(s=>{const v=r.grades[s];return '<td title="'+escapeHtml(v?.is_absent?'Vắng thi':v?.no_paper?'Không bài':v?.total_score==null?'Chưa có điểm':'')+'">'+escapeHtml(v?.is_absent?'Vắng':v?.no_paper?'Không bài':fmt(v?.total_score))+'</td>'}).join('')+'</tr>').join('');
 byId('homeroom-count').textContent=`${students.size} học sinh · ${subjects.length} môn`;
}
async function load(){
 stateText('Đang tải các lớp được phân công và kỳ thi đã công bố...');
 exams=await rpc('exam_homeroom_my_exams');if(!Array.isArray(exams))throw Error('Dữ liệu kỳ thi không đúng định dạng.');
 const select=byId('homeroom-exam');select.innerHTML='<option value="">-- Chọn kỳ thi và lớp chủ nhiệm --</option>'+exams.map((x,i)=>`<option value="${i}">${escapeHtml(x.school_year+' · HK'+x.semester+' · '+x.exam_name+' · '+x.class_code)}</option>`).join('');
 rows=[];render();byId('homeroom-count').textContent='';stateText(exams.length?`Có ${exams.length} lựa chọn kỳ thi/lớp được công bố.`:'Chưa có kỳ thi đã công bố và gắn kỳ học cho lớp chủ nhiệm. Liên hệ quản trị viên.');
}
async function fetchScores(){
 const idx=byId('homeroom-exam').value;selected=idx===''?null:exams[Number(idx)];rows=[];render();byId('homeroom-count').textContent='';if(!selected)return;
 stateText('Đang lấy điểm chính thức...');
 const subjects=await rpc('exam_homeroom_exam_subjects',{p_exam_id:selected.exam_id,p_class_code:selected.class_code});
 for(const subject of subjects){
   const result=await rpc('exam_homeroom_subject_results',{p_exam_id:selected.exam_id,p_subject_code:subject,p_class_code:selected.class_code});
   rows.push(...(result||[]).map(r=>({...r,subject_code:subject})));
 }
 render();stateText(`Đã tải bảng điểm lớp ${selected.class_code}. Chỉ hiển thị điểm đã công bố.`);
}
function exportCsv(){if(!selected||!rows.length)return;const header=[...byId('homeroom-head').querySelectorAll('th')].map(x=>x.textContent);const body=[...byId('homeroom-body').querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent));const csv='\ufeff'+[header,...body].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`Bang_diem_GVCN_${selected.class_code}.csv`;a.click();URL.revokeObjectURL(url)}
export function initHomeroomScores({client}){
 currentClient=client;
 byId('homeroom-open').onclick=async()=>{const pane=byId('homeroom-panel');pane.hidden=!pane.hidden;if(!pane.hidden){try{await load()}catch(e){stateText(e.message,true)}}};
 byId('homeroom-reload').onclick=()=>load().catch(e=>stateText(e.message,true));
 byId('homeroom-exam').onchange=()=>fetchScores().catch(e=>stateText(e.message,true));
 byId('homeroom-export').onclick=exportCsv;
 byId('homeroom-print').onclick=()=>{if(rows.length)window.print()};
}
