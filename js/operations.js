const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE=500;

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

export function wireOperations({state,$,esc,message,selectAllPages,subjects,subjectName}){
  const nameOf=subjectName;
  const cache={forms:null,absences:[],scriptRooms:[],scriptFinalizationId:null,scriptConfigs:[],graderWork:[],graderQueue:[],graderIndex:0};
  const examIds=['forms-exam','absence-exam','script-exam'];
  const setExamOptions=()=>{
    for(const id of examIds){
      const select=$(id),current=select.value;
      select.innerHTML='<option value="">-- Chọn kỳ thi --</option>'+state.exams.map(exam=>
        `<option value="${esc(exam.id)}">${esc(exam.name)} (${esc(exam.school_year)})</option>`).join('');
      select.value=state.selectedExam||current||'';
    }
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

  async function loadForms(){
    const examId=currentExam('forms-exam');
    cache.forms=null;
    $('forms-export-xlsx').disabled=true;$('forms-export-pdf').disabled=true;
    setAdminExam(examId);
    const exam=state.exams.find(item=>item.id===examId);
    if(!exam)throw new Error('Không tìm thấy kỳ thi đang chọn.');
    $('forms-authority').value=exam.managing_authority||'';
    $('forms-institution').value=exam.institution_name||'';
    $('forms-title').value=exam.form_exam_title||exam.name||'';
    $('forms-load-data').disabled=true;
    try{
      const candidates=await readPages(()=>state.client.from('exam_candidates')
        .select('id,sbd,student_code,student_name,class_code,date_of_birth').eq('exam_id',examId).order('class_code').order('sbd'));
      const registrations=await readPages(()=>state.client.from('exam_candidate_subjects')
        .select('candidate_id,subject_code,subject_order,subject_type').eq('exam_id',examId).eq('subject_type','elective'));
      const finalizations=checkResult(await state.client.from('exam_rooming_finalizations').select('*')
        .eq('exam_id',examId).eq('is_current',true).order('finalized_at',{ascending:false}),'Không tải được phương án phòng chính thức');
      const assignments=[];
      for(const finalization of finalizations||[]){
        const stored=await readPages(()=>state.client.from('exam_room_assignments')
          .select('candidate_id,room_code,sbd,subject_code,ca1_subject_code,ca2_subject_code')
          .eq('finalization_id',finalization.id).order('sbd'));
        for(const assignment of stored)assignments.push({...assignment,
          plan_type:finalization.plan_type,finalization_id:finalization.id,
          subject_code:assignment.subject_code||finalization.subject_code});
      }
      const candidateById=new Map(candidates.map(candidate=>[String(candidate.id),candidate]));
      const registrationById=new Map();
      for(const registration of registrations||[]){
        const id=String(registration.candidate_id);
        if(!registrationById.has(id))registrationById.set(id,{one:'',two:''});
        const target=registrationById.get(id);
        if(Number(registration.subject_order)===1)target.one=registration.subject_code;
        if(Number(registration.subject_order)===2)target.two=registration.subject_code;
      }
      const expanded=assignments.map(assignment=>({...candidateById.get(String(assignment.candidate_id)),...assignment}));
      const electiveFinal=finalizations?.find(row=>row.plan_type==='elective');
      let posting=(electiveFinal?expanded.filter(row=>row.finalization_id===electiveFinal.id):
        expanded.filter(row=>row.plan_type==='mandatory'&&row.subject_code==='TOAN'));
      if(!posting.length)posting=expanded.filter(row=>row.plan_type==='mandatory');
      const listingRows=posting.map((row,index)=>{
        const registration=registrationById.get(String(row.candidate_id))||{};
        return {...row,sequence:index+1,
          subject_one:row.ca1_subject_code||registration.one||'',
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
      cache.forms={exam,examId,candidates,finalizations,assignments:expanded,listingRows,receiptRows,rosterRows};
      $('forms-summary').innerHTML=[
        ['Thí sinh',candidates.length],['Danh sách có phòng',listingRows.length],
        ['Lượt thu bài',receiptRows.length],['Môn lựa chọn đã rà soát',rosterRows.length]
      ].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
      $('forms-export-xlsx').disabled=false;$('forms-export-pdf').disabled=false;
      message($('forms-message'),`Đã tải ${candidates.length} thí sinh, ${finalizations?.length||0} phương án phòng chính thức.`,'success');
    }finally{$('forms-load-data').disabled=false}
  }
  async function saveFormHeader(){
    const examId=currentExam('forms-exam');setAdminExam(examId);
    const payload={managing_authority:$('forms-authority').value.trim(),
      institution_name:$('forms-institution').value.trim(),form_exam_title:$('forms-title').value.trim()};
    if(!payload.managing_authority||!payload.institution_name||!payload.form_exam_title)
      throw new Error('Hãy nhập đủ cơ quan chủ quản, tên đơn vị và tên kỳ thi.');
    const{data,error}=await state.client.from('exam_sessions').update(payload).eq('id',examId).select().single();
    if(error)throw new Error(`Không lưu được tiêu đề biểu mẫu. Hãy chạy migration v0.1.59. ${error.message}`);
    Object.assign(state.exams.find(row=>row.id===examId)||{},data);
    message($('forms-message'),'Đã lưu thông tin tiêu đề riêng cho kỳ thi.','success');
  }
  function exportFormsExcel(){
    const forms=cache.forms;
    if(!forms)throw new Error('Hãy tải dữ liệu biểu mẫu trước.');
    if(!window.XLSX)throw new Error('Không tải được thư viện Excel.');
    const wb=window.XLSX.utils.book_new();
    const header=[forms.exam.managing_authority,forms.exam.institution_name,forms.exam.form_exam_title||forms.exam.name];
    const listings=[],listingBreaks=[];
    for(const room of [...new Set(forms.listingRows.map(row=>row.room_code))]){
      const roomRows=forms.listingRows.filter(row=>row.room_code===room);
      listings.push(...[header,['DANH SÁCH NIÊM YẾT THÍ SINH'],[`Phòng thi: ${room}`],
        ['STT','SBD','Họ và tên','Ngày sinh','Lớp','Môn 1','Môn 2','Ghi chú'],
        ...roomRows.map((row,index)=>[index+1,row.sbd,row.student_name,row.date_of_birth||'',row.class_code||'',
          nameOf(row.subject_one),nameOf(row.subject_two),row.note]),[`Tổng số thí sinh: ${roomRows.length}`],[]]);
      listingBreaks.push({id:listings.length-1,max:16383,man:1});
    }
    const receipts=[],receiptBreaks=[];
    for(const key of [...new Set(forms.receiptRows.map(row=>`${row.room_code}|${row.subject_code||''}|${row.subject_order??''}`))]){
      const [room,subject,order]=key.split('|');
      const roomRows=forms.receiptRows.filter(row=>row.room_code===room&&String(row.subject_code||'')===subject&&String(row.subject_order??'')===order);
      receipts.push(...[header,['PHIẾU THU BÀI'],[`Phòng thi: ${room}`,subject?`Môn ${order}: ${nameOf(subject)}`:''],
        ['TT','SBD','Họ và tên','Ngày sinh','Lớp','Môn thi','Mã đề','Số tờ','Ký nộp','Ghi chú'],
        ...roomRows.map((row,index)=>[index+1,row.sbd,row.student_name,row.date_of_birth||'',row.class_code||'',
          nameOf(row.subject_code)||nameOf(row.subject_one)||'', '', '', '', '']),
        ['Tổng số thí sinh',roomRows.length,'Số thí sinh vắng','','','','','','',''],[],[]]);
      receiptBreaks.push({id:receipts.length-1,max:16383,man:1});
    }
    if(!listings.length)listings.push(header,['DANH SÁCH NIÊM YẾT THÍ SINH'],['Chưa có phân phòng chính thức.']);
    if(!receipts.length)receipts.push(header,['PHIẾU THU BÀI'],['Chưa có phân phòng chính thức.']);
    const roster=[header,['DANH SÁCH SỐ BÁO DANH VÀ MÔN THI LỰA CHỌN'],
      ['STT','Lớp','Mã học sinh','SBD','Họ và tên','Môn 1','Môn 2'],
      ...forms.rosterRows.map((row,index)=>[index+1,row.class_code||'',row.student_code||'',row.sbd||'',
        row.student_name,nameOf(row.subject_one),nameOf(row.subject_two)])];
    for(const[sheetName,rows,widths]of[
      ['Danh sach niem yet',listings,[8,15,30,15,12,25,25,25]],
      ['Phieu thu bai',receipts,[7,14,26,15,11,24,10,9,14,24]],
      ['SBD va mon lua chon',roster,[8,16,20,14,30,25,25]]
    ]){
      const ws=window.XLSX.utils.aoa_to_sheet(rows);
      ws['!cols']=widths.map(wch=>({wch}));
      ws['!margins']={left:.15,right:.15,top:.25,bottom:.25,header:.1,footer:.1};
      ws['!pageSetup']={paperSize:9,orientation:'landscape',fitToWidth:1,fitToHeight:0};
      ws['!rowBreaks']=sheetName==='Danh sach niem yet'?listingBreaks:sheetName==='Phieu thu bai'?receiptBreaks:[];
      for(const[address,cell]of Object.entries(ws)){
        if(address.startsWith('!')||!cell)continue;
        const row=rows[window.XLSX.utils.decode_cell(address).r]||[];
        const first=String(row[0]??'');
        const bold=first===first.toUpperCase()||['STT','TT','STT','Tổng số thí sinh'].includes(first);
        cell.s={font:{name:'Times New Roman',sz:12,bold},
          border:{top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}},
          alignment:{vertical:'center',wrapText:true}};
      }
      window.XLSX.utils.book_append_sheet(wb,ws,sheetName);
    }
    window.XLSX.writeFile(wb,`bieu-mau-${forms.examId}.xlsx`,{cellStyles:true});
  }
  function exportFormsPdf(){
    const forms=cache.forms;if(!forms)throw new Error('Hãy tải dữ liệu biểu mẫu trước.');
    const pages=[];
    const header=`<header><b>${esc(forms.exam.managing_authority||'')}</b><br><b>${esc(forms.exam.institution_name||'')}</b><br><b>${esc(forms.exam.form_exam_title||forms.exam.name)}</b></header>`;
    for(const room of [...new Set(forms.listingRows.map(row=>row.room_code))]){
      const rows=forms.listingRows.filter(row=>row.room_code===room);
      pages.push(`<section class="page">${header}<h3>DANH SÁCH NIÊM YẾT · PHÒNG ${esc(room)}</h3><table><thead><tr><th>STT</th><th>SBD</th><th>Họ và tên</th><th>Ngày sinh</th><th>Lớp</th><th>Môn 1</th><th>Môn 2</th><th>Ghi chú</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.date_of_birth||'')}</td><td>${esc(row.class_code||'')}</td><td>${esc(nameOf(row.subject_one))}</td><td>${esc(nameOf(row.subject_two))}</td><td></td></tr>`).join('')}</tbody></table><p>Tổng số thí sinh: ${rows.length}</p></section>`);
    }
    for(const key of [...new Set(forms.receiptRows.map(row=>`${row.room_code}|${row.subject_code||''}|${row.subject_order??''}`))]){
      const[room,subject,order]=key.split('|');
      const rows=forms.receiptRows.filter(row=>row.room_code===room&&String(row.subject_code||'')===subject&&String(row.subject_order??'')===order);
      pages.push(`<section class="page">${header}<h3>PHIẾU THU BÀI · PHÒNG ${esc(room)}${subject?` · MÔN ${esc(order)}: ${esc(nameOf(subject))}`:''}</h3><table><thead><tr><th>TT</th><th>SBD</th><th>Họ và tên</th><th>Ngày sinh</th><th>Lớp</th><th>Môn thi</th><th>Mã đề</th><th>Số tờ</th><th>Ký nộp</th><th>Ghi chú</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.sbd)}</td><td>${esc(row.student_name)}</td><td>${esc(row.date_of_birth||'')}</td><td>${esc(row.class_code||'')}</td><td>${esc(nameOf(row.subject_code)||nameOf(row.subject_one)||'')}</td><td></td><td></td><td></td><td></td></tr>`).join('')}</tbody></table><p>Tổng số thí sinh: ${rows.length} · Số thí sinh vắng: ............</p></section>`);
    }
    for(const classCode of [...new Set(forms.rosterRows.map(row=>row.class_code||'Chưa xếp lớp'))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}))){
      const rows=forms.rosterRows.filter(row=>(row.class_code||'Chưa xếp lớp')===classCode);
      pages.push(`<section class="page">${header}<h3>DANH SÁCH SỐ BÁO DANH VÀ MÔN THI LỰA CHỌN · LỚP ${esc(classCode)}</h3><table><thead><tr><th>STT</th><th>Mã học sinh</th><th>SBD</th><th>Họ và tên</th><th>Môn 1</th><th>Môn 2</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.student_code||'')}</td><td>${esc(row.sbd||'')}</td><td>${esc(row.student_name)}</td><td>${esc(nameOf(row.subject_one))}</td><td>${esc(nameOf(row.subject_two))}</td></tr>`).join('')}</tbody></table><p>Tổng số thí sinh: ${rows.length}</p></section>`);
    }
    const win=window.open('','_blank');
    if(!win)throw new Error('Trình duyệt chặn cửa sổ in. Hãy cho phép pop-up rồi thử lại.');
    win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Biểu mẫu kỳ thi</title><style>
      @page{size:A4 landscape;margin:2mm}*{box-sizing:border-box}body{margin:0;font-family:"Times New Roman",serif;font-size:12pt}
      .page{width:293mm;min-height:205mm;break-after:page;page-break-after:always}
      .page:last-child{break-after:auto;page-break-after:auto}header{text-align:center;line-height:1.15}
      h3{text-align:center;margin:3mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed}
      th,td{border:1px solid #000;padding:1px 2px;text-align:center;overflow-wrap:anywhere}
      td:nth-child(3){text-align:left}tr{break-inside:avoid;page-break-inside:avoid}
      @media print{html,body{width:293mm;margin:0!important}.page{margin:0!important}}
      @media screen{body{max-width:1100px;margin:20px auto}.page{width:100%;margin-bottom:20px}}
      </style></head><body>${pages.join('')}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    win.document.close();
  }

  async function loadAbsences(){
    const examId=currentExam('absence-exam');
    cache.absences=[];
    $('absence-table-body').innerHTML='<tr><td colspan="6" class="empty">Đang tải...</td></tr>';
    setAdminExam(examId);
    const[candidates,registrations,absenceResult]=await Promise.all([
      readPages(()=>state.client.from('exam_candidates').select('id,sbd,student_code,student_name,class_code').eq('exam_id',examId).order('class_code').order('sbd')),
      readPages(()=>state.client.from('exam_candidate_subjects').select('candidate_id,subject_code').eq('exam_id',examId)),
      state.client.from('exam_absences').select('candidate_id,subject_code,reason').eq('exam_id',examId)
    ]);
    if(absenceResult.error)throw new Error(`Không tải được báo vắng. Hãy chạy migration v0.1.59. ${absenceResult.error.message}`);
    const codes=[...new Set(['TOAN','VAN',...(registrations||[]).map(row=>String(row.subject_code).toUpperCase())])];
    cache.absences=candidates.map(candidate=>{
      const rows=(absenceResult.data||[]).filter(row=>String(row.candidate_id)===String(candidate.id));
      return {...candidate,absentAll:rows.some(row=>row.subject_code==='*'),
        absentSubjects:rows.filter(row=>row.subject_code!=='*').map(row=>row.subject_code),reason:rows[0]?.reason||''};
    });
    const query=$('absence-search').value.trim().toLocaleLowerCase('vi');
    $('absence-table-body').innerHTML=cache.absences.filter(row=>!query||
      [row.sbd,row.student_code,row.student_name,row.class_code].some(value=>String(value||'').toLocaleLowerCase('vi').includes(query)))
      .map(row=>`<tr data-candidate="${esc(row.id)}"><td>${esc(row.sbd||'')}</td><td>${esc(row.student_name)}</td><td>${esc(row.class_code||'')}</td>
        <td><input type="checkbox" data-absence-all ${row.absentAll?'checked':''} aria-label="Vắng toàn kỳ"></td>
        <td><select multiple data-absence-subjects ${row.absentAll?'disabled':''}>${codes.map(code=>`<option value="${esc(code)}" ${row.absentSubjects.includes(code)?'selected':''}>${esc(nameOf(code))}</option>`).join('')}</select></td>
        <td><input type="text" data-absence-reason value="${esc(row.reason)}" maxlength="200"></td></tr>`).join('')||
      '<tr><td colspan="6" class="empty">Không có thí sinh phù hợp.</td></tr>';
    $('absence-table-body').querySelectorAll('[data-absence-all]').forEach(control=>control.addEventListener('change',()=>{
      control.closest('tr').querySelector('[data-absence-subjects]').disabled=control.checked;
    }));
    message($('absence-message'),`Đã tải ${cache.absences.length} thí sinh và báo vắng đã lưu.`,'success');
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
    $('script-is-essay').checked=Boolean(selected?.is_essay);
    for(const id of ['script-max-score','script-score-step','script-decimals','script-default-score'])
      $(id).disabled=!$('script-is-essay').checked;
    if(selected){
      $('script-max-score').value=selected.maximum_score??'';
      $('script-score-step').value=selected.score_step??'';
      $('script-decimals').value=selected.decimal_places??2;
      $('script-default-score').value=selected.default_score??'';
    }
    await loadScriptRuns();
  }
  async function saveScriptConfig(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const code=$('script-subject').value;
    if(!code)throw new Error('Chọn môn cần cấu hình.');
    const isEssay=$('script-is-essay').checked;
    if(isEssay&&(!Number.isFinite(Number($('script-max-score').value))||Number($('script-max-score').value)<=0||
      !Number.isFinite(Number($('script-score-step').value))||Number($('script-score-step').value)<=0||
      !Number.isInteger(Number($('script-decimals').value))||Number($('script-decimals').value)<0||Number($('script-decimals').value)>3))
      throw new Error('Nhập điểm tối đa, bước điểm dương và số chữ số thập phân từ 0 đến 3.');
    const payload={p_exam_id:examId,p_subject_code:code,p_is_essay:isEssay,
      p_maximum_score:isEssay?Number($('script-max-score').value):null,
      p_score_step:isEssay?Number($('script-score-step').value):null,
      p_decimal_places:Number($('script-decimals').value),
      p_default_score:!isEssay||$('script-default-score').value===''?null:Number($('script-default-score').value)};
    const invalid=payload.p_default_score===null?null:validateEssayScore(payload.p_default_score,{
      maximum_score:payload.p_maximum_score,score_step:payload.p_score_step
    });
    if(invalid)throw new Error(`Điểm mặc định không hợp lệ: ${invalid}`);
    const{error}=await state.client.rpc('exam_save_subject_assessment_config',payload);
    if(error)throw new Error(`Không lưu được cấu hình điểm: ${error.message}`);
    message($('script-message'),isEssay?`Đã khai báo ${nameOf(code)} là môn tự luận và lưu thang điểm.`:`Đã bỏ cấu hình tự luận cho ${nameOf(code)}.`,'success');
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
      <td>${run.status==='locked'?`<button type="button" class="small-btn" data-script-export="${esc(run.id)}">Xuất phách</button>`:
        `<button type="button" class="small-btn" data-script-lock="${esc(run.id)}">Khóa đánh phách</button>`}</td></tr>`).join('')||
      '<tr><td colspan="8" class="empty">Chưa có phương án phách.</td></tr>';
  }
  async function loadScriptRooms(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const code=$('script-subject').value;if(!code)throw new Error('Chọn môn tự luận trước.');
    if(!cache.scriptConfigs.some(row=>row.subject_code===code&&row.is_essay))
      throw new Error('Hãy lưu cấu hình môn là môn tự luận trước khi lập phương án phách.');
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
    cache.scriptRooms=[...new Set(records.map(row=>row.room_code))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true})).map((room,index)=>({room,position:index+1,reverse:false}));
    $('script-room-order').innerHTML=`<table><thead><tr><th>Phòng</th><th>Thứ tự túi</th><th>Đảo thứ tự trong phòng</th><th>Sĩ số môn</th></tr></thead><tbody>${cache.scriptRooms.map(item=>{
      const count=records.filter(row=>row.room_code===item.room).length;
      return `<tr data-script-room="${esc(item.room)}"><td>${esc(item.room)}</td><td><input type="number" min="1" value="${item.position}" data-room-position></td>
        <td><input type="checkbox" data-room-reverse></td><td>${count}</td></tr>`;
    }).join('')}</tbody></table>`;
    message($('script-message'),`Đã tải ${cache.scriptRooms.length} phòng, ${records.length} lượt dự thi môn ${nameOf(code)}. Kiểm tra báo vắng trước khi tạo phách.`,'success');
  }
  async function createScriptRun(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    if(!cache.scriptFinalizationId||!cache.scriptRooms.length)await loadScriptRooms();
    const roomOrder=[...$('script-room-order').querySelectorAll('[data-script-room]')].map(row=>({
      room_code:row.dataset.scriptRoom,position:Number(row.querySelector('[data-room-position]').value),
      reverse:row.querySelector('[data-room-reverse]').checked
    }));
    if(new Set(roomOrder.map(row=>row.position)).size!==roomOrder.length||
      roomOrder.some(row=>!Number.isInteger(row.position)||row.position<1||row.position>roomOrder.length))
      throw new Error('Mỗi phòng phải có một thứ tự túi riêng liên tục từ 1 đến số phòng.');
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

  async function assignGrader(){
    const examId=currentExam('script-exam');setAdminExam(examId);
    const userId=$('grader-user-id').value.trim(),subjectCode=$('grader-assign-subject').value;
    if(!uuidPattern.test(userId))throw new Error('Nhập UUID hợp lệ của tài khoản Supabase Auth.');
    if(!subjectCode)throw new Error('Chọn môn tự luận cần phân công.');
    const{error}=await state.client.rpc('exam_assign_grader',{
      p_exam_id:examId,p_subject_code:subjectCode,p_user_id:userId,p_active:true
    });
    if(error)throw new Error(`Không phân công được giám khảo: ${error.message}`);
    message($('script-message'),`Đã phân công tài khoản ${userId} chấm môn ${nameOf(subjectCode)}.`, 'success');
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
    const{data,error}=await state.client.rpc('exam_get_grading_queue',{
      p_exam_id:config.exam_id,p_subject_code:config.subject_code,p_phach_prefix:$('grader-prefix').value.trim()
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
    const ws=window.XLSX.utils.aoa_to_sheet([['Phach','Diem'],['A001','']]);
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
  function wire(){
    setExamOptions();
    $('forms-exam').onchange=()=>{try{setAdminExam($('forms-exam').value);loadForms().catch(error=>message($('forms-message'),error.message,'error'))}catch(error){message($('forms-message'),error.message,'error')}};
    safeAction('forms-message',saveFormHeader,$('forms-save-header'));
    safeAction('forms-message',loadForms,$('forms-load-data'));
    $('forms-export-xlsx').onclick=()=>{try{exportFormsExcel()}catch(error){message($('forms-message'),error.message,'error')}};
    $('forms-export-pdf').onclick=()=>{try{exportFormsPdf()}catch(error){message($('forms-message'),error.message,'error')}};
    $('absence-exam').onchange=()=>loadAbsences().catch(error=>message($('absence-message'),error.message,'error'));
    safeAction('absence-message',loadAbsences,$('absence-load'));
    $('absence-search').oninput=()=>{if(currentExam('absence-exam'))loadAbsences().catch(error=>message($('absence-message'),error.message,'error'))};
    safeAction('absence-message',saveAbsences,$('absence-save'));
    $('script-exam').onchange=()=>{
      cache.scriptRooms=[];cache.scriptFinalizationId=null;cache.scriptConfigs=[];
      $('script-room-order').innerHTML='';
      loadScriptConfigs().catch(error=>message($('script-message'),error.message,'error'));
    };
    $('script-subject').onchange=()=>{
      cache.scriptRooms=[];cache.scriptFinalizationId=null;$('script-room-order').innerHTML='';
      if($('script-exam').value)loadScriptConfigs().catch(error=>message($('script-message'),error.message,'error'));
    };
    $('script-is-essay').onchange=()=>{
      for(const id of ['script-max-score','script-score-step','script-decimals','script-default-score'])
        $(id).disabled=!$('script-is-essay').checked;
    };
    safeAction('script-message',saveScriptConfig,$('script-save-subject'));
    safeAction('script-message',loadScriptRooms,$('script-load-rooms'));
    safeAction('script-message',createScriptRun,$('script-generate'));
    safeAction('script-message',assignGrader,$('grader-assign-save'));
    $('script-runs-body').addEventListener('click',event=>{
      const lock=event.target.closest('[data-script-lock]'),exportButton=event.target.closest('[data-script-export]');
      const action=lock?()=>lockScriptRun(lock.dataset.scriptLock):exportButton?()=>exportScriptRun(exportButton.dataset.scriptExport):null;
      const button=lock||exportButton;
      if(action&&button){button.disabled=true;action().catch(error=>message($('script-message'),error?.message||String(error),'error')).finally(()=>{button.disabled=false})}
    });
    $('grader-exam').onchange=()=>{
      const examId=$('grader-exam').value;
      cache.graderQueue=[];cache.graderIndex=0;renderGraderQueue();
      setSubjectOptions('grader-subject',cache.graderWork.filter(work=>work.exam_id===examId).map(work=>({code:work.subject_code,name:nameOf(work.subject_code)})));
      $('grader-subject').onchange();
    };
    $('grader-subject').onchange=()=>loadGraderQueue().catch(error=>message($('grader-message'),error.message,'error'));
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
  wire();
  return{refreshExamSelectors:setExamOptions,enterAsGrader};
}
