export const SUBJECTS = [
  {code:'N1', name:'Tiếng Anh'},{code:'N2', name:'Tiếng Nga'},
  {code:'N3', name:'Tiếng Pháp'},{code:'N4', name:'Tiếng Trung Quốc'},
  {code:'N5', name:'Tiếng Đức'},{code:'N6', name:'Tiếng Nhật'},
  {code:'N7', name:'Tiếng Hàn'},{code:'ANH', name:'Tiếng Anh (mã cũ)'},
  {code:'SU', name:'Lịch sử'},
  {code:'DIA', name:'Địa lí'},{code:'KTPL', name:'Giáo dục kinh tế và pháp luật'},
  {code:'LY', name:'Vật lí'},
  {code:'HOA', name:'Hóa học'},{code:'SINH', name:'Sinh học'},{code:'TIN', name:'Tin học'}
];
export function isValidSbd(value) {
  return /^(?:\d{6}|\d{8})$/.test(String(value ?? ''));
}
export function roomExportRowPositions(headerRow, itemCount) {
  const dataStart=headerRow+1;
  return {dataStart,dataEnd:dataStart+itemCount-1,totalRow:dataStart+itemCount};
}
const nameOf = code => ({TOAN:'Toán',VAN:'Ngữ văn',...Object.fromEntries(SUBJECTS.map(s=>[s.code,s.name]))})[String(code||'').toUpperCase()] || String(code||'');
const normalize = s => String(s||'').normalize('NFC').trim();
// Vietnamese examination lists are ordered by given name, then middle name,
// then family name; comparing the display string would order by family name.
const cmpName = (a,b) => compareCandidateNames(a,b);
const cmpSbd = (a,b) => String(a.sbd||a.student_code||'').localeCompare(String(b.sbd||b.student_code||''),'vi',{numeric:true});
const cmpClass = (a,b) => String(a.grade_code||'').localeCompare(String(b.grade_code||''),'vi',{numeric:true}) ||
  String(a.class_code||'').localeCompare(String(b.class_code||''),'vi',{numeric:true}) || cmpName(a,b);

function chooseOrientation(subjects, ca1, ca2) {
  const [x,y]=subjects;
  const options=[[x,y],[y,x]];
  const possible=[];
  for(const [a,b] of options){
    if(ca1.has(b)||ca2.has(a)) continue;
    const add=(ca1.has(a)?0:1)+(ca2.has(b)?0:1);
    possible.push({a,b,add});
  }
  possible.sort((p,q)=>p.add-q.add || p.a.localeCompare(q.a));
  return possible[0]||null;
}
function orientForRoom(student, room) {
  return chooseOrientation(student.elective_subjects,room.ca1,room.ca2);
}
export function assignElectiveCandidateToRoom(candidate, roomAssignments, roomCode) {
  const subjects=[...new Set((Array.isArray(candidate.elective_subjects)?candidate.elective_subjects:[])
    .map(code=>String(code||'').trim().toUpperCase()).filter(Boolean))];
  if(subjects.length!==2)return null;
  const ca1=new Set(roomAssignments.map(a=>a.ca1_subject_code).filter(Boolean));
  const ca2=new Set(roomAssignments.map(a=>a.ca2_subject_code).filter(Boolean));
  const orientation=chooseOrientation(subjects,ca1,ca2);
  if(!orientation)return null;
  return {...candidate,candidate_id:candidate.id??candidate.candidate_id,room_code:roomCode,
    ca1_subject_code:orientation.a,ca2_subject_code:orientation.b};
}

function roomHasSubjectAcrossSessions(assignments) {
  const ca1=new Set(assignments.map(row=>String(row.ca1_subject_code||'').trim().toUpperCase()).filter(Boolean));
  const ca2=new Set(assignments.map(row=>String(row.ca2_subject_code||'').trim().toUpperCase()).filter(Boolean));
  return [...ca1].some(code=>ca2.has(code));
}

export function validateElectiveRoomSessions(assignments) {
  if(!Array.isArray(assignments)||!assignments.length)return {ok:false,error:'Phòng chưa có thí sinh.'};
  if(roomHasSubjectAcrossSessions(assignments))
    return {ok:false,error:'Không được xếp cùng một môn ở cả ca trước và ca sau trong một phòng.'};
  return {ok:true};
}
// Freeze popularity on the complete eligible roster; registration order is irrelevant.
function frequencyOrder(rows, subjectsOf) {
  const counts=new Map();
  for(const row of rows)for(const code of subjectsOf(row))counts.set(code,(counts.get(code)||0)+1);
  return (a,b)=>(counts.get(b)||0)-(counts.get(a)||0)||a.localeCompare(b);
}
function rankedElectiveCandidates(candidates) {
  const normalized=candidates.map(candidate=>{
    const pair=[...new Set((candidate.elective_subjects||[]).map(code=>String(code||'').trim().toUpperCase()).filter(Boolean))];
    if(pair.length!==2)throw new Error('Mỗi thí sinh cần đăng ký đúng hai môn khác nhau.');
    return {...candidate,candidate_id:candidate.id??candidate.candidate_id,elective_subjects:pair};
  });
  if(new Set(normalized.map(row=>String(row.candidate_id))).size!==normalized.length)
    throw new Error('Danh sách thí sinh bị trùng.');
  const compare=frequencyOrder(normalized,row=>row.elective_subjects);
  return normalized.map(row=>{
    const [first,second]=[...row.elective_subjects].sort(compare);
    return {...row,ca1_subject_code:first,ca2_subject_code:second};
  }).sort((a,b)=>compare(a.ca1_subject_code,b.ca1_subject_code)||
    compare(a.ca2_subject_code,b.ca2_subject_code)||compareCandidateNames(a,b));
}
function packRankedCandidates(candidates, roomPlan, dynamic=false) {
  const pending=rankedElectiveCandidates(candidates);
  const rooms=roomPlan.map(room=>({...room,students:[],ca1:new Set(),ca2:new Set()}));
  for(let index=0;pending.length;index++){
    if(index>=rooms.length){
      if(!dynamic)return null;
      const last=rooms.at(-1),number=last.room_number+1;
      rooms.push({...last,room_number:number,room_code:last.room_prefix+String(number).padStart(2,'0'),
        students:[],ca1:new Set(),ca2:new Set()});
    }
    const room=rooms[index],target=Number(room.student_count);
    for(let i=0;i<pending.length&&room.students.length<target;){
      const row=pending[i],a=row.ca1_subject_code,b=row.ca2_subject_code;
      // Never reverse a popularity-based orientation just to fill a room.
      if(room.ca1.has(b)||room.ca2.has(a)){i++;continue}
      room.students.push({...row,room_code:room.room_code});
      room.ca1.add(a);room.ca2.add(b);pending.splice(i,1);
    }
    if(!dynamic&&room.students.length!==target)return null;
  }
  if(!dynamic&&rooms.some(room=>room.students.length!==Number(room.student_count)))return null;
  return rooms;
}
export function adjustRoomPlanCount(roomPlan, roomCode, requestedCount) {
  if(!Array.isArray(roomPlan)||roomPlan.length<2)
    return {ok:false,errors:['Cần ít nhất hai phòng để điều chỉnh sĩ số mà vẫn giữ nguyên tổng số thí sinh.']};
  const index=roomPlan.findIndex(room=>room.room_code===roomCode);
  const count=Number(requestedCount);
  if(index<0||!Number.isInteger(count))
    return {ok:false,errors:['Phòng hoặc sĩ số điều chỉnh không hợp lệ.']};
  const room=roomPlan[index],current=Number(room.student_count);
  const roomCapacity=Number(room.capacity);
  if(!Number.isInteger(current)||!Number.isInteger(roomCapacity)||count<1||count>roomCapacity)
    return {ok:false,errors:[`Sĩ số phòng phải từ 1 đến ${roomCapacity||'sức chứa phòng'}.`]};
  const otherIndex=index===roomPlan.length-1?index-1:roomPlan.length-1;
  const other=roomPlan[otherIndex],otherCurrent=Number(other.student_count);
  const otherCapacity=Number(other.capacity);
  const adjustedOther=otherCurrent-(count-current);
  if(adjustedOther<1||adjustedOther>otherCapacity)
    return {ok:false,errors:[`Không thể cân đối với phòng ${other.room_code}: sĩ số phải từ 1 đến ${otherCapacity}.`]};
  const rooms=roomPlan.map((item,itemIndex)=>itemIndex===index
    ?{...item,student_count:count}
    :itemIndex===otherIndex?{...item,student_count:adjustedOther}:{...item});
  return {ok:true,rooms};
}
export function allocateCandidatesToRoomPlan(candidates, roomPlan, options={}) {
  if(!Array.isArray(candidates)||!candidates.length)return {ok:false,errors:['Không có thí sinh đủ điều kiện.']};
  if(!Array.isArray(roomPlan)||!roomPlan.length)return {ok:false,errors:['Phương án chưa có phòng.']};
  const capacity=Number(options.capacity),planCount=new Map();
  for(const room of roomPlan){
    const count=Number(room.student_count);
    if(!room.room_code||!Number.isInteger(count)||count<1||count>capacity||planCount.has(room.room_code))
      return {ok:false,errors:['Mã phòng hoặc sĩ số dự kiến không hợp lệ.']};
    planCount.set(room.room_code,count);
  }
  const total=[...planCount.values()].reduce((sum,count)=>sum+count,0);
  if(total!==candidates.length)
    return {ok:false,errors:[`Tổng sĩ số dự kiến là ${total}; nhưng có ${candidates.length} thí sinh đủ điều kiện.`]};

  const assignments=[],roomState=roomPlan.map(room=>({
    ...room,students:[],ca1:new Set(),ca2:new Set()
  }));
  if(options.planType==='mandatory'){
    let candidateIndex=0;
    for(const room of roomState){
      for(let index=0;index<planCount.get(room.room_code);index++){
        const candidate=candidates[candidateIndex++];
        const assignment={...candidate,candidate_id:candidate.id??candidate.candidate_id,
          room_code:room.room_code,subject_code:options.subjectCode,
          subject_name:nameOf(options.subjectCode)};
        room.students.push(assignment);assignments.push(assignment);
      }
    }
  }else{
    let groupedRooms;
    try { groupedRooms=packRankedCandidates(candidates,roomPlan); }
    catch(error){return {ok:false,errors:[error.message]};}
    if(!groupedRooms)return {ok:false,errors:['Không thể giữ ưu tiên môn theo tần suất với sĩ số phòng đã định. Hãy điều chỉnh sĩ số hoặc thêm phòng.']};
    for(let index=0;index<roomState.length;index++){
      const grouped=groupedRooms[index],room=roomState[index];
      room.students=grouped.students;room.ca1=grouped.ca1;room.ca2=grouped.ca2;
      assignments.push(...room.students);
    }
    const underfilled=roomState.find(room=>room.students.length!==planCount.get(room.room_code));
    if(underfilled)
      return {ok:false,errors:[`Phòng ${underfilled.room_code} chưa đạt sĩ số dự kiến. Hãy điều chỉnh lại phương án phòng.`]};
  }

  const rooms=roomState.map(room=>{
    const sbds=room.students.map(candidate=>String(candidate.sbd||candidate.student_code||''))
      .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    const ca1=options.planType==='mandatory'?[options.subjectCode]:[...room.ca1].sort();
    const ca2=options.planType==='mandatory'?[]:[...room.ca2].sort();
    return {room_number:room.room_number,room_code:room.room_code,student_count:room.students.length,
      capacity,ca1_subject_codes:ca1,ca2_subject_codes:ca2,
      ca1_subject_name:ca1.map(nameOf).join(', '),ca2_subject_name:ca2.map(nameOf).join(', ')||'—',
      sbd_first:sbds[0]||'',sbd_last:sbds.at(-1)||'',
      candidate_ids:room.students.map(candidate=>candidate.candidate_id),
      ...(options.planType==='mandatory'?{subject_code:options.subjectCode}: {})};
  });
  const result={ok:true,rooms,assignments,summary:{
    candidate_count:assignments.length,room_count:rooms.length,capacity,
    subject_count:rooms.reduce((sum,room)=>sum+room.ca1_subject_codes.length+room.ca2_subject_codes.length,0),
    full_rooms:rooms.filter(room=>room.student_count===capacity).length,
    partial_rooms:rooms.filter(room=>room.student_count<capacity).length
  }};
  return options.planType==='mandatory'?result:orderElectiveRoomPlan(result);
}
export function optimizeElectiveRooms(candidates, options={}) {
  const capacity=Math.floor(Number(options.capacity||24)),prefix=String(options.roomPrefix||'P').trim()||'P',
    first=Math.floor(Number(options.firstRoomNumber||1)),sortMode=options.sortMode||'abc';
  const errors=[];
  if(!Number.isFinite(capacity)||capacity<1)errors.push('Sức chứa phòng phải là số nguyên dương.');
  if(!Number.isFinite(first)||first<1)errors.push('Số phòng bắt đầu phải lớn hơn 0.');
  if(!Array.isArray(candidates)||!candidates.length)errors.push('Không có thí sinh đủ điều kiện.');
  if(errors.length)return {ok:false,errors};
  const students=[];
  for(const c of candidates){
    const pair=[...new Set((Array.isArray(c.elective_subjects)?c.elective_subjects:[]).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))];
    if(pair.length!==2){errors.push(`${c.student_code||c.sbd||c.id}: cần đăng ký đúng hai môn khác nhau.`);continue}
    students.push({...c,elective_subjects:pair});
  }
  if(errors.length)return {ok:false,errors};
  if(sortMode==='previous')students.sort((a,b)=>Number(b.previous_score)-Number(a.previous_score)||cmpName(a,b));
  else if(sortMode==='abc')students.sort(cmpName);else if(sortMode==='class')students.sort(cmpClass);else students.sort(cmpSbd);
  let packed;
  try {
    packed=packRankedCandidates(students,[{
      room_number:first,room_code:prefix+String(first).padStart(2,'0'),
      room_prefix:prefix,student_count:capacity,capacity
    }],true);
  } catch(error){return {ok:false,errors:[error.message]};}
  const assignments=packed.flatMap(room=>room.students.map(row=>({
    ...row,sbd:String(row.sbd||''),student_code:String(row.student_code||'')
  })));
  const rooms=packed.map(room=>{
    const ca1=[...room.ca1],ca2=[...room.ca2];
    const sbds=room.students.map(row=>String(row.sbd||'')).filter(Boolean).sort();
    return {room_number:room.room_number,room_code:room.room_code,capacity,
      student_count:room.students.length,ca1_subject_codes:ca1,ca2_subject_codes:ca2,
      ca1_subject_name:ca1.map(nameOf).join(', '),ca2_subject_name:ca2.map(nameOf).join(', '),
      candidate_ids:room.students.map(row=>row.candidate_id),sbd_first:sbds[0]||'',sbd_last:sbds.at(-1)||''};
  });
  return orderElectiveRoomPlan({ok:true,rooms,assignments,summary:{
    candidate_count:assignments.length,room_count:rooms.length,capacity,
    subject_count:rooms.reduce((sum,r)=>sum+r.ca1_subject_codes.length+r.ca2_subject_codes.length,0),
    full_rooms:rooms.filter(r=>r.student_count===capacity).length,
    partial_rooms:rooms.filter(r=>r.student_count<capacity).length}});
}

export function compareCandidateNames(a,b){
  const parts=value=>normalize(value).split(/\s+/).filter(Boolean);
  const left=parts(a.student_name),right=parts(b.student_name);
  const compare=(x,y)=>x.localeCompare(y,'vi',{sensitivity:'base'});
  return compare(left.at(-1)||'',right.at(-1)||'')||compare(left.slice(1,-1).join(' '),right.slice(1,-1).join(' '))||
    compare(left[0]||'',right[0]||'')||String(a.student_code||a.id||'').localeCompare(String(b.student_code||b.id||''),'vi',{numeric:true});
}

// Ca 2 is consecutive within each Ca 1 block, not across the entire room.
function continuousPairOrder(rows, compare) {
  compare ||= frequencyOrder(rows,row=>[row.ca1_subject_code,row.ca2_subject_code]);
  return [...rows].sort((a,b)=>compare(a.ca1_subject_code,b.ca1_subject_code)||
    compare(a.ca2_subject_code,b.ca2_subject_code)||compareCandidateNames(a,b));
}

export function orderElectiveRoomPlan(plan){
  const rooms=plan.rooms.map(room=>({...room})).sort((a,b)=>Number(a.room_number)-Number(b.room_number));
  if(rooms.some(room=>!Number.isInteger(Number(room.room_number))||Number(room.room_number)<1)||new Set(rooms.map(room=>Number(room.room_number))).size!==rooms.length)
    throw new Error('Số phòng không hợp lệ hoặc bị trùng.');
  const compare=frequencyOrder(plan.assignments,row=>[row.ca1_subject_code,row.ca2_subject_code]);
  const assignments=[];
  for(const room of rooms){
    const rows=plan.assignments.filter(row=>row.room_code===room.room_code);
    if(!rows.length||rows.length!==Number(room.student_count)||rows.length>Number(room.capacity)||!validateElectiveRoomSessions(rows).ok)
      throw new Error(`Phòng ${room.room_code}: sĩ số hoặc môn giữa hai ca không hợp lệ.`);
    const ordered=continuousPairOrder(rows,compare);
    assignments.push(...ordered.map((row,index)=>({...row,seat_number:index+1})));
    room.candidate_ids=ordered.map(row=>row.candidate_id);
  }
  if(assignments.length!==plan.assignments.length||new Set(assignments.map(row=>String(row.candidate_id))).size!==assignments.length)
    throw new Error('Phân công bị trùng hoặc có phòng không tồn tại.');
  return {...plan,rooms,assignments};
}

export function numberSavedElectiveRooms(plan,options={}){
  const {prefix='31',totalLength=6,startNumber=1}=options;
  if(!plan.rooms?.length||!plan.assignments?.length)throw new Error('Hãy xếp và lưu phòng tổ hợp trước.');
  if(![6,8].includes(totalLength)||!/^\d{2,3}$/.test(prefix)||!Number.isInteger(startNumber)||startNumber<1||startNumber+plan.assignments.length-1>=10**(totalLength-prefix.length))throw new Error('Dải SBD không hợp lệ hoặc không đủ.');
  if(plan.assignments.some(row=>String(row.sbd||'').trim()))throw new Error('Phương án đã có SBD; không được cấp lại.');
  const ordered=orderElectiveRoomPlan(plan);
  // Number the saved seat order, never optimize or move candidates at this step.
  const assignments=[...plan.assignments].sort((a,b)=>ordered.rooms.findIndex(r=>r.room_code===a.room_code)-ordered.rooms.findIndex(r=>r.room_code===b.room_code)||Number(a.seat_number)-Number(b.seat_number));
  for(const room of ordered.rooms){
    const members=assignments.filter(row=>row.room_code===room.room_code);
    if(members.some((row,index)=>Number(row.seat_number)!==index+1))throw new Error('Phòng chưa có thứ tự vị trí liên tục hợp lệ. Hãy xếp và lưu lại phòng trước.');
    if(plan.adjustment_mode!=='manual'){
      const closed=new Set();let previous=null;
      const closedPairs=new Set();let previousPair=null;
      for(const row of members){
        const code=row.ca1_subject_code,pair=JSON.stringify([code,row.ca2_subject_code]);
        if(code!==previous){if(closed.has(code))throw new Error('Thứ tự nhóm môn Ca 1 không liên tục. Hãy lưu lại phòng.');closed.add(code);previous=code;}
        if(pair!==previousPair){if(closedPairs.has(pair))throw new Error('Thứ tự nhóm môn trong Ca 1 không liên tục. Hãy lưu lại phòng.');closedPairs.add(pair);previousPair=pair;}
      }
    }
  }
  const numbered=assignments.map((row,index)=>({...row,sbd:prefix+String(startNumber+index).padStart(totalLength-prefix.length,'0')}));
  return {...plan,rooms:ordered.rooms.map(room=>{
    const members=numbered.filter(row=>row.room_code===room.room_code);
    return {...room,candidate_ids:members.map(row=>row.candidate_id),sbd_first:members[0].sbd,sbd_last:members.at(-1).sbd};
  }),assignments:numbered};
}

export function buildElectiveSbdPlan(candidates,options={}){
  const {prefix='31',totalLength=6,startNumber=1}=options;
  if(![6,8].includes(totalLength)||!/^\d{2,3}$/.test(prefix))throw new Error('Tiền tố hoặc độ dài SBD không hợp lệ.');
  if(!Number.isInteger(startNumber)||startNumber<1||startNumber+candidates.length-1>=10**(totalLength-prefix.length))throw new Error('Dải số báo danh không đủ cho danh sách thí sinh.');
  if(candidates.some(row=>String(row.sbd||'').trim()))throw new Error('Thí sinh trong đợt đã có SBD; không được cấp lại.');
  if(new Set(candidates.map(row=>String(row.id))).size!==candidates.length)throw new Error('Danh sách thí sinh bị trùng.');
  const optimized=optimizeElectiveRooms(candidates,{...options,sortMode:'abc'});
  if(!optimized.ok)throw new Error(optimized.errors.join('\n'));
  const blocks=optimized.rooms.map(room=>optimized.assignments.filter(row=>row.room_code===room.room_code));
  let sequence=startNumber;
  const assignments=[],rooms=blocks.map((rows,index)=>{
    const number=Number(options.firstRoomNumber||1)+index,code=`${options.roomPrefix||'P'}${String(number).padStart(2,'0')}`;
    const members=rows.map((row,i)=>({...row,room_code:code,seat_number:i+1,sbd:prefix+String(sequence++).padStart(totalLength-prefix.length,'0')}));
    assignments.push(...members);
    const ca1=[...new Set(members.map(row=>row.ca1_subject_code))],ca2=[...new Set(members.map(row=>row.ca2_subject_code))];
    return {room_number:number,room_code:code,capacity:Number(options.capacity||24),student_count:members.length,
      ca1_subject_codes:ca1,ca2_subject_codes:ca2,ca1_subject_name:ca1.map(nameOf).join(', '),ca2_subject_name:ca2.map(nameOf).join(', '),
      candidate_ids:members.map(row=>row.candidate_id),sbd_first:members[0].sbd,sbd_last:members.at(-1).sbd};
  });
  return {ok:true,rooms,assignments,summary:{candidate_count:assignments.length,room_count:rooms.length,extra_rooms:rooms.length-optimized.rooms.length}};
}

export function optimizeMandatoryRooms(candidates, options={}) {
 const capacity=Math.floor(Number(options.capacity||24)),prefix=String(options.roomPrefix||'M').trim()||'M',
 first=Math.floor(Number(options.firstRoomNumber||1)),subject=String(options.subjectCode||'TOAN').toUpperCase(),sortMode=options.sortMode||'abc';
 if(!Number.isFinite(capacity)||capacity<1)return {ok:false,errors:['Sức chứa phòng phải là số nguyên dương.']};
 if(!Array.isArray(candidates)||!candidates.length)return {ok:false,errors:['Không có thí sinh trong kỳ thi.']};
 const students=[...candidates];
 if(sortMode==='previous')students.sort((a,b)=>Number(b.previous_score)-Number(a.previous_score)||cmpName(a,b));
  else if(sortMode==='abc')students.sort(cmpName);else if(sortMode==='class')students.sort(cmpClass);else students.sort(cmpSbd);
 const rooms=[],assignments=[];
 for(let i=0;i<students.length;i+=capacity){
  const chunk=students.slice(i,i+capacity),number=first+rooms.length,code=`${prefix}${String(number).padStart(2,'0')}`;
  const sbds=chunk.map(s=>String(s.sbd||'')).sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  rooms.push({room_number:number,room_code:code,student_count:chunk.length,capacity,subject_code:subject,
   ca1_subject_codes:[subject],ca2_subject_codes:[],ca1_subject_name:nameOf(subject),ca2_subject_name:'—',
   sbd_first:sbds[0]||'',sbd_last:sbds[sbds.length-1]||'',candidate_ids:chunk.map(s=>s.id)});
  for(const s of chunk)assignments.push({candidate_id:s.id,sbd:String(s.sbd||''),student_code:String(s.student_code||''),
   student_name:String(s.student_name||''),class_code:String(s.class_code||''),room_code:code,
   subject_code:subject,subject_name:nameOf(subject),previous_score:s.previous_score??null});
 }
 return {ok:true,rooms,assignments,summary:{candidate_count:assignments.length,room_count:rooms.length,capacity,
  subject_count:1,full_rooms:rooms.filter(r=>r.student_count===capacity).length,partial_rooms:rooms.filter(r=>r.student_count<capacity).length}};
}

export function restoreRoomingPlan(rooms, assignments, candidates, options={}) {
  if(!Array.isArray(rooms)||!rooms.length||!Array.isArray(assignments)||!assignments.length||
    !Array.isArray(candidates))
    return {ok:false,errors:['Hồ sơ phân phòng đã lưu thiếu danh sách phòng, phân công hoặc thí sinh.']};
  const candidateById=new Map(candidates.map(candidate=>[
    String(candidate.id??candidate.candidate_id),candidate
  ]));
  if(candidateById.size!==candidates.length)
    return {ok:false,errors:['Danh sách thí sinh dùng để khôi phục có mã bị trùng.']};
  const roomsByCode=new Map();
  for(const room of rooms){
    const code=String(room?.room_code||'');
    const count=Number(room?.student_count),capacity=Number(room?.capacity);
    if(!code||roomsByCode.has(code)||!Number.isInteger(count)||count<1||
      !Number.isInteger(capacity)||capacity<1||count>capacity)
      return {ok:false,errors:['Hồ sơ phân phòng có mã phòng hoặc sĩ số không hợp lệ.']};
    roomsByCode.set(code,{...room,room_code:code,capacity});
  }
  const assignedIds=new Set(),normalizedAssignments=[];
  for(const stored of assignments){
    const candidateId=String(stored?.candidate_id||'');
    const roomCode=String(stored?.room_code||'');
    const candidate=candidateById.get(candidateId)|| (options.allowMissingCandidates?{}:null);
    if(!candidate||assignedIds.has(candidateId)||!roomsByCode.has(roomCode))
      return {ok:false,errors:['Hồ sơ có thí sinh trùng, không thuộc kỳ thi đang chọn hoặc phòng không tồn tại.']};
    assignedIds.add(candidateId);
    normalizedAssignments.push({
      ...candidate,...stored,
      candidate_id:candidateId,
      room_code:roomCode,
      sbd:String(stored.sbd||candidate.sbd||''),
      student_name:String(stored.student_name||candidate.student_name||''),
      class_code:String(stored.class_code||candidate.class_code||''),
      subject_code:stored.subject_code||options.subjectCode||null
    });
  }
  const normalizedRooms=[...roomsByCode.values()].map(room=>{
    const members=normalizedAssignments.filter(assignment=>assignment.room_code===room.room_code);
    if(members.length!==Number(room.student_count))return null;
    const sbds=members.map(assignment=>assignment.sbd).filter(Boolean)
      .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    const ca1=[...new Set(members.map(assignment=>assignment.ca1_subject_code).filter(Boolean))].sort();
    const ca2=[...new Set(members.map(assignment=>assignment.ca2_subject_code).filter(Boolean))].sort();
    return {
      ...room,
      student_count:members.length,
      ca1_subject_codes:Array.isArray(room.ca1_subject_codes)?room.ca1_subject_codes:ca1,
      ca2_subject_codes:Array.isArray(room.ca2_subject_codes)?room.ca2_subject_codes:ca2,
      sbd_first:sbds[0]||'',
      sbd_last:sbds[sbds.length-1]||'',
      candidate_ids:members.map(assignment=>assignment.candidate_id)
    };
  });
  if(normalizedRooms.some(room=>!room))
    return {ok:false,errors:['Sĩ số khai báo trong hồ sơ không khớp số phân công đã lưu.']};
  const capacity=Number(options.capacity)||Number(normalizedRooms[0].capacity);
  return {ok:true,result:{
    rooms:normalizedRooms,
    assignments:normalizedAssignments,
    summary:{
      candidate_count:normalizedAssignments.length,
      room_count:normalizedRooms.length,
      capacity,
      subject_count:options.planType==='mandatory'?normalizedRooms.length:
        normalizedRooms.reduce((sum,room)=>sum+room.ca1_subject_codes.length+room.ca2_subject_codes.length,0),
      full_rooms:normalizedRooms.filter(room=>room.student_count===room.capacity).length,
      partial_rooms:normalizedRooms.filter(room=>room.student_count<room.capacity).length
    }
  }};
}
