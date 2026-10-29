export function displayExamScore(value){return value==null||value===''?'':Number(value).toFixed(2)}
export function subjectResultStatus(row){
  if(row.is_absent)return row.total_score==null?'Vắng':'Vắng — có điểm bổ sung (không thống kê)';
  if(row.essay_missing&&row.mcq_missing)return 'Thiếu cả hai phần';
  if(row.essay_missing)return 'Thiếu tự luận';
  if(row.mcq_missing)return 'Thiếu trắc nghiệm';
  if(row.no_paper)return 'Không bài';
  return row.total_score==null?'Chưa đủ điểm':'Đủ điểm';
}
export function subjectStatisticsReason(row){
  return ({absent_excluded:'Loại: vắng',violation_excluded:'Loại: vi phạm',absent_zero:'Vắng tính 0',
    violation_zero:'Vi phạm: 0 điểm',missing_score:'Loại: chưa đủ điểm',violation_adjusted:'Vi phạm: trừ '+(row.deduction_percent??0)+'%',
    scored:'Tính thống kê'})[row.statistics_reason]||'';
}
// Keep printing in this tab. Reuse at most one off-screen document.
export function createPrintFrame(doc=document){
  doc.getElementById('exam-print-frame')?.remove();
  const frame=doc.createElement('iframe');
  frame.id='exam-print-frame';
  frame.title='Bản in';
  frame.setAttribute('aria-hidden','true');
  frame.tabIndex=-1;
  frame.style.cssText='position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;pointer-events:none';
  doc.body.appendChild(frame);
  const win=frame.contentWindow;
  if(!win){frame.remove();throw new Error('Không tạo được khung in. Hãy tải lại trang rồi thử lại.');}
  // Open before binding: document.open clears listeners on the print window.
  win.document.open();
  win.addEventListener('afterprint',()=>setTimeout(()=>frame.remove(),0),{once:true});
  return win;
}

export function groupReceiptRows(rows,electiveOrder=1){
  rows=[...rows];
  // Mandatory subjects share the fixed roster; prefer each subject's actual plan.
  for(const [source,target] of [['TOAN','VAN'],['VAN','TOAN']]){
    if(rows.some(row=>!row.subject_order&&row.subject_code===target))continue;
    rows.push(...rows.filter(row=>!row.subject_order&&row.subject_code===source).map(row=>({...row,subject_code:target})));
  }
  const groups=new Map();
  for(const row of rows){
    const order=Number(row.subject_order)||null;
    if(order&&order!==Number(electiveOrder))continue;
    const key=JSON.stringify([row.room_code,order,order?'':row.subject_code||'']);
    if(!groups.has(key))groups.set(key,{room:row.room_code,order,subject:order?'':row.subject_code||'',rows:[]});
    const group=groups.get(key);
    if(!group.rows.some(item=>String(item.candidate_id||item.id||item.sbd)===String(row.candidate_id||row.id||row.sbd)))group.rows.push(row);
  }
  return [...groups.values()].map(group=>({...group,rows:group.rows.sort((a,b)=>String(a.sbd||'').localeCompare(String(b.sbd||''),'vi',{numeric:true}))}));
}

export function mandatoryListingGroups(assignments){
  const groups=new Map();
  for(const row of assignments){
    if(!row.room_code||!(row.plan_type==='mandatory'||(row.plan_type==='subject'&&row.subject_type==='mandatory')))continue;
    const subject=row.subject_code||'';
    const key=String(row.room_code);
    if(!groups.has(key))groups.set(key,{subject,room:row.room_code,rows:[]});
    const group=groups.get(key);
    let item=group.rows.find(item=>String(item.candidate_id||item.id)===String(row.candidate_id||row.id));
    if(!item){item={...row,subject_codes:[]};group.rows.push(item)}
    if(subject&&!item.subject_codes.includes(subject))item.subject_codes.push(subject);
  }
  return [...groups.values()].sort((a,b)=>String(a.room).localeCompare(String(b.room),'vi',{numeric:true}))
    .map(group=>({...group,rows:group.rows.sort((a,b)=>String(a.sbd||'').localeCompare(String(b.sbd||''),'vi',{numeric:true}))}));
}

export function effectiveSlotRows(assignments){
 return assignments.flatMap(row=>row.plan_type==='elective'&&row.ca1_room_code&&row.ca2_room_code&&row.ca1_room_code!==row.ca2_room_code
  ?[{...row,room_code:row.ca1_room_code,ca2_subject_code:null},{...row,room_code:row.ca2_room_code,ca1_subject_code:null}]
  :[{...row,room_code:row.plan_type==='elective'?(row.ca1_room_code||row.room_code):row.room_code}]);
}
export function buildClassRoomRows(candidates,assignments,nameOf=code=>code){
  assignments=effectiveSlotRows(assignments);
  const byId=new Map();
  for(const row of assignments){
    const id=String(row.candidate_id),room=String(row.room_code||'').trim();
    if(!room)continue;
    if(!byId.has(id))byId.set(id,{mandatory:new Set(),elective:new Set(),mandatoryRooms:new Map(),mandatoryCodes:new Set(),electiveCodes:new Set()});
    const group=byId.get(id);
    const subject=String(row.subject_code||'').toUpperCase();
    const required=row.plan_type==='mandatory'||(row.plan_type==='subject'&&(row.subject_type==='mandatory'||(!row.subject_type&&['TOAN','VAN'].includes(subject))));
    const subjects=row.plan_type==='elective'?[row.ca1_subject_code,row.ca2_subject_code].filter(Boolean):[subject].filter(Boolean);
    const label=subjects.length?subjects.map(code=>nameOf(code)).join(' / ')+': '+room:room;
    group[required?'mandatory':'elective'].add(label);
    group[required?'mandatoryCodes':'electiveCodes'].add(room);
    if(required){
      if(!group.mandatoryRooms.has(room))group.mandatoryRooms.set(room,new Set());
      if(subject)group.mandatoryRooms.get(room).add(subject);
    }
  }
  return candidates.map(row=>{
    const rooms=byId.get(String(row.id));
    for(const [room,subjects] of rooms?.mandatoryRooms||[]){
      if(subjects.has('TOAN')&&subjects.has('VAN')){
        rooms.mandatory.delete(nameOf('TOAN')+': '+room);
        rooms.mandatory.delete(nameOf('VAN')+': '+room);
        rooms.mandatory.add('Toán/Ngữ văn: '+room);
      }
    }
    return {...row,mandatory_rooms:[...(rooms?.mandatory||[])].join('; ')||'Chưa phân phòng',elective_rooms:[...(rooms?.elective||[])].join('; ')||'Chưa phân phòng',mandatory_room_codes:[...(rooms?.mandatoryCodes||[])],elective_room_codes:[...(rooms?.electiveCodes||[])]};
  }).sort((a,b)=>String(a.class_code||'').localeCompare(String(b.class_code||''),'vi',{numeric:true})||String(a.sbd||'').localeCompare(String(b.sbd||''),'vi',{numeric:true}));
}

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE=500;

export function absenceSubjectValues(row){
  return [...row.querySelectorAll('[data-absence-subject]:checked')].map(control=>control.value);
}
export function absenceAllowedSubjects(exam,candidate,registrations,configs){
  const registered=registrations.filter(row=>String(row.candidate_id)===String(candidate.id)),classSubjects=configs.filter(row=>row.class_code===candidate.class_code);
  const rows=exam?.exam_mode==='subject'?registered:exam?.exam_mode==='choice'?[...classSubjects,...registered]:classSubjects;
  return [...new Set(rows.map(row=>String(row.subject_code||'').trim().toUpperCase()).filter(code=>code&&code!=='*'))].sort();
}

export function excelColumnIndex(value){
  const letters=String(value??'').trim().toUpperCase();
  if(!/^[A-Z]{1,3}$/.test(letters))throw new Error('Cột Excel phải là chữ cái từ A đến XFD.');
  let index=0;
  for(const letter of letters)index=index*26+letter.charCodeAt(0)-64;
  if(index>16384)throw new Error('Cột Excel không vượt quá XFD.');
  return index-1;
}

export function parseImportedScore(value,rowNumber){
  if(typeof value==='number'&&Number.isFinite(value)&&value>=0)return value;
  const normalized=String(value??'').trim().replace(',','.');
  if(!/^\d+(?:\.\d+)?$/.test(normalized))throw new Error(`Điểm ở dòng ${rowNumber} không phải số không âm hợp lệ.`);
  return Number(normalized);
}

export function parseQuickScore(value,decimalPlaces){
  const raw=String(value??'').trim();
  if(!raw)return null;
  if(/^\d+[,.]\d+$/.test(raw))return Number(raw.replace(',','.'));
  if(!/^\d+$/.test(raw))return NaN;
  if(raw==='10')return 10;
  const digits=raw;
  if(!digits)return null;
  const places=Math.max(0,Math.min(3,Number(decimalPlaces)||0));
  if(!places)return Number(digits);
  const fractionLength=Math.min(places,Math.max(0,digits.length-1));
  if(!fractionLength)return Number(digits);
  return Number(`${digits.slice(0,-fractionLength)}.${digits.slice(-fractionLength)}`);
}

export function validateEssayScore(value,config){
  if(value===null||value===undefined||String(value).trim()==='')return 'Hãy nhập điểm, không để trống.';
  const score=Number(value),maximum=Number(config?.maximum_score),step=Number(config?.score_step);
  if(!Number.isFinite(score)||score<0||score>maximum)return `Điểm phải từ 0 đến ${maximum}.`;
  if(config?.decimal_places!=null){
    const scale=10**Number(config.decimal_places);
    if(Math.abs(score*scale-Math.round(score*scale))>1e-7)return `Điểm có tối đa ${config.decimal_places} chữ số thập phân.`;
  }
  if(!Number.isFinite(step)||step<=0)return null;
  const steps=score/step;
  if(Math.abs(steps-Math.round(steps))>1e-7)return `Điểm phải theo bước ${step}.`;
  return null;
}

export function candidateClassOptions(candidates,grade){
  return [...new Set((candidates||[])
    .filter(candidate=>String(candidate.grade_code||'').trim()===String(grade||'').trim())
    .map(candidate=>String(candidate.class_code||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
}

export function randomScriptHead(usedHeads=new Set()){
  const cryptoApi=globalThis.crypto;
  if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function')
    throw new Error('Không thể tạo đầu phách ngẫu nhiên an toàn trên trình duyệt này.');
  const available='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(head=>!usedHeads.has(head));
  if(!available.length)throw new Error('Không đủ chữ cái để tạo đầu phách riêng cho từng phòng (tối đa 26 phòng).');
  const bytes=new Uint32Array(1),limit=Math.floor(0x100000000/available.length)*available.length;
  do{cryptoApi.getRandomValues(bytes)}while(bytes[0]>=limit);
  return available[bytes[0]%available.length];
}

export function wireOperations({state,$,esc,message,selectAllPages,subjects,subjectName,loadExamRounds,createStudentPicker}){
  const nameOf=subjectCode=>{const code=String(subjectCode||'').trim().toUpperCase();return code==='KTPL'||code==='GDKTPL'?'GDKT&PL':subjectName(subjectCode)};
  const cache={forms:null,absences:[],scriptRooms:[],scriptFinalizationId:null,scriptPlanId:null,scriptRoundNo:null,scriptConfigs:[],graderWork:[],graderQueue:[],graderIndex:0,graderBagAssignments:[],graderProfiles:[],graderGroups:[],scoreImportRows:[],combinedScores:[]};
  const examIds=['forms-exam','absence-exam','script-exam','scores-exam'];
  let absenceExamId='',absenceRequest=0,absenceDirty=false,absenceStudentId='',absencePicker=null;
  const setExamOptions=()=>{
    for(const id of examIds){
      const select=$(id),current=select.value;
      select.innerHTML='<option value="">-- Chọn kỳ thi --</option>'+state.exams.map(exam=>
        `<option value="${esc(exam.id)}">${esc(exam.name)} (${esc(exam.school_year)})</option>`).join('');
      select.value=state.selectedExam||current||'';
    }
    const formsExam=$('forms-exam')?.value;
    if(formsExam&&$('forms-round'))loadFormRounds(formsExam)
      .catch(error=>message($('forms-message'),error.message,'error'));
  };
  const currentExam=select=>$(select).value;
  const setSubjectOptions=(element,options=subjects,includeBlank=true)=>{
    const select=$(element),old=select.value;
    select.innerHTML=(includeBlank?'<option value="">-- Chọn môn --</option>':'')+options.map(item=>{
      const code=item.code||item.subject_code,name=item.name||item.subject_name||nameOf(code);
      return `<option value="${esc(code)}">${esc(name)} (${esc(code)})</option>`;
    }).join('');
    if(options.some(item=>(item.code||item.subject_code)===old))select.value=old;
  };
  const readPages=async build=>selectAllPages(build,PAGE_SIZE);
  const checkResult=({data,error},label)=>{
    if(error)throw new Error(`${label}: ${error.message}`);
    return data;
  };
  const setAdminExam=examId=>{
    if(!examId)throw new Error('Hãy chọn kỳ thi.');
  };

  let formRoundRequest=0,formDataRequest=0,formSettingsExamId=null;
  let defaultForms=null;
  const isDefaultForms=()=>state.exams.find(e=>e.id===currentExam('forms-exam'))?.exam_mode==='default';
  async function ensureDefaultForms(){
    if(!defaultForms){
      if(!$('forms-default-settings'))throw new Error('Thiếu giao diện mẫu kỳ mặc định. Hãy cập nhật modules/forms.html cùng bộ website.');
      const {wireDefaultForms}=await import('./default-forms.js?v=163');
      defaultForms=wireDefaultForms({$,state,message,createPrintFrame});
    }
    return defaultForms;
  }
  async function loadFormRounds(examId){
    const request=++formRoundRequest,roundSelect=$('forms-round');
    cache.forms=null;
    $('forms-export-xlsx').disabled=true;$('forms-export-pdf').disabled=true;
    const previous=roundSelect.dataset.examId===examId?roundSelect.value:'';
    roundSelect.disabled=true;
    $('forms-round-status').textContent='Đang tải đợt thi…';
    try{
      const rounds=examId?await loadExamRounds(state.client,examId):[];
      if(request!==formRoundRequest)return;
      roundSelect.innerHTML='<option value="">-- Chọn đợt thi --</option>'+rounds.map(round=>
        `<option value="${esc(round.round_no)}">${esc(round.name||`Đợt ${round.round_no}`)}</option>`).join('');
      roundSelect.dataset.examId=examId||'';
      const available=rounds.map(round=>String(round.round_no));
      roundSelect.value=available.includes(previous)?previous:(available[0]||'');
      $('forms-round-status').textContent=rounds.length?'':'Hãy chọn kỳ thi có đợt thi đã cấu hình.';
    }catch(error){
      if(request!==formRoundRequest)return;
      roundSelect.innerHTML='<option value="">-- Không tải được đợt thi --</option>';
      roundSelect.dataset.examId='';
      $('forms-round-status').textContent=error.message;
      throw error;
    }finally{if(request===formRoundRequest)roundSelect.disabled=false}
  }

  const formSpecs={"listing":["Danh sách niêm yết","DANH SÁCH NIÊM YẾT THÍ SINH",["STT","SBD","Họ và tên","Ngày sinh","Lớp","Môn 1","Môn 2","Ghi chú"],[5,10,25,13,9,14,14,10]],"receipt":["Phiếu thu bài","PHIẾU THU BÀI",["TT","SBD","Họ và tên","Ngày sinh","Lớp","Môn thi","Mã đề","Số tờ","Ký nộp","Ghi chú"],[5,10,25,13,9,14,6,6,12,10]],"roster":["SBD và môn lựa chọn","DANH SÁCH SỐ BÁO DANH VÀ MÔN THI LỰA CHỌN",["STT","Lớp","Mã học sinh","SBD","Họ và tên","Môn 1","Môn 2","Ghi chú"],[8,16,20,14,30,25,25,10]]};
  const cleanFormTitle=value=>String(value??'').replace(/[·.]+/g,' ').replace(/\s+/g,' ').trim();
  const defaultFormMargins={top:8,right:8,bottom:8,left:8};
  const normalizeFormMargins=raw=>Object.fromEntries(Object.keys(defaultFormMargins).map(side=>{
    const value=Number(raw?.[side]);
    return [side,Number.isFinite(value)&&value>=0&&value<=30?value:defaultFormMargins[side]];
  }));
  formSpecs.classrooms=['Phòng thi theo lớp','DANH SÁCH PHÒNG THI THEO LỚP',['STT','Số báo danh','Họ và tên','Ngày sinh','Giới tính','Phòng thi bắt buộc','Phòng thi lựa chọn','Ghi chú'],[6,13,26,14,9,25,30,12]];
  formSpecs.mandatory_listing=['Niêm yết môn bắt buộc','DANH SÁCH NIÊM YẾT MÔN THI BẮT BUỘC',['STT','SBD','Họ và tên','Ngày sinh','Lớp','Môn thi','Ghi chú'],[5,12,28,14,10,19,12]];
  const defaultFont=(header=false)=>({family:'Times New Roman',size:header?12:10,weight:header?700:400,style:'normal'});
  const normalizeFormPrintSettings=raw=>{
    const settings=Object.fromEntries(Object.entries(formSpecs).map(([key,spec])=>{
      const value=raw?.[key]||{};
      return [key,{title:cleanFormTitle(value.title)||spec[1],header:{...defaultFont(true),...(value.header||raw?.header)},body:{...defaultFont(),...(value.body||raw?.body)},widths:spec[3].map((w,i)=>Number(value.widths?.[i]||raw?.widths?.[key]?.[i])||w)}];
    }));
    settings.margins=normalizeFormMargins(raw?.margins);
    settings.classrooms.show_mandatory_subjects=raw?.classrooms?.show_mandatory_subjects===true;
    settings.classrooms.show_elective_subjects=raw?.classrooms?.show_elective_subjects===true;
    return settings;
  };
  const currentFormPrintSettings=()=>{
    const settings=Object.fromEntries(Object.entries(formSpecs).map(([key,spec])=>{
    const value={title:cleanFormTitle($(`forms-${key}-title`).value)||spec[1]};
    for(const part of ['header','body']){
      const id=`forms-${key}-${part}`;
      const size=Number($(id+'-size').value);
      if(!Number.isFinite(size)||size<8||size>24)throw new Error('Cỡ chữ phải từ 8 đến 24 pt.');
      value[part]={family:$(id+'-family').value,size,weight:Number($(id+'-weight').value),style:$(id+'-style').value};
    }
    value.widths=spec[3].map((_,i)=>{
      const width=Number($(`forms-${key}-width-${i}`).value);
      if(!Number.isFinite(width)||width<1||width>100)throw new Error('Độ rộng cột phải từ 1 đến 100.');
      return width;
    });
      return [key,value];
    }));
    settings.margins=Object.fromEntries(Object.keys(defaultFormMargins).map(side=>{
      const value=Number($(`forms-margin-${side}`).value||defaultFormMargins[side]);
      if(!Number.isFinite(value)||value<0||value>30)throw new Error('Lề in phải từ 0 đến 30 mm.');
      return [side,value];
    }));
    settings.classrooms.show_mandatory_subjects=$('forms-classrooms-show-mandatory-subjects')?.checked===true;
    settings.classrooms.show_elective_subjects=$('forms-classrooms-show-elective-subjects')?.checked===true;
    return settings;
  };
  const applyFormPrintSettings=settings=>{
    for(const [key,value] of Object.entries(normalizeFormPrintSettings(settings)).filter(([key])=>formSpecs[key])){
      $(`forms-${key}-title`).value=value.title;
      for(const part of ['header','body'])for(const prop of ['family','size','weight','style'])$(`forms-${key}-${part}-${prop}`).value=String(value[part][prop]);
      value.widths.forEach((width,i)=>$(`forms-${key}-width-${i}`).value=width);
    }
    const margins=normalizeFormMargins(settings?.margins);
    const flags=normalizeFormPrintSettings(settings).classrooms;
    if($('forms-classrooms-show-mandatory-subjects'))$('forms-classrooms-show-mandatory-subjects').checked=flags.show_mandatory_subjects;
    if($('forms-classrooms-show-elective-subjects'))$('forms-classrooms-show-elective-subjects').checked=flags.show_elective_subjects;
    for(const side of Object.keys(defaultFormMargins))$(`forms-margin-${side}`).value=margins[side];
  };

  function showFormSettings(){
    const common=isDefaultForms();
    $('forms-choice-note')?.classList.toggle('hidden',common);
    $('forms-default-settings')?.classList.toggle('hidden',!common);
    $('forms-print-type').closest('label').classList.toggle('hidden',common);
    const selected=$('forms-print-type').value;
    for(const key of Object.keys(formSpecs))$(`forms-settings-${key}`).classList.toggle('hidden',common||key!==selected);
    $('forms-settings-receipt').classList.toggle('hidden',common||!selected.startsWith('receipt_'));
    $('forms-class-filter-wrap').classList.toggle('hidden',common?!['classrooms','receipt_classrooms'].includes($('forms-default-type')?.value):!['receipt_classrooms','classrooms'].includes(selected));
    $('forms-receipt-order-wrap').classList.toggle('hidden',common||selected!=='receipt_elective');
  }
  function classRoomGroups(forms){
    const selected=$('forms-class-filter').value||'';
    const rows=forms.classRoomRows||[];
    return [...new Set(rows.map(row=>row.class_code||'Chưa xếp lớp'))]
      .filter(code=>!selected||code===selected).sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}))
      .map(code=>[code,rows.filter(row=>(row.class_code||'Chưa xếp lớp')===code)]);
  }
  const shortRoomLabels=value=>String(value??'').replace(/phòng/gi,'P');
  const classRoomColumn=(row,kind)=>{
    const value=String(row[kind+'_rooms']||'Chưa phân phòng');
    if(value==='Chưa phân phòng')return value;
    if($('forms-classrooms-show-'+kind+'-subjects')?.checked===true)return shortRoomLabels(value);
    const codes=row[kind+'_room_codes']||value.split(';').map(label=>label.slice(label.lastIndexOf(':')+1).trim()).filter(Boolean);
    return [...new Set(codes)].map(shortRoomLabels).join('; ')||'Chưa phân phòng';
  };
  const classRoomValues=(row,index)=>[index+1,row.sbd||'',row.student_name||'',row.date_of_birth||'',row.gender||'',classRoomColumn(row,'mandatory'),classRoomColumn(row,'elective'),''];
  function classReceiptGroups(forms){
    const groups=new Map();
    const selected=$('forms-class-filter').value||'';
    for(const row of forms.receiptRows||[]){
      if(row.subject_order!==null&&row.subject_order!==undefined)continue;
      if(selected&&String(row.class_code||'Chưa xếp lớp')!==selected)continue;
      const key=String(row.class_code||'Chưa xếp lớp');
      if(!groups.has(key))groups.set(key,{classCode:key,subject:'',order:null,room:'',rows:[]});
      const group=groups.get(key);
      if(!group.rows.some(item=>String(item.candidate_id)===String(row.candidate_id)))group.rows.push(row);
    }
    return [...groups.values()].sort((a,b)=>String(a.classCode).localeCompare(String(b.classCode),'vi',{numeric:true}));
  }

  async function loadForms(){
    showFormSettings();
    for(const id of ['forms-default-preview-button','forms-default-print'])if($(id))$(id).disabled=true;
    if($('forms-default-preview'))$('forms-default-preview').innerHTML='';
    const request=++formDataRequest;
    cache.forms=null;
    $('forms-export-xlsx').disabled=true;$('forms-export-pdf').disabled=true;
    const examId=currentExam('forms-exam');
    if(examId&&$('forms-round')&&($('forms-round').dataset.examId!==examId||!$('forms-round').value))await loadFormRounds(examId);
    const roundValue=$('forms-round')?.value||'';
    if(request!==formDataRequest)return;
    if(!roundValue)throw new Error('Hãy chọn đợt thi trước khi tải biểu mẫu.');
    const roundNo=Number(roundValue);
    cache.forms=null;
    $('forms-export-xlsx').disabled=true;$('forms-export-pdf').disabled=true;
    setAdminExam(examId);
    const exam=state.exams.find(item=>item.id===examId);
    if(!exam)throw new Error('Không tìm thấy kỳ thi đang chọn.');
    if(formSettingsExamId!==examId){
    $('forms-authority').value=exam.managing_authority||'';
    $('forms-institution').value=exam.institution_name||'';
    $('forms-title').value=exam.form_exam_title||exam.name||'';
    applyFormPrintSettings(exam.form_print_settings);
    formSettingsExamId=examId;
    }
    $('forms-load-data').disabled=true;
    try{
      const allCandidates=await readPages(()=>state.client.from('exam_candidates')
        .select('id,sbd,student_code,student_name,class_code,date_of_birth,gender').eq('exam_id',examId).order('class_code').order('sbd'));
      let candidates=allCandidates;
      if(roundNo){
        const roundCandidates=await readPages(()=>state.client.rpc('exam_get_round_candidates',{p_exam_id:examId,p_round_no:roundNo}).order('id'));
        const roundIds=new Set((roundCandidates||[]).map(row=>String(row.candidate_id||row.id)));
        candidates=allCandidates.filter(candidate=>roundIds.has(String(candidate.id)));
      }
      const registrations=await readPages(()=>state.client.from('exam_candidate_subjects')
        .select('candidate_id,subject_code,subject_order,subject_type').eq('exam_id',examId));
      const roundSubjects=await readPages(()=>state.client.from('exam_round_subjects')
        .select('subject_code,subject_type').eq('exam_id',examId).eq('round_no',roundNo));
      const subjectTypes=new Map(roundSubjects.map(row=>[row.subject_code,row.subject_type]));
      const legacyFinalizations=roundNo?[]:checkResult(await state.client.from('exam_rooming_finalizations').select('*')
        .eq('exam_id',examId).eq('is_current',true).order('finalized_at',{ascending:false}),'Không tải được phương án phòng chính thức');
      const assignments=[];
      let officialPlans=[];
      if(roundNo){
        officialPlans=await readPages(()=>state.client.from('exam_effective_rooming_round_plans')
          .select('id,round_no,plan_type,subject_code,rooms,assignments,status,created_at')
          .eq('exam_id',examId).eq('round_no',roundNo).eq('status','official').order('created_at',{ascending:false}));
        for(const plan of officialPlans||[]){
          for(const assignment of Array.isArray(plan.assignments)?plan.assignments:[]){
            assignments.push({...assignment,plan_type:plan.plan_type,finalization_id:plan.id,
              subject_code:assignment.subject_code||plan.subject_code||''});
          }
        }
      }else{
        for(const finalization of legacyFinalizations||[]){
          const stored=await readPages(()=>state.client.from('exam_room_assignments')
            .select('candidate_id,room_code,sbd,subject_code,ca1_subject_code,ca2_subject_code')
            .eq('finalization_id',finalization.id).order('sbd'));
          for(const assignment of stored)assignments.push({...assignment,
            plan_type:finalization.plan_type,finalization_id:finalization.id,
            subject_code:assignment.subject_code||finalization.subject_code});
        }
      }
      const finalizations=roundNo?officialPlans:legacyFinalizations;
      const candidateById=new Map(candidates.map(candidate=>[String(candidate.id),candidate]));
      const registrationById=new Map();
      for(const registration of registrations||[]){
        if(registration.subject_type!=='elective')continue;
        const id=String(registration.candidate_id);
        if(!registrationById.has(id))registrationById.set(id,{one:'',two:''});
        const target=registrationById.get(id);
        if(Number(registration.subject_order)===1)target.one=registration.subject_code;
        if(Number(registration.subject_order)===2)target.two=registration.subject_code;
      }
      const expanded=assignments.filter(assignment=>candidateById.has(String(assignment.candidate_id)))
        .map(assignment=>({...candidateById.get(String(assignment.candidate_id)),...assignment,
          subject_type:subjectTypes.get(assignment.subject_code)||(registrations||[]).find(row=>String(row.candidate_id)===String(assignment.candidate_id)&&row.subject_code===assignment.subject_code)?.subject_type}));
      const electiveFinal=finalizations?.find(row=>row.plan_type==='elective');
      let posting=(electiveFinal?expanded.filter(row=>row.finalization_id===electiveFinal.id):
        expanded.filter(row=>row.plan_type==='mandatory'||row.plan_type==='subject'));
      if(!posting.length)posting=expanded;
      const listingRows=posting.map((row,index)=>{
        const registration=registrationById.get(String(row.candidate_id))||{};
        return {...row,sequence:index+1,
          subject_one:row.ca1_subject_code||row.subject_code||registration.one||'',
          subject_two:row.ca2_subject_code||registration.two||'',
          note:row.amended?`Đã điều chỉnh: ca 1 ${nameOf(row.ca1_subject_code)} tại ${row.ca1_room_code}; ca 2 ${nameOf(row.ca2_subject_code)} tại ${row.ca2_room_code}. Xem thông báo riêng.`:''};
      }).sort((a,b)=>String(a.room_code).localeCompare(String(b.room_code),'vi',{numeric:true})||
        String(a.sbd).localeCompare(String(b.sbd),'vi',{numeric:true}));
      const receiptRows=[];
      for(const row of expanded){
        if(row.plan_type==='elective'){
          receiptRows.push({...row,room_code:row.ca1_room_code||row.room_code,subject_code:row.ca1_subject_code,subject_order:1});
          receiptRows.push({...row,room_code:row.ca2_room_code||row.room_code,subject_code:row.ca2_subject_code,subject_order:2});
        }else receiptRows.push({...row,subject_order:null});
      }
      const rosterRows=candidates.map((candidate,index)=>{
        const selected=registrationById.get(String(candidate.id))||{};
        return {...candidate,sequence:index+1,subject_one:selected.one||'',subject_two:selected.two||''};
      });
      if(request!==formDataRequest||currentExam('forms-exam')!==examId||Number($('forms-round').value)!==roundNo)return;
      const classRoomRows=buildClassRoomRows(candidates,expanded,nameOf);
      const classSelect=$('forms-class-filter'),previousClass=classSelect.value;
      classSelect.innerHTML='<option value="">Tất cả các lớp</option>'+[...new Set((exam.exam_mode==='default'?allCandidates:classRoomRows).map(row=>row.class_code||'Chưa xếp lớp'))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true})).map(code=>`<option value="${esc(code)}">${esc(code)}</option>`).join('');
      classSelect.value=[...classSelect.options].some(option=>option.value===previousClass)?previousClass:'';
      cache.forms={exam,examId,roundNo,candidates,allCandidates,finalizations,assignments:expanded,listingRows,receiptRows,rosterRows,classRoomRows,mandatoryGroups:mandatoryListingGroups(expanded)};
      if(exam.exam_mode==='default'){
        const renderer=await ensureDefaultForms();
        if(request!==formDataRequest||currentExam('forms-exam')!==examId||Number($('forms-round').value)!==roundNo)return;
        renderer.load(cache.forms);
        for(const id of ['forms-default-preview-button','forms-default-print'])$(id).disabled=false;
      }
      $('forms-summary').innerHTML=(exam.exam_mode==='default'?[
        ['Thí sinh',candidates.length],['Phương án chính thức để chọn nguồn phòng chung',finalizations.length]
      ]:[
        ['Thí sinh',candidates.length],['Danh sách có phòng',listingRows.length],
        ['Lượt thu bài',receiptRows.length],['Môn lựa chọn đã rà soát',rosterRows.length]
      ]).map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
      $('forms-export-xlsx').disabled=false;$('forms-export-pdf').disabled=false;
      message($('forms-message'),`Đã tải ${candidates.length} thí sinh${roundNo?` của đợt ${roundNo}`:''}, ${finalizations?.length||0} phương án phòng chính thức.`,'success');
    }finally{if(request===formDataRequest)$('forms-load-data').disabled=false}
  }
  async function saveFormHeader(){
    const examId=currentExam('forms-exam');setAdminExam(examId);
    const printSettings=currentFormPrintSettings();
    if(isDefaultForms()){
      if(!defaultForms||cache.forms?.examId!==examId)throw new Error('Tải dữ liệu biểu mẫu trước khi lưu mẫu kỳ mặc định.');
      printSettings.default_templates=defaultForms.getSettings();
      printSettings.default_room_sources={...(cache.forms.exam.form_print_settings?.default_room_sources||{}),[String(cache.forms.roundNo)]:$('forms-default-source').value};
    }
    const payload={managing_authority:$('forms-authority').value.trim(),
      institution_name:$('forms-institution').value.trim(),form_exam_title:$('forms-title').value.trim(),
      form_print_settings:printSettings};
    if(!payload.managing_authority||!payload.institution_name||!payload.form_exam_title)
      throw new Error('Hãy nhập đủ cơ quan chủ quản, tên đơn vị và tên kỳ thi.');
    const{data,error}=await state.client.from('exam_sessions').update(payload).eq('id',examId).select().single();
    if(error)throw new Error(`Không lưu được tiêu đề biểu mẫu. Hãy chạy migration v0.1.59. ${error.message}`);
    Object.assign(state.exams.find(row=>row.id===examId)||{},data);
    if(cache.forms?.examId===examId)Object.assign(cache.forms.exam,data);
    message($('forms-message'),'Đã lưu thông tin tiêu đề riêng cho kỳ thi.','success');
  }
  function exportFormsExcel(){
    const printType=$('forms-print-type')?.value||'all';
    const receiptMode=printType.startsWith('receipt_')?printType.slice('receipt_'.length):'';
    const settings=currentFormPrintSettings();
    const forms=cache.forms;
    if(!forms)throw new Error('Hãy tải dữ liệu biểu mẫu trước.');
    if(!window.XLSX)throw new Error('Không tải được thư viện Excel.');
    const wb=window.XLSX.utils.book_new();
    const header=[$('forms-authority').value,$('forms-institution').value,String($('forms-title').value||'').replace(/[·.]+/g,' ').replace(/\s+/g,' ').trim()];
    const listings=[],listingBreaks=[];
    for(const room of (printType.startsWith('receipt_')||printType==='roster'?[]:[...new Set(forms.listingRows.map(row=>row.room_code))])){
      const roomRows=forms.listingRows.filter(row=>row.room_code===room);
      listings.push(...[header,[settings.listing.title],[`Phòng thi: ${room}`],
        ['STT','SBD','Họ và tên','Ngày sinh','Lớp','Môn 1','Môn 2','Ghi chú'],
        ...roomRows.map((row,index)=>[index+1,row.sbd,row.student_name,row.date_of_birth||'',row.class_code||'',
          nameOf(row.subject_one),nameOf(row.subject_two),row.note]),[`Tổng số thí sinh: ${roomRows.length}`],[]]);
      listingBreaks.push({id:listings.length-1,max:16383,man:1});
    }
    const receipts=[],receiptBreaks=[],receiptMerges=[];
    const receiptGroups=receiptMode==='classrooms'?classReceiptGroups(forms):
      receiptMode==='mandatory'?groupReceiptRows((forms.receiptRows||[]).filter(row=>row.subject_order===null||row.subject_order===undefined),1):
      receiptMode==='elective'?groupReceiptRows((forms.receiptRows||[]).filter(row=>row.subject_order!==null&&row.subject_order!==undefined),$('forms-receipt-order').value||1):
      printType==='all'?groupReceiptRows(forms.receiptRows,$('forms-receipt-order').value||1):[];
    for(const {room,subject,order,rows:roomRows,classCode} of receiptGroups){
      const isClassReceipt=receiptMode==='classrooms';
      const isMandatory=receiptMode==='mandatory'||isClassReceipt||(!order&&['TOAN','VAN'].includes(subject));
      const pageStart=receipts.length;
      const columns=isMandatory?['TT','SBD','Họ và tên','Ngày sinh','Mã đề','Số tờ','Ký nộp','Ghi chú']:
        ['TT','SBD','Họ và tên','Ngày sinh','Lớp','Môn thi','Mã đề','Số tờ','Ký nộp','Ghi chú'];
      const heading=isClassReceipt?[`Lớp: ${classCode}`,'Môn thi: ................................']: [`Phòng: ${String(room||'').replace(/^phòng\s*/i,'')}`,order?`Môn ${order}`:subject?`Môn thi: ${nameOf(subject)}`:''];
      receipts.push(...[header,[settings.receipt.title],heading,columns,
        ...roomRows.map((row,index)=>isMandatory?
          [index+1,row.sbd,row.student_name,row.date_of_birth||'','','','','']:
          [index+1,row.sbd,row.student_name,row.date_of_birth||'',row.class_code||'',nameOf(row.subject_code)||nameOf(row.subject_one)||'', '', '', '', '']),
        ['Tổng số thí sinh',roomRows.length,'Số thí sinh vắng','','','','','','','']]);
      const footerStart=receipts.length;
      if(false&& !order&&['TOAN','VAN'].includes(subject)){
        for(let i=pageStart+3;i<footerStart-1;i++)receipts[i].splice(5,1);
      }
      receipts[pageStart+2]=[`Phòng: ${String(room).replace(/^phòng\s*/i,'')} · ${order?`Môn ${order}`:`Môn: ${nameOf(subject)}`}`];
      receipts[pageStart+2]=heading;
      receiptMerges.push({s:{r:pageStart+2,c:0},e:{r:pageStart+2,c:isMandatory?7:9}});
      receipts.push(['Tổng số bài: ................','','','','','Tổng số tờ: ................'],
        ['SBD thí sinh vắng: ................................................................................'],[],
        ['Cán bộ coi thi 1','','','','','Cán bộ coi thi 2'],
        ['(Ký, ghi rõ họ tên)','','','','','(Ký, ghi rõ họ tên)'],[],[],[]);
      for(const offset of [0,3,4])for(const col of [0,isMandatory?4:5])receiptMerges.push({s:{r:footerStart+offset,c:col},e:{r:footerStart+offset,c:isMandatory?col+3:col+4}});
      receiptMerges.push({s:{r:footerStart+1,c:0},e:{r:footerStart+1,c:isMandatory?7:9}});
      receiptBreaks.push({id:receipts.length-1,max:16383,man:1});
    }
    if(!listings.length)listings.push(header,[settings.listing.title],['Chưa có phân phòng chính thức.']);
    if(!receipts.length)receipts.push(header,[settings.receipt.title],['Chưa có phân phòng chính thức.']);
    const roster=[header,[settings.roster.title],
      ['STT','Lớp','Mã học sinh','SBD','Họ và tên','Môn 1','Môn 2','Ghi chú'],
      ...forms.rosterRows.map((row,index)=>[index+1,row.class_code||'',row.student_code||'',row.sbd||'',
        row.student_name,nameOf(row.subject_one),nameOf(row.subject_two),''])];
    const classSheets=classRoomGroups(forms).map(([code,rows],index)=>[
      `Lop ${index+1} - ${code.replace(/[\\/?*\[\]:]/g,' ').slice(0,18)}`,
      [header,[settings.classrooms.title],[`Lớp: ${code}`],formSpecs.classrooms[2],...rows.map(classRoomValues)],[], 'classrooms'
    ]);
    const sheetSpecs=[
      ...(printType==='mandatory_listing'?(forms.mandatoryGroups||[]).map(({room,subject,rows},i)=>[
        `Bat buoc ${i+1}`,[header,[settings.mandatory_listing.title],[`Phòng: ${room}`],
          formSpecs.mandatory_listing[2],...rows.map((row,index)=>[index+1,row.sbd||'',row.student_name||'',row.date_of_birth||'',row.class_code||'',(row.subject_codes||[subject]).map(nameOf).filter(Boolean).join('/')||'Bắt buộc',row.note||''])],[],'mandatory_listing'
      ]):[]),
      ['Danh sach niem yet',listings,[8,15,30,15,12,25,25,25]],
      ['Phieu thu bai',receipts,[7,14,26,15,11,24,10,9,14,24]],
      ['SBD va mon lua chon',roster,[8,16,20,14,30,25,25]],
      ...classSheets
    ].filter(([sheetName,rows,widths,type])=>printType==='all'||(type==='mandatory_listing'&&printType==='mandatory_listing')||(type==='classrooms'&&printType==='classrooms')||
      (printType==='listing'&&sheetName==='Danh sach niem yet')||
      (printType.startsWith('receipt_')&&sheetName==='Phieu thu bai')||
      (printType==='roster'&&sheetName==='SBD va mon lua chon'));
    if(!sheetSpecs.length)throw new Error('Không có dữ liệu cho biểu mẫu hoặc lớp đang chọn.');
    for(const[sheetName,rows,widths,type]of sheetSpecs){
      const key=type|| (sheetName==='Danh sach niem yet'?'listing':sheetName==='Phieu thu bai'?'receipt':'roster');
      const config=settings[key];
      const ws=window.XLSX.utils.aoa_to_sheet(rows);
      ws['!cols']=config.widths.map(wch=>({wch}));
      if(key==='receipt')ws['!merges']=receiptMerges;
      const marginInches=side=>settings.margins[side]/25.4;
      ws['!margins']={left:marginInches('left'),right:marginInches('right'),top:marginInches('top'),bottom:marginInches('bottom'),header:0,footer:0};
      ws['!pageSetup']={paperSize:9,orientation:'landscape',fitToWidth:1,fitToHeight:0};
      ws['!rowBreaks']=sheetName==='Danh sach niem yet'?listingBreaks:sheetName==='Phieu thu bai'?receiptBreaks:[];
      const tableRows=new Set(),headingRows=new Set();
      let inTable=false;
      rows.forEach((row,i)=>{
        if(row===header){headingRows.add(i);headingRows.add(i+1);inTable=false}
        if(['STT','TT'].includes(row[0]))inTable=true;
        else if(typeof row[0]!=='number')inTable=false;
        if(inTable)tableRows.add(i);
      });
      for(const[address,cell]of Object.entries(ws)){
        if(address.startsWith('!')||!cell)continue;
        const row=rows[window.XLSX.utils.decode_cell(address).r]||[];
        const first=String(row[0]??'');
        const bold=first===first.toUpperCase()||['STT','TT','STT','Tổng số thí sinh'].includes(first);
        const rowIndex=window.XLSX.utils.decode_cell(address).r;
        const font=headingRows.has(rowIndex)?config.header:tableRows.has(rowIndex)?config.body:null;
        cell.s={font:font?{name:font.family,sz:font.size,bold:font.weight===700,italic:font.style==='italic'}:{name:forms.exam.form_font_family||'Times New Roman',sz:Number(forms.exam.form_font_size)||11,bold},
          border:{top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}},
          alignment:{vertical:'center',wrapText:true}};
        if(key==='receipt'&&!tableRows.has(rowIndex))delete cell.s.border;
      }
      // Two centered heading blocks, with the form title below the exam title.
      const split=Math.floor(config.widths.length/2),last=config.widths.length-1;
      rows.forEach((row,i)=>{
        if(row!==header)return;
        for(let r=i;r<=i+1;r++)for(let c=0;c<=last;c++)delete ws[window.XLSX.utils.encode_cell({r,c})];
        const values=[[header[0],header[2]],[header[1],config.title]];
        for(let offset=0;offset<2;offset++)for(let side=0;side<2;side++){
          const c=side?split:0,r=i+offset;
          ws[window.XLSX.utils.encode_cell({r,c})]={t:'s',v:values[offset][side]||'',s:{font:{name:config.header.family,sz:config.header.size,bold:true},alignment:{horizontal:'center',vertical:'center',wrapText:true}}};
          (ws['!merges']||=[]).push({s:{r,c},e:{r,c:side?last:split-1}});
        }
      });
      for(const[address,cell]of Object.entries(ws)){
        if(address.startsWith('!'))continue;
        const row=rows[window.XLSX.utils.decode_cell(address).r];
        if(['STT','TT'].includes(row?.[0]))cell.s.font.bold=true;
      }
      window.XLSX.utils.book_append_sheet(wb,ws,sheetName);
    }
    window.XLSX.writeFile(wb,`bieu-mau-${forms.examId}.xlsx`,{cellStyles:true});
  }
  function compactPrintPages(pages){
    return pages.map(markup=>{
      if(markup.includes('class="page classrooms"'))return markup;
      const template=document.createElement('template');template.innerHTML=markup;
      const normalize=value=>String(value||'').toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim();
      template.content.querySelectorAll('table').forEach(table=>{
        const headerRow=table.querySelector('thead tr');if(!headerRow)return;
        const headers=[...headerRow.children];const removeIndexes=headers.map((cell,index)=>({index,label:normalize(cell.textContent)})).filter(item=>['vi tri','ma hoc sinh','ma dinh danh'].includes(item.label)).map(item=>item.index);
        [...removeIndexes].sort((a,b)=>b-a).forEach(index=>table.querySelectorAll('tr').forEach(row=>row.children[index]?.remove()));
        const currentHeaders=[...headerRow.children].map(cell=>normalize(cell.textContent));
        if(!currentHeaders.includes('ghi chu')){const cell=document.createElement('th');cell.textContent='Ghi chú';headerRow.appendChild(cell);table.querySelectorAll('tbody tr').forEach(row=>{const note=document.createElement('td');note.textContent='';row.appendChild(note)})}
        table.querySelectorAll('th,td').forEach(cell=>{const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(node=>{if(normalize(node.nodeValue).includes('giao duc kinh te va phap luat'))node.nodeValue='GDKT&PL'})});
      });
      return template.innerHTML;
    });
  }
  function exportFormsPdf(){
    const printType=$('forms-print-type')?.value||'all';
    const receiptMode=printType.startsWith('receipt_')?printType.slice('receipt_'.length):'';
    const settings=currentFormPrintSettings();
    const forms=cache.forms;if(!forms)throw new Error('Hãy tải dữ liệu biểu mẫu trước.');
    const pages=[];
    const displayRoom=room=>String(room??'').replace(/^phòng\s*/i,'').trim();
    const header=`<header><b>${esc($('forms-authority').value)}</b><br><b>${esc($('forms-institution').value)}</b><br><b>${esc(String($('forms-title').value||'').replace(/[·.]+/g,' ').replace(/\s+/g,' ').trim())}</b></header>`;
    if(printType==='mandatory_listing')for(const {room,subject,rows} of forms.mandatoryGroups||[]){
      pages.push(`<section class="page mandatory_listing">${header}<h3>${esc(settings.mandatory_listing.title)}<br>PHÒNG ${esc(displayRoom(room))}</h3><table><thead><tr>${formSpecs.mandatory_listing[2].map(label=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr>${[index+1,row.sbd||'',row.student_name||'',row.date_of_birth||'',row.class_code||'',(row.subject_codes||[subject]).map(nameOf).filter(Boolean).join('/')||'Bắt buộc',row.note||''].map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Tổng số thí sinh: ${rows.length}</p></section>`);
    }
    if(printType==='all'||printType==='listing')for(const room of [...new Set(forms.listingRows.map(row=>row.room_code))]){
      const rows=forms.listingRows.filter(row=>row.room_code===room);
      pages.push(`<section class="page listing">${header}<h3>${esc(settings.listing.title)}<br>PHÒNG ${esc(displayRoom(room))}</h3><table><thead><tr><th>STT</th><th>SBD</th><th>Họ và tên</th><th>Ngày sinh</th><th>Lớp</th><th>Môn 1</th><th>Môn 2</th><th>Ghi chú</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.date_of_birth||'')}</td><td>${esc(row.class_code||'')}</td><td>${esc(nameOf(row.subject_one))}</td><td>${esc(nameOf(row.subject_two))}</td><td></td></tr>`).join('')}</tbody></table><p>Tổng số thí sinh: ${rows.length}</p></section>`);
    }
    const pdfReceiptGroups=receiptMode==='classrooms'?classReceiptGroups(forms):
      receiptMode==='mandatory'?groupReceiptRows((forms.receiptRows||[]).filter(row=>row.subject_order===null||row.subject_order===undefined),1):
      receiptMode==='elective'?groupReceiptRows((forms.receiptRows||[]).filter(row=>row.subject_order!==null&&row.subject_order!==undefined),$('forms-receipt-order').value||1):
      printType==='all'?groupReceiptRows(forms.receiptRows,$('forms-receipt-order').value||1):[];
    for(const {room,subject,order,rows,classCode} of pdfReceiptGroups){
      const isClassReceipt=receiptMode==='classrooms';
      const isMandatory=receiptMode==='mandatory'||isClassReceipt||(!order&&['TOAN','VAN'].includes(subject));
      const heading=isClassReceipt?`LỚP ${esc(classCode)}<br>MÔN THI: ................................`:`PHÒNG ${esc(displayRoom(room))}${order?`<br>MÔN ${order}`:subject?`<br>MÔN: ${esc(nameOf(subject))}`:''}`;
      const columns=isMandatory?'<th>TT</th><th>SBD</th><th>Họ và tên</th><th>Ngày sinh</th><th>Mã đề</th><th>Số tờ</th><th>Ký nộp</th><th>Ghi chú</th>':'<th>TT</th><th>SBD</th><th>Họ và tên</th><th>Ngày sinh</th><th>Lớp</th><th>Môn thi</th><th>Mã đề</th><th>Số tờ</th><th>Ký nộp</th><th>Ghi chú</th>';
      const body=rows.map((row,index)=>isMandatory?`<tr><td>${index+1}</td><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.date_of_birth||'')}</td><td></td><td></td><td></td><td></td></tr>`:`<tr><td>${index+1}</td><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.date_of_birth||'')}</td><td>${esc(row.class_code||'')}</td><td>${esc(nameOf(row.subject_code)||nameOf(row.subject_one)||'')}</td><td></td><td></td><td></td><td></td></tr>`).join('');
      const receiptFooter=isClassReceipt?'':`<div class="receipt-footer"><p>Tổng số thí sinh: ${rows.length} · Số thí sinh vắng: ............</p><p>SBD thí sinh vắng: ................................................................................</p><p>Tổng số bài: ................ · Tổng số tờ: ................</p><div class="receipt-signatures"><div><b>Cán bộ coi thi 1</b><br><i>(Ký, ghi rõ họ tên)</i></div><div><b>Cán bộ coi thi 2</b><br><i>(Ký, ghi rõ họ tên)</i></div></div></div>`;
      const receiptHeading=isClassReceipt
        ? `${esc(settings.receipt.title)} LỚP ${esc(classCode)}<br>MÔN THI: ................................`
        : `${esc(settings.receipt.title)}<br>${heading}`;
      pages.push(`<section class="page receipt ${isClassReceipt?'class-receipt ':''}${isMandatory?'mandatory-receipt':''}">${header}<h3>${receiptHeading}</h3><table><thead><tr>${columns}</tr></thead><tbody>${body}</tbody></table>${receiptFooter}</section>`);
    }
    if(printType==='all'||printType==='roster')for(const classCode of [...new Set(forms.rosterRows.map(row=>row.class_code||'Chưa xếp lớp'))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}))){
      const rows=forms.rosterRows.filter(row=>(row.class_code||'Chưa xếp lớp')===classCode);
      pages.push(`<section class="page roster">${header}<h3>${esc(settings.roster.title)}<br>LỚP ${esc(classCode)}</h3><table><thead><tr><th>STT</th><th>Mã học sinh</th><th>SBD</th><th>Họ và tên</th><th>Môn 1</th><th>Môn 2</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.student_code||'')}</td><td>${esc(row.sbd||'')}</td><td>${esc(row.student_name)}</td><td>${esc(nameOf(row.subject_one))}</td><td>${esc(nameOf(row.subject_two))}</td></tr>`).join('')}</tbody></table><p>Tổng số thí sinh: ${rows.length}</p></section>`);
    }
    if(printType==='all'||printType==='classrooms')for(const [code,rows] of classRoomGroups(forms)){
      pages.push(`<section class="page classrooms">${header}<h3>${esc(settings.classrooms.title)}<br>LỚP ${esc(code)}</h3><table><thead><tr>${formSpecs.classrooms[2].map(label=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr>${classRoomValues(row,i).map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Tổng số học sinh: ${rows.length}</p></section>`);
    }
    if(!pages.length)throw new Error('Không có dữ liệu cho biểu mẫu hoặc lớp đang chọn.');
    const printablePages=compactPrintPages(pages).map(page=>page.replace(/<header>[\s\S]*?<\/header><h3>([\s\S]*?)<\/h3>/,(_,title)=>`<header class="form-heading"><div><b>${esc($('forms-authority').value)}</b><br><b>${esc($('forms-institution').value)}</b></div><div><b>${esc($('forms-title').value)}</b><h3>${title}</h3></div></header>`));
    const fontCss=font=>`font-family:'${esc(font.family)}',serif;font-size:${font.size}pt;font-weight:${font.weight};font-style:${font.style};`;
    const customCss=Object.entries(settings).filter(([key])=>key!=='margins').map(([key,config])=>{
      // Printed class rosters omit class and student ID, and include a notes column.
      const widths=key==='roster'?[config.widths[0],config.widths[3],config.widths[4],config.widths[5],config.widths[6],config.widths[7]]:config.widths;
      const total=widths.reduce((sum,w)=>sum+w,0);
      return `.page.${key} header,.page.${key} header b,.page.${key} h3{${fontCss(config.header)}white-space:normal;overflow-wrap:anywhere}.page.${key} table th,.page.${key} table td{${fontCss(config.body)}}`+widths.map((w,i)=>`.page.${key} table th:nth-child(${i+1}){width:${w/total*100}%}`).join('');
    }).join('');
    const win=createPrintFrame();
    win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Biểu mẫu kỳ thi</title><style>
      @page{size:A4 portrait;margin:${settings.margins.top}mm ${settings.margins.right}mm ${settings.margins.bottom}mm ${settings.margins.left}mm}*{box-sizing:border-box}body{margin:0;font-family:${esc(forms.exam.form_font_family||'Times New Roman')},serif;font-size:${Number(forms.exam.form_font_size)||11}pt}
      .page{width:calc(210mm - ${settings.margins.left+settings.margins.right}mm);min-height:calc(297mm - ${settings.margins.top+settings.margins.bottom}mm);break-after:page;page-break-after:always}
      .page:last-child{break-after:auto;page-break-after:auto}header{text-align:center;line-height:1.15;white-space:nowrap}
      h3{text-align:center;margin:1mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed}table:not(.receipt) th:nth-child(1){width:5%}table:not(.receipt) th:nth-child(2){width:10%}table:not(.receipt) th:nth-child(3){width:25%}table:not(.receipt) th:nth-child(4){width:13%}table:not(.receipt) th:nth-child(5){width:9%}table:not(.receipt) th:nth-child(6),table:not(.receipt) th:nth-child(7){width:14%}table:not(.receipt) th:nth-child(8){width:10%}.receipt th:nth-child(1){width:5%}.receipt th:nth-child(2){width:10%}.receipt th:nth-child(3){width:25%}.receipt th:nth-child(4){width:13%}.receipt th:nth-child(5){width:9%}.receipt th:nth-child(6){width:14%}.receipt th:nth-child(7),.receipt th:nth-child(8){width:6%}.receipt th:nth-child(9){width:12%}.receipt th:nth-child(10){width:10%}
      th,td{border:1px solid #000;padding:2px 3px;text-align:center;overflow-wrap:anywhere;white-space:normal}
      td:nth-child(3){text-align:left}tr{break-inside:avoid;page-break-inside:avoid}
      @media print{html,body{width:calc(210mm - ${settings.margins.left+settings.margins.right}mm);margin:0!important}.page{margin:0!important}}
      @media screen{body{max-width:1100px;margin:20px auto}.page{width:100%;margin-bottom:20px}}
      .receipt-footer{break-inside:avoid;page-break-inside:avoid}.receipt-footer p{margin:3mm 0}.receipt-signatures{display:flex;justify-content:space-around;text-align:center;margin-top:5mm;min-height:25mm}${customCss}
      .page header.form-heading{display:grid;grid-template-columns:1fr 1fr;gap:5mm;align-items:start;text-align:center;margin-bottom:2mm;white-space:normal}.page header.form-heading b,.page header.form-heading h3{font-weight:700}.page header.form-heading h3{margin:0}.page.class-receipt h3{white-space:nowrap;margin:0 0 1mm}.page table thead th{font-weight:700 !important}
      .page.mandatory-receipt table th:nth-child(n){width:auto}.page.mandatory-receipt table th:nth-child(1){width:5%}.page.mandatory-receipt table th:nth-child(2){width:13%}.page.mandatory-receipt table th:nth-child(3){width:25%}.page.mandatory-receipt table th:nth-child(4){width:14%}
      </style></head><body>${printablePages.join('')}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    win.document.close();
  }

  async function loadAbsences(){
    const examId=currentExam('absence-exam');
    const request=++absenceRequest;
    absenceExamId='';
    $('absence-save').disabled=true;
    cache.absences=[];
    $('absence-table-body').innerHTML='<tr><td colspan="6" class="empty">Đang tải...</td></tr>';
    $('absence-report-body').innerHTML='<tr><td colspan="5" class="empty">Đang tải...</td></tr>';
    setAdminExam(examId);
    const[candidates,registrations,absenceResult,classConfigs]=await Promise.all([
      readPages(()=>state.client.from('exam_candidates').select('id,sbd,student_code,student_name,grade_code,class_code').eq('exam_id',examId).order('grade_code').order('class_code').order('sbd')),
      readPages(()=>state.client.from('exam_candidate_subjects').select('candidate_id,subject_code').eq('exam_id',examId)),
      readPages(()=>state.client.from('exam_absences').select('candidate_id,subject_code,reason').eq('exam_id',examId).order('candidate_id').order('subject_code')).then(data=>({data,error:null})),
      state.exams.find(exam=>exam.id===examId)?.exam_mode==='subject'?Promise.resolve([]):readPages(()=>state.client.from('exam_subject_class_configs').select('class_code,subject_code').eq('exam_id',examId).order('class_code').order('subject_code'))
    ]);
    if(request!==absenceRequest||examId!==currentExam('absence-exam'))return;
    if(absenceResult.error)throw new Error(`Không tải được báo vắng. Hãy chạy migration v0.1.59. ${absenceResult.error.message}`);
    absenceExamId=examId;absenceDirty=false;absenceStudentId='';$('absence-search').value='';
    const exam=state.exams.find(row=>row.id===examId);
    const codes=[...new Set(candidates.flatMap(candidate=>absenceAllowedSubjects(exam,candidate,registrations,classConfigs)))].sort();
    const reportFilter=$('absence-report-filter'),selectedFilter=reportFilter.value;
    reportFilter.innerHTML='<option value="all">Tất cả thí sinh vắng</option><option value="*">Vắng toàn kỳ</option>'+
      codes.map(code=>`<option value="${esc(code)}">Vắng môn ${esc(nameOf(code))}</option>`).join('');
    reportFilter.value=[...reportFilter.options].some(option=>option.value===selectedFilter)?selectedFilter:'all';
    cache.absences=candidates.map(candidate=>{
      const rows=(absenceResult.data||[]).filter(row=>String(row.candidate_id)===String(candidate.id));
      const allowedSubjects=absenceAllowedSubjects(exam,candidate,registrations,classConfigs);
      return {...candidate,allowedSubjects,outsideAbsences:rows.filter(row=>row.subject_code!=='*'&&!allowedSubjects.includes(row.subject_code)),absentAll:rows.some(row=>row.subject_code==='*'),
        absentSubjects:rows.filter(row=>row.subject_code!=='*').map(row=>row.subject_code),reason:rows[0]?.reason||''};
    });
    $('absence-table-body').innerHTML=cache.absences
      .map(row=>`<tr data-candidate="${esc(row.id)}"><td>${esc(row.sbd||'')}</td><td>${esc(row.student_name)}</td><td>${esc(row.class_code||'')}</td>
        <td><input type="checkbox" data-absence-all ${row.absentAll?'checked':''} aria-label="Vắng toàn kỳ"></td>
        <td><fieldset class="absence-subject-checks" data-absence-subjects aria-label="Các môn vắng của ${esc(row.student_name)}" ${row.absentAll?'disabled':''}>${row.allowedSubjects.map(code=>`<label><input type="checkbox" data-absence-subject value="${esc(code)}" ${row.absentSubjects.includes(code)?'checked':''}><span>${esc(nameOf(code))}</span></label>`).join('')||'<span>Chưa có môn dự thi được cấu hình cho lớp/học sinh.</span>'}</fieldset>${row.outsideAbsences.length?`<div data-absence-outside-wrap class="absence-outside-note">Đã lưu ngoài cấu hình: ${row.outsideAbsences.map(item=>esc(nameOf(item.subject_code))).join(', ')}.<label><input type="checkbox" data-absence-remove-outside> Xóa các báo vắng ngoài cấu hình khi lưu</label></div>`:''}</td>
        <td><input type="text" data-absence-reason value="${esc(row.reason)}" maxlength="200"></td></tr>`).join('')||
      '<tr><td colspan="6" class="empty">Không có thí sinh trong kỳ thi.</td></tr>';
    $('absence-table-body').querySelectorAll('[data-absence-all]').forEach(control=>control.addEventListener('change',()=>{
      control.closest('tr').querySelector('[data-absence-subjects]').disabled=control.checked;
      applyAbsenceFilters();
    }));
    const grades=[...new Set(cache.absences.map(row=>String(row.grade_code||'').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    const gradeFilter=$('absence-grade-filter'),classFilter=$('absence-class-filter');
    const selectedGrade=gradeFilter.value,selectedClass=classFilter.value;
    gradeFilter.innerHTML='<option value="">Tất cả khối</option>'+grades.map(grade=>`<option value="${esc(grade)}">${esc(grade)}</option>`).join('');
    if(grades.includes(selectedGrade))gradeFilter.value=selectedGrade;
    refreshAbsenceClassOptions(selectedClass);
    applyAbsenceFilters();
    $('absence-save').disabled=false;
    message($('absence-message'),`Đã tải ${cache.absences.length} thí sinh và báo vắng đã lưu.`,'success');
  }
  function refreshAbsenceClassOptions(selectedClass=''){
    const grade=$('absence-grade-filter').value;
    const classes=[...new Set(cache.absences
      .filter(row=>!grade||String(row.grade_code||'').trim()===grade)
      .map(row=>String(row.class_code||'').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    const select=$('absence-class-filter');
    select.innerHTML='<option value="">Tất cả lớp</option>'+classes.map(classCode=>`<option value="${esc(classCode)}">${esc(classCode)}</option>`).join('');
    select.value=classes.includes(selectedClass)?selectedClass:'';
  }
  function absenceMatches(candidate){
    const grade=$('absence-grade-filter').value,classCode=$('absence-class-filter').value;
    const query=$('absence-search').value.trim().toLocaleLowerCase('vi');
    return (!absenceStudentId||String(candidate.id)===absenceStudentId)&&(!grade||String(candidate.grade_code||'').trim()===grade)&&
      (!classCode||String(candidate.class_code||'').trim()===classCode)&&
      (!query||[candidate.sbd,candidate.student_code,candidate.student_name,candidate.class_code]
        .some(value=>String(value||'').toLocaleLowerCase('vi').includes(query)));
  }
  function applyAbsenceFilters(){
    const options=cache.absences.filter(candidate=>(!$('absence-grade-filter').value||String(candidate.grade_code||'').trim()===$('absence-grade-filter').value)&&(!$('absence-class-filter').value||String(candidate.class_code||'').trim()===$('absence-class-filter').value));
    if(absenceStudentId&&!options.some(row=>String(row.id)===absenceStudentId))absenceStudentId='';
    absencePicker?.setItems(options,absenceStudentId);
    const query=$('absence-search').value.trim().toLocaleLowerCase('vi');
    const candidates=new Map(cache.absences.map(candidate=>[String(candidate.id),candidate]));
    $('absence-table-body').querySelector('[data-absence-empty]')?.remove();
    $('absence-table-body').querySelectorAll('tr[data-candidate]').forEach(tr=>{
      const candidate=candidates.get(tr.dataset.candidate);
      tr.hidden=!candidate||!absenceMatches(candidate);
    });
    if(query||absenceStudentId||$('absence-grade-filter').value||$('absence-class-filter').value){
      const visible=$('absence-table-body').querySelector('tr[data-candidate]:not([hidden])');
      if(!visible&&cache.absences.length)$('absence-table-body').insertAdjacentHTML('beforeend','<tr data-absence-empty><td colspan="6" class="empty">Không có thí sinh phù hợp với bộ lọc.</td></tr>');
    }
    renderAbsenceReport();
  }
  function renderAbsenceReport(){
    const filter=$('absence-report-filter').value;
    const edited=new Map([...$('absence-table-body').querySelectorAll('tr[data-candidate]')]
      .map(tr=>[tr.dataset.candidate,tr]));
    const rows=cache.absences.map(candidate=>{
      const tr=edited.get(String(candidate.id));
      const absentAll=tr?tr.querySelector('[data-absence-all]').checked:candidate.absentAll;
      const absentSubjects=tr&&!absentAll
        ?[...absenceSubjectValues(tr),...(!tr.querySelector('[data-absence-remove-outside]')?.checked?candidate.outsideAbsences.map(row=>row.subject_code):[])]
        :absentAll?[]:candidate.absentSubjects;
      return {...candidate,absentAll,absentSubjects};
    }).filter(candidate=>{
      if(!absenceMatches(candidate))return false;
      if(filter==='all')return candidate.absentAll||candidate.absentSubjects.length>0;
      if(filter==='*')return candidate.absentAll;
      return candidate.absentAll||candidate.absentSubjects.includes(filter);
    });
    $('absence-report-body').innerHTML=rows.map(candidate=>{
      const scope=candidate.absentAll?'Toàn kỳ':candidate.absentSubjects.map(code=>esc(nameOf(code))).join(', ');
      return `<tr data-absence-report-candidate="${esc(candidate.id)}"><td>${esc(candidate.sbd||'')}</td><td>${esc(candidate.student_name)}</td><td>${esc(candidate.class_code||'')}</td><td>${scope}</td><td><button type="button" class="btn btn-light" data-absence-edit="${esc(candidate.id)}">Sửa</button> <button type="button" class="btn btn-light" data-absence-delete="${esc(candidate.id)}">Xóa báo vắng</button></td></tr>`;
    }).join('')||'<tr><td colspan="5" class="empty">Không có thí sinh vắng theo lựa chọn.</td></tr>';
  }
  function editReportedAbsence(candidateId){
    const candidate=cache.absences.find(row=>String(row.id)===String(candidateId));
    if(!candidate)return;
    $('absence-grade-filter').value=String(candidate.grade_code||'').trim();
    refreshAbsenceClassOptions(String(candidate.class_code||'').trim());
    $('absence-search').value='';absenceStudentId=String(candidate.id);
    applyAbsenceFilters();
    const row=[...$('absence-table-body').querySelectorAll('tr[data-candidate]')]
      .find(item=>item.dataset.candidate===String(candidateId));
    if(!row)return;
    row.scrollIntoView({behavior:'smooth',block:'center'});
    row.querySelector('[data-absence-all]').focus();
  }
  function clearReportedAbsence(candidateId){
    const row=[...$('absence-table-body').querySelectorAll('tr[data-candidate]')]
      .find(item=>item.dataset.candidate===String(candidateId));
    if(!row)return;
    row.querySelector('[data-absence-all]').checked=false;
    row.querySelectorAll('[data-absence-subject]').forEach(control=>{control.checked=false});
    row.querySelector('[data-absence-subjects]').disabled=false;
    const removeOutside=row.querySelector('[data-absence-remove-outside]');if(removeOutside)removeOutside.checked=true;
    row.querySelector('[data-absence-reason]').value='';
    absenceDirty=true;
    applyAbsenceFilters();
    message($('absence-message'),'Đã đánh dấu xóa báo vắng. Bấm “Lưu báo vắng” để xác nhận thay đổi.','info');
  }
  async function saveAbsences(){
    const examId=currentExam('absence-exam');setAdminExam(examId);
    if(examId!==absenceExamId||(state.selectedExam&&examId!==state.selectedExam))throw new Error('Kỳ thi đã đổi. Hãy tải lại danh sách trước khi lưu báo vắng.');
    const rows=[];
    const edited=new Map([...$('absence-table-body').querySelectorAll('tr[data-candidate]')].map(tr=>[tr.dataset.candidate,tr]));
    for(const candidate of cache.absences){
      const tr=edited.get(String(candidate.id));
      const absentAll=tr?tr.querySelector('[data-absence-all]').checked:candidate.absentAll;
      const reason=tr?tr.querySelector('[data-absence-reason]').value.trim():candidate.reason;
      const absentSubjects=tr?absenceSubjectValues(tr):candidate.absentSubjects;
      if(tr&&absentSubjects.some(code=>!candidate.allowedSubjects.includes(code)))throw new Error(`Có môn không thuộc cấu hình dự thi của lớp ${candidate.class_code}. Hãy tải lại danh sách.`);
      if(absentAll)rows.push({candidate_id:candidate.id,subject_code:'*',reason});
      else {
        for(const subjectCode of absentSubjects.filter(code=>candidate.allowedSubjects.includes(code)))rows.push({candidate_id:candidate.id,subject_code:subjectCode,reason});
        if(!tr?.querySelector('[data-absence-remove-outside]')?.checked)for(const item of candidate.outsideAbsences)rows.push({candidate_id:candidate.id,subject_code:item.subject_code,reason:item.reason||''});
      }
    }
    const{data,error}=await state.client.rpc('exam_save_absences',{p_exam_id:examId,p_rows:rows});
    if(error)throw new Error(`Không lưu được báo vắng. ${error.message}`);
    state.statisticsRevision=(state.statisticsRevision||0)+1;
    for(const candidate of cache.absences){
      candidate.outsideAbsences=candidate.outsideAbsences.filter(item=>rows.some(row=>row.candidate_id===candidate.id&&row.subject_code===item.subject_code));
      if(!candidate.outsideAbsences.length)edited.get(String(candidate.id))?.querySelector('[data-absence-outside-wrap]')?.remove();
    }
    absenceDirty=false;
    applyAbsenceFilters();
    message($('absence-message'),`Đã lưu ${data?.absence_count??rows.length} mục báo vắng.`, 'success');
  }

  function allSubjectOptions(){return [{code:'TOAN',name:nameOf('TOAN')},{code:'VAN',name:nameOf('VAN')},...subjects];}
  async function loadScriptConfigs(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const{data,error}=await state.client.from('exam_subject_assessment_configs')
      .select('*').eq('exam_id',examId).order('subject_code');
    if(error)throw new Error(`Không tải được cấu hình môn tự luận. Hãy chạy migration v0.1.59. ${error.message}`);
    cache.scriptConfigs=data||[];
    const essay=cache.scriptConfigs.filter(row=>row.is_essay);
    setSubjectOptions('script-subject',allSubjectOptions());
    if(!$('script-subject').value)$('script-subject').value=essay[0]?.subject_code||'TOAN';
    const selected=cache.scriptConfigs.find(row=>row.subject_code===$('script-subject').value);
    $('script-max-score').value=selected?.maximum_score??'';
    $('script-score-mode').value=selected?.score_step==null?'free':'step';
    $('script-score-step').value=selected?.score_step??'';
    $('script-score-step-wrap').classList.toggle('hidden',$('script-score-mode').value!=='step');
    $('script-decimals').value=selected?.decimal_places??2;
    $('script-default-score').value=selected?.default_score??'';
    $('script-mcq-max-score').value=selected?.mcq_maximum_score??10;
    await loadScriptRuns();
  }
  async function saveScriptConfig(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const code=$('script-subject').value;
    if(!code)throw new Error('Chọn môn cần cấu hình.');
    const stepMode=$('script-score-mode').value==='step';
    if(!Number.isFinite(Number($('script-max-score').value))||Number($('script-max-score').value)<=0||
      (stepMode&&(!Number.isFinite(Number($('script-score-step').value))||Number($('script-score-step').value)<=0))||
      !Number.isInteger(Number($('script-decimals').value))||Number($('script-decimals').value)<0||Number($('script-decimals').value)>3)
      throw new Error('Nhập điểm tối đa; nếu chọn theo quy cách, bước điểm phải dương; số chữ số thập phân từ 0 đến 3.');
    const payload={p_exam_id:examId,p_subject_code:code,p_is_essay:true,
      p_maximum_score:Number($('script-max-score').value),
      p_score_step:stepMode?Number($('script-score-step').value):null,
      p_decimal_places:Number($('script-decimals').value),
      p_default_score:$('script-default-score').value===''?null:Number($('script-default-score').value)};
    const invalid=payload.p_default_score===null?null:validateEssayScore(payload.p_default_score,{
      maximum_score:payload.p_maximum_score,score_step:payload.p_score_step
    });
    if(invalid)throw new Error(`Điểm mặc định không hợp lệ: ${invalid}`);
    const{error}=await state.client.rpc('exam_save_subject_assessment_config',payload);
    if(error)throw new Error(`Không lưu được cấu hình điểm: ${error.message}`);
    message($('script-message'),`Đã lưu thang điểm phần tự luận môn ${nameOf(code)}.`,'success');
    await loadScriptConfigs();
  }
  async function saveMcqMaximumScore(){
    const examId=currentExam('script-exam'),subjectCode=$('script-subject').value;
    const maximum=Number($('script-mcq-max-score').value);
    setAdminExam(examId);
    if(!subjectCode||!Number.isFinite(maximum)||maximum<=0)
      throw new Error('Chọn môn và nhập điểm tối đa trắc nghiệm lớn hơn 0.');
    const{error}=await state.client.rpc('exam_set_mcq_maximum_score',{
      p_exam_id:examId,p_subject_code:subjectCode,p_maximum_score:maximum
    });
    if(error)throw new Error(`Không lưu được điểm tối đa trắc nghiệm: ${error.message}`);
    message($('script-message'),`Đã lưu điểm tối đa trắc nghiệm ${maximum} cho môn ${nameOf(subjectCode)}.`,'success');
    await loadScriptConfigs();
  }
  async function loadScriptRuns(){
    const examId=currentExam('script-exam');if(!examId)return;
    const{data,error}=await state.client.from('exam_script_runs').select('*')
      .eq('exam_id',examId).order('created_at',{ascending:false});
    if(error)throw new Error(`Không tải được bảng quản lý phách: ${error.message}`);
    $('script-runs-body').innerHTML=(data||[]).map(run=>`<tr>
      <td>${esc(new Date(run.created_at).toLocaleString('vi-VN'))}</td><td>${esc(nameOf(run.subject_code))}</td>
      <td>${esc({room:'Theo phòng',bag:'Dồn túi',random:'Ngẫu nhiên'}[run.method]||run.method)}</td>
      <td>${esc(run.absence_mode==='gap'?'Cách phách':'Dồn phách')}</td><td>${esc(run.id)}</td>
      <td>${run.record_count}</td><td>${esc(run.status==='locked'?'Đã khóa':'Bản nháp')}</td>
      <td>${run.status==='locked'?`<button type="button" class="small-btn" data-script-export="${esc(run.id)}">Xuất phách</button> <button type="button" class="small-btn" data-script-assign="${esc(run.id)}">Phân công túi</button>`:
        `<button type="button" class="small-btn" data-script-lock="${esc(run.id)}">Khóa đánh phách</button>`} <button type="button" class="small-btn danger-btn" data-script-delete="${esc(run.subject_code)}">Xóa toàn bộ phách môn</button></td></tr>`).join('')||
      '<tr><td colspan="8" class="empty">Chưa có phương án phách.</td></tr>';
  }
  async function loadScriptRounds(examId){
    const roundSelect=$('script-round');
    if(!roundSelect)return;
    const rounds=examId?await loadExamRounds(state.client,examId):[];
    const previous=roundSelect.dataset.examId===examId?roundSelect.value:'';
    roundSelect.innerHTML='<option value="">-- Phân phòng cũ --</option>'+rounds.map(round=>
      `<option value="${esc(round.round_no)}">${esc(round.name||`Đợt ${round.round_no}`)}</option>`).join('');
    roundSelect.dataset.examId=examId||'';
    const available=rounds.map(round=>String(round.round_no));
    roundSelect.value=available.includes(previous)?previous:(available[0]||'');
  }
  async function loadScriptRooms(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const code=$('script-subject').value;if(!code)throw new Error('Chọn môn thi trước.');
    const roundNo=Number($('script-round')?.value||0)||null;
    let target=null,records=[];
    if(roundNo){
      const plans=await readPages(()=>state.client.from('exam_effective_rooming_round_plans')
        .select('id,round_no,plan_type,subject_code,assignments,created_at')
        .eq('exam_id',examId).eq('round_no',roundNo).eq('status','official').order('created_at',{ascending:false}));
      for(const plan of plans||[]){
        const rows=(Array.isArray(plan.assignments)?plan.assignments:[]).map(row=>({...row,subject_code:row.subject_code||plan.subject_code||''}));
        const relevant=rows.filter(row=>row.subject_code===code||row.ca1_subject_code===code||row.ca2_subject_code===code);
        if(relevant.length){target=plan;records=relevant.map(row=>({...row,room_code:row.ca1_subject_code===code?(row.ca1_room_code||row.room_code):row.ca2_subject_code===code?(row.ca2_room_code||row.room_code):row.room_code}));break}
      }
    }else{
      const finals=checkResult(await state.client.from('exam_rooming_finalizations').select('*')
        .eq('exam_id',examId).eq('is_current',true).order('finalized_at',{ascending:false}),'Không tải được phương án phòng');
      for(const finalization of finals||[]){
        const rows=await readPages(()=>state.client.from('exam_room_assignments')
          .select('candidate_id,room_code,sbd,subject_code,ca1_subject_code,ca2_subject_code')
          .eq('finalization_id',finalization.id).order('sbd'));
        const relevant=rows.filter(row=>row.subject_code===code||row.ca1_subject_code===code||row.ca2_subject_code===code);
        if(relevant.length){target=finalization;records=relevant;break}
      }
    }
    if(!target)throw new Error(`Chưa có phân phòng chính thức cho môn ${nameOf(code)}.`);
    cache.scriptFinalizationId=target.id;
    cache.scriptPlanId=roundNo?target.id:null;
    cache.scriptRoundNo=roundNo;
    const roomCodes=[...new Set(records.map(row=>row.room_code))]
      .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    if(roomCodes.length>26)throw new Error('Mỗi môn tối đa 26 phòng để mỗi phòng có một đầu phách là chữ cái riêng.');
    const usedHeads=new Set();
    cache.scriptRooms=roomCodes.map((room,index)=>{
        const phach_prefix=randomScriptHead(usedHeads);
        usedHeads.add(phach_prefix);
        return {room,position:index+1,reverse:false,phach_prefix,
          count:records.filter(row=>row.room_code===room).length};
      });
    $('script-room-order').innerHTML=`<table><thead><tr><th>Phòng</th><th>Đầu phách</th><th>Thứ tự túi</th><th>Đảo thứ tự trong phòng</th><th>Sĩ số môn</th></tr></thead><tbody>${cache.scriptRooms.map(item=>{
      const count=records.filter(row=>row.room_code===item.room).length;
      return `<tr data-script-room="${esc(item.room)}"><td>${esc(item.room)}</td><td><input type="text" maxlength="1" value="${item.phach_prefix}" data-room-prefix aria-label="Đầu phách phòng ${esc(item.room)}"></td>
        <td><input type="number" min="1" value="${item.position}" data-room-position></td>
        <td><input type="checkbox" data-room-reverse></td><td>${count}</td></tr>`;
    }).join('')}</tbody></table>`;
    message($('script-message'),`Đã tải ${cache.scriptRooms.length} phòng, ${records.length} lượt dự thi môn ${nameOf(code)}. Kiểm tra báo vắng trước khi tạo phách.`,'success');
  }
  async function createScriptRun(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    if(!cache.scriptFinalizationId||!cache.scriptRooms.length)await loadScriptRooms();
    const roomOrder=[...$('script-room-order').querySelectorAll('[data-script-room]')].map(row=>({
      room_code:row.dataset.scriptRoom,position:Number(row.querySelector('[data-room-position]').value),
      reverse:row.querySelector('[data-room-reverse]').checked,
      phach_prefix:row.querySelector('[data-room-prefix]').value.trim().toUpperCase()
    }));
    if(new Set(roomOrder.map(row=>row.position)).size!==roomOrder.length||
      roomOrder.some(row=>!Number.isInteger(row.position)||row.position<1||row.position>roomOrder.length))
      throw new Error('Mỗi phòng phải có một thứ tự túi riêng liên tục từ 1 đến số phòng.');
    if(roomOrder.some(row=>!/^[A-Z]$/.test(row.phach_prefix))||
      new Set(roomOrder.map(row=>row.phach_prefix)).size!==roomOrder.length)
      throw new Error('Đầu phách mỗi phòng phải là một chữ cái in hoa A–Z và không được trùng trong cùng môn.');
    if(cache.scriptRooms.some(room=>room.count>100))
      throw new Error('Mỗi phòng không được có quá 100 bài; hãy kiểm tra lại phương án phân phòng.');
    const{data,error}=await state.client.rpc('exam_create_script_run',{
      p_exam_id:examId,p_subject_code:$('script-subject').value,p_method:$('script-method').value,
      p_absence_mode:$('script-absence-mode').value,p_room_order:roomOrder,
      p_round_no:cache.scriptRoundNo
    });
    if(error)throw new Error(`Không tạo được phương án phách. ${error.message}`);
    message($('script-message'),`Đã tạo bản nháp phách ${data.run_id} (${data.record_count} bài, ${data.room_count} phòng). Kiểm tra rồi khóa để cố định mã phách.`, 'success');
    await loadScriptRuns();
  }
  async function lockScriptRun(runId){
    if(!confirm('Khóa phương án phách? Sau khi khóa, mã phách không thể sửa và sẽ được mở cho giám khảo được phân công.'))return;
    const{data,error}=await state.client.rpc('exam_lock_script_run',{p_run_id:runId});
    if(error)throw new Error(`Không khóa được phương án phách: ${error.message}`);
    message($('script-message'),`Đã khóa phách ${runId}.`, 'success');await loadScriptRuns();
  }
  async function exportScriptRun(runId){
    const{data:run,error:runError}=await state.client.from('exam_script_runs').select('*').eq('id',runId).single();
    if(runError)throw new Error(`Không tải được hồ sơ phách: ${runError.message}`);
    if(run.status!=='locked')throw new Error('Chỉ được xuất phách sau khi khóa.');
    const records=await readPages(()=>state.client.from('exam_script_records').select('*').eq('run_id',runId).order('script_order'));
    const candidates=await readPages(()=>state.client.from('exam_candidates')
      .select('id,sbd,student_code,student_name,class_code').eq('exam_id',run.exam_id));
    const byId=new Map(candidates.map(row=>[String(row.id),row]));
    const rows=records.map((record,index)=>({...byId.get(String(record.candidate_id)),...record,sequence:index+1}));
    const wb=window.XLSX.utils.book_new();
    const mapSheet=window.XLSX.utils.aoa_to_sheet([
      ['BẢO MẬT — BẢNG ÁNH XẠ PHÁCH / THÍ SINH'],
      ['Kỳ thi',state.exams.find(exam=>exam.id===run.exam_id)?.form_exam_title||''],
      ['Môn',nameOf(run.subject_code)],
      ['STT','Phách','SBD','Mã học sinh','Họ và tên','Lớp','Phòng','Vắng'],
      ...rows.map((row,index)=>[index+1,row.phach_code||'',row.sbd,row.student_code||'',row.student_name||'',row.class_code||'',row.room_code,row.is_absent?'Vắng':''])
    ]);
    const anonymous=window.XLSX.utils.aoa_to_sheet([
      ['STT','Phách','Điểm'],
      ...rows.filter(row=>!row.is_absent&&row.phach_code).map((row,index)=>[index+1,row.phach_code,''])
    ]);
    window.XLSX.utils.book_append_sheet(wb,mapSheet,'Bang anh xa bao mat');
    window.XLSX.utils.book_append_sheet(wb,anonymous,'Danh sach cham phach');
    window.XLSX.writeFile(wb,`phach-${run.exam_id}-${run.subject_code}.xlsx`,{cellStyles:true});
  }

  async function exportScriptHeads(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    if(!examId)throw new Error('Chọn kỳ thi trước khi xuất bảng đầu phách.');
    const{data:configs,error:configError}=await state.client.from('exam_subject_assessment_configs')
      .select('subject_code').eq('exam_id',examId).eq('is_essay',true);
    if(configError)throw new Error(`Không tải được danh sách môn tự luận: ${configError.message}`);
    const essaySubjects=new Set((configs||[]).map(config=>config.subject_code));
    const{data:runs,error:runsError}=await state.client.from('exam_script_runs')
      .select('subject_code,method,room_order,status,locked_at,created_at')
      .eq('exam_id',examId).eq('status','locked').eq('method','room')
      .order('locked_at',{ascending:false});
    if(runsError)throw new Error(`Không tải được các phương án phách đã khóa: ${runsError.message}`);
    const latestRuns=new Map();
    for(const run of runs||[]){
      if(essaySubjects.has(run.subject_code)&&!latestRuns.has(run.subject_code))
        latestRuns.set(run.subject_code,run);
    }
    const rows=[...latestRuns.entries()].flatMap(([subjectCode,run])=>
      (Array.isArray(run.room_order)?run.room_order:[]).map(room=>({
        subject:nameOf(subjectCode),
        room:String(room.room_code||''),
        head:String(room.phach_prefix||''),
        position:Number(room.position)||0
      })).filter(row=>row.room&&row.head)
        .sort((a,b)=>a.position-b.position||a.room.localeCompare(b.room,'vi',{numeric:true}))
        .map(({subject,room,head})=>[subject,room,head])
    ).sort((a,b)=>a[0].localeCompare(b[0],'vi')||a[1].localeCompare(b[1],'vi',{numeric:true}));
    if(!rows.length)throw new Error('Chưa có phương án phách theo phòng đã khóa cho các môn tự luận.');
    const wb=window.XLSX.utils.book_new();
    const sheet=window.XLSX.utils.aoa_to_sheet([
      ['BẢNG TỔNG HỢP ĐẦU PHÁCH THEO PHÒNG'],
      ['Môn','Phòng','Đầu phách'],
      ...rows
    ]);
    window.XLSX.utils.book_append_sheet(wb,sheet,'Tong hop dau phach');
    window.XLSX.writeFile(wb,`bang-dau-phach-${examId}.xlsx`);
  }

  async function assignGrader(){
    const userId=$('grader-user-id').value.trim(),subjectCode=$('grader-assign-subject').value;
    if(!uuidPattern.test(userId))throw new Error('Chọn tài khoản giáo viên.');
    if(!subjectCode)throw new Error('Chọn môn phụ trách.');
    const profile=cache.graderProfiles.find(row=>row.user_id===userId);
    if(profile?.role==='admin')throw new Error('Hãy dùng Quản lý tài khoản để thay đổi vai trò Admin.');
    if(profile?.subject_code&&profile.subject_code!==subjectCode&&!confirm('Đổi môn phụ trách sẽ ngừng quyền chấm môn cũ. Tiếp tục?'))return;
    const{error}=await state.client.rpc('exam_set_account_role',{
      p_user_id:userId,p_role:'grader',p_subject_code:subjectCode
    });
    if(error)throw new Error(`Không lưu được môn giáo viên: ${error.message}`);
    message($('script-message'),'Đã lưu môn phụ trách trong danh mục dùng chung. Chọn giáo viên hoặc nhóm khi giao túi bài.','success');
    await loadGraderAccounts();
  }

  async function loadGraderAccounts(){
    const subjectCode=$('grader-assign-subject').value;
    if(!subjectCode)return;
    const{data,error}=await state.client.rpc('exam_manage_accounts');
    if(error)throw new Error(`Không tải được danh mục giáo viên: ${error.message}`);
    cache.graderBagAssignments=(data||[]).filter(row=>row.role==='grader'&&row.subject_code===subjectCode);
    const{data:profiles,error:profileError}=await state.client.from('exam_user_profiles')
      .select('user_id,email,full_name,teacher_code').order('full_name');
    if(profileError)throw new Error(`Không tải được danh sách tài khoản. Hãy chạy migration v0.1.63. ${profileError.message}`);
    cache.graderProfiles=(data||[]).map(account=>({...((profiles||[]).find(row=>row.user_id===account.user_id)||{}),...account}));
    const selected=$('grader-user-id').value;
    $('grader-user-id').innerHTML='<option value="">-- Chọn tài khoản đã đăng nhập --</option>'+cache.graderProfiles.map(profile=>
      `<option value="${esc(profile.user_id)}">${esc([profile.teacher_code,profile.full_name,profile.email].filter(Boolean).join(' · ')||profile.user_id)}</option>`).join('');
    if(cache.graderProfiles.some(profile=>profile.user_id===selected))$('grader-user-id').value=selected;
    const assigned=new Set(cache.graderBagAssignments.map(row=>row.user_id));
    $('grader-account-list').innerHTML=`<table><thead><tr><th>Mã định danh</th><th>Giáo viên</th><th>Email đăng nhập</th><th>Vai trò môn hiện tại</th><th></th></tr></thead><tbody>${cache.graderProfiles.map(profile=>
      `<tr><td>${esc(profile.teacher_code||'—')}</td><td>${esc(profile.full_name||'—')}</td><td>${esc(profile.email||'—')}</td><td>${assigned.has(profile.user_id)?'Giám khảo':'Chưa phân công'}</td><td>Thay đổi tại Quản lý tài khoản</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Chưa có tài khoản đăng nhập Google/email.</td></tr>'}</tbody></table>`;
    await loadGraderGroups();
  }

  async function saveGraderProfile(){
    const userId=$('grader-user-id').value;
    if(!uuidPattern.test(userId))throw new Error('Chọn tài khoản giáo viên đã đăng nhập.');
    const{error}=await state.client.rpc('exam_save_grader_profile',{
      p_user_id:userId,p_full_name:$('grader-full-name').value.trim(),
      p_teacher_code:$('grader-teacher-code').value.trim()
    });
    if(error)throw new Error(`Không lưu được thông tin giáo viên: ${error.message}`);
    message($('script-message'),'Đã lưu tên và mã định danh giáo viên.','success');
    await loadGraderAccounts();
  }

  async function loadGraderGroups(){
    const subjectCode=$('grader-assign-subject').value;
    const groupSelect=$('grader-group-select'),membersSelect=$('grader-group-members');
    cache.graderGroups=[];
    if(!subjectCode){
      groupSelect.innerHTML='<option value="">-- Tạo nhóm mới --</option>';
      membersSelect.innerHTML='';
      return;
    }
    const{data:groups,error}=await state.client.from('exam_grader_groups').select('id,name')
      .eq('subject_code',subjectCode).order('name');
    if(error)throw new Error(`Không tải được nhóm giám khảo: ${error.message}`);
    cache.graderGroups=groups||[];
    const{data:members,error:memberError}=cache.graderGroups.length
      ?await state.client.from('exam_grader_group_members').select('group_id,user_id')
        .in('group_id',cache.graderGroups.map(group=>group.id))
      :{data:[],error:null};
    if(memberError)throw new Error(`Không tải được thành viên nhóm: ${memberError.message}`);
    const membersByGroup=new Map();
    for(const member of members||[]){
      if(!membersByGroup.has(member.group_id))membersByGroup.set(member.group_id,[]);
      membersByGroup.get(member.group_id).push(member.user_id);
    }
    for(const group of cache.graderGroups)group.user_ids=membersByGroup.get(group.id)||[];
    const previous=groupSelect.value;
    groupSelect.innerHTML='<option value="">-- Tạo nhóm mới --</option>'+cache.graderGroups.map(group=>
      `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('');
    if(cache.graderGroups.some(group=>group.id===previous))groupSelect.value=previous;
    membersSelect.innerHTML=cache.graderBagAssignments.map(({user_id})=>{
      const profile=cache.graderProfiles.find(row=>row.user_id===user_id);
      return `<option value="${esc(user_id)}">${esc([profile?.teacher_code,profile?.full_name,profile?.email].filter(Boolean).join(' · ')||user_id)}</option>`;
    }).join('');
    renderSelectedGroup();
  }

  function renderSelectedGroup(){
    const group=cache.graderGroups.find(row=>row.id===$('grader-group-select').value);
    $('grader-group-name').value=group?.name||'';
    $('grader-group-delete').disabled=!group;
    const selected=new Set(group?.user_ids||[]);
    for(const option of $('grader-group-members').options)option.selected=selected.has(option.value);
  }

  async function saveGraderGroup(){
    const subjectCode=$('grader-assign-subject').value;
    const userIds=[...$('grader-group-members').selectedOptions].map(option=>option.value);
    if(!subjectCode)throw new Error('Chọn môn trước khi lưu nhóm.');
    if(!userIds.length)throw new Error('Chọn ít nhất một giám khảo cùng môn cho nhóm.');
    const{data,error}=await state.client.rpc('exam_save_grader_group',{
      p_exam_id:null,p_subject_code:subjectCode,
      p_group_id:$('grader-group-select').value||null,
      p_name:$('grader-group-name').value.trim(),p_user_ids:userIds
    });
    if(error)throw new Error(`Không lưu được nhóm giám khảo: ${error.message}`);
    message($('script-message'),'Đã lưu nhóm giám khảo. Có thể giao nhóm cho túi bài trong phương án phách đã khóa.','success');
    await loadGraderGroups();
    $('grader-group-select').value=data;
    renderSelectedGroup();
  }

  async function deleteGraderGroup(){
    const group=cache.graderGroups.find(row=>row.id===$('grader-group-select').value);
    if(!group)throw new Error('Chọn nhóm cần xóa.');
    if(!confirm(`Xóa nhóm "${group.name}"? Nhóm đang được giao túi không thể xóa.`))return;
    const{error}=await state.client.rpc('exam_delete_grader_group',{p_group_id:group.id});
    if(error)throw new Error(`Không xóa được nhóm: ${error.message}`);
    message($('script-message'),`Đã xóa nhóm ${group.name}.`,'success');
    await loadGraderGroups();
  }
  async function showBagAssignments(runId){
    const{data:run,error:runError}=await state.client.from('exam_script_runs').select('*').eq('id',runId).single();
    if(runError)throw new Error(`Không tải được phương án phách: ${runError.message}`);
    if(run.status!=='locked')throw new Error('Chỉ phương án phách đã khóa mới được phân công theo túi.');
    const records=await readPages(()=>state.client.from('exam_script_records')
      .select('room_code').eq('run_id',runId).order('room_code'));
    const rooms=[...new Set(records.map(row=>row.room_code))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    const{data:graders,error:graderError}=await state.client.rpc('exam_manage_accounts');
    if(graderError)throw new Error(`Không tải được giám khảo môn ${nameOf(run.subject_code)}: ${graderError.message}`);
    const graderIds=[...new Set((graders||[]).filter(row=>row.role==='grader'&&row.subject_code===run.subject_code).map(row=>row.user_id))];
    const{data:profiles,error:profileError}=graderIds.length
      ?await state.client.from('exam_user_profiles').select('user_id,email,full_name,teacher_code').in('user_id',graderIds)
      :{data:[],error:null};
    if(profileError)throw new Error(`Không tải được thông tin giám khảo: ${profileError.message}`);
    const{data:groups,error:groupsError}=await state.client.from('exam_grader_groups')
      .select('id,name').eq('subject_code',run.subject_code).order('name');
    if(groupsError)throw new Error(`Không tải được nhóm giám khảo: ${groupsError.message}`);
    const{data:assigned,error:assignedError}=await state.client.from('exam_script_bag_assignments')
      .select('room_code,user_id,group_id,assignment_method').eq('run_id',runId);
    if(assignedError)throw new Error(`Không tải được phân công túi. Hãy chạy migration v0.1.62. ${assignedError.message}`);
    const assignmentByRoom=new Map((assigned||[]).map(row=>[row.room_code,{
      value:row.user_id?`user:${row.user_id}`:row.group_id?`group:${row.group_id}`:'',
      method:row.assignment_method
    }]));
    const graderOptions=graderIds.map(id=>{
      const profile=(profiles||[]).find(item=>item.user_id===id);
      const label=[profile?.teacher_code,profile?.full_name,profile?.email].filter(Boolean).join(' · ')||id;
      return `<option value="user:${esc(id)}">${esc(label)}</option>`;
    }).join('');
    const groupOptions=(groups||[]).map(group=>`<option value="group:${esc(group.id)}">Nhóm: ${esc(group.name)}</option>`).join('');
    const panel=$('script-bag-assignment');
    panel.classList.remove('hidden');
    panel.innerHTML=`<h3>Phân công giám khảo theo túi — ${esc(nameOf(run.subject_code))}</h3>
      <p>Chọn giáo viên hoặc nhóm cùng môn từ danh mục dùng chung. Túi chưa giao không được nhập điểm.</p>
      <table><thead><tr><th>Túi / phòng</th><th>Giám khảo hoặc nhóm</th></tr></thead><tbody>${rooms.map(room=>
        `<tr><td>${esc(room)}${assignmentByRoom.get(room)?.method==='draw'?' · bốc thăm':''}</td><td><select data-bag-room="${esc(room)}"><option value="">Chưa giao (không được nhập điểm)</option>${graderOptions}${groupOptions}</select></td></tr>`).join('')}</tbody></table>
      <div class="form-actions"><button type="button" class="btn btn-light" id="draw-bag-assignments">Bốc thăm đều cho giám khảo</button><button type="button" class="btn btn-primary" id="save-bag-assignments">Lưu phân công túi</button>
      <button type="button" class="btn btn-light" id="close-bag-assignments">Đóng</button></div>`;
    for(const select of panel.querySelectorAll('[data-bag-room]')){
      const assignment=assignmentByRoom.get(select.dataset.bagRoom);
      if(assignment)select.value=assignment.value;
    }
    $('close-bag-assignments').onclick=()=>panel.classList.add('hidden');
    $('draw-bag-assignments').onclick=async event=>{
      const button=event.currentTarget;
      if(!confirm('Bốc thăm ngẫu nhiên, chia số túi gần như bằng nhau giữa các giám khảo đang được phân môn và thay thế mọi phân công túi hiện tại?'))return;
      button.disabled=true;
      try{
        const{data,error}=await state.client.rpc('exam_draw_script_bag_assignments',{p_run_id:runId});
        if(error)throw new Error(`Không bốc thăm được phân công: ${error.message}`);
        message($('script-message'),`Đã bốc thăm ${data.assigned_bag_count} túi cho ${data.grader_count} giám khảo; kết quả đã được lưu nhật ký.`,'success');
        await showBagAssignments(runId);
      }catch(error){message($('script-message'),error?.message||String(error),'error')}
      finally{button.disabled=false}
    };
    $('save-bag-assignments').onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{
        const rows=[...panel.querySelectorAll('[data-bag-room]')].filter(select=>select.value)
          .map(select=>{
            const [type,id]=select.value.split(':');
            return {room_code:select.dataset.bagRoom,user_id:type==='user'?id:null,group_id:type==='group'?id:null};
          });
        const{error}=await state.client.rpc('exam_set_script_bag_assignments',{p_run_id:runId,p_rows:rows});
        if(error)throw new Error(`Không lưu được phân công túi: ${error.message}`);
        message($('script-message'),rows.length
          ?`Đã phân công ${rows.length} túi cho giám khảo/nhóm. Các túi chưa gán không được nhập điểm.`
          :'Đã bỏ phân công; các túi chưa giao không được nhập điểm.','success');
        panel.classList.add('hidden');
      }catch(error){message($('script-message'),error?.message||String(error),'error')}
      finally{button.disabled=false}
    };
  }

  async function deleteSubjectScriptRuns(subjectCode){
    const examId=currentExam('script-exam');
    setAdminExam(examId);
    const confirmation=prompt(`Thao tác này xóa tất cả phương án phách và điểm tự luận của môn ${nameOf(subjectCode)}. Nhập chính xác mã môn ${subjectCode} để xác nhận:`);
    if(confirmation===null)return;
    if(confirmation.trim().toUpperCase()!==subjectCode)
      throw new Error('Mã xác nhận không khớp; chưa xóa dữ liệu.');
    const{data,error}=await state.client.rpc('exam_delete_script_runs',{
      p_exam_id:examId,p_subject_code:subjectCode,p_confirmation:confirmation.trim().toUpperCase()
    });
    if(error)throw new Error(`Không xóa được phách môn ${nameOf(subjectCode)}: ${error.message}`);
    message($('script-message'),`Đã xóa ${data.deleted_runs} phương án, ${data.deleted_records} bản ghi phách và ${data.deleted_scores} điểm tự luận của môn ${nameOf(subjectCode)}.`, 'success');
    await loadScriptRuns();
  }

  let scoresExamId='',scoreRevision=0,scoreImportContext=null,combinedContext=null;
  const scoreKey=()=>JSON.stringify([state.selectedExam||'',$('scores-subject').value]);
  const statisticsKey=()=>JSON.stringify([scoreKey(),!!$('scores-include-absent').checked,!!$('scores-include-violations').checked]);
  const importKey=()=>JSON.stringify([scoreKey(),$('scores-sbd-column').value,$('scores-mcq-column').value,$('scores-first-row').value]);
  function resetScores(){
    ++scoreRevision;scoreImportContext=null;combinedContext=null;
    cache.scoreImportRows=[];cache.combinedScores=[];
    cache.subjectStatistics=null;
    for(const id of ['scores-preview','scores-results','scores-summary','scores-class-results'])$(id).innerHTML='';
    $('scores-result-controls').hidden=true;
    $('scores-import').disabled=true;$('scores-export').disabled=true;
  }

  function combinedRowFilter(row){
    const status=$('scores-result-status').value;
    const text=$('scores-result-search').value.trim().toLocaleLowerCase('vi');
    if($('scores-result-class').value&&row.class_code!==$('scores-result-class').value)return false;
    if(status==='complete'&&row.total_score===null)return false;
    if(status==='missing'&&(row.is_absent||(!row.essay_missing&&!row.mcq_missing)))return false;
    if(status==='absent'&&!row.is_absent)return false;
    if(status==='no-paper'&&!row.no_paper)return false;
    return !text||[row.sbd,row.student_code,row.student_name,row.class_code].some(value=>String(value||'').toLocaleLowerCase('vi').includes(text));
  }

  function renderCombinedScores(){
    const rows=cache.combinedScores.filter(combinedRowFilter);
    $('scores-result-count').textContent=`Hiển thị ${rows.length}/${cache.combinedScores.length} thí sinh trong vùng cuộn bên dưới.`;
    $('scores-results').innerHTML=`<table><thead><tr><th>SBD</th><th>Họ và tên</th><th>Lớp</th><th>Tự luận</th><th>Trắc nghiệm</th><th>Tổng gốc</th><th>Trạng thái</th><th>Điểm thống kê</th><th>Xử lý thống kê</th></tr></thead><tbody>${rows.map(row=>{
      const completeScore=row.total_score!==null;
      const status=subjectResultStatus(row);
      return `<tr><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.class_code)}</td><td>${displayExamScore(row.essay_score)}</td><td>${displayExamScore(row.mcq_score)}</td><td>${completeScore?displayExamScore(row.total_score):''}</td><td>${status}</td><td>${displayExamScore(row.statistics_score)}</td><td>${esc(subjectStatisticsReason(row))}</td></tr>`;
    }).join('')||'<tr><td colspan="9" class="empty">Không có thí sinh phù hợp bộ lọc.</td></tr>'}</tbody></table>`;
  }

  function showCombinedScoreControls(){
    const select=$('scores-result-class'),selected=select.value;
    const classes=[...new Set(cache.combinedScores.map(row=>row.class_code).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'vi',{numeric:true}));
    select.innerHTML='<option value="">Tất cả lớp</option>'+classes.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
    select.value=classes.includes(selected)?selected:'';
    $('scores-result-controls').hidden=false;
  }
  async function loadScoreMode(){
    const examId=state.selectedExam,subject=$('scores-subject').value,key=scoreKey();
    setAdminExam(examId);if(!subject)throw new Error('Chọn môn thi.');
    const{data,error}=await state.client.from('exam_subject_assessment_configs')
      .select('score_mode,is_essay').eq('exam_id',examId).eq('subject_code',subject).single();
    if(error)throw new Error(`Chưa đọc được hình thức tính điểm. Kiểm tra SQL 143 và cấu hình môn. ${error.message}`);
    if(key!==scoreKey())return;
    $('scores-mode').value=data.score_mode||(data.is_essay?'combined':'mcq');
  }
  async function saveScoreMode(){
    const examId=state.selectedExam,subject=$('scores-subject').value,mode=$('scores-mode').value,key=scoreKey();
    setAdminExam(examId);if(!subject||!mode)throw new Error('Chọn môn và hình thức tính điểm.');
    const{error}=await state.client.rpc('exam_set_subject_score_mode',{p_exam_id:examId,p_subject_code:subject,p_score_mode:mode});
    if(error)throw new Error(error.message);
    state.statisticsRevision=(state.statisticsRevision||0)+1;
    if(key!==scoreKey())return;
    resetScores();$('scores-mode').value=mode;
    message($('scores-message'),'Đã lưu hình thức. Nhấn Tải điểm tổng hợp để xem kết quả.','success');
  }
  function refreshScores(){
    const examId=state.selectedExam||'';
    if(scoresExamId!==examId){resetScores();scoresExamId=examId;$('scores-file').value='';$('scores-mode').value='';}
    $('scores-exam').value=examId;
    const exam=state.exams.find(row=>row.id===examId);
    if($('scores-exam-label'))$('scores-exam-label').textContent=exam?'Kỳ thi đang chọn: '+exam.name+' ('+exam.school_year+')':'Chọn kỳ thi tại tab Kỳ thi trước khi nhập hoặc tổng hợp điểm.';
    for(const id of ['scores-read-file','scores-load'])$(id).disabled=!examId;
  }

  function renderScorePreview(){
    const rows=cache.scoreImportRows.slice(0,25);
    $('scores-preview').innerHTML=rows.length
      ?`<h3>Xem trước ${Math.min(25,cache.scoreImportRows.length)}/${cache.scoreImportRows.length} dòng trắc nghiệm</h3><table><thead><tr><th>SBD</th><th>Điểm trắc nghiệm</th></tr></thead><tbody>${rows.map(row=>
        `<tr><td>${esc(row.sbd)}</td><td>${esc(row.score)}</td></tr>`).join('')}</tbody></table>`
      :'';
    $('scores-import').disabled=!cache.scoreImportRows.length;
  }

  async function readMultipleChoiceFile(){
    const examId=(state.selectedExam||''),subjectCode=$('scores-subject').value;
    setAdminExam(examId);
    if(!subjectCode)throw new Error('Chọn môn thi cần nhập điểm.');
    const file=$('scores-file').files?.[0];
    if(!file)throw new Error('Chọn tệp Excel hoặc CSV kết quả trắc nghiệm.');
    resetScores();
    const revision=scoreRevision,key=importKey();
    const sbdIndex=excelColumnIndex($('scores-sbd-column').value);
    const scoreIndex=excelColumnIndex($('scores-mcq-column').value);
    if(sbdIndex===scoreIndex)throw new Error('Cột SBD và cột điểm phải khác nhau.');
    const firstRow=Number($('scores-first-row').value);
    if(!Number.isInteger(firstRow)||firstRow<1)throw new Error('Dòng dữ liệu đầu tiên phải là số nguyên từ 1.');
    const workbook=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
    const sheet=workbook.Sheets[workbook.SheetNames[0]];
    if(!sheet)throw new Error('Tệp không có trang tính dữ liệu.');
    const matrix=window.XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});
    const rows=[];
    for(let index=firstRow-1;index<matrix.length;index++){
      const cells=matrix[index]||[];
      const rawSbd=cells[sbdIndex],rawScore=cells[scoreIndex];
      if(String(rawSbd??'').trim()===''&&String(rawScore??'').trim()==='')continue;
      const rowNumber=index+1,sbd=String(rawSbd??'').trim().replace(/\.0$/,'');
      if(!/^(?:\d{6}|\d{8})$/.test(sbd))throw new Error(`SBD ở dòng ${rowNumber} phải gồm 6 hoặc 8 chữ số.`);
      const score=parseImportedScore(rawScore,rowNumber);
      rows.push({sbd,score});
    }
    if(!rows.length)throw new Error('Không tìm thấy dòng điểm nào trong vùng đã chọn.');
    const uniqueSbd=new Set(rows.map(row=>row.sbd));
    if(uniqueSbd.size!==rows.length)throw new Error('Tệp có SBD bị lặp; hãy sửa tệp trước khi nhập.');
    const{data:config,error}=await state.client.from('exam_subject_assessment_configs')
      .select('mcq_maximum_score,score_mode').eq('exam_id',examId).eq('subject_code',subjectCode).single();
    if(error)throw new Error(`Không tải được điểm tối đa trắc nghiệm. Hãy lưu cấu hình môn trước. ${error.message}`);
    if(config.score_mode==='essay')throw new Error('Môn chỉ tự luận lấy điểm qua phách, không nhập trắc nghiệm tại đây.');
    const outOfRange=rows.find(row=>row.score>Number(config.mcq_maximum_score));
    if(outOfRange)throw new Error(`Điểm ${outOfRange.score} của SBD ${outOfRange.sbd} vượt mức tối đa ${config.mcq_maximum_score}.`);
    if(revision!==scoreRevision||key!==importKey()||file!==$('scores-file').files?.[0])return;
    scoreImportContext={key,file};
    cache.scoreImportRows=rows;
    renderScorePreview();
    message($('scores-message'),`Đã kiểm tra ${rows.length} dòng. Khi nhập, điểm hiện có của các SBD này sẽ được cập nhật theo tệp mới.`,'success');
  }

  async function importMultipleChoiceScores(){
    const examId=(state.selectedExam||''),subjectCode=$('scores-subject').value,file=$('scores-file').files?.[0];
    setAdminExam(examId);
    if(!scoreImportContext||scoreImportContext.key!==importKey()||scoreImportContext.file!==file||!cache.scoreImportRows.length||!file)throw new Error('Hãy đọc và kiểm tra tệp trước khi nhập điểm.');
    if(!confirm(`Nhập ${cache.scoreImportRows.length} điểm trắc nghiệm môn ${nameOf(subjectCode)}? Điểm đã nhập của các SBD này sẽ bị thay bằng dữ liệu mới.`))return;
    const key=scoreKey(),revision=scoreRevision;
    const{data,error}=await state.client.rpc('exam_import_mcq_scores',{
      p_exam_id:examId,p_subject_code:subjectCode,p_source_file:file.name,
      p_rows:cache.scoreImportRows
    });
    if(error)throw new Error(`Không nhập được điểm trắc nghiệm: ${error.message}`);
    state.statisticsRevision=(state.statisticsRevision||0)+1;
    if(key!==scoreKey()||revision!==scoreRevision)return;
    message($('scores-message'),`Đã nhập ${data.imported_count} điểm trắc nghiệm môn ${nameOf(subjectCode)}.`,'success');
    await loadCombinedScores();
  }

  async function loadCombinedScores(){
    const examId=(state.selectedExam||''),subjectCode=$('scores-subject').value;
    setAdminExam(examId);
    if(!subjectCode)throw new Error('Chọn môn thi cần tổng hợp.');
    const key=statisticsKey(),revision=scoreRevision;
    const{data,error}=await state.client.rpc('exam_get_subject_statistics',{
      p_exam_id:examId,p_subject_code:subjectCode,
      p_include_absent:!!$('scores-include-absent').checked,p_include_violations:!!$('scores-include-violations').checked
    });
    if(error)throw new Error(`Không tải được điểm tổng hợp: ${error.message}`);
    if(key!==statisticsKey()||revision!==scoreRevision)return;
    combinedContext=key;
    cache.subjectStatistics=data;
    cache.combinedScores=data?.rows||[];
    if(cache.combinedScores.length)$('scores-mode').value=cache.combinedScores[0].score_mode;
    const missingEssay=cache.combinedScores.filter(row=>row.essay_missing).length;
    const missingMcq=cache.combinedScores.filter(row=>row.mcq_missing).length;
    const complete=cache.combinedScores.filter(row=>row.total_score!==null).length;
    $('scores-summary').innerHTML=[
      ['Thí sinh',cache.combinedScores.length],['Đã đủ điểm',complete],
      ['Thiếu điểm tự luận',missingEssay],['Thiếu điểm trắc nghiệm',missingMcq],
      ['Được tính thống kê',data?.summary?.included_count??0],['Loại khỏi thống kê',data?.summary?.excluded_count??0],
      ['Điểm TB thống kê',data?.summary?.average_score==null?'—':Number(data.summary.average_score).toFixed(3)]
    ].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    showCombinedScoreControls();
    renderCombinedScores();
    $('scores-class-results').innerHTML=`<h3>Thống kê môn theo lớp</h3><table><thead><tr><th>Lớp</th><th>Dự thi</th><th>Được tính</th><th>Loại</th><th>Điểm TB</th></tr></thead><tbody>${(data?.classes||[]).map(row=>`<tr><td>${esc(row.class_code)}</td><td>${row.candidates}</td><td>${row.included_count}</td><td>${row.excluded_count}</td><td>${row.average_score==null?'—':Number(row.average_score).toFixed(3)}</td></tr>`).join('')}</tbody></table>`;
    $('scores-export').disabled=!cache.combinedScores.length;
  }

  function exportCombinedScores(){
    if(combinedContext!==statisticsKey()||!cache.combinedScores.length)throw new Error('Chưa có điểm tổng hợp để xuất.');
    const rows=[
      ['SBD','Mã học sinh','Họ và tên','Lớp','Điểm tự luận','Điểm trắc nghiệm','Tổng gốc','Trạng thái','Điểm thống kê','Xử lý thống kê'],
      ...cache.combinedScores.map(row=>[
        row.sbd,row.student_code,row.student_name,row.class_code,row.essay_score??'',
        row.mcq_score??'',row.total_score??'',
        subjectResultStatus(row),row.statistics_score??'',subjectStatisticsReason(row)
      ])
    ];
    const wb=window.XLSX.utils.book_new(),ws=window.XLSX.utils.aoa_to_sheet(rows);
    for(let r=1;r<rows.length;r++)for(const c of [4,5,6,8]){const address=window.XLSX.utils.encode_cell({r,c});if(ws[address]?.t==='n')ws[address].z='0.00'}
    window.XLSX.utils.book_append_sheet(wb,ws,'Tong hop diem');
    const classRows=[['Lớp','Dự thi','Được tính','Loại','Điểm TB'],...(cache.subjectStatistics?.classes||[]).map(r=>[r.class_code,r.candidates,r.included_count,r.excluded_count,r.average_score??''])];
    const classSheet=window.XLSX.utils.aoa_to_sheet(classRows);for(let r=1;r<classRows.length;r++){const cell=classSheet[window.XLSX.utils.encode_cell({r,c:4})];if(cell?.t==='n')cell.z='0.000'}
    window.XLSX.utils.book_append_sheet(wb,classSheet,'Thong ke lop');
    window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.aoa_to_sheet([
      ['Tính học sinh vắng',!!$('scores-include-absent').checked],['Tính học sinh vi phạm',!!$('scores-include-violations').checked]
    ]),'Lua chon thong ke');
    window.XLSX.writeFile(wb,`tong-hop-diem-${(state.selectedExam||'')}-${$('scores-subject').value}.xlsx`);
  }

  async function enterAsGrader(){
    ++graderQueueRequest;graderWindow=null;clearInterval(graderWindowTimer);
    cache.graderQueue=[];cache.graderIndex=0;renderGraderQueue();
    const{data,error}=await state.client.rpc('exam_list_grading_work');
    if(error)throw new Error(error.code==='PGRST202'?'Cơ sở dữ liệu chưa cập nhật chức năng nhập điểm. Liên hệ quản trị chạy migration v0.1.119.':`Không tải được danh sách kỳ thi/môn được giao: ${error.message}`);
    cache.graderWork=data||[];
    if(!cache.graderWork.length)message($('grader-message'),state.role==='admin'?'Đang xem giao diện bằng tài khoản Admin. Để nhập điểm, đăng nhập tài khoản giáo viên đã được gán môn và kỳ thi.':'Chưa có bài được giao. Liên hệ quản trị để gán môn, cấp quyền kỳ thi và khóa phương án phách.','info');
    $('grader-exam').innerHTML='<option value="">-- Chọn kỳ thi --</option>'+[...new Map(cache.graderWork.map(work=>[work.exam_id,work])).values()]
      .map(work=>`<option value="${esc(work.exam_id)}">${esc(work.exam_title)}</option>`).join('');
    $('grader-subject').innerHTML='<option value="VAN">Ngữ văn (VAN)</option>';
    $('grader-table-body').innerHTML='<tr><td colspan="6" class="empty">Chọn kỳ thi và đầu phách.</td></tr>';
    $('user-email').textContent=state.session?.user?.email||'';
  }
  function selectedGraderConfig(){
    return cache.graderWork.find(work=>work.exam_id===$('grader-exam').value&&work.subject_code===$('grader-subject').value);
  }
  let graderWindow=null,graderWindowTimer=null,graderQueueRequest=0,graderSaving=false,graderBagEditing=false;
  function updateGraderWindow(){
    const now=Date.now()+(graderWindow?.offset||0);
    const open=!!graderWindow&&Number.isFinite(graderWindow.start)&&Number.isFinite(graderWindow.end)
      &&now>=graderWindow.start&&now<=graderWindow.end;
    const notice=$('grader-window-status');
    if(notice)notice.textContent=!graderWindow?'Chưa có thời hạn nhập điểm.':
      `${open?'Đang mở nhập điểm':'Ngoài thời hạn nhập điểm'}: ${new Date(graderWindow.start).toLocaleString('vi-VN')} – ${new Date(graderWindow.end).toLocaleString('vi-VN')}.`;
    for(const id of ['grader-save-all','grader-edit-bag']){
      const control=$(id);
      if(control)control.disabled=!open||graderSaving||!cache.graderQueue.length||(id==='grader-save-all'&&!graderBagEditing)||(id==='grader-edit-bag'&&graderBagEditing);
    }
    const useDefault=$('grader-use-default');
    if(useDefault)useDefault.disabled=!open||graderSaving||!graderBagEditing||!cache.graderQueue.length;
    return open;
  }
  function renderGraderQueue(){
    $('grader-table-body').innerHTML=cache.graderQueue.map((row,index)=>`<tr data-grader-index="${index}" class="${index===cache.graderIndex?'roster-dirty':''}">
      <td>${index+1}</td><td>${esc(row.phach_code)}</td>
      <td><input class="grader-row-score" data-grader-score="${index}" type="text" inputmode="decimal" value="${row.draftScore??row.score??''}" ${!graderBagEditing||row.draftNoPaper||row.no_paper?'disabled':''} aria-label="Điểm mã phách ${esc(row.phach_code)}"></td>
      <td><input class="grader-no-paper" data-grader-no-paper="${index}" type="checkbox" ${(row.draftNoPaper??row.no_paper)?'checked':''} ${!graderBagEditing?'disabled':''} aria-label="Không bài mã phách ${esc(row.phach_code)}"></td>
      <td>${row.updated_at?esc(new Date(row.updated_at).toLocaleString('vi-VN')):'—'}</td></tr>`).join('')||
      '<tr><td colspan="5" class="empty">Không có phách cho đầu phách đã chọn.</td></tr>';
    updateGraderWindow();
  }
  async function loadGraderQueue(){
    const request=++graderQueueRequest;
    const config=selectedGraderConfig();
    graderWindow=null;
    cache.graderQueue=[];cache.graderIndex=0;renderGraderQueue();
    if(!config)return;
    const {data:windowData,error:windowError}=await state.client.rpc('exam_get_grading_window',{p_exam_id:config.exam_id});
    if(request!==graderQueueRequest)return;
    if(windowError)throw new Error(`Không tải được thời hạn nhập điểm: ${windowError.message}`);
    if(windowData?.starts_at&&windowData?.ends_at)graderWindow={
      start:Date.parse(windowData.starts_at),end:Date.parse(windowData.ends_at),
      offset:Date.parse(windowData.server_now||new Date().toISOString())-Date.now()
    };
    clearInterval(graderWindowTimer);
    graderWindowTimer=setInterval(updateGraderWindow,1000);
    updateGraderWindow();
    const{data:headRows,error:headError}=await state.client.rpc('exam_get_grading_heads',{
      p_exam_id:config.exam_id,p_subject_code:config.subject_code
    });
    if(request!==graderQueueRequest)return;
    if(headError)throw new Error(`Không tải được danh sách đầu phách: ${headError.message}`);
    const heads=(headRows||[]).map(row=>row.phach_prefix);
    const select=$('grader-prefix'),previous=select.value;
    select.innerHTML='<option value="">-- Tất cả đầu phách --</option>'+heads.map(head=>
      `<option value="${esc(head)}">${esc(head)}</option>`).join('');
    if(heads.includes(previous))select.value=previous;
    const{data,error}=await state.client.rpc('exam_get_grading_queue',{
      p_exam_id:config.exam_id,p_subject_code:config.subject_code,p_phach_prefix:$('grader-prefix').value
    });
    if(request!==graderQueueRequest)return;
    if(error)throw new Error(`Không tải được danh sách phách: ${error.message}`);
    cache.graderQueue=(data||[]).map(row=>({...row,originalScore:row.score,originalNoPaper:!!row.no_paper}));cache.graderIndex=0;
    graderBagEditing=!cache.graderQueue.some(row=>row.score!=null||row.no_paper);
    $('grader-score-rules').textContent=`Điểm hợp lệ: 0–${config.maximum_score}${config.score_step==null?' (tự do)':`; bước ${config.score_step}`}; tối đa ${config.decimal_places} chữ số thập phân.`;
    $('grader-default-score').value=config.default_score??'';
    renderGraderQueue();
  }
  function parseGraderRowScore(raw,config){
    const parsed=parseQuickScore(raw,config?.decimal_places);
    const invalid=validateEssayScore(parsed,config);
    if(invalid)throw new Error(invalid);
    return parsed;
  }
  async function saveGraderScores(indexes){
    if(graderSaving)return;
    if(!updateGraderWindow())throw new Error('Hiện không trong thời hạn nhập điểm.');
    const config=selectedGraderConfig();
    if(!config)throw new Error('Chọn kỳ thi và đầu phách trước.');
    const changed=indexes.map(index=>{
      const row=cache.graderQueue[index];
      const input=document.querySelector(`[data-grader-score="${index}"]`);
      const check=document.querySelector(`[data-grader-no-paper="${index}"]`);
      const noPaper=check?.checked??row.draftNoPaper??row.no_paper??false;
      const raw=noPaper?'0':input?.value??row.draftScore??row.score;
      try{return {index,row,score:parseGraderRowScore(raw,config),no_paper:noPaper}}
      catch(error){throw new Error(`Phách ${row.phach_code}: ${error.message}`)}
    });
    const rows=changed.filter(item=>item.score!==item.row.originalScore||item.no_paper!==item.row.originalNoPaper);
    if(!rows.length)throw new Error('Chưa có phách nào cần lưu.');
    const request=graderQueueRequest;
    graderSaving=true;updateGraderWindow();
    try{
    const{error}=await state.client.rpc('exam_import_script_scores',{
      p_exam_id:config.exam_id,p_subject_code:config.subject_code,
      p_rows:rows.map(item=>({phach_code:item.row.phach_code,score:item.score,no_paper:item.no_paper}))
    });
    if(error)throw new Error(`Không lưu được danh sách điểm: ${error.message}`);
    if(request!==graderQueueRequest)return;
    for(const item of rows){
      item.row.score=item.score;item.row.no_paper=item.no_paper;item.row.updated_at=new Date().toISOString();
      item.row.originalScore=item.score;item.row.originalNoPaper=item.no_paper;
    }
    for(const row of cache.graderQueue){delete row.draftScore;delete row.draftNoPaper}
    graderBagEditing=false;
    renderGraderQueue();
    message($('grader-message'),`Đã lưu ${rows.length} phách thay đổi trong túi bài.`, 'success');
    }finally{graderSaving=false;updateGraderWindow()}
  }
  function applyGraderDefault(){
    const config=selectedGraderConfig(),value=$('grader-default-score').value;
    if(!config)throw new Error('Chọn kỳ thi và đầu phách trước.');
    const invalid=validateEssayScore(value,config);if(invalid)throw new Error(invalid);
    const pending=cache.graderQueue.filter(row=>row.score==null&&!row.no_paper&&row.draftScore===undefined);
    if(!pending.length)throw new Error('Danh sách không còn bài chưa nhập điểm.');
    for(const row of pending)row.draftScore=Number(value);
    renderGraderQueue();
    message($('grader-message'),`Đã điền sẵn điểm ${value} cho ${pending.length} phách. Bấm Lưu danh sách để ghi nhận.`, 'info');
  }
  function exportGraderTemplate(){
    const wb=window.XLSX.utils.book_new();
    const ws=window.XLSX.utils.aoa_to_sheet([['Phach','Diem'],['A1','']]);
    window.XLSX.utils.book_append_sheet(wb,ws,'Nhap diem');
    window.XLSX.writeFile(wb,'mau-nhap-diem-tu-luan.xlsx');
  }
  async function importGraderScores(){
    if(!updateGraderWindow())throw new Error('Hiện không trong thời hạn nhập điểm.');
    const file=$('grader-import-file').files?.[0],config=selectedGraderConfig();
    if(!file||!config)throw new Error('Chọn kỳ thi/môn và file Excel hoặc CSV.');
    const buffer=await file.arrayBuffer();
    const workbook=window.XLSX.read(buffer,{type:'array',raw:true});
    const rows=window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{defval:'',raw:true});
    const imported=rows.map(row=>{
      const normalized=Object.fromEntries(Object.entries(row).map(([key,value])=>[String(key).trim().toLowerCase(),value]));
      const rawScore=normalized.diem??normalized.score;
      return {phach_code:String(normalized.phach??normalized.phach_code??'').trim(),
        score:rawScore===''||rawScore===undefined||rawScore===null?NaN:Number(String(rawScore).replace(',','.'))};
    }).filter(row=>row.phach_code);
    if(!imported.length)throw new Error('File không có dòng phách/điểm hợp lệ.');
    const seen=new Set();
    for(const row of imported){
      if(seen.has(row.phach_code))throw new Error(`Phách ${row.phach_code} bị trùng trong file.`);
      seen.add(row.phach_code);
      const invalid=validateEssayScore(row.score,config);
      if(invalid)throw new Error(`Phách ${row.phach_code}: ${invalid}`);
    }
    const{data,error}=await state.client.rpc('exam_import_script_scores',{
      p_exam_id:config.exam_id,p_subject_code:config.subject_code,p_rows:imported
    });
    if(error)throw new Error(`Không nạp được điểm. Không có dòng nào được ghi nếu file chứa dữ liệu không hợp lệ. ${error.message}`);
    message($('grader-message'),`Đã nạp ${data?.saved_count??imported.length} dòng điểm.`, 'success');
    await loadGraderQueue();
  }

  function safeAction(label,action,target){
    target.onclick=async()=>{
      target.disabled=true;
      try{await action()}
      catch(error){message($(label),error?.message||String(error),'error')}
      finally{
        target.disabled=false;
        if(label==='grader-message')updateGraderWindow();
        if(label==='scores-message'){
          refreshScores();
          $('scores-import').disabled=!cache.scoreImportRows.length||scoreImportContext?.key!==importKey()||scoreImportContext?.file!==$('scores-file').files?.[0];
        }
      }
    };
  }
  const localDateTime=value=>{
    if(!value)return '';
    const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  };
  async function loadScriptGradingWindow(){
    const examId=currentExam('script-exam');$('script-grading-start').value='';$('script-grading-end').value='';
    if(!examId)return;
    const{data,error}=await state.client.rpc('exam_get_grading_window',{p_exam_id:examId});
    if(error)throw new Error(`Không tải được thời hạn nhập điểm: ${error.message}`);
    $('script-grading-start').value=localDateTime(data?.starts_at);$('script-grading-end').value=localDateTime(data?.ends_at);
  }
  async function saveScriptGradingWindow(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const start=new Date($('script-grading-start').value),end=new Date($('script-grading-end').value);
    if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw new Error('Nhập đủ thời hạn; kết thúc phải sau bắt đầu.');
    const{error}=await state.client.rpc('exam_set_grading_window',{p_exam_id:examId,p_starts_at:start.toISOString(),p_ends_at:end.toISOString()});
    if(error)throw new Error(`Không lưu được thời hạn: ${error.message}`);
    message($('script-message'),'Đã lưu thời hạn nhập điểm cho toàn bộ môn của kỳ thi.','success');
  }
  async function loadScriptGradingStatus(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const panel=$('script-grading-status');panel.innerHTML='Đang tải tiến độ nhập điểm...';
    const{data:runs,error:runError}=await state.client.from('exam_script_runs').select('id,subject_code,locked_at').eq('exam_id',examId).eq('status','locked').order('locked_at',{ascending:false});
    if(runError)throw new Error(`Không tải được phương án phách: ${runError.message}`);
    const latest=new Map();for(const run of runs||[]){if(!latest.has(run.subject_code))latest.set(run.subject_code,run)}
    const selectedRuns=[...latest.values()];if(!selectedRuns.length){panel.innerHTML='<p class="empty">Chưa có phương án phách đã khóa.</p>';return}
    const runIds=selectedRuns.map(run=>run.id),runById=new Map(selectedRuns.map(run=>[run.id,run]));
    const records=await readPages(()=>state.client.from('exam_script_records').select('id,run_id,room_code,phach_code').in('run_id',runIds).not('phach_code','is',null).order('phach_code'));
    let scores=[];const scoreResult=await state.client.from('exam_script_scores').select('script_record_id,score,no_paper').in('script_record_id',records.map(row=>row.id));
    if(scoreResult.error)throw new Error(`Không tải được trạng thái điểm: ${scoreResult.error.message}`);scores=scoreResult.data||[];
    const scoreByRecord=new Map(scores.map(score=>[score.script_record_id,score]));
    const{data:assignments,error:assignmentError}=await state.client.from('exam_script_bag_assignments').select('run_id,room_code,user_id,group_id').in('run_id',runIds);
    if(assignmentError)throw new Error(`Không tải được phân công túi: ${assignmentError.message}`);
    const assignmentByBag=new Map((assignments||[]).map(row=>[`${row.run_id}:${row.room_code}`,row]));
    const userIds=[...new Set((assignments||[]).map(row=>row.user_id).filter(Boolean))],groupIds=[...new Set((assignments||[]).map(row=>row.group_id).filter(Boolean))];
    const{data:profiles,error:profileError}=userIds.length?await state.client.from('exam_user_profiles').select('user_id,full_name,email,teacher_code').in('user_id',userIds):{data:[],error:null};
    if(profileError)throw new Error(`Không tải được người được phân công: ${profileError.message}`);
    const{data:groups,error:groupError}=groupIds.length?await state.client.from('exam_grader_groups').select('id,name').in('id',groupIds):{data:[],error:null};
    if(groupError)throw new Error(`Không tải được nhóm được phân công: ${groupError.message}`);
    const profilesById=new Map((profiles||[]).map(row=>[row.user_id,row])),groupsById=new Map((groups||[]).map(row=>[row.id,row.name]));
    const assignee=assignment=>!assignment?'Chưa giao':assignment.user_id?([profilesById.get(assignment.user_id)?.teacher_code,profilesById.get(assignment.user_id)?.full_name,profilesById.get(assignment.user_id)?.email].filter(Boolean).join(' · ')||assignment.user_id):`Nhóm: ${groupsById.get(assignment.group_id)||assignment.group_id}`;
    panel.innerHTML=`<table><thead><tr><th>Môn</th><th>Phách</th><th>Túi / phòng</th><th>Trạng thái</th><th>Điểm</th><th>Được phân công</th></tr></thead><tbody>${records.map(record=>{
      const score=scoreByRecord.get(record.id),run=runById.get(record.run_id),assignment=assignmentByBag.get(`${record.run_id}:${record.room_code}`);
      return `<tr><td>${esc(nameOf(run.subject_code))}</td><td>${esc(record.phach_code)}</td><td>${esc(record.room_code||'—')}</td><td>${score?'Đã nhập':'Chưa nhập'}</td><td>${score?(score.no_paper?'Không bài':esc(score.score)):'—'}</td><td>${esc(assignee(assignment))}</td></tr>`;
    }).join('')||'<tr><td colspan="6" class="empty">Không có phách.</td></tr>'}</tbody></table>`;
  }
  function wireForms(){
    $('forms-print-type').onchange=showFormSettings;
    showFormSettings();
    setExamOptions();
    $('forms-exam').onchange=async()=>{try{setAdminExam($('forms-exam').value);await loadFormRounds($('forms-exam').value);await loadForms()}catch(error){message($('forms-message'),error.message,'error')}};
    $('forms-round').onchange=()=>loadForms().catch(error=>message($('forms-message'),error.message,'error'));
    safeAction('forms-message',saveFormHeader,$('forms-save-header'));
    safeAction('forms-message',loadForms,$('forms-load-data'));
    const exportCurrent=async format=>{
      try{
        if(!cache.forms||cache.forms.examId!==currentExam('forms-exam')||Number($('forms-round').value)!==cache.forms.roundNo)throw new Error('Hãy tải dữ liệu biểu mẫu của đúng kỳ/đợt trước khi in.');
        if(isDefaultForms()){const renderer=await ensureDefaultForms();if(format==='excel')renderer.excel();else renderer.print()}
        else if(format==='excel')exportFormsExcel();else exportFormsPdf();
      }catch(error){message($('forms-message'),error.message,'error')}
    };
    $('forms-export-xlsx').onclick=()=>exportCurrent('excel');
    $('forms-export-pdf').onclick=()=>exportCurrent('pdf');
  }
  function wireAbsences(){
    if(createStudentPicker&&$('absence-student-picker'))absencePicker=createStudentPicker({root:$('absence-student-picker'),input:$('absence-student-input'),list:$('absence-student-options'),toggle:$('absence-student-toggle'),esc,onSelect:id=>{absenceStudentId=id;$('absence-search').value='';applyAbsenceFilters()}});
    // Older deployed HTML may not yet include the grade/class filters.
    for(const [id,label,placeholder] of [['absence-grade-filter','Khối','Tất cả khối'],['absence-class-filter','Lớp','Tất cả lớp']]){
      if($(id))continue;
      const wrapper=document.createElement('label');
      wrapper.textContent=label;
      const select=document.createElement('select');select.id=id;
      const option=document.createElement('option');option.value='';option.textContent=placeholder;
      select.appendChild(option);wrapper.appendChild(select);
      const picker=$('absence-student-picker');
      (picker&&typeof picker.before==='function'?picker:$('absence-search').closest('label')||$('absence-search')).before(wrapper);
    }
    $('absence-exam').onchange=()=>loadAbsences().catch(error=>message($('absence-message'),error.message,'error'));
    safeAction('absence-message',async()=>{if(!absenceDirty||confirm('Tải lại sẽ bỏ các thay đổi báo vắng chưa lưu. Tiếp tục?'))await loadAbsences()},$('absence-load'));
    $('absence-search').oninput=applyAbsenceFilters;
    $('absence-grade-filter').onchange=()=>{
      refreshAbsenceClassOptions();
      applyAbsenceFilters();
    };
    $('absence-class-filter').onchange=applyAbsenceFilters;
    $('absence-report-filter').onchange=renderAbsenceReport;
    $('absence-table-body').addEventListener('change',event=>{
      absenceDirty=true;
      if(event.target.matches('[data-absence-subject], [data-absence-remove-outside]'))renderAbsenceReport();
    });
    $('absence-report-body').addEventListener('click',event=>{
      const edit=event.target.closest('[data-absence-edit]'),remove=event.target.closest('[data-absence-delete]');
      if(edit)editReportedAbsence(edit.dataset.absenceEdit);
      if(remove)clearReportedAbsence(remove.dataset.absenceDelete);
    });
    safeAction('absence-message',saveAbsences,$('absence-save'));
  }
  function wireScripts(){
    setSubjectOptions('script-subject',allSubjectOptions());
    $('script-score-mode').onchange=()=>$('script-score-step-wrap').classList.toggle('hidden',$('script-score-mode').value!=='step');
    $('script-exam').onchange=()=>{
      cache.scriptRooms=[];cache.scriptFinalizationId=null;cache.scriptPlanId=null;cache.scriptRoundNo=null;cache.scriptConfigs=[];
      $('script-room-order').innerHTML='';
      loadScriptRounds($('script-exam').value).then(async()=>{await loadScriptConfigs();await loadScriptGradingWindow()}).catch(error=>message($('script-message'),error.message,'error'));
    };
    $('script-subject').onchange=()=>{
      cache.scriptRooms=[];cache.scriptFinalizationId=null;cache.scriptPlanId=null;cache.scriptRoundNo=null;$('script-room-order').innerHTML='';
      if($('script-exam').value)loadScriptConfigs().catch(error=>message($('script-message'),error.message,'error'));
    };
    $('script-round').onchange=()=>{
      cache.scriptRooms=[];cache.scriptFinalizationId=null;cache.scriptPlanId=null;cache.scriptRoundNo=null;
      $('script-room-order').innerHTML='';
    };
    safeAction('script-message',saveScriptConfig,$('script-save-subject'));
    safeAction('script-message',saveMcqMaximumScore,$('script-save-mcq-max-score'));
    safeAction('script-message',loadScriptRooms,$('script-load-rooms'));
    safeAction('script-message',createScriptRun,$('script-generate'));
    safeAction('script-message',exportScriptHeads,$('script-export-heads'));
    safeAction('script-message',saveScriptGradingWindow,$('script-save-grading-window'));
    safeAction('script-message',loadScriptGradingStatus,$('script-load-grading-status'));
    $('script-runs-body').addEventListener('click',event=>{
      const lock=event.target.closest('[data-script-lock]'),exportButton=event.target.closest('[data-script-export]'),assignButton=event.target.closest('[data-script-assign]'),deleteButton=event.target.closest('[data-script-delete]');
      const action=lock?()=>lockScriptRun(lock.dataset.scriptLock):exportButton?()=>exportScriptRun(exportButton.dataset.scriptExport):assignButton?()=>showBagAssignments(assignButton.dataset.scriptAssign):deleteButton?()=>deleteSubjectScriptRuns(deleteButton.dataset.scriptDelete):null;
      const button=lock||exportButton||assignButton||deleteButton;
      if(action&&button){button.disabled=true;action().catch(error=>message($('script-message'),error?.message||String(error),'error')).finally(()=>{button.disabled=false})}
    });
  }
  function wireGrader(){
    $('grader-exam').onchange=()=>{
      const examId=$('grader-exam').value;
      ++graderQueueRequest;graderWindow=null;clearInterval(graderWindowTimer);
      cache.graderQueue=[];cache.graderIndex=0;renderGraderQueue();
      $('grader-prefix').value='';
      const assigned=cache.graderWork.filter(work=>work.exam_id===examId);
      $('grader-subject').innerHTML='<option value="VAN">Ngữ văn (VAN)</option>';
      $('grader-subject').value=assigned.some(work=>work.subject_code==='VAN')?'VAN':'';
      if(!$('grader-subject').value&&examId)message($('grader-message'),'Kỳ thi này chưa có phân công môn Ngữ văn (VAN).','error');
      $('grader-subject').onchange();
    };
    $('grader-subject').onchange=()=>{
      $('grader-prefix').value='';
      loadGraderQueue().catch(error=>message($('grader-message'),error.message,'error'));
    };
    $('grader-prefix').onchange=()=>loadGraderQueue().catch(error=>message($('grader-message'),error.message,'error'));
    $('grader-table-body').addEventListener('click',event=>{
      if(event.target.closest('input,select,button'))return;
      const row=event.target.closest('[data-grader-index]');if(!row)return;
      cache.graderIndex=Number(row.dataset.graderIndex);renderGraderQueue();
    });
    $('grader-table-body').addEventListener('input',event=>{
      const input=event.target.closest('[data-grader-score]');
      if(!input)return;
      cache.graderQueue[Number(input.dataset.graderScore)].draftScore=input.value;
    });
    $('grader-table-body').addEventListener('change',event=>{
      const checkbox=event.target.closest('[data-grader-no-paper]');
      if(!checkbox)return;
      const row=cache.graderQueue[Number(checkbox.dataset.graderNoPaper)];
      row.draftNoPaper=checkbox.checked;
      if(checkbox.checked)row.draftScore=0;
      renderGraderQueue();
    });
    $('grader-table-body').addEventListener('keydown',event=>{
      const input=event.target.closest('[data-grader-score]');
      if(!input||event.key!=='Enter')return;
      event.preventDefault();
      const index=Number(input.dataset.graderScore),config=selectedGraderConfig();
      try{
        const score=parseGraderRowScore(input.value,config);
        cache.graderQueue[index].draftScore=String(score);renderGraderQueue();
        const next=document.querySelector(`[data-grader-score="${index+1}"]:not([disabled])`);
        if(next){next.focus();next.select()}
      }catch(error){message($('grader-message'),`Phách ${cache.graderQueue[index].phach_code}: ${error.message}`,'error')}
    });
    $('grader-use-default').onchange=()=>{
      if(!$('grader-use-default').checked)return;
      try{applyGraderDefault()}catch(error){$('grader-use-default').checked=false;message($('grader-message'),error.message,'error')}
    };
    safeAction('grader-message',()=>{
      const indexes=cache.graderQueue.map((row,index)=>row.draftScore!==undefined||row.draftNoPaper!==undefined?index:null).filter(index=>index!==null);
      return saveGraderScores(indexes);
    },$('grader-save-all'));
    $('grader-edit-bag').onclick=()=>{graderBagEditing=true;renderGraderQueue();};
    $('grader-logout').onclick=async()=>{await state.client.auth.signOut();location.reload()};
  }
  function wireScores(){
    for(const id of ['scores-include-absent','scores-include-violations'])$(id).onchange=()=>{
      ++scoreRevision;combinedContext=null;cache.combinedScores=[];cache.subjectStatistics=null;
      for(const target of ['scores-results','scores-summary','scores-class-results'])$(target).innerHTML='';
      $('scores-result-controls').hidden=true;
      $('scores-export').disabled=true;
    };
    $('scores-exam').onchange=refreshScores;
    $('scores-subject').onchange=()=>{resetScores();$('scores-mode').value='';};
    safeAction('scores-message',loadScoreMode,$('scores-load-mode'));
    safeAction('scores-message',saveScoreMode,$('scores-save-mode'));
    for(const id of ['scores-file','scores-sbd-column','scores-mcq-column','scores-first-row']){
      $(id).addEventListener('change',resetScores);
      if(id!=='scores-file')$(id).addEventListener('input',resetScores);
    }
    setSubjectOptions('scores-subject',allSubjectOptions());
    refreshScores();
    safeAction('scores-message',readMultipleChoiceFile,$('scores-read-file'));
    safeAction('scores-message',importMultipleChoiceScores,$('scores-import'));
    safeAction('scores-message',loadCombinedScores,$('scores-check'));
    safeAction('scores-message',loadCombinedScores,$('scores-load'));
    for(const id of ['scores-result-class','scores-result-status'])$(id).onchange=renderCombinedScores;
    $('scores-result-search').oninput=renderCombinedScores;
    $('scores-result-clear').onclick=()=>{
      $('scores-result-class').value='';$('scores-result-status').value='all';$('scores-result-search').value='';renderCombinedScores();
    };
    $('scores-export').onclick=()=>{try{exportCombinedScores()}catch(error){message($('scores-message'),error.message,'error')}};
  }
  wireForms();
  globalThis.window?.addEventListener?.('beforeunload',event=>{if(absenceDirty){event.preventDefault();event.returnValue=''}});
  // Forms must remain usable if another module has outdated/missing controls.
  for(const [initialize,notice] of [[wireAbsences,'absence-message'],[wireScripts,'script-message'],[wireGrader,'grader-message'],[wireScores,'scores-message']]){
    try{initialize()}
    catch(error){message($(notice),`Không khởi tạo được chức năng này. Hãy cập nhật đầy đủ các tệp giao diện. ${error.message}`,'error')}
  }
  return{
    invalidateAmendmentData:()=>{
      ++formDataRequest;++scoreRevision;combinedContext=null;cache.forms=null;cache.combinedScores=[];cache.subjectStatistics=null;
      cache.scriptRooms=[];cache.scriptFinalizationId=null;absenceExamId='';
      for(const id of ['forms-export-xlsx','forms-export-pdf','scores-export'])if($(id))$(id).disabled=true;
      $('scores-results').innerHTML='';$('scores-class-results').innerHTML='';$('scores-summary').innerHTML='';$('scores-result-controls').hidden=true;
      message($('forms-message'),'Đã điều chỉnh môn. Tải lại biểu mẫu để cập nhật phòng thực tế theo ca.','info');
    },
    refreshExamSelectors:()=>{setExamOptions();refreshScores();},
    refreshScores,
    invalidateCombinedScores:()=>{
      ++scoreRevision;combinedContext=null;cache.combinedScores=[];cache.subjectStatistics=null;$('scores-class-results').innerHTML='';$('scores-results').innerHTML='';$('scores-summary').innerHTML='';$('scores-result-controls').hidden=true;$('scores-export').disabled=true;
      message($('scores-message'),'Điểm tự luận đã thay đổi. Nhấn Tải điểm tổng hợp để tính lại.','info');
    },
    refreshAbsences:async examId=>{
      $('absence-load').disabled=!examId;
      if(absenceExamId===examId&&examId)return true;
      if(absenceDirty&&!confirm('Đổi kỳ thi sẽ bỏ thay đổi báo vắng chưa lưu. Tiếp tục?')){
        message($('absence-message'),'Đang giữ thay đổi của kỳ thi trước. Chọn lại kỳ thi đó để lưu, hoặc tải kỳ mới và bỏ thay đổi.','info');return false;
      }
      $('absence-exam').value=examId||'';
      const exam=state.exams.find(row=>row.id===examId);
      if($('attendance-exam-label'))$('attendance-exam-label').textContent=exam?`Kỳ thi đang chọn: ${exam.name} (${exam.school_year})`:'Chọn kỳ thi tại tab Kỳ thi trước khi báo vắng hoặc vi phạm.';
      if(!examId){++absenceRequest;absenceExamId='';cache.absences=[];absenceStudentId='';absenceDirty=false;
        $('absence-table-body').innerHTML='<tr><td colspan="6">Chọn kỳ thi tại tab Kỳ thi.</td></tr>';
        $('absence-report-body').innerHTML='<tr><td colspan="5">Chọn kỳ thi tại tab Kỳ thi.</td></tr>';
        absencePicker?.setItems([],'');$('absence-save').disabled=true;return true;
      }
      await loadAbsences();return true;
    },
    refreshFormRounds:async examId=>{
      const selectedExamId=examId||$('forms-exam')?.value||'';
      await loadFormRounds(selectedExamId);
      return selectedExamId;
    },
    refreshForms:async examId=>{
      const selectedExamId=examId||$('forms-exam')?.value||'';
      await loadFormRounds(selectedExamId);
      await loadForms();
    },
    refreshScriptConfigs:()=>{
      if(!$('script-exam').value)return Promise.resolve();
      return loadScriptRounds($('script-exam').value).then(loadScriptConfigs)
        .catch(error=>message($('script-message'),error?.message||String(error),'error'));
    },
    enterAsGrader
  };
}
