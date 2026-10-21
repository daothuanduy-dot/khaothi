-- v0.1.88: keep the candidate-subject constraint aligned with the application catalog.
-- The importer uses N1-N7 for foreign languages and GDKTPL for KTPL.
alter table public.exam_candidate_subjects
  drop constraint if exists exam_candidate_subjects_subject_code_check;

alter table public.exam_candidate_subjects
  add constraint exam_candidate_subjects_subject_code_check
  check (subject_code = any (array[
    'TOAN'::text, 'VAN'::text,
    'N1'::text, 'N2'::text, 'N3'::text, 'N4'::text, 'N5'::text, 'N6'::text, 'N7'::text,
    'ANH'::text, 'SU'::text, 'DIA'::text, 'GDKTPL'::text, 'KTPL'::text,
    'LY'::text, 'HOA'::text, 'SINH'::text, 'TIN'::text
  ]));

notify pgrst, 'reload schema';
