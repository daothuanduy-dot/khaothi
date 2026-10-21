-- v0.1.89: GDKTPL and KTPL are the same subject. Keep KTPL as the only code.
-- Remove duplicate registrations before converting the legacy code.
delete from public.exam_candidate_subjects old
where upper(btrim(old.subject_code))='GDKTPL'
  and exists (
    select 1 from public.exam_candidate_subjects current
    where current.exam_id=old.exam_id
      and current.candidate_id=old.candidate_id
      and upper(btrim(current.subject_code))='KTPL'
  );

update public.exam_candidate_subjects
set subject_code='KTPL'
where upper(btrim(subject_code))='GDKTPL';

alter table public.exam_candidate_subjects
  drop constraint if exists exam_candidate_subjects_subject_code_check;

alter table public.exam_candidate_subjects
  add constraint exam_candidate_subjects_subject_code_check
  check (subject_code = any (array[
    'TOAN'::text, 'VAN'::text,
    'N1'::text, 'N2'::text, 'N3'::text, 'N4'::text, 'N5'::text, 'N6'::text, 'N7'::text,
    'ANH'::text, 'SU'::text, 'DIA'::text, 'KTPL'::text,
    'LY'::text, 'HOA'::text, 'SINH'::text, 'TIN'::text
  ]));

notify pgrst, 'reload schema';
