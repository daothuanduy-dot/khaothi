// v0.1.299: isolated, read-only class results export. No database mutations.
export function wireClassResultsExport({state, $, esc, message}) {
  const subjectNames={TOAN:'Toán',VAN:'Ngữ văn',N1:'Tiếng Anh',ANH:'Tiếng Anh',LY:'Vật lí',HOA:'Hóa học',SU:'Lịch sử',DIA:'Địa lí',KTPL:'GDKT&PL',GDKTPL:'GDKT&PL',SINH:'Sinh học',TIN:'Tin học'};
  let codes=['VAN','TOAN','N1','LY','HOA','SINH','SU','DIA','KTPL','TIN'], chosen=new Set(codes), payload=null, loadedExam='';
  const subjectAlias={ANH:'N1',GDKTPL:'KTPL'};
  const normalizeCode=c=>subjectAlias[String(c||'').toUpperCase()]||String(c||'').toUpperCase();
  const exportKey='exam-class-results-export-v0.1.314';
  try {const cfg=JSON.parse(localStorage.getItem(exportKey)||'{}');if(Array.isArray(cfg.codes)&&cfg.codes.length===codes.length&&new Set(cfg.codes).size===codes.length&&cfg.codes.every(c=>codes.includes(c)))codes=cfg.codes;if(Array.isArray(cfg.chosen))chosen=new Set(cfg.chosen.filter(c=>codes.includes(c)));}catch(_e){}
  const saveExport=()=>{try{localStorage.setItem(exportKey,JSON.stringify({codes,chosen:[...chosen],layout:$('class-results-layout').value,includeId:$('class-results-identifier').checked}));}catch(_e){}};
  const $subject=$('class-results-subjects');
  // Per-browser print preferences; no DB changes.
  const configKey='exam-class-results-print-v0.1.298'; // Retain v0.1.298 saved settings
  const defaults={font:'Arial',size:11,paper:'A4',orientation:'landscape',nameWidth:26,sbdWidth:13,dobWidth:14,subjectWidth:9,nameSize:11,sbdSize:11,nameAlign:'left',sbdAlign:'center',nameBold:'normal',sbdBold:'normal',marginTop:10,marginRight:10,marginBottom:10,marginLeft:10,bodyRowHeight:8};
  let printConfig={...defaults};
  try {const saved=JSON.parse(localStorage.getItem(configKey)||'{}');for(const k of Object.keys(defaults))if(Object.prototype.hasOwnProperty.call(saved,k))printConfig[k]=saved[k];}catch(_e){}
  const controls=document.createElement('fieldset');
  controls.style.cssText='margin:12px 0;padding:12px;border:1px solid #cbd5e1;border-radius:10px;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
  controls.innerHTML=`<legend style="font-weight:700">Cấu hình in kết quả về lớp</legend>
    <label>Font chữ <select data-print-key="font"><option>Arial</option><option>Times New Roman</option><option>Tahoma</option></select></label>
    <label>Cỡ chữ (pt) <input data-print-key="size" type="number" min="8" max="16" step="1" style="width:65px"></label>
    <label>Khổ giấy <select data-print-key="paper"><option>A4</option><option>A3</option></select></label>
    <label>Hướng giấy <select data-print-key="orientation"><option value="landscape">Ngang</option><option value="portrait">Dọc</option></select></label>
    <label>Họ tên (mm) <input data-print-key="nameWidth" type="number" min="25" max="75" step="1" style="width:65px"></label>
    <label>SBD (mm) <input data-print-key="sbdWidth" type="number" min="10" max="25" step="1" style="width:65px"></label>
    <label>Cỡ chữ họ tên (pt) <input data-print-key="nameSize" type="number" min="8" max="18" step="1" style="width:65px"></label>
    <label>Cỡ chữ SBD (pt) <input data-print-key="sbdSize" type="number" min="8" max="18" step="1" style="width:65px"></label>
    <label>Căn họ tên <select data-print-key="nameAlign"><option value="left">Trái</option><option value="center">Giữa</option><option value="right">Phải</option></select></label>
    <label>Căn SBD <select data-print-key="sbdAlign"><option value="left">Trái</option><option value="center">Giữa</option><option value="right">Phải</option></select></label>
    <label>Họ tên <select data-print-key="nameBold"><option value="normal">Chữ thường</option><option value="bold">In đậm</option></select></label>
    <label>SBD <select data-print-key="sbdBold"><option value="normal">Chữ thường</option><option value="bold">In đậm</option></select></label>
    <label>Ngày sinh (mm) <input data-print-key="dobWidth" type="number" min="12" max="25" step="1" style="width:65px"></label>
    <label>Môn thi (mm) <input data-print-key="subjectWidth" type="number" min="8" max="25" step="1" style="width:65px"></label>
    <label>Lề trên (mm) <input data-print-key="marginTop" type="number" min="0" max="50" step="1" style="width:65px"></label>
    <label>Lề phải (mm) <input data-print-key="marginRight" type="number" min="0" max="50" step="1" style="width:65px"></label>
    <label>Lề dưới (mm) <input data-print-key="marginBottom" type="number" min="0" max="50" step="1" style="width:65px"></label>
    <label>Lề trái (mm) <input data-print-key="marginLeft" type="number" min="0" max="50" step="1" style="width:65px"></label>
    <label>Chiều cao hàng dữ liệu (mm) <input data-print-key="bodyRowHeight" type="number" min="5" max="30" step="0.5" style="width:70px"></label>
    <button type="button" class="btn btn-light" data-reset-print>Khôi phục mặc định</button>
    <small style="flex-basis:100%;color:#64748b">Các cột môn thi có độ rộng bằng nhau. Cấu hình được lưu trên trình duyệt này; nếu bảng quá rộng, hãy chọn A3 hoặc giảm số môn in.</small>`;
  const previewEl=$('class-results-preview');
  const options=document.createElement('div');options.innerHTML='<label style="display:inline-flex;gap:8px;align-items:center;margin:8px 0"><input id="class-results-identifier" type="checkbox"> Xuất kèm Mã định danh Bộ GDĐT</label><p style="font-size:12px;color:#64748b;margin:4px 0">Mẫu rút gọn chỉ xuất các môn đã cấu hình cho lớp thuộc nhóm xếp SBD. Môn được chọn nhưng không thuộc cấu hình lớp sẽ tự ẩn.</p>';
  $subject.parentNode.insertBefore(options,$subject);
  try{const saved=JSON.parse(localStorage.getItem(exportKey)||'{}');$('class-results-identifier').checked=!!saved.includeId;if(['detail','compact'].includes(saved.layout))$('class-results-layout').value=saved.layout;}catch(_e){}
  $('class-results-identifier').addEventListener('change',()=>{saveExport();if(payload)preview();});
  previewEl.parentNode.insertBefore(controls,previewEl);
  function syncControls(){controls.querySelectorAll('[data-print-key]').forEach(el=>{el.value=printConfig[el.dataset.printKey]});}
  function saveConfig(){try{localStorage.setItem(configKey,JSON.stringify(printConfig));}catch(_e){}}
  controls.addEventListener('change',e=>{const k=e.target.dataset.printKey;if(!k)return;const numeric=['size','nameWidth','sbdWidth','dobWidth','subjectWidth','nameSize','sbdSize','marginTop','marginRight','marginBottom','marginLeft','bodyRowHeight'].includes(k);const n=Number(e.target.value);if(numeric&&(!Number.isFinite(n)||n<0))return;if(k.startsWith('margin')&&n>50)return;if(k==='bodyRowHeight'&&(n<5||n>30))return;printConfig[k]=numeric?n:e.target.value;saveConfig();});
  controls.querySelector('[data-reset-print]').addEventListener('click',()=>{printConfig={...defaults};saveConfig();syncControls();});
  syncControls();
  function colWidths(count){return [9,...($('class-results-identifier').checked?[22]:[]),Number(printConfig.sbdWidth),Number(printConfig.nameWidth),Number(printConfig.dobWidth),...Array(count).fill(Number(printConfig.subjectWidth))];}
  function colgroup(count){return '<colgroup>'+colWidths(count).map(mm=>`<col style="width:${mm}mm">`).join('')+'</colgroup>';}
  function ensureSbd(list){if(list.some(c=>!sbd(c)))throw Error('Có học sinh chưa được đánh SBD. Vui lòng kiểm tra dữ liệu SBD của kỳ thi trước khi in.');}

  function renderChoices(){ $subject.innerHTML=codes.map((code,i)=>`<label style="display:inline-flex;align-items:center;gap:6px;margin:5px 12px 5px 0"><input type="checkbox" data-result-code="${code}" ${chosen.has(code)?'checked':''}> ${esc(subjectNames[code]||code)} <button type="button" class="btn btn-light" data-result-move="${code}" data-direction="-1" ${i===0?'disabled':''} aria-label="Chuyển ${code} lên">↑</button><button type="button" class="btn btn-light" data-result-move="${code}" data-direction="1" ${i===codes.length-1?'disabled':''} aria-label="Chuyển ${code} xuống">↓</button></label>`).join(''); }
  function invalidate(){payload=null;loadedExam='';$('class-results-xlsx').disabled=true;$('class-results-pdf').disabled=true;$('class-results-preview').innerHTML='';}
  $subject.addEventListener('change',e=>{const code=e.target.dataset.resultCode;if(!code)return;e.target.checked?chosen.add(code):chosen.delete(code);saveExport();if(payload)preview();});
  $subject.addEventListener('click',e=>{const btn=e.target.closest('[data-result-move]');if(!btn)return;const i=codes.indexOf(btn.dataset.resultMove),j=i+Number(btn.dataset.direction);if(j<0||j>=codes.length)return;[codes[i],codes[j]]=[codes[j],codes[i]];renderChoices();saveExport();if(payload)preview();});
  const selectedCodes=()=>codes.filter(c=>chosen.has(c));
  function examId(){return $('forms-exam').value||state.selectedExam||'';}
  function rows(){const cls=$('class-results-class').value;return (payload?.candidates||[]).filter(c=>!cls||c.class_code===cls).sort((a,b)=>String(a.class_code).localeCompare(String(b.class_code),'vi',{numeric:true})||String(a.student_name).localeCompare(String(b.student_name),'vi'));}
  function date(v){if(!v)return '';const t=String(v);return /^\d{4}-\d\d-\d\d/.test(t)?t.slice(8,10)+'/'+t.slice(5,7)+'/'+t.slice(0,4):t;}
  function sbd(c){return String(c.sbd??'');}
  const includeId=()=>$('class-results-identifier').checked;
  const isCompact=()=>$('class-results-layout').value==='compact';
  function studentId(c){return String(c.student_code??'');}
  function subjectCodesForClass(cls){
    if(!isCompact())return selectedCodes();
    if(!payload?.groupMap?.has(cls))throw Error(`Lớp ${cls} chưa thuộc nhóm lớp xếp SBD đã lưu. Vui lòng kiểm tra cấu hình nhóm.`);
    const configured=payload.classSubjects.get(cls);
    if(!configured?.size)throw Error(`Lớp ${cls} chưa có cấu hình môn thi. Không thể xuất rút gọn.`);
    return selectedCodes().filter(code=>configured.has(code));
  }
  function headers(cls){return ['STT',...(includeId()?['Mã định danh Bộ GDĐT']:[]),'SBD','Họ và tên','Ngày sinh',...subjectCodesForClass(cls).map(c=>subjectNames[c]||c)];}
  function values(c,i,cls){const r=[i+1,...(includeId()?[studentId(c)]:[]),sbd(c),c.student_name||'',date(c.date_of_birth??c.birth_date)];for(const code of subjectCodesForClass(cls)){const item=payload.scores[code]?.get(c.id);r.push(item?.total_score??'');}return r;}
  function grouped(){const groups=new Map();for(const c of rows()){const key=c.class_code||'Chưa phân lớp';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}return groups;}
  function preview(){if(!payload)return;try{const groups=grouped(), first=[...groups][0];if(!first){previewEl.innerHTML='<p>Không có học sinh thuộc lớp đã chọn.</p>';return;}const [cls,list]=first;const h=headers(cls);previewEl.innerHTML=`<p>${rows().length} học sinh · ${isCompact()?'Mẫu rút gọn theo nhóm lớp':'Mẫu chi tiết'} · ${includeId()?'Có mã định danh':'Không có mã định danh'} · ${subjectCodesForClass(cls).length} môn ở lớp ${esc(cls)}</p><table><thead><tr>${h.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${list.slice(0,30).map((c,i)=>`<tr>${values(c,i,cls).map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Hiển thị tối đa 30 dòng của lớp đầu tiên; xuất đầy đủ danh sách theo từng lớp.</p>`;}catch(e){previewEl.textContent=e.message;}}
  $('class-results-class').onchange=preview;$('class-results-layout').onchange=()=>{saveExport();preview();};
  function parseGroups(text){return String(text||'').split(/\r?\n/).map(line=>line.split(/[,;]/).map(c=>c.trim()).filter(Boolean)).filter(g=>g.length);}
  async function readGroupAndSubjects(id,candidates){
    const classSubjects=new Map();let cfg=[];
    for(let from=0;;from+=750){const {data,error}=await state.client.from('exam_subject_class_configs').select('class_code,subject_code').eq('exam_id',id).range(from,from+749);if(error)throw Error('Không đọc được cấu hình môn theo lớp: '+error.message);cfg.push(...(data||[]));if((data||[]).length<750)break;}
    for(const x of cfg){const code=normalizeCode(x.subject_code);if(!classSubjects.has(x.class_code))classSubjects.set(x.class_code,new Set());classSubjects.get(x.class_code).add(code);}
    const groupMap=new Map();let raw='';try{raw=localStorage.getItem('sbd-groups:'+id)||'';}catch(_e){}
    if(!raw&&$('sbd-groups')?.dataset.examId===id)raw=$('sbd-groups').value;
    const groups=parseGroups(raw);
    for(let i=0;i<groups.length;i++)for(const cls of groups[i]){if(groupMap.has(cls))throw Error('Lớp '+cls+' bị khai báo trùng nhóm SBD.');groupMap.set(cls,i);}
    return {classSubjects,groupMap,groupCount:groups.length};
  }
  $('class-results-read').onclick=async()=>{invalidate();const id=examId();if(!id){message($('class-results-message'),'Hãy chọn kỳ thi trước.','error');return;}const button=$('class-results-read');button.disabled=true;message($('class-results-message'),'Đang đọc danh sách và điểm các môn…','info');try{
    const exam=state.exams.find(e=>e.id===id);if(exam?.exam_mode&&exam.exam_mode!=='default')throw Error('Chức năng này dành cho kỳ thi mặc định.');
    const candidates=[];for(let from=0;;from+=750){const {data,error}=await state.client.from('exam_candidates').select('*').eq('exam_id',id).range(from,from+749);if(error)throw error;candidates.push(...(data||[]));if((data||[]).length<750)break;}
    if(!candidates.length)throw Error('Kỳ thi không có thí sinh.');
    const config=await readGroupAndSubjects(id,candidates);
    const scores={};const failures=[];for(const code of codes){const {data,error}=await state.client.rpc('exam_get_subject_results',{p_exam_id:id,p_subject_code:code});if(error){if(/chưa cấu hình|không có cấu hình/i.test(error.message||'')){failures.push(code);continue;}throw error;}scores[code]=new Map((data||[]).map(r=>[r.candidate_id,r]));}
    payload={candidates,scores,...config};loadedExam=id;const classes=[...new Set(candidates.map(c=>c.class_code).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));$('class-results-class').innerHTML='<option value="">Tất cả lớp</option>'+classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');$('class-results-xlsx').disabled=false;$('class-results-pdf').disabled=false;preview();message($('class-results-message'),`Đã đọc ${candidates.length} học sinh, ${config.groupCount} nhóm SBD. ${failures.length?'Môn chưa cấu hình điểm: '+failures.join(', '):''}`,'success');
  }catch(error){message($('class-results-message'),error.message||String(error),'error');}finally{button.disabled=false;}};
  function assertFresh(){if(!payload||loadedExam!==examId())throw Error('Kỳ thi đã thay đổi. Hãy đọc lại dữ liệu trước khi xuất.');if(!selectedCodes().length)throw Error('Hãy chọn ít nhất một môn.');}
  function validateGroups(groups){if(!isCompact())return;for(const [cls] of groups){if(!payload.groupMap.has(cls))throw Error(`Lớp ${cls} chưa thuộc nhóm lớp xếp SBD đã lưu. Hãy cấu hình nhóm và đọc lại dữ liệu.`);subjectCodesForClass(cls);}}
  $('class-results-xlsx').onclick=()=>{try{assertFresh();if(!window.XLSX)throw Error('Chưa tải thư viện Excel.');const wb=XLSX.utils.book_new(),exam=state.exams.find(e=>e.id===loadedExam),groups=grouped();validateGroups(groups);for(const [cls,list] of groups){ensureSbd(list);const h=headers(cls),data=list.map((c,i)=>values(c,i,cls));const sheet=XLSX.utils.aoa_to_sheet([[`KẾT QUẢ ${exam?.name||''} — LỚP ${cls}`],h,...data]);sheet['!pageSetup']={paperSize:9,orientation:'landscape',fitToWidth:1,fitToHeight:0};sheet['!cols']=colWidths(subjectCodesForClass(cls).length).map(mm=>({wch:Math.max(9,Math.round(mm/2.2))}));for(let r=2;r<2+data.length;r++){for(const j of [1,...(includeId()?[2]:[])]){const addr=XLSX.utils.encode_cell({r,c:j});if(sheet[addr])sheet[addr].t='s';}}XLSX.utils.book_append_sheet(wb,sheet,String(cls).replace(/[\\/?*\[\]:]/g,'').slice(0,31)||'Lop');}XLSX.writeFile(wb,`ket-qua-ve-lop-${isCompact()?'rut-gon':'chi-tiet'}.xlsx`);}catch(e){message($('class-results-message'),e.message,'error');}};
  $('class-results-pdf').onclick=()=>{try{
    assertFresh();const exam=state.exams.find(e=>e.id===loadedExam);const groups=grouped();validateGroups(groups);for(const [,list] of groups)ensureSbd(list);
    const marginKeys=['marginTop','marginRight','marginBottom','marginLeft'];const margins=marginKeys.map(k=>Math.max(0,Math.min(50,Number(printConfig[k])||0)));const [mt,mr,mb,ml]=margins;
    const pageW=printConfig.paper==='A3'?(printConfig.orientation==='landscape'?420:297):(printConfig.orientation==='landscape'?297:210);
    const pageH=printConfig.paper==='A3'?(printConfig.orientation==='landscape'?297:420):(printConfig.orientation==='landscape'?210:297);
    const paperWidth=pageW-ml-mr;if(paperWidth<=0||pageH-mt-mb<=0)throw Error('Lề trang in không hợp lệ.');
    const sections=[...groups].map(([cls,list])=>{const h=headers(cls),widths=colWidths(subjectCodesForClass(cls).length);if(widths.reduce((a,b)=>a+b,0)>paperWidth)throw Error(`Lớp ${cls}: tổng độ rộng các cột vượt khổ giấy. Hãy chọn A3, giảm độ rộng hoặc bớt môn.`);const nameIndex=includeId()?3:2,sbdIndex=includeId()?2:1;return `<section class="sheet"><h3>KẾT QUẢ ${esc(exam?.name||'')} — LỚP ${esc(cls)}</h3><table><colgroup>${widths.map(mm=>`<col style="width:${mm}mm">`).join('')}</colgroup><thead><tr>${h.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${list.map((c,i)=>`<tr>${values(c,i,cls).map((x,j)=>`<td class="${j===nameIndex?'name':j===sbdIndex?'sbd':''}">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;}).join('');
    const w=window.open('','_blank');if(!w)throw Error('Trình duyệt chặn cửa sổ in. Hãy cho phép pop-up.');
    const font=['Arial','Times New Roman','Tahoma'].includes(printConfig.font)?printConfig.font:'Arial';const fontSize=Math.min(16,Math.max(8,Number(printConfig.size)||11));const nameSize=Math.min(18,Math.max(8,Number(printConfig.nameSize)||fontSize));const sbdSize=Math.min(18,Math.max(8,Number(printConfig.sbdSize)||fontSize));const nameAlign=['left','center','right'].includes(printConfig.nameAlign)?printConfig.nameAlign:'left';const sbdAlign=['left','center','right'].includes(printConfig.sbdAlign)?printConfig.sbdAlign:'center';const nameWeight=printConfig.nameBold==='bold'?'bold':'normal';const sbdWeight=printConfig.sbdBold==='bold'?'bold':'normal';const orientation=printConfig.orientation==='portrait'?'portrait':'landscape';const paper=printConfig.paper==='A3'?'A3':'A4';const bodyRowHeight=Math.min(30,Math.max(5,Number(printConfig.bodyRowHeight)||8));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Kết quả về lớp</title><style>@page{size:${paper} ${orientation};margin:${mt}mm ${mr}mm ${mb}mm ${ml}mm}*{box-sizing:border-box}body{font:${fontSize}pt "${font}",sans-serif;color:#111;margin:0}table{border-collapse:collapse;table-layout:fixed;width:auto;max-width:100%}td,th{border:1px solid #444;padding:4px 3px;text-align:center;vertical-align:middle;overflow-wrap:anywhere}td.name{text-align:${nameAlign};font-size:${nameSize}pt;font-weight:${nameWeight}}td.sbd{text-align:${sbdAlign};font-size:${sbdSize}pt;font-weight:${sbdWeight};white-space:nowrap}tbody tr{height:${bodyRowHeight}mm}tbody td{height:${bodyRowHeight}mm}th{font-weight:700}h3{text-align:center;font-size:${fontSize+1}pt;margin:0 0 10px}.sheet{break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}</style></head><body>${sections}</body></html>`);w.document.close();w.focus();w.print();
  }catch(e){message($('class-results-message'),e.message,'error');}};
  renderChoices();return {invalidate};
}
