export const manualSubjects=[['TOAN','Toán',90],['VAN','Ngữ văn',120],['N1','Tiếng Anh',60],['LY','Vật lí',45],['HOA','Hóa học',45],['SINH','Sinh học',45],['TIN','Tin học',45],['SU','Lịch sử',45],['DIA','Địa lí',45],['KTPL','KTPL',45]];
const idOf=c=>String(c.id??c.candidate_id);
const compare=(a,b)=>String(a||'').localeCompare(String(b||''),'vi',{numeric:true});
export function manualNameCompare(a,b){
 const parts=s=>String(s||'').normalize('NFC').trim().split(/\s+/),x=parts(a.student_name),y=parts(b.student_name);
 return compare(x.at(-1),y.at(-1))||compare(x.slice(1,-1).join(' '),y.slice(1,-1).join(' '))||compare(x[0],y[0])||compare(a.student_code,b.student_code)||compare(idOf(a),idOf(b));
}
export function manualExamDefaults(){
 return {print_authority:'',print_institution:'',print_title:'',groups:[{id:'G1',name:'12A1–12A6',classes:Array.from({length:6},(_,i)=>'12A'+(i+1)),subjects:['TOAN','VAN','N1','LY','HOA','SINH','TIN']},{id:'G2',name:'12A7–12A12',classes:Array.from({length:6},(_,i)=>'12A'+(i+7)),subjects:['TOAN','VAN','N1','SU','DIA','KTPL']}],subjects:manualSubjects.map(([code,name,minutes])=>({code,name,minutes,form:code==='VAN'?'essay':'mcq'})),prefix:'11',digits:8,small_capacity:26,large_capacity:48,private_capacity:26,
 sessions:[{id:'T',name:'Toán',date:'',start1:'07:30',start2:'09:45',last:[]},{id:'V',name:'Ngữ văn',date:'',start1:'07:30',start2:'10:00',last:[]},{id:'C',name:'Hai môn chọn chia phòng',date:'',start1:'07:30',start2:'08:30',last:['N1']},{id:'R1',name:'Môn còn lại — buổi 1',date:'',start1:'07:30',start2:'08:30',last:['N1']},{id:'R2',name:'Môn còn lại — buổi 2',date:'',start1:'07:30',start2:'08:30',last:['N1']},{id:'R3',name:'Môn còn lại — buổi 3',date:'',start1:'07:30',start2:'08:30',last:['N1']}],core:{TOAN:{session:'T',slot:1},VAN:{session:'V',slot:1}},chosen_session:'C',remaining:[{group:'G1',subject:'N1',session:'R1',slot:2},{group:'G1',subject:'LY',session:'R1',slot:1},{group:'G1',subject:'HOA',session:'R2',slot:1},{group:'G1',subject:'SINH',session:'R2',slot:2},{group:'G1',subject:'TIN',session:'R3',slot:1},{group:'G2',subject:'N1',session:'R1',slot:2},{group:'G2',subject:'SU',session:'R1',slot:1},{group:'G2',subject:'DIA',session:'R2',slot:1},{group:'G2',subject:'KTPL',session:'R2',slot:2}],grading_start:'',grading_end:''};
}
export function manualGroupFor(c,config){const groups=config.groups.filter(g=>g.classes.includes(c.class_code));if(groups.length!==1)throw new Error(`Lớp ${c.class_code} phải thuộc đúng một nhóm.`);return groups[0]}
export function numberManualCandidates(candidates,config){
 if(!/^\d{2,3}$/.test(config.prefix)||![6,8].includes(Number(config.digits)))throw new Error('SBD dùng tiền tố 2–3 chữ số và tổng 6 hoặc 8 chữ số.');
 const ids=new Set(),classes=new Set();for(const g of config.groups)for(const cls of g.classes){if(classes.has(cls))throw new Error(`Lớp ${cls} trùng nhóm.`);classes.add(cls)}
 for(const c of candidates){if(ids.has(idOf(c)))throw new Error('Trùng học sinh.');ids.add(idOf(c));manualGroupFor(c,config)}
 const ordered=config.groups.flatMap(g=>candidates.filter(c=>g.classes.includes(c.class_code)).sort(manualNameCompare)),width=Number(config.digits)-config.prefix.length;
 if(ordered.length>=10**width)throw new Error('Không đủ dải số báo danh.');
 return Object.fromEntries(ordered.map((c,i)=>[idOf(c),config.prefix+String(i+1).padStart(width,'0')]));
}
function timestamp(session,slot){
 const start=slot===1?session.start1:session.start2;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(session.date)||!/^\d{2}:\d{2}$/.test(start||''))throw new Error(`Nhập ngày và giờ cho buổi ${session.name}.`);
 const time=Date.parse(session.date+'T'+start+':00+07:00');if(!Number.isFinite(time))throw new Error('Ngày/giờ buổi thi không hợp lệ.');return time;
}
export function validateManualPlan(payload,candidates){
 const {config,choices,sbds,rooms,entries}=payload;
 if(!candidates.length)throw new Error('Kỳ thi chưa có học sinh.');
 if(!Number.isInteger(config.small_capacity)||config.small_capacity<1||config.small_capacity>26||!Number.isInteger(config.large_capacity)||config.large_capacity<44||config.large_capacity>48)throw new Error('Phòng nhỏ tối đa 26; sức chứa phòng lớn từ 44 đến 48.');
 const expectedSbds=numberManualCandidates(candidates,config);for(const c of candidates)if(sbds[idOf(c)]!==expectedSbds[idOf(c)])throw new Error('SBD phải liên tục theo thứ tự nhóm và tên học sinh.');
 const sessionMap=new Map(config.sessions.map(s=>[s.id,s]));if(sessionMap.size!==config.sessions.length)throw new Error('Mã buổi bị trùng.');
 const roomMap=new Map(rooms.map(r=>[r.id,r]));if(roomMap.size!==rooms.length)throw new Error('Mã phòng phân bổ bị trùng.');
 const subjectMap=new Map(config.subjects.map(s=>[s.code,s]));
 for(const subject of subjectMap.values())if(subject.form!==(subject.code==='VAN'?'essay':'mcq')||!Number.isInteger(subject.minutes)||subject.minutes<1)throw new Error('Chỉ Ngữ văn tự luận; các môn khác trắc nghiệm. Thời lượng phải là số phút nguyên dương.');
 const candidateMap=new Map(candidates.map(c=>[idOf(c),c])),seen=new Set(),times=new Map(),roomTimes=new Map();
 for(const c of candidates){const g=manualGroupFor(c,config),selected=choices[idOf(c)]||[];if(selected.length!==2||new Set(selected).size!==2||selected.some(code=>['TOAN','VAN'].includes(code)||!g.subjects.includes(code)))throw new Error(`${c.student_name}: chọn đúng hai môn ngoài Toán/Văn thuộc nhóm.`)}
 for(const entry of entries){
  const c=candidateMap.get(String(entry.candidate_id)),room=roomMap.get(entry.room_id),session=sessionMap.get(entry.session),subject=subjectMap.get(entry.subject);
  if(!c||!room||!session||!subject||![1,2].includes(Number(entry.slot)))throw new Error('Phân bổ có học sinh, phòng, buổi hoặc môn không hợp lệ.');
  const group=manualGroupFor(c,config),selected=choices[idOf(c)],core=['TOAN','VAN'].includes(entry.subject),kind=core?'core':selected.includes(entry.subject)?'chosen':'remaining';
  if(!group.subjects.includes(entry.subject)||entry.kind!==kind||room.group!==group.id||room.kind!==kind)throw new Error('Sai nhóm lớp hoặc hình thức thi.');
  const schedule=core?config.core[entry.subject]:kind==='chosen'?{session:config.chosen_session}:config.remaining.find(r=>r.group===group.id&&r.subject===entry.subject);
  if(!schedule||entry.session!==schedule.session||(schedule.slot&&Number(entry.slot)!==Number(schedule.slot)))throw new Error('Phân bổ không khớp lịch thi.');
  if((session.last||[]).includes(entry.subject)&&Number(entry.slot)!==2)throw new Error(`${subject.name} phải thi ca cuối của buổi ${session.name}.`);
  if(room.is_private&&kind==='remaining')throw new Error('Phòng riêng không áp dụng cho môn còn lại.');
  const key=idOf(c)+'|'+entry.subject;if(seen.has(key))throw new Error('Một học sinh bị xếp trùng môn.');seen.add(key);
  const begin=timestamp(session,Number(entry.slot)),end=begin+subject.minutes*60000,list=times.get(idOf(c))||[];
  if(Number(entry.slot)===2&&begin<=timestamp(session,1))throw new Error(`Ca 2 phải bắt đầu sau ca 1: ${session.name}.`);
  if(list.some(t=>begin<t.end&&end>t.begin))throw new Error(`${c.student_name} bị trùng thời gian thi.`);list.push({begin,end});times.set(idOf(c),list);
  const roomList=roomTimes.get(room.code)||[];for(const previous of roomList)if(previous.room_id!==room.id&&begin<previous.end&&end>previous.begin)throw new Error(`Phòng ${room.code} được dùng trùng thời gian.`);
  roomList.push({room_id:room.id,begin,end});roomTimes.set(room.code,roomList);
 }
 for(const c of candidates)for(const code of manualGroupFor(c,config).subjects)if(!seen.has(idOf(c)+'|'+code))throw new Error(`${c.student_name} chưa được xếp môn ${code}.`);
 for(const room of rooms){
  const rows=entries.filter(e=>e.room_id===room.id),ids=new Set(rows.map(e=>String(e.candidate_id))),capacity=Number(room.capacity),limit=room.kind==='remaining'?48:26;
  if(!room.code||!rows.length||!Number.isInteger(capacity)||capacity<1||capacity>limit||(room.kind==='remaining'&&capacity<44)||ids.size>capacity)throw new Error(`Phòng ${room.code} vượt sức chứa hoặc chưa hợp lệ.`);
  if(!config.groups.some(g=>g.id===room.group))throw new Error('Phòng chưa thuộc nhóm.');
  const perSlot=new Map();for(const e of rows){const key=e.session+'|'+e.slot;if(!perSlot.has(key))perSlot.set(key,[]);perSlot.get(key).push(e)}
  for(const same of perSlot.values()){
   if(new Set(same.map(e=>String(e.candidate_id))).size!==same.length)throw new Error('Học sinh trùng ca trong phòng.');
   if(same.some(e=>e.subject==='N1')&&same.some(e=>e.subject!=='N1'))throw new Error(`Phòng ${room.code}: phần nghe Tiếng Anh không trộn môn khác cùng ca.`);
   const seats=same.map(e=>Number(e.seat)).sort((a,b)=>a-b);if(seats.some((n,i)=>n!==i+1))throw new Error('Vị trí trong phòng phải liên tục từ 1.');
  }
 }
 return true;
}
export function generateManualPlan(config,candidates,choices,privateNames={}){
 for(const [key,max,min] of [['small_capacity',26,1],['large_capacity',48,44],['private_capacity',26,1]])if(!Number.isInteger(config[key])||config[key]<min||config[key]>max)throw new Error('Kiểm tra sức chứa: phòng nhỏ/riêng 1–26, phòng lớn 44–48.');
 const sbds=numberManualCandidates(candidates,config),rooms=[],entries=[],pools=new Map();
 const ordered=[...candidates].sort((a,b)=>compare(sbds[idOf(a)],sbds[idOf(b)]));
 for(const c of ordered){
  const id=idOf(c),g=manualGroupFor(c,config),pair=choices[id]||[],session=config.sessions.find(s=>s.id===config.chosen_session);
  if(pair.length!==2||new Set(pair).size!==2||pair.some(s=>['TOAN','VAN'].includes(s)||!g.subjects.includes(s)))throw new Error(`${c.student_name}: chọn đúng hai môn chia phòng.`);
  if(!session)throw new Error('Chưa chọn buổi thi hai môn lựa chọn.');
  const sorted=[...pair].sort(compare),last=sorted.filter(s=>(session.last||[]).includes(s));if(last.length>1)throw new Error('Hai môn cùng bắt buộc ca cuối không thể là một cặp lựa chọn.');
  const ca2=last[0]||sorted[1],ca1=sorted.find(s=>s!==ca2),priv=String(privateNames[id]||'').trim();
  for(const kind of ['core','chosen','remaining']){
   const tasks=kind==='core'?['TOAN','VAN'].map(subject=>({subject,...config.core[subject]})):kind==='chosen'?[{subject:ca1,session:config.chosen_session,slot:1},{subject:ca2,session:config.chosen_session,slot:2}]:g.subjects.filter(s=>!['TOAN','VAN',...pair].includes(s)).map(subject=>{const schedule=config.remaining.find(r=>r.group===g.id&&r.subject===subject);if(!schedule)throw new Error('Thiếu lịch môn '+subject);return {...schedule,subject}});
   const bundles=kind==='remaining'?tasks.map(t=>[t]):[tasks];
   for(const bundle of bundles){const signature=kind==='core'?'TV':bundle.map(t=>`${t.subject}:${t.session}:${t.slot}`).join('_'),special=priv&&kind!=='remaining';
    const key=[g.id,kind,special?'PRIVATE':signature,special?priv:''].join('|');if(!pools.has(key))pools.set(key,{g,kind,bundle,special,priv,students:[],tasks:new Map()});pools.get(key).students.push(c);pools.get(key).tasks.set(id,bundle);
   }
  }
 }
 let index=0;for(const pool of pools.values()){
  const capacity=pool.kind==='remaining'?config.large_capacity:pool.special?config.private_capacity:config.small_capacity;
  if(pool.special&&pool.students.length>capacity)throw new Error(`Phòng riêng ${pool.priv} vượt sức chứa.`);
  for(let start=0;start<pool.students.length;start+=capacity){const members=pool.students.slice(start,start+capacity),id='R'+(++index),code=pool.special?`${pool.g.id}-${pool.priv}`:`${pool.g.id}-${pool.kind==='remaining'?'L':'N'}${String(index).padStart(2,'0')}`;
   rooms.push({id,code,group:pool.g.id,kind:pool.kind,is_private:!!pool.special,capacity,pool:JSON.stringify([pool.g.id,pool.kind,pool.bundle])});
   members.forEach((c,i)=>{for(const task of pool.tasks.get(idOf(c)))entries.push({candidate_id:idOf(c),subject:task.subject,session:task.session,slot:Number(task.slot),room_id:id,kind:pool.kind,seat:i+1})});
  }
 }
 const payload={config,choices,privateNames,sbds,rooms,entries};validateManualPlan(payload,candidates);return payload;
}
export function addManualRoom(payload,candidates,poolRoomId,code){
 const copy=structuredClone(payload),source=copy.rooms.find(r=>r.id===poolRoomId);
 if(!source||source.is_private||!String(code||'').trim()||copy.rooms.some(r=>r.code===String(code).trim()))throw new Error('Chọn phòng thường và nhập tên phòng mới không trùng.');
 const pool=copy.rooms.filter(r=>r.pool===source.pool&&!r.is_private),count=r=>new Set(copy.entries.filter(e=>e.room_id===r.id).map(e=>e.candidate_id)).size,donor=[...pool].reverse().find(r=>count(r)>1);
 if(!donor)throw new Error('Không còn phòng có trên một học sinh để tách thêm.');
 const id='R'+(Math.max(0,...copy.rooms.map(r=>Number(r.id.slice(1))||0))+1);
 copy.rooms.push({...source,id,code:String(code).trim()});return adjustManualRoom(copy,candidates,donor.id,count(donor)-1);
}
export function importManualChoices(rows,candidates,config,choices={},privateNames={}){
 const next=structuredClone(choices),privateNext=structuredClone(privateNames),seen=new Set(),byCode=new Map();
 for(const c of candidates){const code=String(c.student_code||'').trim();if(byCode.has(code))throw new Error('Mã học sinh bị trùng trong kỳ, không nhập theo họ tên.');byCode.set(code,c)}
 const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const subjects=new Map(config.subjects.flatMap(s=>[[normalize(s.code),s.code],[normalize(s.name),s.code]]));subjects.set('ANH','N1');subjects.set('GDKTPL','KTPL');
 for(const row of rows){const code=String(row.student_code??'').trim(),c=byCode.get(code);if(!c)throw new Error('Không tìm thấy mã học sinh '+code);if(seen.has(code))throw new Error('Lặp mã học sinh '+code);seen.add(code);
  const pair=[subjects.get(normalize(row.mon1)),subjects.get(normalize(row.mon2))],group=manualGroupFor(c,config);
  if(pair.some(s=>!s||['TOAN','VAN'].includes(s)||!group.subjects.includes(s))||pair[0]===pair[1])throw new Error(`Mã ${code}: hai môn chọn không hợp lệ với nhóm lớp.`);
  next[idOf(c)]=pair;if(Object.hasOwn(row,'phong_rieng'))privateNext[idOf(c)]=String(row.phong_rieng||'').trim();
 }
 return {choices:next,privateNames:privateNext,count:seen.size};
}
export function adjustManualRoom(payload,candidates,roomId,count){
 const copy=structuredClone(payload),room=copy.rooms.find(r=>r.id===roomId);count=Number(count);
 if(!room||room.is_private)throw new Error('Phòng riêng chỉnh bằng danh sách thành viên trước khi lập phòng.');
 if(!Number.isInteger(count)||count<1||count>room.capacity)throw new Error('Sĩ số điều chỉnh phải từ 1 đến sức chứa phòng.');
 const pool=copy.rooms.filter(r=>r.pool===room.pool&&!r.is_private),at=pool.indexOf(room),tail=pool.slice(at),ids=new Set(tail.map(r=>r.id));
 const members=r=>[...new Map(copy.entries.filter(e=>e.room_id===r.id).sort((a,b)=>a.seat-b.seat).map(e=>[e.candidate_id,e])).keys()];
 const list=tail.flatMap(members),tasks=copy.entries.filter(e=>e.room_id===room.id&&e.candidate_id===list[0]).map(e=>({...e}));
 if(count===members(room).length)return copy;
 if(at===pool.length-1)throw new Error('Chỉnh phòng trước để cân đối phòng cuối.');
 if(count>list.length)throw new Error('Không đủ học sinh ở các phòng phía sau.');
 const quotas=tail.map((r,i)=>i===0?count:members(r).length);quotas[quotas.length-1]+=members(room).length-count;
 if(quotas.at(-1)>tail.at(-1).capacity)throw new Error('Phòng cuối vượt sức chứa. Hãy thêm phòng hoặc tăng sức chứa trong giới hạn cho phép.');
 copy.entries=copy.entries.filter(e=>!ids.has(e.room_id));let offset=0;
 for(let i=0;i<tail.length;i++){const n=Math.max(0,Math.min(quotas[i],list.length-offset)),chunk=list.slice(offset,offset+n);offset+=n;
  if(!chunk.length){copy.rooms=copy.rooms.filter(r=>r.id!==tail[i].id);continue}
  for(const task of tasks)chunk.forEach((id,j)=>copy.entries.push({...task,candidate_id:id,room_id:tail[i].id,seat:j+1}));
 }
 if(offset!==list.length)throw new Error('Không thể cân đối toàn bộ học sinh.');validateManualPlan(copy,candidates);return copy;
}
