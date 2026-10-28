import {manualNameCompare,manualGroupFor,validateManualPlan} from './manual-exam-engine.js?v=175';
const id=c=>String(c.id??c.candidate_id);
const roomNumber=r=>r.is_private?23:Number(r.code);
export function buildChoiceRooms(config,candidates,choices,privateNames={}){
 if(!candidates.length)throw new Error('Kỳ thi chưa có học sinh.');
 config=structuredClone(config);config.room_first=true;
 if(!Number.isInteger(config.small_capacity)||config.small_capacity<1||config.small_capacity>26)throw new Error('Sức chứa phòng thường từ 1 đến 26.');
 const session=config.sessions.find(s=>s.id===config.chosen_session);if(!session)throw new Error('Chọn buổi hai môn lựa chọn.');
 const hall=[],pools=config.groups.map(g=>({group:g.id,students:[]})),tasks=new Map();
 for(const c of candidates){const group=manualGroupFor(c,config),pair=choices[id(c)]||[];
  if(pair.length!==2||new Set(pair).size!==2||pair.some(s=>['TOAN','VAN'].includes(s)||!group.subjects.includes(s)))throw new Error(`${c.student_name}: chọn đúng hai môn thuộc nhóm, ngoài Toán/Văn.`);
  const last=pair.filter(s=>s==='N1'||(session.last||[]).includes(s));if(last.length>1)throw new Error('Hai môn cùng bắt buộc ca cuối không thể chung cặp.');
  const sorted=[...pair].sort(),second=last[0]||sorted[1];tasks.set(id(c),[sorted.find(s=>s!==second),second]);
  (String(privateNames[id(c)]||'').trim()?hall:pools.find(p=>p.group===group.id).students).push(c);
 }
 const rooms=[],entries=[];let index=0;
 function add(students,group,isPrivate){
  const code=isPrivate?'Hội trường':String(++index);if(index>22)throw new Error('Vượt 22 phòng thường. Điều chỉnh sĩ số hoặc danh sách Hội trường trước khi tiếp tục.');
  const room={id:'CH'+code,code,group,kind:'chosen',is_private:isPrivate,capacity:isPrivate?Math.max(1,students.length):config.small_capacity,pool:'chosen|'+group};rooms.push(room);
  students.forEach((c,i)=>tasks.get(id(c)).forEach((subject,j)=>entries.push({candidate_id:id(c),subject,session:session.id,slot:j+1,room_id:room.id,kind:'chosen',seat:i+1})));
 }
 for(const pool of pools){pool.students.sort((a,b)=>tasks.get(id(a)).join('|').localeCompare(tasks.get(id(b)).join('|'))||manualNameCompare(a,b));for(let i=0;i<pool.students.length;i+=config.small_capacity)add(pool.students.slice(i,i+config.small_capacity),pool.group,false)}
 if(hall.length)add(hall.sort(manualNameCompare),'*',true);
 return {config,choices:structuredClone(choices),privateNames:Object.fromEntries(hall.map(c=>[id(c),'Hội trường'])),rooms,entries,sbds:{},workflow_stage:'chosen'};
}
export function numberChoiceRooms(payload,candidates){
 const copy=structuredClone(payload),{prefix,digits}=copy.config;
 if(!/^\d{2,3}$/.test(prefix)||![6,8].includes(Number(digits)))throw new Error('SBD dùng tiền tố 2–3 chữ số và tổng 6 hoặc 8 chữ số.');
 const ordered=copy.rooms.filter(r=>r.kind==='chosen').sort((a,b)=>roomNumber(a)-roomNumber(b)).flatMap(r=>copy.entries.filter(e=>e.room_id===r.id&&Number(e.slot)===1).sort((a,b)=>a.seat-b.seat).map(e=>e.candidate_id));
 if(ordered.length!==candidates.length||new Set(ordered).size!==candidates.length||candidates.some(c=>!ordered.includes(id(c))))throw new Error('Phải phân đủ học sinh vào phòng lựa chọn trước khi đánh SBD.');
 const width=Number(digits)-prefix.length;if(ordered.length>=10**width)throw new Error('Không đủ dải số báo danh.');
 copy.sbds=Object.fromEntries(ordered.map((key,i)=>[key,prefix+String(i+1).padStart(width,'0')]));copy.workflow_stage='numbered';return copy;
}
export function buildCoreRooms(payload){
 const copy=structuredClone(payload);if(copy.entries.some(e=>!copy.sbds[e.candidate_id]))throw new Error('Đánh SBD theo phòng lựa chọn trước.');
 copy.rooms=copy.rooms.filter(r=>r.kind!=='core');copy.entries=copy.entries.filter(e=>e.kind!=='core');
 for(const r of copy.rooms.filter(r=>r.kind==='chosen')){
  const room={...r,id:'CORE'+r.id,kind:'core',pool:'core|'+r.group};copy.rooms.push(room);
  for(const e of copy.entries.filter(e=>e.room_id===r.id&&Number(e.slot)===1))for(const subject of ['TOAN','VAN'])copy.entries.push({...e,subject,...copy.config.core[subject],room_id:room.id,kind:'core'});
 }
 copy.workflow_stage='core';return copy;
}
export function buildRemainingRooms(payload,candidates){
 const copy=buildCoreRooms(payload),{config}=copy;copy.rooms=copy.rooms.filter(r=>r.kind!=='remaining');copy.entries=copy.entries.filter(e=>e.kind!=='remaining');
 if(!Number.isInteger(config.large_capacity)||config.large_capacity<44||config.large_capacity>48)throw new Error('Sức chứa phòng lớn từ 44 đến 48.');
 const used=new Map();let n=0;
 for(const g of config.groups)for(const subject of g.subjects.filter(s=>!['TOAN','VAN'].includes(s))){
  const students=candidates.filter(c=>g.classes.includes(c.class_code)&&!copy.choices[id(c)].includes(subject)).sort((a,b)=>copy.sbds[id(a)].localeCompare(copy.sbds[id(b)]));if(!students.length)continue;
  const schedule=config.remaining.find(t=>t.group===g.id&&t.subject===subject);if(!schedule)throw new Error('Thiếu lịch môn '+subject);
  const key=JSON.stringify([schedule.session,Number(schedule.slot)]);
  for(let at=0;at<students.length;at+=config.large_capacity){
   const code=(used.get(key)||0)+1;if(code>22)throw new Error('Môn còn lại vượt 22 phòng trong cùng buổi/ca. Điều chỉnh lịch trước khi tiếp tục.');used.set(key,code);
   const room={id:'REM'+(++n),code:String(code),group:g.id,kind:'remaining',is_private:false,capacity:config.large_capacity,pool:JSON.stringify([g.id,subject,schedule.session,schedule.slot])};copy.rooms.push(room);
   students.slice(at,at+config.large_capacity).forEach((c,i)=>copy.entries.push({candidate_id:id(c),subject,session:schedule.session,slot:Number(schedule.slot),room_id:room.id,kind:'remaining',seat:i+1}));
  }
 }
 copy.workflow_stage='complete';validateManualPlan(copy,candidates);return copy;
}
export function adjustChoiceRoom(payload,candidates,roomId,count){
 const copy=structuredClone(payload),room=copy.rooms.find(r=>r.id===roomId);count=Number(count);
 if(!room||room.kind!=='chosen'||room.is_private)throw new Error('Chỉ chỉnh sĩ số phòng lựa chọn thường; đổi Hội trường tại bước 2.');
 if(!Number.isInteger(count)||count<1||count>room.capacity)throw new Error('Sĩ số phải từ 1 đến sức chứa phòng.');
 const rooms=copy.rooms.filter(r=>r.kind==='chosen'&&!r.is_private&&r.group===room.group).sort((a,b)=>Number(a.code)-Number(b.code)),at=rooms.findIndex(r=>r.id===roomId),tail=rooms.slice(at);
 const rows=copy.entries.filter(e=>tail.some(r=>r.id===e.room_id)),members=r=>rows.filter(e=>e.room_id===r.id&&Number(e.slot)===1).sort((a,b)=>a.seat-b.seat).map(e=>e.candidate_id);
 const quotas=tail.map(r=>members(r).length),ids=tail.flatMap(members),old=quotas[0];
 if(count===old)return copy;
 if(tail.length<2)throw new Error('Chỉnh phòng trước để cân đối phòng cuối.');
 quotas[0]=count;quotas[quotas.length-1]+=old-count;
 if(quotas.at(-1)<0||quotas.at(-1)>tail.at(-1).capacity||count>ids.length)throw new Error('Phòng cuối không đủ sức chứa để điều chỉnh.');
 copy.entries=copy.entries.filter(e=>!tail.some(r=>r.id===e.room_id));let offset=0;
 tail.forEach((r,i)=>{for(const [seat,key] of ids.slice(offset,offset+quotas[i]).entries())for(const e of rows.filter(e=>e.candidate_id===key))copy.entries.push({...e,room_id:r.id,seat:seat+1});offset+=quotas[i];if(!quotas[i])copy.rooms=copy.rooms.filter(t=>t.id!==r.id)});
 const stage=payload.workflow_stage;
 copy.rooms=copy.rooms.filter(r=>r.kind==='chosen');copy.entries=copy.entries.filter(e=>e.kind==='chosen');copy.sbds={};copy.workflow_stage='chosen';
 if(stage==='chosen')return copy;
 const numbered=numberChoiceRooms(copy,candidates);if(stage==='numbered')return numbered;
 const core=buildCoreRooms(numbered);return stage==='complete'?buildRemainingRooms(core,candidates):core;
}
