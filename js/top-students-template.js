export const topTemplateCss=`.top-template{font-family:'Times New Roman',serif;color:#000;font-size:12pt}.top-template .top-heading{display:grid;grid-template-columns:1fr 1fr;text-align:center;font-weight:bold;line-height:1.25}.top-template h2,.top-template h3{color:#c00000;text-align:center;margin:3mm 0;font-weight:bold}.top-template h2{font-size:16pt}.top-template h3{font-size:14pt}.top-template table{width:100%;border-collapse:collapse;table-layout:fixed}.top-template th,.top-template td{border:1px solid #000;padding:1mm;text-align:center;vertical-align:middle;overflow-wrap:anywhere}.top-template th{font-weight:bold;font-size:12pt}.top-template td:nth-child(4){text-align:left;font-weight:bold}.top-template .top-band{background:#c6efdd}.top-template .top-total{font-weight:bold}.top-template thead{display:table-header-group}.top-template tr{break-inside:avoid}.top-template .top-group-end td{border-bottom:1px solid #c00000}`;
export function topReportTable(groups,header){
 const rows=[[header.authority||'','','','',header.exam_title||'','','',''],[header.institution||'','','','',`NĂM HỌC ${header.school_year||''}`,'','',''],[header.title||'DANH SÁCH HỌC SINH ĐẠT TOP 3'],[header.grade?`KHỐI ${header.grade}`:''],['BAN','STT','SBD','HỌ VÀ TÊN','NGÀY SINH','LỚP','TỔNG ĐIỂM','ĐIỂM TB']];
 const merges=[{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:0,c:4},e:{r:0,c:7}},{s:{r:1,c:0},e:{r:1,c:3}},{s:{r:1,c:4},e:{r:1,c:7}},{s:{r:2,c:0},e:{r:2,c:7}},{s:{r:3,c:0},e:{r:3,c:7}}];
 const groupEnds=[],bandRows=[];
 for(const g of groups){const start=rows.length;
  g.students.forEach((s,i)=>{let dob=String(s.date_of_birth||'');const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(dob);if(match)dob=`${match[3]}/${match[2]}/${match[1]}`;
   rows.push([i===0?(g.name||`Nhóm ${g.index+1}`):'',i+1,String(s.sbd||''),s.student_name,dob,s.class_code,s.total,s.paper_count?s.total/s.paper_count:'']);
   if(g.index%2===0)bandRows.push(rows.length-1);
  });
  if(rows.length>start){if(rows.length-start>1)merges.push({s:{r:start,c:0},e:{r:rows.length-1,c:0}});groupEnds.push(rows.length-1);}
 }
 return {rows,merges,groupEnds,bandRows};
}
export function topReportHtml(groups,header,esc){
 const t=topReportTable(groups,header),covered=new Set(),spans=new Map();
 for(const m of t.merges){if(m.s.r<5)continue;spans.set(m.s.r,m.e.r-m.s.r+1);for(let r=m.s.r+1;r<=m.e.r;r++)covered.add(r);}
 const cell=(v,c)=>esc(typeof v==='number'?(c===6?v.toFixed(2):c===7?v.toFixed(3):v):v??'');
 return `<div class="top-template"><div class="top-heading"><div>${esc(header.authority||'')}<br>${esc(header.institution||'')}</div><div>${esc(header.exam_title||'')}<br>NĂM HỌC ${esc(header.school_year||'')}</div></div><h2>${esc(header.title||'DANH SÁCH HỌC SINH ĐẠT TOP 3')}</h2><h3>${esc(header.grade?'KHỐI '+header.grade:'')}</h3><table><colgroup>${[9,6,12,29,14,8,11,11].map(w=>`<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${t.rows[4].map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(5).map((row,i)=>{const r=i+5;return `<tr class="${t.bandRows.includes(r)?'top-band ':''}${t.groupEnds.includes(r)?'top-group-end':''}">${row.map((v,c)=>c===0&&covered.has(r)?'':`<td${c===0?` rowspan="${spans.get(r)||1}"`:''}${c===6?' class="top-total"':''}>${cell(v,c)}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`;
}
export function styleTopReportWorksheet(ws,table,XLSX){
 const cellAddress=(r,c)=>XLSX.utils.encode_cell?XLSX.utils.encode_cell({r,c}):String.fromCharCode(65+c)+(r+1);
 for(let r=0;r<table.rows.length;r++)for(let c=0;c<8;c++){
  const address=cellAddress(r,c);if(!ws[address])ws[address]={t:'s',v:''};const cell=ws[address];
  cell.s={font:{name:'Times New Roman',sz:r===2?16:r===3?14:12,bold:r<5||c===0||c===3||c===6,color:{rgb:r===2||r===3?'C00000':'000000'}},alignment:{horizontal:r>=5&&c===3?'left':'center',vertical:'center',wrapText:true},...(r>=4?{border:Object.fromEntries(['top','bottom','left','right'].map(k=>[k,{style:'thin',color:{rgb:'000000'}}]))}:{})};
  if(r>=5&&(c===0||table.bandRows.includes(r)))cell.s.fill={patternType:'solid',fgColor:{rgb:'C6EFDD'}};
  if(r>=5&&c===6)cell.z='0.00';if(r>=5&&c===7)cell.z='0.000';
 }
 ws['!merges']=table.merges;ws['!cols']=[{wch:12},{wch:7},{wch:15},{wch:32},{wch:16},{wch:9},{wch:13},{wch:13}];
 ws['!rows']=table.rows.map((_,r)=>({hpt:r===2?27:r===4?35:23}));
 ws['!pageSetup']={orientation:'portrait',paperSize:9,fitToWidth:1,fitToHeight:0};ws['!margins']={left:0.3,right:0.3,top:0.4,bottom:0.4,header:0.1,footer:0.1};
}
