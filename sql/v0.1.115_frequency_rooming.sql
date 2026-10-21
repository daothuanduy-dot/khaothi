-- v0.1.115: apply after v0.1.114; preserve existing rooms and SBD.
-- Requires v0.1.91/v0.1.92 room plans and v0.1.44 SBD assignment.
-- Does not reset any existing SBD or move any candidate.
begin;
create or replace function public.exam_number_saved_elective_plan(
 p_plan_id uuid, p_expected_rooms jsonb, p_expected_assignments jsonb,
 p_sbd_prefix text, p_sbd_length integer, p_start_number integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_plan public.exam_rooming_round_plans%rowtype;
 v_exam uuid;
 v_start integer;
 v_assignments jsonb;
 v_rooms jsonb;
begin
 if auth.uid() is null or not public.exam_is_admin() then
  raise exception 'Khong co quyen cap SBD.' using errcode='42501';
 end if;
 select exam_id into v_exam from public.exam_rooming_round_plans where id=p_plan_id;
 if v_exam is null then raise exception 'Khong tim thay phong da luu.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_exam::text,0));
 -- Prevent concurrent roster/registration changes and new room drafts during validation.
 lock table public.exam_candidates, public.exam_candidate_subjects,
  public.exam_rounds, public.exam_round_candidates, public.exam_round_subjects,
  public.exam_rooming_round_plans in share row exclusive mode nowait;
 select * into v_plan from public.exam_rooming_round_plans where id=p_plan_id for update;
 if v_plan.id is null or v_plan.status<>'saved' or v_plan.plan_type<>'elective' then
  raise exception 'Can phuong an phong to hop da luu, chua chinh thuc.';
 end if;
 if v_plan.rooms is distinct from p_expected_rooms or v_plan.assignments is distinct from p_expected_assignments
  or exists(select 1 from public.exam_rooming_round_plans p where p.exam_id=v_exam
   and p.round_no=v_plan.round_no and p.plan_type='elective'
   and (p.status='official' or p.created_at>v_plan.created_at)) then
  raise exception 'Phuong an da thay doi. Hay tai lai phong va xem truoc SBD.';
 end if;
 if p_sbd_prefix is null or p_sbd_prefix !~ '^[0-9]{2,3}$' or p_sbd_length is null
  or p_sbd_length not in (6,8) or p_start_number is null or p_start_number<1 then
  raise exception 'Dai SBD khong hop le.';
 end if;
 perform public.exam_validate_rooming_round(v_exam,v_plan.round_no,'elective',null,
  v_plan.capacity,v_plan.rooms,v_plan.assignments);
 if exists(select 1 from jsonb_array_elements(v_plan.assignments) a
  join public.exam_candidates c on c.id=(a->>'candidate_id')::uuid
  where nullif(btrim(c.sbd),'') is not null or nullif(btrim(a->>'sbd'),'') is not null) then
  raise exception 'Thi sinh da co SBD; khong duoc cap lai.';
 end if;
 if exists(select 1 from jsonb_array_elements(v_plan.rooms) r
  where coalesce(r->>'room_number','') !~ '^[1-9][0-9]*$')
  or (select count(distinct (r->>'room_number')::integer) from jsonb_array_elements(v_plan.rooms) r)<>jsonb_array_length(v_plan.rooms)
  or exists(select 1 from jsonb_array_elements(v_plan.assignments) a
   where coalesce(a->>'seat_number','') !~ '^[1-9][0-9]*$') then
  raise exception 'Phong chua co so phong/vi tri hop le. Hay xep va luu lai.';
 end if;
 if exists(select 1 from jsonb_array_elements(v_plan.assignments) a group by a->>'room_code'
  having count(distinct (a->>'seat_number')::integer)<>count(*)
   or min((a->>'seat_number')::integer)<>1 or max((a->>'seat_number')::integer)<>count(*)) then
  raise exception 'Vi tri trong phong khong lien tuc.';
 end if;
 -- Ca 1 forms contiguous blocks; Ca 2 is grouped only within its Ca 1 block.
 if exists(
  select 1 from jsonb_array_elements(v_plan.assignments) a
  group by a->>'room_code',a->>'ca1_subject_code'
  having max((a->>'seat_number')::integer)-min((a->>'seat_number')::integer)+1<>count(*)
 ) or exists(
  select 1 from jsonb_array_elements(v_plan.assignments) a
  group by a->>'room_code',a->>'ca1_subject_code',a->>'ca2_subject_code'
  having max((a->>'seat_number')::integer)-min((a->>'seat_number')::integer)+1<>count(*)
 ) then
  raise exception 'Nhom mon chua lien tuc theo ca 1. Hay xep va luu lai phong.';
 end if;
 select coalesce(max(substring(sbd from length(p_sbd_prefix)+1)::integer),0)+1 into v_start
  from public.exam_candidates where exam_id=v_exam
   and sbd ~ ('^'||p_sbd_prefix||'[0-9]{'||(p_sbd_length-length(p_sbd_prefix))::text||'}$');
 if v_start<>p_start_number then raise exception 'Dai SBD da thay doi. Hay xem truoc lai.'; end if;
 if v_start+jsonb_array_length(v_plan.assignments)-1>=power(10,p_sbd_length-length(p_sbd_prefix)) then
  raise exception 'Khong du dai SBD.';
 end if;
 with ordered as (
  select a, row_number() over(order by (r->>'room_number')::integer,(a->>'seat_number')::integer) n
  from jsonb_array_elements(v_plan.assignments) a
  join jsonb_array_elements(v_plan.rooms) r on r->>'room_code'=a->>'room_code'
 ) select jsonb_agg(a||jsonb_build_object('sbd',p_sbd_prefix||lpad((v_start+n-1)::text,p_sbd_length-length(p_sbd_prefix),'0')) order by n)
 into v_assignments from ordered;
 perform public.exam_assign_candidate_sbd(v_exam,v_assignments);
 select jsonb_agg(r||jsonb_build_object(
  'sbd_first',(select min(a->>'sbd') from jsonb_array_elements(v_assignments) a where a->>'room_code'=r->>'room_code'),
  'sbd_last',(select max(a->>'sbd') from jsonb_array_elements(v_assignments) a where a->>'room_code'=r->>'room_code'))
  order by (r->>'room_number')::integer) into v_rooms from jsonb_array_elements(v_plan.rooms) r;
 update public.exam_rooming_round_plans set assignments=v_assignments,rooms=v_rooms,updated_at=now() where id=p_plan_id;
 return jsonb_build_object('plan_id',p_plan_id,'assignment_count',jsonb_array_length(v_assignments));
end $$;
revoke all on function public.exam_number_saved_elective_plan(uuid,jsonb,jsonb,text,integer,integer) from public;
grant execute on function public.exam_number_saved_elective_plan(uuid,jsonb,jsonb,text,integer,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
