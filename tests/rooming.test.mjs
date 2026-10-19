import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustRoomPlanCount, allocateCandidatesToRoomPlan, assignElectiveCandidateToRoom, buildElectiveSbdPlan, isValidSbd, optimizeElectiveRooms, optimizeMandatoryRooms, restoreRoomingPlan, roomExportRowPositions, validateElectiveRoomSessions } from '../js/rooming.js';

test('SBD validation accepts only six or eight digits', () => {
  assert.equal(isValidSbd('315001'), true);
  assert.equal(isValidSbd('31501234'), true);
  assert.equal(isValidSbd('3150122352'), false);
  assert.equal(isValidSbd(' 315001'), false);
  assert.equal(isValidSbd(''), false);
});

test('spreadsheet record and total row indexes keep the last candidate row intact', () => {
  const rows = roomExportRowPositions(3, 24);

  assert.deepEqual(rows, { dataStart: 4, dataEnd: 27, totalRow: 28 });
  assert.equal(rows.totalRow, rows.dataEnd + 1);
});

test('changing any room count offsets the balancing room and preserves the planned total', () => {
  const plan = [
    { room_code: 'P01', student_count: 4, capacity: 5 },
    { room_code: 'P02', student_count: 3, capacity: 5 },
    { room_code: 'P03', student_count: 3, capacity: 5 }
  ];

  const increase = adjustRoomPlanCount(plan, 'P01', 5);
  assert.equal(increase.ok, true);
  assert.deepEqual(increase.rooms.map(room => room.student_count), [5, 3, 2]);

  const decrease = adjustRoomPlanCount(plan, 'P02', 2);
  assert.equal(decrease.ok, true);
  assert.deepEqual(decrease.rooms.map(room => room.student_count), [4, 2, 4]);

  const adjustLast = adjustRoomPlanCount(plan, 'P03', 4);
  assert.equal(adjustLast.ok, true);
  assert.deepEqual(adjustLast.rooms.map(room => room.student_count), [4, 2, 4]);
  assert.equal(adjustLast.rooms.reduce((sum, room) => sum + room.student_count, 0), 10);

  const blocked = adjustRoomPlanCount(plan, 'P01', 7);
  assert.equal(blocked.ok, false);
  assert.deepEqual(plan.map(room => room.student_count), [4, 3, 3]);
});

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
    assert.ok(Array.isArray(room.ca1_subject_codes));
    assert.ok(Array.isArray(room.ca2_subject_codes));
    assert.equal(room.ca1_subject_codes.some(code => room.ca2_subject_codes.includes(code)), false);
    const roomAssignments = result.assignments.filter(row => row.room_code === room.room_code);
    assert.ok(roomAssignments.every(row =>
      room.ca1_subject_codes.includes(row.ca1_subject_code) &&
      room.ca2_subject_codes.includes(row.ca2_subject_code)
    ));
  }
});

test('elective grouping sorts each subject block by given name, middle name, family name', () => {
  const candidates = [
    { id: '1', student_name: 'Tran Van Binh', elective_subjects: ['ANH', 'LY'] },
    { id: '2', student_name: 'Nguyen Thi An', elective_subjects: ['ANH', 'LY'] },
    { id: '3', student_name: 'Le Duc An', elective_subjects: ['ANH', 'LY'] }
  ];
  const result = buildElectiveSbdPlan(candidates, { capacity: 10, prefix: '31', totalLength: 6 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.assignments.map(row => row.student_name), [
    'Le Duc An', 'Nguyen Thi An', 'Tran Van Binh'
  ]);
  assert.deepEqual(result.assignments.map(row => row.sbd), ['310001', '310002', '310003']);
  assert.deepEqual(result.assignments.map(row => row.room_code), ['P01', 'P01', 'P01']);
});

test('a room rejects a subject appearing in both exam sessions', () => {
  assert.deepEqual(validateElectiveRoomSessions([
    { ca1_subject_code: 'ANH', ca2_subject_code: 'LY' },
    { ca1_subject_code: 'SU', ca2_subject_code: 'ANH' }
  ]), {
    ok: false,
    error: 'Không được xếp cùng một môn ở cả ca trước và ca sau trong một phòng.'
  });
  assert.deepEqual(validateElectiveRoomSessions([
    { ca1_subject_code: 'ANH', ca2_subject_code: 'LY' },
    { ca1_subject_code: 'SU', ca2_subject_code: 'DIA' }
  ]), { ok: true });
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

  test('restoring a persisted official rooming record reconstructs candidate and room details', () => {
    const candidates = [
      { id: 'c1', sbd: '310001', student_name: 'Student One', class_code: '12A1' },
      { id: 'c2', sbd: '310002', student_name: 'Student Two', class_code: '12A2' }
    ];
    const restored = restoreRoomingPlan([
      { room_code: 'P01', room_number: 1, capacity: 2, student_count: 2 }
    ], [
      { candidate_id: 'c1', room_code: 'P01', sbd: '310001', ca1_subject_code: 'ANH', ca2_subject_code: 'DIA' },
      { candidate_id: 'c2', room_code: 'P01', sbd: '310002', ca1_subject_code: 'ANH', ca2_subject_code: 'DIA' }
    ], candidates, { planType: 'elective', capacity: 2 });

    assert.equal(restored.ok, true);
    assert.equal(restored.result.summary.candidate_count, 2);
    assert.deepEqual(restored.result.rooms[0].candidate_ids, ['c1', 'c2']);
    assert.equal(restored.result.rooms[0].sbd_first, '310001');
    assert.equal(restored.result.rooms[0].ca1_subject_codes.includes('ANH'), true);
    assert.equal(restored.result.assignments[0].student_name, 'Student One');
  });

  test('restoring a persisted rooming record rejects missing candidates and inconsistent room counts', () => {
    const candidates = [
      { id: 'c1', sbd: '310001', student_name: 'Student One' },
      { id: 'c2', sbd: '310002', student_name: 'Student Two' }
    ];
    const room = [{ room_code: 'P01', room_number: 1, capacity: 2, student_count: 1 }];

    const missingCandidate = restoreRoomingPlan(room, [
      { candidate_id: 'missing', room_code: 'P01', sbd: '310002' }
    ], candidates, { planType: 'mandatory' });
    const inconsistentCount = restoreRoomingPlan(room, [
      { candidate_id: 'c1', room_code: 'P01', sbd: '310001' },
      { candidate_id: 'c2', room_code: 'P01', sbd: '310002' }
    ], candidates, { planType: 'mandatory' });

    assert.equal(missingCandidate.ok, false);
    assert.equal(inconsistentCount.ok, false);
  });

  test('saved snapshots retain displayable student details when the current roster changed', () => {
    const restored = restoreRoomingPlan([
      { room_code: 'P01', room_number: 1, capacity: 2, student_count: 1 }
    ], [
      { candidate_id: 'removed-candidate', room_code: 'P01', sbd: '310009', student_name: 'Archived Student', class_code: '12A9' }
    ], [], { planType: 'mandatory', subjectCode: 'TOAN', allowMissingCandidates: true });

    assert.equal(restored.ok, true);
    assert.equal(restored.result.assignments[0].student_name, 'Archived Student');
    assert.equal(restored.result.assignments[0].sbd, '310009');
  });

  test('rooming never substitutes student_code for a missing SBD', () => {
    const result = optimizeMandatoryRooms([
      { id: '1', student_code: '3150122352', student_name: 'Student 1' }
    ], { capacity: 24 });

    assert.equal(result.ok, true);
    assert.equal(result.assignments[0].sbd, '');
    assert.equal(result.assignments[0].student_code, '3150122352');
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

test('candidate assignment happens only against room quotas that exactly match the roster', () => {
  const candidates = [
    { id: '1', sbd: '310001', elective_subjects: ['ANH', 'LY'] },
    { id: '2', sbd: '310002', elective_subjects: ['LY', 'ANH'] },
    { id: '3', sbd: '310003', elective_subjects: ['HOA', 'SINH'] },
    { id: '4', sbd: '310004', elective_subjects: ['SINH', 'HOA'] },
    { id: '5', sbd: '310005', elective_subjects: ['SU', 'DIA'] }
  ];
  const initial = optimizeElectiveRooms(candidates, { capacity: 3, roomPrefix: 'P', firstRoomNumber: 1 });
  const plan = initial.rooms.map(room => ({
    room_code: room.room_code,
    room_number: room.room_number,
    student_count: room.student_count,
    capacity: room.capacity
  }));
  const allocated = allocateCandidatesToRoomPlan(candidates, plan, {
    capacity: 3,
    planType: 'elective'
  });

  assert.equal(allocated.ok, true, allocated.errors?.join('; '));
  assert.deepEqual(allocated.rooms.map(room => room.student_count), plan.map(room => room.student_count));
  assert.equal(allocated.assignments.length, candidates.length);
  for (const room of allocated.rooms) {
    assert.equal(room.ca1_subject_codes.some(code => room.ca2_subject_codes.includes(code)), false);
  }

  const adjustedPlan = plan.map(room => ({ ...room }));
  adjustedPlan[0].student_count -= 1;
  adjustedPlan.at(-1).student_count += 1;
  const rebalanced = allocateCandidatesToRoomPlan(candidates, adjustedPlan, {
    capacity: 3,
    planType: 'elective',
    suggestedAssignments: initial.assignments
  });
  assert.equal(rebalanced.ok, true, rebalanced.errors?.join('; '));
  assert.deepEqual(rebalanced.rooms.map(room => room.student_count), adjustedPlan.map(room => room.student_count));

  const incomplete = allocateCandidatesToRoomPlan(candidates, plan.slice(0, 1), {
    capacity: 3,
    planType: 'elective'
  });
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.errors.join(' '), /tổng sĩ số dự kiến/i);
});

test('elective allocation rebalances a 533-candidate plan of seventeen 24-seat and five 25-seat rooms', () => {
  const subjects = ['ANH', 'SU', 'DIA', 'LY', 'HOA', 'SINH', 'TIN', 'KTPL'];
  let seed = 20261015;
  const randomValue = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const randomIndex = () => Math.floor(randomValue() * subjects.length);
  const randomDifferentIndex = first => {
    const value = Math.floor(randomValue() * (subjects.length - 1));
    return value >= first ? value + 1 : value;
  };
  const candidates = Array.from({ length: 533 }, (_, index) => {
    const first = randomIndex();
    const second = randomDifferentIndex(first);
    return {
      id: String(index + 1),
      sbd: String(100001 + index),
      student_name: `Candidate ${index + 1}`,
      elective_subjects: [subjects[first], subjects[second]]
    };
  });
  const initial = optimizeElectiveRooms(candidates, {
    capacity: 25,
    roomPrefix: 'P',
    firstRoomNumber: 1,
    sortMode: 'sbd'
  });
  assert.equal(initial.ok, true);
  assert.equal(initial.rooms.length, 22);
  assert.ok(initial.summary.subject_count <= 90,
    `Expected grouped rooms to reduce total room-subject occurrences, got ${initial.summary.subject_count}.`);

  const plan = Array.from({ length: 22 }, (_, index) => ({
    room_code: `P${String(index + 1).padStart(2, '0')}`,
    room_number: index + 1,
    student_count: index < 17 ? 24 : 25,
    capacity: 25
  }));
  const allocated = allocateCandidatesToRoomPlan(candidates, plan, {
    capacity: 25,
    planType: 'elective',
    suggestedAssignments: initial.assignments
  });

  assert.equal(allocated.ok, true, allocated.errors?.join('; '));
  assert.equal(allocated.assignments.length, candidates.length);
  assert.equal(new Set(allocated.assignments.map(row => row.candidate_id)).size, candidates.length);
  assert.deepEqual(allocated.rooms.map(room => room.student_count),
    [...Array(17).fill(24), ...Array(5).fill(25)]);
  assert.ok(allocated.summary.subject_count <= 90,
    `Expected adjusted rooms to keep subject counts low, got ${allocated.summary.subject_count}.`);
  for (const room of allocated.rooms) {
    assert.equal(room.ca1_subject_codes.some(code => room.ca2_subject_codes.includes(code)), false);
    assert.equal(room.candidate_ids.length, room.student_count);
  }
});

test('mandatory candidates are assigned in the confirmed room-count sequence', () => {
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    id: String(index + 1),
    sbd: `31000${index + 1}`
  }));
  const allocated = allocateCandidatesToRoomPlan(candidates, [
    { room_code: 'M01', room_number: 1, student_count: 2, capacity: 3 },
    { room_code: 'M02', room_number: 2, student_count: 3, capacity: 3 }
  ], { capacity: 3, planType: 'mandatory', subjectCode: 'TOAN' });

  assert.equal(allocated.ok, true);
  assert.deepEqual(allocated.rooms.map(room => room.student_count), [2, 3]);
  assert.deepEqual(allocated.assignments.map(row => row.room_code), ['M01', 'M01', 'M02', 'M02', 'M02']);
});
