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

function orientForRoom(student, room) {
  const [x,y]=student.elective_subjects;
  const options=[[x,y],[y,x]];
  const possible=[];
  for(const [a,b] of options){
    if(room.ca1.has(b)||room.ca2.has(a)) continue;
    const add=(room.ca1.has(a)?0:1)+(room.ca2.has(b)?0:1);
    possible.push({a,b,add});
  }
  possible.sort((p,q)=>p.add-q.add || p.a.localeCompare(q.a));
  return possible[0]||null;
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
      const [a,b]=s.elective_subjects;
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
