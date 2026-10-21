-- Add the N1-N7 foreign-language subject codes while retaining ANH/KTPL
-- for compatibility with existing records and previously imported files.
alter table public.exam_elective_room_plan_rooms
  drop constraint if exists exam_elective_room_plan_rooms_ca1_subject_code_check;

alter table public.exam_elective_room_plan_rooms
  add constraint exam_elective_room_plan_rooms_ca1_subject_code_check
  check (ca1_subject_code = any (array[
    'N1'::text, 'N2'::text, 'N3'::text, 'N4'::text, 'N5'::text, 'N6'::text, 'N7'::text,
    'ANH'::text, 'SU'::text, 'DIA'::text, 'GDKTPL'::text, 'KTPL'::text,
    'LY'::text, 'HOA'::text, 'SINH'::text, 'TIN'::text
  ]));

create or replace function public.exam_subject_display_name(p_subject_code text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select case upper(btrim(p_subject_code))
    when 'TOAN' then 'Toán'
    when 'VAN' then 'Ngữ văn'
    when 'N1' then 'Tiếng Anh'
    when 'N2' then 'Tiếng Nga'
    when 'N3' then 'Tiếng Pháp'
    when 'N4' then 'Tiếng Trung Quốc'
    when 'N5' then 'Tiếng Đức'
    when 'N6' then 'Tiếng Nhật'
    when 'N7' then 'Tiếng Hàn'
    when 'ANH' then 'Tiếng Anh (mã cũ)'
    when 'SU' then 'Lịch sử'
    when 'DIA' then 'Địa lí'
    when 'GDKTPL' then 'Giáo dục kinh tế và pháp luật'
    when 'KTPL' then 'Giáo dục kinh tế và pháp luật'
    when 'LY' then 'Vật lí'
    when 'HOA' then 'Hóa học'
    when 'SINH' then 'Sinh học'
    when 'TIN' then 'Tin học'
    else upper(btrim(p_subject_code))
  end;
$$;

create or replace function public.exam_delete_subject_registrations(
  p_exam_id uuid,
  p_subject_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject_code text:=nullif(upper(btrim(p_subject_code)),'');
  v_deleted integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền xóa đăng ký môn thi.' using errcode='42501';
  end if;
  if p_exam_id is null or not exists(
    select 1 from public.exam_sessions where id=p_exam_id
  ) then
    raise exception 'Hãy chọn một kỳ thi hợp lệ.' using errcode='22023';
  end if;
  if p_subject_code is not null and v_subject_code is null then
    raise exception 'Mã môn thi không hợp lệ.' using errcode='22023';
  end if;
  if v_subject_code is not null and v_subject_code not in (
    'TOAN','VAN','N1','N2','N3','N4','N5','N6','N7','ANH',
    'SU','DIA','GDKTPL','KTPL','LY','HOA','SINH','TIN'
  ) then
    raise exception 'Mã môn "%" không thuộc danh mục môn thi.',v_subject_code using errcode='22023';
  end if;

  if v_subject_code is null then
    delete from public.exam_candidate_subjects where exam_id=p_exam_id;
  else
    delete from public.exam_candidate_subjects
    where exam_id=p_exam_id and upper(btrim(subject_code))=v_subject_code;
  end if;
  get diagnostics v_deleted=row_count;

  return jsonb_build_object(
    'exam_id',p_exam_id,
    'subject_code',v_subject_code,
    'deleted_count',v_deleted
  );
end;
$$;

revoke all on function public.exam_delete_subject_registrations(uuid,text) from public;
grant execute on function public.exam_delete_subject_registrations(uuid,text) to authenticated;
