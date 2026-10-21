-- v0.1.93: allow an independent rooming plan for each subject and class subjects.

alter table public.exam_round_subjects
  drop constraint if exists exam_round_subjects_subject_type_check;
alter table public.exam_round_subjects
  add constraint exam_round_subjects_subject_type_check
  check (subject_type in ('mandatory','elective','class'));

alter table public.exam_rooming_round_plans
  drop constraint if exists exam_rooming_round_plans_plan_type_check;
alter table public.exam_rooming_round_plans
  add constraint exam_rooming_round_plans_plan_type_check
  check (plan_type in ('mandatory','elective','subject'));
