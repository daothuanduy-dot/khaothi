-- v0.1.118: allow script generation to consume official rooming round plans.
-- The five-argument function remains available for legacy finalizations.

create or replace function public.exam_create_script_run(
  p_exam_id uuid,
  p_subject_code text,
  p_method text,
  p_absence_mode text,
  p_room_order jsonb default '[]'::jsonb,
  p_round_no smallint default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_source jsonb := '[]'::jsonb;
  v_room_count integer;
  v_candidate_count integer;
  v_code text := upper(btrim(p_subject_code));
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Khong co quyen danh phach.' using errcode='42501';
  end if;
  if p_exam_id is null or nullif(v_code,'') is null
    or p_method not in ('room','bag','random')
    or p_absence_mode not in ('compact','gap')
    or p_room_order is null or jsonb_typeof(p_room_order)<>'array'
    or (p_round_no is not null and p_round_no not in (1,2)) then
    raise exception 'Thong tin phuong an danh phach khong hop le.';
  end if;

  if p_round_no is null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'candidate_id',a.candidate_id,
      'room_code',a.room_code,
      'sbd',a.sbd,
      'subject_code',a.subject_code,
      'ca1_subject_code',a.ca1_subject_code,
      'ca2_subject_code',a.ca2_subject_code
    )), '[]'::jsonb)
      into v_source
    from public.exam_room_assignments a
    join public.exam_rooming_finalizations f on f.id=a.finalization_id
    where f.exam_id=p_exam_id and f.is_current
      and ((f.plan_type='mandatory' and f.subject_code=v_code)
        or (f.plan_type='elective' and f.subject_code is null))
      and (a.subject_code=v_code or a.ca1_subject_code=v_code or a.ca2_subject_code=v_code);
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'candidate_id',a.value->>'candidate_id',
      'room_code',a.value->>'room_code',
      'sbd',a.value->>'sbd',
      'subject_code',coalesce(a.value->>'subject_code',p.subject_code),
      'ca1_subject_code',a.value->>'ca1_subject_code',
      'ca2_subject_code',a.value->>'ca2_subject_code'
    )), '[]'::jsonb)
      into v_source
    from public.exam_rooming_round_plans p
    cross join lateral jsonb_array_elements(p.assignments) a(value)
    where p.exam_id=p_exam_id and p.round_no=p_round_no and p.status='official'
      and ((p.plan_type in ('mandatory','subject') and p.subject_code=v_code)
        or p.plan_type='elective')
      and ((coalesce(a.value->>'subject_code',p.subject_code)=v_code)
        or a.value->>'ca1_subject_code'=v_code
        or a.value->>'ca2_subject_code'=v_code);
  end if;

  select count(distinct value->>'room_code'),count(*)
    into v_room_count,v_candidate_count
  from jsonb_array_elements(v_source) x(value);
  if v_candidate_count=0 then
    raise exception 'Chua co phan phong chinh thuc cho mon %.',v_code;
  end if;
  if exists(
    select 1 from jsonb_array_elements(v_source) x(value)
    group by value->>'room_code' having count(*)>100
  ) then
    raise exception 'Moi phong khong duoc vuot qua 100 bai thi.';
  end if;
  if jsonb_array_length(p_room_order)>0 and jsonb_array_length(p_room_order)<>v_room_count then
    raise exception 'Danh sach sap xep tui phai bao gom tat ca cac phong.';
  end if;
  if jsonb_array_length(p_room_order)>0 and exists(
    select 1 from jsonb_array_elements(p_room_order) x(value)
    where nullif(btrim(value->>'room_code'),'') is null
      or jsonb_typeof(value->'position') is distinct from 'number'
      or coalesce((value->>'position') !~ '^[1-9][0-9]{0,5}$',true)
      or coalesce(value->>'reverse','false') not in ('true','false')
      or nullif(btrim(value->>'phach_prefix'),'') is null
      or btrim(value->>'phach_prefix') !~ '^[A-Z]$'
  ) then
    raise exception 'Ten phong, dau phach hoac thu tu tui khong hop le.';
  end if;
  if jsonb_array_length(p_room_order)>0 and exists(
    select 1 from jsonb_array_elements(p_room_order) x(value)
    group by upper(btrim(value->>'phach_prefix')) having count(*)>1
  ) then
    raise exception 'Dau phach moi phong phai khac nhau.';
  end if;
  if jsonb_array_length(p_room_order)>0 and (
    (select count(distinct (value->>'position')::integer) from jsonb_array_elements(p_room_order) x(value))<>v_room_count
    or (select min((value->>'position')::integer) from jsonb_array_elements(p_room_order) x(value))<>1
    or (select max((value->>'position')::integer) from jsonb_array_elements(p_room_order) x(value))<>v_room_count
  ) then
    raise exception 'Thu tu tui phai lien tuc va duy nhat tu 1 den so phong.';
  end if;
  if jsonb_array_length(p_room_order)>0 and exists(
    select 1 from jsonb_array_elements(v_source) x(value)
    where value->>'room_code' not in (select y.value->>'room_code' from jsonb_array_elements(p_room_order) y(value))
  ) then
    raise exception 'Danh sach tui/phong khong khop phan phong.';
  end if;

  insert into public.exam_script_runs(exam_id,subject_code,method,absence_mode,room_order,created_by)
  values(p_exam_id,v_code,p_method,p_absence_mode,coalesce(p_room_order,'[]'::jsonb),auth.uid())
  returning id into v_run_id;

  with source as (
    select (x.value->>'candidate_id')::uuid candidate_id,
      x.value->>'room_code' room_code,
      x.value->>'sbd' sbd,
      exists(select 1 from public.exam_absences absent
        where absent.exam_id=p_exam_id and absent.candidate_id=(x.value->>'candidate_id')::uuid
          and absent.subject_code in ('*',v_code)) is_absent,
      coalesce((select (r.value->>'position')::integer from jsonb_array_elements(p_room_order) r(value)
        where r.value->>'room_code'=x.value->>'room_code'),0) requested_position,
      coalesce((select (r.value->>'reverse')::boolean from jsonb_array_elements(p_room_order) r(value)
        where r.value->>'room_code'=x.value->>'room_code'),false) reverse_room,
      coalesce((select upper(nullif(btrim(r.value->>'phach_prefix'),'')) from jsonb_array_elements(p_room_order) r(value)
        where r.value->>'room_code'=x.value->>'room_code'),'') requested_prefix
    from jsonb_array_elements(v_source) x(value)
    join public.exam_candidates c on c.id=(x.value->>'candidate_id')::uuid and c.exam_id=p_exam_id
  ), room_ranks as (
    select room_code,requested_prefix,
      row_number() over(order by case when jsonb_array_length(p_room_order)>0 then requested_position else 0 end,room_code) room_rank
    from (select distinct room_code,requested_position,requested_prefix from source) r
  ), ordered_source as (
    select s.*,rr.room_rank,
      row_number() over(partition by s.room_code order by case when s.reverse_room then -s.sbd::numeric else s.sbd::numeric end,s.candidate_id) room_order_no,
      row_number() over(order by case when p_method in ('room','bag') then rr.room_rank else 0 end,
        case when s.reverse_room then -s.sbd::numeric else s.sbd::numeric end,s.candidate_id) script_order_no
    from source s join room_ranks rr using(room_code)
  ), sequenced as (
    select o.*,
      sum(case when p_absence_mode='gap' or not is_absent then 1 else 0 end)
        over(partition by room_code order by room_order_no) compact_room_no,
      sum(case when p_absence_mode='gap' or not is_absent then 1 else 0 end)
        over(order by script_order_no) compact_script_no
    from ordered_source o
  )
  insert into public.exam_script_records(run_id,candidate_id,room_code,sbd,script_order,room_order,phach_code,is_absent)
  select v_run_id,candidate_id,room_code,sbd,script_order_no,room_order_no,
    case
      when is_absent and p_absence_mode='compact' then null
      when p_method='room' then coalesce(nullif(requested_prefix,''),public.exam_script_alpha_prefix(room_rank::integer))||compact_room_no::text
      when p_method='bag' then compact_script_no::text
      else upper(replace(gen_random_uuid()::text,'-',''))
    end,is_absent
  from sequenced;

  update public.exam_script_runs set record_count=(select count(*) from public.exam_script_records where run_id=v_run_id)
  where id=v_run_id;
  return jsonb_build_object('run_id',v_run_id,'exam_id',p_exam_id,'subject_code',v_code,
    'method',p_method,'record_count',v_candidate_count,'room_count',v_room_count,'status','draft');
end;
$$;

revoke all on function public.exam_create_script_run(uuid,text,text,text,jsonb,smallint) from public;
grant execute on function public.exam_create_script_run(uuid,text,text,text,jsonb,smallint) to authenticated;
