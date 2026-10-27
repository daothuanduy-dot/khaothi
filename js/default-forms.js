const fields={stt:'STT',sbd:'Số báo danh',student_code:'Mã học sinh',student_name:'Họ và tên',date_of_birth:'Ngày sinh',gender:'Giới tính',class_code:'Lớp',room_code:'Phòng',blank:'Cột trống / ghi tay'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roomLabel=value=>String(value||'').replace(/^phòng\s*/i,'').trim();
const dateLabel=value=>/^\d{4}-\d{2}-\d{2}/.test(String(value||''))?String(value).slice(0,10).split('-').reverse().join('/'):String(value||'');
const titles={classrooms:'DANH SÁCH PHÒNG THI THEO LỚP',listing:'DANH SÁCH THÍ SINH PHÒNG THI',receipt:'PHIẾU THU BÀI'};
export function defaultTemplate(type){
 const keys=type==='receipt'?['stt','sbd','student_name','date_of_birth','class_code','blank','blank','blank','blank']:type==='classrooms'?['stt','sbd','student_name','date_of_birth','gender','room_code','blank']:['stt','sbd','student_name','date_of_birth','gender','class_code','blank'];
 const blanks=type==='receipt'?['Mã đề','Số tờ','Ký nộp','Ghi chú']:['Ghi chú'];let n=0;
 return {title:titles[type],font:'Times New Roman',size:10,columns:keys.map(key=>({key,label:key==='blank'?blanks[n++]:fields[key],width:key==='student_name'?26:key==='stt'?5:12}))};
}
export function normalizeDefaultTemplate(raw,type){
 const base=defaultTemplate(type);if(!raw)return base;
 if(!Array.isArray(raw.columns)||!raw.columns.length||raw.columns.length>30)throw new Error('Mẫu cần từ 1 đến 30 cột.');
 const size=Number(raw.size??10);if(!Number.isFinite(size)||size<8||size>24)throw new Error('Cỡ chữ phải từ 8 đến 24 pt.');
 const title=String(raw.title||'').trim();if(!title||title.length>240)throw new Error('Tên biểu mẫu phải có từ 1 đến 240 ký tự.');
 const columns=raw.columns.map(c=>{
  const label=String(c.label||'').trim(),width=Number(c.width);
  if(!Object.hasOwn(fields,c.key)||!label||label.length>100||!Number.isFinite(width)||width<1||width>100)throw new Error('Kiểm tra nguồn dữ liệu, tên và độ rộng cột (1–100).');
  return {key:c.key,label,width};
 });
 return {title,columns,size,font:['Times New Roman','Arial','Calibri','Tahoma'].includes(raw.font)?raw.font:base.font};
}
export function buildCommonRoomRoster(forms,sourceId){
 if(!sourceId)throw new Error('Chưa có phương án phòng chính thức. Hãy xếp và chốt phòng trước khi in.');
 const source=forms.finalizations.find(p=>p.id===sourceId);
 if(!source)throw new Error('Phương án phòng chung không còn trong kỳ/đợt đang chọn.');
 if(source.status&&source.status!=='official')throw new Error('Chỉ in từ phương án phòng đã chốt chính thức.');
 const byId=new Map();
 for(const a of forms.assignments.filter(a=>a.finalization_id===sourceId)){
  const id=String(a.candidate_id),old=byId.get(id);
  if(old&&old.room_code!==a.room_code)throw new Error('Một học sinh có nhiều phòng trong phương án đã chọn. Hãy kiểm tra phân phòng.');
  if(!old)byId.set(id,a);
 }
 const rows=forms.candidates.map(c=>{
  const a=byId.get(String(c.id));
  if(a?.sbd&&c.sbd&&String(a.sbd)!==String(c.sbd))throw new Error(`SBD hiện tại của ${c.student_name} khác phương án đã chốt. Hãy kiểm tra lại dữ liệu trước khi in.`);
  return {...c,candidate_id:c.id,room_code:a?.room_code||'',seat_number:a?.seat_number??null,sbd:a?.sbd||c.sbd||''};
 });
 const missing=rows.filter(c=>!c.room_code||!c.sbd);
 if(missing.length)throw new Error(`Còn ${missing.length} học sinh thiếu phòng hoặc SBD trong phương án đã chọn. Hãy chọn phương án phòng chung đầy đủ trước khi in.`);
 return rows.sort((a,b)=>String(a.room_code).localeCompare(String(b.room_code),'vi',{numeric:true})||Number(a.seat_number??0)-Number(b.seat_number??0)||String(a.sbd).localeCompare(String(b.sbd),'vi',{numeric:true}));
}
export function defaultFormPages(forms,sourceId,type,template,classFilter=''){
 template=normalizeDefaultTemplate(template,type);let rows=buildCommonRoomRoster(forms,sourceId);
 if(classFilter)rows=rows.filter(c=>c.class_code===classFilter);
 const groups=new Map(),key=type==='classrooms'?'class_code':'room_code';
 for(const row of rows){const value=row[key]||'Chưa có lớp';if(!groups.has(value))groups.set(value,[]);groups.get(value).push(row)}
 if(!groups.size)throw new Error('Không có học sinh phù hợp để in.');
 return [...groups].sort(([a],[b])=>a.localeCompare(b,'vi',{numeric:true})).map(([value,items])=>{
  if(type==='classrooms')items.sort((a,b)=>String(a.sbd).localeCompare(String(b.sbd),'vi',{numeric:true}));
  const heading=type==='classrooms'?`LỚP ${value}`:`PHÒNG ${roomLabel(value)}`;
  const data=items.map((row,index)=>template.columns.map(c=>c.key==='blank'?'':c.key==='stt'?index+1:c.key==='date_of_birth'?dateLabel(row.date_of_birth):c.key==='room_code'?roomLabel(row.room_code):row[c.key]??''));
  return {heading,rows:data,count:items.length,columns:template.columns,type,template};
 });
}
export function defaultPrintDocument(pages,header,{margins={top:8,right:8,bottom:8,left:8},print=false}={}){
 const margin=['top','right','bottom','left'].map(k=>{const n=Number(margins[k]??8);if(!Number.isFinite(n)||n<0||n>30)throw new Error('Lề in phải từ 0 đến 30 mm.');return n});
 const body=pages.map(p=>{
  const total=p.columns.reduce((s,c)=>s+c.width,0);
  const footer=p.type==='receipt'?`<div class="receipt-footer"><p>Số thí sinh: ${p.count} · Số thí sinh vắng: ............</p><p>SBD thí sinh vắng: ...................................................................</p><p>Tổng số bài: ................ · Tổng số tờ: ................</p><div class="signatures"><div>CÁN BỘ COI THI 1<br><i>(Ký, ghi rõ họ tên)</i></div><div>CÁN BỘ COI THI 2<br><i>(Ký, ghi rõ họ tên)</i></div></div></div>`:`<p>Tổng số học sinh: ${p.count}</p>`;
  return `<section style="font-family:'${escape(p.template.font)}',serif;font-size:${p.template.size}pt"><header><div><b>${escape(header.authority)}</b><br><b>${escape(header.institution)}</b></div><div><b>${escape(header.title)}</b><h3>${escape(p.template.title)}</h3><b>${escape(p.heading)}</b></div></header>${p.type==='receipt'?'<p class="subject-line">Môn thi: ............................................................</p>':''}<table><colgroup>${p.columns.map(c=>`<col style="width:${c.width/total*100}%">`).join('')}</colgroup><thead><tr>${p.columns.map(c=>`<th>${escape(c.label)}</th>`).join('')}</tr></thead><tbody>${p.rows.map(row=>`<tr>${row.map((cell,i)=>`<td${p.columns[i].key==='student_name'?' class="name"':''}>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>${footer}</section>`;
 }).join('');
 return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escape(header.title)}</title><style>@page{size:A4 portrait;margin:${margin.map(n=>n+'mm').join(' ')}}*{box-sizing:border-box}body{margin:0;color:#000;background:white}section{break-after:page;page-break-after:always}section:last-child{break-after:auto;page-break-after:auto}header{display:grid;grid-template-columns:1fr 1fr;gap:4mm;text-align:center;font-size:12pt;line-height:1.25;margin-bottom:3mm}h3{font-size:12pt;margin:1mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid black;padding:2px 3px;text-align:center;overflow-wrap:anywhere}td.name{text-align:left}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.receipt-footer{break-inside:avoid}.signatures{display:flex;justify-content:space-around;text-align:center;min-height:23mm}.subject-line{text-align:center}@media screen{body{padding:8mm}section{margin-bottom:12mm}}</style></head><body>${body}${print?'<script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script>':''}</body></html>`;
}
export function wireDefaultForms({$,state,message,createPrintFrame}){
 let forms=null,templates={},context='',storageWarning=false;
 const type=()=>$('forms-default-type').value||'receipt';
 const safe=fn=>()=>{try{fn()}catch(e){message($('forms-message'),e.message,'error')}};
 const examKey=()=>`default-form-templates:${forms?.examId||''}`;
 const unitKey=()=>{const unit=$('forms-institution').value.trim();if(!unit)throw new Error('Nhập tên đơn vị trước khi lưu hoặc áp dụng mẫu đơn vị.');return 'default-form-unit:'+unit};
 const readStorage=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
 const invalidate=()=>{$('forms-default-preview').innerHTML=''};
 function persist(){invalidate();try{localStorage.setItem(examKey(),JSON.stringify(templates))}catch{if(!storageWarning){storageWarning=true;message($('forms-message'),'Trình duyệt không lưu được mẫu cục bộ. Dùng Lưu thiết lập biểu mẫu để lưu vào CSDL.','info')}}}
 function render(){
  const t=templates[type()]||defaultTemplate(type());templates[type()]=t;
  $('forms-default-title').value=t.title;$('forms-default-font').value=t.font;$('forms-default-size').value=t.size;
  $('forms-default-columns').innerHTML=t.columns.map((c,i)=>`<tr><td><select data-default-field="${i}" aria-label="Nguồn dữ liệu cột ${i+1}">${Object.entries(fields).map(([key,label])=>`<option value="${key}" ${c.key===key?'selected':''}>${escape(label)}</option>`).join('')}</select></td><td><input data-default-label="${i}" value="${escape(c.label)}" maxlength="100" aria-label="Tên cột ${i+1}"></td><td><input data-default-width="${i}" type="number" min="1" max="100" value="${c.width}" aria-label="Độ rộng cột ${i+1}"></td><td><button type="button" data-default-up="${i}" ${i===0?'disabled':''}>↑</button> <button type="button" data-default-down="${i}" ${i===t.columns.length-1?'disabled':''}>↓</button> <button type="button" data-default-remove="${i}">Bỏ cột</button></td></tr>`).join('');
  invalidate();
 }
 function model(){
  if(!forms||forms.examId!==$('forms-exam').value||String(forms.roundNo)!==String($('forms-round').value))throw new Error('Kỳ/đợt đã đổi. Hãy tải lại dữ liệu biểu mẫu.');
  return defaultFormPages(forms,$('forms-default-source').value,type(),templates[type()],type()==='classrooms'?$('forms-class-filter').value:'');
 }
 const header=()=>({authority:$('forms-authority').value,institution:$('forms-institution').value,title:$('forms-title').value});
 const margins=()=>Object.fromEntries(['top','right','bottom','left'].map(k=>[k,$('forms-margin-'+k).value]));
 function print(){const pages=model(),markup=defaultPrintDocument(pages,header(),{margins:margins(),print:true}),win=createPrintFrame();win.document.write(markup);win.document.close()}
 function preview(){const pages=model();$('forms-default-preview').innerHTML='<iframe title="Xem trước bộ biểu mẫu" style="width:100%;height:650px;border:1px solid #cbd5e1" sandbox=""></iframe>';$('forms-default-preview').querySelector('iframe').srcdoc=defaultPrintDocument(pages,header(),{margins:margins()})}
 function excel(){
  const pages=model();if(!window.XLSX)throw new Error('Chưa tải được thư viện Excel.');
  const wb=window.XLSX.utils.book_new();
  pages.forEach((p,i)=>{
   const h=header(),rows=[[h.authority],[h.institution],[h.title],[p.template.title],[p.heading],...(p.type==='receipt'?[['Môn thi: ............................................................']]:[]),p.columns.map(c=>c.label),...p.rows];
   const ws=window.XLSX.utils.aoa_to_sheet(rows);ws['!cols']=p.columns.map(c=>({wch:c.width}));
   if(p.type==='receipt')window.XLSX.utils.sheet_add_aoa(ws,[['Tổng số bài: ............','Tổng số tờ: ............'],['Cán bộ coi thi 1','Cán bộ coi thi 2']],{origin:rows.length+1});
   window.XLSX.utils.book_append_sheet(wb,ws,`${i+1} ${p.heading}`.replace(/[\\/?*\[\]:]/g,' ').slice(0,31));
  });window.XLSX.writeFile(wb,'bieu-mau-phong-chung.xlsx');
 }
 $('forms-default-type').onchange=()=>{render();$('forms-class-filter-wrap').classList.toggle('hidden',type()!=='classrooms')};
 for(const id of ['forms-default-title','forms-default-font','forms-default-size'])$(id).oninput=()=>{const t=templates[type()];t.title=$('forms-default-title').value;t.font=$('forms-default-font').value;t.size=Number($('forms-default-size').value);persist()};
 $('forms-default-columns').onchange=event=>{const el=event.target,c=templates[type()].columns;for(const [attr,key] of [['defaultField','key'],['defaultLabel','label'],['defaultWidth','width']])if(el.dataset[attr]!==undefined)c[Number(el.dataset[attr])][key]=key==='width'?Number(el.value):el.value;persist()};
 $('forms-default-columns').onclick=event=>{const el=event.target.closest('button');if(!el)return;const columns=templates[type()].columns;for(const [attr,delta] of [['defaultUp',-1],['defaultDown',1]])if(el.dataset[attr]!==undefined){const i=Number(el.dataset[attr]),j=i+delta;if(j>=0&&j<columns.length)[columns[i],columns[j]]=[columns[j],columns[i]];persist();render();return}if(el.dataset.defaultRemove!==undefined){columns.splice(Number(el.dataset.defaultRemove),1);persist();render()}};
 $('forms-default-add').onclick=()=>{templates[type()].columns.push({key:'blank',label:'Ghi chú',width:12});persist();render()};
 $('forms-default-reset').onclick=()=>{templates[type()]=defaultTemplate(type());persist();render()};
 $('forms-default-source').onchange=()=>{invalidate();try{localStorage.setItem(`default-form-room-source:${forms.examId}:${forms.roundNo}`,$('forms-default-source').value)}catch{}};
 $('forms-default-preview-button').onclick=safe(preview);$('forms-default-print').onclick=safe(print);
 $('forms-default-save-unit').onclick=safe(()=>{localStorage.setItem(unitKey(),JSON.stringify(getSettings()));message($('forms-message'),'Đã lưu bộ mẫu cho đơn vị trên trình duyệt này.','success')});
 $('forms-default-apply-unit').onclick=safe(()=>{const saved=readStorage(unitKey());if(!saved)throw new Error('Chưa có mẫu đơn vị lưu trên trình duyệt này.');templates=Object.fromEntries(Object.keys(titles).map(k=>[k,normalizeDefaultTemplate(saved[k],k)]));persist();render()});
 function getSettings(){return Object.fromEntries(Object.keys(titles).map(k=>[k,normalizeDefaultTemplate(templates[k]||defaultTemplate(k),k)]))}
 return {print,preview,excel,getSettings,load(data){
  forms=data;const next=`${data.examId}:${data.roundNo}`;
  if(context!==next){context=next;const saved=readStorage(examKey())||data.exam.form_print_settings?.default_templates||{};templates={};for(const k of Object.keys(titles)){try{templates[k]=normalizeDefaultTemplate(saved[k],k)}catch{templates[k]=defaultTemplate(k)}}}
  const previous=$('forms-default-source').value;
  let preferred=data.exam.form_print_settings?.default_room_sources?.[String(data.roundNo)];
  try{preferred=localStorage.getItem(`default-form-room-source:${data.examId}:${data.roundNo}`)||preferred}catch{}
  $('forms-default-source').innerHTML=data.finalizations.map((p,i)=>`<option value="${escape(p.id)}">${i+1}. ${escape(p.subject_code||'Phương án phòng')} · ${escape(p.created_at||p.finalized_at||'')}</option>`).join('');
  if(data.finalizations.some(p=>p.id===preferred))$('forms-default-source').value=preferred;
  else if(data.finalizations.some(p=>p.id===previous))$('forms-default-source').value=previous;
  render();
 }};
}
