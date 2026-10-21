-- v0.1.55: allow a subject to be shared by candidates in the same session.
-- Reject only a cross-session collision: Ca 1 for one candidate matching
-- Ca 2 for another candidate in the same room (or vice versa).

create or replace function public.exam_finalize_rooming_plan(
  p_exam_id uuid,
  p_plan_type text,
  p_subject_code text,
  p_capacity integer,
  p_rooms jsonb,
  p_assignments jsonb,
  p_source_plan_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_finalization_id uuid;
  v_assignment_count integer;
  v_room_count integer;
  v_expected_count integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền phân phòng chính thức.';
  end if;
  if p_exam_id is null
     or p_plan_type is null
     or p_plan_type not in ('mandatory','elective')
     or (p_plan_type = 'mandatory' and (p_subject_code is null or p_subject_code not in ('TOAN','VAN')))
     or (p_plan_type = 'elective' and p_subject_code is not null)
     or p_source_plan_id is null
     or p_capacity is null
     or p_capacity < 1 or p_capacity > 25
     or p_rooms is null
     or jsonb_typeof(p_rooms) <> 'array'
     or p_assignments is null
     or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Thông tin kỳ thi hoặc phương án phân phòng không hợp lệ.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_exam_id::text || ':' || p_plan_type || ':' || coalesce(p_subject_code,''),
    1
  ));

  v_assignment_count := jsonb_array_length(p_assignments);
  v_room_count := jsonb_array_length(p_rooms);
  if v_assignment_count = 0 or v_room_count = 0 then
    raise exception 'Phương án phải có ít nhất một thí sinh và một phòng.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_rooms) as r(value)
     where nullif(btrim(r.value->>'room_code'),'') is null
        or coalesce((r.value->>'student_count')::integer,0) < 1
        or (r.value->>'student_count')::integer > p_capacity
  ) then
    raise exception 'Mỗi phòng phải có mã hợp lệ và sĩ số từ 1 đến sức chứa.';
  end if;
  if (select count(distinct r.value->>'room_code') from jsonb_array_elements(p_rooms) as r(value)) <> v_room_count then
    raise exception 'Danh sách phòng có mã phòng bị trùng.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_assignments) as a(value)
     where coalesce(a.value->>'candidate_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(a.value->>'sbd','') !~ '^[0-9]{6}$|^[0-9]{8}$'
        or nullif(btrim(a.value->>'room_code'),'') is null
        or (select count(*) from jsonb_array_elements(p_rooms) as r(value)
             where r.value->>'room_code' = a.value->>'room_code') <> 1
  ) then
    raise exception 'Mỗi phân công phải có thí sinh, SBD hợp lệ và thuộc đúng một phòng trong phương án.';
  end if;
  if (select count(distinct a.value->>'candidate_id') from jsonb_array_elements(p_assignments) as a(value)) <> v_assignment_count then
    raise exception 'Một thí sinh xuất hiện nhiều lần trong phương án.';
  end if;
  if (select count(distinct a.value->>'sbd') from jsonb_array_elements(p_assignments) as a(value)) <> v_assignment_count then
    raise exception 'SBD bị trùng trong phương án.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_assignments) as a(value)
     group by a.value->>'room_code'
    having count(*) > p_capacity
  ) then
    raise exception 'Sĩ số một hoặc nhiều phòng vượt quá sức chứa.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_rooms) as r(value)
      left join lateral (
        select count(*) as actual_count
          from jsonb_array_elements(p_assignments) as a(value)
         where a.value->>'room_code' = r.value->>'room_code'
      ) assigned on true
     where assigned.actual_count <> (r.value->>'student_count')::integer
  ) then
    raise exception 'Sĩ số phòng không khớp với danh sách phân công.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_assignments) as a(value)
      left join public.exam_candidates c
        on c.id = (a.value->>'candidate_id')::uuid
       and c.exam_id = p_exam_id
       and c.sbd = a.value->>'sbd'
     where c.id is null
  ) then
    raise exception 'Có thí sinh không thuộc kỳ thi hoặc SBD không khớp dữ liệu đã lưu.';
  end if;

  if not exists (
    select 1
      from public.exam_rooming_plan_snapshots saved
     where saved.id = p_source_plan_id
       and saved.exam_id = p_exam_id
       and saved.plan_type = p_plan_type
       and coalesce(saved.subject_code,'') = coalesce(p_subject_code,'')
       and saved.capacity = p_capacity
       and saved.rooms = p_rooms
       and saved.assignments = p_assignments
  ) then
    raise exception 'Hãy lưu đúng snapshot phương án đã điều chỉnh trước khi phân phòng chính thức.';
  end if;

  if p_plan_type = 'mandatory' then
    v_expected_count := (select count(*) from public.exam_candidates where exam_id = p_exam_id);
    if exists (
      select 1
        from jsonb_array_elements(p_assignments) as a(value)
       where a.value->>'subject_code' is distinct from p_subject_code
    ) then
      raise exception 'Phương án môn bắt buộc có môn thi không khớp.';
    end if;
  else
    select count(*) into v_expected_count
      from public.exam_candidates c
      join (
        select candidate_id
          from public.exam_candidate_subjects
         where exam_id = p_exam_id and subject_type = 'elective'
         group by candidate_id
        having count(distinct subject_code) filter (where subject_order = 1) = 1
           and count(distinct subject_code) filter (where subject_order = 2) = 1
           and count(distinct subject_code) = 2
      ) eligible on eligible.candidate_id = c.id
     where c.exam_id = p_exam_id;

    if exists (
      select 1
        from jsonb_array_elements(p_assignments) as a(value)
       where nullif(a.value->>'ca1_subject_code','') is null
            or nullif(a.value->>'ca2_subject_code','') is null
            or a.value->>'ca1_subject_code' = a.value->>'ca2_subject_code'
            or not (
              exists (
                select 1 from public.exam_candidate_subjects s1
                 where s1.exam_id = p_exam_id and s1.candidate_id = (a.value->>'candidate_id')::uuid
                   and s1.subject_type = 'elective' and s1.subject_order = 1
                   and s1.subject_code = a.value->>'ca1_subject_code'
              )
              and exists (
                select 1 from public.exam_candidate_subjects s2
                 where s2.exam_id = p_exam_id and s2.candidate_id = (a.value->>'candidate_id')::uuid
                   and s2.subject_type = 'elective' and s2.subject_order = 2
                   and s2.subject_code = a.value->>'ca2_subject_code'
              )
              or exists (
                select 1 from public.exam_candidate_subjects s1
                 where s1.exam_id = p_exam_id and s1.candidate_id = (a.value->>'candidate_id')::uuid
                   and s1.subject_type = 'elective' and s1.subject_order = 1
                   and s1.subject_code = a.value->>'ca2_subject_code'
              )
              and exists (
                select 1 from public.exam_candidate_subjects s2
                 where s2.exam_id = p_exam_id and s2.candidate_id = (a.value->>'candidate_id')::uuid
                   and s2.subject_type = 'elective' and s2.subject_order = 2
                   and s2.subject_code = a.value->>'ca1_subject_code'
              )
            )
    ) then
      raise exception 'Môn ở hai ca của thí sinh không khớp đăng ký lựa chọn đã lưu.';
    end if;

    if exists (
      select 1
        from jsonb_array_elements(p_assignments) as a(value)
        join jsonb_array_elements(p_assignments) as b(value)
          on a.value->>'room_code' = b.value->>'room_code'
         and a.value->>'candidate_id' < b.value->>'candidate_id'
       where a.value->>'ca1_subject_code' = b.value->>'ca2_subject_code'
          or a.value->>'ca2_subject_code' = b.value->>'ca1_subject_code'
    ) then
      raise exception 'Một môn bị xếp ở cả hai ca trong cùng phòng.';
    end if;
  end if;

  if v_assignment_count <> v_expected_count then
    raise exception 'Số thí sinh phân phòng (%) không khớp số thí sinh đủ điều kiện (%).', v_assignment_count, v_expected_count;
  end if;
  if exists (
    select 1
      from public.exam_candidates c
     where c.exam_id = p_exam_id
       and (p_plan_type = 'mandatory' or exists (
         select 1 from public.exam_candidate_subjects s
          where s.exam_id = p_exam_id and s.candidate_id = c.id and s.subject_type = 'elective'
          group by s.candidate_id
         having count(distinct s.subject_code) filter (where s.subject_order = 1) = 1
            and count(distinct s.subject_code) filter (where s.subject_order = 2) = 1
            and count(distinct s.subject_code) = 2
       ))
       and not exists (
         select 1 from jsonb_array_elements(p_assignments) as a(value)
          where a.value->>'candidate_id' = c.id::text
       )
  ) then
    raise exception 'Còn thí sinh đủ điều kiện chưa được phân phòng.';
  end if;

  update public.exam_rooming_finalizations
     set is_current = false
   where exam_id = p_exam_id
     and plan_type = p_plan_type
     and coalesce(subject_code,'') = coalesce(p_subject_code,'')
     and is_current;

  insert into public.exam_rooming_finalizations(
    exam_id, plan_type, subject_code, source_plan_id, capacity, rooms,
    assignment_count, room_count, finalized_by
  ) values (
    p_exam_id, p_plan_type, p_subject_code, p_source_plan_id, p_capacity, p_rooms,
    v_assignment_count, v_room_count, auth.uid()
  ) returning id into v_finalization_id;

  insert into public.exam_room_assignments(
    finalization_id, exam_id, candidate_id, room_code, sbd,
    subject_code, ca1_subject_code, ca2_subject_code
  )
  select v_finalization_id, p_exam_id, (a.value->>'candidate_id')::uuid,
         a.value->>'room_code', a.value->>'sbd',
         nullif(a.value->>'subject_code',''),
         nullif(a.value->>'ca1_subject_code',''),
         nullif(a.value->>'ca2_subject_code','')
    from jsonb_array_elements(p_assignments) as a(value);

  return jsonb_build_object(
    'finalization_id', v_finalization_id,
    'exam_id', p_exam_id,
    'plan_type', p_plan_type,
    'subject_code', p_subject_code,
    'assignment_count', v_assignment_count,
    'room_count', v_room_count,
    'finalized_at', now()
  );
end;
$$;

revoke all on function public.exam_finalize_rooming_plan(uuid,text,text,integer,jsonb,jsonb,uuid) from public;
grant execute on function public.exam_finalize_rooming_plan(uuid,text,text,integer,jsonb,jsonb,uuid) to authenticated;
