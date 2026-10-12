-- KHAO THI THPT LE HONG PHONG - v0.1.0
-- RPC ghi phương án xếp phòng. Chạy sau 001_schema.sql.
begin;
create or replace function public.exam_save_elective_room_plan(
  p_exam_id uuid,
  p_capacity integer,
  p_room_prefix text,
  p_first_room_number integer,
  p_rooms jsonb,
  p_assignments jsonb,
  p_lock boolean default false
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
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
  v_locked_count integer;
  v_code1 text;
  v_code2 text;
  v_room_code text;
  v_room_no integer;
  v_room_capacity integer;
  v_student_count integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền quản trị khảo thí.' using errcode='42501';
  end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 100 then raise exception 'Sức chứa phòng phải từ 1 đến 100.'; end if;
  if coalesce(trim(p_room_prefix),'') = '' then raise exception 'Tiền tố phòng không được để trống.'; end if;
  if p_first_room_number < 1 then raise exception 'Số phòng bắt đầu phải lớn hơn 0.'; end if;
  if jsonb_typeof(p_rooms) <> 'array' or jsonb_array_length(p_rooms)=0 then raise exception 'Danh sách phòng rỗng.'; end if;
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments)=0 then raise exception 'Danh sách phân công rỗng.'; end if;

  select count(*) into v_exam_count from public.exam_candidates where exam_id=p_exam_id;
  v_assignment_count := jsonb_array_length(p_assignments);
  if v_exam_count=0 then raise exception 'Kỳ thi chưa có thí sinh.'; end if;
  if v_assignment_count <> v_exam_count then raise exception 'Số phân công (%) không bằng số thí sinh của kỳ thi (%).',v_assignment_count,v_exam_count; end if;
  if exists(select 1 from jsonb_array_elements(p_assignments) as x(value) group by x.value->>'candidate_id' having count(*)>1) then raise exception 'Có thí sinh bị phân công nhiều lần.'; end if;

  -- Validate every assignment against registered pair and room-level subject pair.
  for v_assignment in select x.value from jsonb_array_elements(p_assignments) as x(value) loop
    select * into v_candidate from public.exam_candidates where id=(v_assignment->>'candidate_id')::uuid and exam_id=p_exam_id;
    if not found then raise exception 'Thí sinh trong phân công không thuộc kỳ thi này.'; end if;
    v_code1 := v_assignment->>'ca1_subject_code'; v_code2 := v_assignment->>'ca2_subject_code';
    if v_code1=v_code2 then raise exception 'Một phòng không được thi cùng môn ở hai ca.'; end if;
    if not ((v_candidate.elective_1=v_code1 and v_candidate.elective_2=v_code2) or (v_candidate.elective_1=v_code2 and v_candidate.elective_2=v_code1)) then
      raise exception 'Môn được phân công không khớp đăng ký của SBD %.',v_candidate.sbd;
    end if;
    if not exists(select 1 from jsonb_array_elements(p_rooms) as x(value) where x.value->>'room_code'=v_assignment->>'room_code'
      and (x.value->>'ca1_subject_code')=v_code1 and (x.value->>'ca2_subject_code')=v_code2) then
      raise exception 'Phòng hoặc cặp môn của SBD % không khớp danh sách phòng.',v_candidate.sbd;
    end if;
  end loop;

  -- Check every candidate in this exam appears once.
  if exists(select c.id from public.exam_candidates c where c.exam_id=p_exam_id and not exists(
    select 1 from jsonb_array_elements(p_assignments) as x(value) where x.value->>'candidate_id'=c.id::text)) then
    raise exception 'Có thí sinh chưa được phân phòng.';
  end if;

  -- Check room count, capacity, and no duplicate subject between sessions.
  for v_room in select value from jsonb_array_elements(p_rooms) loop
    v_room_code := v_room->>'room_code'; v_room_no := (v_room->>'room_number')::integer;
    v_room_capacity := (v_room->>'capacity')::integer; v_student_count := (v_room->>'student_count')::integer;
    v_code1 := v_room->>'ca1_subject_code'; v_code2 := v_room->>'ca2_subject_code';
    if v_room_capacity <> p_capacity then raise exception 'Sức chứa phòng % không khớp cấu hình.',v_room_code; end if;
    if v_student_count < 1 or v_student_count > p_capacity then raise exception 'Sĩ số phòng % không hợp lệ.',v_room_code; end if;
    if v_code1=v_code2 then raise exception 'Phòng % bị trùng môn giữa hai ca.',v_room_code; end if;
    if (select count(*) from jsonb_array_elements(p_assignments) as x(value) where x.value->>'room_code'=v_room_code) <> v_student_count then
      raise exception 'Sĩ số khai báo của phòng % không khớp danh sách phân công.',v_room_code;
    end if;
  end loop;
  v_room_count := jsonb_array_length(p_rooms);

  insert into public.exam_elective_room_plans(exam_id,capacity,room_prefix,first_room_number,status,algorithm_code,input_snapshot,result_summary,created_by,locked_by,locked_at)
  values(p_exam_id,p_capacity,trim(p_room_prefix),p_first_room_number,case when p_lock then 'locked' else 'saved' end,
    'same_pair_per_room_v1',jsonb_build_object('candidate_count',v_exam_count),jsonb_build_object('candidate_count',v_exam_count,'room_count',v_room_count,'capacity',p_capacity),auth.uid(),case when p_lock then auth.uid() end,case when p_lock then now() end)
  returning id into v_plan_id;

  for v_room in select x.value from jsonb_array_elements(p_rooms) as x(value) order by (x.value->>'room_number')::integer loop
    insert into public.exam_elective_room_plan_rooms(plan_id,room_number,room_code,capacity,student_count,ca1_subject_code,ca2_subject_code)
    values(v_plan_id,(v_room->>'room_number')::integer,v_room->>'room_code',(v_room->>'capacity')::integer,(v_room->>'student_count')::integer,v_room->>'ca1_subject_code',v_room->>'ca2_subject_code')
    returning id into v_room_id;
    v_room_ids := v_room_ids || jsonb_build_object(v_room->>'room_code',v_room_id::text);
  end loop;
  for v_assignment in select x.value from jsonb_array_elements(p_assignments) as x(value) loop
    insert into public.exam_elective_room_plan_candidates(plan_id,candidate_id,room_plan_id,ca1_subject_code,ca2_subject_code)
    values(v_plan_id,(v_assignment->>'candidate_id')::uuid,(v_room_ids->>(v_assignment->>'room_code'))::uuid,v_assignment->>'ca1_subject_code',v_assignment->>'ca2_subject_code');
  end loop;
  return jsonb_build_object('plan_id',v_plan_id,'exam_id',p_exam_id,'status',case when p_lock then 'locked' else 'saved' end,'room_count',v_room_count,'candidate_count',v_exam_count);
end;
$$;
revoke all on function public.exam_save_elective_room_plan(uuid,integer,text,integer,jsonb,jsonb,boolean) from public, anon;
grant execute on function public.exam_save_elective_room_plan(uuid,integer,text,integer,jsonb,jsonb,boolean) to authenticated;
commit;
