-- v0.1.91: independent rooming rounds and automatic/manual validation.
-- This table is deliberately separate from the legacy rooming tables so
-- round 1 and round 2 can never overwrite one another.

create table if not exists public.exam_rooming_round_plans (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_sessions(id) on delete cascade,
  round_no smallint not null check (round_no in (1,2)),
  plan_type text not null check (plan_type in ('mandatory','elective','subject')),
  subject_code text null,
  adjustment_mode text not null default 'automatic' check (adjustment_mode in ('automatic','manual')),
  capacity integer not null check (capacity >= 1),
  room_prefix text not null,
  first_room_number integer not null check (first_room_number >= 1),
  rooms jsonb not null default '[]'::jsonb,
  assignments jsonb not null default '[]'::jsonb,
  status text not null default 'saved' check (status in ('saved','official')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_exam_rooming_round_plans_lookup
  on public.exam_rooming_round_plans(exam_id, round_no, plan_type, subject_code, created_at desc);

alter table public.exam_rooming_round_plans enable row level security;
drop policy if exists exam_rooming_round_plans_admin_select on public.exam_rooming_round_plans;
create policy exam_rooming_round_plans_admin_select on public.exam_rooming_round_plans
  for select to authenticated using (public.exam_is_admin());

create or replace function public.exam_validate_rooming_round(
  p_exam_id uuid,
  p_round_no smallint,
  p_plan_type text,
  p_subject_code text,
  p_capacity integer,
  p_rooms jsonb,
  p_assignments jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_expected integer;
  v_assigned integer;
  v_room jsonb;
  v_assignment jsonb;
  v_candidate public.exam_candidates%rowtype;
  v_candidate_id uuid;
  v_room_code text;
  v_code1 text;
  v_code2 text;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Khong co quyen quan tri khao thi.' using errcode = '42501';
  end if;
  if p_exam_id is null or p_round_no not in (1,2) then
    raise exception 'Ky thi hoac dot thi khong hop le.';
  end if;
  if p_plan_type not in ('mandatory','elective','subject') then
    raise exception 'Loai phuong an khong hop le.';
  end if;
  if p_capacity is null or p_capacity < 1 then
    raise exception 'Si so phong phai la so nguyen duong do nguoi xep phong nhap.';
  end if;
  if jsonb_typeof(p_rooms) <> 'array' or jsonb_array_length(p_rooms)=0 then
    raise exception 'Phuong an chua co phong.';
  end if;
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments)=0 then
    raise exception 'Phuong an chua co phan cong thi sinh.';
  end if;

  if not exists(select 1 from public.exam_rounds where exam_id=p_exam_id and round_no=p_round_no and is_active) then
    raise exception 'Kỳ thi chưa được cấu hình học sinh cho đợt %. Hãy cấu hình đợt trước khi xếp phòng.',p_round_no;
  end if;
  if p_plan_type in ('mandatory','subject') and not exists(select 1 from public.exam_round_subjects where exam_id=p_exam_id and round_no=p_round_no and subject_code=upper(p_subject_code)) then
    raise exception 'Môn % chưa được cấu hình cho đợt %.',p_subject_code,p_round_no;
  end if;
  if p_plan_type='elective' and not exists(select 1 from public.exam_round_subjects where exam_id=p_exam_id and round_no=p_round_no and subject_type='elective') then
    raise exception 'Đợt % chưa được cấu hình môn lựa chọn.',p_round_no;
  end if;
  select count(*) into v_expected
    from public.exam_round_candidates rc
    join public.exam_candidates c on c.id=rc.candidate_id and c.exam_id=rc.exam_id
   where rc.exam_id=p_exam_id and rc.round_no=p_round_no
     and (
       p_round_no <> 2
       or not exists (
         select 1 from public.exam_rooming_round_plans old
          cross join lateral jsonb_array_elements(old.assignments) a(value)
         where old.exam_id=p_exam_id and old.round_no=1 and old.status='official'
           and a.value->>'candidate_id'=c.id::text
       )
     )
    and (p_plan_type='mandatory'
      or (p_plan_type='subject' and exists (
        select 1 from public.exam_candidate_subjects s
        where s.exam_id=p_exam_id and s.candidate_id=c.id
          and upper(s.subject_code)=upper(p_subject_code)
      ))
      or (p_plan_type='elective' and exists (
       select 1 from public.exam_candidate_subjects s
        where s.exam_id=p_exam_id and s.candidate_id=c.id and s.subject_type='elective'
        group by s.candidate_id
       having count(distinct s.subject_code)=2
          and count(distinct s.subject_code) filter (where s.subject_order=1)=1
          and count(distinct s.subject_code) filter (where s.subject_order=2)=1
     )));

  v_assigned:=jsonb_array_length(p_assignments);
  if v_assigned<>v_expected then
    raise exception 'So phan cong (%) khong khop so thi sinh du dieu kien cua dot (%) (%).',v_assigned,p_round_no,v_expected;
  end if;

  if exists (select 1 from jsonb_array_elements(p_assignments) x(value)
             group by x.value->>'candidate_id' having count(*)>1) then
    raise exception 'Co thi sinh duoc phan cong nhieu lan.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rooms) x(value)
    where nullif(btrim(x.value->>'room_code'),'') is null
       or coalesce((x.value->>'room_number')::integer,0)<1
       or coalesce((x.value->>'capacity')::integer,0)<>p_capacity
       or coalesce((x.value->>'student_count')::integer,0)<1
       or coalesce((x.value->>'student_count')::integer,0)>p_capacity
  ) then
    raise exception 'Phong co ma, si so hoac suc chua khong hop le.';
  end if;
  if (select count(distinct x.value->>'room_code') from jsonb_array_elements(p_rooms) x(value))
       <> jsonb_array_length(p_rooms) then raise exception 'Ma phong bi trung.'; end if;
  if (select count(distinct (x.value->>'room_number')::integer) from jsonb_array_elements(p_rooms) x(value))
       <> jsonb_array_length(p_rooms) then raise exception 'So phong bi trung.'; end if;

  if p_plan_type='elective' and exists (
    select 1 from jsonb_array_elements(p_rooms) r(value)
    cross join lateral jsonb_array_elements_text(coalesce(r.value->'ca1_subject_codes','[]'::jsonb)) a(code)
    join lateral jsonb_array_elements_text(coalesce(r.value->'ca2_subject_codes','[]'::jsonb)) b(code) on a.code=b.code
  ) then raise exception 'Mot mon bi xep o ca 1 va ca 2 trong cung phong.'; end if;

  for v_assignment in select value from jsonb_array_elements(p_assignments)
  loop
    v_candidate_id:=(v_assignment->>'candidate_id')::uuid;
    select c.* into v_candidate from public.exam_candidates c
    join public.exam_round_candidates rc on rc.candidate_id=c.id and rc.exam_id=c.exam_id
    where c.id=v_candidate_id and c.exam_id=p_exam_id and rc.round_no=p_round_no;
    if not found then raise exception 'Thi sinh trong phan cong khong thuoc ky thi.'; end if;
    if exists (
      select 1 from public.exam_rooming_round_plans old
      cross join lateral jsonb_array_elements(old.assignments) a(value)
      where old.exam_id=p_exam_id and old.round_no=1 and old.status='official'
        and a.value->>'candidate_id'=v_candidate_id::text and p_round_no=2
    ) then raise exception 'Thi sinh % da thi dot 1, khong duoc xep dot 2.',v_candidate.student_code; end if;
    if p_round_no=2 and exists (
      select 1 from public.exam_rooming_finalizations old_final
      join public.exam_room_assignments old_assignment on old_assignment.finalization_id=old_final.id
      where old_final.exam_id=p_exam_id and old_final.is_current and old_assignment.candidate_id=v_candidate_id
    ) then raise exception 'Thi sinh % da thi dot 1, khong duoc xep dot 2.',v_candidate.student_code; end if;
    v_room_code:=nullif(btrim(v_assignment->>'room_code'),'');
    if not exists (select 1 from jsonb_array_elements(p_rooms) r(value) where r.value->>'room_code'=v_room_code) then
      raise exception 'Thi sinh % chua duoc gan vao phong hop le.',v_candidate.student_code;
    end if;
    if p_plan_type in ('mandatory','subject') then
      if nullif(btrim(v_assignment->>'subject_code'),'') is distinct from upper(p_subject_code) then
        raise exception 'Mon bat buoc cua thi sinh % khong khop phuong an.',v_candidate.student_code;
      end if;
      if p_plan_type='subject' and not exists (
        select 1 from public.exam_candidate_subjects s
        where s.exam_id=p_exam_id and s.candidate_id=v_candidate_id
          and upper(s.subject_code)=upper(p_subject_code)
      ) then
        raise exception 'Thi sinh % chua dang ky mon %.',v_candidate.student_code,p_subject_code;
      end if;
    else
      v_code1:=nullif(btrim(v_assignment->>'ca1_subject_code'),'');
      v_code2:=nullif(btrim(v_assignment->>'ca2_subject_code'),'');
      if v_code1 is null or v_code2 is null or v_code1=v_code2 then
        raise exception 'Cap mon cua thi sinh % khong hop le.',v_candidate.student_code;
      end if;
      if not exists (select 1 from public.exam_candidate_subjects s where s.exam_id=p_exam_id and s.candidate_id=v_candidate_id and s.subject_type='elective' and s.subject_code in (v_code1,v_code2) group by s.candidate_id having count(distinct s.subject_code)=2) then
        raise exception 'Mon cua thi sinh % khong khop dang ky.',v_candidate.student_code;
      end if;
      if not exists (select 1 from jsonb_array_elements(p_rooms) r(value) where r.value->>'room_code'=v_room_code and (r.value->'ca1_subject_codes') ? v_code1 and (r.value->'ca2_subject_codes') ? v_code2) then
        raise exception 'Ca mon cua thi sinh % khong khop phong.',v_candidate.student_code;
      end if;
    end if;
  end loop;

  for v_room in select value from jsonb_array_elements(p_rooms)
  loop
    v_room_code:=v_room->>'room_code';
    if (select count(*) from jsonb_array_elements(p_assignments) a(value) where a.value->>'room_code'=v_room_code)
       <> (v_room->>'student_count')::integer then
      raise exception 'Si so phong % khong khop so phan cong.',v_room_code;
    end if;
  end loop;
  return jsonb_build_object('candidate_count',v_expected,'assignment_count',v_assigned);
end;
$function$;

create or replace function public.exam_save_rooming_round_plan(
  p_exam_id uuid,p_round_no smallint,p_plan_type text,p_subject_code text,
  p_adjustment_mode text,p_capacity integer,p_room_prefix text,p_first_room_number integer,
  p_rooms jsonb,p_assignments jsonb,p_lock boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_id uuid; v_validation jsonb;
begin
  v_validation:=public.exam_validate_rooming_round(p_exam_id,p_round_no,p_plan_type,p_subject_code,p_capacity,p_rooms,p_assignments);
  if p_adjustment_mode not in ('automatic','manual') then raise exception 'Che do dieu chinh khong hop le.'; end if;
  update public.exam_rooming_round_plans set status='saved',updated_at=now()
   where exam_id=p_exam_id and round_no=p_round_no and plan_type=p_plan_type
     and coalesce(subject_code,'')=coalesce(p_subject_code,'') and status='saved';
  insert into public.exam_rooming_round_plans(exam_id,round_no,plan_type,subject_code,adjustment_mode,capacity,room_prefix,first_room_number,rooms,assignments,status)
  values(p_exam_id,p_round_no,p_plan_type,nullif(p_subject_code,''),p_adjustment_mode,p_capacity,trim(p_room_prefix),p_first_room_number,p_rooms,p_assignments,case when p_lock then 'official' else 'saved' end)
  returning id into v_id;
  return jsonb_build_object('plan_id',v_id,'round_no',p_round_no,'status',case when p_lock then 'official' else 'saved' end,'validation',v_validation);
end;
$function$;

create or replace function public.exam_finalize_rooming_round_plan(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_plan public.exam_rooming_round_plans%rowtype;
begin
  if auth.uid() is null or not public.exam_is_admin() then raise exception 'Khong co quyen phan phong chinh thuc.' using errcode='42501'; end if;
  select * into v_plan from public.exam_rooming_round_plans where id=p_plan_id;
  if not found then raise exception 'Khong tim thay phuong an da luu.'; end if;
  perform public.exam_validate_rooming_round(v_plan.exam_id,v_plan.round_no,v_plan.plan_type,v_plan.subject_code,v_plan.capacity,v_plan.rooms,v_plan.assignments);
  update public.exam_rooming_round_plans set status='saved',updated_at=now()
   where exam_id=v_plan.exam_id and round_no=v_plan.round_no and plan_type=v_plan.plan_type
     and coalesce(subject_code,'')=coalesce(v_plan.subject_code,'') and status='official';
  update public.exam_rooming_round_plans set status='official',updated_at=now() where id=p_plan_id;
  return jsonb_build_object('plan_id',p_plan_id,'round_no',v_plan.round_no,'status','official','assignment_count',jsonb_array_length(v_plan.assignments),'room_count',jsonb_array_length(v_plan.rooms));
end;
$function$;

grant execute on function public.exam_validate_rooming_round(uuid,smallint,text,text,integer,jsonb,jsonb) to authenticated;
grant execute on function public.exam_save_rooming_round_plan(uuid,smallint,text,text,text,integer,text,integer,jsonb,jsonb,boolean) to authenticated;
grant execute on function public.exam_finalize_rooming_round_plan(uuid) to authenticated;
