-- v0.1.54: allow English in the legacy per-session subject columns.
-- The v0.1.53 RPC stores complete session subject sets in JSONB, while these
-- legacy NOT NULL columns retain one representative subject for compatibility.

alter table public.exam_elective_room_plan_rooms
  drop constraint if exists exam_elective_room_plan_rooms_ca1_subject_code_check;

alter table public.exam_elective_room_plan_rooms
  add constraint exam_elective_room_plan_rooms_ca1_subject_code_check
    check (ca1_subject_code = any (array[
      'ANH'::text, 'SU'::text, 'DIA'::text, 'GDKTPL'::text,
      'LY'::text, 'HOA'::text, 'SINH'::text, 'TIN'::text
    ]));
