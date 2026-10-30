import {inspectSheet,buildTemplatePlan,writeWorkbookArchive,colIndex,normalized} from './template-export-core.js?v=200';
const labels={mid1:'Giữa HKI',end1:'Cuối HKI',mid2:'Giữa HKII',end2:'Cuối HKII'};
const codes=['TOAN','VAN','LY','HOA','SINH','SU','DIA','KTPL','N1','N2','N3','N4','N5','N6','N7','ANH','TIN','CN','CONGNGHE','GDKT','GDDP','GDQP','GDKTPL'];
export function wireTemplateExport({state,$,esc,message,subjectName}){
 let files=[],mappings=[],plan=null,previewContext='',previewSources='',busy=false,revision=0;
 const notify=(s,type='info')=>message($('template-export-message'),s,type);
 const settings=()=>({overwrite:!!$('template-export-overwrite').checked,includeAbsent:!!$('template-export-absent').checked,decimals:$('template-export-decimals').value});
 const context=()=>JSON.stringify([state.selectedExam,state.statisticsRevision||0,revision,$('template-export-period').value,settings(),mappings.map(({enabled,subject,target,idColumn,classColumn,classCode,firstRow})=>({enabled,subject,target,idColumn,classColumn,classCode,firstRow}))]);
 function invalidate(){plan=null;previewContext='';$('template-export-write').disabled=true;$('template-export-final').checked=false;$('template-export-preview').innerHTML='';}
 function reset(){revision++;files=[];mappings=[];invalidate();$('template-export-mappings').innerHTML='';$('template-export-mapping-confirm').checked=false;$('template-export-check').disabled=true;}
 function guard(){if(state.role!=='admin'||!state.selectedExam)throw new Error('Chọn kỳ thi với quyền Admin.');if(!['default','choice','subject'].includes(state.exams.find(e=>e.id===state.selectedExam)?.exam_mode))throw new Error('Chức năng hiện dùng kết quả kỳ mặc định/lựa chọn/theo môn; kỳ thủ công có nguồn điểm riêng.');if(!window.XLSX||!window.JSZip)throw new Error('Chưa tải thư viện Excel/ZIP. Tải lại trang.');}
 function safePath(file){const path=String(file.webkitRelativePath||file.name).replace(/\\/g,'/');if(path.startsWith('/')||path.split('/').some(p=>p==='..'||p==='.')||!path.toLowerCase().endsWith('.xlsx'))throw new Error('Đường dẫn tệp không hợp lệ.');return path;}
 async function action(fn){if(busy)return;busy=true;for(const id of ['template-export-read','template-export-check','template-export-write','template-export-files','template-export-period','template-export-overwrite','template-export-absent','template-export-decimals'])$(id).disabled=true;try{await fn();}catch(e){invalidate();notify(e.message,'error');}finally{busy=false;for(const id of ['template-export-read','template-export-files','template-export-period','template-export-overwrite','template-export-absent','template-export-decimals'])$(id).disabled=false;$('template-export-check').disabled=!mappings.some(m=>m.enabled);$('template-export-write').disabled=!plan;}}
 function renderMappings(){
  const option=(v,text,current)=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(text)}</option>`;
  const subjects=[...new Set([...codes,...mappings.map(m=>m.subject).filter(Boolean)])];
  $('template-export-mappings').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Dùng</th><th>Tệp / sheet</th><th>Thông tin mẫu</th><th>Môn nguồn</th><th>Cột điểm đích</th><th>Cột mã</th><th>Cột lớp</th><th>Lớp nếu không có cột</th><th>Dòng bắt đầu</th></tr></thead><tbody>${mappings.map((m,i)=>`<tr><td><input type="checkbox" data-map="${i}" data-field="enabled" ${m.enabled?'checked':''}></td><td>${esc(m.fileName)}<br><b>${esc(m.sheetName)}</b></td><td>${esc(m.metadata)}<br>${esc(m.subjectText)}<br><small>${esc(m.headers)}</small></td><td><select data-map="${i}" data-field="subject">${option('','Chọn môn',m.subject)}${subjects.map(code=>option(code,`${subjectName(code)} (${code})`,m.subject)).join('')}</select></td>${['target','idColumn','classColumn','classCode','firstRow'].map(field=>`<td><input data-map="${i}" data-field="${field}" value="${esc(m[field]??'')}" ${field==='firstRow'?'type="number" min="1" max="1048576"':'maxlength="'+(field==='classCode'?40:3)+'"'} style="min-width:65px;max-width:120px"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 }
 async function read(){
  guard();reset();const token=revision,examId=state.selectedExam,selected=Array.from($('template-export-files').files||[]).filter(f=>/\.xlsx$/i.test(f.name)&&!f.name.startsWith('~$'));
  if(!selected.length)throw new Error('Chọn thư mục chứa tệp .xlsx trước.');
  const seen=new Set(),loaded=[],maps=[];
  for(const file of selected){
   const path=safePath(file);if(seen.has(path))throw new Error('Tệp trùng đường dẫn.');seen.add(path);
   const bytes=await file.arrayBuffer(),wb=window.XLSX.read(bytes,{type:'array',cellFormula:true,cellDates:false,cellStyles:true});
   const fileIndex=loaded.length;loaded.push({path,bytes,wb});
   for(const sheetName of wb.SheetNames){if(normalized(sheetName)==='HUONGDAN')continue;const ws=wb.Sheets[sheetName],info=inspectSheet(ws,window.XLSX,$('template-export-period').value);maps.push({...info,ws,fileIndex,fileName:path,sheetName});}
  }
  if(token!==revision||examId!==state.selectedExam)return;
  files=loaded;mappings=maps;renderMappings();notify(`Đã đọc ${files.length} tệp, ${mappings.length} sheet. Kiểm tra môn, cột điểm, cột mã và lớp từng sheet; sửa trực tiếp nếu cần. Năm/học kỳ của mẫu chỉ tham chiếu, không tự sửa tiêu đề hoặc chặn do khác kỳ thi. Chưa ghi dữ liệu.`);
 }
 async function getSources(){
  const examId=state.selectedExam;
  const sources={};for(const code of [...new Set(mappings.filter(m=>m.enabled).map(m=>m.subject))]){
   if(!code)throw new Error('Có sheet chưa chọn môn nguồn.');
   const {data,error}=await state.client.rpc('exam_get_subject_results',{p_exam_id:examId,p_subject_code:code});if(error)throw new Error(`${code}: ${error.message}`);
   sources[code]=[...(data||[])].sort((a,b)=>String(a.candidate_id).localeCompare(String(b.candidate_id)));
  }return sources;
 }
 function table(headers,rows){return `<div class="table-wrap" style="max-height:360px;overflow:auto"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
 async function preview(){
  guard();invalidate();if(!$('template-export-mapping-confirm').checked)throw new Error('Xác nhận đã kiểm tra môn/cột đích trước khi xem trước.');
  if(!mappings.some(m=>m.enabled))throw new Error('Chọn ít nhất một sheet.');
  for(const m of mappings.filter(m=>m.enabled)){
   for(const field of ['target','idColumn','classColumn']){m[field]=String(m[field]||'').trim().toUpperCase();if(m[field])colIndex(m[field]);}
   if(Number(m.firstRow)<2||Number(m.firstRow)>m.lastRow)throw new Error(`${m.sheetName}: dòng bắt đầu ngoài vùng học sinh.`);
  }
  const captured=context(),sources=await getSources();if(captured!==context())return;
  plan=buildTemplatePlan(mappings,sources,settings());previewContext=captured;previewSources=JSON.stringify(sources);
  $('template-export-preview').innerHTML=`<p><b>${plan.writes.length} ô dự kiến ghi</b>; ${plan.issues.length} mục giữ nguyên/cần đối chiếu. Không sửa tiêu đề, dữ liệu học sinh hoặc các cột khác. Điểm nguồn là kết quả môn đã ghép (điểm gốc, chưa áp dụng xử lý vi phạm); không dùng điểm thống kê hay tổng các môn.</p>`+table(['Tệp','Sheet','Môn','Cột','Sẽ ghi','Giữ nguyên / lỗi'],plan.summary.map(s=>[s.file,s.sheet,s.subject,s.target,s.writes,s.skipped]))+`<h4>Chi tiết ô sẽ ghi (tối đa 200 dòng hiển thị)</h4>`+table(['Tệp','Sheet','Ô','Mã định danh','Điểm cũ','Điểm mới'],plan.writes.slice(0,200).map(w=>[files[w.fileIndex].path,w.sheetName,w.address,w.id,w.old,w.score]))+`<h4>Đối chiếu (tối đa 200 dòng; báo cáo ZIP chứa đầy đủ)</h4>`+table(['Tệp','Sheet','Môn','Ô','Mã','Trạng thái'],plan.issues.slice(0,200).map(i=>[i.file,i.sheet,i.subject,i.cell,i.id,i.status]));
  notify('Xem trước hoàn tất. Chỉ các ô hợp lệ trong danh sách sẽ được ghi; các dòng lỗi/không khớp được giữ nguyên. Chưa tạo tệp kết quả.');
 }
 function csv(records,headers){const q=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';return '\ufeff'+[headers,...records].map(r=>r.map(q).join(',')).join('\r\n');}
 async function write(){
  guard();if(!plan||previewContext!==context())throw new Error('Dữ liệu/lựa chọn đã đổi; kiểm tra lại trước khi ghi.');
  if(!$('template-export-final').checked)throw new Error('Tích xác nhận tạo tệp theo bản xem trước.');
  if(!plan.writes.length)throw new Error('Không có ô hợp lệ cần ghi.');
  const captured=context(),current=await getSources();if(captured!==context()||JSON.stringify(current)!==previewSources)throw new Error('Điểm nguồn đã thay đổi. Hãy xem trước lại.');
  const confirmed=plan,zip=new window.JSZip();
  for(let i=0;i<files.length;i++){
   const writes=confirmed.writes.filter(w=>w.fileIndex===i);
   const bytes=writes.length?await writeWorkbookArchive(files[i].bytes,writes,window.JSZip):files[i].bytes;
   zip.file('ket-qua/'+files[i].path,bytes);
  }
  zip.file('bao-cao/doi-chieu.csv',csv(confirmed.issues.map(r=>[r.file,r.sheet,r.subject,r.cell,r.id,r.status,r.old,r.score]),['Tệp','Sheet','Môn','Ô','Mã','Trạng thái','Điểm cũ','Điểm nguồn']));
  zip.file('bao-cao/o-da-ghi.csv',csv(confirmed.writes.map(w=>[files[w.fileIndex].path,w.sheetName,w.subject,w.address,w.id,w.old,w.score]),['Tệp','Sheet','Môn','Ô','Mã','Điểm cũ','Điểm mới']));
  zip.file('bao-cao/lua-chon.txt',JSON.stringify({exam_id:state.selectedExam,period:labels[$('template-export-period').value],settings:settings(),mapping:mappings.map(({ws,...m})=>m),created_at:new Date().toISOString()},null,2));
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});if(captured!==context()||plan!==confirmed||!$('template-export-final').checked||!$('template-export-mapping-confirm').checked)throw new Error('Ngữ cảnh hoặc xác nhận đã thay đổi, không tải tệp cũ.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`diem-csdl-${state.selectedExam}-${$('template-export-period').value}.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);invalidate();notify('Đã tạo ZIP kết quả và báo cáo. Tệp nguồn và CSDL không bị thay đổi.','success');
 }
 $('template-export-read').onclick=()=>action(read);$('template-export-check').onclick=()=>action(preview);$('template-export-write').onclick=()=>action(write);
 $('template-export-mappings').onchange=e=>{const el=e.target,m=mappings[Number(el.dataset.map)];if(!m||!el.dataset.field)return;m[el.dataset.field]=el.dataset.field==='enabled'?el.checked:el.value;revision++;invalidate();$('template-export-mapping-confirm').checked=false;};
 $('template-export-files').onchange=reset;
 for(const id of ['template-export-period','template-export-overwrite','template-export-absent','template-export-decimals'])$(id).onchange=()=>{revision++;invalidate();$('template-export-mapping-confirm').checked=false;};
 $('template-export-mapping-confirm').onchange=()=>{if(!$('template-export-mapping-confirm').checked)invalidate();};
 return {invalidate(){reset();},refresh(){if(previewContext&&previewContext!==context())invalidate();}};
}
