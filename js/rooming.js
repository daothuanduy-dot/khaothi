export const SUBJECTS = [
  {code:'ANH', name:'Tiếng Anh'},
  {code:'SU', name:'Lịch sử'},
  {code:'DIA', name:'Địa lí'},
  {code:'GDKTPL', name:'Giáo dục kinh tế và pháp luật'},
  {code:'KTPL', name:'Giáo dục kinh tế và pháp luật'},
  {code:'LY', name:'Vật lí'},
  {code:'HOA', name:'Hóa học'},
  {code:'SINH', name:'Sinh học'},
  {code:'TIN', name:'Tin học'}
];

const nameOf = code => SUBJECTS.find(s => s.code === String(code||'').toUpperCase())?.name || String(code||'');
const normalize = s => String(s||'').normalize('NFC').trim();
const cmpName = (a,b) => normalize(a.student_name).localeCompare(normalize(b.student_name),'vi',{sensitivity:'base'}) ||
  String(a.student_code||a.sbd||'').localeCompare(String(b.student_code||b.sbd||''),'vi',{numeric:true});
const cmpSbd = (a,b) => String(a.sbd||a.student_code||'').localeCompare(String(b.sbd||b.student_code||''),'vi',{numeric:true});

export function optimizeElectiveRooms(candidates, options={}) {
  const capacity = Math.floor(Number(options.capacity || 24));
  const prefix = String(options.roomPrefix || 'P').trim() || 'P';
  const first = Math.floor(Number(options.firstRoomNumber || 1));
  const sortMode = options.sortMode || 'abc';
  const errors = [];
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 100) errors.push('Sức chứa phòng phải từ 1 đến 100.');
  if (!Number.isFinite(first) || first < 1) errors.push('Số phòng bắt đầu phải lớn hơn 0.');
  if (!Array.isArray(candidates) || !candidates.length) errors.push('Không có thí sinh đủ điều kiện.');
  if (errors.length) return {ok:false, errors};

  // Group by unordered subject pair, not by Môn 1/Môn 2 order.
  // Students who selected ANH-LY and LY-ANH can sit together in one room.
  const pairGroups = new Map();
  for (const c of candidates) {
    const raw = Array.isArray(c.elective_subjects) ? c.elective_subjects : [];
    const pair = [...new Set(raw.map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))];
    if (pair.length !== 2) {
      errors.push(`${c.student_code||c.sbd||c.id}: cần đăng ký đúng hai môn khác nhau.`);
      continue;
    }
    const sortedPair = [...pair].sort();
    const key = sortedPair.join('|');
    if (!pairGroups.has(key)) pairGroups.set(key,{key,pair:sortedPair,students:[]});
    pairGroups.get(key).students.push({...c,_originalPair:pair});
  }
  if (errors.length) return {ok:false,errors};

  const groups = [...pairGroups.values()];
  // Put the largest combinations first; this makes room numbers easier to audit
  // and ensures full rooms are allocated before smaller remainder rooms.
  groups.sort((a,b)=>b.students.length-a.students.length || a.key.localeCompare(b.key));
  const rooms=[], assignments=[];
  let roomIndex=first;
  for (const group of groups) {
    const students=group.students;
    if (sortMode==='previous') {
      students.sort((a,b)=>Number(b.previous_score)-Number(a.previous_score) || cmpName(a,b));
    } else if (sortMode==='abc') {
      students.sort(cmpName);
    } else {
      students.sort(cmpSbd);
    }
    for (let offset=0; offset<students.length; offset+=capacity) {
      const chunk=students.slice(offset,offset+capacity);
      // Choose the most common original direction for this room, then swap the
      // remaining students when needed. This keeps a room to exactly two subjects.
      const directions=new Map();
      for(const s of chunk){
        const p=s._originalPair;
        const dir=p[0]===group.pair[0] ? `${p[0]}|${p[1]}` : `${p[1]}|${p[0]}`;
        directions.set(dir,(directions.get(dir)||0)+1);
      }
      const direction=[...directions.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||`${group.pair[0]}|${group.pair[1]}`;
      const [ca1,ca2]=direction.split('|');
      const roomCode=`${prefix}${String(roomIndex).padStart(2,'0')}`;
      const assigned=chunk.map(s=>{
        const a={
          candidate_id:s.id,
          sbd:String(s.sbd||s.student_code||''),
          student_code:String(s.student_code||''),
          student_name:String(s.student_name||''),
          class_code:String(s.class_code||''),
          room_code:roomCode,
          ca1_subject_code:ca1,
          ca2_subject_code:ca2,
          previous_score: s.previous_score ?? null
        };
        assignments.push(a); return a;
      });
      const sbds=assigned.map(a=>a.sbd).sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
      rooms.push({
        room_number:roomIndex,
        room_code:roomCode,
        student_count:assigned.length,
        capacity,
        ca1_subject_code:ca1,
        ca2_subject_code:ca2,
        ca1_subject_name:nameOf(ca1),
        ca2_subject_name:nameOf(ca2),
        sbd_first:sbds[0]||'',
        sbd_last:sbds[sbds.length-1]||'',
        candidate_ids:assigned.map(a=>a.candidate_id)
      });
      roomIndex++;
    }
  }
  assignments.sort((a,b)=>Number(a.room_code.replace(prefix,''))-Number(b.room_code.replace(prefix,'')) || cmpSbd(a,b));
  const pairCount=groups.length;
  return {
    ok:true,
    rooms,
    assignments,
    summary:{
      candidate_count:assignments.length,
      room_count:rooms.length,
      capacity,
      pair_count:pairCount,
      full_rooms:rooms.filter(r=>r.student_count===capacity).length,
      partial_rooms:rooms.filter(r=>r.student_count<capacity).length
    }
  };
}
