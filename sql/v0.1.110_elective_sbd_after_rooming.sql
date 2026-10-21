-- v0.1.110: save the optimized elective room order and assign SBD atomically.
-- The client must optimize rooms first; this RPC is the single commit point.

create or replace function public.exam_assign_sbd_by_elective_rooms(
  p_exam_id uuid,
  p_round_no smallint,
  p_capacity integer,
  p_room_prefix text,
  p_first_room_number integer,
  p_sbd_prefix text,
  p_sbd_length integer,
  p_rooms jsonb,
  p_assignments jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_plan jsonb;
  v_assignment jsonb;
  v_sbd text;
  v_candidate_id uuid;
  v_total integer;
  v_prefix text := btrim(coalesce(p_sbd_prefix, ''));
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Khong co quyen cap SBD va luu phuong an phong.' using errcode = '42501';
  end if;
  if p_round_no not in (1,2) or p_capacity < 1 or p_first_room_number < 1 then
    raise exception 'Dot thi, suc chua hoac so phong bat dau khong hop le.';
  end if;
  if p_sbd_length not in (6,8) or v_prefix !~ '^[0-9]{2,3}$'
     or length(v_prefix) >= p_sbd_length then
    raise exception 'Tien to va do dai SBD khong hop le.';
  end if;
  if jsonb_typeof(p_rooms) <> 'array' or jsonb_array_length(p_rooms)=0
     or jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments)=0 then
    raise exception 'Phuong an phong hoac danh sach thi sinh dang trong.';
  end if;

  -- This checks roster membership, room capacity, elective registration,
  -- room subject blocks, and the no-repeat-between-rounds rule.
  perform public.exam_validate_rooming_round(
    p_exam_id, p_round_no, 'elective', null, p_capacity, p_rooms, p_assignments
  );

  v_total := jsonb_array_length(p_assignments);
  if exists (
    select 1 from jsonb_array_elements(p_assignments) x(value)
    where coalesce(x.value->>'sbd','') !~ ('^' || v_prefix || '[0-9]{'
      || (p_sbd_length-length(v_prefix))::text || '}$')
  ) then
    raise exception 'SBD khong dung tien to hoac do dai da chon.';
  end if;
  if (select count(distinct value->>'sbd') from jsonb_array_elements(p_assignments)) <> v_total then
    raise exception 'Danh sach SBD bi trung.';
  end if;

  -- Preserve the immutable-SBD rule while allowing a retry with the same
  -- payload if the browser submits twice.
  for v_assignment in select value from jsonb_array_elements(p_assignments)
  loop
    v_candidate_id := (v_assignment->>'candidate_id')::uuid;
    v_sbd := v_assignment->>'sbd';
    if exists (
      select 1 from public.exam_candidates c
      where c.id=v_candidate_id and c.exam_id=p_exam_id
        and nullif(btrim(c.sbd),'') is not null and c.sbd<>v_sbd
    ) then
      raise exception 'Thi sinh % da co SBD khac trong ky thi.', v_candidate_id;
    end if;
  end loop;

  perform public.exam_assign_candidate_sbd(p_exam_id, p_assignments);
  v_plan := public.exam_save_rooming_round_plan(
    p_exam_id, p_round_no, 'elective', null, 'automatic', p_capacity,
    btrim(coalesce(p_room_prefix, 'P')), p_first_room_number, p_rooms, p_assignments, false
  );
  return jsonb_build_object(
    'exam_id', p_exam_id,
    'round_no', p_round_no,
    'assignment_count', v_total,
    'room_count', jsonb_array_length(p_rooms),
    'plan', v_plan
  );
end;
$function$;

revoke all on function public.exam_assign_sbd_by_elective_rooms(
  uuid, smallint, integer, text, integer, text, integer, jsonb, jsonb
) from public;
grant execute on function public.exam_assign_sbd_by_elective_rooms(
  uuid, smallint, integer, text, integer, text, integer, jsonb, jsonb
) to authenticated;
