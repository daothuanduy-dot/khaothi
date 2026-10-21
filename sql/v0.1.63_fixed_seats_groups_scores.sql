-- v0.1.63: fixed mandatory seats, Google-authenticated grader groups,
-- safe script reset, and combined essay/multiple-choice score handling.
-- Apply after v0.1.62.

alter table public.exam_subject_assessment_configs
  add column if not exists mcq_maximum_score numeric(6,3) not null default 10
  check (mcq_maximum_score > 0);

create table if not exists public.exam_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  teacher_code text not null default '',
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_exam_user_profiles_teacher_code
  on public.exam_user_profiles(upper(btrim(teacher_code)))
  where btrim(teacher_code) <> '';

create table if not exists public.exam_grader_groups (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_sessions(id) on delete restrict,
  subject_code text not null check (btrim(subject_code) <> ''),
  name text not null check (btrim(name) <> ''),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, subject_code, name)
);

create table if not exists public.exam_grader_group_members (
  group_id uuid not null references public.exam_grader_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.exam_script_bag_assignments
  alter column user_id drop not null,
  add column if not exists group_id uuid references public.exam_grader_groups(id) on delete restrict;

alter table public.exam_script_bag_assignments
  drop constraint if exists exam_script_bag_assignments_single_target;
alter table public.exam_script_bag_assignments
  add constraint exam_script_bag_assignments_single_target
  check ((user_id is not null)::integer + (group_id is not null)::integer = 1);
alter table public.exam_script_bag_assignments
  add column if not exists assignment_method text not null default 'manual';
alter table public.exam_script_bag_assignments
  drop constraint if exists exam_script_bag_assignments_method_check;
alter table public.exam_script_bag_assignments
  add constraint exam_script_bag_assignments_method_check
  check (assignment_method in ('manual','draw'));

create table if not exists public.exam_script_bag_assignment_draws (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  exam_id uuid not null references public.exam_sessions(id) on delete restrict,
  subject_code text not null,
  bag_count integer not null,
  grader_count integer not null,
  drawn_by uuid not null references auth.users(id) on delete restrict,
  drawn_at timestamptz not null default now()
);

create table if not exists public.exam_script_run_deletion_audit (
  id bigint generated always as identity primary key,
  exam_id uuid not null references public.exam_sessions(id) on delete restrict,
  subject_code text not null,
  deleted_runs integer not null,
  deleted_records integer not null,
  deleted_scores integer not null,
  deleted_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz not null default now()
);

create table if not exists public.exam_mcq_scores (
  exam_id uuid not null references public.exam_sessions(id) on delete restrict,
  subject_code text not null check (btrim(subject_code) <> ''),
  candidate_id uuid not null references public.exam_candidates(id) on delete restrict,
  sbd text not null,
  score numeric(6,3) not null check (score >= 0),
  source_file text not null default '',
  imported_by uuid not null references auth.users(id) on delete restrict,
  imported_at timestamptz not null default now(),
  primary key (exam_id, subject_code, candidate_id)
);

create table if not exists public.exam_mcq_score_events (
  id bigint generated always as identity primary key,
  exam_id uuid not null,
  subject_code text not null,
  candidate_id uuid not null references public.exam_candidates(id) on delete restrict,
  previous_score numeric(6,3),
  new_score numeric(6,3) not null,
  source_file text not null default '',
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create or replace function public.exam_sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.exam_user_profiles(user_id,email,full_name,updated_at)
  values (
    new.id,
    coalesce(new.email,''),
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(new.raw_user_meta_data->>'name',''),
      nullif(split_part(coalesce(new.email,''),'@',1),''),''),
    now()
  )
  on conflict (user_id) do update set
    email=excluded.email,
    full_name=case
      when excluded.full_name<>'' then excluded.full_name
      else public.exam_user_profiles.full_name
    end,
    updated_at=now();
  return new;
end;
$$;

drop trigger if exists exam_sync_user_profile on auth.users;
create trigger exam_sync_user_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.exam_sync_user_profile();

insert into public.exam_user_profiles(user_id,email,full_name)
select u.id,coalesce(u.email,''),
  coalesce(nullif(u.raw_user_meta_data->>'full_name',''),
    nullif(u.raw_user_meta_data->>'name',''),
    nullif(split_part(coalesce(u.email,''),'@',1),''),'')
from auth.users u
on conflict (user_id) do update set email=excluded.email;

alter table public.exam_user_profiles enable row level security;
alter table public.exam_grader_groups enable row level security;
alter table public.exam_grader_group_members enable row level security;
alter table public.exam_script_run_deletion_audit enable row level security;
alter table public.exam_script_bag_assignment_draws enable row level security;
alter table public.exam_mcq_scores enable row level security;
alter table public.exam_mcq_score_events enable row level security;

drop policy if exists exam_user_profiles_admin_select on public.exam_user_profiles;
create policy exam_user_profiles_admin_select on public.exam_user_profiles
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_grader_groups_admin_select on public.exam_grader_groups;
create policy exam_grader_groups_admin_select on public.exam_grader_groups
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_grader_group_members_admin_select on public.exam_grader_group_members;
create policy exam_grader_group_members_admin_select on public.exam_grader_group_members
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_script_run_deletion_audit_admin_select on public.exam_script_run_deletion_audit;
create policy exam_script_run_deletion_audit_admin_select on public.exam_script_run_deletion_audit
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_script_bag_assignment_draws_admin_select on public.exam_script_bag_assignment_draws;
create policy exam_script_bag_assignment_draws_admin_select on public.exam_script_bag_assignment_draws
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_mcq_scores_admin_select on public.exam_mcq_scores;
create policy exam_mcq_scores_admin_select on public.exam_mcq_scores
  for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_mcq_score_events_admin_select on public.exam_mcq_score_events;
create policy exam_mcq_score_events_admin_select on public.exam_mcq_score_events
  for select to authenticated using (public.exam_is_admin());

revoke all on public.exam_user_profiles,public.exam_grader_groups,
  public.exam_grader_group_members,public.exam_script_run_deletion_audit,
  public.exam_script_bag_assignment_draws,
  public.exam_mcq_scores,public.exam_mcq_score_events from anon,authenticated;
grant select on public.exam_user_profiles,public.exam_grader_groups,
  public.exam_grader_group_members,public.exam_script_run_deletion_audit,
  public.exam_script_bag_assignment_draws,
  public.exam_mcq_scores,public.exam_mcq_score_events to authenticated;

create or replace function public.exam_save_grader_profile(
  p_user_id uuid,p_full_name text,p_teacher_code text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền quản lý tài khoản giám khảo.' using errcode='42501';
  end if;
  if p_user_id is null or length(btrim(coalesce(p_full_name,''))) not between 1 and 160
    or length(btrim(coalesce(p_teacher_code,'')))>60 then
    raise exception 'Tên giám khảo hoặc mã định danh không hợp lệ.';
  end if;
  update public.exam_user_profiles
  set full_name=btrim(p_full_name),teacher_code=btrim(coalesce(p_teacher_code,'')),updated_at=now()
  where user_id=p_user_id;
  if not found then raise exception 'Tài khoản chưa đăng nhập Google/email vào hệ thống.'; end if;
  return jsonb_build_object('user_id',p_user_id);
end;
$$;

create or replace function public.exam_save_grader_group(
  p_exam_id uuid,p_subject_code text,p_group_id uuid,p_name text,p_user_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid:=p_group_id;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền quản lý nhóm giám khảo.' using errcode='42501';
  end if;
  if p_exam_id is null or nullif(btrim(p_subject_code),'') is null
    or length(btrim(coalesce(p_name,''))) not between 1 and 100
    or coalesce(cardinality(p_user_ids),0)=0
    or (select count(distinct u.user_id) from unnest(p_user_ids) as u(user_id))<>cardinality(p_user_ids) then
    raise exception 'Tên nhóm, môn hoặc danh sách giám khảo không hợp lệ.';
  end if;
  if exists(select 1 from unnest(p_user_ids) x(user_id)
    where not exists(select 1 from public.exam_grader_assignments g
      where g.exam_id=p_exam_id and g.subject_code=upper(btrim(p_subject_code))
        and g.user_id=x.user_id and g.active)) then
    raise exception 'Mọi thành viên nhóm phải được phân công vào đúng môn trước.';
  end if;
  if v_group_id is null then
    insert into public.exam_grader_groups(exam_id,subject_code,name,created_by)
    values(p_exam_id,upper(btrim(p_subject_code)),btrim(p_name),auth.uid())
    returning id into v_group_id;
  else
    update public.exam_grader_groups
    set name=btrim(p_name),updated_at=now()
    where id=v_group_id and exam_id=p_exam_id and subject_code=upper(btrim(p_subject_code));
    if not found then raise exception 'Không tìm thấy nhóm thuộc kỳ thi/môn đang chọn.'; end if;
  end if;
  delete from public.exam_grader_group_members where group_id=v_group_id;
  insert into public.exam_grader_group_members(group_id,user_id)
  select v_group_id,x from unnest(p_user_ids) x;
  return v_group_id;
end;
$$;

create or replace function public.exam_delete_grader_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền xóa nhóm giám khảo.' using errcode='42501';
  end if;
  if exists(select 1 from public.exam_script_bag_assignments where group_id=p_group_id) then
    raise exception 'Không thể xóa nhóm đang được giao túi; hãy đổi phân công túi trước.';
  end if;
  delete from public.exam_grader_groups where id=p_group_id;
  if not found then raise exception 'Không tìm thấy nhóm giám khảo.'; end if;
end;
$$;

create or replace function public.exam_set_script_bag_assignments(p_run_id uuid,p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.exam_script_runs%rowtype;
  v_row jsonb;
  v_user_id uuid;
  v_group_id uuid;
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
      or (nullif(v_row->>'user_id','') is null)=(nullif(v_row->>'group_id','') is null) then
      raise exception 'Mỗi túi phải được giao cho đúng một giám khảo hoặc một nhóm.';
    end if;
    if not exists(select 1 from public.exam_script_records r
      where r.run_id=p_run_id and r.room_code=v_row->>'room_code') then
      raise exception 'Túi/phòng không thuộc phương án phách đã chọn.';
    end if;
    if nullif(v_row->>'user_id','') is not null then
      v_user_id:=(v_row->>'user_id')::uuid;
      if not exists(select 1 from public.exam_grader_assignments g
        where g.exam_id=v_run.exam_id and g.subject_code=v_run.subject_code
          and g.user_id=v_user_id and g.active) then
        raise exception 'Giám khảo phải được phân công vào đúng môn trước khi nhận túi.';
      end if;
    else
      v_group_id:=(v_row->>'group_id')::uuid;
      if not exists(select 1 from public.exam_grader_groups g
        where g.id=v_group_id and g.exam_id=v_run.exam_id and g.subject_code=v_run.subject_code) then
        raise exception 'Nhóm không thuộc kỳ thi/môn của phương án phách.';
      end if;
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_rows) x(value)
    group by x.value->>'room_code' having count(*)>1) then
    raise exception 'Một túi/phòng chỉ được gán một lần.';
  end if;
  delete from public.exam_script_bag_assignments where run_id=p_run_id;
  insert into public.exam_script_bag_assignments(run_id,room_code,user_id,group_id,assignment_method,assigned_by,assigned_at)
  select p_run_id,x.value->>'room_code',nullif(x.value->>'user_id','')::uuid,
    nullif(x.value->>'group_id','')::uuid,'manual',auth.uid(),now()
  from jsonb_array_elements(p_rows) x(value);
  get diagnostics v_count=row_count;
  return jsonb_build_object('run_id',p_run_id,'assigned_bag_count',v_count);
end;
$$;

create or replace function public.exam_draw_script_bag_assignments(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.exam_script_runs%rowtype;
  v_bag_count integer;
  v_grader_count integer;
  v_assigned_count integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền bốc thăm phân công túi.' using errcode='42501';
  end if;
  select * into v_run from public.exam_script_runs where id=p_run_id for update;
  if not found or v_run.status<>'locked' then
    raise exception 'Chỉ phương án phách đã khóa mới được bốc thăm phân công.';
  end if;
  select count(distinct room_code) into v_bag_count
  from public.exam_script_records where run_id=p_run_id;
  select count(*) into v_grader_count from public.exam_grader_assignments
  where exam_id=v_run.exam_id and subject_code=v_run.subject_code and active;
  if v_bag_count=0 then raise exception 'Phương án phách chưa có túi bài.'; end if;
  if v_grader_count=0 then raise exception 'Chưa có giám khảo nào được phân công vào môn này.'; end if;
  delete from public.exam_script_bag_assignments where run_id=p_run_id;
  with rooms as (
    select room_code,row_number() over(order by gen_random_uuid()) as draw_order
    from (select distinct room_code from public.exam_script_records where run_id=p_run_id) r
  ), graders as (
    select user_id,row_number() over(order by gen_random_uuid()) as draw_order
    from public.exam_grader_assignments
    where exam_id=v_run.exam_id and subject_code=v_run.subject_code and active
  )
  insert into public.exam_script_bag_assignments(
    run_id,room_code,user_id,group_id,assignment_method,assigned_by,assigned_at
  )
  select p_run_id,rooms.room_code,graders.user_id,null,'draw',auth.uid(),now()
  from rooms join graders
    on graders.draw_order=((rooms.draw_order-1)%v_grader_count)+1;
  get diagnostics v_assigned_count=row_count;
  insert into public.exam_script_bag_assignment_draws(
    run_id,exam_id,subject_code,bag_count,grader_count,drawn_by
  ) values(p_run_id,v_run.exam_id,v_run.subject_code,v_assigned_count,v_grader_count,auth.uid());
  return jsonb_build_object('run_id',p_run_id,'assigned_bag_count',v_assigned_count,
    'grader_count',v_grader_count);
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
        or exists(select 1 from public.exam_script_bag_assignments b
          join public.exam_grader_group_members m on m.group_id=b.group_id
          where b.run_id=p_run_id and b.room_code=p_room_code and m.user_id=auth.uid())
      )
    );
$$;

create or replace function public.exam_delete_script_runs(
  p_exam_id uuid,p_subject_code text,p_confirmation text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runs integer;
  v_records integer;
  v_scores integer;
  v_subject text:=upper(btrim(p_subject_code));
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền xóa phương án phách.' using errcode='42501';
  end if;
  if p_exam_id is null or v_subject='' or p_confirmation is distinct from v_subject then
    raise exception 'Để xác nhận, hãy nhập chính xác mã môn %.',v_subject;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_exam_id::text||':script:'||v_subject,1));
  select count(*) into v_runs from public.exam_script_runs
  where exam_id=p_exam_id and subject_code=v_subject;
  select count(*) into v_records from public.exam_script_records r
  join public.exam_script_runs run on run.id=r.run_id
  where run.exam_id=p_exam_id and run.subject_code=v_subject;
  select count(*) into v_scores from public.exam_script_scores s
  join public.exam_script_records r on r.id=s.script_record_id
  join public.exam_script_runs run on run.id=r.run_id
  where run.exam_id=p_exam_id and run.subject_code=v_subject;
  delete from public.exam_script_score_events e using public.exam_script_records r,public.exam_script_runs run
  where e.script_record_id=r.id and r.run_id=run.id and run.exam_id=p_exam_id and run.subject_code=v_subject;
  delete from public.exam_script_scores s using public.exam_script_records r,public.exam_script_runs run
  where s.script_record_id=r.id and r.run_id=run.id and run.exam_id=p_exam_id and run.subject_code=v_subject;
  delete from public.exam_script_bag_assignments b using public.exam_script_runs run
  where b.run_id=run.id and run.exam_id=p_exam_id and run.subject_code=v_subject;
  delete from public.exam_script_records r using public.exam_script_runs run
  where r.run_id=run.id and run.exam_id=p_exam_id and run.subject_code=v_subject;
  delete from public.exam_script_runs where exam_id=p_exam_id and subject_code=v_subject;
  insert into public.exam_script_run_deletion_audit(
    exam_id,subject_code,deleted_runs,deleted_records,deleted_scores,deleted_by
  ) values(p_exam_id,v_subject,v_runs,v_records,v_scores,auth.uid());
  return jsonb_build_object('exam_id',p_exam_id,'subject_code',v_subject,
    'deleted_runs',v_runs,'deleted_records',v_records,'deleted_scores',v_scores);
end;
$$;

create or replace function public.exam_set_mcq_maximum_score(
  p_exam_id uuid,p_subject_code text,p_maximum_score numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền cấu hình điểm trắc nghiệm.' using errcode='42501';
  end if;
  if p_maximum_score is null or p_maximum_score<=0
    or p_maximum_score<>round(p_maximum_score,3) then
    raise exception 'Điểm tối đa trắc nghiệm phải lớn hơn 0.';
  end if;
  update public.exam_subject_assessment_configs
  set mcq_maximum_score=p_maximum_score,updated_by=auth.uid(),updated_at=now()
  where exam_id=p_exam_id and subject_code=upper(btrim(p_subject_code));
  if not found then raise exception 'Hãy lưu thang điểm tự luận của môn trước.'; end if;
  if exists(select 1 from public.exam_mcq_scores
    where exam_id=p_exam_id and subject_code=upper(btrim(p_subject_code)) and score>p_maximum_score) then
    raise exception 'Điểm tối đa mới thấp hơn điểm trắc nghiệm đã nhập.';
  end if;
  return jsonb_build_object('exam_id',p_exam_id,'subject_code',upper(btrim(p_subject_code)),
    'mcq_maximum_score',p_maximum_score);
end;
$$;

create or replace function public.exam_import_mcq_scores(
  p_exam_id uuid,p_subject_code text,p_source_file text,p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  x jsonb;
  v_sbd text;
  v_score numeric;
  v_candidate_id uuid;
  v_previous_score numeric;
  v_maximum numeric;
  v_count integer:=0;
  v_subject text:=upper(btrim(p_subject_code));
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền nhập điểm trắc nghiệm.' using errcode='42501';
  end if;
  if p_exam_id is null or v_subject='' or p_rows is null
    or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0
    or jsonb_array_length(p_rows)>10000 then
    raise exception 'Kỳ thi, môn hoặc danh sách điểm trắc nghiệm không hợp lệ.';
  end if;
  select c.mcq_maximum_score into v_maximum
  from public.exam_subject_assessment_configs c
  where c.exam_id=p_exam_id and c.subject_code=v_subject;
  if v_maximum is null then raise exception 'Chưa cấu hình điểm tối đa trắc nghiệm cho môn.'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r(value)
    group by upper(btrim(r.value->>'sbd')) having count(*)>1) then
    raise exception 'Tệp có SBD bị lặp; không nhập để tránh ghi đè nhầm.';
  end if;
  for x in select value from jsonb_array_elements(p_rows) loop
    v_sbd:=btrim(coalesce(x->>'sbd',''));
    if v_sbd !~ '^[0-9]{6}$|^[0-9]{8}$' then raise exception 'SBD "%" không hợp lệ.',v_sbd; end if;
    v_score:=nullif(x->>'score','')::numeric;
    if v_score is null or v_score<0 or v_score>v_maximum or v_score<>round(v_score,3) then
      raise exception 'Điểm SBD % phải từ 0 đến % và tối đa 3 chữ số thập phân.',v_sbd,v_maximum;
    end if;
    select c.id into v_candidate_id from public.exam_candidates c
    where c.exam_id=p_exam_id and c.sbd=v_sbd;
    if v_candidate_id is null then raise exception 'Không tìm thấy SBD % trong kỳ thi.',v_sbd; end if;
    if v_subject not in ('TOAN','VAN') and not exists(
      select 1 from public.exam_candidate_subjects s
      where s.exam_id=p_exam_id and s.candidate_id=v_candidate_id
        and s.subject_type='elective' and s.subject_code=v_subject
    ) then raise exception 'Thí sinh SBD % không đăng ký môn %.',v_sbd,v_subject; end if;
  end loop;
  for x in select value from jsonb_array_elements(p_rows) loop
    v_sbd:=btrim(x->>'sbd');v_score:=(x->>'score')::numeric;
    select c.id into v_candidate_id from public.exam_candidates c
    where c.exam_id=p_exam_id and c.sbd=v_sbd;
    select m.score into v_previous_score from public.exam_mcq_scores m
    where m.exam_id=p_exam_id and m.subject_code=v_subject and m.candidate_id=v_candidate_id;
    insert into public.exam_mcq_scores(exam_id,subject_code,candidate_id,sbd,score,source_file,imported_by,imported_at)
    values(p_exam_id,v_subject,v_candidate_id,v_sbd,v_score,coalesce(p_source_file,''),auth.uid(),now())
    on conflict (exam_id,subject_code,candidate_id) do update set
      sbd=excluded.sbd,score=excluded.score,source_file=excluded.source_file,
      imported_by=auth.uid(),imported_at=now();
    insert into public.exam_mcq_score_events(
      exam_id,subject_code,candidate_id,previous_score,new_score,source_file,changed_by
    ) values(p_exam_id,v_subject,v_candidate_id,v_previous_score,v_score,coalesce(p_source_file,''),auth.uid());
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('exam_id',p_exam_id,'subject_code',v_subject,'imported_count',v_count);
end;
$$;

create or replace function public.exam_get_combined_scores(p_exam_id uuid,p_subject_code text)
returns table(
  candidate_id uuid,sbd text,student_code text,student_name text,class_code text,
  essay_score numeric,mcq_score numeric,total_score numeric,essay_missing boolean,mcq_missing boolean
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_subject text:=upper(btrim(p_subject_code));
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền xem bảng tổng hợp điểm.' using errcode='42501';
  end if;
  if p_exam_id is null or v_subject='' then raise exception 'Chọn kỳ thi và môn.'; end if;
  return query
  with latest as (
    select r.id from public.exam_script_runs r
    where r.exam_id=p_exam_id and r.subject_code=v_subject and r.status='locked'
    order by r.locked_at desc limit 1
  ), eligible as (
    select c.id,c.sbd,c.student_code,c.student_name,c.class_code
    from public.exam_candidates c
    where c.exam_id=p_exam_id and (
      v_subject in ('TOAN','VAN') or exists(
        select 1 from public.exam_candidate_subjects s where s.exam_id=p_exam_id
          and s.candidate_id=c.id and s.subject_type='elective' and s.subject_code=v_subject
      )
    )
  )
  select e.id,e.sbd,e.student_code,e.student_name,e.class_code,
    case when not coalesce(rec.is_absent,false) then essay.score end,
    mcq.score,
    case when not coalesce(rec.is_absent,false) and essay.score is not null and mcq.score is not null
      then essay.score+mcq.score end,
    (coalesce(rec.is_absent,false) or essay.score is null),
    mcq.score is null
  from eligible e
  left join latest l on true
  left join public.exam_script_records rec on rec.run_id=l.id and rec.candidate_id=e.id
  left join public.exam_script_scores essay on essay.script_record_id=rec.id
  left join public.exam_mcq_scores mcq on mcq.exam_id=p_exam_id
    and mcq.subject_code=v_subject and mcq.candidate_id=e.id
  order by e.class_code,e.sbd;
end;
$$;

create or replace function public.exam_get_grading_heads(p_exam_id uuid,p_subject_code text)
returns table(phach_prefix text)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.exam_grader_assignments g
    where g.exam_id=p_exam_id and g.subject_code=upper(btrim(p_subject_code))
      and g.user_id=auth.uid() and g.active
  ) then
    raise exception 'Tài khoản chưa được phân công vào môn này.' using errcode='42501';
  end if;
  return query
  select distinct x.value->>'phach_prefix'
  from public.exam_script_runs run
  cross join lateral jsonb_array_elements(run.room_order) x(value)
  where run.id=(select latest.id from public.exam_script_runs latest
    where latest.exam_id=p_exam_id and latest.subject_code=upper(btrim(p_subject_code))
      and latest.status='locked' order by latest.locked_at desc limit 1)
    and run.method='room' and nullif(x.value->>'phach_prefix','') is not null
  order by 1;
end;
$$;

create or replace function public.exam_validate_script_room_heads()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.method='room' and exists(
    select 1
    from jsonb_array_elements(new.room_order) with ordinality a(value,ord)
    join jsonb_array_elements(new.room_order) with ordinality b(value,ord)
      on a.ord<b.ord
    where upper(a.value->>'phach_prefix') like upper(b.value->>'phach_prefix')||'%'
      or upper(b.value->>'phach_prefix') like upper(a.value->>'phach_prefix')||'%'
  ) then
    raise exception 'Đầu phách theo phòng không được trùng hoặc là tiền tố của đầu phách khác.';
  end if;
  return new;
end;
$$;

drop trigger if exists exam_validate_script_room_heads on public.exam_script_runs;
create trigger exam_validate_script_room_heads
before insert on public.exam_script_runs
for each row execute function public.exam_validate_script_room_heads();

create or replace function public.exam_validate_fixed_mandatory_seats()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_peer_id uuid;
begin
  if new.plan_type<>'mandatory' then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.exam_id::text||':mandatory-fixed-seats',1));
  select f.id into v_peer_id
  from public.exam_rooming_finalizations f
  where f.exam_id=new.exam_id and f.plan_type='mandatory'
    and f.subject_code<>new.subject_code and f.is_current
  order by f.finalized_at desc limit 1;
  if v_peer_id is null then return null; end if;
  if exists(
    select a.candidate_id,a.room_code,a.sbd from public.exam_room_assignments a
    where a.finalization_id=new.id
    except
    select a.candidate_id,a.room_code,a.sbd from public.exam_room_assignments a
    where a.finalization_id=v_peer_id
  ) or exists(
    select a.candidate_id,a.room_code,a.sbd from public.exam_room_assignments a
    where a.finalization_id=v_peer_id
    except
    select a.candidate_id,a.room_code,a.sbd from public.exam_room_assignments a
    where a.finalization_id=new.id
  ) then
    raise exception 'Vị trí cố định môn bắt buộc phải trùng hoàn toàn với môn bắt buộc đã chốt trước.';
  end if;
  return null;
end;
$$;

drop trigger if exists exam_fixed_mandatory_seats on public.exam_rooming_finalizations;
create constraint trigger exam_fixed_mandatory_seats
after insert on public.exam_rooming_finalizations
deferrable initially deferred
for each row execute function public.exam_validate_fixed_mandatory_seats();

-- Keep all validation and numbering behavior from v0.1.62, but allow a
-- numeric/alphanumeric room head such as "20" to match the room label.
do $$
declare
  v_definition text;
  v_old text:='^[A-Za-z]{1,3}$';
  v_new text:='^[A-Za-z0-9]{1,6}$';
begin
  select pg_get_functiondef('public.exam_create_script_run(uuid,text,text,text,jsonb)'::regprocedure)
  into v_definition;
  if position(v_old in v_definition)=0 then
    if position(v_new in v_definition)>0 then return; end if;
    raise exception 'Không nhận dạng được phiên bản exam_create_script_run; chưa đổi quy tắc đầu phách.';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$$;

revoke all on function public.exam_save_grader_profile(uuid,text,text) from public;
revoke all on function public.exam_save_grader_group(uuid,text,uuid,text,uuid[]) from public;
revoke all on function public.exam_delete_grader_group(uuid) from public;
revoke all on function public.exam_set_script_bag_assignments(uuid,jsonb) from public;
revoke all on function public.exam_draw_script_bag_assignments(uuid) from public;
revoke all on function public.exam_can_grade_script_room(uuid,text) from public;
revoke all on function public.exam_delete_script_runs(uuid,text,text) from public;
revoke all on function public.exam_set_mcq_maximum_score(uuid,text,numeric) from public;
revoke all on function public.exam_import_mcq_scores(uuid,text,text,jsonb) from public;
revoke all on function public.exam_get_combined_scores(uuid,text) from public;
revoke all on function public.exam_get_grading_heads(uuid,text) from public;

grant execute on function public.exam_save_grader_profile(uuid,text,text) to authenticated;
grant execute on function public.exam_save_grader_group(uuid,text,uuid,text,uuid[]) to authenticated;
grant execute on function public.exam_delete_grader_group(uuid) to authenticated;
grant execute on function public.exam_set_script_bag_assignments(uuid,jsonb) to authenticated;
grant execute on function public.exam_draw_script_bag_assignments(uuid) to authenticated;
grant execute on function public.exam_can_grade_script_room(uuid,text) to authenticated;
grant execute on function public.exam_delete_script_runs(uuid,text,text) to authenticated;
grant execute on function public.exam_set_mcq_maximum_score(uuid,text,numeric) to authenticated;
grant execute on function public.exam_import_mcq_scores(uuid,text,text,jsonb) to authenticated;
grant execute on function public.exam_get_combined_scores(uuid,text) to authenticated;
grant execute on function public.exam_get_grading_heads(uuid,text) to authenticated;
