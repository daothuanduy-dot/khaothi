-- Read-only diagnostics; replace the UUID below with the exam_sessions.id.

with target_exam as (
  select '00000000-0000-0000-0000-000000000000'::uuid as exam_id
),
assignment_checks as (
  select
    a.finalization_id,
    count(*) as stored_rows,
    count(distinct a.candidate_id) as unique_candidates,
    count(*) filter (where c.id is null or c.sbd is distinct from a.sbd) as candidate_or_sbd_mismatches
  from public.exam_room_assignments a
  left join public.exam_candidates c
    on c.id = a.candidate_id
   and c.exam_id = a.exam_id
  join target_exam t on t.exam_id = a.exam_id
  group by a.finalization_id
)
select
  f.id as finalization_id,
  f.exam_id,
  f.plan_type,
  f.subject_code,
  f.source_plan_id as snapshot_id,
  f.is_current,
  f.finalized_at,
  f.assignment_count as expected_assignments,
  coalesce(a.stored_rows, 0) as stored_assignment_rows,
  coalesce(a.unique_candidates, 0) as unique_candidates,
  coalesce(a.candidate_or_sbd_mismatches, 0) as candidate_or_sbd_mismatches,
  f.room_count as expected_rooms,
  jsonb_array_length(f.rooms) as rooms_in_finalization
from public.exam_rooming_finalizations f
join target_exam t on t.exam_id = f.exam_id
left join assignment_checks a on a.finalization_id = f.id
order by f.finalized_at desc;

-- Per-room persisted assignment counts and SBD ranges for the selected exam.
with target_exam as (
  select '00000000-0000-0000-0000-000000000000'::uuid as exam_id
)
select
  f.id as finalization_id,
  f.plan_type,
  f.subject_code,
  r.room_code,
  r.student_count as expected_students,
  count(a.candidate_id) as stored_students,
  min(a.sbd) as first_sbd,
  max(a.sbd) as last_sbd
from public.exam_rooming_finalizations f
join target_exam t on t.exam_id = f.exam_id
cross join lateral jsonb_to_recordset(f.rooms) as r(room_code text, student_count integer)
left join public.exam_room_assignments a
  on a.finalization_id = f.id
 and a.room_code = r.room_code
group by f.id, f.plan_type, f.subject_code, r.room_code, r.student_count
order by f.finalized_at desc, r.room_code;

-- Saved-but-not-yet-finalized plans are immutable snapshots; assignments are in JSON.
with target_exam as (
  select '00000000-0000-0000-0000-000000000000'::uuid as exam_id
)
select
  s.id as snapshot_id,
  s.exam_id,
  s.plan_type,
  s.subject_code,
  s.source_plan_id,
  s.created_at,
  jsonb_array_length(s.rooms) as room_count,
  jsonb_array_length(s.assignments) as assignment_count
from public.exam_rooming_plan_snapshots s
join target_exam t on t.exam_id = s.exam_id
order by s.created_at desc
limit 20;
