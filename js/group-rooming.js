export function groupClassMap(text){
 const map=new Map();
 const groups=String(text||'').split(/\r?\n/).map(line=>line.split(/[,;]/).map(c=>c.trim()).filter(Boolean)).filter(g=>g.length);
 if(!groups.length)throw new Error('Hãy tạo nhóm lớp trong Quản lý SBD trước khi xếp phòng.');
 groups.forEach((classes,index)=>classes.forEach(code=>{if(map.has(code))throw new Error(`Lớp ${code} trùng nhóm.`);map.set(code,index)}));
 return map;
}
export function splitRoomGroups(candidates,text){
 const map=groupClassMap(text),groups=new Map();
 for(const c of candidates){const index=map.get(String(c.class_code||'').trim());if(index===undefined)throw new Error(`Lớp ${c.class_code||'(trống)'} chưa được gán nhóm.`);if(!groups.has(index))groups.set(index,[]);groups.get(index).push(c)}
 return [...groups].sort((a,b)=>a[0]-b[0]);
}
export function validateRoomGroups(assignments,candidates,text){
 const map=groupClassMap(text),byId=new Map(candidates.map(c=>[String(c.id??c.candidate_id),c])),rooms=new Map();
 for(const row of assignments){const c=byId.get(String(row.candidate_id));const group=map.get(String(c?.class_code||'').trim());if(group===undefined)throw new Error('Thí sinh chưa thuộc nhóm lớp đã cấu hình.');if(rooms.has(row.room_code)&&rooms.get(row.room_code)!==group)throw new Error(`Phòng ${row.room_code} có học sinh thuộc nhiều nhóm. Hãy lập lại phương án theo nhóm.`);rooms.set(row.room_code,group)}
 return rooms;
}
function merge(parts){
 const rooms=parts.flatMap(p=>p.rooms),assignments=parts.flatMap(p=>p.assignments);
 return {ok:true,rooms,assignments,summary:{candidate_count:assignments.length,room_count:rooms.length,capacity:rooms[0]?.capacity,full_rooms:rooms.filter(r=>r.student_count===r.capacity).length,partial_rooms:rooms.filter(r=>r.student_count<r.capacity).length,subject_count:rooms.reduce((n,r)=>n+(r.ca1_subject_codes?.length||0)+(r.ca2_subject_codes?.length||0),0)}};
}
export function optimizeByGroups(candidates,options,text,optimize){
 try{
  let first=Number(options.firstRoomNumber||1);const parts=[];
  for(const [index,pool] of splitRoomGroups(candidates,text)){
   const result=optimize(pool,{...options,firstRoomNumber:first});if(!result.ok)return result;
   result.rooms=result.rooms.map(r=>({...r,group_index:index}));parts.push(result);first+=result.rooms.length;
  }
  return merge(parts);
 }catch(e){return {ok:false,errors:[e.message]}}
}
export function allocateByGroups(candidates,rooms,options,text,allocate){
 try{
  const existing=validateRoomGroups(options.suggestedAssignments||[],candidates,text),parts=[];
  const indexed=rooms.map(r=>({...r,group_index:r.group_index??existing.get(r.room_code)}));
  if(indexed.some(r=>r.group_index===undefined))throw new Error('Phòng mới chưa có nhóm. Hãy lập lại phương án để chia phòng riêng từng nhóm.');
  const groups=splitRoomGroups(candidates,text);
  if(indexed.some(r=>!groups.some(([i])=>i===r.group_index)))throw new Error('Phòng thuộc nhóm không còn học sinh. Hãy lập lại phương án.');
  for(const [index,pool] of groups){const result=allocate(pool,indexed.filter(r=>r.group_index===index),options);if(!result.ok)return result;result.rooms=result.rooms.map(r=>({...r,group_index:index}));parts.push(result)}
  return merge(parts);
 }catch(e){return {ok:false,errors:[e.message]}}
}
