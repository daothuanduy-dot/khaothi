-- Apply after v0.1.118. Run as database owner in Supabase SQL Editor.
-- No grading window means CLOSED. Existing scores are never reassigned.
begin;

create table if not exists public.exam_account_roles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','grader')),
 subject_code text,
 updated_at timestamptz not null default now(),
 check((role='admin' and subject_code is null) or
       (role='grader' and nullif(btrim(subject_code),'') is not null))
);
create table if not exists public.exam_grading_windows(
 exam_id uuid primary key references public.exam_sessions(id) on delete cascade,
 starts_at timestamptz not null, ends_at timestamptz not null,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create table if not exists public.exam_grading_head_claims(
 run_id uuid not null references public.exam_script_runs(id) on delete cascade,
 head text not null, user_id uuid not null references auth.users(id),
 claimed_at timestamptz not null default now(),primary key(run_id,head)
);
alter table public.exam_account_roles enable row level security;
alter table public.exam_grading_windows enable row level security;
alter table public.exam_grading_head_claims enable row level security;
revoke all on public.exam_account_roles,public.exam_grading_windows,public.exam_grading_head_claims from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.exam_script_scores,public.exam_script_score_events,public.exam_grader_assignments from public,anon,authenticated;

-- Copy the original body instead of renaming its OID: existing RLS policies must
-- continue to call exam_is_admin, not a legacy function bypassing explicit roles.
do $migration$
declare definition text;
begin
 if to_regprocedure('public.exam_legacy_is_admin_119()') is null then
   definition:=pg_get_functiondef('public.exam_is_admin()'::regprocedure);
   definition:=replace(definition,'FUNCTION public.exam_is_admin()','FUNCTION public.exam_legacy_is_admin_119()');
   execute definition;
 end if;
end $migration$;
revoke all on function public.exam_legacy_is_admin_119() from public,anon,authenticated;
create or replace function public.exam_is_admin() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and coalesce(
   (select a.role='admin' from public.exam_account_roles a where a.user_id=auth.uid()),
   public.exam_legacy_is_admin_119(),false);
$$;

-- Existing teachers must be explicitly mapped by Admin. Do not infer a global
-- role from old exam assignments, or impersonate JWTs to identify legacy admins.
-- Unmapped admins continue to use the original admin predicate.

create or replace function public.exam_current_user_role() returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select case when auth.uid() is null then 'anonymous'
 when public.exam_is_admin() then 'admin'
 when exists(select 1 from public.exam_account_roles where user_id=auth.uid() and role='grader') then 'grader'
 else 'unassigned' end;
$$;
create or replace function public.exam_teacher_allowed(p_exam_id uuid,p_subject_code text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(
 select 1 from public.exam_account_roles a join public.exam_grader_assignments g on g.user_id=a.user_id
 where a.user_id=auth.uid() and a.role='grader' and a.subject_code=upper(btrim(p_subject_code))
 and g.exam_id=p_exam_id and g.subject_code=a.subject_code and g.active);
$$;
create or replace function public.exam_manage_accounts()
returns table(user_id uuid,email text,full_name text,role text,subject_code text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.exam_is_admin() then raise exception 'Chỉ Admin được quản lý tài khoản.' using errcode='42501'; end if;
 return query select u.id,u.email::text,coalesce(p.full_name,''),coalesce(a.role,case when u.id=auth.uid() then 'admin' else 'unassigned' end),a.subject_code
 from auth.users u left join public.exam_user_profiles p on p.user_id=u.id
 left join public.exam_account_roles a on a.user_id=u.id order by u.email,u.id;
end $$;
create or replace function public.exam_set_account_role(p_user_id uuid,p_role text,p_subject_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.exam_is_admin() then raise exception 'Chỉ Admin được phân quyền.' using errcode='42501'; end if;
 if p_role is null or p_role not in ('admin','grader') then raise exception 'Vai trò không hợp lệ.'; end if;
 if p_user_id=auth.uid() and p_role<>'admin' then raise exception 'Không tự hạ quyền Admin của tài khoản đang dùng.'; end if;
 if p_role='grader' and coalesce(upper(btrim(p_subject_code)),'') not in
 ('TOAN','VAN','N1','N2','N3','N4','N5','N6','N7','ANH','LY','HOA','SINH','SU','DIA','KTPL','TIN','CNCN','CNNN') then
 raise exception 'Môn học không hợp lệ.'; end if;
 insert into public.exam_account_roles(user_id,role,subject_code)
 values(p_user_id,p_role,case when p_role='grader' then upper(btrim(p_subject_code)) end)
 on conflict(user_id) do update set role=excluded.role,subject_code=excluded.subject_code,updated_at=now();
 update public.exam_grader_assignments set active=false where user_id=p_user_id
 and (p_role='admin' or subject_code<>upper(btrim(p_subject_code)));
 return jsonb_build_object('user_id',p_user_id,'role',p_role);
end $$;
create or replace function public.exam_assign_grader(p_exam_id uuid,p_subject_code text,p_user_id uuid,p_active boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.exam_is_admin() then raise exception 'Chỉ Admin được phân công.' using errcode='42501'; end if;
 if not exists(select 1 from public.exam_account_roles a where a.user_id=p_user_id and a.role='grader' and a.subject_code=upper(btrim(p_subject_code))) then
 raise exception 'Giáo viên phải được gán đúng một môn tại Quản lý tài khoản.'; end if;
 insert into public.exam_grader_assignments(exam_id,subject_code,user_id,active,assigned_by)
 values(p_exam_id,upper(btrim(p_subject_code)),p_user_id,p_active,auth.uid())
 on conflict(exam_id,subject_code,user_id) do update set active=excluded.active,assigned_by=auth.uid(),assigned_at=now();
 return jsonb_build_object('active',p_active);
end $$;
create or replace function public.exam_set_grading_window(p_exam_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.exam_is_admin() then raise exception 'Chỉ Admin được đặt thời hạn.' using errcode='42501'; end if;
 if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or not isfinite(p_starts_at) or not isfinite(p_ends_at) then raise exception 'Thời hạn không hợp lệ.'; end if;
 insert into public.exam_grading_windows(exam_id,starts_at,ends_at,updated_by)
 values(p_exam_id,p_starts_at,p_ends_at,auth.uid())
 on conflict(exam_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_by=auth.uid(),updated_at=now();
 return jsonb_build_object('exam_id',p_exam_id);
end $$;
create or replace function public.exam_get_grading_window(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.exam_grading_windows%rowtype;
begin
 if not public.exam_is_admin() and not exists(select 1 from public.exam_account_roles a where a.user_id=auth.uid() and public.exam_teacher_allowed(p_exam_id,a.subject_code)) then
 raise exception 'Không được truy cập kỳ thi.' using errcode='42501'; end if;
 select * into w from public.exam_grading_windows where exam_id=p_exam_id;
 return jsonb_build_object('starts_at',w.starts_at,'ends_at',w.ends_at,'server_now',clock_timestamp(),'is_open',coalesce(clock_timestamp() between w.starts_at and w.ends_at,false));
end $$;
create or replace function public.exam_list_grading_work()
returns table(exam_id uuid,exam_title text,subject_code text,maximum_score numeric,score_step numeric,decimal_places integer,default_score numeric)
language sql stable security definer set search_path=public,pg_temp as $$
 select e.id,coalesce(nullif(e.form_exam_title,''),e.name),c.subject_code,c.maximum_score,c.score_step,c.decimal_places::integer,c.default_score
 from public.exam_sessions e join public.exam_subject_assessment_configs c on c.exam_id=e.id
 where c.is_essay and public.exam_teacher_allowed(e.id,c.subject_code)
 and exists(select 1 from public.exam_script_runs r where r.exam_id=e.id and r.subject_code=c.subject_code and r.status='locked')
 order by e.id,c.subject_code;
$$;
-- Non-room schemes use the entire code as ownership unit when no letter prefix exists.
create or replace function public.exam_score_head(p_code text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select coalesce(nullif(substring(p_code from '^[A-Za-z]+'),''),p_code);
$$;
create or replace function public.exam_head_available(p_run uuid,p_head text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select not exists(select 1 from public.exam_grading_head_claims c where c.run_id=p_run and c.head=p_head and c.user_id<>auth.uid())
 and not exists(select 1 from public.exam_script_records r join public.exam_script_scores s on s.script_record_id=r.id
 where r.run_id=p_run and public.exam_score_head(r.phach_code)=p_head and s.entered_by is distinct from auth.uid());
$$;
create or replace function public.exam_get_grading_queue(p_exam_id uuid,p_subject_code text,p_phach_prefix text default '')
returns table(phach_code text,score numeric,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.exam_teacher_allowed(p_exam_id,p_subject_code) then raise exception 'Không được phân công môn này.' using errcode='42501'; end if;
 return query select r.phach_code,s.score,s.updated_at
 from public.exam_script_records r left join public.exam_script_scores s on s.script_record_id=r.id
 where r.run_id=(select run.id from public.exam_script_runs run where run.exam_id=p_exam_id
 and run.subject_code=upper(btrim(p_subject_code)) and run.status='locked' order by run.locked_at desc nulls last,run.id desc limit 1)
 and not r.is_absent and r.phach_code is not null
 and (coalesce(p_phach_prefix,'')='' or public.exam_score_head(r.phach_code)=p_phach_prefix)
 and public.exam_can_grade_script_room(r.run_id,r.room_code)
 and public.exam_head_available(r.run_id,public.exam_score_head(r.phach_code))
 order by r.script_order,r.phach_code;
end $$;
create or replace function public.exam_get_grading_heads(p_exam_id uuid,p_subject_code text)
returns table(phach_prefix text)
language sql stable security definer set search_path=public,pg_temp as $$
 select distinct public.exam_score_head(q.phach_code) from public.exam_get_grading_queue(p_exam_id,p_subject_code,'') q order by 1;
$$;
create or replace function public.exam_save_script_score(p_exam_id uuid,p_subject_code text,p_phach_code text,p_score numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.exam_subject_assessment_configs%rowtype;
 rec public.exam_script_records%rowtype; previous numeric; v_head text; owner_id uuid;
 w public.exam_grading_windows%rowtype;
begin
 if not public.exam_teacher_allowed(p_exam_id,p_subject_code) then raise exception 'Không được phân công môn này.' using errcode='42501'; end if;
 select * into cfg from public.exam_subject_assessment_configs where exam_id=p_exam_id and subject_code=upper(btrim(p_subject_code)) and is_essay for share;
 if not found then raise exception 'Chưa cấu hình điểm.'; end if;
 if p_score is null or p_score::text in ('NaN','Infinity','-Infinity') or p_score<0 or p_score>cfg.maximum_score
 or round(p_score,cfg.decimal_places)<>p_score
 or (cfg.score_step is not null and mod(p_score,cfg.score_step)<>0) then raise exception 'Điểm không phù hợp thang điểm, bước điểm hoặc số chữ số thập phân.'; end if;
 select * into rec from public.exam_script_records r where r.run_id=(
 select run.id from public.exam_script_runs run where run.exam_id=p_exam_id and run.subject_code=upper(btrim(p_subject_code))
 and run.status='locked' order by run.locked_at desc nulls last,run.id desc limit 1)
 and r.phach_code=p_phach_code and not r.is_absent;
 if not found then raise exception 'Phách không thuộc phương án đã khóa hiện tại.'; end if;
 if not public.exam_can_grade_script_room(rec.run_id,rec.room_code) then raise exception 'Không được phân công túi/phòng này.' using errcode='42501'; end if;
 v_head:=public.exam_score_head(rec.phach_code);
 perform pg_advisory_xact_lock(hashtextextended(rec.run_id::text||':'||v_head,119));
 -- Check the actual clock AFTER waiting for the ownership lock.
 select * into w from public.exam_grading_windows where exam_id=p_exam_id for share;
 if not found or not(clock_timestamp() between w.starts_at and w.ends_at) then raise exception 'Ngoài thời hạn nhập điểm.' using errcode='42501'; end if;
 if not public.exam_head_available(rec.run_id,v_head) then raise exception 'Đầu phách đã được giáo viên khác nhập điểm.' using errcode='42501'; end if;
 insert into public.exam_grading_head_claims(run_id,head,user_id) values(rec.run_id,v_head,auth.uid()) on conflict do nothing;
 select user_id into owner_id from public.exam_grading_head_claims where run_id=rec.run_id and exam_grading_head_claims.head=v_head;
 if owner_id is distinct from auth.uid() then raise exception 'Đầu phách thuộc giáo viên khác.' using errcode='42501'; end if;
 select score into previous from public.exam_script_scores where script_record_id=rec.id for update;
 insert into public.exam_script_scores(script_record_id,score,entered_by,entered_at,updated_at)
 values(rec.id,p_score,auth.uid(),clock_timestamp(),clock_timestamp())
 on conflict(script_record_id) do update set score=excluded.score,updated_at=excluded.updated_at;
 insert into public.exam_script_score_events(script_record_id,previous_score,new_score,changed_by,changed_at)
 values(rec.id,previous,p_score,auth.uid(),clock_timestamp());
 return jsonb_build_object('phach_code',p_phach_code,'score',p_score);
end $$;
create or replace function public.exam_import_script_scores(p_exam_id uuid,p_subject_code text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare row_data jsonb; total integer:=0;
begin
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Danh sách điểm không hợp lệ.'; end if;
 if jsonb_array_length(p_rows)=0 then raise exception 'Danh sách rỗng.'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'phach_code' having count(*)>1) then raise exception 'Mã phách trùng.'; end if;
 -- Sorted acquisition avoids deadlocks between concurrent bulk imports.
 for row_data in select value from jsonb_array_elements(p_rows) order by value->>'phach_code' loop
 perform public.exam_save_script_score(p_exam_id,p_subject_code,row_data->>'phach_code',(row_data->>'score')::numeric);
 total:=total+1;
 end loop;
 return jsonb_build_object('saved_count',total);
end $$;
create or replace function public.exam_get_score_audit(p_exam_id uuid)
returns table(id bigint,subject_code text,phach_code text,previous_score numeric,new_score numeric,changed_by uuid,changed_by_email text,changed_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.exam_is_admin() then raise exception 'Chỉ Admin được xem nhật ký.' using errcode='42501'; end if;
 return query select e.id,run.subject_code,r.phach_code,e.previous_score,e.new_score,e.changed_by,u.email::text,e.changed_at
 from public.exam_script_score_events e join public.exam_script_records r on r.id=e.script_record_id
 join public.exam_script_runs run on run.id=r.run_id left join auth.users u on u.id=e.changed_by
 where run.exam_id=p_exam_id order by e.id desc;
end $$;

do $permissions$
declare f record;
begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in(
 'exam_is_admin','exam_current_user_role','exam_teacher_allowed','exam_manage_accounts','exam_set_account_role',
 'exam_assign_grader','exam_set_grading_window','exam_get_grading_window','exam_list_grading_work',
 'exam_score_head','exam_head_available','exam_get_grading_queue','exam_get_grading_heads',
 'exam_save_script_score','exam_import_script_scores','exam_get_score_audit') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname not in ('exam_teacher_allowed','exam_score_head','exam_head_available') then
 execute format('grant execute on function %s to authenticated',f.signature);
 end if;
 end loop;
end $permissions$;
notify pgrst,'reload schema';
commit;
