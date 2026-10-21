-- v0.1.44: preserve existing SBD during roster imports and enforce integrity in the database.

do $$
begin
  if exists (
    select 1
      from public.exam_candidates
     where sbd is not null and btrim(sbd) <> ''
     group by exam_id, sbd
    having count(*) > 1
  ) then
    raise exception 'Không thể tạo ràng buộc SBD: đang có SBD trùng trong cùng kỳ thi. Hãy xử lý các bản ghi trùng trước khi chạy migration.';
  end if;
  if exists (
    select 1 from public.exam_candidates
     where sbd is not null and btrim(sbd) <> '' and sbd !~ '^[0-9]{6}$|^[0-9]{8}$'
  ) then
    raise exception 'Không thể áp dụng quy tắc SBD: đang có SBD không gồm 6 hoặc 8 chữ số. Hãy xử lý dữ liệu trước khi chạy migration.';
  end if;

  if exists (
    select 1
      from public.exam_candidates
     where student_code is not null and btrim(student_code) <> ''
     group by exam_id, btrim(student_code)
    having count(*) > 1
  ) then
    raise exception 'Không thể tạo RPC nhập hồ sơ: đang có mã học sinh trùng trong cùng kỳ thi. Hãy xử lý dữ liệu trùng trước khi chạy migration.';
  end if;
end;
$$;

create unique index if not exists ux_exam_candidates_exam_sbd
  on public.exam_candidates(exam_id, sbd)
  where sbd is not null and btrim(sbd) <> '';

create unique index if not exists ux_exam_candidates_exam_student_code
  on public.exam_candidates(exam_id, btrim(student_code))
  where student_code is not null and btrim(student_code) <> '';

create or replace function public.exam_prevent_sbd_overwrite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sbd is not null and btrim(new.sbd) <> '' and new.sbd !~ '^[0-9]{6}$|^[0-9]{8}$' then
    raise exception 'SBD phải gồm đúng 6 hoặc 8 chữ số.';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if old.sbd is not null and btrim(old.sbd) <> '' and new.sbd is distinct from old.sbd then
    raise exception 'SBD đã cấp không được thay đổi hoặc xóa trực tiếp. Hãy dùng quy trình điều chỉnh SBD có phê duyệt.';
  end if;
  return new;
end;
$$;

drop trigger if exists exam_candidates_sbd_immutable on public.exam_candidates;
create trigger exam_candidates_sbd_immutable
before insert or update of sbd on public.exam_candidates
for each row execute function public.exam_prevent_sbd_overwrite();

create or replace function public.exam_import_candidates_preserve_sbd(
  p_exam_id uuid,
  p_candidates jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_code text;
  v_name text;
  v_grade text;
  v_class text;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_total integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền nhập hồ sơ thí sinh.';
  end if;
  if p_exam_id is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'Kỳ thi hoặc danh sách hồ sơ không hợp lệ.';
  end if;
  v_total := jsonb_array_length(p_candidates);
  if v_total = 0 or v_total > 500 then
    raise exception 'Mỗi lô nhập phải có từ 1 đến 500 hồ sơ.';
  end if;
  if not exists (select 1 from public.exam_sessions where id = p_exam_id) then
    raise exception 'Không tìm thấy kỳ thi được chọn.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_candidates) x
     where nullif(btrim(x->>'student_code'), '') is null
        or nullif(btrim(x->>'student_name'), '') is null
        or nullif(btrim(x->>'grade_code'), '') is null
        or nullif(btrim(x->>'class_code'), '') is null
  ) then
    raise exception 'Mỗi hồ sơ phải có mã học sinh, họ tên, khối và lớp.';
  end if;
  if (select count(distinct btrim(x->>'student_code')) from jsonb_array_elements(p_candidates) x) <> v_total then
    raise exception 'Lô nhập có mã học sinh bị trùng.';
  end if;

  for v_item in select value from jsonb_array_elements(p_candidates)
  loop
    v_code := btrim(v_item->>'student_code');
    v_name := btrim(v_item->>'student_name');
    v_grade := btrim(v_item->>'grade_code');
    v_class := btrim(v_item->>'class_code');

    update public.exam_candidates
       set student_name = v_name,
           grade_code = v_grade,
           class_code = v_class,
           date_of_birth = nullif(v_item->>'date_of_birth', '')::date,
           gender = nullif(v_item->>'gender', ''),
           ethnicity = nullif(v_item->>'ethnicity', '')
     where exam_id = p_exam_id and btrim(student_code) = v_code;

    if found then
      v_updated := v_updated + 1;
    else
      insert into public.exam_candidates(
        exam_id, student_code, student_name, grade_code, class_code,
        date_of_birth, gender, ethnicity
      ) values (
        p_exam_id, v_code, v_name, v_grade, v_class,
        nullif(v_item->>'date_of_birth', '')::date,
        nullif(v_item->>'gender', ''),
        nullif(v_item->>'ethnicity', '')
      );
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'exam_id', p_exam_id,
    'inserted_count', v_inserted,
    'updated_count', v_updated,
    'processed_count', v_total
  );
end;
$$;

revoke all on function public.exam_import_candidates_preserve_sbd(uuid, jsonb) from public;
grant execute on function public.exam_import_candidates_preserve_sbd(uuid, jsonb) to authenticated;

create or replace function public.exam_assign_candidate_sbd(
  p_exam_id uuid,
  p_assignments jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_candidate_id uuid;
  v_sbd text;
  v_updated integer := 0;
  v_total integer;
  v_distinct_sbd integer;
  v_existing_sbd text;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền cấp số báo danh.';
  end if;
  if p_exam_id is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Kỳ thi hoặc danh sách cấp SBD không hợp lệ.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_exam_id::text, 0));

  v_total := jsonb_array_length(p_assignments);
  if v_total = 0 then
    raise exception 'Danh sách cấp SBD đang trống.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_assignments) x
     where coalesce(x->>'candidate_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(x->>'sbd','') !~ '^[0-9]{6}$|^[0-9]{8}$'
  ) then
    raise exception 'Mỗi bản ghi phải có candidate_id hợp lệ và SBD gồm 6 hoặc 8 chữ số.';
  end if;
  if (select count(distinct x->>'candidate_id') from jsonb_array_elements(p_assignments) x) <> v_total then
    raise exception 'Danh sách có candidate_id bị trùng.';
  end if;
  select count(distinct x->>'sbd') into v_distinct_sbd
    from jsonb_array_elements(p_assignments) x;
  if v_distinct_sbd <> v_total then
    raise exception 'Danh sách có SBD bị trùng.';
  end if;

  for v_item in select value from jsonb_array_elements(p_assignments)
  loop
    v_candidate_id := (v_item->>'candidate_id')::uuid;
    v_sbd := v_item->>'sbd';
    select sbd into v_existing_sbd
      from public.exam_candidates
     where id = v_candidate_id and exam_id = p_exam_id
     for update;
    if not found then
      raise exception 'Không tìm thấy thí sinh % trong kỳ thi được chọn.', v_candidate_id;
    end if;
    if v_existing_sbd is not null and btrim(v_existing_sbd) <> '' and v_existing_sbd <> v_sbd then
      raise exception 'Thí sinh % đã có SBD %. Không được tự động cấp lại SBD trong cùng kỳ thi.', v_candidate_id, v_existing_sbd;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_assignments)
  loop
    v_candidate_id := (v_item->>'candidate_id')::uuid;
    v_sbd := v_item->>'sbd';
    update public.exam_candidates
       set sbd = v_sbd
     where id = v_candidate_id and exam_id = p_exam_id;
    v_updated := v_updated + 1;
  end loop;
  return jsonb_build_object(
    'exam_id', p_exam_id,
    'updated_count', v_updated,
    'sbd_length', length((p_assignments->0)->>'sbd')
  );
end;
$$;

revoke all on function public.exam_assign_candidate_sbd(uuid, jsonb) from public;
grant execute on function public.exam_assign_candidate_sbd(uuid, jsonb) to authenticated;

create or replace function public.exam_prevent_locked_mandatory_plan_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.is_locked then
    raise exception 'Phương án môn bắt buộc đã khóa, không thể sửa hoặc xóa.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists exam_mandatory_room_plans_locked_immutable on public.exam_mandatory_room_plans;
create trigger exam_mandatory_room_plans_locked_immutable
before update or delete on public.exam_mandatory_room_plans
for each row execute function public.exam_prevent_locked_mandatory_plan_change();

revoke update, delete on public.exam_mandatory_room_plans from authenticated;
