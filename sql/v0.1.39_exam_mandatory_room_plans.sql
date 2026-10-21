-- v0.1.39: lưu phương án xếp phòng môn bắt buộc độc lập với môn lựa chọn
create table if not exists public.exam_mandatory_room_plans (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_sessions(id) on delete cascade,
  subject_code text not null check (subject_code in ('TOAN','VAN')),
  capacity integer not null check (capacity between 1 and 100),
  room_prefix text not null default 'M',
  first_room_number integer not null default 1 check (first_room_number >= 1),
  rooms jsonb not null default '[]'::jsonb,
  assignments jsonb not null default '[]'::jsonb,
  is_locked boolean not null default false,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_exam_mandatory_room_plans_exam
  on public.exam_mandatory_room_plans(exam_id, subject_code, created_at desc);
alter table public.exam_mandatory_room_plans enable row level security;
drop policy if exists exam_mandatory_room_plans_admin_select on public.exam_mandatory_room_plans;
create policy exam_mandatory_room_plans_admin_select on public.exam_mandatory_room_plans for select to authenticated using (public.exam_is_admin());
drop policy if exists exam_mandatory_room_plans_admin_insert on public.exam_mandatory_room_plans;
create policy exam_mandatory_room_plans_admin_insert on public.exam_mandatory_room_plans for insert to authenticated with check (public.exam_is_admin());
drop policy if exists exam_mandatory_room_plans_admin_update on public.exam_mandatory_room_plans;
create policy exam_mandatory_room_plans_admin_update on public.exam_mandatory_room_plans for update to authenticated using (public.exam_is_admin()) with check (public.exam_is_admin());
grant select, insert, update on public.exam_mandatory_room_plans to authenticated;
create or replace function public.exam_save_mandatory_room_plan(
  p_exam_id uuid, p_subject_code text, p_capacity integer, p_room_prefix text,
  p_first_room_number integer, p_rooms jsonb, p_assignments jsonb, p_lock boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.exam_is_admin() then raise exception 'Không có quyền lưu phương án xếp phòng.'; end if;
  if p_subject_code not in ('TOAN','VAN') then raise exception 'Môn bắt buộc chỉ được là TOAN hoặc VAN.'; end if;
  if p_capacity < 1 or p_capacity > 100 then raise exception 'Sức chứa phòng phải từ 1 đến 100.'; end if;
  if p_first_room_number < 1 then raise exception 'Số phòng bắt đầu phải lớn hơn 0.'; end if;
  if jsonb_typeof(p_rooms) <> 'array' or jsonb_typeof(p_assignments) <> 'array' then raise exception 'Danh sách phòng và phân công phải ở định dạng JSON array.'; end if;
  insert into public.exam_mandatory_room_plans(exam_id,subject_code,capacity,room_prefix,first_room_number,rooms,assignments,is_locked,created_by,updated_at)
  values(p_exam_id,p_subject_code,p_capacity,coalesce(nullif(trim(p_room_prefix),''),'M'),p_first_room_number,p_rooms,p_assignments,coalesce(p_lock,false),auth.uid(),now())
  returning id into v_id;
  return jsonb_build_object('plan_id',v_id,'exam_id',p_exam_id,'subject_code',p_subject_code,'is_locked',coalesce(p_lock,false),
    'room_count',jsonb_array_length(p_rooms),'candidate_count',jsonb_array_length(p_assignments));
end; $$;
revoke all on function public.exam_save_mandatory_room_plan(uuid,text,integer,text,integer,jsonb,jsonb,boolean) from public;
grant execute on function public.exam_save_mandatory_room_plan(uuid,text,integer,text,integer,jsonb,jsonb,boolean) to authenticated;
