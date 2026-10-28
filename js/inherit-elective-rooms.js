export function inheritElectiveRooms(source,candidates,subjectCode){
 if(!['TOAN','VAN'].includes(subjectCode))throw new Error('Chỉ kế thừa phòng lựa chọn cho Toán/Văn.');
 if(!source?.rooms?.length||!source.assignments?.length)throw new Error('Hãy phân phòng chính thức môn lựa chọn trước khi lập Toán/Văn.');
 const byId=new Map(candidates.map(c=>[String(c.id??c.candidate_id),c])),seen=new Set(),codes=new Set(source.rooms.map(r=>r.room_code));
 if(byId.size!==candidates.length||codes.size!==source.rooms.length)throw new Error('Danh sách học sinh hoặc phòng bị trùng.');
 const assignments=source.assignments.map(a=>{
  const id=String(a.candidate_id),c=byId.get(id);
  if(!c||seen.has(id)||!codes.has(a.room_code))throw new Error('Danh sách phòng lựa chọn không khớp học sinh đợt thi.');
  seen.add(id);
  if(!/^(?:\d{6}|\d{8})$/.test(String(c.sbd||''))||String(a.sbd)!==String(c.sbd))throw new Error('SBD phòng lựa chọn không khớp SBD chung hiện tại. Hãy kiểm tra lại phương án nguồn.');
  const row={...c,...a,subject_code:subjectCode};
  delete row.ca1_subject_code;delete row.ca2_subject_code;delete row.elective_subjects;delete row.subject_name;
  return row;
 });
 if(seen.size!==byId.size)throw new Error('Phòng lựa chọn thiếu học sinh của đợt thi.');
 const rooms=source.rooms.map(r=>{
  const members=assignments.filter(a=>a.room_code===r.room_code).sort((a,b)=>Number(a.seat_number)-Number(b.seat_number));
  if(members.length!==Number(r.student_count)||!members.length||members.some((a,i)=>Number(a.seat_number)!==i+1))throw new Error('Sĩ số hoặc vị trí phòng lựa chọn không hợp lệ.');
  const room={...r,subject_code:subjectCode,ca1_subject_codes:[subjectCode],ca2_subject_codes:[],candidate_ids:members.map(a=>a.candidate_id)};
  delete room.fixed_subject_slots;delete room.ca1_subject_name;delete room.ca2_subject_name;
  return room;
 });
 return {ok:true,rooms,assignments,summary:{candidate_count:assignments.length,room_count:rooms.length,subject_count:rooms.length}};
}
