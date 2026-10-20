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

export function buildClassRoomRows(candidates,assignments,nameOf=code=>code){
  const byId=new Map();
  for(const row of assignments){
    const id=String(row.candidate_id),room=String(row.room_code||'').trim();
    if(!room)continue;
    if(!byId.has(id))byId.set(id,{mandatory:new Set(),elective:new Set()});
    const group=byId.get(id);
    const subject=String(row.subject_code||'').toUpperCase();
    const required=row.plan_type==='mandatory'||(row.plan_type==='subject'&&['TOAN','VAN'].includes(subject));
    const subjects=row.plan_type==='elective'?[row.ca1_subject_code,row.ca2_subject_code].filter(Boolean):[subject].filter(Boolean);
    const label=subjects.length?subjects.map(code=>nameOf(code)).join(' / ')+': '+room:room;
    group[required?'mandatory':'elective'].add(label);
  }
  return candidates.map(row=>{
    const rooms=byId.get(String(row.id));
    return {...row,mandatory_rooms:[...(rooms?.mandatory||[])].join('; ')||'Chưa phân phòng',elective_rooms:[...(rooms?.elective||[])].join('; ')||'Chưa phân phòng'};
  }).sort((a,b)=>String(a.class_code||'').localeCompare(String(b.class_code||''),'vi',{numeric:true})||String(a.sbd||'').localeCompare(String(b.sbd||''),'vi',{numeric:true}));
}

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE=500;

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
  const digits=String(value??'').trim().replace(/\D/g,'');
  if(!digits)return null;
  const places=Math.max(0,Math.min(3,Number(decimalPlaces)||0));
  if(!places)return Number(digits);
  const fractionLength=Math.min(places,Math.max(0,digits.length-1));
  if(!fractionLength)return Number(digits);
  return Number(`${digits.slice(0,-fractionLength)}.${digits.slice(-fractionLength)}`);
}

export function validateEssayScore(value,config){
  const score=Number(value),maximum=Number(config?.maximum_score),step=Number(config?.score_step);
  if(!Number.isFinite(score)||score<0||score>maximum)return `Điểm phải từ 0 đến ${maximum}.`;
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

export function wireOperations({state,$,esc,message,selectAllPages,subjects,subjectName,loadExamRounds}){
  const nameOf=subjectCode=>{const code=String(subjectCode||'').trim().toUpperCase();return code==='KTPL'||code==='GDKTPL'?'GDKT&PL':subjectName(subjectCode)};
  const cache={forms:null,absences:[],scriptRooms:[],scriptFinalizationId:null,scriptConfigs:[],graderWork:[],graderQueue:[],graderIndex:0,graderBagAssignments:[],graderProfiles:[],graderGroups:[],scoreImportRows:[],combinedScores:[]};
  const examIds=['forms-exam','absence-exam','script-exam','scores-exam'];
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
  formSpecs.classrooms=['Phòng thi theo lớp','DANH SÁCH PHÒNG THI THEO LỚP',['STT','Số báo danh','Họ và tên','Ngày sinh','Giới tính','Phòng thi bắt buộc','Phòng thi lựa chọn','Ghi chú'],[6,13,26,14,9,25,30,12]];
  const defaultFont=(header=false)=>({family:'Times New Roman',size:header?12:10,weight:header?700:400,style:'normal'});
  const normalizeFormPrintSettings=raw=>Object.fromEntries(Object.entries(formSpecs).map(([key,spec])=>{
    const value=raw?.[key]||{};
    return [key,{title:value.title||spec[1],header:{...defaultFont(true),...(value.header||raw?.header)},body:{...defaultFont(),...(value.body||raw?.body)},widths:spec[3].map((w,i)=>Number(value.widths?.[i]||raw?.widths?.[key]?.[i])||w)}];
  }));
  const currentFormPrintSettings=()=>Object.fromEntries(Object.entries(formSpecs).map(([key,spec])=>{
    const value={title:$(`forms-${key}-title`).value.trim()||spec[1]};
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
  const applyFormPrintSettings=settings=>{
    for(const [key,value] of Object.entries(normalizeFormPrintSettings(settings))){
      $(`forms-${key}-title`).value=value.title;
      for(const part of ['header','body'])for(const prop of ['family','size','weight','style'])$(`forms-${key}-${part}-${prop}`).value=String(value[part][prop]);
      value.widths.forEach((width,i)=>$(`forms-${key}-width-${i}`).value=width);
    }
  };

  function showFormSettings(){
    const selected=$('forms-print-type').value;
    for(const key of Object.keys(formSpecs))$(`forms-settings-${key}`).classList.toggle('hidden',key!==selected);
    $('forms-class-filter-wrap').classList.toggle('hidden',selected!=='classrooms');
    $('forms-receipt-order-wrap').classList.toggle('hidden',selected!=='receipt');
  }
  function classRoomGroups(forms){
    const selected=$('forms-class-filter').value||'';
    const rows=forms.classRoomRows||[];
    return [...new Set(rows.map(row=>row.class_code||'Chưa xếp lớp'))]
      .filter(code=>!selected||code===selected).sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}))
      .map(code=>[code,rows.filter(row=>(row.class_code||'Chưa xếp lớp')===code)]);
  }
  const classRoomValues=(row,index)=>[index+1,row.sbd||'',row.student_name||'',row.date_of_birth||'',row.gender||'',row.mandatory_rooms,row.elective_rooms,''];

  async function loadForms(){
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
        .select('candidate_id,subject_code,subject_order,subject_type').eq('exam_id',examId).eq('subject_type','elective'));
      const legacyFinalizations=roundNo?[]:checkResult(await state.client.from('exam_rooming_finalizations').select('*')
        .eq('exam_id',examId).eq('is_current',true).order('finalized_at',{ascending:false}),'Không tải được phương án phòng chính thức');
      const assignments=[];
      let officialPlans=[];
      if(roundNo){
        officialPlans=await readPages(()=>state.client.from('exam_rooming_round_plans')
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
        const id=String(registration.candidate_id);
        if(!registrationById.has(id))registrationById.set(id,{one:'',two:''});
        const target=registrationById.get(id);
        if(Number(registration.subject_order)===1)target.one=registration.subject_code;
        if(Number(registration.subject_order)===2)target.two=registration.subject_code;
      }
      const expanded=assignments.filter(assignment=>candidateById.has(String(assignment.candidate_id)))
        .map(assignment=>({...candidateById.get(String(assignment.candidate_id)),...assignment}));
      const electiveFinal=finalizations?.find(row=>row.plan_type==='elective');
      let posting=(electiveFinal?expanded.filter(row=>row.finalization_id===electiveFinal.id):
        expanded.filter(row=>row.plan_type==='mandatory'||row.plan_type==='subject'));
      if(!posting.length)posting=expanded;
      const listingRows=posting.map((row,index)=>{
        const registration=registrationById.get(String(row.candidate_id))||{};
        return {...row,sequence:index+1,
          subject_one:row.ca1_subject_code||row.subject_code||registration.one||'',
          subject_two:row.ca2_subject_code||registration.two||'',
          note:''};
      }).sort((a,b)=>String(a.room_code).localeCompare(String(b.room_code),'vi',{numeric:true})||
        String(a.sbd).localeCompare(String(b.sbd),'vi',{numeric:true}));
      const receiptRows=[];
      for(const row of expanded){
        if(row.plan_type==='elective'){
          receiptRows.push({...row,subject_code:row.ca1_subject_code,subject_order:1});
          receiptRows.push({...row,subject_code:row.ca2_subject_code,subject_order:2});
        }else receiptRows.push({...row,subject_order:null});
      }
      const rosterRows=candidates.map((candidate,index)=>{
        const selected=registrationById.get(String(candidate.id))||{};
        return {...candidate,sequence:index+1,subject_one:selected.one||'',subject_two:selected.two||''};
      });
      if(request!==formDataRequest||currentExam('forms-exam')!==examId||Number($('forms-round').value)!==roundNo)return;
      const classRoomRows=buildClassRoomRows(candidates,expanded,nameOf);
      const classSelect=$('forms-class-filter'),previousClass=classSelect.value;
      classSelect.innerHTML='<option value="">Tất cả các lớp</option>'+[...new Set(classRoomRows.map(row=>row.class_code||'Chưa xếp lớp'))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true})).map(code=>`<option value="${esc(code)}">${esc(code)}</option>`).join('');
      classSelect.value=[...classSelect.options].some(option=>option.value===previousClass)?previousClass:'';
      cache.forms={exam,examId,roundNo,candidates,finalizations,assignments:expanded,listingRows,receiptRows,rosterRows,classRoomRows};
      $('forms-summary').innerHTML=[
        ['Thí sinh',candidates.length],['Danh sách có phòng',listingRows.length],
        ['Lượt thu bài',receiptRows.length],['Môn lựa chọn đã rà soát',rosterRows.length]
      ].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
      $('forms-export-xlsx').disabled=false;$('forms-export-pdf').disabled=false;
      message($('forms-message'),`Đã tải ${candidates.length} thí sinh${roundNo?` của đợt ${roundNo}`:''}, ${finalizations?.length||0} phương án phòng chính thức.`,'success');
    }finally{if(request===formDataRequest)$('forms-load-data').disabled=false}
  }
  async function saveFormHeader(){
    const examId=currentExam('forms-exam');setAdminExam(examId);
    const printSettings=currentFormPrintSettings();
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
    const settings=currentFormPrintSettings();
    const forms=cache.forms;
    if(!forms)throw new Error('Hãy tải dữ liệu biểu mẫu trước.');
    if(!window.XLSX)throw new Error('Không tải được thư viện Excel.');
    const wb=window.XLSX.utils.book_new();
    const header=[$('forms-authority').value,$('forms-institution').value,$('forms-title').value];
    const listings=[],listingBreaks=[];
    for(const room of (printType==='receipt'||printType==='roster'?[]:[...new Set(forms.listingRows.map(row=>row.room_code))])){
      const roomRows=forms.listingRows.filter(row=>row.room_code===room);
      listings.push(...[header,[settings.listing.title],[`Phòng thi: ${room}`],
        ['STT','SBD','Họ và tên','Ngày sinh','Lớp','Môn 1','Môn 2','Ghi chú'],
        ...roomRows.map((row,index)=>[index+1,row.sbd,row.student_name,row.date_of_birth||'',row.class_code||'',
          nameOf(row.subject_one),nameOf(row.subject_two),row.note]),[`Tổng số thí sinh: ${roomRows.length}`],[]]);
      listingBreaks.push({id:listings.length-1,max:16383,man:1});
    }
    const receipts=[],receiptBreaks=[],receiptMerges=[];
    for(const {room,subject,order,rows:roomRows} of (printType==='all'||printType==='receipt'?groupReceiptRows(forms.receiptRows,$('forms-receipt-order').value||1):[])){
      const pageStart=receipts.length;
      receipts.push(...[header,[settings.receipt.title],[`Phòng thi: ${room}`,order?`Môn ${order}`:subject?`Môn thi: ${nameOf(subject)}`:''],
        ['TT','SBD','Họ và tên','Ngày sinh','Lớp','Môn thi','Mã đề','Số tờ','Ký nộp','Ghi chú'],
        ...roomRows.map((row,index)=>[index+1,row.sbd,row.student_name,row.date_of_birth||'',row.class_code||'',
          nameOf(row.subject_code)||nameOf(row.subject_one)||'', '', '', '', '']),
        ['Tổng số thí sinh',roomRows.length,'Số thí sinh vắng','','','','','','','']]);
      const footerStart=receipts.length;
      if(!order&&['TOAN','VAN'].includes(subject)){
        for(let i=pageStart+3;i<footerStart-1;i++)receipts[i].splice(5,1);
      }
      receipts[pageStart+2]=[`Phòng: ${String(room).replace(/^phòng\s*/i,'')} · ${order?`Môn ${order}`:`Môn: ${nameOf(subject)}`}`];
      receiptMerges.push({s:{r:pageStart+2,c:0},e:{r:pageStart+2,c:9}});
      receipts.push(['Tổng số bài: ................','','','','','Tổng số tờ: ................'],
        ['SBD thí sinh vắng: ................................................................................'],[],
        ['Cán bộ coi thi 1','','','','','Cán bộ coi thi 2'],
        ['(Ký, ghi rõ họ tên)','','','','','(Ký, ghi rõ họ tên)'],[],[],[]);
      for(const offset of [0,3,4])for(const col of [0,5])receiptMerges.push({s:{r:footerStart+offset,c:col},e:{r:footerStart+offset,c:col+4}});
      receiptMerges.push({s:{r:footerStart+1,c:0},e:{r:footerStart+1,c:9}});
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
      [header,[settings.classrooms.title],[`Lớp: ${code} · Đợt ${forms.roundNo}`],formSpecs.classrooms[2],...rows.map(classRoomValues)],[], 'classrooms'
    ]);
    const sheetSpecs=[
      ['Danh sach niem yet',listings,[8,15,30,15,12,25,25,25]],
      ['Phieu thu bai',receipts,[7,14,26,15,11,24,10,9,14,24]],
      ['SBD va mon lua chon',roster,[8,16,20,14,30,25,25]],
      ...classSheets
    ].filter(([sheetName,rows,widths,type])=>printType==='all'||(type==='classrooms'&&printType==='classrooms')||
      (printType==='listing'&&sheetName==='Danh sach niem yet')||
      (printType==='receipt'&&sheetName==='Phieu thu bai')||
      (printType==='roster'&&sheetName==='SBD va mon lua chon'));
    if(!sheetSpecs.length)throw new Error('Không có dữ liệu cho biểu mẫu hoặc lớp đang chọn.');
    for(const[sheetName,rows,widths,type]of sheetSpecs){
      const key=type|| (sheetName==='Danh sach niem yet'?'listing':sheetName==='Phieu thu bai'?'receipt':'roster');
      const config=settings[key];
      const ws=window.XLSX.utils.aoa_to_sheet(rows);
      ws['!cols']=config.widths.map(wch=>({wch}));
      if(key==='receipt')ws['!merges']=receiptMerges;
      ws['!margins']={left:.15,right:.15,top:.25,bottom:.25,header:.1,footer:.1};
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
    const settings=currentFormPrintSettings();
    const forms=cache.forms;if(!forms)throw new Error('Hãy tải dữ liệu biểu mẫu trước.');
    const pages=[];
    const displayRoom=room=>String(room??'').replace(/^phòng\s*/i,'').trim();
    const header=`<header><b>${esc($('forms-authority').value)}</b><br><b>${esc($('forms-institution').value)}</b><br><b>${esc($('forms-title').value)}</b></header>`;
    if(printType==='all'||printType==='listing')for(const room of [...new Set(forms.listingRows.map(row=>row.room_code))]){
      const rows=forms.listingRows.filter(row=>row.room_code===room);
      pages.push(`<section class="page listing">${header}<h3>${esc(settings.listing.title)} PHÒNG ${esc(displayRoom(room))}</h3><table><thead><tr><th>STT</th><th>SBD</th><th>Họ và tên</th><th>Ngày sinh</th><th>Lớp</th><th>Môn 1</th><th>Môn 2</th><th>Ghi chú</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.date_of_birth||'')}</td><td>${esc(row.class_code||'')}</td><td>${esc(nameOf(row.subject_one))}</td><td>${esc(nameOf(row.subject_two))}</td><td></td></tr>`).join('')}</tbody></table><p>Tổng số thí sinh: ${rows.length}</p></section>`);
    }
    if(printType==='all'||printType==='receipt')for(const {room,subject,order,rows} of groupReceiptRows(forms.receiptRows,$('forms-receipt-order').value||1)){
      pages.push(`<section class="page receipt ${!order&&['TOAN','VAN'].includes(subject)?'mandatory-receipt':''}">${header}<h3>${esc(settings.receipt.title)}<br>PHÒNG ${esc(displayRoom(room))}${order?` · MÔN ${order}`:subject?` · MÔN: ${esc(nameOf(subject))}`:''}</h3><table><thead><tr><th>TT</th><th>SBD</th><th>Họ và tên</th><th>Ngày sinh</th><th>Lớp</th>${!order&&['TOAN','VAN'].includes(subject)?'':'<th>Môn thi</th>'}<th>Mã đề</th><th>Số tờ</th><th>Ký nộp</th><th>Ghi chú</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.date_of_birth||'')}</td><td>${esc(row.class_code||'')}</td>${!order&&['TOAN','VAN'].includes(subject)?'':`<td>${esc(nameOf(row.subject_code)||nameOf(row.subject_one)||'')}</td>`}<td></td><td></td><td></td><td></td></tr>`).join('')}</tbody></table><div class="receipt-footer"><p>Tổng số thí sinh: ${rows.length} · Số thí sinh vắng: ............</p><p>SBD thí sinh vắng: ................................................................................</p><p>Tổng số bài: ................ · Tổng số tờ: ................</p><div class="receipt-signatures"><div><b>Cán bộ coi thi 1</b><br><i>(Ký, ghi rõ họ tên)</i></div><div><b>Cán bộ coi thi 2</b><br><i>(Ký, ghi rõ họ tên)</i></div></div></div></section>`);
    }
    if(printType==='all'||printType==='roster')for(const classCode of [...new Set(forms.rosterRows.map(row=>row.class_code||'Chưa xếp lớp'))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}))){
      const rows=forms.rosterRows.filter(row=>(row.class_code||'Chưa xếp lớp')===classCode);
      pages.push(`<section class="page roster">${header}<h3>${esc(settings.roster.title)} · LỚP ${esc(classCode)}</h3><table><thead><tr><th>STT</th><th>Mã học sinh</th><th>SBD</th><th>Họ và tên</th><th>Môn 1</th><th>Môn 2</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.student_code||'')}</td><td>${esc(row.sbd||'')}</td><td>${esc(row.student_name)}</td><td>${esc(nameOf(row.subject_one))}</td><td>${esc(nameOf(row.subject_two))}</td></tr>`).join('')}</tbody></table><p>Tổng số thí sinh: ${rows.length}</p></section>`);
    }
    if(printType==='all'||printType==='classrooms')for(const [code,rows] of classRoomGroups(forms)){
      pages.push(`<section class="page classrooms">${header}<h3>${esc(settings.classrooms.title)} · LỚP ${esc(code)} · ĐỢT ${forms.roundNo}</h3><table><thead><tr>${formSpecs.classrooms[2].map(label=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr>${classRoomValues(row,i).map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Tổng số học sinh: ${rows.length}</p></section>`);
    }
    if(!pages.length)throw new Error('Không có dữ liệu cho biểu mẫu hoặc lớp đang chọn.');
    const printablePages=compactPrintPages(pages).map(page=>page.replace(/<header>[\s\S]*?<\/header><h3>([\s\S]*?)<\/h3>/,(_,title)=>`<header class="form-heading"><div><b>${esc($('forms-authority').value)}</b><br><b>${esc($('forms-institution').value)}</b></div><div><b>${esc($('forms-title').value)}</b><h3>${title}</h3></div></header>`));
    const fontCss=font=>`font-family:'${esc(font.family)}',serif;font-size:${font.size}pt;font-weight:${font.weight};font-style:${font.style};`;
    const customCss=Object.entries(settings).map(([key,config])=>{
      // Printed class rosters omit class and student ID, and include a notes column.
      const widths=key==='roster'?[config.widths[0],config.widths[3],config.widths[4],config.widths[5],config.widths[6],config.widths[7]]:config.widths;
      const total=widths.reduce((sum,w)=>sum+w,0);
      return `.page.${key} header,.page.${key} header b,.page.${key} h3{${fontCss(config.header)}white-space:normal;overflow-wrap:anywhere}.page.${key} table th,.page.${key} table td{${fontCss(config.body)}}`+widths.map((w,i)=>`.page.${key} table th:nth-child(${i+1}){width:${w/total*100}%}`).join('');
    }).join('');
    const win=window.open('','_blank');
    if(!win)throw new Error('Trình duyệt chặn cửa sổ in. Hãy cho phép pop-up rồi thử lại.');
    win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Biểu mẫu kỳ thi</title><style>
      @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:${esc(forms.exam.form_font_family||'Times New Roman')},serif;font-size:${Number(forms.exam.form_font_size)||11}pt}
      .page{width:190mm;min-height:277mm;break-after:page;page-break-after:always}
      .page:last-child{break-after:auto;page-break-after:auto}header{text-align:center;line-height:1.15;white-space:nowrap}
      h3{text-align:center;margin:3mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed}table:not(.receipt) th:nth-child(1){width:5%}table:not(.receipt) th:nth-child(2){width:10%}table:not(.receipt) th:nth-child(3){width:25%}table:not(.receipt) th:nth-child(4){width:13%}table:not(.receipt) th:nth-child(5){width:9%}table:not(.receipt) th:nth-child(6),table:not(.receipt) th:nth-child(7){width:14%}table:not(.receipt) th:nth-child(8){width:10%}.receipt th:nth-child(1){width:5%}.receipt th:nth-child(2){width:10%}.receipt th:nth-child(3){width:25%}.receipt th:nth-child(4){width:13%}.receipt th:nth-child(5){width:9%}.receipt th:nth-child(6){width:14%}.receipt th:nth-child(7),.receipt th:nth-child(8){width:6%}.receipt th:nth-child(9){width:12%}.receipt th:nth-child(10){width:10%}
      th,td{border:1px solid #000;padding:2px 3px;text-align:center;overflow-wrap:anywhere;white-space:normal}
      td:nth-child(3){text-align:left}tr{break-inside:avoid;page-break-inside:avoid}
      @media print{html,body{width:190mm;margin:0!important}.page{margin:0!important}}
      @media screen{body{max-width:1100px;margin:20px auto}.page{width:100%;margin-bottom:20px}}
      .receipt-footer{break-inside:avoid;page-break-inside:avoid}.receipt-footer p{margin:3mm 0}.receipt-signatures{display:flex;justify-content:space-around;text-align:center;margin-top:5mm;min-height:25mm}${customCss}
      .page header.form-heading{display:grid;grid-template-columns:1fr 1fr;gap:5mm;align-items:start;text-align:center;margin-bottom:6mm;white-space:normal}.page header.form-heading b,.page header.form-heading h3{font-weight:700}.page header.form-heading h3{margin:0}.page table thead th{font-weight:700 !important}
      .page.mandatory-receipt table th:nth-child(n){width:auto}.page.mandatory-receipt table th:nth-child(1){width:5%}.page.mandatory-receipt table th:nth-child(2){width:13%}.page.mandatory-receipt table th:nth-child(3){width:25%}.page.mandatory-receipt table th:nth-child(4){width:14%}
      </style></head><body>${printablePages.join('')}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    win.document.close();
  }

  async function loadAbsences(){
    const examId=currentExam('absence-exam');
    cache.absences=[];
    $('absence-table-body').innerHTML='<tr><td colspan="6" class="empty">Đang tải...</td></tr>';
    $('absence-report-body').innerHTML='<tr><td colspan="5" class="empty">Đang tải...</td></tr>';
    setAdminExam(examId);
    const[candidates,registrations,absenceResult]=await Promise.all([
      readPages(()=>state.client.from('exam_candidates').select('id,sbd,student_code,student_name,grade_code,class_code').eq('exam_id',examId).order('grade_code').order('class_code').order('sbd')),
      readPages(()=>state.client.from('exam_candidate_subjects').select('candidate_id,subject_code').eq('exam_id',examId)),
      state.client.from('exam_absences').select('candidate_id,subject_code,reason').eq('exam_id',examId)
    ]);
    if(absenceResult.error)throw new Error(`Không tải được báo vắng. Hãy chạy migration v0.1.59. ${absenceResult.error.message}`);
    const codes=[...new Set(['TOAN','VAN',...(registrations||[]).map(row=>String(row.subject_code).toUpperCase())])].sort();
    const reportFilter=$('absence-report-filter'),selectedFilter=reportFilter.value;
    reportFilter.innerHTML='<option value="all">Tất cả thí sinh vắng</option><option value="*">Vắng toàn kỳ</option>'+
      codes.map(code=>`<option value="${esc(code)}">Vắng môn ${esc(nameOf(code))}</option>`).join('');
    reportFilter.value=[...reportFilter.options].some(option=>option.value===selectedFilter)?selectedFilter:'all';
    cache.absences=candidates.map(candidate=>{
      const rows=(absenceResult.data||[]).filter(row=>String(row.candidate_id)===String(candidate.id));
      return {...candidate,absentAll:rows.some(row=>row.subject_code==='*'),
        absentSubjects:rows.filter(row=>row.subject_code!=='*').map(row=>row.subject_code),reason:rows[0]?.reason||''};
    });
    $('absence-table-body').innerHTML=cache.absences
      .map(row=>`<tr data-candidate="${esc(row.id)}"><td>${esc(row.sbd||'')}</td><td>${esc(row.student_name)}</td><td>${esc(row.class_code||'')}</td>
        <td><input type="checkbox" data-absence-all ${row.absentAll?'checked':''} aria-label="Vắng toàn kỳ"></td>
        <td><select multiple data-absence-subjects ${row.absentAll?'disabled':''}>${codes.map(code=>`<option value="${esc(code)}" ${row.absentSubjects.includes(code)?'selected':''}>${esc(nameOf(code))}</option>`).join('')}</select></td>
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
    return (!grade||String(candidate.grade_code||'').trim()===grade)&&
      (!classCode||String(candidate.class_code||'').trim()===classCode)&&
      (!query||[candidate.sbd,candidate.student_code,candidate.student_name,candidate.class_code]
        .some(value=>String(value||'').toLocaleLowerCase('vi').includes(query)));
  }
  function applyAbsenceFilters(){
    const query=$('absence-search').value.trim().toLocaleLowerCase('vi');
    const candidates=new Map(cache.absences.map(candidate=>[String(candidate.id),candidate]));
    $('absence-table-body').querySelector('[data-absence-empty]')?.remove();
    $('absence-table-body').querySelectorAll('tr[data-candidate]').forEach(tr=>{
      const candidate=candidates.get(tr.dataset.candidate);
      tr.hidden=!candidate||!absenceMatches(candidate);
    });
    if(query||$('absence-grade-filter').value||$('absence-class-filter').value){
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
        ?[...tr.querySelector('[data-absence-subjects]').selectedOptions].map(option=>option.value)
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
    $('absence-search').value=String(candidate.student_code||candidate.sbd||candidate.student_name||'');
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
    [...row.querySelector('[data-absence-subjects]').options].forEach(option=>{option.selected=false});
    row.querySelector('[data-absence-subjects]').disabled=false;
    row.querySelector('[data-absence-reason]').value='';
    applyAbsenceFilters();
    message($('absence-message'),'Đã đánh dấu xóa báo vắng. Bấm “Lưu báo vắng” để xác nhận thay đổi.','info');
  }
  async function saveAbsences(){
    const examId=currentExam('absence-exam');setAdminExam(examId);
    const rows=[];
    const edited=new Map([...$('absence-table-body').querySelectorAll('tr[data-candidate]')].map(tr=>[tr.dataset.candidate,tr]));
    for(const candidate of cache.absences){
      const tr=edited.get(String(candidate.id));
      const absentAll=tr?tr.querySelector('[data-absence-all]').checked:candidate.absentAll;
      const reason=tr?tr.querySelector('[data-absence-reason]').value.trim():candidate.reason;
      const absentSubjects=tr?[...tr.querySelector('[data-absence-subjects]').selectedOptions].map(option=>option.value):candidate.absentSubjects;
      if(absentAll)rows.push({candidate_id:candidate.id,subject_code:'*',reason});
      else for(const subjectCode of absentSubjects)rows.push({candidate_id:candidate.id,subject_code:subjectCode,reason});
    }
    const{data,error}=await state.client.rpc('exam_save_absences',{p_exam_id:examId,p_rows:rows});
    if(error)throw new Error(`Không lưu được báo vắng. ${error.message}`);
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
    setSubjectOptions('grader-assign-subject',essay);
    if(!$('script-subject').value)$('script-subject').value=essay[0]?.subject_code||'TOAN';
    const selected=cache.scriptConfigs.find(row=>row.subject_code===$('script-subject').value);
    $('script-max-score').value=selected?.maximum_score??'';
    $('script-score-step').value=selected?.score_step??'';
    $('script-decimals').value=selected?.decimal_places??2;
    $('script-default-score').value=selected?.default_score??'';
    $('script-mcq-max-score').value=selected?.mcq_maximum_score??10;
    await loadScriptRuns();
  }
  async function saveScriptConfig(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const code=$('script-subject').value;
    if(!code)throw new Error('Chọn môn cần cấu hình.');
    if(!Number.isFinite(Number($('script-max-score').value))||Number($('script-max-score').value)<=0||
      !Number.isFinite(Number($('script-score-step').value))||Number($('script-score-step').value)<=0||
      !Number.isInteger(Number($('script-decimals').value))||Number($('script-decimals').value)<0||Number($('script-decimals').value)>3)
      throw new Error('Nhập điểm tối đa, bước điểm dương và số chữ số thập phân từ 0 đến 3.');
    const payload={p_exam_id:examId,p_subject_code:code,p_is_essay:true,
      p_maximum_score:Number($('script-max-score').value),
      p_score_step:Number($('script-score-step').value),
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
  async function loadScriptRooms(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const code=$('script-subject').value;if(!code)throw new Error('Chọn môn thi trước.');
    const finals=checkResult(await state.client.from('exam_rooming_finalizations').select('*')
      .eq('exam_id',examId).eq('is_current',true).order('finalized_at',{ascending:false}),'Không tải được phương án phòng');
    let target=null,records=[];
    for(const finalization of finals||[]){
      const rows=await readPages(()=>state.client.from('exam_room_assignments')
        .select('candidate_id,room_code,sbd,subject_code,ca1_subject_code,ca2_subject_code')
        .eq('finalization_id',finalization.id).order('sbd'));
      const relevant=rows.filter(row=>row.subject_code===code||row.ca1_subject_code===code||row.ca2_subject_code===code);
      if(relevant.length){target=finalization;records=relevant;break}
    }
    if(!target)throw new Error(`Chưa có phân phòng chính thức cho môn ${nameOf(code)}.`);
    cache.scriptFinalizationId=target.id;
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
      p_absence_mode:$('script-absence-mode').value,p_room_order:roomOrder
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
    const examId=currentExam('script-exam');setAdminExam(examId);
    const userId=$('grader-user-id').value.trim(),subjectCode=$('grader-assign-subject').value;
    if(!uuidPattern.test(userId))throw new Error('Nhập UUID hợp lệ của tài khoản Supabase Auth.');
    if(!subjectCode)throw new Error('Chọn môn cần phân công.');
    if(!cache.scriptConfigs.some(row=>row.subject_code===subjectCode&&row.is_essay))
      throw new Error(`Hãy lưu thang điểm phần tự luận môn ${nameOf(subjectCode)} trước khi phân công giám khảo.`);
    const{error}=await state.client.rpc('exam_assign_grader',{
      p_exam_id:examId,p_subject_code:subjectCode,p_user_id:userId,p_active:true
    });
    if(error)throw new Error(`Không phân công được giám khảo: ${error.message}`);
    const profile=cache.graderProfiles.find(row=>row.user_id===userId);
    message($('script-message'),`Đã thêm ${profile?.full_name||profile?.email||userId} vào danh sách giám khảo môn ${nameOf(subjectCode)}.`, 'success');
    await loadGraderAccounts();
  }

  async function toggleGraderAssignment(userId,active){
    const examId=currentExam('script-exam'),subjectCode=$('grader-assign-subject').value;
    if(!examId||!subjectCode||!uuidPattern.test(userId))throw new Error('Chọn kỳ thi, môn và tài khoản hợp lệ.');
    const{error}=await state.client.rpc('exam_assign_grader',{
      p_exam_id:examId,p_subject_code:subjectCode,p_user_id:userId,p_active:!active
    });
    if(error)throw new Error(`Không cập nhật được vai trò giám khảo: ${error.message}`);
    message($('script-message'),active?'Đã gỡ tài khoản khỏi môn.':'Đã thêm tài khoản vào môn.','success');
    await loadGraderAccounts();
  }

  async function loadGraderAccounts(){
    const examId=currentExam('script-exam'),subjectCode=$('grader-assign-subject').value;
    if(!examId||!subjectCode)return;
    const{data,error}=await state.client.from('exam_grader_assignments').select('user_id,active')
      .eq('exam_id',examId).eq('subject_code',subjectCode).eq('active',true).order('user_id');
    if(error)throw new Error(`Không tải được tài khoản giám khảo theo môn: ${error.message}`);
    cache.graderBagAssignments=data||[];
    const{data:profiles,error:profileError}=await state.client.from('exam_user_profiles')
      .select('user_id,email,full_name,teacher_code').order('full_name');
    if(profileError)throw new Error(`Không tải được danh sách tài khoản. Hãy chạy migration v0.1.63. ${profileError.message}`);
    cache.graderProfiles=profiles||[];
    const selected=$('grader-user-id').value;
    $('grader-user-id').innerHTML='<option value="">-- Chọn tài khoản đã đăng nhập --</option>'+cache.graderProfiles.map(profile=>
      `<option value="${esc(profile.user_id)}">${esc([profile.teacher_code,profile.full_name,profile.email].filter(Boolean).join(' · ')||profile.user_id)}</option>`).join('');
    if(cache.graderProfiles.some(profile=>profile.user_id===selected))$('grader-user-id').value=selected;
    const assigned=new Set(cache.graderBagAssignments.map(row=>row.user_id));
    $('grader-account-list').innerHTML=`<table><thead><tr><th>Mã định danh</th><th>Giáo viên</th><th>Email đăng nhập</th><th>Vai trò môn hiện tại</th><th></th></tr></thead><tbody>${cache.graderProfiles.map(profile=>
      `<tr><td>${esc(profile.teacher_code||'—')}</td><td>${esc(profile.full_name||'—')}</td><td>${esc(profile.email||'—')}</td><td>${assigned.has(profile.user_id)?'Giám khảo':'Chưa phân công'}</td><td>${assigned.has(profile.user_id)?`<button type="button" class="small-btn danger-btn" data-grader-revoke="${esc(profile.user_id)}">Gỡ khỏi môn</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Chưa có tài khoản đăng nhập Google/email.</td></tr>'}</tbody></table>`;
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
    const examId=currentExam('script-exam'),subjectCode=$('grader-assign-subject').value;
    const groupSelect=$('grader-group-select'),membersSelect=$('grader-group-members');
    cache.graderGroups=[];
    if(!examId||!subjectCode){
      groupSelect.innerHTML='<option value="">-- Tạo nhóm mới --</option>';
      membersSelect.innerHTML='';
      return;
    }
    const{data:groups,error}=await state.client.from('exam_grader_groups').select('id,name')
      .eq('exam_id',examId).eq('subject_code',subjectCode).order('name');
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
    const examId=currentExam('script-exam'),subjectCode=$('grader-assign-subject').value;
    const userIds=[...$('grader-group-members').selectedOptions].map(option=>option.value);
    if(!examId||!subjectCode)throw new Error('Chọn kỳ thi và môn trước khi lưu nhóm.');
    if(!userIds.length)throw new Error('Chọn ít nhất một giám khảo cùng môn cho nhóm.');
    const{data,error}=await state.client.rpc('exam_save_grader_group',{
      p_exam_id:examId,p_subject_code:subjectCode,
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
    const{data:graders,error:graderError}=await state.client.from('exam_grader_assignments')
      .select('user_id').eq('exam_id',run.exam_id).eq('subject_code',run.subject_code).eq('active',true).order('user_id');
    if(graderError)throw new Error(`Không tải được giám khảo môn ${nameOf(run.subject_code)}: ${graderError.message}`);
    const graderIds=[...new Set((graders||[]).map(row=>row.user_id))];
    const{data:profiles,error:profileError}=graderIds.length
      ?await state.client.from('exam_user_profiles').select('user_id,email,full_name,teacher_code').in('user_id',graderIds)
      :{data:[],error:null};
    if(profileError)throw new Error(`Không tải được thông tin giám khảo: ${profileError.message}`);
    const{data:groups,error:groupsError}=await state.client.from('exam_grader_groups')
      .select('id,name').eq('exam_id',run.exam_id).eq('subject_code',run.subject_code).order('name');
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
      <p>Để “Không phân công riêng”, mọi giám khảo đã được phân môn này đều có thể nhập điểm của túi.</p>
      <table><thead><tr><th>Túi / phòng</th><th>Giám khảo hoặc nhóm</th></tr></thead><tbody>${rooms.map(room=>
        `<tr><td>${esc(room)}${assignmentByRoom.get(room)?.method==='draw'?' · bốc thăm':''}</td><td><select data-bag-room="${esc(room)}"><option value="">Không phân công riêng (mọi giám khảo môn này)</option>${graderOptions}${groupOptions}</select></td></tr>`).join('')}</tbody></table>
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
          ?`Đã phân công ${rows.length} túi cho giám khảo/nhóm. Các túi chưa gán vẫn mở cho mọi giám khảo môn này.`
          :'Đã bỏ phân công cá nhân; mọi giám khảo môn này có thể chấm tất cả các túi.','success');
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

  function renderScorePreview(){
    const rows=cache.scoreImportRows.slice(0,25);
    $('scores-preview').innerHTML=rows.length
      ?`<h3>Xem trước ${Math.min(25,cache.scoreImportRows.length)}/${cache.scoreImportRows.length} dòng trắc nghiệm</h3><table><thead><tr><th>SBD</th><th>Điểm trắc nghiệm</th></tr></thead><tbody>${rows.map(row=>
        `<tr><td>${esc(row.sbd)}</td><td>${esc(row.score)}</td></tr>`).join('')}</tbody></table>`
      :'';
    $('scores-import').disabled=!cache.scoreImportRows.length;
  }

  async function readMultipleChoiceFile(){
    const examId=currentExam('scores-exam'),subjectCode=$('scores-subject').value;
    setAdminExam(examId);
    if(!subjectCode)throw new Error('Chọn môn thi cần nhập điểm.');
    const file=$('scores-file').files?.[0];
    if(!file)throw new Error('Chọn tệp Excel hoặc CSV kết quả trắc nghiệm.');
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
      .select('mcq_maximum_score').eq('exam_id',examId).eq('subject_code',subjectCode).single();
    if(error)throw new Error(`Không tải được điểm tối đa trắc nghiệm. Hãy lưu cấu hình môn trước. ${error.message}`);
    const outOfRange=rows.find(row=>row.score>Number(config.mcq_maximum_score));
    if(outOfRange)throw new Error(`Điểm ${outOfRange.score} của SBD ${outOfRange.sbd} vượt mức tối đa ${config.mcq_maximum_score}.`);
    cache.scoreImportRows=rows;
    renderScorePreview();
    message($('scores-message'),`Đã kiểm tra ${rows.length} dòng. Khi nhập, điểm hiện có của các SBD này sẽ được cập nhật theo tệp mới.`,'success');
  }

  async function importMultipleChoiceScores(){
    const examId=currentExam('scores-exam'),subjectCode=$('scores-subject').value,file=$('scores-file').files?.[0];
    if(!cache.scoreImportRows.length||!file)throw new Error('Hãy đọc và kiểm tra tệp trước khi nhập điểm.');
    if(!confirm(`Nhập ${cache.scoreImportRows.length} điểm trắc nghiệm môn ${nameOf(subjectCode)}? Điểm đã nhập của các SBD này sẽ bị thay bằng dữ liệu mới.`))return;
    const{data,error}=await state.client.rpc('exam_import_mcq_scores',{
      p_exam_id:examId,p_subject_code:subjectCode,p_source_file:file.name,
      p_rows:cache.scoreImportRows
    });
    if(error)throw new Error(`Không nhập được điểm trắc nghiệm: ${error.message}`);
    message($('scores-message'),`Đã nhập ${data.imported_count} điểm trắc nghiệm môn ${nameOf(subjectCode)}.`,'success');
    await loadCombinedScores();
  }

  async function loadCombinedScores(){
    const examId=currentExam('scores-exam'),subjectCode=$('scores-subject').value;
    setAdminExam(examId);
    if(!subjectCode)throw new Error('Chọn môn thi cần tổng hợp.');
    const{data,error}=await state.client.rpc('exam_get_combined_scores',{
      p_exam_id:examId,p_subject_code:subjectCode
    });
    if(error)throw new Error(`Không tải được điểm tổng hợp: ${error.message}`);
    cache.combinedScores=data||[];
    const missingEssay=cache.combinedScores.filter(row=>row.essay_missing).length;
    const missingMcq=cache.combinedScores.filter(row=>row.mcq_missing).length;
    const complete=cache.combinedScores.filter(row=>row.total_score!==null).length;
    $('scores-summary').innerHTML=[
      ['Thí sinh',cache.combinedScores.length],['Đã đủ hai phần',complete],
      ['Thiếu điểm tự luận',missingEssay],['Thiếu điểm trắc nghiệm',missingMcq]
    ].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    $('scores-results').innerHTML=`<table><thead><tr><th>SBD</th><th>Họ và tên</th><th>Lớp</th><th>Tự luận</th><th>Trắc nghiệm</th><th>Tổng</th><th>Trạng thái</th></tr></thead><tbody>${cache.combinedScores.map(row=>{
      const completeScore=row.total_score!==null;
      const status=row.essay_missing&&row.mcq_missing?'Thiếu cả hai phần':row.essay_missing?'Thiếu tự luận':row.mcq_missing?'Thiếu trắc nghiệm':'Đủ điểm';
      return `<tr><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.class_code)}</td><td>${row.essay_score??''}</td><td>${row.mcq_score??''}</td><td>${completeScore?esc(row.total_score):''}</td><td>${status}</td></tr>`;
    }).join('')||'<tr><td colspan="7" class="empty">Không có thí sinh thuộc môn này.</td></tr>'}</tbody></table>`;
    $('scores-export').disabled=!cache.combinedScores.length;
  }

  function exportCombinedScores(){
    if(!cache.combinedScores.length)throw new Error('Chưa có điểm tổng hợp để xuất.');
    const rows=[
      ['SBD','Mã học sinh','Họ và tên','Lớp','Điểm tự luận','Điểm trắc nghiệm','Tổng điểm','Trạng thái'],
      ...cache.combinedScores.map(row=>[
        row.sbd,row.student_code,row.student_name,row.class_code,row.essay_score??'',
        row.mcq_score??'',row.total_score??'',
        row.essay_missing&&row.mcq_missing?'Thiếu cả hai phần':row.essay_missing?'Thiếu tự luận':row.mcq_missing?'Thiếu trắc nghiệm':'Đủ điểm'
      ])
    ];
    const wb=window.XLSX.utils.book_new(),ws=window.XLSX.utils.aoa_to_sheet(rows);
    window.XLSX.utils.book_append_sheet(wb,ws,'Tong hop diem');
    window.XLSX.writeFile(wb,`tong-hop-diem-${currentExam('scores-exam')}-${$('scores-subject').value}.xlsx`);
  }

  async function enterAsGrader(){
    const{data,error}=await state.client.rpc('exam_list_grading_work');
    if(error)throw new Error(`Không tải được danh sách kỳ thi/môn được giao: ${error.message}`);
    cache.graderWork=data||[];
    $('grader-exam').innerHTML='<option value="">-- Chọn kỳ thi --</option>'+[...new Map(cache.graderWork.map(work=>[work.exam_id,work])).values()]
      .map(work=>`<option value="${esc(work.exam_id)}">${esc(work.exam_title)}</option>`).join('');
    $('grader-subject').innerHTML='<option value="">-- Chọn môn --</option>';
    $('grader-table-body').innerHTML='<tr><td colspan="4" class="empty">Chọn kỳ thi và môn được phân công.</td></tr>';
    $('user-email').textContent=state.session?.user?.email||'';
    $('grader-score').value='';$('grader-quick-score').value='';
  }
  function selectedGraderConfig(){
    return cache.graderWork.find(work=>work.exam_id===$('grader-exam').value&&work.subject_code===$('grader-subject').value);
  }
  function renderGraderQueue(){
    $('grader-table-body').innerHTML=cache.graderQueue.map((row,index)=>`<tr data-grader-index="${index}" class="${index===cache.graderIndex?'roster-dirty':''}">
      <td>${index+1}</td><td>${esc(row.phach_code)}</td><td>${row.score??''}</td>
      <td>${row.updated_at?esc(new Date(row.updated_at).toLocaleString('vi-VN')):'—'}</td></tr>`).join('')||
      '<tr><td colspan="4" class="empty">Không có phách cho tiền tố đã nhập.</td></tr>';
    const current=cache.graderQueue[cache.graderIndex];
    $('grader-current-phach').value=current?.phach_code||'';
    $('grader-score').value=current?.score??'';
    $('grader-save-score').disabled=!current;
  }
  async function loadGraderQueue(){
    const config=selectedGraderConfig();
    if(!config)return;
    cache.graderQueue=[];cache.graderIndex=0;renderGraderQueue();
    const{data:headRows,error:headError}=await state.client.rpc('exam_get_grading_heads',{
      p_exam_id:config.exam_id,p_subject_code:config.subject_code
    });
    if(headError)throw new Error(`Không tải được danh sách đầu phách: ${headError.message}`);
    const heads=(headRows||[]).map(row=>row.phach_prefix);
    const select=$('grader-prefix'),previous=select.value;
    select.innerHTML='<option value="">-- Tất cả đầu phách --</option>'+heads.map(head=>
      `<option value="${esc(head)}">${esc(head)}</option>`).join('');
    if(heads.includes(previous))select.value=previous;
    const{data,error}=await state.client.rpc('exam_get_grading_queue',{
      p_exam_id:config.exam_id,p_subject_code:config.subject_code,p_phach_prefix:$('grader-prefix').value
    });
    if(error)throw new Error(`Không tải được danh sách phách: ${error.message}`);
    cache.graderQueue=data||[];cache.graderIndex=0;
    $('grader-score-rules').textContent=`Điểm hợp lệ: 0–${config.maximum_score}; bước ${config.score_step}; tối đa ${config.decimal_places} chữ số thập phân.`;
    $('grader-default-score').value=config.default_score??'';
    $('grader-score').max=config.maximum_score;
    $('grader-score').step=config.score_step;
    renderGraderQueue();
  }
  async function saveGraderScore(scoreOverride){
    const config=selectedGraderConfig(),row=cache.graderQueue[cache.graderIndex];
    if(!config||!row)throw new Error('Chọn một phách trong danh sách.');
    const raw=scoreOverride??$('grader-score').value;
    const score=Number(raw),invalid=validateEssayScore(score,config);
    if(invalid)throw new Error(invalid);
    const{error}=await state.client.rpc('exam_save_script_score',{
      p_exam_id:config.exam_id,p_subject_code:config.subject_code,p_phach_code:row.phach_code,p_score:score
    });
    if(error)throw new Error(`Không lưu được điểm phách ${row.phach_code}: ${error.message}`);
    row.score=score;row.updated_at=new Date().toISOString();
    cache.graderIndex=Math.min(cache.graderIndex+1,cache.graderQueue.length-1);
    renderGraderQueue();
    message($('grader-message'),`Đã lưu điểm ${score} cho phách ${row.phach_code}.`, 'success');
  }
  async function applyGraderDefault(){
    const config=selectedGraderConfig(),value=$('grader-default-score').value;
    if(!config)throw new Error('Chọn kỳ thi và môn trước.');
    const invalid=validateEssayScore(value,config);if(invalid)throw new Error(invalid);
    if(!confirm(`Áp dụng điểm ${value} cho ${cache.graderQueue.length} phách trong danh sách hiện tại?`))return;
    let saved=0;
    for(const row of cache.graderQueue){
      const{error}=await state.client.rpc('exam_save_script_score',{
        p_exam_id:config.exam_id,p_subject_code:config.subject_code,p_phach_code:row.phach_code,p_score:Number(value)
      });
      if(error)throw new Error(`Đã lưu ${saved} điểm trước khi lỗi tại phách ${row.phach_code}: ${error.message}`);
      row.score=Number(value);row.updated_at=new Date().toISOString();saved++;
    }
    renderGraderQueue();message($('grader-message'),`Đã áp dụng điểm mặc định cho ${saved} phách.`, 'success');
  }
  function exportGraderTemplate(){
    const wb=window.XLSX.utils.book_new();
    const ws=window.XLSX.utils.aoa_to_sheet([['Phach','Diem'],['A1','']]);
    window.XLSX.utils.book_append_sheet(wb,ws,'Nhap diem');
    window.XLSX.writeFile(wb,'mau-nhap-diem-tu-luan.xlsx');
  }
  async function importGraderScores(){
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
      finally{target.disabled=false}
    };
  }
  function wireForms(){
    $('forms-print-type').onchange=showFormSettings;
    showFormSettings();
    setExamOptions();
    $('forms-exam').onchange=async()=>{try{setAdminExam($('forms-exam').value);await loadFormRounds($('forms-exam').value);await loadForms()}catch(error){message($('forms-message'),error.message,'error')}};
    $('forms-round').onchange=()=>loadForms().catch(error=>message($('forms-message'),error.message,'error'));
    safeAction('forms-message',saveFormHeader,$('forms-save-header'));
    safeAction('forms-message',loadForms,$('forms-load-data'));
    $('forms-export-xlsx').onclick=()=>{try{exportFormsExcel()}catch(error){message($('forms-message'),error.message,'error')}};
    $('forms-export-pdf').onclick=()=>{try{exportFormsPdf()}catch(error){message($('forms-message'),error.message,'error')}};
  }
  function wireAbsences(){
    // Older deployed HTML may not yet include the grade/class filters.
    for(const [id,label,placeholder] of [['absence-grade-filter','Khối','Tất cả khối'],['absence-class-filter','Lớp','Tất cả lớp']]){
      if($(id))continue;
      const wrapper=document.createElement('label');
      wrapper.textContent=label;
      const select=document.createElement('select');select.id=id;
      const option=document.createElement('option');option.value='';option.textContent=placeholder;
      select.appendChild(option);wrapper.appendChild(select);
      $('absence-search').closest('label').before(wrapper);
    }
    $('absence-exam').onchange=()=>loadAbsences().catch(error=>message($('absence-message'),error.message,'error'));
    safeAction('absence-message',loadAbsences,$('absence-load'));
    $('absence-search').oninput=applyAbsenceFilters;
    $('absence-grade-filter').onchange=()=>{
      refreshAbsenceClassOptions();
      applyAbsenceFilters();
    };
    $('absence-class-filter').onchange=applyAbsenceFilters;
    $('absence-report-filter').onchange=renderAbsenceReport;
    $('absence-table-body').addEventListener('change',event=>{
      if(event.target.matches('[data-absence-subjects]'))renderAbsenceReport();
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
    $('script-exam').onchange=()=>{
      cache.scriptRooms=[];cache.scriptFinalizationId=null;cache.scriptConfigs=[];
      $('script-room-order').innerHTML='';
      loadScriptConfigs().catch(error=>message($('script-message'),error.message,'error'));
    };
    $('script-subject').onchange=()=>{
      cache.scriptRooms=[];cache.scriptFinalizationId=null;$('script-room-order').innerHTML='';
      if($('script-exam').value)loadScriptConfigs().catch(error=>message($('script-message'),error.message,'error'));
    };
    safeAction('script-message',saveScriptConfig,$('script-save-subject'));
    safeAction('script-message',saveMcqMaximumScore,$('script-save-mcq-max-score'));
    safeAction('script-message',loadScriptRooms,$('script-load-rooms'));
    safeAction('script-message',createScriptRun,$('script-generate'));
    safeAction('script-message',exportScriptHeads,$('script-export-heads'));
    safeAction('script-message',assignGrader,$('grader-assign-save'));
    safeAction('script-message',saveGraderProfile,$('grader-profile-save'));
    safeAction('script-message',saveGraderGroup,$('grader-group-save'));
    safeAction('script-message',deleteGraderGroup,$('grader-group-delete'));
    $('grader-assign-subject').onchange=()=>loadGraderAccounts().catch(error=>message($('script-message'),error.message,'error'));
    $('grader-user-id').onchange=()=>{
      const profile=cache.graderProfiles.find(row=>row.user_id===$('grader-user-id').value);
      $('grader-full-name').value=profile?.full_name||'';
      $('grader-teacher-code').value=profile?.teacher_code||'';
    };
    $('grader-group-select').onchange=renderSelectedGroup;
    $('grader-account-list').addEventListener('click',event=>{
      const button=event.target.closest('[data-grader-revoke]');
      if(button)safeAction('script-message',()=>toggleGraderAssignment(button.dataset.graderRevoke,true),button);
    });
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
      cache.graderQueue=[];cache.graderIndex=0;renderGraderQueue();
      $('grader-prefix').value='';
      setSubjectOptions('grader-subject',cache.graderWork.filter(work=>work.exam_id===examId).map(work=>({code:work.subject_code,name:nameOf(work.subject_code)})));
      $('grader-subject').onchange();
    };
    $('grader-subject').onchange=()=>{
      $('grader-prefix').value='';
      loadGraderQueue().catch(error=>message($('grader-message'),error.message,'error'));
    };
    $('grader-prefix').onchange=()=>loadGraderQueue().catch(error=>message($('grader-message'),error.message,'error'));
    $('grader-table-body').addEventListener('click',event=>{
      const row=event.target.closest('[data-grader-index]');if(!row)return;
      cache.graderIndex=Number(row.dataset.graderIndex);renderGraderQueue();
    });
    $('grader-quick-score').addEventListener('input',()=>{
      const config=selectedGraderConfig(),parsed=parseQuickScore($('grader-quick-score').value,config?.decimal_places);
      if(parsed!==null)$('grader-score').value=String(parsed);
    });
    safeAction('grader-message',()=>saveGraderScore(),$('grader-save-score'));
    safeAction('grader-message',applyGraderDefault,$('grader-apply-default'));
    $('grader-export-template').onclick=exportGraderTemplate;
    safeAction('grader-message',importGraderScores,$('grader-import-scores'));
    $('grader-logout').onclick=async()=>{await state.client.auth.signOut();location.reload()};
  }
  function wireScores(){
    $('scores-exam').onchange=()=>{
      cache.scoreImportRows=[];cache.combinedScores=[];
      $('scores-preview').innerHTML='';$('scores-results').innerHTML='';$('scores-summary').innerHTML='';
      $('scores-import').disabled=true;$('scores-export').disabled=true;
      setSubjectOptions('scores-subject',allSubjectOptions());
    };
    $('scores-subject').onchange=()=>{
      cache.scoreImportRows=[];cache.combinedScores=[];
      $('scores-preview').innerHTML='';$('scores-results').innerHTML='';$('scores-summary').innerHTML='';
      $('scores-import').disabled=true;$('scores-export').disabled=true;
    };
    safeAction('scores-message',readMultipleChoiceFile,$('scores-read-file'));
    safeAction('scores-message',importMultipleChoiceScores,$('scores-import'));
    safeAction('scores-message',loadCombinedScores,$('scores-load'));
    $('scores-export').onclick=()=>{try{exportCombinedScores()}catch(error){message($('scores-message'),error.message,'error')}};
  }
  wireForms();
  // Forms must remain usable if another module has outdated/missing controls.
  for(const [initialize,notice] of [[wireAbsences,'absence-message'],[wireScripts,'script-message'],[wireGrader,'grader-message'],[wireScores,'scores-message']]){
    try{initialize()}
    catch(error){message($(notice),`Không khởi tạo được chức năng này. Hãy cập nhật đầy đủ các tệp giao diện. ${error.message}`,'error')}
  }
  return{
    refreshExamSelectors:setExamOptions,
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
      if($('script-exam').value)loadScriptConfigs().catch(error=>message($('script-message'),error?.message||String(error),'error'));
    },
    enterAsGrader
  };
}
