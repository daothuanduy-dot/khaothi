-- v0.1.59: per-exam form headers, absence records, script anonymization and
-- tightly scoped grader access. Apply after the existing v0.1.55 migration.

alter table public.exam_sessions
  add column if not exists managing_authority text not null default '',
  add column if not exists institution_name text not null default '',
  add column if not exists form_exam_title text not null default '';

create table if not exists public.exam_subject_assessment_configs (
  exam_id uuid not null references public.exam_sessions(id) on delete restrict,
  subject_code text not null check (btrim(subject_code) <> ''),
  is_essay boolean not null default false,
  maximum_score numeric(6,3) null check (maximum_score is null or maximum_score > 0),
  score_step numeric(6,3) null check (score_step is null or score_step > 0),
  decimal_places smallint not null default 1 check (decimal_places between 0 and 3),
  default_score numeric(6,3) null check (default_score is null or default_score >= 0),
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (exam_id, subject_code),
  check (
    (not is_essay and maximum_score is null and score_step is null and default_score is null)
    or
    (is_essay and maximum_score is not null and score_step is not null
      and (default_score is null or default_score <= maximum_score))
  )
);

create table if not exists public.exam_absences (
  exam_id uuid not null references public.exam_sessions(id) on delete restrict,
  candidate_id uuid not null references public.exam_candidates(id) on delete restrict,
  subject_code text not null check (subject_code = '*' or btrim(subject_code) <> ''),
  reason text not null default '',
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (exam_id, candidate_id, subject_code)
);

create table if not exists public.exam_script_runs (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_sessions(id) on delete restrict,
  subject_code text not null check (btrim(subject_code) <> ''),
  method text not null check (method in ('room','bag','random')),
  absence_mode text not null check (absence_mode in ('compact','gap')),
  room_order jsonb not null default '[]'::jsonb check (jsonb_typeof(room_order) = 'array'),
  status text not null default 'draft' check (status in ('draft','locked')),
  record_count integer not null default 0 check (record_count >= 0),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  locked_by uuid null,
  locked_at timestamptz null
);

create index if not exists ix_exam_script_runs_exam_subject
  on public.exam_script_runs(exam_id, subject_code, created_at desc);

create table if not exists public.exam_script_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.exam_script_runs(id) on delete restrict,
  candidate_id uuid not null references public.exam_candidates(id) on delete restrict,
  room_code text not null,
  sbd text not null,
  script_order integer not null check (script_order > 0),
  room_order integer not null check (room_order > 0),
  phach_code text null,
  is_absent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (run_id, candidate_id),
  unique (run_id, phach_code)
);

create index if not exists ix_exam_script_records_run_phach
  on public.exam_script_records(run_id, phach_code);

create table if not exists public.exam_grader_assignments (
  exam_id uuid not null references public.exam_sessions(id) on delete restrict,
  subject_code text not null check (btrim(subject_code) <> ''),
  user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null default auth.uid(),
  assigned_at timestamptz not null default now(),
  active boolean not null default true,
  primary key (exam_id, subject_code, user_id)
);

create table if not exists public.exam_script_scores (
  script_record_id uuid primary key references public.exam_script_records(id) on delete restrict,
  score numeric(6,3) not null check (score >= 0),
  entered_by uuid not null references auth.users(id) on delete restrict,
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_script_score_events (
  id bigint generated always as identity primary key,
  script_record_id uuid not null references public.exam_script_records(id) on delete restrict,
  previous_score numeric(6,3) null,
  new_score numeric(6,3) not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create or replace function public.exam_current_user_role()
returns text
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return 'anonymous'; end if;
  if public.exam_is_admin() then return 'admin'; end if;
  if exists(select 1 from public.exam_grader_assignments g where g.user_id=auth.uid() and g.active) then
    return 'grader';
  end if;
  return 'unassigned';
end;
$$;

alter table public.exam_subject_assessment_configs enable row level security;
alter table public.exam_absences enable row level security;
alter table public.exam_script_runs enable row level security;
alter table public.exam_script_records enable row level security;
alter table public.exam_grader_assignments enable row level security;
alter table public.exam_script_scores enable row level security;
alter table public.exam_script_score_events enable row level security;

drop policy if exists exam_assessment_configs_admin_select on public.exam_subject_assessment_configs;
create policy exam_assessment_configs_admin_select on public.exam_subject_assessment_configs
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_assessment_configs_admin_write on public.exam_subject_assessment_configs;
create policy exam_assessment_configs_admin_write on public.exam_subject_assessment_configs
  for all to authenticated using (public.exam_is_admin()) with check (public.exam_is_admin());
drop policy if exists exam_absences_admin_select on public.exam_absences;
create policy exam_absences_admin_select on public.exam_absences
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_script_runs_admin_select on public.exam_script_runs;
create policy exam_script_runs_admin_select on public.exam_script_runs
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_script_records_admin_select on public.exam_script_records;
create policy exam_script_records_admin_select on public.exam_script_records
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_grader_assignments_admin_select on public.exam_grader_assignments;
create policy exam_grader_assignments_admin_select on public.exam_grader_assignments
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_script_scores_admin_select on public.exam_script_scores;
create policy exam_script_scores_admin_select on public.exam_script_scores
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_script_score_events_admin_select on public.exam_script_score_events;
create policy exam_script_score_events_admin_select on public.exam_script_score_events
  for select to authenticated using (public.exam_is_admin());

revoke all on public.exam_subject_assessment_configs,
  public.exam_absences, public.exam_script_runs, public.exam_script_records,
  public.exam_grader_assignments, public.exam_script_scores, public.exam_script_score_events
  from anon, authenticated;
grant select on public.exam_subject_assessment_configs, public.exam_absences,
  public.exam_script_runs, public.exam_script_records, public.exam_grader_assignments,
  public.exam_script_scores, public.exam_script_score_events to authenticated;

create or replace function public.exam_script_alpha_prefix(p_index integer)
returns text
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_value integer := p_index;
  v_result text := '';
begin
  if v_value < 1 then raise exception 'Chỉ số phòng phải lớn hơn 0.'; end if;
  while v_value > 0 loop
    v_value := v_value - 1;
    v_result := chr(65 + (v_value % 26)) || v_result;
    v_value := v_value / 26;
  end loop;
  return v_result;
end;
$$;

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
    when 'ANH' then 'Tiếng Anh'
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

create or replace function public.exam_save_subject_assessment_config(
  p_exam_id uuid, p_subject_code text, p_is_essay boolean,
  p_maximum_score numeric, p_score_step numeric, p_decimal_places integer,
  p_default_score numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền cấu hình điểm môn thi.' using errcode = '42501';
  end if;
  if p_exam_id is null or nullif(btrim(p_subject_code),'') is null then
    raise exception 'Kỳ thi hoặc mã môn không hợp lệ.';
  end if;
  if p_is_essay and (
    p_maximum_score is null or p_maximum_score <= 0
    or p_score_step is null or p_score_step <= 0
    or p_decimal_places is null or p_decimal_places < 0 or p_decimal_places > 3
    or (p_default_score is not null and (p_default_score < 0 or p_default_score > p_maximum_score))
  ) then raise exception 'Cấu hình điểm tự luận chưa hợp lệ.'; end if;

  insert into public.exam_subject_assessment_configs(
    exam_id,subject_code,is_essay,maximum_score,score_step,decimal_places,default_score,updated_by,updated_at
  ) values (
    p_exam_id,upper(btrim(p_subject_code)),p_is_essay,
    case when p_is_essay then p_maximum_score end,
    case when p_is_essay then p_score_step end,
    coalesce(p_decimal_places,1),
    case when p_is_essay then p_default_score end,auth.uid(),now()
  )
  on conflict (exam_id,subject_code) do update set
    is_essay=excluded.is_essay,maximum_score=excluded.maximum_score,
    score_step=excluded.score_step,decimal_places=excluded.decimal_places,
    default_score=excluded.default_score,updated_by=auth.uid(),updated_at=now();
  return jsonb_build_object('exam_id',p_exam_id,'subject_code',upper(btrim(p_subject_code)),'is_essay',p_is_essay);
end;
$$;

create or replace function public.exam_save_absences(p_exam_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_candidate_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền cập nhật báo vắng.' using errcode = '42501';
  end if;
  if p_exam_id is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Danh sách vắng mặt không hợp lệ.';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if coalesce(v_row->>'candidate_id','') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or nullif(btrim(v_row->>'subject_code'),'') is null then
      raise exception 'Một dòng báo vắng thiếu thí sinh hoặc phạm vi môn.';
    end if;
    v_candidate_id := (v_row->>'candidate_id')::uuid;
    if not exists(select 1 from public.exam_candidates c where c.id=v_candidate_id and c.exam_id=p_exam_id) then
      raise exception 'Thí sinh trong báo vắng không thuộc kỳ thi.';
    end if;
  end loop;

  delete from public.exam_absences where exam_id=p_exam_id;
  insert into public.exam_absences(exam_id,candidate_id,subject_code,reason,updated_by,updated_at)
  select p_exam_id,(x.value->>'candidate_id')::uuid,upper(btrim(x.value->>'subject_code')),
    coalesce(x.value->>'reason',''),auth.uid(),now()
  from jsonb_array_elements(p_rows) x(value)
  group by (x.value->>'candidate_id')::uuid,upper(btrim(x.value->>'subject_code')),coalesce(x.value->>'reason','');
  get diagnostics v_count = row_count;
  return jsonb_build_object('exam_id',p_exam_id,'absence_count',v_count);
end;
$$;

create or replace function public.exam_assign_grader(
  p_exam_id uuid,p_subject_code text,p_user_id uuid,p_active boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền phân công giám khảo.' using errcode = '42501';
  end if;
  if p_exam_id is null or nullif(btrim(p_subject_code),'') is null
    or p_user_id is null or not exists(select 1 from auth.users u where u.id=p_user_id) then
    raise exception 'Kỳ thi, môn hoặc tài khoản giám khảo không hợp lệ.';
  end if;
  insert into public.exam_grader_assignments(exam_id,subject_code,user_id,assigned_by,active)
  values(p_exam_id,upper(btrim(p_subject_code)),p_user_id,auth.uid(),coalesce(p_active,true))
  on conflict (exam_id,subject_code,user_id) do update set active=excluded.active;
  return jsonb_build_object('exam_id',p_exam_id,'subject_code',upper(btrim(p_subject_code)),'user_id',p_user_id);
end;
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
  if v_candidate_count=0 then raise exception 'Không có thí sinh được phân vào môn tự luận đã chọn.'; end if;

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
      coalesce(c.student_name,'') as student_name,
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

create or replace function public.exam_lock_script_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_run public.exam_script_runs%rowtype;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền khóa phương án đánh phách.' using errcode = '42501';
  end if;
  select * into v_run from public.exam_script_runs where id=p_run_id for update;
  if not found then raise exception 'Không tìm thấy phương án đánh phách.'; end if;
  if v_run.status='locked' then raise exception 'Phương án phách này đã khóa.'; end if;
  if v_run.record_count=0 or (select count(*) from public.exam_script_records where run_id=p_run_id)<>v_run.record_count then
    raise exception 'Danh sách phách chưa toàn vẹn, không thể khóa.';
  end if;
  update public.exam_script_runs set status='locked',locked_by=auth.uid(),locked_at=now() where id=p_run_id;
  return jsonb_build_object('run_id',p_run_id,'status','locked','record_count',v_run.record_count);
end;
$$;

create or replace function public.exam_list_grading_work()
returns table(exam_id uuid,exam_title text,subject_code text,maximum_score numeric,score_step numeric,decimal_places integer,default_score numeric)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select distinct e.id,coalesce(nullif(e.form_exam_title,''),e.name),g.subject_code,
    c.maximum_score,c.score_step,c.decimal_places,c.default_score
  from public.exam_grader_assignments g
  join public.exam_sessions e on e.id=g.exam_id
  join public.exam_subject_assessment_configs c
    on c.exam_id=g.exam_id and c.subject_code=g.subject_code and c.is_essay
  where auth.uid() is not null and g.user_id=auth.uid() and g.active
    and exists(select 1 from public.exam_script_runs r
      where r.exam_id=g.exam_id and r.subject_code=g.subject_code and r.status='locked')
  order by coalesce(nullif(e.form_exam_title,''),e.name),g.subject_code;
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
    raise exception 'Tài khoản không được phân công nhập điểm cho môn này.' using errcode='42501';
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
    raise exception 'Tài khoản không được phân công nhập điểm cho môn này.' using errcode='42501';
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
  where run.exam_id=p_exam_id and run.subject_code=upper(btrim(p_subject_code))
    and run.status='locked' and not rec.is_absent
    and rec.phach_code=p_phach_code
  order by run.locked_at desc limit 1;
  if v_script_id is null then raise exception 'Không tìm thấy phách hợp lệ trong phương án đã khóa.'; end if;
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

create or replace function public.exam_import_script_scores(
  p_exam_id uuid,p_subject_code text,p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare x jsonb; v_score numeric; v_count integer:=0;
begin
  if auth.uid() is null or not exists(select 1 from public.exam_grader_assignments g
    where g.exam_id=p_exam_id and g.subject_code=upper(btrim(p_subject_code))
      and g.user_id=auth.uid() and g.active) then
    raise exception 'Tài khoản không được phân công nhập điểm cho môn này.' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Dữ liệu điểm phải là JSON array.'; end if;
  for x in select value from jsonb_array_elements(p_rows) loop
    v_score:=nullif(x->>'score','')::numeric;
    perform public.exam_save_script_score(p_exam_id,p_subject_code,x->>'phach_code',v_score);
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('saved_count',v_count);
end;
$$;

revoke all on function public.exam_current_user_role() from public;
revoke all on function public.exam_save_subject_assessment_config(uuid,text,boolean,numeric,numeric,integer,numeric) from public;
revoke all on function public.exam_save_absences(uuid,jsonb) from public;
revoke all on function public.exam_assign_grader(uuid,text,uuid,boolean) from public;
revoke all on function public.exam_create_script_run(uuid,text,text,text,jsonb) from public;
revoke all on function public.exam_lock_script_run(uuid) from public;
revoke all on function public.exam_list_grading_work() from public;
revoke all on function public.exam_get_grading_queue(uuid,text,text) from public;
revoke all on function public.exam_save_script_score(uuid,text,text,numeric) from public;
revoke all on function public.exam_import_script_scores(uuid,text,jsonb) from public;
grant execute on function public.exam_save_subject_assessment_config(uuid,text,boolean,numeric,numeric,integer,numeric) to authenticated;
grant execute on function public.exam_current_user_role() to authenticated;
grant execute on function public.exam_save_absences(uuid,jsonb) to authenticated;
grant execute on function public.exam_assign_grader(uuid,text,uuid,boolean) to authenticated;
grant execute on function public.exam_create_script_run(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.exam_lock_script_run(uuid) to authenticated;
grant execute on function public.exam_list_grading_work() to authenticated;
grant execute on function public.exam_get_grading_queue(uuid,text,text) to authenticated;
grant execute on function public.exam_save_script_score(uuid,text,text,numeric) to authenticated;
grant execute on function public.exam_import_script_scores(uuid,text,jsonb) to authenticated;
