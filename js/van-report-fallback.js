// v0.1.294: Fill missing mandatory VAN statistics from the official score RPC.
// Does not change any stored scores or other subjects.
export async function loadVanRows(client, examId) {
  const {data,error}=await client.rpc('exam_get_subject_results',{p_exam_id:examId,p_subject_code:'VAN'});
  if(error) throw new Error('Không đọc được điểm Ngữ văn: '+error.message);
  return (data||[]).map(r=>({...r,subject_code:'VAN',subject_name:'Ngữ văn',statistics_score:r.total_score,
    is_absent:!!r.is_absent,missing_count:r.total_score==null?1:0}));
}
function aggregates(rows,classes) {
  return classes.map(c=>{
    const mine=rows.filter(r=>r.class_code===c.class_code);
    const counted=mine.filter(r=>r.total_score!=null&&!r.is_absent);
    const missing=mine.filter(r=>r.total_score==null&&!r.is_absent);
    return {class_code:c.class_code,subject_code:'VAN',subject_name:'Ngữ văn',
      average_score:counted.length?counted.reduce((n,r)=>n+Number(r.total_score),0)/counted.length:null,
      included_count:counted.length,participated_count:mine.filter(r=>!r.is_absent).length,
      missing_count:missing.length,maximum_score:counted.length?Math.max(...counted.map(r=>Number(r.total_score))):null,
      is_counted:true,teacher:'',error:null};
  });
}
export function enrichChoiceVan(data,rows){
  if(!rows.length||!Array.isArray(data.classes)||!Array.isArray(data.cells))return data;
  const existing=new Set(data.cells.filter(c=>c.subject_code==='VAN').map(c=>c.class_code));
  const cells=[...data.cells,...aggregates(rows,data.classes).filter(c=>!existing.has(c.class_code))];
  const known=new Set((data.rows||[]).filter(r=>r.subject_code==='VAN').map(r=>r.candidate_id));
  const extra=rows.filter(r=>!known.has(r.candidate_id)).map(r=>({...r,subject_type:'mandatory'}));
  return {...data,cells,rows:[...(data.rows||[]),...extra]};
}
// Repair a VAN cell that exists in the report but has no computed average.
// Preserve all non-VAN subjects and all valid VAN values returned by the server.
export function enrichClassVan(data,rows){
  if(!rows.length||!Array.isArray(data.classes))return data;
  const agg=new Map(aggregates(rows,data.classes).map(s=>[s.class_code,s]));
  let changed=false;
  const classes=data.classes.map(c=>{
    const official=agg.get(c.class_code);
    if(!official||official.average_score==null)return c;
    const subjects=[...(c.subjects||[])];
    const index=subjects.findIndex(s=>s.subject_code==='VAN');
    if(index>=0){
      const existing=subjects[index];
      if(existing.average_score!=null && Number.isFinite(Number(existing.average_score)))return c;
      // Do not replace an explicit server-side error with a guessed score.
      if(existing.error)return c;
      subjects[index]={...existing,average_score:official.average_score,
        included_count:official.included_count,missing_count:official.missing_count};
    }else{
      subjects.push(official);
    }
    changed=true;
    // Recompute totals only for a complete set of counted subjects. Do not
    // invent ranks or override server-side incompleteness from other causes.
    const counted=subjects.filter(s=>s.is_counted);
    const complete=counted.length>0&&counted.every(s=>s.average_score!=null&&
      Number.isFinite(Number(s.average_score))&&!s.error&&!Number(s.missing_count||0));
    const wasMissingVan=(index>=0);
    const canRestore=complete&&c.incomplete===true&&wasMissingVan&&
      (c.subjects||[]).filter(s=>s.is_counted).every(s=>s.subject_code==='VAN'||
        (s.average_score!=null&&!s.error&&!Number(s.missing_count||0)));
    return {...c,subjects,
      counted_subjects:counted.length,
      ...(canRestore?{incomplete:false,
        total_score:counted.reduce((n,s)=>n+Number(s.average_score),0),
        average_score:counted.reduce((n,s)=>n+Number(s.average_score),0)/counted.length}:{})};
  });
  return changed?{...data,classes}:data;
}
