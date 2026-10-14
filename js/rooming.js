export const SUBJECTS = [
  {code:'ANH', name:'Tiếng Anh'},{code:'SU', name:'Lịch sử'},
  {code:'DIA', name:'Địa lí'},{code:'GDKTPL', name:'Giáo dục kinh tế và pháp luật'},
  {code:'KTPL', name:'Giáo dục kinh tế và pháp luật'},{code:'LY', name:'Vật lí'},
  {code:'HOA', name:'Hóa học'},{code:'SINH', name:'Sinh học'},{code:'TIN', name:'Tin học'}
];
const nameOf = code => ({TOAN:'Toán',VAN:'Ngữ văn',...Object.fromEntries(SUBJECTS.map(s=>[s.code,s.name]))})[String(code||'').toUpperCase()] || String(code||'');
const normalize = s => String(s||'').normalize('NFC').trim();
const cmpName = (a,b) => normalize(a.student_name).localeCompare(normalize(b.student_name),'vi',{sensitivity:'base'}) ||
  String(a.student_code||a.sbd||'').localeCompare(String(b.student_code||b.sbd||''),'vi',{numeric:true});
const cmpSbd = (a,b) => String(a.sbd||a.student_code||'').localeCompare(String(b.sbd||b.student_code||''),'vi',{numeric:true});

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
function rebalanceSuggestedAssignments(candidates, roomPlan, suggestedAssignments) {
  const candidateById=new Map(candidates.map(candidate=>[
    String(candidate.id??candidate.candidate_id),candidate
  ]));
  const targetCounts=new Map(roomPlan.map(room=>[room.room_code,Number(room.student_count)]));
  const rooms=new Map();
  for(const room of roomPlan)rooms.set(room.room_code,{...room,students:[]});
  for(const assignment of suggestedAssignments){
    const roomCode=String(assignment.room_code);
    if(!rooms.has(roomCode))rooms.set(roomCode,{room_code:roomCode,students:[]});
    rooms.get(roomCode).students.push({...assignment});
  }
  const currentIds=[...rooms.values()].flatMap(room=>room.students.map(row=>String(row.candidate_id)));
  if(currentIds.length!==candidateById.size||new Set(currentIds).size!==currentIds.length||
    currentIds.some(id=>!candidateById.has(id)))return null;

  while(true){
    const sources=[...rooms.values()].filter(room=>
      room.students.length>(targetCounts.get(room.room_code)||0));
    const destinations=[...rooms.values()].filter(room=>
      targetCounts.has(room.room_code)&&room.students.length<targetCounts.get(room.room_code));
    if(!sources.length&&!destinations.length)break;
    let move=null;
    for(const destination of destinations){
      for(const source of sources){
        for(let index=0;index<source.students.length;index++){
          const assignment=source.students[index];
          const candidate=candidateById.get(String(assignment.candidate_id));
          const moved=assignElectiveCandidateToRoom(candidate,destination.students,destination.room_code);
          if(moved){move={source,destination,index,moved};break}
        }
        if(move)break;
      }
      if(move)break;
    }
    if(!move)return null;
    move.source.students.splice(move.index,1);
    move.destination.students.push(move.moved);
  }

  if([...targetCounts].some(([roomCode,count])=>
    (rooms.get(roomCode)?.students.length||0)!==count))return null;
  return [...targetCounts.keys()].flatMap(roomCode=>rooms.get(roomCode).students);
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
  }else if(Array.isArray(options.suggestedAssignments)){
    const rebalanced=rebalanceSuggestedAssignments(candidates,roomPlan,options.suggestedAssignments);
    if(!rebalanced)
      return allocateCandidatesToRoomPlan(candidates,roomPlan,{
        capacity,planType:options.planType,subjectCode:options.subjectCode
      });
    for(const assignment of rebalanced){
      const room=roomState.find(item=>item.room_code===assignment.room_code);
      room.students.push(assignment);room.ca1.add(assignment.ca1_subject_code);room.ca2.add(assignment.ca2_subject_code);
      assignments.push(assignment);
    }
  }else{
    for(const candidate of candidates){
      const choices=[];
      for(const room of roomState){
        if(room.students.length>=planCount.get(room.room_code))continue;
        const assignment=assignElectiveCandidateToRoom(candidate,room.students,room.room_code);
        if(!assignment)continue;
        const additional=(room.ca1.has(assignment.ca1_subject_code)?0:1)+
          (room.ca2.has(assignment.ca2_subject_code)?0:1);
        choices.push({room,assignment,additional});
      }
      choices.sort((a,b)=>a.additional-b.additional||b.room.students.length-a.room.students.length||
        a.room.room_number-b.room.room_number);
      if(!choices.length)
        return {ok:false,errors:[`Không thể xếp ${candidate.student_name||candidate.sbd||candidate.id} đúng theo sĩ số đã định mà vẫn tránh trùng môn giữa hai ca. Hãy điều chỉnh sĩ số hoặc thêm phòng rồi thử lại.`]};
      const {room,assignment}=choices[0];
      room.students.push(assignment);room.ca1.add(assignment.ca1_subject_code);room.ca2.add(assignment.ca2_subject_code);
      assignments.push(assignment);
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
  return {ok:true,rooms,assignments,summary:{
    candidate_count:assignments.length,room_count:rooms.length,capacity,
    subject_count:rooms.reduce((sum,room)=>sum+room.ca1_subject_codes.length+room.ca2_subject_codes.length,0),
    full_rooms:rooms.filter(room=>room.student_count===capacity).length,
    partial_rooms:rooms.filter(room=>room.student_count<capacity).length
  }};
}
export function optimizeElectiveRooms(candidates, options={}) {
  const capacity=Math.floor(Number(options.capacity||24)),prefix=String(options.roomPrefix||'P').trim()||'P',
    first=Math.floor(Number(options.firstRoomNumber||1)),sortMode=options.sortMode||'abc';
  const errors=[];
  if(!Number.isFinite(capacity)||capacity<1||capacity>100)errors.push('Sức chứa phòng phải từ 1 đến 100.');
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
  else if(sortMode==='abc')students.sort(cmpName);else students.sort(cmpSbd);
  const rooms=[];
  for(const s of students){
    let choices=[];
    for(const room of rooms){
      if(room.students.length>=capacity)continue;
      const orientation=orientForRoom(s,room);
      if(!orientation)continue;
      choices.push({room,orientation,add:orientation.add});
    }
    // Prefer an existing compatible room, then the fewest additional subjects,
    // then the fullest room. This packs rooms tightly while minimizing subjects.
    choices.sort((a,b)=>a.add-b.add||b.room.students.length-a.room.students.length);
    if(choices.length){
      const {room,orientation}=choices[0];
      room.students.push({...s,ca1:orientation.a,ca2:orientation.b});
      room.ca1.add(orientation.a);room.ca2.add(orientation.b);
    }else{
      const orientation=chooseOrientation(s.elective_subjects,new Set(),new Set());
      const {a,b}=orientation;
      const room={room_number:first+rooms.length,room_code:`${prefix}${String(first+rooms.length).padStart(2,'0')}`,
        students:[{...s,ca1:a,ca2:b}],ca1:new Set([a]),ca2:new Set([b])};
      rooms.push(room);
    }
  }
  const assignments=[];
  const resultRooms=rooms.map(room=>{
    const assigned=room.students.map(s=>{
      const a={candidate_id:s.id,sbd:String(s.sbd||s.student_code||''),student_code:String(s.student_code||''),
        student_name:String(s.student_name||''),class_code:String(s.class_code||''),room_code:room.room_code,
        ca1_subject_code:s.ca1,ca2_subject_code:s.ca2,previous_score:s.previous_score??null};
      assignments.push(a);return a;
    });
    const sbds=assigned.map(a=>a.sbd).sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    return {room_number:room.room_number,room_code:room.room_code,student_count:assigned.length,capacity,
      ca1_subject_codes:[...room.ca1].sort(),ca2_subject_codes:[...room.ca2].sort(),
      ca1_subject_name:[...room.ca1].map(nameOf).join(', '),ca2_subject_name:[...room.ca2].map(nameOf).join(', '),
      sbd_first:sbds[0]||'',sbd_last:sbds[sbds.length-1]||'',candidate_ids:assigned.map(a=>a.candidate_id)};
  });
  return {ok:true,rooms:resultRooms,assignments,summary:{candidate_count:assignments.length,room_count:rooms.length,capacity,
    subject_count:resultRooms.reduce((sum,r)=>sum+r.ca1_subject_codes.length+r.ca2_subject_codes.length,0),
    full_rooms:resultRooms.filter(r=>r.student_count===capacity).length,
    partial_rooms:resultRooms.filter(r=>r.student_count<capacity).length}};
}
export function optimizeMandatoryRooms(candidates, options={}) {
 const capacity=Math.floor(Number(options.capacity||24)),prefix=String(options.roomPrefix||'M').trim()||'M',
 first=Math.floor(Number(options.firstRoomNumber||1)),subject=String(options.subjectCode||'TOAN').toUpperCase(),sortMode=options.sortMode||'abc';
 if(!Number.isFinite(capacity)||capacity<1||capacity>100)return {ok:false,errors:['Sức chứa phòng phải từ 1 đến 100.']};
 if(!Array.isArray(candidates)||!candidates.length)return {ok:false,errors:['Không có thí sinh trong kỳ thi.']};
 const students=[...candidates];
 if(sortMode==='previous')students.sort((a,b)=>Number(b.previous_score)-Number(a.previous_score)||cmpName(a,b));
 else if(sortMode==='abc')students.sort(cmpName);else students.sort(cmpSbd);
 const rooms=[],assignments=[];
 for(let i=0;i<students.length;i+=capacity){
  const chunk=students.slice(i,i+capacity),number=first+rooms.length,code=`${prefix}${String(number).padStart(2,'0')}`;
  const sbds=chunk.map(s=>String(s.sbd||s.student_code||'')).sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  rooms.push({room_number:number,room_code:code,student_count:chunk.length,capacity,subject_code:subject,
   ca1_subject_codes:[subject],ca2_subject_codes:[],ca1_subject_name:nameOf(subject),ca2_subject_name:'—',
   sbd_first:sbds[0]||'',sbd_last:sbds[sbds.length-1]||'',candidate_ids:chunk.map(s=>s.id)});
  for(const s of chunk)assignments.push({candidate_id:s.id,sbd:String(s.sbd||s.student_code||''),student_code:String(s.student_code||''),
   student_name:String(s.student_name||''),class_code:String(s.class_code||''),room_code:code,
   subject_code:subject,subject_name:nameOf(subject),previous_score:s.previous_score??null});
 }
 return {ok:true,rooms,assignments,summary:{candidate_count:assignments.length,room_count:rooms.length,capacity,
  subject_count:1,full_rooms:rooms.filter(r=>r.student_count===capacity).length,partial_rooms:rooms.filter(r=>r.student_count<capacity).length}};
}
