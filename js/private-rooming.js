import {optimizeByGroups,validateGroupSbdSequence} from './group-rooming.js?v=158';
import {optimizeMandatoryRooms,optimizeElectiveRooms,assignElectiveCandidateToRoom} from './rooming.js?v=158';

// Build a complete replacement before changing the preview, so a failed move is atomic.
export function redistributePrivateRooms(preview,groupText,{selectedIds=[],roomCode,release=false}={}){
 const ids=new Set(selectedIds.map(String)),pool=preview.pool;
 if(groupText!==null)validateGroupSbdSequence(pool,groupText);
 if([...ids].some(id=>!pool.some(c=>String(c.id??c.candidate_id)===id)))throw new Error('Học sinh không thuộc phương án này.');
 const privateRooms=preview.result.rooms.filter(r=>r.is_private).map(r=>({...r}));
 if(roomCode){
  roomCode=String(roomCode).trim();
  if(!roomCode||preview.result.rooms.some(r=>r.room_code===roomCode&&!r.is_private))throw new Error('Tên phòng riêng trống hoặc trùng phòng thường.');
  if(!privateRooms.some(r=>r.room_code===roomCode))privateRooms.push({room_code:roomCode,is_private:true});
 }
 const privateCodes=new Set(privateRooms.map(r=>r.room_code));
 const locked=new Map(preview.result.assignments.filter(a=>privateCodes.has(a.room_code)).map(a=>[String(a.candidate_id),a.room_code]));
 for(const id of ids){if(release)locked.delete(id);else if(roomCode)locked.set(id,roomCode)}
 const assignments=[],occupied=[];
 for(const room of privateRooms){
  const members=pool.filter(c=>locked.get(String(c.id??c.candidate_id))===room.room_code),rows=[];
  for(const c of members){
   const row=preview.planType==='elective'?assignElectiveCandidateToRoom(c,rows,room.room_code):{...c,candidate_id:c.id??c.candidate_id,room_code:room.room_code,subject_code:preview.subjectCode};
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
 return {ok:true,rooms:[...regular.rooms,...occupied].map((r,i)=>({...r,room_number:i+1,capacity,regular_capacity:options.capacity})),assignments:[...regular.assignments,...assignments],summary:{}};
}
