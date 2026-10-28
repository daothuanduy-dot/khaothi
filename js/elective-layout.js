// Orient every connected subject component together, including private rooms.
export function applyFixedSubjectSlots(result,fixed={}){
 for(const [code,slot] of Object.entries(fixed))if(!code||![1,2].includes(slot))throw new Error('Ca cố định phải là 1 hoặc 2.');
 const copy=structuredClone(result);
 for(const room of copy.rooms){
  const rows=copy.assignments.filter(a=>a.room_code===room.room_code),graph=new Map(),colors=new Map();
  for(const row of rows){const a=row.ca1_subject_code,b=row.ca2_subject_code;if(!a||!b||a===b)throw new Error('Học sinh phải có hai môn khác nhau.');for(const [x,y] of [[a,b],[b,a]]){if(!graph.has(x))graph.set(x,new Set());graph.get(x).add(y)}}
  for(const root of graph.keys()){
   if(colors.has(root))continue;
   const component=[],queue=[root];colors.set(root,1);
   for(let i=0;i<queue.length;i++){const x=queue[i];component.push(x);for(const y of graph.get(x)){const color=3-colors.get(x);if(colors.has(y)){if(colors.get(y)!==color)throw new Error(`Phòng ${room.room_code}: các cặp môn không thể chia thành hai ca.`)}else{colors.set(y,color);queue.push(y)}}}
   const flips=new Set(component.filter(x=>fixed[x]).map(x=>fixed[x]!==colors.get(x)));
   if(flips.size>1)throw new Error(`Phòng ${room.room_code}: không đáp ứng ca cố định. Hãy đổi thành viên phòng hoặc cấu hình ca.`);
   if(flips.has(true))for(const x of component)colors.set(x,3-colors.get(x));
  }
  for(const row of rows)if(colors.get(row.ca1_subject_code)===2)[row.ca1_subject_code,row.ca2_subject_code]=[row.ca2_subject_code,row.ca1_subject_code];
  room.fixed_subject_slots={...fixed};
  for(const slot of [1,2]){const codes=[...new Set(rows.map(a=>a[`ca${slot}_subject_code`]))].sort();room[`ca${slot}_subject_codes`]=codes;}
 }
 return copy;
}

export function assertElectiveLayoutEditable(preview){
 if(preview.planType==='elective'&&(preview.pool.some(c=>String(c.sbd||'').trim())||preview.result.assignments.some(a=>String(a.sbd||'').trim())))throw new Error('Phương án đã có SBD. Muốn đổi phòng/ca, hãy xóa SBD và lập lại phòng trước, sau đó cấp SBD theo phòng đã lưu.');
}

export function normalizeDraftRoomNames(result,{roomPrefix='P',firstRoomNumber=1}={}){
 const copy=structuredClone(result),privateRooms=copy.rooms.filter(r=>r.is_private).sort((a,b)=>a.room_code.localeCompare(b.room_code,'vi',{numeric:true})),used=new Set(privateRooms.map(r=>r.room_code));let n=Number(firstRoomNumber)||1;
 const replacements=new Map();
 for(const room of copy.rooms.filter(r=>!r.is_private)){let code;do{code=roomPrefix+String(n++).padStart(2,'0')}while(used.has(code));used.add(code);replacements.set(room.room_code,code);room.room_code=code}
 const seats=new Map();for(const row of copy.assignments){if(replacements.has(row.room_code))row.room_code=replacements.get(row.room_code);const seat=(seats.get(row.room_code)||0)+1;seats.set(row.room_code,seat);row.seat_number=seat}
 copy.rooms=[...copy.rooms.filter(r=>!r.is_private),...privateRooms].map((r,i)=>({...r,room_number:i+1}));return copy;
}
