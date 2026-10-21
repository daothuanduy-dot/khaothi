-- v0.1.92: configure candidates/subjects by exam round while keeping SBD exam-wide.

create table if not exists public.exam_rounds (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_sessions(id) on delete cascade,
  round_no smallint not null check (round_no in (1,2)),
  name text not null default '',
  is_active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, round_no)
);

create table if not exists public.exam_round_subjects (
  exam_id uuid not null references public.exam_sessions(id) on delete cascade,
  round_no smallint not null check (round_no in (1,2)),
  subject_code text not null,
  subject_type text not null check (subject_type in ('mandatory','elective','class')),
  subject_order smallint not null default 1,
  primary key (exam_id, round_no, subject_code),
  foreign key (exam_id, round_no) references public.exam_rounds(exam_id, round_no) on delete cascade
);

create table if not exists public.exam_round_candidates (
  exam_id uuid not null references public.exam_sessions(id) on delete cascade,
  round_no smallint not null check (round_no in (1,2)),
  candidate_id uuid not null references public.exam_candidates(id) on delete cascade,
  assigned_by uuid not null default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (exam_id, candidate_id),
  foreign key (exam_id, round_no) references public.exam_rounds(exam_id, round_no) on delete cascade
);

create index if not exists ix_exam_round_candidates_lookup
  on public.exam_round_candidates(exam_id, round_no, candidate_id);

alter table public.exam_rounds enable row level security;
alter table public.exam_round_subjects enable row level security;
alter table public.exam_round_candidates enable row level security;

drop policy if exists exam_rounds_admin_select on public.exam_rounds;
create policy exam_rounds_admin_select on public.exam_rounds for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_round_subjects_admin_select on public.exam_round_subjects;
create policy exam_round_subjects_admin_select on public.exam_round_subjects for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_round_candidates_admin_select on public.exam_round_candidates;
create policy exam_round_candidates_admin_select on public.exam_round_candidates for select to authenticated using (public.exam_is_admin());

create or replace function public.exam_configure_round(
  p_exam_id uuid,
  p_round_no smallint,
  p_candidate_ids uuid[],
  p_subjects jsonb default '[]'::jsonb,
  p_name text default ''
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_candidate uuid; v_subject jsonb; v_count integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then raise exception 'Không có quyền cấu hình đợt thi.' using errcode='42501'; end if;
  if not exists(select 1 from public.exam_sessions where id=p_exam_id) then raise exception 'Không tìm thấy kỳ thi.'; end if;
  if p_round_no not in (1,2) or p_candidate_ids is null or p_subjects is null or jsonb_typeof(p_subjects)<>'array' then raise exception 'Thông tin đợt thi không hợp lệ.'; end if;
  insert into public.exam_rounds(exam_id,round_no,name,updated_at) values(p_exam_id,p_round_no,coalesce(nullif(btrim(p_name),''),'Đợt '||p_round_no),now())
  on conflict(exam_id,round_no) do update set name=excluded.name,is_active=true,updated_at=now();
  if exists(select 1 from unnest(p_candidate_ids) x where not exists(select 1 from public.exam_candidates c where c.id=x and c.exam_id=p_exam_id)) then raise exception 'Có thí sinh không thuộc kỳ thi.'; end if;
  if p_round_no=2 and exists(select 1 from unnest(p_candidate_ids) x join public.exam_round_candidates r on r.exam_id=p_exam_id and r.round_no=1 and r.candidate_id=x) then raise exception 'Thí sinh đã thuộc đợt 1 không được đưa vào đợt 2.'; end if;
  delete from public.exam_round_candidates where exam_id=p_exam_id and round_no=p_round_no;
  insert into public.exam_round_candidates(exam_id,round_no,candidate_id) select p_exam_id,p_round_no,x from unnest(p_candidate_ids) x;
  delete from public.exam_round_subjects where exam_id=p_exam_id and round_no=p_round_no;
  for v_subject in select value from jsonb_array_elements(p_subjects) loop
    if nullif(btrim(v_subject->>'subject_code'),'') is null or v_subject->>'subject_type' not in ('mandatory','elective') then raise exception 'Môn thi trong đợt không hợp lệ.'; end if;
    insert into public.exam_round_subjects(exam_id,round_no,subject_code,subject_type,subject_order)
    values(p_exam_id,p_round_no,upper(btrim(v_subject->>'subject_code')),v_subject->>'subject_type',coalesce((v_subject->>'subject_order')::smallint,1));
  end loop;
  select count(*) into v_count from public.exam_round_candidates where exam_id=p_exam_id and round_no=p_round_no;
  return jsonb_build_object('exam_id',p_exam_id,'round_no',p_round_no,'candidate_count',v_count,'subject_count',(select count(*) from public.exam_round_subjects where exam_id=p_exam_id and round_no=p_round_no));
end;
$function$;

create or replace function public.exam_get_round_candidates(p_exam_id uuid, p_round_no smallint)
returns table(id uuid,sbd text,student_code text,student_name text,class_code text,grade_code text,date_of_birth date,gender text,ethnicity text,is_overage boolean)
language plpgsql security definer stable set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not public.exam_is_admin() then raise exception 'Không có quyền đọc danh sách đợt thi.' using errcode='42501'; end if;
  if not exists(select 1 from public.exam_rounds where exam_id=p_exam_id and round_no=p_round_no and is_active) then raise exception 'Kỳ thi chưa được cấu hình danh sách học sinh cho đợt %.',p_round_no; end if;
  return query select c.id,c.sbd,c.student_code,c.student_name,c.class_code,c.grade_code,c.date_of_birth,c.gender,c.ethnicity,c.is_overage
    from public.exam_round_candidates r join public.exam_candidates c on c.id=r.candidate_id and c.exam_id=r.exam_id
   where r.exam_id=p_exam_id and r.round_no=p_round_no order by c.sbd,c.id;
end;
$function$;

create or replace function public.exam_delete_exam_cascade(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_count integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then raise exception 'Không có quyền xóa kỳ thi.' using errcode='42501'; end if;
  if not exists(select 1 from public.exam_sessions where id=p_exam_id) then raise exception 'Không tìm thấy kỳ thi.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_exam_id::text||':delete-exam',1));
  perform set_config('exam.cascade_delete','on',true);
  delete from public.exam_script_score_events e using public.exam_script_records r,public.exam_script_runs x where e.script_record_id=r.id and r.run_id=x.id and x.exam_id=p_exam_id;
  delete from public.exam_script_scores e using public.exam_script_records r,public.exam_script_runs x where e.script_record_id=r.id and r.run_id=x.id and x.exam_id=p_exam_id;
  delete from public.exam_script_bag_assignments b using public.exam_script_runs x where b.run_id=x.id and x.exam_id=p_exam_id;
  delete from public.exam_script_bag_assignment_draws where exam_id=p_exam_id;
  delete from public.exam_script_run_deletion_audit where exam_id=p_exam_id;
  delete from public.exam_script_records r using public.exam_script_runs x where r.run_id=x.id and x.exam_id=p_exam_id;
  delete from public.exam_script_runs where exam_id=p_exam_id;
  delete from public.exam_grader_group_members m using public.exam_grader_groups g where m.group_id=g.id and g.exam_id=p_exam_id;
  delete from public.exam_grader_groups where exam_id=p_exam_id;
  delete from public.exam_grader_assignments where exam_id=p_exam_id;
  delete from public.exam_subject_assessment_configs where exam_id=p_exam_id;
  delete from public.exam_absences where exam_id=p_exam_id;
  delete from public.exam_mcq_score_events where exam_id=p_exam_id;
  delete from public.exam_mcq_scores where exam_id=p_exam_id;
  delete from public.exam_room_assignments where exam_id=p_exam_id;
  delete from public.exam_rooming_finalizations where exam_id=p_exam_id;
  delete from public.exam_rooming_plan_snapshots where exam_id=p_exam_id;
  delete from public.exam_rooming_round_plans where exam_id=p_exam_id;
  delete from public.exam_elective_room_plan_candidates pc using public.exam_elective_room_plans p where pc.plan_id=p.id and p.exam_id=p_exam_id;
  delete from public.exam_elective_room_plan_rooms where plan_id in (select id from public.exam_elective_room_plans where exam_id=p_exam_id);
  delete from public.exam_elective_room_plans where exam_id=p_exam_id;
  delete from public.exam_mandatory_room_plans where exam_id=p_exam_id;
  delete from public.exam_candidate_subjects where exam_id=p_exam_id;
  delete from public.exam_round_candidates where exam_id=p_exam_id;
  delete from public.exam_round_subjects where exam_id=p_exam_id;
  delete from public.exam_rounds where exam_id=p_exam_id;
  delete from public.exam_candidates where exam_id=p_exam_id;
  delete from public.exam_sessions where id=p_exam_id;
  return jsonb_build_object('exam_id',p_exam_id,'deleted',true);
end;
$function$;

revoke all on function public.exam_configure_round(uuid,smallint,uuid[],jsonb,text) from public;
revoke all on function public.exam_get_round_candidates(uuid,smallint) from public;
revoke all on function public.exam_delete_exam_cascade(uuid) from public;
grant execute on function public.exam_configure_round(uuid,smallint,uuid[],jsonb,text) to authenticated;
grant execute on function public.exam_get_round_candidates(uuid,smallint) to authenticated;
grant execute on function public.exam_delete_exam_cascade(uuid) to authenticated;

-- Official rooming is immutable for normal users, but an explicit exam deletion
-- is an authorized aggregate delete and must be able to remove the whole exam.
create or replace function public.exam_guard_rooming_plan_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $function$
begin
  if current_setting('exam.cascade_delete', true) = 'on' then return old; end if;
  raise exception 'Snapshot phương án phân phòng là hồ sơ bất biến.';
end;
$function$;

create or replace function public.exam_guard_rooming_finalization()
returns trigger language plpgsql set search_path=public,pg_temp as $function$
begin
  if current_setting('exam.cascade_delete', true) = 'on' then return old; end if;
  if tg_op = 'DELETE' then raise exception 'Phân phòng chính thức không được xóa trực tiếp.'; end if;
  if (to_jsonb(new) - 'is_current') is distinct from (to_jsonb(old) - 'is_current') then raise exception 'Phân phòng chính thức là hồ sơ bất biến.'; end if;
  return new;
end;
$function$;

create or replace function public.exam_guard_room_assignment()
returns trigger language plpgsql set search_path=public,pg_temp as $function$
begin
  if current_setting('exam.cascade_delete', true) = 'on' then return old; end if;
  raise exception 'Phân công phòng chính thức là hồ sơ bất biến.';
end;
$function$;
