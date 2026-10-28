import {optimizeByGroups,validateGroupSbdSequence} from './group-rooming.js?v=158';
import {applyFixedSubjectSlots,assertElectiveLayoutEditable,normalizeDraftRoomNames} from './elective-layout.js?v=184';
import {optimizeMandatoryRooms,optimizeElectiveRooms,isValidSbd} from './rooming.js?v=158';

// Build a complete replacement before changing the preview, so a failed move is atomic.
export function redistributePrivateRooms(preview,groupText,{selectedIds=[],roomCode,release=false,placements}={}){
 const ids=new Set(selectedIds.map(String)),pool=preview.pool;
 assertElectiveLayoutEditable(preview);
 if(groupText!==null)validateGroupSbdSequence(pool,groupText);
 if([...ids].some(id=>!pool.some(c=>String(c.id??c.candidate_id)===id)))throw new Error('Học sinh không thuộc phương án này.');
 const privateRooms=preview.result.rooms.filter(r=>r.is_private).map(r=>({...r}));
 if(placements)for(const [id,code] of placements){
  if(!pool.some(c=>String(c.id??c.candidate_id)===String(id)))throw new Error('Học sinh không thuộc phương án này.');
  if(!code||code.length>100||preview.result.rooms.some(r=>r.room_code===code&&!r.is_private))throw new Error('Tên phòng riêng trống, quá 100 ký tự hoặc trùng phòng thường.');
  if(!privateRooms.some(r=>r.room_code===code))privateRooms.push({room_code:code,is_private:true});
 }
 if(roomCode){
  roomCode=String(roomCode).trim();
  if(!roomCode||preview.result.rooms.some(r=>r.room_code===roomCode&&!r.is_private))throw new Error('Tên phòng riêng trống hoặc trùng phòng thường.');
  if(!privateRooms.some(r=>r.room_code===roomCode))privateRooms.push({room_code:roomCode,is_private:true});
 }
 const privateCodes=new Set(privateRooms.map(r=>r.room_code));
 const locked=new Map(preview.result.assignments.filter(a=>privateCodes.has(a.room_code)).map(a=>[String(a.candidate_id),a.room_code]));
 for(const id of ids){if(release)locked.delete(id);else if(roomCode)locked.set(id,roomCode)}
 if(placements)for(const [id,code] of placements)locked.set(String(id),code);
 const assignments=[],occupied=[];
 for(const room of privateRooms){
  const members=pool.filter(c=>locked.get(String(c.id??c.candidate_id))===room.room_code),rows=[];
  for(const c of members){
   const row=preview.planType==='elective'?{...c,candidate_id:c.id??c.candidate_id,room_code:room.room_code,ca1_subject_code:c.elective_subjects[0],ca2_subject_code:c.elective_subjects[1]}:{...c,candidate_id:c.id??c.candidate_id,room_code:room.room_code,subject_code:preview.subjectCode};
   if(!row)throw new Error(`Không thể ghép môn hai ca trong phòng ${room.room_code}.`);
   rows.push(row);
  }
  if(rows.length){occupied.push({...room,student_count:rows.length});assignments.push(...rows)}
 }
 const remaining=pool.filter(c=>!locked.has(String(c.id??c.candidate_id)));
 const options={...preview.options,capacity:preview.options.regularCapacity??preview.options.capacity,roomPrefix:'__regular_',sortMode:'sbd'};
 const optimize=preview.planType==='elective'?optimizeElectiveRooms:optimizeMandatoryRooms;
 const regular=remaining.length?(groupText===null?optimize(remaining,options):optimizeByGroups(remaining,options,groupText,optimize)):{ok:true,rooms:[],assignments:[]};
 if(!regular.ok)throw new Error(regular.errors.join(' '));
 const used=new Set(occupied.map(r=>r.room_code)),available=preview.result.rooms.filter(r=>!r.is_private);
 for(const room of regular.rooms){
  const old=room.room_code,reuse=available.find(r=>!used.has(r.room_code)&&(groupText===null||r.group_index===room.group_index));
  let code=reuse?.room_code,index=1;
  if(!code){do{code=`${preview.options.roomPrefix}${String(index++).padStart(2,'0')}`}while(used.has(code)||available.some(r=>r.room_code===code))}
  used.add(code);room.room_code=code;
  for(const row of regular.assignments)if(row.room_code===old)row.room_code=code;
 }
 const capacity=Math.max(preview.options.capacity,...occupied.map(r=>r.student_count));
 const result={ok:true,rooms:[...regular.rooms,...occupied].map((r,i)=>({...r,room_number:i+1,capacity,regular_capacity:options.capacity})),assignments:[...regular.assignments,...assignments],summary:{}};
 return preview.planType==='elective'?applyFixedSubjectSlots(normalizeDraftRoomNames(result,preview.options),preview.result.rooms[0]?.fixed_subject_slots||{}):result;
}

export function importPrivateRoomRows(preview,groupText,rows){
 if(preview.finalized||preview.saving||preview.finalizing||preview.options.fixedSeats)throw new Error('Phương án đang khóa hoặc kế thừa vị trí cố định, không thể nhập phòng riêng.');
 if(preview.planType!=='elective'&&preview.pool.some(c=>!isValidSbd(c.sbd)))throw new Error('Hãy cấp SBD trước khi nhập phòng riêng cho môn bắt buộc.');
 const byCode=new Map();
 for(const c of preview.pool){const code=String(c.student_code??'').trim();if(!code||byCode.has(code))throw new Error('Mã học sinh trong phương án bị thiếu hoặc trùng.');byCode.set(code,c)}
 const seen=new Set(),placements=new Map();
 for(const [i,row] of rows.entries()){
  const code=String(row.student_code??'').trim(),room=String(row.phong_rieng??'').trim();
  if(!code&&!room)continue;
  const c=byCode.get(code);
  if(!c||seen.has(code))throw new Error(`Dòng ${i+2}: mã học sinh không thuộc phương án hoặc bị lặp.`);
  seen.add(code);if(room)placements.set(String(c.id??c.candidate_id),room);
 }
 if(!placements.size)throw new Error('Chưa điền tên phòng trong cột phong_rieng.');
 return redistributePrivateRooms(preview,groupText,{placements});
}
