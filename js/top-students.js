import {topReportHtml,topReportTable,styleTopReportWorksheet,topTemplateCss} from './top-students-template.js?v=199';
export function topStudentsByGroup(students,rows,groups){
 const seen=new Set(),known=new Set(students.map(s=>s.class_code));
 for(const group of groups)for(const code of group){if(!known.has(code))throw new Error(`Lớp ${code} không có trong kỳ thi.`);if(seen.has(code))throw new Error(`Lớp ${code} bị trùng nhóm.`);seen.add(code);}
 const byStudent=new Map();
 for(const r of rows){
  if(r.is_absent||r.statistics_score==null||!Number.isFinite(Number(r.statistics_score)))continue;
  if(!byStudent.has(r.candidate_id))byStudent.set(r.candidate_id,new Map());
  const scores=byStudent.get(r.candidate_id);
  if(scores.has(r.subject_code))throw new Error('Dữ liệu trùng học sinh–môn; không thể xếp hạng.');
  scores.set(r.subject_code,Number(r.statistics_score));
 }
 const nameParts=s=>{const p=String(s.student_name||'').trim().split(/\s+/);return [p.at(-1)||'',p.slice(1,-1).join(' '),p[0]||''].join('|');};
 return groups.map((group,index)=>{
  const members=new Set(group);
  const ranked=students.filter(s=>members.has(s.class_code)&&byStudent.get(s.candidate_id)?.size).map(s=>{
   const scores=[...byStudent.get(s.candidate_id).values()];return {...s,total:scores.reduce((a,b)=>a+b,0),paper_count:scores.length};
  }).sort((a,b)=>b.total-a.total||nameParts(a).localeCompare(nameParts(b),'vi')||String(a.student_code||a.candidate_id).localeCompare(String(b.student_code||b.candidate_id)));
  let rank=0,last;
  ranked.forEach((s,i)=>{if(i===0||s.total!==last)rank=i+1;s.rank=rank;last=s.total;});
  return {index,classes:[...group],students:ranked.filter(s=>s.rank<=3)};
 });
}
export function topStudentsSheet(group){
 return [['Hạng','SBD','Mã định danh','Họ và tên','Lớp','Số môn có điểm được tính','Tổng điểm'],
 ...group.students.map(s=>[s.rank,s.sbd||'',s.student_code||'',s.student_name,s.class_code,s.paper_count,s.total])];
}
export function wireTopStudents({state,$,esc,message,createPrintFrame}){
 let payload=null,key='',request=0,groups=[],groupNames=[];
 const headerFields=['authority','institution','exam_title','school_year','title','grade'];
 const reportHeader=()=>Object.fromEntries(headerFields.map(f=>[f,$('top-header-'+f)?.value||'']));
 const notify=(s,type='info')=>message($('top-students-message'),s,type);
 const context=()=>JSON.stringify([state.selectedExam,state.statisticsRevision||0]);
 const storageKey=()=>`top-students-groups:${state.selectedExam}`;
 function clear(){request++;payload=null;key='';$('top-students-results').innerHTML='';$('top-students-excel').disabled=true;$('top-students-pdf').disabled=true;}
 function blocks(){if(!payload||key!==context())throw new Error('Tải lại dữ liệu Top 3 của kỳ thi đang chọn.');return topStudentsByGroup(payload.students,payload.rows,groups).map((g,i)=>({...g,name:groupNames[i]||`Nhóm ${i+1}`})).filter(g=>g.classes.length);}
 const table=rows=>`<table><thead><tr>${rows[0].map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r=>`<tr>${r.map((v,i)=>`<td>${esc(i===6?Number(v).toFixed(3):v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
 const body=()=>`<style>${topTemplateCss}</style>`+topReportHtml(blocks(),reportHeader(),esc);
 function render(){
  if(!payload)return;
  $('top-students-results').innerHTML=body()||'<p>Tạo nhóm và chọn lớp để xem Top 3.</p>';
  const enabled=blocks().some(g=>g.students.length);$('top-students-excel').disabled=!enabled;$('top-students-pdf').disabled=!enabled;
 }
 function editor(){
  if(!payload)return;const used=new Set(groups.flat());
  $('top-students-groups').innerHTML=groups.map((g,i)=>`<div class="panel"><label>Tên nhóm<input data-top-name="${i}" value="${esc(groupNames[i]||'')}" maxlength="80" placeholder="Ví dụ: KHTN, KHXH"></label> <button type="button" data-top-delete="${i}" class="btn btn-light">Xóa nhóm</button><div class="form-grid">${payload.classes.map(code=>`<label><input type="checkbox" data-top-group="${i}" data-class="${esc(code)}" ${g.includes(code)?'checked':''} ${used.has(code)&&!g.includes(code)?'disabled':''}> ${esc(code)}</label>`).join('')}</div></div>`).join('')+'<button type="button" data-top-add class="btn btn-light">+ Tạo nhóm</button>';
 }
 function changed(){try{globalThis.localStorage?.setItem(storageKey(),JSON.stringify(groups.map((classes,i)=>({classes,name:groupNames[i]||''}))));}catch{notify('Không lưu được nhóm trên trình duyệt.');}editor();render();}
 async function pages(tableName,configure){const rows=[];for(let n=0;;n+=500){const {data,error}=await configure(state.client.from(tableName).select('*')).range(n,n+499);if(error)throw new Error(error.message);rows.push(...data);if(data.length<500)return rows;}}
 $('top-students-load').onclick=async()=>{
  clear();const exam=state.exams.find(e=>e.id===state.selectedExam),captured=context(),token=request;
  if(state.role!=='admin'||!exam){notify('Chọn kỳ thi với quyền Admin.','error');return;}
  if(!['default','choice','subject'].includes(exam.exam_mode)){notify('Top 3 hiện hỗ trợ kỳ mặc định, lựa chọn và theo môn; chưa hỗ trợ kỳ thủ công.','error');return;}
  $('top-students-load').disabled=true;
  try{
   const [candidates,registrations,configs]=await Promise.all([
    pages('exam_candidates',q=>q.eq('exam_id',exam.id).order('id')),
    pages('exam_candidate_subjects',q=>q.eq('exam_id',exam.id).order('candidate_id').order('subject_code')),
    pages('exam_subject_class_configs',q=>q.eq('exam_id',exam.id).order('class_code').order('subject_code'))]);
   const codes=[...new Set((exam.exam_mode==='default'?configs.filter(c=>c.is_counted):[...registrations,...(exam.exam_mode==='choice'?configs:[])]).map(r=>r.subject_code))];
   const rows=[];
   // Sequential per-subject requests avoid overloading the database and fail closed on missing configurations.
   for(const code of codes){const {data,error}=await state.client.rpc('exam_get_subject_statistics',{p_exam_id:exam.id,p_subject_code:code,p_include_absent:false,p_include_violations:false});if(error)throw new Error(`${code}: ${error.message}`);rows.push(...(data.rows||[]).filter(r=>exam.exam_mode!=='default'||configs.some(c=>c.class_code===r.class_code&&c.subject_code===code&&c.is_counted)).map(r=>({...r,subject_code:code})));}
   if(captured!==context()||token!==request)return;
   payload={exam,students:candidates.map(c=>({...c,candidate_id:c.id})),rows,classes:[...new Set(candidates.map(c=>c.class_code).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}))};key=captured;
   try{const saved=JSON.parse(globalThis.localStorage?.getItem(storageKey())||'[]'),used=new Set(),items=Array.isArray(saved)?saved.filter(g=>Array.isArray(g)||Array.isArray(g?.classes)):[];groupNames=items.map(g=>typeof g.name==='string'?g.name.slice(0,80):'');groups=items.map(g=>(Array.isArray(g)?g:g.classes).filter(c=>payload.classes.includes(c)&&!used.has(c)&&(used.add(c),true)));}catch{groups=[];groupNames=[];}
   const grades=[...new Set(candidates.map(c=>String(c.grade_code||'').trim()).filter(Boolean))];
   if(grades.length>1)throw new Error('Mẫu Top 3 chỉ dùng một khối trong kỳ thi. Kỳ thi này đang có nhiều khối.');
   const defaults={authority:exam.managing_authority||'',institution:exam.institution_name||'',exam_title:exam.form_exam_title||exam.name,school_year:exam.school_year||'',title:'DANH SÁCH HỌC SINH ĐẠT TOP 3',grade:grades[0]||''};
   let savedHeader={};try{savedHeader=JSON.parse(globalThis.localStorage?.getItem(storageKey()+':header')||'{}')||{};}catch{}
   for(const f of headerFields)if($('top-header-'+f))$('top-header-'+f).value=typeof savedHeader[f]==='string'?savedHeader[f]:defaults[f];
   editor();render();notify('Top 3 theo tổng điểm; đồng hạng 1,1,3 và lấy đầy đủ học sinh ở hạng ≤ 3. Bỏ môn vắng, vi phạm bị loại và môn chưa có điểm; điểm 0 được tính. Học sinh chưa có môn hợp lệ không xếp hạng.','info');
  }catch(error){if(token===request){clear();notify(error.message,'error');}}finally{$('top-students-load').disabled=false;}
 };
 $('top-students-groups').onclick=e=>{const b=e.target.closest('button');if(!b||!payload)return;if(b.hasAttribute('data-top-add')){groups.push([]);groupNames.push('');}else if(b.hasAttribute('data-top-delete')){groups.splice(Number(b.dataset.topDelete),1);groupNames.splice(Number(b.dataset.topDelete),1);}else return;changed();};
 $('top-students-groups').onchange=e=>{const el=e.target;if(!payload)return;if(el.dataset.topName!=null){groupNames[Number(el.dataset.topName)]=String(el.value||'').trim().slice(0,80);changed();return;}const i=Number(el.dataset.topGroup),code=el.dataset.class;if(el.dataset.topGroup==null||!groups[i])return;if(el.checked){if(groups.some((g,j)=>j!==i&&g.includes(code))){editor();return;}groups[i].push(code);}else groups[i]=groups[i].filter(c=>c!==code);changed();};
 for(const f of headerFields)if($('top-header-'+f))$('top-header-'+f).oninput=()=>{if(!payload)return;try{globalThis.localStorage?.setItem(storageKey()+':header',JSON.stringify(reportHeader()));}catch{}render();};
 $('top-students-pdf').onclick=()=>{
  try{const content=body(),win=createPrintFrame();win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Top 3 học sinh</title><style>@page{size:A4 portrait;margin:10mm}body{margin:0} ${topTemplateCss}</style></head><body>${content}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);win.document.close();}catch(error){clear();notify(error.message,'error');}
 };
 $('top-students-excel').onclick=()=>{
  try{const result=blocks(),wb=window.XLSX.utils.book_new(),table=topReportTable(result,reportHeader()),ws=window.XLSX.utils.aoa_to_sheet(table.rows);styleTopReportWorksheet(ws,table,window.XLSX);window.XLSX.utils.book_append_sheet(wb,ws,'Top 3');window.XLSX.writeFile(wb,`top-3-${payload.exam.id}.xlsx`);}catch(error){clear();notify(error.message,'error');}
 };
 return {invalidate:clear,refresh(){if(key&&key!==context())clear();}};
}
