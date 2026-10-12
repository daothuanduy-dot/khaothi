-- KHAO THI THPT LE HONG PHONG - v0.1.0
-- Chạy trên Supabase project RIÊNG của hệ thống khảo thí.
-- Migrate thử ở project staging trước khi dùng chính thức.
begin;
create extension if not exists pgcrypto;

create table if not exists public.exam_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_year text not null,
  status text not null default 'draft' check (status in ('draft','registration','registration_locked','rooming','locked','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_candidates (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_sessions(id) on delete cascade,
  sbd text not null,
  student_code text not null,
  student_name text not null,
  class_code text not null,
  elective_1 text not null check (elective_1 in ('SU','DIA','GDKTPL','LY','HOA','SINH','TIN')),
  elective_2 text not null check (elective_2 in ('SU','DIA','GDKTPL','LY','HOA','SINH','TIN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, sbd),
  check (elective_1 <> elective_2)
);
create index if not exists ix_exam_candidates_exam_sbd on public.exam_candidates(exam_id, sbd);
create index if not exists ix_exam_candidates_exam_pair on public.exam_candidates(exam_id, elective_1, elective_2);

create table if not exists public.exam_elective_room_plans (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_sessions(id) on delete restrict,
  plan_name text not null default 'Phương án xếp phòng môn lựa chọn',
  capacity integer not null check (capacity between 1 and 100),
  room_prefix text not null default 'P',
  first_room_number integer not null default 1 check (first_room_number > 0),
  status text not null default 'draft' check (status in ('draft','saved','locked','cancelled')),
  algorithm_code text not null default 'same_pair_per_room_v1',
  input_snapshot jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  locked_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_exam_room_plans_exam on public.exam_elective_room_plans(exam_id, created_at desc);

create table if not exists public.exam_elective_room_plan_rooms (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.exam_elective_room_plans(id) on delete cascade,
  room_number integer not null check (room_number > 0),
  room_code text not null,
  capacity integer not null check (capacity between 1 and 100),
  student_count integer not null check (student_count >= 0 and student_count <= capacity),
  ca1_subject_code text not null check (ca1_subject_code in ('SU','DIA','GDKTPL','LY','HOA','SINH','TIN')),
  ca2_subject_code text not null check (ca2_subject_code in ('SU','DIA','GDKTPL','LY','HOA','SINH','TIN')),
  created_at timestamptz not null default now(),
  unique(plan_id, room_number), unique(plan_id, room_code), unique(id,plan_id),
  check(ca1_subject_code <> ca2_subject_code)
);
create table if not exists public.exam_elective_room_plan_candidates (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.exam_elective_room_plans(id) on delete cascade,
  candidate_id uuid not null references public.exam_candidates(id) on delete restrict,
  room_plan_id uuid not null,
  ca1_subject_code text not null,
  ca2_subject_code text not null,
  created_at timestamptz not null default now(),
  unique(plan_id,candidate_id),
  foreign key(room_plan_id,plan_id) references public.exam_elective_room_plan_rooms(id,plan_id) on delete cascade,
  check(ca1_subject_code <> ca2_subject_code)
);
create index if not exists ix_exam_plan_candidates_room on public.exam_elective_room_plan_candidates(plan_id,room_plan_id);

alter table public.exam_profiles enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.exam_candidates enable row level security;
alter table public.exam_elective_room_plans enable row level security;
alter table public.exam_elective_room_plan_rooms enable row level security;
alter table public.exam_elective_room_plan_candidates enable row level security;

-- Người dùng chỉ đọc hồ sơ của mình; admin được cấp quyền qua cột is_admin,
-- cột này chỉ được thay đổi bằng SQL Dashboard của chủ project.
drop policy if exists exam_profiles_select_self on public.exam_profiles;
create policy exam_profiles_select_self on public.exam_profiles for select to authenticated using (user_id = auth.uid());
create or replace function public.exam_is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.exam_profiles p where p.user_id=auth.uid() and p.is_admin=true)
$$;
revoke all on function public.exam_is_admin() from public;
grant execute on function public.exam_is_admin() to authenticated;

do $$ declare t text; begin
  foreach t in array array['exam_sessions','exam_candidates','exam_elective_room_plans','exam_elective_room_plan_rooms','exam_elective_room_plan_candidates'] loop
    execute format('drop policy if exists %I on public.%I',t||'_admin_all',t);
    execute format('create policy %I on public.%I for all to authenticated using (public.exam_is_admin()) with check (public.exam_is_admin())',t||'_admin_all',t);
  end loop;
end $$;

-- Do not expose direct writes to anon/public. Authenticated policies require exam admin.
grant select, insert, update, delete on public.exam_sessions, public.exam_candidates,
  public.exam_elective_room_plans, public.exam_elective_room_plan_rooms,
  public.exam_elective_room_plan_candidates to authenticated;
grant select on public.exam_profiles to authenticated;

commit;
