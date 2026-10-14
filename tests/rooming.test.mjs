import test from 'node:test';
import assert from 'node:assert/strict';
import { assignElectiveCandidateToRoom, optimizeElectiveRooms, optimizeMandatoryRooms } from '../js/rooming.js';

test('elective rooming assigns every candidate once, respects capacity, and keeps the two sessions disjoint', () => {
  const candidates = [
    { id: '1', sbd: '310001', student_name: 'Nguyen An', elective_subjects: ['ANH', 'LY'] },
    { id: '2', sbd: '310002', student_name: 'Tran Binh', elective_subjects: ['LY', 'ANH'] },
    { id: '3', sbd: '310003', student_name: 'Le Chi', elective_subjects: ['HOA', 'SINH'] },
    { id: '4', sbd: '310004', student_name: 'Pham Dung', elective_subjects: ['SINH', 'HOA'] },
    { id: '5', sbd: '310005', student_name: 'Do Em', elective_subjects: ['SU', 'DIA'] }
  ];

  const result = optimizeElectiveRooms(candidates, { capacity: 2, roomPrefix: 'P', firstRoomNumber: 1 });

  assert.equal(result.ok, true);
  assert.equal(result.summary.candidate_count, candidates.length);
  assert.equal(result.assignments.length, candidates.length);
  assert.equal(new Set(result.assignments.map(row => row.candidate_id)).size, candidates.length);
  for (const room of result.rooms) {
    assert.ok(room.student_count <= room.capacity);
    assert.equal(room.ca1_subject_codes.some(code => room.ca2_subject_codes.includes(code)), false);
  }
});

test('mandatory rooming includes the full roster and never exceeds room capacity', () => {
  const candidates = Array.from({ length: 7 }, (_, index) => ({
    id: String(index + 1),
    sbd: `31000${index + 1}`,
    student_name: `Student ${index + 1}`
  }));

  const result = optimizeMandatoryRooms(candidates, {
    capacity: 3,
    roomPrefix: 'M',
    firstRoomNumber: 1,
    subjectCode: 'TOAN'
  });

  assert.equal(result.ok, true);
  assert.equal(result.assignments.length, candidates.length);
  assert.equal(new Set(result.assignments.map(row => row.candidate_id)).size, candidates.length);
  assert.deepEqual(result.rooms.map(room => room.student_count), [3, 3, 1]);
  assert.ok(result.rooms.every(room => room.student_count <= room.capacity));
});

test('invalid elective registrations fail without creating a plan', () => {
  const result = optimizeElectiveRooms([
    { id: '1', sbd: '310001', student_name: 'Student 1', elective_subjects: ['ANH', 'ANH'] }
  ], { capacity: 24 });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /hai môn khác nhau/i);
});

test('manual room allocation flips candidate sessions when needed and rejects a cross-session collision', () => {
  const currentAssignments = [
    { candidate_id: '1', ca1_subject_code: 'LY', ca2_subject_code: 'ANH' }
  ];
  const movable = {
    id: '2',
    sbd: '310002',
    elective_subjects: ['ANH', 'LY']
  };

  const compatible = assignElectiveCandidateToRoom(movable, currentAssignments, 'P01');
  assert.equal(compatible.candidate_id, '2');
  assert.equal(compatible.room_code, 'P01');
  assert.equal(compatible.ca1_subject_code, 'LY');
  assert.equal(compatible.ca2_subject_code, 'ANH');

  const blocked = assignElectiveCandidateToRoom({
    id: '3',
    elective_subjects: ['ANH', 'SU']
  }, [
    { ca1_subject_code: 'ANH', ca2_subject_code: 'LY' },
    { ca1_subject_code: 'SU', ca2_subject_code: 'DIA' }
  ], 'P01');
  assert.equal(blocked, null);
});
