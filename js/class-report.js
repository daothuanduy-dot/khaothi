export function classReportSubjectOrder(codes){
 const order={VAN:0,TOAN:1,N1:2,ANH:2,LY:3,LI:3,HOA:4,SINH:5,SU:6,DIA:7,KTPL:8,GDKTPL:8,N4:9,TRUNG:9,N5:10,DUC:10};
 return [...new Set(codes)].sort((a,b)=>(order[a]??99)-(order[b]??99)||a.localeCompare(b,'vi',{numeric:true}));
}
export function defaultHiddenClassSubjects(codes){return new Set(codes.filter(code=>['N4','N5','TRUNG','DUC'].includes(code)))}
export function rankClassReport(data,{allSubjects=false,grade='',dense=false}={}){
  const choice=['subject','choice'].includes(data.exam_mode);
  const blocks=(data.groups||[]).map(g=>({...g,classes:(data.classes||[]).filter(c=>c.ban_id===g.id)}));
  const unassigned=(data.classes||[]).filter(c=>!c.ban_id);
  for(const grade of [...new Set(unassigned.map(c=>c.grade_code))])blocks.push({id:'unassigned-'+grade,name:'Chưa phân ban',grade_code:grade,compatible:false,classes:unassigned.filter(c=>c.grade_code===grade)});
  if(choice){blocks.length=0;for(const g of new Set((data.classes||[]).map(c=>c.grade_code)))blocks.push({id:'grade-'+g,name:'',grade_code:g,choice:true,classes:data.classes.filter(c=>c.grade_code===g)});}
  const ranks=items=>{
    const sorted=[...items].sort((a,b)=>b.value-a.value),result=new Map();let position=0,last;
    sorted.forEach((x,i)=>{if(i===0||x.value!==last)position=dense?position+1:i+1;result.set(x.key,position);last=x.value});return result;
  };
  return blocks.map(block=>{
    const classes=block.classes.filter(c=>!grade||c.grade_code===grade).map(c=>({...c,subjects:c.subjects.map(s=>({...s}))})).sort((a,b)=>a.class_code.localeCompare(b.class_code,'vi',{numeric:true}));
    const codes=[...new Set(classes.flatMap(c=>c.subjects.filter(s=>choice||allSubjects||s.is_counted).map(s=>s.subject_code)))].sort();
    if(choice)for(const c of classes){
      c.incomplete=c.subjects.some(s=>s.missing_count>0||s.error);
      const valid=c.subjects.filter(s=>s.average_score!=null&&Number(s.included_count)>0);
      c.total_score=!c.incomplete&&valid.length?valid.reduce((sum,s)=>sum+Number(s.average_score),0):null;
      c.average_score=c.total_score==null?null:c.total_score/valid.length;
    }
    const ready=choice?classes.some(c=>c.average_score!=null&&!c.incomplete):!!data.period_id&&block.compatible&&classes.length===block.classes.length&&classes.length>0&&classes.every(c=>c.total_score!=null&&!c.incomplete);
    const totalRanks=choice?ranks(classes.filter(c=>c.average_score!=null&&!c.incomplete).map(c=>({key:c.class_code,value:Number(c.average_score)}))):ready?ranks(classes.map(c=>({key:c.class_code,value:Number(c.total_score)}))):new Map();
    for(const code of codes){
      const comparable=!!data.period_id&&block.compatible&&classes.every(c=>c.subjects.some(s=>s.subject_code===code&&s.average_score!=null&&!s.error&&!s.missing_count));
      const eligible=classes.filter(c=>{const s=c.subjects.find(s=>s.subject_code===code);return s&&s.average_score!=null&&Number(s.included_count)>0&&!s.error&&!s.missing_count});
      const order=choice?ranks(eligible.map(c=>({key:c.class_code,value:Number(c.subjects.find(s=>s.subject_code===code).average_score)}))):comparable?ranks(classes.map(c=>({key:c.class_code,value:Number(c.subjects.find(s=>s.subject_code===code).average_score)}))):new Map();
      for(const c of classes){const s=c.subjects.find(s=>s.subject_code===code);if(s)s.rank=order.get(c.class_code)??null;}
    }
    for(const c of classes)c.rank=totalRanks.get(c.class_code)??null;
    return {...block,classes,codes,ready};
  }).filter(b=>b.classes.length);
}

export function classReportSheet(block){
  if(block.choice)return choiceClassReportSheet(block);
  const width=1+block.codes.length*2+3,tail=width-3;
  const first=['Lớp'],second=[''],merges=[];
  for(const code of block.codes){const name=code==='KTPL'?'KTPL':block.classes.flatMap(c=>c.subjects).find(s=>s.subject_code===code)?.subject_name||code;const col=first.length;first.push(name,'');second.push('ĐTB','XT');merges.push({s:{r:0,c:col},e:{r:0,c:col+1}})}
  first.push(block.choice?'Tổng ĐTB môn thi':'Tổng môn tính điểm',block.choice?'TB môn thi':'TB môn tính điểm',block.choice?'':'XT theo ban');second.push('','','');
  for(const col of [0,tail,tail+1,tail+2])merges.push({s:{r:0,c:col},e:{r:1,c:col}});
  const rows=[first,second];
  for(const c of block.classes){
    const top=[c.class_code+'\n'+c.homeroom_teacher],bottom=[''],r=rows.length;
    for(const code of block.codes){const s=c.subjects.find(s=>s.subject_code===code);const col=top.length;
      top.push(s?.average_score??'',s?.rank??'');bottom.push(s?.teacher||'','');merges.push({s:{r:r+1,c:col},e:{r:r+1,c:col+1}});
    }
    top.push(c.total_score??'',c.average_score??'',c.rank??'');bottom.push('','','');
    for(const col of [0,tail,tail+1,tail+2])merges.push({s:{r,c:col},e:{r:r+1,c:col}});
    rows.push(top,bottom);
  }
  const footer=['ĐTB học sinh'];
  for(const code of block.codes){
    const cells=block.classes.flatMap(c=>c.subjects.filter(s=>s.subject_code===code&&s.average_score!=null));
    const denominator=cells.reduce((n,s)=>n+Number(s.included_count||0),0);
    footer.push(denominator?cells.reduce((n,s)=>n+Number(s.average_score)*Number(s.included_count||0),0)/denominator:'','');
  }
  footer.push('','','');rows.push(footer);
  return {rows,merges,width};
}

export function choiceClassReportSheet(block){
 const width=1+block.codes.length*3+2,tail=width-2,first=['Lớp / GVCN'],second=[''],merges=[];
 for(const code of block.codes){const col=first.length,name=code==='KTPL'?'KTPL':block.classes.flatMap(c=>c.subjects).find(s=>s.subject_code===code)?.subject_name||code;first.push(name,'','');second.push('SL','ĐTB','XH');merges.push({s:{r:0,c:col},e:{r:0,c:col+2}})}
 first.push('TB bài thi','XH TB');second.push('','');
 for(const col of [0,tail,tail+1])merges.push({s:{r:0,c:col},e:{r:1,c:col}});
 const rows=[first,second];
 for(const c of block.classes){const home=c.homeroom_teacher==='Chưa phân công'?'':c.homeroom_teacher;const top=[c.class_code+(home?'\n'+home:'')],bottom=[''],r=rows.length;
  for(const code of block.codes){const s=c.subjects.find(s=>s.subject_code===code),col=top.length;top.push(s?.participated_count??'',s?.average_score??'',s?.rank??'');bottom.push(s?.teacher==='Chưa phân công'?'':s?.teacher||'','','');merges.push({s:{r:r+1,c:col},e:{r:r+1,c:col+2}})}
  top.push(c.average_score??'',c.rank??'');bottom.push('','');for(const col of [0,tail,tail+1])merges.push({s:{r,c:col},e:{r:r+1,c:col}});rows.push(top,bottom);
 }
 const footer=['TB các lớp'];
 for(const code of block.codes){const cells=block.classes.flatMap(c=>c.subjects.filter(s=>s.subject_code===code));const valid=cells.filter(s=>s.average_score!=null&&Number(s.included_count)>0);const counted=cells.filter(s=>s.participated_count!=null);footer.push(counted.length?counted.reduce((n,s)=>n+Number(s.participated_count),0):'',valid.length?valid.reduce((n,s)=>n+Number(s.average_score),0)/valid.length:'','')}
 const averages=block.classes.filter(c=>c.average_score!=null);footer.push(averages.length?averages.reduce((n,c)=>n+Number(c.average_score),0)/averages.length:'','');rows.push(footer);
 return {rows,merges,width};
}
export function attachChoiceParticipation(data,details){
 return {...data,classes:data.classes.map(c=>({...c,subjects:c.subjects.map(s=>{
  const rows=details.filter(r=>r.class_code===c.class_code&&r.subject_code===s.subject_code),present=rows.filter(r=>!r.is_absent),scores=present.filter(r=>r.statistics_score!=null&&Number.isFinite(Number(r.statistics_score))).map(r=>Number(r.statistics_score));
  return {...s,participated_count:new Set(present.map((r,i)=>r.candidate_id??r.sbd??i)).size,maximum_score:scores.length?Math.max(...scores):null};
 })}))};
}
export function maxScoreSheet(block){
 const first=[],second=[],values=[],merges=[];
 for(const code of block.codes){const cells=block.classes.flatMap(c=>c.subjects.filter(s=>s.subject_code===code)),name=code==='KTPL'?'KTPL':cells[0]?.subject_name||code,col=first.length;
  const counts=cells.filter(s=>s.participated_count!=null),max=cells.filter(s=>s.maximum_score!=null).map(s=>Number(s.maximum_score));
  first.push(name,'');second.push('Số dự thi','Max điểm');values.push(counts.length?counts.reduce((n,s)=>n+Number(s.participated_count),0):'',max.length?Math.max(...max):'');merges.push({s:{r:0,c:col},e:{r:0,c:col+1}});
 }
 return {rows:[first,second,values],merges,width:first.length};
}
export function statisticsHeaderHtml(header,esc){return `<header class="statistics-header"><div><b>${esc(header.authority||'')}</b><br><b>${esc(header.institution||'')}</b></div><div><b>${esc(header.exam_title||'')}</b><br><b>${esc(header.grade_label||'')}</b></div></header><h2>${esc(header.report_title||'')}</h2><p class="school-year">Năm học ${esc(header.school_year||'')}</p>`}
export function maxScoreSections(block){
 const sections=[];for(let i=0;i<block.codes.length;i+=6){const codes=block.codes.slice(i,i+6);sections.push({...maxScoreSheet({...block,codes}),count:codes.length})}return sections;
}
export function statisticsExportSheet(block,header,{extra=false}={}){
 const main=classReportSheet(block),width=main.width,middle=Math.max(1,Math.floor(width/2)),top=[header.authority||''],second=[header.institution||''];
 top[middle]=header.exam_title||'';second[middle]=header.grade_label||'';
 const rows=[top,second,[header.report_title||''],['Năm học '+(header.school_year||'')],[]],merges=[],scoreCells=[];
 for(const r of [0,1])merges.push({s:{r,c:0},e:{r,c:middle-1}},{s:{r,c:middle},e:{r,c:width-1}});
 for(const r of [2,3])merges.push({s:{r,c:0},e:{r,c:width-1}});
 if(extra&&block.choice)for(const section of maxScoreSections(block)){
  const offset=rows.length,n=section.count,left=section.count===Math.min(block.codes.length,6)?0:width-Math.round(width*n/Math.min(block.codes.length,6));
  const boundary=j=>left+Math.floor(j*(width-left)/(2*n));
  const part=Array.from({length:3},()=>Array(width).fill(''));
  for(let j=0;j<n;j++){
   const start=boundary(j*2),end=boundary(j*2+2)-1;part[0][start]=section.rows[0][j*2];merges.push({s:{r:offset,c:start},e:{r:offset,c:end}});
   for(let k=0;k<2;k++){const col=boundary(j*2+k),last=boundary(j*2+k+1)-1;part[1][col]=section.rows[1][j*2+k];part[2][col]=section.rows[2][j*2+k];for(const r of [offset+1,offset+2])if(last>col)merges.push({s:{r,c:col},e:{r,c:last}});if(k===1)scoreCells.push({r:offset+2,c:col})}
  }
  rows.push(...part,[]);
 }
 const offset=rows.length;rows.push(...main.rows);merges.push(...main.merges.map(m=>({s:{r:m.s.r+offset,c:m.s.c},e:{r:m.e.r+offset,c:m.e.c}})));
 for(let r=offset+2;r<rows.length;r++)for(let c=0;c<width;c++){
  const tail=width-(block.choice?2:3),score=block.choice?(c>0&&c<tail&&(c-2)%3===0)||c===tail:(c>0&&c<tail&&c%2===1)||c===tail||c===tail+1;
  if(score&&typeof rows[r][c]==='number')scoreCells.push({r,c});
 }
 return {rows,merges,width,scoreCells};
}
export function statisticsTableHtml(table,esc,scoreColumns=[]){
 const covered=new Set(),starts=new Map();for(const m of table.merges){starts.set(`${m.s.r}:${m.s.c}`,m);for(let r=m.s.r;r<=m.e.r;r++)for(let c=m.s.c;c<=m.e.c;c++)if(r!==m.s.r||c!==m.s.c)covered.add(`${r}:${c}`)}
 const rowHtml=(row,r)=>`<tr>${row.map((value,c)=>{
  if(covered.has(`${r}:${c}`))return '';const m=starts.get(`${r}:${c}`),tag=r<2?'th':'td';
  const text=value==null?'':typeof value==='number'&&scoreColumns.includes(c)?value.toFixed(3):value;
  return `<${tag}${m?` rowspan="${m.e.r-m.s.r+1}" colspan="${m.e.c-m.s.c+1}"`:''}>${esc(text).replace(/\n/g,'<br>')}</${tag}>`;
 }).join('')}</tr>`;
 return `<table><thead>${table.rows.slice(0,2).map(rowHtml).join('')}</thead><tbody>${table.rows.slice(2).map((r,i)=>rowHtml(r,i+2)).join('')}</tbody></table>`;
}

export function wireClassReport({state,$,esc,message,createPrintFrame}){
  let payload=null,key='',request=0,subjectOrder=[],hiddenSubjects=new Set();
  let headerExam='';
  const headerFields=['authority','institution','report_title','exam_title','school_year'];
  function loadHeader(){
    if(headerExam===state.selectedExam)return;headerExam=state.selectedExam;
    const exam=state.exams.find(e=>e.id===state.selectedExam)||{},saved=exam.form_print_settings?.statistics_header||{};
    const defaults={authority:exam.managing_authority||'',institution:exam.institution_name||'',report_title:'THỐNG KÊ KẾT QUẢ THI',exam_title:exam.form_exam_title||exam.name||'',school_year:exam.school_year||''};
    for(const field of headerFields){const node=$('statistics-header-'+field);if(node)node.value=saved[field]??defaults[field]}
  }
  const header=()=>({...Object.fromEntries(headerFields.map(f=>[f,$('statistics-header-'+f)?.value||''])),grade_label:'Khối '+[...new Set(visibleBlocks().map(b=>b.grade_code).filter(Boolean))].join(', ')});
  const extraMax=()=>!!$('class-report-extra-max')?.checked;
  const scoreColumns=b=>[...b.codes.map((_,i)=>2+i*3),1+b.codes.length*3];
  const currentSheet=classReportSheet;
  const choiceBlocksHtml=(blocks,forPrint=false)=>blocks.map(b=>`${!forPrint||blocks.length>1?`<h3>Khối ${esc(b.grade_code||'')}</h3>`:''}${extraMax()?`<div class="extra-statistics" style="background:#ddd;margin-bottom:4mm">${maxScoreSections(b).map(s=>`<div class="table-wrap" style="width:${s.count/Math.min(b.codes.length,6)*100}%;margin-left:auto">${statisticsTableHtml(s,esc,Array.from({length:s.count},(_,i)=>i*2+1))}</div>`).join('')}</div>`:''}<div class="table-wrap">${statisticsTableHtml(currentSheet(b),esc,scoreColumns(b))}</div>`).join('');
  const visibleBlocks=()=>rankClassReport(payload,options()).map(b=>({...b,codes:subjectOrder.filter(code=>b.codes.includes(code)&&!hiddenSubjects.has(code))})).filter(b=>b.codes.length);
  function renderSubjects(){
    const el=$('class-report-subjects');if(!el)return;
    el.innerHTML=subjectOrder.map((code,i)=>`<div style="display:flex;align-items:center;gap:8px;margin:6px"><label><input type="checkbox" data-code="${esc(code)}" ${hiddenSubjects.has(code)?'':'checked'}> ${esc(payload.classes.flatMap(c=>c.subjects).find(s=>s.subject_code===code)?.subject_name||code)}</label><button type="button" data-move="-1" data-code="${esc(code)}" ${i===0?'disabled':''} aria-label="Đưa ${esc(code)} lên">↑</button><button type="button" data-move="1" data-code="${esc(code)}" ${i===subjectOrder.length-1?'disabled':''} aria-label="Đưa ${esc(code)} xuống">↓</button></div>`).join('');
  }
  const context=()=>JSON.stringify([state.selectedExam||'',!!$('class-report-absent').checked,!!$('class-report-violations').checked,state.statisticsRevision||0]);
  const options=()=>({allSubjects:$('class-report-scope').value==='all',grade:$('class-report-grade').value,dense:$('class-report-ties').value==='dense'});
  const number=value=>value==null?'':Number(value).toFixed(3);
  function clear(){++request;payload=null;key='';$('class-report-results').innerHTML='';$('class-report-export').disabled=true;if($('class-report-pdf'))$('class-report-pdf').disabled=true;}
  function render(){
    if(!payload)return;
    const blocks=visibleBlocks();
    if(['subject','choice'].includes(payload.exam_mode)){
      $('class-report-results').innerHTML=choiceBlocksHtml(blocks)||'<p>Không có lớp theo lựa chọn.</p>';
      $('class-report-export').disabled=!blocks.length;if($('class-report-pdf'))$('class-report-pdf').disabled=!blocks.length;return;
    }
    $('class-report-results').innerHTML=blocks.map(b=>`${b.choice?'':`<h3>${esc(b.grade_code||'')} · ${esc(b.name)}</h3>`}<p>${b.choice?'Xếp hạng từng môn theo ĐTB giảm dần giữa các lớp có điểm hợp lệ trong cùng khối. Lớp còn thiếu điểm môn nào chưa xếp hạng môn đó; Tổng/TB để trống nếu còn thiếu điểm.':b.ready?'Xếp hạng trong ban.':'Chưa xếp hạng: cần học kỳ liên kết, ban cùng bộ môn tính điểm và đủ điểm từng lớp.'}</p><div class="table-wrap"><table><thead><tr><th rowspan="2">Lớp / GVCN</th>${b.codes.map(code=>`<th colspan="2">${esc(code==='KTPL'?'KTPL':b.classes.flatMap(c=>c.subjects).find(s=>s.subject_code===code)?.subject_name||code)}</th>`).join('')}<th rowspan="2">Tổng</th><th rowspan="2">TB</th><th rowspan="2">${b.choice?'—':'XT theo ban'}</th></tr><tr>${b.codes.map(()=>'<th>ĐTB</th><th>XT</th>').join('')}</tr></thead><tbody>${b.classes.map(c=>`<tr><td rowspan="2">${esc(c.class_code)}<br><small>${esc(c.homeroom_teacher)}</small>${c.incomplete?'<br>Thiếu điểm':''}</td>${b.codes.map(code=>{const s=c.subjects.find(s=>s.subject_code===code);return `<td title="${esc(s?.error||('Được tính: '+(s?.included_count??0)+'; thiếu điểm: '+(s?.missing_count??0)))}">${number(s?.average_score)}</td><td>${s?.rank??'—'}</td>`}).join('')}<td rowspan="2">${number(c.total_score)}</td><td rowspan="2">${number(c.average_score)}</td><td rowspan="2">${c.rank??'—'}</td></tr><tr>${b.codes.map(code=>`<td colspan="2"><em>${esc(c.subjects.find(s=>s.subject_code===code)?.teacher||'')}</em></td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th>ĐTB học sinh</th>${b.codes.map((code,i)=>`<td>${number(classReportSheet(b).rows.at(-1)[1+i*2]===''?null:classReportSheet(b).rows.at(-1)[1+i*2])}</td><td></td>`).join('')}<td colspan="3"></td></tr></tfoot></table></div>`).join('')||'<p>Không có lớp theo lựa chọn hiển thị.</p>';
    $('class-report-export').disabled=!blocks.length;if($('class-report-pdf'))$('class-report-pdf').disabled=!blocks.length;
  }
  $('class-report-load').onclick=async()=>{
    const exam=state.selectedExam;if(!exam){message($('class-report-message'),'Chọn kỳ thi tại tab Kỳ thi.','error');return}
    clear();const token=request,captured=context();$('class-report-load').disabled=true;
    try{
      const{data,error}=await state.client.rpc('exam_get_class_statistics_report',{p_exam_id:exam,p_include_absent:!!$('class-report-absent').checked,p_include_violations:!!$('class-report-violations').checked});
      if(error)throw new Error(error.message);
      if(token!==request||captured!==context())return;
      let report=data;
      if(['subject','choice'].includes(data.exam_mode)){
        const detail=await state.client.rpc('exam_get_choice_statistics_report',{p_exam_id:exam,p_include_absent:!!$('class-report-absent').checked,p_include_violations:!!$('class-report-violations').checked});
        if(detail.error)throw new Error('Không tải được số dự thi/điểm cao nhất: '+detail.error.message);
        if(token!==request||captured!==context())return;
        report=attachChoiceParticipation(data,detail.data.rows||[]);
      }
      payload=report;key=captured;loadHeader();
      if($('class-report-extra-max'))$('class-report-extra-max').disabled=data.exam_mode==='default';
      subjectOrder=classReportSubjectOrder(data.classes.flatMap(c=>c.subjects.map(s=>s.subject_code)));hiddenSubjects=['subject','choice'].includes(data.exam_mode)?defaultHiddenClassSubjects(subjectOrder):new Set();renderSubjects();
      if(!data.classes.some(c=>c.counted_subjects>0))$('class-report-scope').value='all';
      const grades=[...new Set(data.classes.map(c=>c.grade_code).filter(Boolean))].sort();
      const old=$('class-report-grade').value;$('class-report-grade').innerHTML='<option value="">Tất cả khối</option>'+grades.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');$('class-report-grade').value=grades.includes(old)?old:'';
      message($('class-report-message'),data.exam_mode!=='default'?'SL là số học sinh dự thi, không tính vắng. TB bài thi = trung bình các ĐTB môn của lớp có điểm được tính, không tính trọng số sĩ số. XH từng môn và XH TB so trong cùng khối, dùng điểm chưa làm tròn; lớp thiếu điểm chưa có TB/XH TB. Dòng TB các lớp = trung bình ĐTB các lớp, không tính trọng số học sinh.':!data.period_id?'Chưa liên kết học kỳ phân công. Thiết lập tại Cấu hình kỳ thi.':'Đã tải báo cáo. Thứ hạng chỉ so sánh trong từng ban.','info');render();
    }catch(e){if(token===request)message($('class-report-message'),e.message,'error')}
    finally{$('class-report-load').disabled=false}
  };
  for(const id of ['class-report-scope','class-report-grade','class-report-ties','class-report-extra-max'])if($(id))$(id).onchange=()=>{if(key===context())render();else clear()};
  for(const id of ['class-report-absent','class-report-violations'])$(id).onchange=clear;
  const picker=$('class-report-subjects');
  if(picker){
    picker.onchange=e=>{const code=e.target.dataset.code;if(!code||!payload)return;e.target.checked?hiddenSubjects.delete(code):hiddenSubjects.add(code);render();};
    picker.onclick=e=>{const button=e.target.closest('button[data-move]');if(!button||!payload)return;const i=subjectOrder.indexOf(button.dataset.code),j=i+Number(button.dataset.move);if(i<0||j<0||j>=subjectOrder.length)return;[subjectOrder[i],subjectOrder[j]]=[subjectOrder[j],subjectOrder[i]];renderSubjects();render();};
  }
  const pdf=$('class-report-pdf');
  if(pdf)pdf.onclick=()=>{
    if(!payload||key!==context()){clear();return}
    render();
    const exam=state.exams.find(e=>e.id===state.selectedExam),win=createPrintFrame();
    const choice=['subject','choice'].includes(payload.exam_mode);
    const note=(choice?'SL: số học sinh dự thi, không tính vắng. ĐTB theo lựa chọn vắng, vi phạm khi tải báo cáo. TB bài thi = trung bình các ĐTB môn hợp lệ của lớp, không tính trọng số sĩ số. TB các lớp là trung bình các ĐTB lớp. XH so trong cùng khối.':'Tổng = tổng ĐTB môn tính điểm; TB = Tổng / số môn tính điểm. XH trong ban.')+` Đồng hạng ${options().dense?'1,1,2':'1,1,3'}.`+(choice&&extraMax()?' Max: điểm thống kê cao nhất của học sinh dự thi theo lựa chọn xử lý vi phạm.':'');
    win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thống kê lớp</title><style>
      @page{size:A4 landscape;margin:5mm}body{font:9pt 'Times New Roman',serif;margin:0}h2,h3{text-align:center}table{border-collapse:collapse;width:100%;font-size:8pt}th,td{border:1px solid #000;padding:0.7mm;text-align:center}thead{display:table-header-group}tfoot{display:table-row-group}tr{break-inside:avoid}.table-wrap{overflow:visible}h3{break-after:avoid}small{font-size:7pt}
      .statistics-header{display:grid;grid-template-columns:1fr 1fr;text-align:center;margin-bottom:5mm;font-size:11pt}.school-year{text-align:center}table{table-layout:fixed}th,td{overflow-wrap:anywhere}.extra-statistics{background:#ddd;margin-bottom:4mm;break-inside:avoid}.extra-statistics th{background:white}.extra-statistics tbody{font-weight:bold;font-style:italic}
      </style></head><body>${statisticsHeaderHtml(header(),esc)}${choice?choiceBlocksHtml(visibleBlocks(),true):$('class-report-results').innerHTML}<p>${esc(note)}</p><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);win.document.close();
  };
  $('class-report-export').onclick=()=>{
    if(!payload||key!==context()){clear();return}
    const wb=window.XLSX.utils.book_new();let index=0;
    const exam=state.exams.find(e=>e.id===state.selectedExam);
    for(const block of visibleBlocks()){
      const table=statisticsExportSheet(block,{...header(),grade_label:'Khối '+(block.grade_code||'')},{extra:extraMax()});
      const ws=window.XLSX.utils.aoa_to_sheet(table.rows);ws['!merges']=table.merges;
      const scoreCells=new Set(table.scoreCells.map(p=>`${p.r}:${p.c}`));
      for(const [address,cell] of Object.entries(ws))if(cell&&cell.t==='n'){
        const position=window.XLSX.utils.decode_cell(address);
        cell.z=scoreCells.has(`${position.r}:${position.c}`)?'0.000':'0';
      }
      ws['!cols']=Array.from({length:table.width},(_,i)=>({wch:i===0?23:14}));
      window.XLSX.utils.book_append_sheet(wb,ws,`${++index} ${block.name}`.replace(/[\\/?*\[\]:]/g,' ').slice(0,31));
    }
    window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.aoa_to_sheet([
      ['Kỳ thi',exam?.name||state.selectedExam],['Năm học',exam?.school_year||''],['Học kỳ phân công',payload.period_id||'Chưa liên kết'],
      ['Hiển thị môn',options().allSubjects?'Tất cả môn':'Môn tính điểm'],['Tính vắng',!!$('class-report-absent').checked],['Tính vi phạm',!!$('class-report-violations').checked],
      ['Đồng hạng',options().dense?'1,1,2':'1,1,3'],['Xếp hạng',payload.exam_mode==='default'?'Trong ban':'Trong cùng khối, XH môn theo ĐTB môn; XH TB theo TB bài thi'],['TB bài thi','Trung bình ĐTB môn hợp lệ của từng lớp, không trọng số học sinh'],['TB các lớp','Trung bình ĐTB lớp; không trọng số sĩ số'],['SL','Học sinh dự thi, không tính vắng'],...(extraMax()&&payload.exam_mode!=='default'?[['Max','Điểm thống kê cao nhất của học sinh dự thi theo lựa chọn xử lý vi phạm']]:[])
    ]),'Thong tin');
    window.XLSX.writeFile(wb,`thong-ke-lop-${state.selectedExam}.xlsx`);
  };
  const saveHeader=$('statistics-header-save');
  if(saveHeader)saveHeader.onclick=async()=>{
    const examId=state.selectedExam;if(!examId||headerExam!==examId){message($('class-report-message'),'Tải báo cáo của kỳ thi cần lưu tiêu đề trước.','error');return}
    saveHeader.disabled=true;
    try{
      const value=header();if(Object.values(value).some(v=>v.length>300))throw new Error('Mỗi trường tiêu đề tối đa 300 ký tự.');
      const current=await state.client.from('exam_sessions').select('form_print_settings').eq('id',examId).single();if(current.error)throw new Error(current.error.message);
      const settings={...(current.data?.form_print_settings||{}),statistics_header:value};
      const result=await state.client.from('exam_sessions').update({form_print_settings:settings}).eq('id',examId);if(result.error)throw new Error(result.error.message);
      const exam=state.exams.find(e=>e.id===examId);if(exam)exam.form_print_settings=settings;
      message($('class-report-message'),'Đã lưu tiêu đề thống kê riêng cho kỳ thi.','success');
    }catch(error){message($('class-report-message'),error.message,'error')}finally{saveHeader.disabled=false}
  };
  return {invalidate:clear,refresh(){if(key&&key!==context())clear()}};
}
