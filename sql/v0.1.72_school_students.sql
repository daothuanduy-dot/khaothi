-- Independent whole-school roster. Exam candidates remain separate snapshots
-- so SBD, rooming, scripts, and scores keep their existing exam-specific links.
create table if not exists public.school_students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique check (btrim(student_code)<>''),
  student_name text not null check (btrim(student_name)<>''),
  date_of_birth date,
  gender text,
  ethnicity text,
  grade_code text not null check (btrim(grade_code)<>''),
  class_code text not null check (btrim(class_code)<>''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_school_students_grade_class_name
  on public.school_students(grade_code,class_code,student_name);

alter table public.school_students enable row level security;
drop policy if exists school_students_admin_all on public.school_students;
create policy school_students_admin_all on public.school_students
  for all to authenticated
  using (public.exam_is_admin())
  with check (public.exam_is_admin());

grant select,insert,update,delete on public.school_students to authenticated;

create or replace function public.exam_import_school_students(p_students jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền cập nhật danh sách học sinh toàn trường.' using errcode='42501';
  end if;
  if p_students is null or jsonb_typeof(p_students)<>'array' then
    raise exception 'Danh sách học sinh không hợp lệ.';
  end if;
  v_total:=jsonb_array_length(p_students);
  if v_total<1 or v_total>500 then
    raise exception 'Mỗi lô nhập phải có từ 1 đến 500 học sinh.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_students) x
    where nullif(btrim(x.value->>'student_code'),'') is null
      or nullif(btrim(x.value->>'student_name'),'') is null
      or nullif(btrim(x.value->>'grade_code'),'') is null
      or nullif(btrim(x.value->>'class_code'),'') is null
  ) then
    raise exception 'Mỗi học sinh phải có mã, họ tên, khối và lớp.';
  end if;
  if (select count(distinct btrim(x.value->>'student_code'))
      from jsonb_array_elements(p_students) x)<>v_total then
    raise exception 'Danh sách có mã học sinh bị trùng.';
  end if;

  insert into public.school_students(
    student_code,student_name,date_of_birth,gender,ethnicity,grade_code,class_code,updated_at
  )
  select btrim(x.value->>'student_code'),btrim(x.value->>'student_name'),
    nullif(x.value->>'date_of_birth','')::date,nullif(btrim(x.value->>'gender'),''),
    nullif(btrim(x.value->>'ethnicity'),''),btrim(x.value->>'grade_code'),btrim(x.value->>'class_code'),now()
  from jsonb_array_elements(p_students) x
  on conflict (student_code) do update set
    student_name=excluded.student_name,
    date_of_birth=excluded.date_of_birth,
    gender=excluded.gender,
    ethnicity=excluded.ethnicity,
    grade_code=excluded.grade_code,
    class_code=excluded.class_code,
    updated_at=now();

  return jsonb_build_object('processed_count',v_total);
end;
$$;

create or replace function public.exam_add_school_students_to_exam(
  p_exam_id uuid,p_student_codes text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
  v_found integer;
  v_requested integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền thêm học sinh vào kỳ thi.' using errcode='42501';
  end if;
  if p_exam_id is null or p_student_codes is null or cardinality(p_student_codes)=0
    or cardinality(p_student_codes)>5000 then
    raise exception 'Hãy chọn kỳ thi và từ 1 đến 5000 học sinh.';
  end if;
  if not exists(select 1 from public.exam_sessions where id=p_exam_id) then
    raise exception 'Không tìm thấy kỳ thi được chọn.';
  end if;

  select count(distinct code) into v_requested
  from unnest(p_student_codes) code
  where nullif(btrim(code),'') is not null;
  if v_requested<>cardinality(p_student_codes) then
    raise exception 'Danh sách mã học sinh không hợp lệ hoặc có mã trùng.';
  end if;
  select count(*) into v_found
  from public.school_students s
  where s.student_code=any(p_student_codes);

  insert into public.exam_candidates(
    exam_id,student_code,student_name,date_of_birth,gender,ethnicity,grade_code,class_code
  )
  select p_exam_id,s.student_code,s.student_name,s.date_of_birth,s.gender,s.ethnicity,s.grade_code,s.class_code
  from public.school_students s
  where s.student_code=any(p_student_codes)
    and not exists(
      select 1 from public.exam_candidates c
      where c.exam_id=p_exam_id and btrim(c.student_code)=s.student_code
    );
  get diagnostics v_inserted=row_count;

  return jsonb_build_object(
    'inserted_count',v_inserted,
    'already_in_exam_count',greatest(v_found-v_inserted,0),
    'not_found_count',cardinality(p_student_codes)-v_found
  );
end;
$$;

revoke all on function public.exam_import_school_students(jsonb) from public;
revoke all on function public.exam_add_school_students_to_exam(uuid,text[]) from public;
grant execute on function public.exam_import_school_students(jsonb) to authenticated;
grant execute on function public.exam_add_school_students_to_exam(uuid,text[]) to authenticated;
