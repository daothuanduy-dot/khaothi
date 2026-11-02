export function rankClassReport(data,{allSubjects=false,grade='',dense=false}={}){
  const blocks=(data.groups||[]).map(g=>({...g,classes:(data.classes||[]).filter(c=>c.ban_id===g.id)}));
  const unassigned=(data.classes||[]).filter(c=>!c.ban_id);
  for(const grade of [...new Set(unassigned.map(c=>c.grade_code))])blocks.push({id:'unassigned-'+grade,name:'Chưa phân ban',grade_code:grade,compatible:false,classes:unassigned.filter(c=>c.grade_code===grade)});
  const ranks=items=>{
    const sorted=[...items].sort((a,b)=>b.value-a.value),result=new Map();let position=0,last;
    sorted.forEach((x,i)=>{if(i===0||x.value!==last)position=dense?position+1:i+1;result.set(x.key,position);last=x.value});return result;
  };
  return blocks.map(block=>{
    const classes=block.classes.filter(c=>!grade||c.grade_code===grade).map(c=>({...c,subjects:c.subjects.map(s=>({...s}))})).sort((a,b)=>a.class_code.localeCompare(b.class_code,'vi',{numeric:true}));
    const codes=[...new Set(classes.flatMap(c=>c.subjects.filter(s=>allSubjects||s.is_counted).map(s=>s.subject_code)))].sort();
    const ready=!!data.period_id&&block.compatible&&classes.length===block.classes.length&&classes.length>0&&classes.every(c=>c.total_score!=null&&!c.incomplete);
    const totalRanks=ready?ranks(classes.map(c=>({key:c.class_code,value:Number(c.total_score)}))):new Map();
    for(const code of codes){
      const comparable=!!data.period_id&&block.compatible&&classes.every(c=>c.subjects.some(s=>s.subject_code===code&&s.average_score!=null&&!s.error&&!s.missing_count));
      const order=comparable?ranks(classes.map(c=>({key:c.class_code,value:Number(c.subjects.find(s=>s.subject_code===code).average_score)}))):new Map();
      for(const c of classes){const s=c.subjects.find(s=>s.subject_code===code);if(s)s.rank=order.get(c.class_code)??null;}
    }
    for(const c of classes)c.rank=totalRanks.get(c.class_code)??null;
    return {...block,classes,codes,ready};
  }).filter(b=>b.classes.length);
}

export function classReportSheet(block){
  const width=1+block.codes.length*2+3,tail=width-3;
  const first=['Lớp'],second=[''],merges=[];
  for(const code of block.codes){const name=block.classes.flatMap(c=>c.subjects).find(s=>s.subject_code===code)?.subject_name||code;const col=first.length;first.push(name,'');second.push('ĐTB','XT');merges.push({s:{r:0,c:col},e:{r:0,c:col+1}})}
  first.push('Tổng môn tính điểm','TB môn tính điểm','XT theo ban');second.push('','','');
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

export function wireClassReport({state,$,esc,message}){
  let payload=null,key='',request=0;
  const context=()=>JSON.stringify([state.selectedExam||'',!!$('class-report-absent').checked,!!$('class-report-violations').checked,state.statisticsRevision||0]);
  const options=()=>({allSubjects:$('class-report-scope').value==='all',grade:$('class-report-grade').value,dense:$('class-report-ties').value==='dense'});
  const number=value=>value==null?'—':Number(value).toFixed(3);
  function clear(){++request;payload=null;key='';$('class-report-results').innerHTML='';$('class-report-export').disabled=true;}
  function render(){
    if(!payload)return;
    const blocks=rankClassReport(payload,options());
    $('class-report-results').innerHTML=blocks.map(b=>`<h3>${esc(b.grade_code||'')} · ${esc(b.name)}</h3><p>${b.ready?'Xếp hạng trong ban.':'Chưa xếp hạng: cần học kỳ liên kết, ban cùng bộ môn tính điểm và đủ điểm từng lớp.'}</p><div class="table-wrap"><table><thead><tr><th rowspan="2">Lớp / GVCN</th>${b.codes.map(code=>`<th colspan="2">${esc(b.classes.flatMap(c=>c.subjects).find(s=>s.subject_code===code)?.subject_name||code)}</th>`).join('')}<th rowspan="2">Tổng</th><th rowspan="2">TB</th><th rowspan="2">XT theo ban</th></tr><tr>${b.codes.map(()=>'<th>ĐTB</th><th>XT</th>').join('')}</tr></thead><tbody>${b.classes.map(c=>`<tr><td rowspan="2">${esc(c.class_code)}<br><small>${esc(c.homeroom_teacher)}</small>${c.incomplete?'<br>Thiếu điểm':''}</td>${b.codes.map(code=>{const s=c.subjects.find(s=>s.subject_code===code);return `<td title="${esc(s?.error||('Được tính: '+(s?.included_count??0)+'; thiếu điểm: '+(s?.missing_count??0)))}">${number(s?.average_score)}</td><td>${s?.rank??'—'}</td>`}).join('')}<td rowspan="2">${number(c.total_score)}</td><td rowspan="2">${number(c.average_score)}</td><td rowspan="2">${c.rank??'—'}</td></tr><tr>${b.codes.map(code=>`<td colspan="2"><em>${esc(c.subjects.find(s=>s.subject_code===code)?.teacher||'')}</em></td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th>ĐTB học sinh</th>${b.codes.map((code,i)=>`<td>${number(classReportSheet(b).rows.at(-1)[1+i*2]===''?null:classReportSheet(b).rows.at(-1)[1+i*2])}</td><td></td>`).join('')}<td colspan="3"></td></tr></tfoot></table></div>`).join('')||'<p>Không có lớp theo lựa chọn hiển thị.</p>';
    $('class-report-export').disabled=!blocks.length;
  }
  $('class-report-load').onclick=async()=>{
    const exam=state.selectedExam;if(!exam){message($('class-report-message'),'Chọn kỳ thi tại tab Kỳ thi.','error');return}
    clear();const token=request,captured=context();$('class-report-load').disabled=true;
    try{
      const{data,error}=await state.client.rpc('exam_get_class_statistics_report',{p_exam_id:exam,p_include_absent:!!$('class-report-absent').checked,p_include_violations:!!$('class-report-violations').checked});
      if(error)throw new Error(error.message);
      if(token!==request||captured!==context())return;
      payload=data;key=captured;
      if(!data.classes.some(c=>c.counted_subjects>0))$('class-report-scope').value='all';
      const grades=[...new Set(data.classes.map(c=>c.grade_code).filter(Boolean))].sort();
      const old=$('class-report-grade').value;$('class-report-grade').innerHTML='<option value="">Tất cả khối</option>'+grades.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');$('class-report-grade').value=grades.includes(old)?old:'';
      message($('class-report-message'),!data.period_id?'Chưa liên kết học kỳ phân công. Thiết lập tại Cấu hình kỳ thi.':data.exam_mode!=='default'?'Kỳ theo môn: hiển thị điểm và giáo viên; chưa có bộ môn tính điểm theo lớp để xếp hạng.':'Đã tải báo cáo. Thứ hạng chỉ so sánh trong từng ban.','info');render();
    }catch(e){if(token===request)message($('class-report-message'),e.message,'error')}
    finally{$('class-report-load').disabled=false}
  };
  for(const id of ['class-report-scope','class-report-grade','class-report-ties'])$(id).onchange=()=>{if(key===context())render();else clear()};
  for(const id of ['class-report-absent','class-report-violations'])$(id).onchange=clear;
  $('class-report-export').onclick=()=>{
    if(!payload||key!==context()){clear();return}
    const wb=window.XLSX.utils.book_new();let index=0;
    const exam=state.exams.find(e=>e.id===state.selectedExam);
    for(const block of rankClassReport(payload,options())){
      const table=classReportSheet(block),ws=window.XLSX.utils.aoa_to_sheet([
        [exam?.name||state.selectedExam],[(exam?.school_year||'')+' · '+(block.grade_code||'')+' · '+block.name],[],...table.rows
      ]);
      ws['!merges']=[...table.merges.map(m=>({s:{r:m.s.r+3,c:m.s.c},e:{r:m.e.r+3,c:m.e.c}})),
        {s:{r:0,c:0},e:{r:0,c:table.width-1}},{s:{r:1,c:0},e:{r:1,c:table.width-1}}];
      for(const [address,cell] of Object.entries(ws))if(cell&&cell.t==='n'){
        const col=window.XLSX.utils.decode_cell(address).c,tail=table.width-3;
        cell.z=(col>0&&col<tail&&col%2===1)||col===tail||col===tail+1?'0.000':'0';
      }
      ws['!cols']=Array.from({length:table.width},(_,i)=>({wch:i===0?23:14}));
      window.XLSX.utils.book_append_sheet(wb,ws,`${++index} ${block.name}`.replace(/[\\/?*\[\]:]/g,' ').slice(0,31));
    }
    window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.aoa_to_sheet([
      ['Kỳ thi',exam?.name||state.selectedExam],['Năm học',exam?.school_year||''],['Học kỳ phân công',payload.period_id||'Chưa liên kết'],
      ['Hiển thị môn',options().allSubjects?'Tất cả môn':'Môn tính điểm'],['Tính vắng',!!$('class-report-absent').checked],['Tính vi phạm',!!$('class-report-violations').checked],
      ['Đồng hạng',options().dense?'1,1,2':'1,1,3'],['Xếp hạng','Chỉ trong cùng ban; dùng điểm chưa làm tròn'],['Tổng/TB','Tổng các ĐTB môn tính điểm / số môn tính điểm']
    ]),'Thong tin');
    window.XLSX.writeFile(wb,`thong-ke-lop-${state.selectedExam}.xlsx`);
  };
  return {invalidate:clear,refresh(){if(key&&key!==context())clear()}};
}
