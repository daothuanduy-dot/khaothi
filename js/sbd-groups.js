export function orderSbdGroups(candidates, text, compare, mode='abc') {
  const groups=String(text||'').split(/\r?\n/).map(line=>line.split(/[,;]/).map(c=>c.trim()).filter(Boolean)).filter(g=>g.length);
  if(!groups.length)throw new Error('Hãy khai báo nhóm lớp, mỗi dòng là một nhóm.');
  const classes=new Set(candidates.map(c=>String(c.class_code||'').trim())), seen=new Set();
  for(const group of groups)for(const code of group){
    if(!classes.has(code))throw new Error(`Lớp ${code} không có thí sinh trong kỳ thi.`);
    if(seen.has(code))throw new Error(`Lớp ${code} bị khai báo trùng nhóm.`);
    seen.add(code);
  }
  const missing=[...classes].filter(code=>!seen.has(code));
  if(missing.length)throw new Error(`Chưa gán nhóm cho lớp: ${missing.map(c=>c||'(trống)').join(', ')}.`);
  const tie=(a,b)=>compare(a.student_name,b.student_name)||String(a.student_code||'').localeCompare(String(b.student_code||''),undefined,{numeric:true})||String(a.id).localeCompare(String(b.id));
  if(mode==='previous'&&candidates.some(c=>c.previous_score==null||!Number.isFinite(Number(c.previous_score))))throw new Error('Có học sinh chưa có tổng điểm kỳ trước. Hãy kiểm tra mã học sinh và kết quả.');
  return groups.flatMap(group=>candidates.filter(c=>group.includes(String(c.class_code||'').trim())).sort((a,b)=>(mode==='previous'?Number(b.previous_score)-Number(a.previous_score):0)||tie(a,b)));
}

export function sumPreviousResults(results) {
  const totals=new Map();
  for(const row of results){
    if(row.is_absent||row.total_score==null||!Number.isFinite(Number(row.total_score)))continue;
    const code=String(row.student_code||'').trim();
    if(code)totals.set(code,(totals.get(code)??0)+Number(row.total_score));
  }
  return totals;
}
