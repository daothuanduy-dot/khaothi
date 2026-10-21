-- v0.1.53: persist all elective subjects assigned to each room/session.
-- The previous RPC expected one subject per session per room, while the
-- allocator can place multiple non-overlapping subjects in a room.

alter table public.exam_elective_room_plan_rooms
  add column if not exists ca1_subject_codes jsonb not null default '[]'::jsonb,
  add column if not exists ca2_subject_codes jsonb not null default '[]'::jsonb;

create or replace function public.exam_save_elective_room_plan(
  p_exam_id uuid,
  p_capacity integer,
  p_room_prefix text,
  p_first_room_number integer,
  p_rooms jsonb,
  p_assignments jsonb,
  p_lock boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_plan_id uuid;
  v_room_ids jsonb := '{}'::jsonb;
  v_room jsonb;
  v_assignment jsonb;
  v_room_id uuid;
  v_candidate public.exam_candidates%rowtype;
  v_room_count integer;
  v_assignment_count integer;
  v_exam_count integer;
  v_candidate_id uuid;
  v_code1 text;
  v_code2 text;
  v_room_code text;
  v_first_room_subject text;
  v_second_room_subject text;
  v_room_number integer;
  v_room_capacity integer;
  v_student_count integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền quản trị khảo thí.' using errcode = '42501';
  end if;
  if p_exam_id is null then raise exception 'Kỳ thi không hợp lệ.'; end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 100 then
    raise exception 'Sức chứa phòng phải từ 1 đến 100.';
  end if;
  if coalesce(trim(p_room_prefix), '') = '' then
    raise exception 'Tiền tố phòng không được để trống.';
  end if;
  if p_first_room_number is null or p_first_room_number < 1 then
    raise exception 'Số phòng bắt đầu phải lớn hơn 0.';
  end if;
  if p_rooms is null or jsonb_typeof(p_rooms) <> 'array' or jsonb_array_length(p_rooms) = 0 then
    raise exception 'Danh sách phòng rỗng hoặc không hợp lệ.';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) = 0 then
    raise exception 'Danh sách phân công rỗng hoặc không hợp lệ.';
  end if;

  select count(*) into v_exam_count
    from public.exam_candidates c
   where c.exam_id = p_exam_id
     and exists (
       select 1
         from public.exam_candidate_subjects s
        where s.exam_id = p_exam_id
          and s.candidate_id = c.id
          and s.subject_type = 'elective'
        group by s.candidate_id
       having count(*) = 2
          and count(distinct s.subject_code) = 2
          and count(*) filter (where s.subject_order = 1) = 1
          and count(*) filter (where s.subject_order = 2) = 1
     );

  v_assignment_count := jsonb_array_length(p_assignments);
  if v_exam_count = 0 then
    raise exception 'Không có thí sinh nào đã đăng ký đúng hai môn lựa chọn khác nhau.';
  end if;
  if v_assignment_count <> v_exam_count then
    raise exception 'Số phân công (%) không bằng số thí sinh đủ điều kiện (%).',
      v_assignment_count, v_exam_count;
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_assignments) as x(value)
     group by x.value->>'candidate_id'
    having count(*) > 1
  ) then
    raise exception 'Có thí sinh bị phân công nhiều lần.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_rooms) as x(value)
     where nullif(btrim(x.value->>'room_code'), '') is null
        or coalesce((x.value->>'room_number')::integer, 0) < p_first_room_number
        or coalesce((x.value->>'capacity')::integer, 0) <> p_capacity
        or coalesce((x.value->>'student_count')::integer, 0) < 1
        or coalesce((x.value->>'student_count')::integer, 0) > p_capacity
        or jsonb_typeof(x.value->'ca1_subject_codes') <> 'array'
        or jsonb_typeof(x.value->'ca2_subject_codes') <> 'array'
        or jsonb_array_length(coalesce(x.value->'ca1_subject_codes', '[]'::jsonb)) = 0
        or jsonb_array_length(coalesce(x.value->'ca2_subject_codes', '[]'::jsonb)) = 0
  ) then
    raise exception 'Một hoặc nhiều phòng thiếu mã, sĩ số hoặc danh sách môn theo ca hợp lệ.';
  end if;
  v_room_count := jsonb_array_length(p_rooms);
  if (
    select count(distinct x.value->>'room_code')
      from jsonb_array_elements(p_rooms) as x(value)
  ) <> v_room_count then
    raise exception 'Danh sách phòng có mã phòng bị trùng.';
  end if;
  if (
    select count(distinct (x.value->>'room_number')::integer)
      from jsonb_array_elements(p_rooms) as x(value)
  ) <> v_room_count then
    raise exception 'Danh sách phòng có số phòng bị trùng.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_rooms) as r(value)
      cross join lateral jsonb_array_elements_text(r.value->'ca1_subject_codes') as a(code)
      join lateral jsonb_array_elements_text(r.value->'ca2_subject_codes') as b(code)
        on b.code = a.code
  ) then
    raise exception 'Một môn không thể được xếp ở cả hai ca trong cùng phòng.';
  end if;

  for v_assignment in
    select x.value from jsonb_array_elements(p_assignments) as x(value)
  loop
    if coalesce(v_assignment->>'candidate_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Mã thí sinh trong phân công không hợp lệ.';
    end if;
    v_candidate_id := (v_assignment->>'candidate_id')::uuid;
    select * into v_candidate
      from public.exam_candidates
     where id = v_candidate_id and exam_id = p_exam_id;
    if not found then
      raise exception 'Thí sinh trong phân công không thuộc kỳ thi này.';
    end if;

    v_code1 := nullif(btrim(v_assignment->>'ca1_subject_code'), '');
    v_code2 := nullif(btrim(v_assignment->>'ca2_subject_code'), '');
    v_room_code := nullif(btrim(v_assignment->>'room_code'), '');
    if v_code1 is null or v_code2 is null or v_code1 = v_code2 then
      raise exception 'Cặp môn của thí sinh % không hợp lệ.', v_candidate.student_code;
    end if;

    if not (
      (
        exists (
          select 1 from public.exam_candidate_subjects s
           where s.exam_id = p_exam_id and s.candidate_id = v_candidate.id
             and s.subject_type = 'elective' and s.subject_order = 1
             and s.subject_code = v_code1
        )
        and exists (
          select 1 from public.exam_candidate_subjects s
           where s.exam_id = p_exam_id and s.candidate_id = v_candidate.id
             and s.subject_type = 'elective' and s.subject_order = 2
             and s.subject_code = v_code2
        )
      )
      or
      (
        exists (
          select 1 from public.exam_candidate_subjects s
           where s.exam_id = p_exam_id and s.candidate_id = v_candidate.id
             and s.subject_type = 'elective' and s.subject_order = 1
             and s.subject_code = v_code2
        )
        and exists (
          select 1 from public.exam_candidate_subjects s
           where s.exam_id = p_exam_id and s.candidate_id = v_candidate.id
             and s.subject_type = 'elective' and s.subject_order = 2
             and s.subject_code = v_code1
        )
      )
    ) then
      raise exception 'Môn được phân công không khớp đăng ký của mã học sinh %.',
        v_candidate.student_code;
    end if;

    if not exists (
      select 1
        from jsonb_array_elements(p_rooms) as r(value)
       where r.value->>'room_code' = v_room_code
         and (r.value->'ca1_subject_codes') ? v_code1
         and (r.value->'ca2_subject_codes') ? v_code2
    ) then
      raise exception 'Phòng hoặc danh sách môn theo ca của thí sinh % không khớp phương án.',
        v_candidate.student_code;
    end if;
  end loop;

  if exists (
    select 1
      from public.exam_candidates c
     where c.exam_id = p_exam_id
       and exists (
         select 1 from public.exam_candidate_subjects s
          where s.exam_id = p_exam_id and s.candidate_id = c.id
            and s.subject_type = 'elective'
         group by s.candidate_id
        having count(*) = 2
           and count(distinct s.subject_code) = 2
           and count(*) filter (where s.subject_order = 1) = 1
           and count(*) filter (where s.subject_order = 2) = 1
       )
       and not exists (
         select 1 from jsonb_array_elements(p_assignments) as x(value)
          where x.value->>'candidate_id' = c.id::text
       )
  ) then
    raise exception 'Có thí sinh đủ điều kiện nhưng chưa được phân phòng.';
  end if;

  for v_room in
    select x.value from jsonb_array_elements(p_rooms) as x(value)
  loop
    v_room_code := v_room->>'room_code';
    v_room_number := (v_room->>'room_number')::integer;
    v_room_capacity := (v_room->>'capacity')::integer;
    v_student_count := (v_room->>'student_count')::integer;

    if (
      select count(*)
        from jsonb_array_elements(p_assignments) as x(value)
       where x.value->>'room_code' = v_room_code
    ) <> v_student_count then
      raise exception 'Sĩ số khai báo của phòng % không khớp danh sách phân công.', v_room_code;
    end if;
  end loop;

  insert into public.exam_elective_room_plans(
    exam_id, capacity, room_prefix, first_room_number, status, algorithm_code,
    input_snapshot, result_summary, created_by, locked_by, locked_at
  ) values (
    p_exam_id, p_capacity, trim(p_room_prefix), p_first_room_number,
    case when p_lock then 'locked' else 'saved' end,
    'same_pair_per_room_v2',
    jsonb_build_object('candidate_count', v_exam_count),
    jsonb_build_object('candidate_count', v_exam_count, 'room_count', v_room_count, 'capacity', p_capacity),
    auth.uid(),
    case when p_lock then auth.uid() end,
    case when p_lock then now() end
  ) returning id into v_plan_id;

  for v_room in
    select x.value
      from jsonb_array_elements(p_rooms) as x(value)
     order by (x.value->>'room_number')::integer
  loop
    v_first_room_subject := v_room->'ca1_subject_codes'->>0;
    v_second_room_subject := v_room->'ca2_subject_codes'->>0;
    insert into public.exam_elective_room_plan_rooms(
      plan_id, room_number, room_code, capacity, student_count,
      ca1_subject_code, ca2_subject_code, ca1_subject_codes, ca2_subject_codes
    ) values (
      v_plan_id,
      (v_room->>'room_number')::integer,
      v_room->>'room_code',
      (v_room->>'capacity')::integer,
      (v_room->>'student_count')::integer,
      v_first_room_subject,
      v_second_room_subject,
      v_room->'ca1_subject_codes',
      v_room->'ca2_subject_codes'
    ) returning id into v_room_id;
    v_room_ids := v_room_ids || jsonb_build_object(v_room->>'room_code', v_room_id::text);
  end loop;

  for v_assignment in
    select x.value from jsonb_array_elements(p_assignments) as x(value)
  loop
    insert into public.exam_elective_room_plan_candidates(
      plan_id, candidate_id, room_plan_id, ca1_subject_code, ca2_subject_code
    ) values (
      v_plan_id,
      (v_assignment->>'candidate_id')::uuid,
      (v_room_ids->>(v_assignment->>'room_code'))::uuid,
      v_assignment->>'ca1_subject_code',
      v_assignment->>'ca2_subject_code'
    );
  end loop;

  return jsonb_build_object(
    'plan_id', v_plan_id,
    'exam_id', p_exam_id,
    'status', case when p_lock then 'locked' else 'saved' end,
    'room_count', v_room_count,
    'candidate_count', v_exam_count
  );
end;
$function$;

revoke all on function public.exam_save_elective_room_plan(uuid, integer, text, integer, jsonb, jsonb, boolean) from public;
grant execute on function public.exam_save_elective_room_plan(uuid, integer, text, integer, jsonb, jsonb, boolean) to authenticated;
