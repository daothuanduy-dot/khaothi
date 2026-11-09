import {loadVanRows,enrichClassVan} from './van-report-fallback.js';
export function classReportSubjectOrder(codes){
 const order={VAN:0,TOAN:1,N1:2,ANH:2,LY:3,LI:3,HOA:4,SINH:5,SU:6,DIA:7,KTPL:8,GDKTPL:8,TIN:9,N4:10,TRUNG:10,N5:11,DUC:11};
 return [...new Set(codes)].sort((a,b)=>(order[a]??99)-(order[b]??99)||a.localeCompare(b,'vi',{numeric:true}));
}
export function defaultHiddenClassSubjects(codes){return new Set(codes.filter(code=>['N4','N5','TRUNG','DUC'].includes(code)))}
export function rankClassReport(data,{allSubjects=false,grade='',dense=false,byPaper=false,allowIncomplete=false,rankScope='grade',selectedClasses=null,rankGroups=[]}={}){
  const choice=['subject','choice'].includes(data.exam_mode);
  const blocks=(data.groups||[]).map(g=>({...g,classes:(data.classes||[]).filter(c=>c.ban_id===g.id)}));
  const unassigned=(data.classes||[]).filter(c=>!c.ban_id);
  for(const grade of [...new Set(unassigned.map(c=>c.grade_code))])blocks.push({id:'unassigned-'+grade,name:'Chưa phân ban',grade_code:grade,compatible:false,classes:unassigned.filter(c=>c.grade_code===grade)});
  if(choice){blocks.length=0;for(const g of new Set((data.classes||[]).map(c=>c.grade_code)))blocks.push({id:'grade-'+g,name:'',grade_code:g,choice:true,classes:data.classes.filter(c=>c.grade_code===g)});}
  const ranks=items=>{
    const sorted=[...items].sort((a,b)=>b.value-a.value),result=new Map();let position=0,last;
    sorted.forEach((x,i)=>{if(i===0||x.value!==last)position=dense?position+1:i+1;result.set(x.key,position);last=x.value});return result;
  };
  const result=blocks.map(block=>{
    const classes=block.classes.filter(c=>!grade||c.grade_code===grade).map(c=>({...c,subjects:c.subjects.map(s=>({...s}))})).sort((a,b)=>a.class_code.localeCompare(b.class_code,'vi',{numeric:true}));
    const codes=[...new Set(classes.flatMap(c=>c.subjects.filter(s=>choice||allSubjects||s.is_counted).map(s=>s.subject_code)))].sort();
    if(choice||byPaper||allowIncomplete)for(const c of classes){
      const subjects=c.subjects.filter(s=>choice||s.is_counted);
      c.incomplete=subjects.some(s=>s.missing_count>0||s.error);
      const valid=subjects.filter(s=>!s.error&&s.average_score!=null&&Number.isFinite(Number(s.average_score))&&Number(s.included_count)>0);
      c.paper_count=valid.reduce((sum,s)=>sum+Number(s.included_count),0);
      c.paper_total=valid.reduce((sum,s)=>sum+Number(s.average_score)*Number(s.included_count),0);
      const permitted=!subjects.some(s=>s.error)&&(!c.incomplete||allowIncomplete)&&valid.length;
      c.total_score=permitted?valid.reduce((sum,s)=>sum+Number(s.average_score),0):null;
      c.average_score=!permitted?null:byPaper?c.paper_total/c.paper_count:c.total_score/valid.length;
    }
    const ready=choice?classes.some(c=>c.average_score!=null&&!c.incomplete):!!data.period_id&&block.compatible&&classes.length===block.classes.length&&classes.length>0&&classes.every(c=>c.total_score!=null&&!c.incomplete);
    const totalRanks=choice?ranks(classes.filter(c=>c.average_score!=null&&(!c.incomplete||allowIncomplete)).map(c=>({key:c.class_code,value:Number(c.average_score)}))):ready?ranks(classes.map(c=>({key:c.class_code,value:Number(c.total_score)}))):new Map();
    for(const code of codes){
      const comparable=!!data.period_id&&block.compatible&&classes.every(c=>c.subjects.some(s=>s.subject_code===code&&s.average_score!=null&&!s.error&&!s.missing_count));
      const eligible=classes.filter(c=>{const s=c.subjects.find(s=>s.subject_code===code);return s&&s.average_score!=null&&Number(s.included_count)>0&&!s.error&&!s.missing_count});
      const order=choice?ranks(eligible.map(c=>({key:c.class_code,value:Number(c.subjects.find(s=>s.subject_code===code).average_score)}))):comparable?ranks(classes.map(c=>({key:c.class_code,value:Number(c.subjects.find(s=>s.subject_code===code).average_score)}))):new Map();
      for(const c of classes){const s=c.subjects.find(s=>s.subject_code===code);if(s)s.rank=order.get(c.class_code)??null;}
    }
    for(const c of classes)c.rank=totalRanks.get(c.class_code)??null;
    return {...block,classes,codes,ready,byPaper,allowIncomplete};
  }).filter(b=>b.classes.length);
  if(rankScope!=='grade'){
    // Rank against the full exam before applying display/grade filters.
    const universe=rankClassReport(data,{allSubjects,dense,byPaper,allowIncomplete}).flatMap(b=>b.classes);
    const selected=selectedClasses==null?new Set(universe.filter(c=>!grade||c.grade_code===grade).map(c=>c.class_code)):new Set(selectedClasses);
    const order=new Map();
    if(rankScope==='groups'){
      const used=new Set(),known=new Set(universe.map(c=>c.class_code));
      for(const group of rankGroups){
        for(const code of group){if(used.has(code))throw new Error(`Lớp ${code} bị trùng nhóm xếp hạng.`);if(!known.has(code))throw new Error(`Lớp ${code} không còn trong kỳ thi.`);used.add(code);}
        const members=new Set(group);
        for(const [code,rank] of ranks(universe.filter(c=>members.has(c.class_code)&&c.average_score!=null).map(c=>({key:c.class_code,value:Number(c.average_score)}))))order.set(code,rank);
      }
    }else for(const [code,rank] of ranks(universe.filter(c=>(rankScope==='all'||selected.has(c.class_code))&&c.average_score!=null).map(c=>({key:c.class_code,value:Number(c.average_score)}))))order.set(code,rank);
    for(const block of result){
      if(selectedClasses!=null)block.classes=block.classes.filter(c=>selected.has(c.class_code));
      for(const c of block.classes)c.rank=order.get(c.class_code)??null;
    }
  }
  return result.filter(b=>b.classes.length);
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
 first.push(block.byPaper?'TB theo bài thi':'TB các môn','Xếp hạng theo ĐTB');second.push('','');
 for(const col of [0,tail,tail+1])merges.push({s:{r:0,c:col},e:{r:1,c:col}});
 const rows=[first,second];
 for(const c of block.classes){const home=c.homeroom_teacher==='Chưa phân công'?'':c.homeroom_teacher;const top=[c.class_code+(home?'\n'+home:'')],bottom=[''],r=rows.length;
  for(const code of block.codes){const s=c.subjects.find(s=>s.subject_code===code),col=top.length;top.push(s?.participated_count??'',s?.average_score??'',s?.rank??'');bottom.push(s?.teacher==='Chưa phân công'?'':s?.teacher||'','','');merges.push({s:{r:r+1,c:col},e:{r:r+1,c:col+2}})}
  top.push(c.average_score??'',c.rank??'');bottom.push('','');for(const col of [0,tail,tail+1])merges.push({s:{r,c:col},e:{r:r+1,c:col}});rows.push(top,bottom);
 }
 const footer=['TB các lớp'];
 for(const code of block.codes){
  const cells=block.classes.flatMap(c=>c.subjects.filter(s=>s.subject_code===code));
  const valid=cells.filter(s=>!s.error&&s.average_score!=null&&Number(s.included_count)>0),counted=cells.filter(s=>s.participated_count!=null);
  const count=valid.reduce((n,s)=>n+Number(s.included_count),0);
  const mean=block.byPaper?(count?valid.reduce((n,s)=>n+Number(s.average_score)*Number(s.included_count),0)/count:''):valid.length?valid.reduce((n,s)=>n+Number(s.average_score),0)/valid.length:'';
  footer.push(counted.length?counted.reduce((n,s)=>n+Number(s.participated_count),0):'',mean,'');
 }
 const averages=block.classes.filter(c=>c.average_score!=null);
 const papers=averages.reduce((n,c)=>n+Number(c.paper_count||0),0);
 footer.push(block.byPaper?(papers?averages.reduce((n,c)=>n+Number(c.paper_total||0),0)/papers:''):averages.length?averages.reduce((n,c)=>n+Number(c.average_score),0)/averages.length:'','');rows.push(footer);
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
 return {rows:[first,second,values],merges,width:first.length,scoreDecimals:2};
}
export function statisticsHeaderHtml(header,esc){return `<header class="statistics-header"><div><b>${esc(header.authority||'')}</b><br><b>${esc(header.institution||'')}</b></div><div><b>${esc(header.exam_title||'')}</b><br><b>${esc(header.grade_label||'')}</b></div></header><h2>${esc(header.report_title||'')}</h2><p class="school-year">Năm học ${esc(header.school_year||'')}</p>`}
export function maxScoreSections(block){
 const sections=[];for(let i=0;i<block.codes.length;i+=6){const codes=block.codes.slice(i,i+6);sections.push({...maxScoreSheet({...block,codes}),count:codes.length})}return sections;
}
export function statisticsExportSheet(block,header,{extra=false}={}){
 const main=block.defaultStatistics?defaultStatisticsSheet(block):classReportSheet(block),width=main.width,middle=Math.max(1,Math.floor(width/2)),top=[header.authority||''],second=[header.institution||''];
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
   for(let k=0;k<2;k++){const col=boundary(j*2+k),last=boundary(j*2+k+1)-1;part[1][col]=section.rows[1][j*2+k];part[2][col]=section.rows[2][j*2+k];for(const r of [offset+1,offset+2])if(last>col)merges.push({s:{r,c:col},e:{r,c:last}});if(k===1)scoreCells.push({r:offset+2,c:col,decimals:2})}
  }
  rows.push(...part,[]);
 }
 const offset=rows.length;rows.push(...main.rows);merges.push(...main.merges.map(m=>({s:{r:m.s.r+offset,c:m.s.c},e:{r:m.e.r+offset,c:m.e.c}})));
 if(block.defaultStatistics){for(const p of main.scoreCells)scoreCells.push({r:p.r+offset,c:p.c});return {rows,merges,width,scoreCells,kinds:main.kinds};}
 for(let r=offset+2;r<rows.length;r++)for(let c=0;c<width;c++){ 
  const tail=width-(block.choice?2:3),score=block.choice?(c>0&&c<tail&&(c-2)%3===0)||c===tail:(c>0&&c<tail&&c%2===1)||c===tail||c===tail+1;
  if(score&&typeof rows[r][c]==='number')scoreCells.push({r,c});
 }
 return {rows,merges,width,scoreCells};
}
export function statisticsTableHtml(table,esc,scoreColumns=[]){
 const covered=new Set(),starts=new Map();for(const m of table.merges){starts.set(`${m.s.r}:${m.s.c}`,m);for(let r=m.s.r;r<=m.e.r;r++)for(let c=m.s.c;c<=m.e.c;c++)if(r!==m.s.r||c!==m.s.c)covered.add(`${r}:${c}`)}
 const rowHtml=(row,r)=>`<tr${r===table.rows.length-1&&row[0]==='TB các lớp'?' class="report-footer"':''}>${row.map((value,c)=>{
  if(covered.has(`${r}:${c}`))return '';const m=starts.get(`${r}:${c}`),tag=r<2?'th':'td';
  const text=value==null?'':typeof value==='number'&&scoreColumns.includes(c)?value.toFixed(table.scoreDecimals??3):value;
  return `<${tag}${m?` rowspan="${m.e.r-m.s.r+1}" colspan="${m.e.c-m.s.c+1}"`:''}>${esc(text).replace(/\n/g,'<br>')}</${tag}>`;
 }).join('')}</tr>`;
 return `<table><thead>${table.rows.slice(0,2).map(rowHtml).join('')}</thead><tbody>${table.rows.slice(2).map((r,i)=>rowHtml(r,i+2)).join('')}</tbody></table>`;
}


// Default exam: only class/subject pairs explicitly marked is_counted may
// participate in the report, ranks, and group averages. A class can have
// both natural- and social-science subjects; no ban-wide assumption is made.
const countedSubject=(c,code)=>c.subjects?.find(s=>s.subject_code===code&&s.is_counted===true);
const validSubject=s=>s&&s.average_score!=null&&Number.isFinite(Number(s.average_score))&&Number(s.included_count)>0&&!s.error;
const weightedAverage=(classes,code)=>{
 const entries=classes.map(c=>countedSubject(c,code)).filter(validSubject);
 const n=entries.reduce((sum,s)=>sum+Number(s.included_count),0);
 return n?entries.reduce((sum,s)=>sum+Number(s.average_score)*Number(s.included_count),0)/n:'';
};
export function buildDefaultStatisticsBlock(data,{grade='',selectedClasses=null,subjectOrder=[],hiddenSubjects=new Set(),scopes={},rankGroups=[],dense=false,previousRanks=new Map()}={}){
 const classes=(data.classes||[]).filter(c=>!grade||c.grade_code===grade);
 const groups=rankGroups.filter(g=>Array.isArray(g)&&g.length);
 const groupOf=new Map();groups.forEach((g,i)=>g.forEach(code=>groupOf.set(code,i)));
 const ordered=[...classes].sort((a,b)=>{
  const ai=groupOf.has(a.class_code)?groupOf.get(a.class_code):groups.length;
  const bi=groupOf.has(b.class_code)?groupOf.get(b.class_code):groups.length;
  return ai-bi||a.class_code.localeCompare(b.class_code,'vi',{numeric:true});
 });
 const codes=subjectOrder.filter(code=>!hiddenSubjects.has(code)&&classes.some(c=>countedSubject(c,code)));
 const ranks=new Map();
 for(const code of codes){
  const scope=scopes[code]||(['VAN','TOAN','N1','ANH'].includes(code)?'grade':'group');
  const candidates=classes.filter(c=>{const s=countedSubject(c,code);return validSubject(s)&&!Number(s.missing_count);});
  const buckets=new Map();for(const c of candidates){const key=scope==='grade'?'grade:'+c.grade_code:groupOf.has(c.class_code)?'group:'+c.grade_code+':'+groupOf.get(c.class_code):null;if(key===null)continue;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(c)}
  const byClass=new Map();for(const bucket of buckets.values()){
   const sorted=bucket.sort((a,b)=>Number(countedSubject(b,code).average_score)-Number(countedSubject(a,code).average_score));
   let rank=0,last=null;sorted.forEach((c,i)=>{const score=Number(countedSubject(c,code).average_score);if(last===null||score!==last)rank=dense?rank+1:i+1;byClass.set(c.class_code,rank);last=score});
  }ranks.set(code,byClass);
 }
 const chosen=selectedClasses===null?ordered:ordered.filter(c=>selectedClasses.includes(c.class_code));
 return {choice:false,defaultStatistics:true,name:'Thống kê kỳ thi mặc định',grade_code:grade||[...new Set(classes.map(c=>c.grade_code))].join(', '),codes,previousRanks,dense,scopes:{...scopes},classes:chosen.map(c=>({...c,subjects:c.subjects.map(s=>({...s,rank:s.is_counted===true?ranks.get(s.subject_code)?.get(c.class_code)??null:null}))})),groupOf};
}
// One presentation model is consumed by the browser preview, print/PDF and Excel.
export function defaultStatisticsSheet(block){
 const classes=block.classes||[], groupOf=block.groupOf||new Map(), visible=block.codes||[];
 const isGradeScope=code=>(block.scopes?.[code]||(['VAN','TOAN','N1','ANH'].includes(code)?'grade':'group'))==='grade';
 const groupIds=[...new Set(classes.map(c=>groupOf.has(c.class_code)?groupOf.get(c.class_code):'other'))];
 const groupClasses=id=>classes.filter(c=>(groupOf.has(c.class_code)?groupOf.get(c.class_code):'other')===id);
 const common=visible.filter(code=>groupIds.every(id=>groupClasses(id).some(c=>countedSubject(c,code))));
 const local=groupIds.map(id=>visible.filter(code=>!common.includes(code)&&groupClasses(id).some(c=>countedSubject(c,code))));
 const maxLocal=Math.max(0,...local.map(a=>a.length));
 const slots=common.length+maxLocal, width=1+slots*2+4;
 const rows=[],merges=[],scoreCells=[],kinds=[];
 const push=(row,kind)=>{const r=rows.length;rows.push([...row,...Array(Math.max(0,width-row.length)).fill('')]);kinds.push(kind);return r};
 const merge=(r,c1,c2,r2=r)=>{if(c2>c1||r2>r)merges.push({s:{r,c:c1},e:{r:r2,c:c2}})};
 const allCounted=c=>c.subjects.filter(s=>s.is_counted===true);
 const totalFor=c=>{const list=allCounted(c);if(!list.length||list.some(s=>!validSubject(s)||Number(s.missing_count)>0))return {total:null,mean:null};const total=list.reduce((n,s)=>n+Number(s.average_score),0);return {total,mean:total/list.length}};
 const rankMap=new Map();for(const id of groupIds){const members=groupClasses(id).map(c=>({...c,summary:totalFor(c)})).filter(c=>c.summary.mean!==null).sort((a,b)=>b.summary.mean-a.summary.mean);let rank=0,last=null;members.forEach((c,i)=>{if(last===null||c.summary.mean!==last)rank=block.dense?rank+1:i+1;rankMap.set(c.class_code,rank);last=c.summary.mean})}
 const header=(codes)=>{const first=['Lớp / GVCN'],second=[''];for(let j=0;j<slots;j++){const code=codes[j];first.push(code?(['KTPL','GDKTPL'].includes(code)?'KTPL':(classes.flatMap(c=>c.subjects).find(s=>s.subject_code===code)?.subject_name||code)):'','');second.push(code?'ĐTB':'',code?'XT':'')};first.push('Tổng','TB','XT theo ban','Tăng/Giảm');second.push('','','','');const r=push(first,'subjectHeader');push(second,'subHeader');merge(r,0,0,r+1);for(let j=0;j<slots;j++)merge(r,1+j*2,2+j*2);for(let c=width-4;c<width;c++)merge(r,c,c,r+1)};
 for(let gi=0;gi<groupIds.length;gi++){
  const id=groupIds[gi],members=groupClasses(id),codes=[...common,...local[gi]];
  header(codes);
  for(const c of members){const r=rows.length,home=c.homeroom_teacher==='Chưa phân công'?'':c.homeroom_teacher||'';const top=[c.class_code+(home?'\n'+home:'')],teachers=[''];
   for(let j=0;j<slots;j++){const code=codes[j],s=code?countedSubject(c,code):null;top.push(s?.average_score??'',s?.rank??'');teachers.push(s?.teacher==='Chưa phân công'?'':s?.teacher||'','');if(s?.average_score!=null)scoreCells.push({r,c:1+j*2});merge(r+1,1+j*2,2+j*2)}
   const summary=totalFor(c),rank=rankMap.get(c.class_code)??null,previous=block.previousRanks?.get(c.class_code),delta=previous!=null&&rank!=null?previous-rank:'';
   top.push(summary.total??'',summary.mean??'',rank??'',delta);teachers.push('','','','');push(top,'class');push(teachers,'teacher');merge(r,0,0,r+1);for(let j=width-4;j<width;j++)merge(r,j,j,r+1);if(summary.total!==null){scoreCells.push({r,c:width-4},{r,c:width-3})}
  }
  const r=rows.length,avg=[''];for(let j=0;j<slots;j++){const code=codes[j],a=code&&!isGradeScope(code)?weightedAverage(members,code):'';avg.push(a,'');if(a!=='')scoreCells.push({r,c:1+j*2})}avg.push('','','','');if(avg.some((v,i)=>i>0&&v!==''))push(avg,'groupAverage');
 }
 const r=rows.length,footer=['ĐTB các lớp'];for(let j=0;j<slots;j++){const code=common[j]||null,a=code&&isGradeScope(code)?weightedAverage(classes,code):'';footer.push(a,'');if(a!=='')scoreCells.push({r,c:1+j*2})}footer.push('','','','');push(footer,'footer');
 return {rows,merges,width,scoreCells,scoreDecimals:3,kinds,groupIds};
}

export function wireClassReport({state,$,esc,message,createPrintFrame}){
  let payload=null,key='',request=0,subjectOrder=[],hiddenSubjects=new Set(),selectedClasses=null,rankGroups=[],defaultScopes={},previousRanks=new Map();
  const groupStorageKey=()=>`class-report-rank-groups:${state.selectedExam}`;
  function renderGroups(){
    const root=$('class-report-rank-groups');if(!root||!payload)return;
    const classes=[...new Set(payload.classes.map(c=>c.class_code))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    const used=new Set(rankGroups.flat());
    root.innerHTML=rankGroups.map((group,i)=>`<div class="panel"><b>Nhóm ${i+1}</b> <button type="button" class="btn btn-light" data-delete-group="${i}">Xóa nhóm</button><div class="form-grid">${classes.map(code=>`<label><input type="checkbox" data-rank-group="${i}" data-class="${esc(code)}" ${group.includes(code)?'checked':''} ${used.has(code)&&!group.includes(code)?'disabled':''}> ${esc(code)}</label>`).join('')}</div></div>`).join('')+'<button type="button" class="btn btn-light" data-add-group>+ Tạo nhóm</button>';
  }
  function saveGroups(){
    try{globalThis.localStorage?.setItem(groupStorageKey(),JSON.stringify(rankGroups));}catch{message($('class-report-message'),'Không lưu được cấu hình nhóm trên trình duyệt. Cấu hình vẫn dùng trong phiên hiện tại.','error');}
    previousRanks=new Map();if($('class-report-previous'))$('class-report-previous').value='';renderGroups();if(payload)render();
  }
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
  const currentSheet=b=>b.defaultStatistics?defaultStatisticsSheet(b):classReportSheet(b);
  const choiceBlocksHtml=(blocks,forPrint=false)=>blocks.map(b=>`${!forPrint||blocks.length>1?`<h3>Khối ${esc(b.grade_code||'')}</h3>`:''}${extraMax()?`<div class="extra-statistics" style="background:#ddd;margin-bottom:4mm">${maxScoreSections(b).map(s=>`<div class="table-wrap" style="width:${s.count/Math.min(b.codes.length,6)*100}%;margin-left:auto">${statisticsTableHtml(s,esc,Array.from({length:s.count},(_,i)=>i*2+1))}</div>`).join('')}</div>`:''}<div class="table-wrap class-statistics">${statisticsTableHtml(currentSheet(b),esc,scoreColumns(b))}</div>`).join('');
  const visibleBlocks=()=>payload?.exam_mode==='default'?[buildDefaultStatisticsBlock(payload,{grade:options().grade,selectedClasses,subjectOrder,hiddenSubjects,scopes:defaultScopes,rankGroups,dense:options().dense,previousRanks})].filter(b=>b.codes.length&&b.classes.length):rankClassReport(payload,options()).map(b=>({...b,codes:subjectOrder.filter(code=>b.codes.includes(code)&&!hiddenSubjects.has(code))})).filter(b=>b.codes.length);
  function renderSubjects(){
    const el=$('class-report-subjects');if(!el)return;
    el.innerHTML=subjectOrder.map((code,i)=>`<div style="display:flex;align-items:center;gap:8px;margin:6px"><label><input type="checkbox" data-code="${esc(code)}" ${hiddenSubjects.has(code)?'':'checked'}> ${esc(payload.classes.flatMap(c=>c.subjects).find(s=>s.subject_code===code)?.subject_name||code)}</label><button type="button" data-move="-1" data-code="${esc(code)}" ${i===0?'disabled':''} aria-label="Đưa ${esc(code)} lên">↑</button><button type="button" data-move="1" data-code="${esc(code)}" ${i===subjectOrder.length-1?'disabled':''} aria-label="Đưa ${esc(code)} xuống">↓</button>${payload.exam_mode==='default'?`<select data-rank-subject="${esc(code)}" aria-label="Phạm vi xếp hạng ${esc(code)}"><option value="grade" ${defaultScopes[code]==='grade'?'selected':''}>Toàn khối</option><option value="group" ${defaultScopes[code]==='group'?'selected':''}>Theo nhóm</option></select>`:''}</div>`).join('');
  }
  const context=()=>JSON.stringify([state.selectedExam||'',!!$('class-report-absent').checked,!!$('class-report-violations').checked,state.statisticsRevision||0]);
  const options=()=>({allSubjects:$('class-report-scope').value==='all',grade:$('class-report-grade').value,dense:$('class-report-ties').value==='dense',byPaper:!!$('class-report-by-paper')?.checked,allowIncomplete:!!$('class-report-incomplete')?.checked,rankScope:$('class-report-rank-scope')?.value||'selected',selectedClasses,rankGroups});
  const policy=()=>`${options().byPaper?'TB theo bài thi = tổng điểm bài được tính / số bài được tính.':'TB các môn = trung bình cộng ĐTB môn hợp lệ, không trọng số số bài.'} ${options().allowIncomplete?'Cho phép tính TB trên điểm đã có; không coi điểm thiếu là 0.':'Chưa đủ điểm: để trống TB và hạng TB.'} Xếp hạng theo ĐTB dùng điểm chưa làm tròn. Điểm 0 được tính. XH từng môn giữ quy tắc hiện tại. Ẩn môn không đổi công thức.`;
  const number=value=>value==null?'':Number(value).toFixed(3);
  function clear(){++request;payload=null;key='';$('class-report-results').innerHTML='';$('class-report-export').disabled=true;if($('class-report-pdf'))$('class-report-pdf').disabled=true;}
  function render(){
    if(!payload)return;
    const blocks=visibleBlocks();
    message($('class-report-message'),policy(),'info');
    if(payload.exam_mode==='default'){
      $('class-report-results').innerHTML=blocks.map(b=>`<div class="table-wrap class-statistics">${statisticsTableHtml(defaultStatisticsSheet(b),esc,Array.from({length:Math.max(0,(defaultStatisticsSheet(b).width-5)/2)},(_,i)=>1+i*2).concat([defaultStatisticsSheet(b).width-4,defaultStatisticsSheet(b).width-3]))}</div>`).join('')||'<p>Không có lớp hoặc môn phù hợp.</p>';
      $('class-report-export').disabled=!blocks.length;if($('class-report-pdf'))$('class-report-pdf').disabled=!blocks.length;return;
    }
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
      const{data,error}=await state.client.rpc('exam_get_class_statistics_report',{p_exam_id:exam,p_include_absent:false,p_include_violations:true});
      if(error)throw new Error(error.message);
      if(token!==request||captured!==context())return;
      let report=data;
      let vanRows=[];
      if(data.classes.some(c=>!c.subjects?.some(s=>s.subject_code==='VAN'&&s.average_score!=null&&Number.isFinite(Number(s.average_score))))){
        vanRows=await loadVanRows(state.client,exam);
        report=enrichClassVan(data,vanRows);
      }
      if(['subject','choice'].includes(data.exam_mode)){
        const detail=await state.client.rpc('exam_get_choice_statistics_report',{p_exam_id:exam,p_include_absent:!!$('class-report-absent').checked,p_include_violations:!!$('class-report-violations').checked});
        if(detail.error)throw new Error('Không tải được số dự thi/điểm cao nhất: '+detail.error.message);
        if(token!==request||captured!==context())return;
        // Choice-statistics RPC omits mandatory VAN; merge official VAN candidates
        // before deriving participation, otherwise SL is overwritten with zero.
        const detailRows=detail.data.rows||[];
        const detailIds=new Set(detailRows.filter(r=>r.subject_code==='VAN').map(r=>String(r.candidate_id)));
        const allDetails=detailRows.concat(vanRows.filter(r=>!detailIds.has(String(r.candidate_id))));
        report=attachChoiceParticipation(report,allDetails);
      }
      payload=report;key=captured;previousRanks=new Map();loadHeader();if($('class-report-previous')){$('class-report-previous').innerHTML='<option value="">Không so sánh</option>'+state.exams.filter(e=>e.id!==exam&&(!e.grade_code||!data.classes[0]?.grade_code||String(e.grade_code)===String(data.classes[0].grade_code))).map(e=>`<option value="${esc(e.id)}">${esc(e.name||e.id)}</option>`).join('');}
      selectedClasses=data.classes.map(c=>c.class_code);
      try{const saved=JSON.parse(globalThis.localStorage?.getItem(groupStorageKey())||'[]');const known=new Set(selectedClasses),used=new Set();rankGroups=Array.isArray(saved)?saved.filter(Array.isArray).map(g=>g.filter(c=>known.has(c)&&!used.has(c)&&(used.add(c),true))):[];}catch{rankGroups=[];}
      if(data.exam_mode==='default'&&!rankGroups.length){const byGrade=new Map();for(const c of data.classes){const key=String(c.ban_id||'')||('unassigned-'+c.grade_code);if(!byGrade.has(key))byGrade.set(key,[]);byGrade.get(key).push(c.class_code)}rankGroups=[...byGrade.values()];if(rankGroups.length===1&&rankGroups[0].length>=4){const sorted=[...rankGroups[0]].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));rankGroups=[sorted.slice(0,Math.ceil(sorted.length/2)),sorted.slice(Math.ceil(sorted.length/2))];}}
      renderGroups();
      if($('class-report-classes'))$('class-report-classes').innerHTML=data.classes.map(c=>`<label style="display:inline-block;margin:6px"><input type="checkbox" data-class="${esc(c.class_code)}" checked> ${esc(c.class_code)}</label>`).join('');
      if($('class-report-extra-max'))$('class-report-extra-max').disabled=data.exam_mode==='default';
      subjectOrder=classReportSubjectOrder(report.classes.flatMap(c=>(c.subjects||[]).map(s=>s.subject_code)));hiddenSubjects=['subject','choice'].includes(data.exam_mode)?defaultHiddenClassSubjects(subjectOrder):new Set();defaultScopes=Object.fromEntries(subjectOrder.map(code=>[code,['VAN','TOAN','N1','ANH'].includes(code)?'grade':'group']));renderSubjects();
      if(!data.classes.some(c=>c.counted_subjects>0))$('class-report-scope').value='all';
      const grades=[...new Set(data.classes.map(c=>c.grade_code).filter(Boolean))].sort();
      const old=$('class-report-grade').value;$('class-report-grade').innerHTML='<option value="">Tất cả khối</option>'+grades.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');$('class-report-grade').value=grades.includes(old)?old:'';
      message($('class-report-message'),data.exam_mode!=='default'?'SL là số học sinh dự thi, không tính vắng. TB bài thi = trung bình các ĐTB môn của lớp có điểm được tính, không tính trọng số sĩ số. XH từng môn và XH TB so trong cùng khối, dùng điểm chưa làm tròn; lớp thiếu điểm chưa có TB/XH TB. Dòng TB các lớp = trung bình ĐTB các lớp, không tính trọng số học sinh.':!data.period_id?'Chưa liên kết học kỳ phân công. Thiết lập tại Cấu hình kỳ thi.':'Đã tải báo cáo. Chỉ thống kê môn/lớp được đánh dấu Tính điểm tổng hợp; TB từng nhóm nằm ngay sau lớp cuối nhóm.','info');render();
    }catch(e){if(token===request)message($('class-report-message'),e.message,'error')}
    finally{$('class-report-load').disabled=false}
  };
  for(const id of ['class-report-scope','class-report-grade','class-report-ties','class-report-extra-max','class-report-by-paper','class-report-incomplete','class-report-rank-scope'])if($(id))$(id).onchange=()=>{if(key===context())render();else clear()};
  if($('class-report-classes'))$('class-report-classes').onchange=e=>{if(!payload||!e.target.dataset.class)return;const picked=new Set(selectedClasses||[]);e.target.checked?picked.add(e.target.dataset.class):picked.delete(e.target.dataset.class);selectedClasses=[...picked];render();};
  const groupsRoot=$('class-report-rank-groups');
  if(groupsRoot){
    groupsRoot.onclick=e=>{const button=e.target.closest('button');if(!button||!payload)return;if(button.hasAttribute('data-add-group'))rankGroups.push([]);else if(button.hasAttribute('data-delete-group'))rankGroups.splice(Number(button.dataset.deleteGroup),1);else return;saveGroups();};
    groupsRoot.onchange=e=>{const el=e.target;if(!payload||el.dataset.rankGroup==null)return;const i=Number(el.dataset.rankGroup),code=el.dataset.class;if(!rankGroups[i])return;if(el.checked){if(rankGroups.some((g,j)=>j!==i&&g.includes(code))){renderGroups();return;}rankGroups[i].push(code);}else rankGroups[i]=rankGroups[i].filter(c=>c!==code);saveGroups();};
  }
  for(const id of ['class-report-absent','class-report-violations'])$(id).onchange=clear;
  const picker=$('class-report-subjects');
  if(picker){
    picker.onchange=e=>{if(e.target.dataset.rankSubject){defaultScopes[e.target.dataset.rankSubject]=e.target.value;render();return;}const code=e.target.dataset.code;if(!code||!payload)return;e.target.checked?hiddenSubjects.delete(code):hiddenSubjects.add(code);render();};
    picker.onclick=e=>{const button=e.target.closest('button[data-move]');if(!button||!payload)return;const i=subjectOrder.indexOf(button.dataset.code),j=i+Number(button.dataset.move);if(i<0||j<0||j>=subjectOrder.length)return;[subjectOrder[i],subjectOrder[j]]=[subjectOrder[j],subjectOrder[i]];renderSubjects();render();};
  }
  const previousSelect=$('class-report-previous');
  if(previousSelect){previousSelect.onchange=async()=>{
    previousRanks=new Map();const id=previousSelect.value;if(!id||!payload){render();return}
    try{const {data,error}=await state.client.rpc('exam_get_class_statistics_report',{p_exam_id:id,p_include_absent:false,p_include_violations:true});if(error)throw Error(error.message);
      const previousBlock=buildDefaultStatisticsBlock(data,{grade:options().grade,subjectOrder:classReportSubjectOrder(data.classes.flatMap(c=>c.subjects.map(s=>s.subject_code))),rankGroups,dense:options().dense});
      // Rank each class using ALL counted subjects of its own previous exam, within the same configured group.
      const grouped=new Map();for(const c of previousBlock.classes){const counted=c.subjects.filter(s=>s.is_counted===true);if(!counted.length||counted.some(s=>!validSubject(s)||Number(s.missing_count)>0))continue;const mean=counted.reduce((n,s)=>n+Number(s.average_score),0)/counted.length;const g=previousBlock.groupOf.get(c.class_code);if(g===undefined)continue;if(!grouped.has(g))grouped.set(g,[]);grouped.get(g).push({code:c.class_code,mean})}
      for(const entries of grouped.values()){entries.sort((a,b)=>b.mean-a.mean);let rank=0,last=null;entries.forEach((x,i)=>{if(last===null||x.mean!==last)rank=options().dense?rank+1:i+1;previousRanks.set(x.code,rank);last=x.mean})}
      message($('class-report-message'),'Đã tính lại thứ hạng kỳ đối chiếu theo môn tính tổng hợp của kỳ đó. Cần đối chiếu nhóm lớp giữa hai kỳ.','info');render();
    }catch(e){message($('class-report-message'),'Không tải được kỳ đối chiếu: '+e.message,'error')}
  }}
  const pdf=$('class-report-pdf');
  if(pdf)pdf.onclick=()=>{
    if(!payload||key!==context()){clear();return}
    render();
    const exam=state.exams.find(e=>e.id===state.selectedExam),win=createPrintFrame();
    const choice=['subject','choice'].includes(payload.exam_mode);
    win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thống kê lớp</title><style>
      @page{size:A4 landscape;margin:5mm}body{font:8pt 'Times New Roman',serif;margin:0;line-height:1.05}h2,h3{text-align:center;margin:1mm 0;font-size:11pt;line-height:1.05}table{border-collapse:collapse;width:100%;font-size:8pt;line-height:1.05}th,td{border:1px solid #000;padding:0.35mm 0.3mm;text-align:center}thead{display:table-header-group}tfoot{display:table-row-group}tr{break-inside:avoid}.report-footer{break-before:avoid;page-break-before:avoid}.table-wrap{overflow:visible}h3{break-after:avoid}small{font-size:7pt}
      .statistics-header{display:grid;grid-template-columns:1fr 1fr;text-align:center;margin-bottom:1mm;font-size:10pt;line-height:1.05}.school-year{text-align:center;font-size:8pt;margin:0 0 1mm}table{table-layout:fixed}th,td{overflow-wrap:anywhere}.class-statistics thead tr:first-child th:first-child{width:18mm}.extra-statistics{background:#ddd;margin-bottom:1.5mm!important;break-inside:avoid}.extra-statistics th{background:white}.extra-statistics tbody{font-weight:bold;font-style:italic}
      </style></head><body>${statisticsHeaderHtml(header(),esc)}${choice?choiceBlocksHtml(visibleBlocks(),true):visibleBlocks().map(b=>`<div class="table-wrap class-statistics">${statisticsTableHtml(defaultStatisticsSheet(b),esc,Array.from({length:(defaultStatisticsSheet(b).width-5)/2},(_,i)=>1+i*2).concat([defaultStatisticsSheet(b).width-4,defaultStatisticsSheet(b).width-3]))}</div>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);win.document.close();
  };
  $('class-report-export').onclick=()=>{
    if(!payload||key!==context()){clear();return}
    const wb=window.XLSX.utils.book_new();let index=0;
    const exam=state.exams.find(e=>e.id===state.selectedExam);
    for(const block of visibleBlocks()){
      const table=statisticsExportSheet(block,{...header(),grade_label:'Khối '+(block.grade_code||'')},{extra:extraMax()});
      const ws=window.XLSX.utils.aoa_to_sheet(table.rows);ws['!merges']=table.merges;
      const scoreCells=new Map(table.scoreCells.map(p=>[`${p.r}:${p.c}`,p.decimals??3]));
      for(const [address,cell] of Object.entries(ws))if(cell&&cell.t==='n'){
        const position=window.XLSX.utils.decode_cell(address);
        const decimals=scoreCells.get(`${position.r}:${position.c}`);cell.z=decimals==null?'0':'0.'+'0'.repeat(decimals);
      }
      ws['!cols']=Array.from({length:table.width},(_,i)=>({wch:i===0?19:i>=table.width-4?11:i%2===1?10:6}));
      if(block.defaultStatistics){
        const border={top:{style:'thin',color:{rgb:'000000'}},bottom:{style:'thin',color:{rgb:'000000'}},left:{style:'thin',color:{rgb:'000000'}},right:{style:'thin',color:{rgb:'000000'}}};
        for(let r=5;r<table.rows.length;r++)for(let c=0;c<table.width;c++){
          const address=window.XLSX.utils.encode_cell({r,c});const cell=ws[address]||(ws[address]={t:'s',v:''});
          const kind=table.kinds?.[r-5]||'';
          cell.s={font:{name:'Times New Roman',sz:9,bold:['subjectHeader','subHeader','groupAverage','footer'].includes(kind),color:{rgb:kind==='groupAverage'?'9C0069':'000000'}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border,fill:['groupAverage','footer'].includes(kind)?{fgColor:{rgb:'F8E7F2'}}:kind==='subjectHeader'?{fgColor:{rgb:'EEEEEE'}}:undefined};
          if(kind==='class'&&c===table.width-1&&typeof cell.v==='number'&&cell.v!==0)cell.s.font.color={rgb:cell.v>0?'008000':'CC0000'};
        }
        ws['!printHeader']=[{left:'',center:'',right:''}];ws['!pageSetup']={orientation:'landscape',paperSize:9,fitToWidth:1,fitToHeight:1};
      }
      if(block.defaultStatistics){ws['!rows']=table.rows.map((row,i)=>({hpt:i<5?22:row[0]&&String(row[0]).startsWith('TB ')?22:row[0]&&String(row[0]).includes('\n')?30:18}));ws['!pageSetup']={orientation:'landscape',paperSize:9,fitToWidth:1,fitToHeight:1};ws['!margins']={left:0.2,right:0.2,top:0.3,bottom:0.3,header:0.1,footer:0.1};}
      window.XLSX.utils.book_append_sheet(wb,ws,`${++index} ${block.name}`.replace(/[\\/?*\[\]:]/g,' ').slice(0,31));
    }
    window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.aoa_to_sheet([
      ['Kỳ thi',exam?.name||state.selectedExam],['Năm học',exam?.school_year||''],['Học kỳ phân công',payload.period_id||'Chưa liên kết'],
      ['Hiển thị môn',options().allSubjects?'Tất cả môn':'Môn tính điểm'],['Tính vắng',payload.exam_mode==='default'?false:!!$('class-report-absent').checked],['Tính vi phạm',payload.exam_mode==='default'?true:!!$('class-report-violations').checked],
      ['Đồng hạng',options().dense?'1,1,2':'1,1,3'],['Cách tính và xếp hạng',policy()],['Lớp hiển thị',selectedClasses?.join(', ')||'Không chọn lớp'],['TB các lớp',payload.exam_mode==='default'?'Trung bình có trọng số theo số điểm hợp lệ, chỉ môn/lớp is_counted=true':'Trung bình ĐTB lớp theo cấu hình'],['SL',payload.exam_mode==='default'?'Không hiển thị trên biểu':'Học sinh dự thi, không tính vắng'],...(extraMax()&&payload.exam_mode!=='default'?[['Max','Điểm thống kê cao nhất của học sinh dự thi theo lựa chọn xử lý vi phạm']]:[])
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
