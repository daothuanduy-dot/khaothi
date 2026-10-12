export const SUBJECTS = [
   {code:'SU',name:'Lịch sử'}, {code:'DIA',name:'Địa lí'}, {code:'GDKTPL',name:'Giáo dục kinh tế và pháp luật'},
  {code:'LY',name:'Vật lí'}, {code:'HOA',name:'Hóa học'}, {code:'SINH',name:'Sinh học'}, {code:'TIN',name:'Tin học'}, {code:'ANH',name:'Tiếng Anh'}
];
const subjectMap = new Map(SUBJECTS.map(s=>[s.code,s.name]));
const norm = v => String(v??'').trim().toLocaleUpperCase('vi-VN');
const textCmp = (a,b) => String(a??'').localeCompare(String(b??''),'vi',{sensitivity:'base',numeric:true});
// Preserve registration order: elective_1 is ca 1 and elective_2 is ca 2.
const canonicalPair = pair => [...pair].sort((a,b)=>textCmp(subjectMap.get(a)||a,subjectMap.get(b)||b)||textCmp(a,b));
const pairKey = pair => canonicalPair(pair).join('|');

export function optimizeElectiveRooms(candidates,{capacity=24,roomPrefix='P',firstRoomNumber=1}={}){
  capacity=Number(capacity); firstRoomNumber=Number(firstRoomNumber); roomPrefix=String(roomPrefix||'P').trim();
  const errors=[], ids=new Set(), sbds=new Set(), normalized=[];
  if(!Number.isInteger(capacity)||capacity<1||capacity>100) errors.push('Sức chứa phòng phải từ 1 đến 100.');
  if(!Number.isInteger(firstRoomNumber)||firstRoomNumber<1) errors.push('Số phòng bắt đầu phải là số nguyên dương.');
  if(!roomPrefix) errors.push('Tiền tố phòng không được để trống.');
  if(!Array.isArray(candidates)||!candidates.length) errors.push('Kỳ thi chưa có thí sinh đăng ký môn lựa chọn.');
  for(const [i,c] of (Array.isArray(candidates)?candidates:[]).entries()){
    const id=String(c.id??c.candidate_id??'').trim(), sbd=String(c.sbd??'').trim(), name=String(c.student_name??c.ho_ten??'').trim();
    const elective=[...new Set((c.elective_subjects??c.electiveSubjects??[]).map(norm))];
    const label=sbd||id||`Dòng ${i+1}`;
    if(!id)errors.push(`${label}: thiếu ID thí sinh.`); else if(ids.has(id))errors.push(`${label}: ID thí sinh bị trùng.`); else ids.add(id);
    if(!sbd)errors.push(`${label}: thiếu SBD.`); else if(sbds.has(sbd))errors.push(`${label}: SBD bị trùng (${sbd}).`); else sbds.add(sbd);
    if(elective.length!==2)errors.push(`${label}: phải đăng ký đúng hai môn lựa chọn khác nhau.`);
    const unknown=elective.filter(x=>!subjectMap.has(x)); if(unknown.length)errors.push(`${label}: mã môn không hợp lệ: ${unknown.join(', ')}.`);
    if(id&&sbd&&elective.length===2&&!unknown.length)normalized.push({id,sbd,student_name:name,class_code:String(c.class_code??c.lop??''),elective_subjects:elective,pair_key:pairKey(elective)});
  }
  if(errors.length)return {ok:false,errors,rooms:[],assignments:[],summary:null};
  const groups=new Map(); for(const c of normalized){if(!groups.has(c.pair_key))groups.set(c.pair_key,[]);groups.get(c.pair_key).push(c);}
  const pairOrder=(a,b)=>{const [a1,a2]=a[0].pair_key.split('|'),[b1,b2]=b[0].pair_key.split('|');return textCmp(a1,b1)||textCmp(a2,b2)||textCmp(a[0].sbd,b[0].sbd)};
  const ordered=[...groups.values()].map(g=>g.sort((a,b)=>textCmp(a.sbd,b.sbd)||textCmp(a.student_name,b.student_name))).sort(pairOrder);
  const rooms=[],assignments=[];let roomNo=firstRoomNumber;
  for(const group of ordered){
    const pair=canonicalPair(group[0].elective_subjects);
    for(let i=0;i<group.length;i+=capacity){
      const batch=group.slice(i,i+capacity), room_code=`${roomPrefix}${String(roomNo).padStart(2,'0')}`;
      const room={room_number:roomNo,room_code,capacity,student_count:batch.length,ca1_subject_code:pair[0],ca1_subject_name:subjectMap.get(pair[0]),ca2_subject_code:pair[1],ca2_subject_name:subjectMap.get(pair[1]),sbd_first:batch[0].sbd,sbd_last:batch[batch.length-1].sbd};
      rooms.push(room); for(const c of batch)assignments.push({candidate_id:c.id,sbd:c.sbd,student_name:c.student_name,class_code:c.class_code,room_number:roomNo,room_code,ca1_subject_code:pair[0],ca2_subject_code:pair[1]}); roomNo++;
    }
  }
  const validation=validateRoomPlan(rooms,assignments,capacity); if(!validation.ok)return {ok:false,errors:validation.errors,rooms:[],assignments:[],summary:null};
  return {ok:true,rooms,assignments,summary:{candidate_count:assignments.length,room_count:rooms.length,capacity,pair_count:groups.size},validation};
}
export function validateRoomPlan(rooms,assignments,capacity){
  const errors=[], byRoom=new Map(), seen=new Set();
  for(const a of assignments){if(seen.has(a.candidate_id))errors.push(`Thí sinh ${a.sbd} được xếp nhiều lần.`);seen.add(a.candidate_id);if(a.ca1_subject_code===a.ca2_subject_code)errors.push(`Phòng ${a.room_code} bị trùng môn giữa hai ca.`);if(!byRoom.has(a.room_code))byRoom.set(a.room_code,[]);byRoom.get(a.room_code).push(a)}
  for(const r of rooms){const rows=byRoom.get(r.room_code)||[];if(rows.length>capacity)errors.push(`${r.room_code} vượt sức chứa.`);const a=new Set(rows.map(x=>x.ca1_subject_code)),b=new Set(rows.map(x=>x.ca2_subject_code));const overlap=[...a].filter(x=>b.has(x));if(overlap.length)errors.push(`${r.room_code} lặp môn giữa hai ca: ${overlap.join(', ')}`);if(new Set([...a,...b]).size>2)errors.push(`${r.room_code} có quá hai môn lựa chọn.`)}
  return {ok:errors.length===0,errors,assigned_count:seen.size};
}
