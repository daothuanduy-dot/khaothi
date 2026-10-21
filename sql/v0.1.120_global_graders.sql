-- Apply after v0.1.119. Global teacher/group catalog; actual work grants access.
begin;
alter table public.exam_grader_groups alter column exam_id drop not null;
update public.exam_grader_groups set exam_id=null where exam_id is not null;
-- Keep this legacy column for compatible RPC/table clients, never bind new groups to exams.
alter table public.exam_grader_groups drop constraint if exists exam_grader_groups_global_only;
alter table public.exam_grader_groups add constraint exam_grader_groups_global_only check(exam_id is null);

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
  if nullif(btrim(p_subject_code),'') is null
    or length(btrim(coalesce(p_name,''))) not between 1 and 100
    or coalesce(cardinality(p_user_ids),0)=0
    or (select count(distinct u.user_id) from unnest(p_user_ids) as u(user_id))<>cardinality(p_user_ids) then
    raise exception 'Tên nhóm, môn hoặc danh sách giám khảo không hợp lệ.';
  end if;
  if exists(select 1 from unnest(p_user_ids) x(user_id)
    where not exists(select 1 from public.exam_account_roles g
      where g.subject_code=upper(btrim(p_subject_code))
        and g.user_id=x.user_id and g.role='grader')) then
    raise exception 'Mọi thành viên phải là giáo viên cùng môn trong danh mục tài khoản.';
  end if;
  if v_group_id is null then
    insert into public.exam_grader_groups(exam_id,subject_code,name,created_by)
    values(null,upper(btrim(p_subject_code)),btrim(p_name),auth.uid())
    returning id into v_group_id;
  else
    update public.exam_grader_groups
    set name=btrim(p_name),updated_at=now()
    where id=v_group_id and subject_code=upper(btrim(p_subject_code));
    if not found then raise exception 'Không tìm thấy nhóm thuộc kỳ thi/môn đang chọn.'; end if;
  end if;
  delete from public.exam_grader_group_members where group_id=v_group_id;
  insert into public.exam_grader_group_members(group_id,user_id)
  select v_group_id,x from unnest(p_user_ids) x;
  return v_group_id;
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
      if not exists(select 1 from public.exam_account_roles g
        where g.subject_code=v_run.subject_code
          and g.user_id=v_user_id and g.role='grader') then
        raise exception 'Giám khảo phải được phân công vào đúng môn trước khi nhận túi.';
      end if;
    else
      v_group_id:=(v_row->>'group_id')::uuid;
      if not exists(select 1 from public.exam_grader_groups g
        where g.id=v_group_id and g.subject_code=v_run.subject_code) then
        raise exception 'Nhóm không thuộc môn của phương án phách.';
      end if;
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_rows) x(value)
    group by x.value->>'room_code' having count(*)>1) then
    raise exception 'Một túi/phòng chỉ được gán một lần.';
  end if;
  -- Keep ownership of already scored/claimed rooms unchanged.
  if exists (
    select 1 from public.exam_script_bag_assignments b
    where b.run_id=p_run_id
    and exists(select 1 from public.exam_script_records r
      where r.run_id=b.run_id and r.room_code=b.room_code
      and (exists(select 1 from public.exam_script_scores sc where sc.script_record_id=r.id)
        or exists(select 1 from public.exam_grading_head_claims c
          where c.run_id=r.run_id and c.head=public.exam_score_head(r.phach_code))))
    and not exists(select 1 from jsonb_array_elements(p_rows) x
      where x->>'room_code'=b.room_code
      and nullif(x->>'user_id','')::uuid is not distinct from b.user_id
      and nullif(x->>'group_id','')::uuid is not distinct from b.group_id)
  ) then raise exception 'Không đổi hoặc gỡ phân công túi đã có điểm/người phụ trách.'; end if;
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
  select count(*) into v_grader_count from public.exam_account_roles
  where subject_code=v_run.subject_code and role='grader';
  if v_bag_count=0 then raise exception 'Phương án phách chưa có túi bài.'; end if;
  if v_grader_count=0 then raise exception 'Chưa có giám khảo nào được phân công vào môn này.'; end if;
  if exists(select 1 from public.exam_script_records r join public.exam_script_scores s on s.script_record_id=r.id where r.run_id=p_run_id)
    or exists(select 1 from public.exam_grading_head_claims c where c.run_id=p_run_id) then
    raise exception 'Không bốc thăm lại phương án đã có điểm/người phụ trách.';
  end if;
  delete from public.exam_script_bag_assignments where run_id=p_run_id;
  with rooms as (
    select room_code,row_number() over(order by gen_random_uuid()) as draw_order
    from (select distinct room_code from public.exam_script_records where run_id=p_run_id) r
  ), graders as (
    select user_id,row_number() over(order by gen_random_uuid()) as draw_order
    from public.exam_account_roles
    where subject_code=v_run.subject_code and role='grader'
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
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(
 select 1 from public.exam_script_runs r
 join public.exam_account_roles a on a.user_id=auth.uid() and a.role='grader' and a.subject_code=r.subject_code
 join public.exam_script_bag_assignments b on b.run_id=r.id and b.room_code=p_room_code
 where r.id=p_run_id and r.status='locked'
 and (b.user_id=auth.uid() or exists(
 select 1 from public.exam_grader_groups g join public.exam_grader_group_members m on m.group_id=g.id
 where g.id=b.group_id and g.subject_code=r.subject_code and m.user_id=auth.uid())));
$$;
create or replace function public.exam_teacher_allowed(p_exam_id uuid,p_subject_code text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(
 select 1 from public.exam_script_runs r join public.exam_script_bag_assignments b on b.run_id=r.id
 where r.exam_id=p_exam_id and r.subject_code=upper(btrim(p_subject_code)) and r.status='locked'
 and public.exam_can_grade_script_room(r.id,b.room_code));
$$;
-- Old clients must not silently grant exam-wide access.
create or replace function public.exam_assign_grader(p_exam_id uuid,p_subject_code text,p_user_id uuid,p_active boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 raise exception 'Luồng cấp quyền kỳ thi đã bỏ. Hãy tải lại trang và giao túi bài cho giáo viên hoặc nhóm.';
end $$;
revoke all on function public.exam_assign_grader(uuid,text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.exam_teacher_allowed(uuid,text) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

