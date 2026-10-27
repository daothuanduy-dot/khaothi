const subjectOrder=code=>({VAN:0,TOAN:1,N1:2,N4:3,N5:4,LY:5,HOA:6,SINH:7,SU:8,DIA:9,KTPL:10,TIN:11})[code]??99;
export function choiceSubjects(data){
  return [...new Set(data.cells.map(c=>c.subject_code))].sort((a,b)=>subjectOrder(a)-subjectOrder(b)||a.localeCompare(b));
}
export function choiceSummary(data,tieMode='competition'){
  const cells=data.cells.map(c=>({...c,rank:null}));
  // Choice exams compare each subject across participating classes in the same grade.
  for(const grade of new Set(data.classes.map(c=>c.grade_code).filter(Boolean))){
    const classes=new Set(data.classes.filter(c=>c.grade_code===grade).map(c=>c.class_code));
    for(const subject of choiceSubjects(data)){
      const same=cells.filter(c=>classes.has(c.class_code)&&c.subject_code===subject);
      if(same.some(c=>c.missing_count>0))continue;
      const eligible=same.filter(c=>c.average_score!=null&&c.included_count>0).sort((a,b)=>Number(b.average_score)-Number(a.average_score));
      let rank=0,last;eligible.forEach((c,i)=>{if(i===0||Number(c.average_score)!==last)rank=tieMode==='dense'?rank+1:i+1;c.rank=rank;last=Number(c.average_score)});
    }
  }
  return {codes:choiceSubjects(data),cells};
}
export function choiceRoster(data){
  const students=new Map((data.students||[]).map(c=>[c.candidate_id,{...c,subjects:[]}]));
  for(const row of data.rows){
    if(!students.has(row.candidate_id))students.set(row.candidate_id,{...row,subjects:[]});
    students.get(row.candidate_id).subjects.push(row);
  }
  return [...students.values()].map(c=>{
    const elective=c.subjects.filter(s=>s.subject_type==='elective').sort((a,b)=>(a.subject_order??999)-(b.subject_order??999)||a.subject_code.localeCompare(b.subject_code));
    const complete=c.subjects.length>0&&c.subjects.every(s=>s.statistics_score!=null);
    const total=complete?c.subjects.reduce((n,s)=>n+Number(s.statistics_score),0):null;
    return {...c,elective,total,average:complete?total/c.subjects.length:null};
  }).sort((a,b)=>a.class_code.localeCompare(b.class_code,'vi',{numeric:true})||a.student_name.split(' ').at(-1).localeCompare(b.student_name.split(' ').at(-1),'vi')||a.student_name.localeCompare(b.student_name,'vi')||String(a.sbd).localeCompare(String(b.sbd)));
}
export function rosterColumns(students){
  const extra=[...new Set(students.flatMap(c=>c.subjects.filter(s=>s.subject_type!=='elective'&&!['VAN','TOAN'].includes(s.subject_code)).map(s=>s.subject_code)))].sort();
  const count=Math.max(2,...students.map(c=>c.elective.length));
  return {fixed:['VAN','TOAN',...extra],electives:count};
}
const scoreText=s=>!s?'':s.statistics_score!=null?Number(s.statistics_score):s.is_absent?'Vắng':s.violation_id?'VP (loại)':'Chưa nhập';
const shortSubject=s=>({N1:'Anh',N4:'Trung',N5:'Đức',LY:'Lí',HOA:'Hóa',SINH:'Sinh',SU:'Sử',DIA:'Địa',KTPL:'KTPL',TIN:'Tin'})[s.subject_code]||s.subject_name||s.subject_code;
export function choiceRosterSheet(students){
  const columns=rosterColumns(students),labels={VAN:'Văn',TOAN:'Toán'};
  const rows=[['STT','SBD','Họ tên','Lớp',...columns.fixed.map(c=>labels[c]||c),...Array.from({length:columns.electives},(_,i)=>'Môn '+(i+1)),'Tổng','TB']];
  students.forEach((c,i)=>rows.push([i+1,c.sbd||'',c.student_name,c.class_code,
    ...columns.fixed.map(code=>scoreText(c.subjects.find(s=>s.subject_code===code))),
    ...Array.from({length:columns.electives},(_,n)=>{const s=c.elective[n];return s?shortSubject(s)+' '+scoreText(s):''}),c.total??'',c.average??'']));
  return rows;
}
export function choiceSummarySheet(data,selectedClasses=data.classes,tieMode='competition',selectedSubjects=choiceSubjects(data)){
  const report=choiceSummary(data,tieMode);report.codes=report.codes.filter(code=>selectedSubjects.includes(code));const rows=[['Lớp',...report.codes.flatMap(code=>[code==='KTPL'?'KTPL':data.cells.find(c=>c.subject_code===code)?.subject_name||code,'SL','XH'])]];
  for(const cls of [...selectedClasses].sort((a,b)=>a.class_code.localeCompare(b.class_code,'vi',{numeric:true}))){rows.push([cls.class_code,...report.codes.flatMap(code=>{const c=report.cells.find(c=>c.class_code===cls.class_code&&c.subject_code===code);return c?[c.average_score??'',c.included_count,c.rank??'']:['','','']})]);}
  rows.push(['TB lớp',...report.codes.flatMap(code=>{
    const cells=report.cells.filter(c=>c.subject_code===code&&selectedClasses.some(x=>x.class_code===c.class_code)&&c.average_score!=null&&c.included_count>0);
    return [cells.length?cells.reduce((sum,c)=>sum+Number(c.average_score),0)/cells.length:'','',''];
  })]);
  return rows;
}

export function wireChoiceReports({state,$,esc,message,createPrintFrame}){
  let payload=null,key='',request=0,subjects=[];
  const context=()=>JSON.stringify([state.selectedExam||'',!!$('choice-report-absent').checked,!!$('choice-report-violations').checked,state.statisticsRevision||0]);
  const tieMode=()=>$('choice-report-ties')?.value==='dense'?'dense':'competition';
  const rankNote=()=>`XH từng môn giảm dần trong cùng khối, không phân biệt ban; đồng hạng ${tieMode()==='dense'?'1,1,2':'1,1,3'}. Khi môn còn thiếu điểm trong khối, chưa xếp hạng. TB lớp: trung bình ĐTB các lớp có điểm trong phạm vi đang lọc. Điểm hiển thị 3 số lẻ; XH dùng điểm chưa làm tròn.`;
  const selectedClasses=()=>payload.classes.filter(c=>(!$('choice-report-grade').value||c.grade_code===$('choice-report-grade').value)&&(!$('choice-report-class').value||c.class_code===$('choice-report-class').value));
  const selectedStudents=()=>choiceRoster(payload).filter(s=>selectedClasses().some(c=>c.class_code===s.class_code));
  const exportIds=['choice-report-excel','choice-report-summary-pdf','choice-report-roster-pdf'];
  const clear=()=>{++request;payload=null;key='';$('choice-report-results').innerHTML='';for(const id of exportIds)$(id).disabled=true;};
  const ready=()=>{if(payload&&key===context())return true;clear();message($('choice-report-message'),'Hãy tải lại báo cáo theo kỳ thi/lựa chọn hiện tại.','info');return false;};
  const tableHtml=(rows,roster=false)=>`<table class="${roster?'roster':'summary'}"><thead><tr>${rows[0].map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row=>`<tr>${row.map((v,i)=>`<td>${esc(typeof v==='number'&&(!roster?i>0&&(i-1)%3===0:i>=4)?v.toFixed(3):v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  function render(){
    if(!ready())return;
    const rows=choiceSummarySheet(payload,selectedClasses(),tieMode(),subjects);
    $('choice-report-results').innerHTML='<h4>ĐTB · số học sinh được tính · XH từng môn trong khối</h4><div class="table-wrap">'+tableHtml(rows)+'</div><p>'+esc(rankNote())+'</p>';
    for(const id of exportIds)$(id).disabled=!selectedClasses().length||(id!=='choice-report-roster-pdf'&&!subjects.length);
  }
  $('choice-report-load').onclick=async()=>{
    clear();if(!state.selectedExam){message($('choice-report-message'),'Chọn kỳ thi trước.','error');return}
    const captured=context(),token=request;$('choice-report-load').disabled=true;
    try{
      const{data,error}=await state.client.rpc('exam_get_choice_statistics_report',{p_exam_id:state.selectedExam,p_include_absent:!!$('choice-report-absent').checked,p_include_violations:!!$('choice-report-violations').checked});
      if(error)throw new Error(error.message);if(captured!==context()||token!==request)return;
      data.classes.sort((a,b)=>a.class_code.localeCompare(b.class_code,'vi',{numeric:true}));payload=data;key=captured;
      subjects=choiceSubjects(data);
      const picker=$('choice-report-subjects');
      if(picker)picker.innerHTML=subjects.map(code=>`<label style="display:inline-flex;align-items:center;gap:6px;margin:6px"><input type="checkbox" value="${esc(code)}" checked> ${esc(code==='KTPL'?'KTPL':data.cells.find(c=>c.subject_code===code)?.subject_name||code)}</label>`).join('');
      $('choice-report-grade').innerHTML='<option value="">Tất cả khối</option>'+[...new Set(data.classes.map(c=>c.grade_code).filter(Boolean))].sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
      $('choice-report-class').innerHTML='<option value="">Tất cả lớp</option>'+data.classes.map(c=>`<option value="${esc(c.class_code)}">${esc(c.class_code)}</option>`).join('');
      $('choice-report-grade').value='';$('choice-report-class').value='';render();
      message($('choice-report-message'),'Đã tải. SL là số học sinh được tính vào ĐTB môn. Môn không đăng ký để trống; XH từng môn trong cùng khối, không phân biệt ban. Môn còn thiếu điểm chưa xếp hạng.','info');
    }catch(e){if(token===request)message($('choice-report-message'),e.message,'error')}
    finally{$('choice-report-load').disabled=false}
  };
  for(const id of ['choice-report-grade','choice-report-class','choice-report-ties']){const node=$(id);if(node)node.onchange=render;}
  for(const id of ['choice-report-absent','choice-report-violations'])$(id).onchange=clear;
  const picker=$('choice-report-subjects');
  if(picker)picker.onchange=()=>{subjects=[...picker.querySelectorAll('input:checked')].map(n=>n.value);render();};
  $('choice-report-excel').onclick=()=>{
    if(!ready())return;const wb=window.XLSX.utils.book_new();
    const add=(name,rows,kind='roster')=>{
      const ws=window.XLSX.utils.aoa_to_sheet([[payload.name],[payload.school_year],[],...rows]);
      ws['!cols']=rows[0].map((_,i)=>({wch:i===2?28:15}));
      ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:rows[0].length-1}},{s:{r:1,c:0},e:{r:1,c:rows[0].length-1}}];
      for(const [address,cell] of Object.entries(ws))if(cell&&cell.t==='n'){
        const col=window.XLSX.utils.decode_cell(address).c;
        cell.z=(kind==='summary'?col>0&&(col-1)%3===0:col>=4)?'0.000':'0';
      }
      window.XLSX.utils.book_append_sheet(wb,ws,name.replace(/[\\/?*\[\]:]/g,' ').slice(0,31));
    };
    add('Thong ke',choiceSummarySheet(payload,selectedClasses(),tieMode(),subjects),'summary');
    const students=selectedStudents();for(const cls of selectedClasses())add(cls.class_code,choiceRosterSheet(students.filter(c=>c.class_code===cls.class_code)));
    add('Lua chon',[['Tính vắng',payload.include_absent],['Tính vi phạm',payload.include_violations],['SL','Số học sinh thực sự được tính vào ĐTB'],['XH',rankNote()],['Tổng/TB','Chỉ tính khi đủ điểm của mọi môn đã đăng ký']]);
    window.XLSX.writeFile(wb,`bao-cao-lua-chon-${state.selectedExam}.xlsx`);
  };
  function print(roster){
    if(!ready())return;
    const students=selectedStudents(),header=`<header><div>${esc(payload.managing_authority||'')}<br>${esc(payload.institution_name||'')}</div><div>${esc(payload.name)}<br>Năm học ${esc(payload.school_year)}</div></header>`;
    const policy='';
    const pages=roster?selectedClasses().map(cls=>{
      const list=students.filter(c=>c.class_code===cls.class_code);
      return `<section class="page">${header}<h3>KẾT QUẢ CHẤM THI — ${esc(cls.class_code)}</h3>${policy}${tableHtml(choiceRosterSheet(list),true)}</section>`;
    }).join(''):`<section>${header}<h3>THỐNG KÊ ĐIỂM THEO LỚP</h3>${policy}${tableHtml(choiceSummarySheet(payload,selectedClasses(),tieMode(),subjects))}<p>${esc(rankNote())} SL là số được tính vào ĐTB. Ô trống: không đăng ký hoặc chưa có điểm; xem bảng chi tiết để đối chiếu.</p></section>`;
    const win=createPrintFrame();
    win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(payload.name)}</title><style>
      @page{size:A4 ${roster?'portrait':'landscape'};margin:${roster?'10':'5'}mm}body{font:10pt 'Times New Roman',serif;margin:0}header{display:flex;justify-content:space-between;text-align:center;font-weight:bold}h3{text-align:center;margin:2mm 0}.policy{font-size:8pt;margin:1mm 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:1mm;text-align:center}thead{display:table-header-group}tr{break-inside:avoid}.roster{font-size:9pt;line-height:1.1}.roster th,.roster td{padding:0.5mm}.roster td:nth-child(3){text-align:left;min-width:35mm}.page{break-after:page}.page:last-child{break-after:auto}.summary{font-size:8pt;table-layout:fixed}.summary th,.summary td{padding:0.6mm 0.2mm;overflow-wrap:anywhere}.summary th:first-child{width:12mm}.summary tbody tr:last-child{font-weight:bold;background:#eee}
      </style></head><body>${pages}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);win.document.close();
  }
  $('choice-report-summary-pdf').onclick=()=>print(false);$('choice-report-roster-pdf').onclick=()=>print(true);
  return {invalidate:clear,refresh(){if(key&&key!==context())clear()}};
}
