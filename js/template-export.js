import {inspectSheet,buildTemplatePlan,colIndex,normalized} from './template-export-core.js?v=412';
import {saveDirectFiles} from './template-direct-write.js?v=414';
const codes=['TOAN','VAN','LY','HOA','SINH','SU','DIA','KTPL','N1','N2','N3','N4','N5','N6','N7','ANH','TIN','CN','CONGNGHE','GDKT','GDDP','GDQP','GDKTPL'];
export function wireTemplateExport({state,$,esc,message,subjectName}){
 let files=[],mappings=[],plan=null,previewContext='',previewSources='',busy=false,revision=0,directory=null;
 const notify=(s,type='info')=>message($('template-export-message'),s,type);
 const folderButton=$('template-export-files');
 const folderPanel=document.createElement('div');
 folderPanel.id='template-export-folder-status';
 folderPanel.style.cssText='margin:10px 0 14px;max-width:720px';
 folderPanel.innerHTML='<label for="template-export-folder-name" style="display:block;font-weight:600;margin-bottom:5px">Thư mục Excel đã chọn</label><input id="template-export-folder-name" type="text" readonly value="Chưa chọn thư mục" aria-label="Tên thư mục Excel đã chọn" style="box-sizing:border-box;width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#334155"><div id="template-export-folder-detail" role="status" aria-live="polite" style="margin-top:5px;font-size:13px;color:#64748b">Chưa có quyền truy cập thư mục. Hãy nhấn “Chọn thư mục có quyền ghi”.</div>';
 folderButton.insertAdjacentElement('afterend',folderPanel);
 function folderStatus(detail){
  const name=$('template-export-folder-name'),note=$('template-export-folder-detail');
  name.value=directory?directory.name:'Chưa chọn thư mục';
  note.textContent=detail||(directory?'Đã chọn thư mục. Nhấn “1. Đọc và xác định cột/môn” để đọc tệp.':'Chưa chọn thư mục.');
 }

 const modeBox=document.createElement('div');
 modeBox.id='template-export-write-mode-wrap';
 modeBox.style.cssText='margin:12px 0;padding:12px;border:1px solid #cbd5e1;border-radius:8px';
 modeBox.innerHTML='<label for="template-export-write-mode" style="display:block;font-weight:600;margin-bottom:6px">Chế độ ghi điểm vào Excel</label><select id="template-export-write-mode" style="width:100%;max-width:520px;padding:9px;border:1px solid #cbd5e1;border-radius:6px"><option value="blank">Chỉ ghi vào ô trống (mặc định, an toàn)</option><option value="overwrite">Ghi bổ sung và ghi đè điểm đã có (không ghi đè công thức)</option></select><div style="font-size:13px;margin-top:6px;color:#64748b">Chế độ ghi đè chỉ cập nhật ô điểm số; ô công thức và dữ liệu không phải điểm vẫn bị chặn. Hãy sao lưu các tệp Excel trước khi ghi.</div>';
 $('template-export-read').insertAdjacentElement('beforebegin',modeBox);
 const settings=()=>({includeAbsent:!!$('template-export-absent').checked,decimals:$('template-export-decimals').value,writeMode:$('template-export-write-mode').value});
 const context=()=>JSON.stringify([state.selectedExam,state.statisticsRevision||0,revision,$('template-export-period').value,settings(),mappings.map(({enabled,subject,target,idColumn,classColumn,classCode,firstRow})=>({enabled,subject,target,idColumn,classColumn,classCode,firstRow}))]);
 function invalidate(){plan=null;previewContext='';$('template-export-write').disabled=true;$('template-export-final').checked=false;$('template-export-preview').innerHTML='';}
 function reset(){revision++;files=[];mappings=[];invalidate();$('template-export-mappings').innerHTML='';$('template-export-mapping-confirm').checked=false;$('template-export-check').disabled=true;}
 function guard(){if(state.role!=='admin'||!state.selectedExam)throw new Error('Chọn kỳ thi với quyền Admin.');if(!['default','choice','subject'].includes(state.exams.find(e=>e.id===state.selectedExam)?.exam_mode))throw new Error('Chức năng hiện dùng kết quả kỳ mặc định/lựa chọn/theo môn; kỳ thủ công có nguồn điểm riêng.');if(!window.XLSX||!window.JSZip)throw new Error('Chưa tải thư viện Excel/ZIP. Tải lại trang.');}
 function safePath(file){const path=String(file.webkitRelativePath||file.name).replace(/\\/g,'/');if(path.startsWith('/')||path.split('/').some(p=>p==='..'||p==='.')||!path.toLowerCase().endsWith('.xlsx'))throw new Error('Đường dẫn tệp không hợp lệ.');return path;}
 async function action(fn){if(busy)return;busy=true;for(const id of ['template-export-read','template-export-check','template-export-write','template-export-files','template-export-period','template-export-absent','template-export-decimals','template-export-write-mode'])$(id).disabled=true;try{await fn();}catch(e){if(e?.name==='AbortError'){folderStatus(directory?'Đã hủy chọn lại; vẫn giữ thư mục trước đó.':'Đã hủy chọn thư mục.');notify('Đã hủy chọn thư mục; thư mục đã chọn trước đó (nếu có) vẫn được giữ nguyên.','info');}else{invalidate();folderStatus(directory?'Thư mục đã chọn vẫn được giữ. Thao tác vừa rồi thất bại: '+(e?.message||String(e)):'Chưa chọn được thư mục: '+(e?.message||String(e)));notify(e?.message||String(e),'error');}}finally{busy=false;for(const id of ['template-export-read','template-export-files','template-export-period','template-export-absent','template-export-decimals','template-export-write-mode'])$(id).disabled=false;$('template-export-check').disabled=!mappings.some(m=>m.enabled);$('template-export-write').disabled=!plan;}}
 function renderMappings(){
  const option=(v,text,current)=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(text)}</option>`;
  const subjects=[...new Set([...codes,...mappings.map(m=>m.subject).filter(Boolean)])];
  $('template-export-mappings').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Dùng</th><th>Tệp / sheet</th><th>Thông tin mẫu</th><th>Môn nguồn</th><th>Cột điểm đích</th><th>Cột mã</th><th>Cột lớp</th><th>Lớp nếu không có cột</th><th>Dòng bắt đầu</th></tr></thead><tbody>${mappings.map((m,i)=>`<tr><td><input type="checkbox" data-map="${i}" data-field="enabled" ${m.enabled?'checked':''}></td><td>${esc(m.fileName)}<br><b>${esc(m.sheetName)}</b></td><td>${esc(m.metadata)}<br>${esc(m.subjectText)}<br><small>${esc(m.headers)}</small></td><td><select data-map="${i}" data-field="subject">${option('','Chọn môn',m.subject)}${subjects.map(code=>option(code,`${subjectName(code)} (${code})`,m.subject)).join('')}</select></td>${['target','idColumn','classColumn','classCode','firstRow'].map(field=>`<td><input data-map="${i}" data-field="${field}" value="${esc(m[field]??'')}" ${field==='firstRow'?'type="number" min="1" max="1048576"':'maxlength="'+(field==='classCode'?40:3)+'"'} style="min-width:65px;max-width:120px"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 }
 async function selectDirectory(){
  guard();
  if(typeof window.showDirectoryPicker!=='function')throw new Error('Cần Chrome/Edge trên HTTPS hoặc localhost để chọn thư mục có quyền ghi.');
  // Must be invoked directly during a user gesture, before any await.
  const selected=await window.showDirectoryPicker({mode:'readwrite'});
  if(typeof selected.queryPermission==='function'){
    let permission=await selected.queryPermission({mode:'readwrite'});
    if(permission!=='granted' && typeof selected.requestPermission==='function')
      permission=await selected.requestPermission({mode:'readwrite'});
    if(permission!=='granted')throw new Error('Chưa được cấp quyền đọc/ghi thư mục.');
  }
  directory=selected;
  reset();
  folderStatus('Đã chọn và cấp quyền đọc/ghi thư mục. Chưa đọc các tệp Excel.');
  notify('Đã chọn thư mục: '+directory.name+'. Nhấn “1. Đọc và xác định cột/môn” để quét các tệp Excel.','success');
 }
 async function read(){
  guard();
  if(!directory)throw new Error('Chưa chọn thư mục. Hãy nhấn “Chọn thư mục có quyền ghi” trước.');
  if(typeof directory.queryPermission==='function'){
    let permission=await directory.queryPermission({mode:'readwrite'});
    if(permission!=='granted' && typeof directory.requestPermission==='function')
      permission=await directory.requestPermission({mode:'readwrite'});
    if(permission!=='granted')throw new Error('Thư mục chưa được cấp quyền đọc/ghi. Hãy chọn lại thư mục.');
  }
  folderStatus('Đang đọc các tệp Excel trong thư mục đã chọn…');
  reset();const token=revision,examId=state.selectedExam;
  const selected=[];
  async function walk(dir,prefix){for await(const [name,handle] of dir.entries()){if(handle.kind==='directory')await walk(handle,prefix+name+'/');else if(/\.xlsx$/i.test(name)&&!name.startsWith('~$')){const file=await handle.getFile();selected.push({file,handle,path:prefix+name});}}}
  await walk(directory,directory.name+'/');
  if(!selected.length)throw new Error('Thư mục không có tệp .xlsx.');
  const seen=new Set(),loaded=[],maps=[];
  for(const item of selected){
   const file=item.file,path=safePath({name:item.path});if(seen.has(path))throw new Error('Tệp trùng đường dẫn.');seen.add(path);
   const bytes=await file.arrayBuffer(),wb=window.XLSX.read(bytes,{type:'array',cellFormula:true,cellDates:false,cellStyles:true});
   const fileIndex=loaded.length;loaded.push({path,bytes,wb,handle:item.handle});
   for(const sheetName of wb.SheetNames){if(normalized(sheetName)==='HUONGDAN')continue;const ws=wb.Sheets[sheetName],info=inspectSheet(ws,window.XLSX,$('template-export-period').value);maps.push({...info,detectedFirstRow:info.firstRow,ws,fileIndex,fileName:path,sheetName});}
  }
  if(token!==revision||examId!==state.selectedExam)return;
  files=loaded;mappings=maps;renderMappings();folderStatus(`Đã đọc ${files.length} tệp Excel, ${mappings.length} sheet. Thư mục vẫn được giữ để xem trước/ghi.`);notify(`Đã đọc ${files.length} tệp, ${mappings.length} sheet. Kiểm tra môn, cột điểm, cột mã và lớp từng sheet; sửa trực tiếp nếu cần. Năm/học kỳ của mẫu chỉ tham chiếu, không tự sửa tiêu đề hoặc chặn do khác kỳ thi. Chưa ghi dữ liệu.`);
 }
 async function getSources(){
  const examId=state.selectedExam;
  const sources={};for(const code of [...new Set(mappings.filter(m=>m.enabled).map(m=>m.subject))]){
   if(!code)throw new Error('Có sheet chưa chọn môn nguồn.');
    const {data,error}=await state.client.rpc('exam_get_official_class_subject_results_for_template',{p_exam_id:examId,p_subject_code:code});if(error)throw new Error(`${code}: ${error.message} (cần SQL v0.1.410)`);
   sources[code]=[...(data||[])].map(r=>({...r,total_score:r.official_total_score})).sort((a,b)=>String(a.candidate_id).localeCompare(String(b.candidate_id)));
  }return sources;
 }
 function table(headers,rows){return `<div class="table-wrap" style="max-height:360px;overflow:auto"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
 async function preview(){
  guard();invalidate();if(!$('template-export-mapping-confirm').checked)throw new Error('Xác nhận đã kiểm tra môn/cột đích trước khi xem trước.');
  if(!mappings.some(m=>m.enabled))throw new Error('Chọn ít nhất một sheet.');
  for(const m of mappings.filter(m=>m.enabled)){
   for(const field of ['target','idColumn','classColumn']){m[field]=String(m[field]||'').trim().toUpperCase();if(m[field])colIndex(m[field]);}
   const start=Number(m.firstRow);
   if(!Number.isInteger(start)||start<2||start>m.lastRow){
    throw new Error(`${m.sheetName}: dòng bắt đầu ${m.firstRow} không nằm trong vùng học sinh (đến dòng ${m.lastRow}). Hãy sửa cột “Dòng bắt đầu” theo dòng có mã định danh học sinh đầu tiên trong Excel rồi kiểm tra lại.`);
   }
   if(m.detectedStudentRows===0)throw new Error(`${m.sheetName}: chưa xác định được dòng học sinh theo cột mã ${m.idColumn||'(trống)'}. Hãy kiểm tra cột mã và tệp mẫu.`);
  }
  const captured=context(),sources=await getSources();if(captured!==context())return;
  plan=buildTemplatePlan(mappings,sources,settings());previewContext=captured;previewSources=JSON.stringify(sources);
  $('template-export-preview').innerHTML=`<p><b>${plan.writes.length} ô dự kiến ghi</b> (trong đó ${plan.writes.filter(w=>w.overwrite).length} ô ghi đè điểm cũ); ${plan.issues.length} mục giữ nguyên/cần đối chiếu. Không sửa tiêu đề, dữ liệu học sinh hoặc các cột khác. Điểm nguồn là điểm chính thức sau xử lý vi phạm, có xét điểm phúc khảo hiện hành; không lọc theo môn lựa chọn.</p>`+table(['Tệp','Sheet','Môn','Cột','Sẽ ghi','Ghi đè','Giữ nguyên / lỗi'],plan.summary.map(s=>[s.file,s.sheet,s.subject,s.target,s.writes,s.overwrites,s.skipped]))+`<h4>Chi tiết ô sẽ ghi (tối đa 200 dòng hiển thị)</h4>`+table(['Tệp','Sheet','Ô','Mã định danh','Điểm cũ','Điểm mới','Thao tác'],plan.writes.slice(0,200).map(w=>[files[w.fileIndex].path,w.sheetName,w.address,w.id,w.old,w.score,w.overwrite?'Ghi đè':'Ghi ô trống']))+`<h4>Đối chiếu (đầy đủ, giữ nguyên các mục bị chặn)</h4>`+table(['Tệp','Sheet','Môn','Ô','Mã','Trạng thái'],plan.issues.map(i=>[i.file,i.sheet,i.subject,i.cell,i.id,i.status]));
  notify('Xem trước hoàn tất. Chỉ các ô hợp lệ trong danh sách sẽ được ghi; các dòng lỗi/không khớp được giữ nguyên. Chưa ghi vào tệp.');
 }
 async function write(){
  guard();if(!plan||previewContext!==context())throw new Error('Dữ liệu/lựa chọn đã đổi; kiểm tra lại trước khi ghi.');
  if(!$('template-export-final').checked)throw new Error('Tích xác nhận ghi trực tiếp theo bản xem trước.');
  if(!plan.writes.length)throw new Error('Không có ô hợp lệ cần ghi. Hãy xem danh sách đối chiếu để biết các ô bị giữ nguyên hoặc không khớp.');
  if(settings().writeMode==='overwrite'&&plan.writes.some(w=>w.overwrite)){if(!window.confirm(`Bạn sắp GHI ĐÈ ${plan.writes.filter(w=>w.overwrite).length} ô điểm đã có trong Excel. Hành động này thay đổi tệp gốc và không tạo bản sao. Bạn đã sao lưu và đồng ý tiếp tục?`))return;}
 const captured=context(),current=await getSources();
  if(captured!==context()||JSON.stringify(current)!==previewSources)throw new Error('Điểm nguồn đã thay đổi. Hãy xem trước lại.');
  const confirmed=plan,check=()=>{if(captured!==context()||plan!==confirmed||!$('template-export-final').checked||!$('template-export-mapping-confirm').checked)throw new Error('Ngữ cảnh/xác nhận đã thay đổi; dừng ghi.');};
  const saved=await saveDirectFiles(files,confirmed.writes,window.JSZip,{check,directory,onSaved:path=>notify('Đã ghi: '+path)});
  reset();notify('Đã ghi trực tiếp '+saved.length+' tệp trong thư mục đã chọn. Không tạo ZIP hoặc bản sao; CSDL không thay đổi. Đọc lại thư mục để kiểm tra kết quả.','success');
 }
 $('template-export-read').onclick=()=>action(read);$('template-export-check').onclick=()=>action(preview);$('template-export-write').onclick=()=>action(write);
 $('template-export-mappings').onchange=e=>{const el=e.target,m=mappings[Number(el.dataset.map)];if(!m||!el.dataset.field)return;m[el.dataset.field]=el.dataset.field==='enabled'?el.checked:el.value;revision++;invalidate();$('template-export-mapping-confirm').checked=false;};
 $('template-export-files').onclick=()=>action(selectDirectory);
 for(const id of ['template-export-period','template-export-absent','template-export-decimals','template-export-write-mode'])$(id).onchange=()=>{revision++;invalidate();$('template-export-mapping-confirm').checked=false;};
 $('template-export-mapping-confirm').onchange=()=>{if(!$('template-export-mapping-confirm').checked)invalidate();};
 return {invalidate(){reset();},refresh(){if(previewContext&&previewContext!==context())invalidate();}};
}
