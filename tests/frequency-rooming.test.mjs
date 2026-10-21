import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeElectiveRooms,allocateCandidatesToRoomPlan,orderElectiveRoomPlan,numberSavedElectiveRooms} from '../js/rooming.js';

function roster(blocks){
  const rows=[];
  for(const [first,second,count] of blocks)for(let i=0;i<count;i++){
    const id=String(rows.length+1);
    rows.push({id,student_name:`Student ${id}`,elective_subjects:[first,second]});
  }
  return rows;
}

test('initial frequency, not registration order or remaining frequency, chooses Ca 1',()=>{
  // Z=9, Y=6, A=4, B=3. After Z, Y has only one unassigned candidate.
  const candidates=roster([['Z','Y',5],['Z','A',4],['Y','B',1],['B','C',2]]);
  const result=optimizeElectiveRooms(candidates,{capacity:5});
  assert.equal(result.ok,true);
  const byId=new Map(result.assignments.map(row=>[row.candidate_id,row]));
  for(const row of candidates){
    const assigned=byId.get(row.id);
    assert.equal(assigned.ca1_subject_code,row.elective_subjects[0]);
    assert.equal(assigned.ca2_subject_code,row.elective_subjects[1]);
  }
  const reversed=optimizeElectiveRooms([...candidates].reverse().map(row=>({...row,elective_subjects:[...row.elective_subjects].reverse()})),{capacity:5});
  assert.deepEqual(reversed.assignments,result.assignments.map(row=>({...row,elective_subjects:[...row.elective_subjects].reverse()})));
});

test('incompatible leftovers open a room instead of reversing popularity',()=>{
  const candidates=roster([['Z','Y',3],['Y','B',2]]);
  const result=optimizeElectiveRooms(candidates,{capacity:10});
  // Y is the most popular: all five share Y at Ca 1.
  assert.equal(result.rooms.length,1);
  assert.ok(result.assignments.every(row=>row.ca1_subject_code==='Y'));
  const conflict=roster([['Z','Y',3],['Z','A',3],['Y','B',2]]);
  const split=optimizeElectiveRooms(conflict,{capacity:10});
  assert.deepEqual(split.rooms.map(room=>room.student_count),[6,2]);
  assert.equal(split.assignments.at(-1).ca1_subject_code,'Y');
  const fixed=allocateCandidatesToRoomPlan(conflict,[{room_code:'P01',room_number:1,student_count:8,capacity:10}],{capacity:10,planType:'elective',suggestedAssignments:split.assignments});
  assert.equal(fixed.ok,false);
});

test('Ca 2 may repeat across Ca 1 blocks, and saved numbering keeps that layout',()=>{
  const candidates=roster([['Z','A',4],['Z','B',4],['Y','A',3],['Y','B',3],['Z','C',1],['Y','D',2]]);
  const result=optimizeElectiveRooms(candidates,{capacity:24});
  assert.equal(result.rooms.length,1);
  assert.deepEqual([...new Set(result.assignments.map(row=>row.ca1_subject_code))],['Z','Y']);
  const saved=orderElectiveRoomPlan(result);
  const numbered=numberSavedElectiveRooms(saved);
  assert.deepEqual(numbered.assignments.map(row=>row.candidate_id),saved.assignments.map(row=>row.candidate_id));
  const blocks=[];
  for(const row of saved.assignments){
    const key=`${row.ca1_subject_code}/${row.ca2_subject_code}`;
    if(blocks.at(-1)!==key)blocks.push(key);
  }
  assert.deepEqual(blocks,['Z/A','Z/B','Z/C','Y/A','Y/B','Y/D']);
  assert.equal(new Set(saved.assignments.map(row=>row.candidate_id)).size,candidates.length);
  const layout=rows=>rows.map(row=>[row.candidate_id,row.room_code,row.ca1_subject_code,row.ca2_subject_code,row.seat_number]);
  assert.deepEqual(layout(allocateCandidatesToRoomPlan(candidates,result.rooms,{capacity:24,planType:'elective'}).assignments),layout(saved.assignments));
});
