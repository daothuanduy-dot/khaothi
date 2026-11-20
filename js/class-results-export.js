// v0.1.317: class results export; compact subjects come from per-class exam configuration (read-only).
export function wireClassResultsExport({state, $, esc, message}) {
  // v0.1.396: two independent print/export report modes, sourced from per-exam component configuration.
  const subjectNames={TOAN:'Toán',VAN:'Ngữ văn',N1:'Tiếng Anh',ANH:'Tiếng Anh',LY:'Vật lí',HOA:'Hóa học',SU:'Lịch sử',DIA:'Địa lí',KTPL:'GDKT&PL',GDKTPL:'GDKT&PL',SINH:'Sinh học',TIN:'Tin học'};
  let codes=['VAN','TOAN','N1','LY','HOA','SINH','SU','DIA','KTPL','TIN'], chosen=new Set(codes), payload=null, loadedExam='';
  const subjectAlias={ANH:'N1',GDKTPL:'KTPL'};
  const normalizeCode=c=>subjectAlias[String(c||'').toUpperCase()]||String(c||'').toUpperCase();
  const exportKey='exam-class-results-export-v0.1.314';
  try {const cfg=JSON.parse(localStorage.getItem(exportKey)||'{}');if(Array.isArray(cfg.codes)&&cfg.codes.length===codes.length&&new Set(cfg.codes).size===codes.length&&cfg.codes.every(c=>codes.includes(c)))codes=cfg.codes;if(Array.isArray(cfg.chosen))chosen=new Set(cfg.chosen.filter(c=>codes.includes(c)));}catch(_e){}
  const saveExport=()=>{try{localStorage.setItem(exportKey,JSON.stringify({codes,chosen:[...chosen],layout:$('class-results-layout').value,includeId:$('class-results-identifier').checked}));}catch(_e){}};
  const $subject=$('class-results-subjects');
  const reportModeKey='exam-class-results-report-mode-v0.1.396';
  let reportMode=localStorage.getItem(reportModeKey)==='components'?'components':'total';
  const rosterOptions=document.createElement('fieldset');rosterOptions.innerHTML='<legend>Danh sách học sinh xuất Excel/PDF</legend><label style="margin-right:16px"><input type="checkbox" data-roster-total> Tính tổng điểm/TB</label><label><input type="checkbox" data-roster-rank> Xếp hạng (Lớp / Ban)</label>';
  rosterOptions.style.cssText='margin:10px 0;padding:10px;border:1px solid #cbd5e1';
  $subject.parentNode.insertBefore(rosterOptions,$subject);
  const withTotal=()=>rosterOptions.querySelector('[data-roster-total]').checked;
  const withRank=()=>rosterOptions.querySelector('[data-roster-rank]').checked;
  const modeControl=document.createElement('label');
  modeControl.style.cssText='display:block;margin:10px 0;font-weight:600';
  modeControl.innerHTML='Mẫu bảng điểm <select data-report-mode style="margin-left:8px;padding:7px"><option value="total">Tổng hợp — điểm tổng từng môn</option><option value="components">Chi tiết — thành phần và điểm tổng từng môn</option></select>';
  $subject.parentNode.insertBefore(modeControl,$subject);
  const modeSelect=modeControl.querySelector('select');modeSelect.value=reportMode;
  modeSelect.addEventListener('change',()=>{reportMode=modeSelect.value;localStorage.setItem(reportModeKey,reportMode);if(payload)preview();});
  // Per-browser print preferences; no DB changes.
  const configKey='exam-class-results-print-v0.1.298'; // Retain v0.1.298 saved settings
  const defaults={font:'Arial',size:11,paper:'A4',orientation:'landscape',nameWidth:26,sbdWidth:13,dobWidth:14,subjectWidth:9,nameSize:11,sbdSize:11,nameAlign:'left',sbdAlign:'center',nameBold:'normal',sbdBold:'normal',marginTop:10,marginRight:10,marginBottom:10,marginLeft:10,bodyRowHeight:8};
  let printConfig={...defaults};
  try {const saved=JSON.parse(localStorage.getItem(configKey)||'{}');for(const k of Object.keys(defaults))if(Object.prototype.hasOwnProperty.call(saved,k))printConfig[k]=saved[k];}catch(_e){}
  // Independent title preferences: do not modify existing print layout preferences.
  const titleKey='exam-class-results-title-v0.1.380';
  const titleDefaults={mode:'auto',text:'TRƯỜNG THPT LÊ HỒNG PHONG\nKẾT QUẢ KIỂM TRA GIỮA HỌC KỲ I\nNĂM HỌC 2026 - 2027'};
  let titleConfig={...titleDefaults};
  try {const saved=JSON.parse(localStorage.getItem(titleKey)||'{}');if(['auto','replace','above'].includes(saved.mode))titleConfig.mode=saved.mode;if(typeof saved.text==='string')titleConfig.text=saved.text;}catch(_e){}
  function saveTitle(){try{localStorage.setItem(titleKey,JSON.stringify(titleConfig));}catch(_e){}}
  function titleLines(exam,cls){
    const year=exam?.school_year||exam?.school_year_name||exam?.academic_year||'';
    const grade=exam?.grade||exam?.grade_level||String(cls).match(/^\d+/)?.[0]||'';
    const original=`KẾT QUẢ ${exam?.name||''} — KHỐI ${grade} — LỚP ${cls}${year?' — NĂM HỌC '+year:''}`;
    if(titleConfig.mode==='auto'||!titleConfig.text.trim())return [original];
    const custom=titleConfig.text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/\{LOP\}/gi,cls).replace(/\{KY_THI\}/gi,exam?.name||''));
    if(titleConfig.mode==='replace')return [...custom,`LỚP ${cls}`];
    return [...custom,original];
  }
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
  const titleControls=document.createElement('fieldset');
  titleControls.style.cssText='margin:12px 0;padding:12px;border:1px solid #cbd5e1;border-radius:10px;display:grid;gap:9px';
  titleControls.innerHTML=`<legend style="font-weight:700">Tùy chỉnh tiêu đề biểu mẫu</legend>
    <label>Kiểu tiêu đề <select data-title-mode style="max-width:100%;padding:6px"><option value="auto">Tiêu đề tự động (mẫu cũ)</option><option value="above">Bổ sung phía trên, giữ tiêu đề kỳ thi và lớp</option><option value="replace">Thay thế tiêu đề cũ (vẫn hiển thị lớp)</option></select></label>
    <label>Nội dung tiêu đề (mỗi dòng là một dòng in)<textarea data-title-text rows="3" style="display:block;width:100%;min-height:80px;padding:8px;box-sizing:border-box"></textarea></label>
    <small style="color:#64748b">Có thể dùng {LOP} và {KY_THI}. Tiêu đề được áp dụng khi In / lưu PDF; cấu hình chỉ lưu trên trình duyệt này.</small>
    <div><button type="button" class="btn btn-light" data-reset-title>Khôi phục tiêu đề mẫu</button></div>
    <div data-title-preview style="white-space:pre-line;text-align:center;font-weight:700;border:1px dashed #cbd5e1;padding:10px"></div>`;
  const titleModeEl=titleControls.querySelector('[data-title-mode]');
  const titleTextEl=titleControls.querySelector('[data-title-text]');
  const titlePreviewEl=titleControls.querySelector('[data-title-preview]');
  function syncTitle(){titleModeEl.value=titleConfig.mode;titleTextEl.value=titleConfig.text;renderTitlePreview();}
  function renderTitlePreview(){const exam=state.exams.find(e=>e.id===examId());const cls=$('class-results-class').value||'12A1';titlePreviewEl.textContent=titleLines(exam,cls).join('\n');}
  titleModeEl.addEventListener('change',()=>{titleConfig.mode=titleModeEl.value;saveTitle();renderTitlePreview();});
  titleTextEl.addEventListener('input',()=>{titleConfig.text=titleTextEl.value;saveTitle();renderTitlePreview();});
  titleControls.querySelector('[data-reset-title]').addEventListener('click',()=>{titleConfig={...titleDefaults};saveTitle();syncTitle();});
  const previewEl=$('class-results-preview');
  const options=document.createElement('div');options.innerHTML='<label style="display:inline-flex;gap:8px;align-items:center;margin:8px 0"><input id="class-results-identifier" type="checkbox"> Xuất kèm Mã định danh Bộ GDĐT</label><p style="font-size:12px;color:#64748b;margin:4px 0">Mẫu rút gọn chỉ xuất môn đã cấu hình cho từng lớp trong kỳ thi. Không phụ thuộc dữ liệu nhóm SBD lưu trên trình duyệt.</p>';
  $subject.parentNode.insertBefore(options,$subject);
  try{const saved=JSON.parse(localStorage.getItem(exportKey)||'{}');$('class-results-identifier').checked=!!saved.includeId;if(['detail','compact'].includes(saved.layout))$('class-results-layout').value=saved.layout;}catch(_e){}
  $('class-results-identifier').addEventListener('change',()=>{saveExport();if(payload)preview();});
  previewEl.parentNode.insertBefore(titleControls,previewEl);
  previewEl.parentNode.insertBefore(controls,previewEl);
  syncTitle();
  function syncControls(){controls.querySelectorAll('[data-print-key]').forEach(el=>{el.value=printConfig[el.dataset.printKey]});}
  function saveConfig(){try{localStorage.setItem(configKey,JSON.stringify(printConfig));}catch(_e){}}
  controls.addEventListener('change',e=>{const k=e.target.dataset.printKey;if(!k)return;const numeric=['size','nameWidth','sbdWidth','dobWidth','subjectWidth','nameSize','sbdSize','marginTop','marginRight','marginBottom','marginLeft','bodyRowHeight'].includes(k);const n=Number(e.target.value);if(numeric&&(!Number.isFinite(n)||n<0))return;if(k.startsWith('margin')&&n>50)return;if(k==='bodyRowHeight'&&(n<5||n>30))return;printConfig[k]=numeric?n:e.target.value;saveConfig();});
  controls.querySelector('[data-reset-print]').addEventListener('click',()=>{printConfig={...defaults};saveConfig();syncControls();});
  syncControls();
  function colWidths(count){return [9,...($('class-results-identifier').checked?[22]:[]),Number(printConfig.sbdWidth),Number(printConfig.nameWidth),Number(printConfig.dobWidth),...Array(count).fill(Number(printConfig.subjectWidth)),...(withTotal()?[14,12]:[]),...(withRank()?[12,12]:[])];}
  function printColWidths(cls){return colWidths(reportColumns(cls).length);}
  function reportColumns(cls){const result=[];for(const code of subjectCodesForClass(cls)){if(reportMode==='components'){const components=payload.components.get(code)||[];if(!components.length)throw Error(`Môn ${code} chưa có cấu hình thành phần điểm trong exam_score_components; không thể in mẫu chi tiết.`);for(const component of components)result.push({code,component,label:`${subjectNames[code]||code} - ${component.component_name||component.name||('TP '+component.component_no)}`});}result.push({code,label:subjectNames[code]||code});}return result;}
  function scoreCell(c,col){const code=col.code;const configured=payload.classSubjects.get(c.class_code);if(!configured?.has(code))return '';if(col.component){const key=`${c.id}|${code}|${col.component.id}`;return payload.componentScores.get(key)??'';}return payload.scores[code]?.get(c.id)?.total_score??'';}
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
    const configured=payload.classSubjects.get(cls);
    if(!configured?.size)throw Error(`Lớp ${cls} chưa có cấu hình môn thi. Không thể xuất rút gọn.`);
    const visible=selectedCodes().filter(code=>configured.has(code));
    if(!visible.length)throw Error(`Lớp ${cls} không có môn nào trùng với các môn đang chọn. Hãy chọn thêm môn phù hợp.`);
    return visible;
  }
  function headers(cls){return ['STT',...(includeId()?['Mã định danh Bộ GDĐT']:[]),'SBD','Họ và tên','Ngày sinh',...reportColumns(cls).map(x=>x.label),...(withTotal()?['Tổng','TB']:[]),...(withRank()?['Lớp','Ban']:[])];}
  function values(c,i,cls){const r=[i+1,...(includeId()?[studentId(c)]:[]),sbd(c),c.student_name||'',date(c.date_of_birth??c.birth_date)];for(const col of reportColumns(cls))r.push(scoreCell(c,col));const aggregate=payload?.ranked?.get(c.id);if(withTotal())r.push(aggregate?.total??'',aggregate?.average??'');if(withRank())r.push(aggregate?.rankClass??'',aggregate?.rankBan??'');return r;}
  function updateRanks(){
    if(!payload)return;
    const exam=state.exams.find(e=>e.id===loadedExam);
    if(exam?.exam_mode!=='default'){payload.ranked=new Map();return;}
    let banGroups=[];
    try{const saved=JSON.parse(localStorage.getItem(`class-report-rank-groups:${loadedExam}`)||'[]');if(Array.isArray(saved))banGroups=saved.filter(Array.isArray);}catch(_e){}
    const banFor=cls=>{const idx=banGroups.findIndex(g=>g.includes(cls));if(idx>=0)return `configured:${idx}`;
      const m=String(cls).match(/^(\d+)[A-Za-z]+(\d+)$/);return m?`${m[1]}:${Number(m[2])<=6?'1-6':'7-12'}`:null;};
    const ranked=new Map();
    for(const c of payload.candidates){const codes=[...(payload.countedSubjects.get(c.class_code)||[])];
      const points=codes.map(code=>payload.scores[code]?.get(c.id)?.total_score);
      const valid=codes.length>0&&points.every(v=>v!=null&&Number.isFinite(Number(v)));
      const total=valid?points.reduce((a,v)=>a+Number(v),0):null;
      ranked.set(c.id,{...c,total,average:valid?total/codes.length:null,rankClass:null,rankBan:null});}
    const rank=(key,field)=>{const groups=new Map();for(const s of ranked.values()){const g=key(s);if(!g||s.total==null)continue;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(s);}
      for(const arr of groups.values()){arr.sort((a,b)=>b.total-a.total||String(a.sbd||'').localeCompare(String(b.sbd||'')));let pos=0,prev=null;arr.forEach((s,i)=>{if(i===0||s.total!==prev)pos=i+1;s[field]=pos;prev=s.total;});}};
    rank(s=>s.class_code,'rankClass');rank(s=>banFor(s.class_code),'rankBan');payload.ranked=ranked;
  }
  function grouped(){const groups=new Map();for(const c of rows()){const key=c.class_code||'Chưa phân lớp';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}return groups;}
  function preview(){if(!payload)return;try{if(payload.loadedReportMode!==reportMode){previewEl.textContent='Đã đổi mẫu in. Nhấn Đọc dữ liệu để tải điểm thành phần phù hợp.';return;}const groups=grouped(), first=[...groups][0];if(!first){previewEl.innerHTML='<p>Không có học sinh thuộc lớp đã chọn.</p>';return;}const [cls,list]=first;const h=headers(cls);previewEl.innerHTML=`<p>${rows().length} học sinh · ${reportMode==='components'?'Đầy đủ thành phần và tổng điểm':'Chỉ tổng điểm'} · ${includeId()?'Có mã định danh':'Không có mã định danh'} · ${subjectCodesForClass(cls).length} môn ở lớp ${esc(cls)}</p><table><thead>${withRank()?`<tr>${h.slice(0,-2).map(x=>`<th rowspan="2">${esc(x)}</th>`).join('')}<th colspan="2">Xếp hạng</th></tr><tr><th>Lớp</th><th>Ban</th></tr>`:`<tr>${h.map(x=>`<th>${esc(x)}</th>`).join('')}</tr>`}</thead><tbody>${list.slice(0,30).map((c,i)=>`<tr>${values(c,i,cls).map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Hiển thị tối đa 30 dòng của lớp đầu tiên; xuất đầy đủ danh sách theo từng lớp.</p>`;}catch(e){previewEl.textContent=e.message;}}
  rosterOptions.addEventListener('change',()=>{if(payload)preview();});
  $('class-results-class').onchange=()=>{preview();renderTitlePreview();};$('class-results-layout').onchange=()=>{saveExport();preview();};
  async function readGroupAndSubjects(id,candidates){
    const classSubjects=new Map(),countedSubjects=new Map();let cfg=[];
    for(let from=0;;from+=750){const {data,error}=await state.client.from('exam_subject_class_configs').select('class_code,subject_code,is_counted').eq('exam_id',id).range(from,from+749);if(error)throw Error('Không đọc được cấu hình môn theo lớp: '+error.message);cfg.push(...(data||[]));if((data||[]).length<750)break;}
    for(const x of cfg){const code=normalizeCode(x.subject_code);if(!classSubjects.has(x.class_code))classSubjects.set(x.class_code,new Set());classSubjects.get(x.class_code).add(code);if(x.is_counted){if(!countedSubjects.has(x.class_code))countedSubjects.set(x.class_code,new Set());countedSubjects.get(x.class_code).add(code);}}
    return {classSubjects,countedSubjects,configuredClassCount:classSubjects.size};
  }
  $('class-results-read').onclick=async()=>{invalidate();const id=examId();if(!id){message($('class-results-message'),'Hãy chọn kỳ thi trước.','error');return;}const button=$('class-results-read');button.disabled=true;message($('class-results-message'),'Đang đọc danh sách và điểm các môn…','info');try{
    const exam=state.exams.find(e=>e.id===id);if(!exam)throw Error('Không tìm thấy kỳ thi đã chọn. Hãy tải lại danh sách kỳ thi.');
    const candidates=[];for(let from=0;;from+=750){const {data,error}=await state.client.from('exam_candidates').select('*').eq('exam_id',id).range(from,from+749);if(error)throw error;candidates.push(...(data||[]));if((data||[]).length<750)break;}
    if(!candidates.length)throw Error('Kỳ thi không có thí sinh.');
    const config=await readGroupAndSubjects(id,candidates);
    const scores={};const failures=[];for(const code of codes){const {data,error}=await state.client.rpc('exam_get_subject_results',{p_exam_id:id,p_subject_code:code});if(error){if(/chưa cấu hình|không có cấu hình/i.test(error.message||'')){failures.push(code);continue;}throw error;}scores[code]=new Map((data||[]).map(r=>[r.candidate_id,r]));}
    const components=new Map(),componentScores=new Map();
    if(reportMode==='components'){
      const defs=[];for(let from=0;;from+=750){const {data,error}=await state.client.from('exam_score_components').select('*').eq('exam_id',id).range(from,from+749);if(error)throw Error('Không đọc được cấu hình thành phần điểm: '+error.message);defs.push(...(data||[]));if((data||[]).length<750)break;}
      for(const row of defs){const code=normalizeCode(row.subject_code);if(!components.has(code))components.set(code,[]);components.get(code).push(row);}
      for(const arr of components.values())arr.sort((a,b)=>Number(a.component_no||0)-Number(b.component_no||0));
      for(let from=0;;from+=750){const {data,error}=await state.client.from('exam_candidate_component_scores').select('candidate_id,subject_code,component_id,score').eq('exam_id',id).range(from,from+749);if(error)throw Error('Không đọc được điểm thành phần: '+error.message);for(const row of data||[])componentScores.set(`${row.candidate_id}|${normalizeCode(row.subject_code)}|${row.component_id}`,row.score);if((data||[]).length<750)break;}
    }
    payload={candidates,scores,components,componentScores,loadedReportMode:reportMode,...config};loadedExam=id;updateRanks();const classes=[...new Set(candidates.map(c=>c.class_code).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));$('class-results-class').innerHTML='<option value="">Tất cả lớp</option>'+classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');$('class-results-xlsx').disabled=false;$('class-results-pdf').disabled=false;preview();renderTitlePreview();message($('class-results-message'),`Đã đọc ${candidates.length} học sinh, ${config.configuredClassCount} lớp có cấu hình môn. ${failures.length?'Môn chưa cấu hình điểm: '+failures.join(', '):''}`,'success');
  }catch(error){message($('class-results-message'),error.message||String(error),'error');}finally{button.disabled=false;}};
  function assertFresh(){if(!payload||loadedExam!==examId())throw Error('Kỳ thi đã thay đổi. Hãy đọc lại dữ liệu trước khi xuất.');if(payload.loadedReportMode!==reportMode)throw Error('Bạn đã đổi mẫu bảng điểm. Hãy nhấn Đọc dữ liệu lại trước khi in/xuất.');if(!selectedCodes().length)throw Error('Hãy chọn ít nhất một môn.');}
  function validateGroups(groups){if(!isCompact())return;for(const [cls] of groups)subjectCodesForClass(cls);}
  $('class-results-xlsx').onclick=()=>{try{assertFresh();if(!window.XLSX)throw Error('Chưa tải thư viện Excel.');const wb=XLSX.utils.book_new(),exam=state.exams.find(e=>e.id===loadedExam),groups=grouped();validateGroups(groups);for(const [cls,list] of groups){ensureSbd(list);const h=headers(cls),data=list.map((c,i)=>values(c,i,cls));const head=withRank()?[[...h.slice(0,-2),'Xếp hạng',''],[...Array(h.length-2).fill(''),'Lớp','Ban']]:[h];const sheet=XLSX.utils.aoa_to_sheet([[`KẾT QUẢ ${exam?.name||''} — LỚP ${cls}`],...head,...data]);if(withRank()){sheet['!merges']=[{s:{r:1,c:h.length-2},e:{r:1,c:h.length-1}},...Array.from({length:h.length-2},(_,c)=>({s:{r:1,c},e:{r:2,c}}))];}sheet['!pageSetup']={paperSize:9,orientation:'landscape',fitToWidth:1,fitToHeight:0};sheet['!cols']=printColWidths(cls).map(mm=>({wch:Math.max(9,Math.round(mm/2.2))}));for(let r=2+(withRank()?1:0);r<2+(withRank()?1:0)+data.length;r++){for(const j of [1,...(includeId()?[2]:[])]){const addr=XLSX.utils.encode_cell({r,c:j});if(sheet[addr])sheet[addr].t='s';}}XLSX.utils.book_append_sheet(wb,sheet,String(cls).replace(/[\\/?*\[\]:]/g,'').slice(0,31)||'Lop');}XLSX.writeFile(wb,`ket-qua-ve-lop-${reportMode==='components'?'thanh-phan':'tong-hop'}.xlsx`);}catch(e){message($('class-results-message'),e.message,'error');}};
  $('class-results-pdf').onclick=()=>{try{
    assertFresh();const exam=state.exams.find(e=>e.id===loadedExam);const groups=grouped();validateGroups(groups);for(const [,list] of groups)ensureSbd(list);
    const marginKeys=['marginTop','marginRight','marginBottom','marginLeft'];const margins=marginKeys.map(k=>Math.max(0,Math.min(50,Number(printConfig[k])||0)));const [mt,mr,mb,ml]=margins;
    const pageW=printConfig.paper==='A3'?(printConfig.orientation==='landscape'?420:297):(printConfig.orientation==='landscape'?297:210);
    const pageH=printConfig.paper==='A3'?(printConfig.orientation==='landscape'?297:420):(printConfig.orientation==='landscape'?210:297);
    const paperWidth=pageW-ml-mr;if(paperWidth<=0||pageH-mt-mb<=0)throw Error('Lề trang in không hợp lệ.');
    const sections=[...groups].map(([cls,list])=>{const h=headers(cls),widths=printColWidths(cls);if(widths.reduce((a,b)=>a+b,0)>paperWidth)throw Error(`Lớp ${cls}: tổng độ rộng các cột vượt khổ giấy. Hãy chọn A3, giảm độ rộng hoặc bớt môn.`);const nameIndex=includeId()?3:2,sbdIndex=includeId()?2:1;return `<section class="sheet"><div class="print-title">${titleLines(exam,cls).map(line=>`<div>${esc(line)}</div>`).join('')}</div><table><colgroup>${widths.map(mm=>`<col style="width:${mm}mm">`).join('')}</colgroup><thead>${withRank()?`<tr>${h.slice(0,-2).map(x=>`<th rowspan="2">${esc(x)}</th>`).join('')}<th colspan="2">Xếp hạng</th></tr><tr><th>Lớp</th><th>Ban</th></tr>`:`<tr>${h.map(x=>`<th>${esc(x)}</th>`).join('')}</tr>`}</thead><tbody>${list.map((c,i)=>`<tr>${values(c,i,cls).map((x,j)=>`<td class="${j===nameIndex?'name':j===sbdIndex?'sbd':''}">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;}).join('');
    const w=window.open('','_blank');if(!w)throw Error('Trình duyệt chặn cửa sổ in. Hãy cho phép pop-up.');
    const font=['Arial','Times New Roman','Tahoma'].includes(printConfig.font)?printConfig.font:'Arial';const fontSize=Math.min(16,Math.max(8,Number(printConfig.size)||11));const nameSize=Math.min(18,Math.max(8,Number(printConfig.nameSize)||fontSize));const sbdSize=Math.min(18,Math.max(8,Number(printConfig.sbdSize)||fontSize));const nameAlign=['left','center','right'].includes(printConfig.nameAlign)?printConfig.nameAlign:'left';const sbdAlign=['left','center','right'].includes(printConfig.sbdAlign)?printConfig.sbdAlign:'center';const nameWeight=printConfig.nameBold==='bold'?'bold':'normal';const sbdWeight=printConfig.sbdBold==='bold'?'bold':'normal';const orientation=printConfig.orientation==='portrait'?'portrait':'landscape';const paper=printConfig.paper==='A3'?'A3':'A4';const bodyRowHeight=Math.min(30,Math.max(5,Number(printConfig.bodyRowHeight)||8));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Kết quả về lớp</title><style>@page{size:${paper} ${orientation};margin:${mt}mm ${mr}mm ${mb}mm ${ml}mm}*{box-sizing:border-box}body{font:${fontSize}pt "${font}",sans-serif;color:#111;margin:0}table{border-collapse:collapse;table-layout:fixed;width:auto;max-width:100%}td,th{border:1px solid #444;padding:4px 3px;text-align:center;vertical-align:middle;overflow-wrap:anywhere}td.name{text-align:${nameAlign};font-size:${nameSize}pt;font-weight:${nameWeight}}td.sbd{text-align:${sbdAlign};font-size:${sbdSize}pt;font-weight:${sbdWeight};white-space:nowrap}tbody tr{height:${bodyRowHeight}mm}tbody td{height:${bodyRowHeight}mm}th{font-weight:700}.print-title{text-align:center;font-size:${fontSize+1}pt;font-weight:700;margin:0 0 10px;break-inside:avoid;page-break-inside:avoid}.print-title div{margin:0 0 2px}.sheet{break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}</style></head><body>${sections}</body></html>`);w.document.close();w.focus();w.print();
  }catch(e){message($('class-results-message'),e.message,'error');}};
  renderChoices();return {invalidate};
}
