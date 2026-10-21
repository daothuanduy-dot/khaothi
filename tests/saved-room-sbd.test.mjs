import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {orderElectiveRoomPlan,numberSavedElectiveRooms} from '../js/rooming.js';

function draft(){
 return {rooms:[{room_code:'P10',room_number:10,student_count:1,capacity:24},{room_code:'P2',room_number:2,student_count:2,capacity:24}],
 assignments:[{candidate_id:'c',student_name:'Trần Văn Cường',room_code:'P10',ca1_subject_code:'LI',ca2_subject_code:'HOA',sbd:''},
 {candidate_id:'b',student_name:'Nguyễn Văn Bình',room_code:'P2',ca1_subject_code:'LI',ca2_subject_code:'HOA',sbd:''},
 {candidate_id:'a',student_name:'Trần Văn An',room_code:'P2',ca1_subject_code:'LI',ca2_subject_code:'HOA',sbd:''}]};
}
test('save orders names within rooms before numbering, without moving candidates',()=>{
 const source=draft(),original=structuredClone(source),saved=orderElectiveRoomPlan(source);
 assert.deepEqual(source,original);
 assert.deepEqual(saved.assignments.map(a=>[a.candidate_id,a.room_code,a.seat_number]),[['a','P2',1],['b','P2',2],['c','P10',1]]);
 const snapshot=structuredClone(saved),result=numberSavedElectiveRooms(saved);
 assert.deepEqual(saved,snapshot);
 assert.deepEqual(result.assignments.map(a=>a.sbd),['310001','310002','310003']);
 assert.deepEqual(result.assignments.map(({sbd,...a})=>a),saved.assignments.map(({sbd,...a})=>a));
 assert.equal(result.rooms[1].sbd_last,'310003');
});
test('saved plan supports eight digits and continuation after previous round',()=>{
 const result=numberSavedElectiveRooms(orderElectiveRoomPlan(draft()),{prefix:'315',totalLength:8,startNumber:27});
 assert.deepEqual(result.assignments.map(a=>a.sbd),['31500027','31500028','31500029']);
});
test('manual numbering preserves interleaved subject groups and rejects invalid seats',()=>{
 const plan=orderElectiveRoomPlan(draft());
 plan.adjustment_mode='manual';
 const first=plan.assignments[0],second=plan.assignments[1];
 first.seat_number=2;second.seat_number=1;
 const before=structuredClone(plan);
 assert.deepEqual(numberSavedElectiveRooms(plan).assignments.map(a=>a.candidate_id),['b','a','c']);
 assert.deepEqual(plan,before);
 second.seat_number=2;
 assert.throws(()=>numberSavedElectiveRooms(plan),/vị trí/);
});
test('manual interleaved groups are allowed but automatic groups must be contiguous',()=>{
 const plan={adjustment_mode:'manual',rooms:[{room_code:'P1',room_number:1,student_count:3,capacity:24}],assignments:['LI','HOA','LI'].map((code,i)=>({candidate_id:String(i),room_code:'P1',seat_number:i+1,ca1_subject_code:code,ca2_subject_code:'SINH',sbd:''}))};
 assert.deepEqual(numberSavedElectiveRooms(plan).assignments.map(a=>a.candidate_id),['0','1','2']);
 plan.adjustment_mode='automatic';
 assert.throws(()=>numberSavedElectiveRooms(plan),/không liên tục/);
});
test('numbering refuses missing plan, old seat order, existing SBD and exhausted range',()=>{
 assert.throws(()=>numberSavedElectiveRooms({}),/lưu phòng/);
 assert.throws(()=>numberSavedElectiveRooms(draft()),/thứ tự/);
 const plan=orderElectiveRoomPlan(draft());
 assert.throws(()=>numberSavedElectiveRooms(plan,{startNumber:9999}),/không đủ/);
 plan.assignments[0].sbd='310001';
 assert.throws(()=>numberSavedElectiveRooms(plan),/đã có SBD/);
});
test('save rejects repeated subjects across sittings and duplicate candidates',()=>{
 const plan=draft();plan.assignments[1].ca2_subject_code='LI';
 assert.throws(()=>orderElectiveRoomPlan(plan),/không hợp lệ/);
 const duplicate=draft();duplicate.assignments[1].candidate_id='a';
 assert.throws(()=>orderElectiveRoomPlan(duplicate),/trùng/);
});
test('UI numbers a saved snapshot, not a newly optimized plan',async()=>{
 const app=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
 const flow=app.slice(app.indexOf('async function previewSbdRooms'),app.indexOf('function wireSbdRoomMode'));
 assert.match(flow,/findCurrentRoundPlan/);
 assert.match(flow,/numberSavedElectiveRooms/);
 assert.doesNotMatch(flow,/buildElectiveSbdPlan|optimizeElectiveRooms/);
 assert.match(flow,/exam_number_saved_elective_plan/);
 const sql=await readFile(new URL('../sql/v0.1.114_number_saved_elective_plan.sql',import.meta.url),'utf8');
 assert.match(sql,/is distinct from p_expected_assignments/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/exam_require_sbd_for_official_plan/);
 assert.doesNotMatch(sql,/delete from|truncate /i);
});
