-- v0.1.60: every exam subject has a written component and can be anonymized.
-- Apply after v0.1.59; score configuration remains required only for grading.

create or replace function public.exam_create_script_run(
  p_exam_id uuid,p_subject_code text,p_method text,p_absence_mode text,p_room_order jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_finalization_id uuid;
  v_room_count integer;
  v_candidate_count integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền đánh phách.' using errcode = '42501';
  end if;
  if p_exam_id is null or nullif(btrim(p_subject_code),'') is null
    or p_method not in ('room','bag','random') or p_absence_mode not in ('compact','gap')
    or p_room_order is null or jsonb_typeof(p_room_order)<>'array' then
    raise exception 'Thông tin phương án đánh phách không hợp lệ.';
  end if;
  select f.id into v_finalization_id
  from public.exam_rooming_finalizations f
  where f.exam_id=p_exam_id and f.is_current
    and ((f.plan_type='mandatory' and f.subject_code=upper(btrim(p_subject_code)))
      or (f.plan_type='elective' and f.subject_code is null))
  order by f.finalized_at desc limit 1;
  if v_finalization_id is null then raise exception 'Chưa có phương án phân phòng chính thức cho kỳ thi/môn này.'; end if;

  if exists(
    select 1 from jsonb_array_elements(p_room_order) with ordinality x(value,ord)
    group by x.value->>'room_code' having count(*)>1
  ) then raise exception 'Danh sách túi/phòng có mã bị trùng.'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_room_order) x(value)
    where nullif(btrim(x.value->>'room_code'),'') is null
      or jsonb_typeof(x.value->'position') is distinct from 'number'
      or coalesce((x.value->>'position') !~ '^[1-9][0-9]{0,5}$',true)
      or coalesce(x.value->>'reverse','false') not in ('true','false')
  ) then raise exception 'Thứ tự túi/phòng hoặc cờ đảo thứ tự không hợp lệ.'; end if;

  select count(distinct a.room_code),count(*)
    into v_room_count,v_candidate_count
  from public.exam_room_assignments a
  where a.finalization_id=v_finalization_id
    and (a.subject_code=upper(btrim(p_subject_code))
      or a.ca1_subject_code=upper(btrim(p_subject_code))
      or a.ca2_subject_code=upper(btrim(p_subject_code)));
  if v_candidate_count=0 then raise exception 'Không có thí sinh được phân vào môn đã chọn.'; end if;

  if jsonb_array_length(p_room_order)>0 and jsonb_array_length(p_room_order)<>v_room_count then
    raise exception 'Danh sách sắp xếp túi phải bao gồm tất cả các phòng có bài thi môn này.';
  end if;
  if jsonb_array_length(p_room_order)>0 and (
    (select count(distinct (x.value->>'position')::integer)
      from jsonb_array_elements(p_room_order) x(value))<>v_room_count
    or (select min((x.value->>'position')::integer)
      from jsonb_array_elements(p_room_order) x(value))<>1
    or (select max((x.value->>'position')::integer)
      from jsonb_array_elements(p_room_order) x(value))<>v_room_count
  ) then raise exception 'Thứ tự túi/phòng phải liên tục và duy nhất từ 1 đến số phòng.'; end if;
  if jsonb_array_length(p_room_order)>0 and exists(
    select distinct a.room_code
    from public.exam_room_assignments a
    where a.finalization_id=v_finalization_id
      and (a.subject_code=upper(btrim(p_subject_code))
        or a.ca1_subject_code=upper(btrim(p_subject_code))
        or a.ca2_subject_code=upper(btrim(p_subject_code)))
    except
    select x.value->>'room_code' from jsonb_array_elements(p_room_order) x(value)
  ) then raise exception 'Danh sách túi/phòng không khớp các phòng có bài thi môn này.'; end if;

  insert into public.exam_script_runs(exam_id,subject_code,method,absence_mode,room_order,created_by)
  values(p_exam_id,upper(btrim(p_subject_code)),p_method,p_absence_mode,coalesce(p_room_order,'[]'::jsonb),auth.uid())
  returning id into v_run_id;

  with source as (
    select a.candidate_id,a.room_code,a.sbd,
      exists(select 1 from public.exam_absences x
        where x.exam_id=p_exam_id and x.candidate_id=a.candidate_id
          and x.subject_code in ('*',upper(btrim(p_subject_code)))) as is_absent,
      coalesce((select (x.value->>'position')::integer
        from jsonb_array_elements(p_room_order) x(value)
        where x.value->>'room_code'=a.room_code),0) as requested_position,
      coalesce((select (x.value->>'reverse')::boolean
        from jsonb_array_elements(p_room_order) x(value)
        where x.value->>'room_code'=a.room_code),false) as reverse_room
    from public.exam_room_assignments a
    join public.exam_candidates c on c.id=a.candidate_id and c.exam_id=p_exam_id
    where a.finalization_id=v_finalization_id
      and (a.subject_code=upper(btrim(p_subject_code))
        or a.ca1_subject_code=upper(btrim(p_subject_code))
        or a.ca2_subject_code=upper(btrim(p_subject_code)))
  ), room_ranks as (
    select room_code,
      row_number() over(order by
        case when jsonb_array_length(p_room_order)>0 then requested_position else 0 end,
        room_code) as room_rank
    from (select distinct room_code,requested_position from source) r
  ), ordered_source as (
    select s.*,rr.room_rank,
      row_number() over(partition by s.room_code order by
        case when s.reverse_room then -s.sbd::numeric else s.sbd::numeric end,
        s.candidate_id) as room_order_no,
      row_number() over(order by
        case when p_method in ('room','bag') then rr.room_rank else 0 end,
        case when s.reverse_room then -s.sbd::numeric else s.sbd::numeric end,
        s.candidate_id) as script_order_no
    from source s join room_ranks rr using(room_code)
  ), sequenced as (
    select o.*,
      sum(case when p_absence_mode='gap' or not is_absent then 1 else 0 end)
        over(partition by room_code order by room_order_no) as compact_room_no,
      sum(case when p_absence_mode='gap' or not is_absent then 1 else 0 end)
        over(order by script_order_no) as compact_script_no
    from ordered_source o
  )
  insert into public.exam_script_records(
    run_id,candidate_id,room_code,sbd,script_order,room_order,phach_code,is_absent
  )
  select v_run_id,candidate_id,room_code,sbd,script_order_no,room_order_no,
    case
      when is_absent and p_absence_mode='compact' then null
      when p_method='room' then public.exam_script_alpha_prefix(room_rank::integer)||
        lpad(compact_room_no::text,greatest(3,length(room_order_no::text)),'0')
      when p_method='bag' then lpad(compact_script_no::text,greatest(6,length(v_candidate_count::text)),'0')
      else upper(replace(gen_random_uuid()::text,'-',''))
    end,
    is_absent
  from sequenced;

  update public.exam_script_runs
  set record_count=(select count(*) from public.exam_script_records where run_id=v_run_id)
  where id=v_run_id;
  return jsonb_build_object('run_id',v_run_id,'exam_id',p_exam_id,'subject_code',upper(btrim(p_subject_code)),
    'method',p_method,'record_count',v_candidate_count,'room_count',v_room_count,'status','draft');
end;
$$;

revoke all on function public.exam_create_script_run(uuid,text,text,text,jsonb) from public;
grant execute on function public.exam_create_script_run(uuid,text,text,text,jsonb) to authenticated;
