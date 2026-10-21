-- v0.1.62: short per-room script heads and optional grader assignment per bag.
-- Apply after v0.1.61.

create table if not exists public.exam_script_bag_assignments (
  run_id uuid not null references public.exam_script_runs(id) on delete restrict,
  room_code text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (run_id, room_code)
);

alter table public.exam_script_bag_assignments enable row level security;
drop policy if exists exam_script_bag_assignments_admin_select on public.exam_script_bag_assignments;
create policy exam_script_bag_assignments_admin_select on public.exam_script_bag_assignments
  for select to authenticated using (public.exam_is_admin());
revoke all on public.exam_script_bag_assignments from anon, authenticated;
grant select on public.exam_script_bag_assignments to authenticated;

create or replace function public.exam_set_script_bag_assignments(p_run_id uuid,p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.exam_script_runs%rowtype;
  v_row jsonb;
  v_count integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền phân công giám khảo theo túi.' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'Danh sách phân công túi không hợp lệ.';
  end if;
  select * into v_run from public.exam_script_runs where id=p_run_id for update;
  if not found or v_run.status<>'locked' then
    raise exception 'Chỉ được phân công túi của phương án phách đã khóa.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if nullif(btrim(v_row->>'room_code'),'') is null
      or coalesce(v_row->>'user_id','') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Mỗi phân công phải có túi/phòng và UUID giám khảo hợp lệ.';
    end if;
    if not exists(select 1 from public.exam_script_records r
      where r.run_id=p_run_id and r.room_code=v_row->>'room_code') then
      raise exception 'Túi/phòng không thuộc phương án phách đã chọn.';
    end if;
    if not exists(select 1 from public.exam_grader_assignments g
      where g.exam_id=v_run.exam_id and g.subject_code=v_run.subject_code
        and g.user_id=(v_row->>'user_id')::uuid and g.active) then
      raise exception 'Giám khảo phải được phân công vào đúng môn trước khi nhận túi.';
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_rows) x(value)
    group by x.value->>'room_code' having count(*)>1) then
    raise exception 'Một túi/phòng chỉ được gán cho một giám khảo.';
  end if;

  delete from public.exam_script_bag_assignments where run_id=p_run_id;
  insert into public.exam_script_bag_assignments(run_id,room_code,user_id,assigned_by,assigned_at)
  select p_run_id,x.value->>'room_code',(x.value->>'user_id')::uuid,auth.uid(),now()
  from jsonb_array_elements(p_rows) x(value);
  get diagnostics v_count=row_count;
  return jsonb_build_object('run_id',p_run_id,'assigned_bag_count',v_count);
end;
$$;

create or replace function public.exam_can_grade_script_room(p_run_id uuid,p_room_code text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists(
      select 1
      from public.exam_script_runs r
      join public.exam_grader_assignments g
        on g.exam_id=r.exam_id and g.subject_code=r.subject_code
       and g.user_id=auth.uid() and g.active
      where r.id=p_run_id and (
        not exists(select 1 from public.exam_script_bag_assignments b
          where b.run_id=p_run_id and b.room_code=p_room_code)
        or exists(select 1 from public.exam_script_bag_assignments b
          where b.run_id=p_run_id and b.room_code=p_room_code and b.user_id=auth.uid())
      )
    );
$$;

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
    raise exception 'Không có quyền đánh phách.' using errcode='42501';
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

  if exists(select 1 from jsonb_array_elements(p_room_order) x(value)
    group by x.value->>'room_code' having count(*)>1) then
    raise exception 'Danh sách túi/phòng có mã bị trùng.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_room_order) x(value)
    where nullif(btrim(x.value->>'room_code'),'') is null
      or jsonb_typeof(x.value->'position') is distinct from 'number'
      or coalesce((x.value->>'position') !~ '^[1-9][0-9]{0,5}$',true)
      or coalesce(x.value->>'reverse','false') not in ('true','false')
      or nullif(btrim(x.value->>'phach_prefix'),'') is null
      or btrim(x.value->>'phach_prefix') !~ '^[A-Za-z]{1,3}$') then
    raise exception 'Tên phòng, đầu phách hoặc thứ tự túi/phòng không hợp lệ.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_room_order) x(value)
    where nullif(btrim(x.value->>'phach_prefix'),'') is not null
    group by upper(btrim(x.value->>'phach_prefix')) having count(*)>1) then
    raise exception 'Đầu phách mỗi phòng phải khác nhau.';
  end if;

  select count(distinct a.room_code),count(*)
    into v_room_count,v_candidate_count
  from public.exam_room_assignments a
  where a.finalization_id=v_finalization_id
    and (a.subject_code=upper(btrim(p_subject_code))
      or a.ca1_subject_code=upper(btrim(p_subject_code))
      or a.ca2_subject_code=upper(btrim(p_subject_code)));
  if v_candidate_count=0 then raise exception 'Không có thí sinh được phân vào môn đã chọn.'; end if;
  if exists(
    select a.room_code,count(*) from public.exam_room_assignments a
    where a.finalization_id=v_finalization_id
      and (a.subject_code=upper(btrim(p_subject_code))
        or a.ca1_subject_code=upper(btrim(p_subject_code))
        or a.ca2_subject_code=upper(btrim(p_subject_code)))
    group by a.room_code having count(*)>100
  ) then raise exception 'Mỗi phòng không được vượt quá 100 bài thi.'; end if;
  if jsonb_array_length(p_room_order)>0 and jsonb_array_length(p_room_order)<>v_room_count then
    raise exception 'Danh sách sắp xếp túi phải bao gồm tất cả các phòng có bài thi môn này.';
  end if;
  if jsonb_array_length(p_room_order)>0 and (
    (select count(distinct (x.value->>'position')::integer) from jsonb_array_elements(p_room_order) x(value))<>v_room_count
    or (select min((x.value->>'position')::integer) from jsonb_array_elements(p_room_order) x(value))<>1
    or (select max((x.value->>'position')::integer) from jsonb_array_elements(p_room_order) x(value))<>v_room_count
  ) then raise exception 'Thứ tự túi/phòng phải liên tục và duy nhất từ 1 đến số phòng.'; end if;
  if jsonb_array_length(p_room_order)>0 and exists(
    select distinct a.room_code from public.exam_room_assignments a
    where a.finalization_id=v_finalization_id
      and (a.subject_code=upper(btrim(p_subject_code))
        or a.ca1_subject_code=upper(btrim(p_subject_code))
        or a.ca2_subject_code=upper(btrim(p_subject_code)))
    except select x.value->>'room_code' from jsonb_array_elements(p_room_order) x(value)
  ) then raise exception 'Danh sách túi/phòng không khớp các phòng có bài thi môn này.'; end if;

  insert into public.exam_script_runs(exam_id,subject_code,method,absence_mode,room_order,created_by)
  values(p_exam_id,upper(btrim(p_subject_code)),p_method,p_absence_mode,coalesce(p_room_order,'[]'::jsonb),auth.uid())
  returning id into v_run_id;

  with source as (
    select a.candidate_id,a.room_code,a.sbd,
      exists(select 1 from public.exam_absences x
        where x.exam_id=p_exam_id and x.candidate_id=a.candidate_id
          and x.subject_code in ('*',upper(btrim(p_subject_code)))) as is_absent,
      coalesce((select (x.value->>'position')::integer from jsonb_array_elements(p_room_order) x(value)
        where x.value->>'room_code'=a.room_code),0) as requested_position,
      coalesce((select (x.value->>'reverse')::boolean from jsonb_array_elements(p_room_order) x(value)
        where x.value->>'room_code'=a.room_code),false) as reverse_room,
      coalesce((select upper(nullif(btrim(x.value->>'phach_prefix'),'')) from jsonb_array_elements(p_room_order) x(value)
        where x.value->>'room_code'=a.room_code),'') as requested_prefix
    from public.exam_room_assignments a
    join public.exam_candidates c on c.id=a.candidate_id and c.exam_id=p_exam_id
    where a.finalization_id=v_finalization_id
      and (a.subject_code=upper(btrim(p_subject_code))
        or a.ca1_subject_code=upper(btrim(p_subject_code))
        or a.ca2_subject_code=upper(btrim(p_subject_code)))
  ), room_ranks as (
    select room_code,requested_prefix,
      row_number() over(order by case when jsonb_array_length(p_room_order)>0 then requested_position else 0 end,room_code) as room_rank
    from (select distinct room_code,requested_position,requested_prefix from source) r
  ), ordered_source as (
    select s.*,rr.room_rank,
      row_number() over(partition by s.room_code order by
        case when s.reverse_room then -s.sbd::numeric else s.sbd::numeric end,s.candidate_id) as room_order_no,
      row_number() over(order by
        case when p_method in ('room','bag') then rr.room_rank else 0 end,
        case when s.reverse_room then -s.sbd::numeric else s.sbd::numeric end,s.candidate_id) as script_order_no
    from source s join room_ranks rr using(room_code)
  ), sequenced as (
    select o.*,
      sum(case when p_absence_mode='gap' or not is_absent then 1 else 0 end)
        over(partition by room_code order by room_order_no) as compact_room_no,
      sum(case when p_absence_mode='gap' or not is_absent then 1 else 0 end)
        over(order by script_order_no) as compact_script_no
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
  return jsonb_build_object('run_id',v_run_id,'exam_id',p_exam_id,'subject_code',upper(btrim(p_subject_code)),
    'method',p_method,'record_count',v_candidate_count,'room_count',v_room_count,'status','draft');
end;
$$;

create or replace function public.exam_get_grading_queue(
  p_exam_id uuid,p_subject_code text,p_phach_prefix text default ''
) returns table(phach_code text,score numeric,updated_at timestamptz)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.exam_grader_assignments g
    where g.exam_id=p_exam_id and g.subject_code=upper(btrim(p_subject_code))
      and g.user_id=auth.uid() and g.active) then
    raise exception 'Tài khoản chưa được thêm vào danh sách giám khảo môn này.' using errcode='42501';
  end if;
  return query
  select r.phach_code,s.score,s.updated_at
  from public.exam_script_runs run
  join public.exam_script_records r on r.run_id=run.id
  left join public.exam_script_scores s on s.script_record_id=r.id
  where run.id=(select latest.id from public.exam_script_runs latest
    where latest.exam_id=p_exam_id and latest.subject_code=upper(btrim(p_subject_code))
      and latest.status='locked' order by latest.locked_at desc limit 1)
    and not r.is_absent and r.phach_code is not null
    and r.phach_code like coalesce(p_phach_prefix,'')||'%'
    and public.exam_can_grade_script_room(run.id,r.room_code)
  order by r.phach_code;
end;
$$;

create or replace function public.exam_save_script_score(
  p_exam_id uuid,p_subject_code text,p_phach_code text,p_score numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_script_id uuid;
  v_previous_score numeric;
  v_config public.exam_subject_assessment_configs%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.exam_grader_assignments g
    where g.exam_id=p_exam_id and g.subject_code=upper(btrim(p_subject_code))
      and g.user_id=auth.uid() and g.active) then
    raise exception 'Tài khoản chưa được thêm vào danh sách giám khảo môn này.' using errcode='42501';
  end if;
  select * into v_config from public.exam_subject_assessment_configs
  where exam_id=p_exam_id and subject_code=upper(btrim(p_subject_code)) and is_essay;
  if not found then raise exception 'Chưa cấu hình thang điểm môn tự luận.'; end if;
  if p_score is null or p_score<0 or p_score>v_config.maximum_score
    or mod(p_score,v_config.score_step)<>0 then
    raise exception 'Điểm phải từ 0 đến % và theo bước điểm %.',v_config.maximum_score,v_config.score_step;
  end if;
  select rec.id into v_script_id
  from public.exam_script_runs run
  join public.exam_script_records rec on rec.run_id=run.id
  where run.id=(select latest.id from public.exam_script_runs latest
    where latest.exam_id=p_exam_id and latest.subject_code=upper(btrim(p_subject_code))
      and latest.status='locked' order by latest.locked_at desc limit 1)
    and not rec.is_absent and rec.phach_code=p_phach_code
    and public.exam_can_grade_script_room(run.id,rec.room_code)
  limit 1;
  if v_script_id is null then raise exception 'Không tìm thấy phách hoặc túi bài thi chưa được phân công cho tài khoản này.'; end if;
  select score into v_previous_score from public.exam_script_scores where script_record_id=v_script_id;
  insert into public.exam_script_scores(script_record_id,score,entered_by,entered_at,updated_at)
  values(v_script_id,p_score,auth.uid(),now(),now())
  on conflict (script_record_id) do update set
    score=excluded.score,entered_by=auth.uid(),entered_at=now(),updated_at=now();
  insert into public.exam_script_score_events(script_record_id,previous_score,new_score,changed_by)
  values(v_script_id,v_previous_score,p_score,auth.uid());
  return jsonb_build_object('phach_code',p_phach_code,'score',p_score);
end;
$$;

revoke all on function public.exam_set_script_bag_assignments(uuid,jsonb) from public;
revoke all on function public.exam_can_grade_script_room(uuid,text) from public;
revoke all on function public.exam_create_script_run(uuid,text,text,text,jsonb) from public;
revoke all on function public.exam_get_grading_queue(uuid,text,text) from public;
revoke all on function public.exam_save_script_score(uuid,text,text,numeric) from public;
grant execute on function public.exam_set_script_bag_assignments(uuid,jsonb) to authenticated;
grant execute on function public.exam_create_script_run(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.exam_get_grading_queue(uuid,text,text) to authenticated;
grant execute on function public.exam_save_script_score(uuid,text,text,numeric) to authenticated;
