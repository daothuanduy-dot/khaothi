-- Requires v0.1.92 and v0.1.111. Installing this migration changes no exam data.
begin;
create table if not exists public.exam_sbd_reset_archives (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  reason text not null,
  payload jsonb not null
);
alter table public.exam_sbd_reset_archives enable row level security;
revoke all on public.exam_sbd_reset_archives from public, anon, authenticated;
grant select on public.exam_sbd_reset_archives to authenticated;
drop policy if exists sbd_reset_archive_admin_read on public.exam_sbd_reset_archives;
create policy sbd_reset_archive_admin_read on public.exam_sbd_reset_archives
  for select to authenticated using (public.exam_is_admin());

create or replace function public.exam_archive_rooming_and_reset_sbd(p_exam_id uuid, p_confirmation text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare
  v_archive uuid;
  v_payload jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_table text;
  v_exists boolean;
  v_count integer;
  v_reset_setting text := current_setting('exam.reset_sbd',true);
  v_delete_setting text := current_setting('exam.cascade_delete',true);
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền lập lại SBD.' using errcode='42501';
  end if;
  if p_exam_id is null or p_confirmation is distinct from 'LAP LAI SBD' then
    raise exception 'Cần xác nhận LAP LAI SBD.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_exam_id::text,0));
  -- Serialize against concurrent room finalization, scoring and candidate updates.
  -- NOWAIT leaves data unchanged if an examination operation is in progress.
  lock table public.exam_sessions, public.exam_candidates,
    public.exam_rooming_round_plans, public.exam_rooming_plan_snapshots,
    public.exam_rooming_finalizations, public.exam_room_assignments,
    public.exam_script_runs, public.exam_mcq_scores, public.exam_absences,
    public.exam_elective_room_plans, public.exam_mandatory_room_plans
    in share row exclusive mode nowait;
  if not exists(select 1 from public.exam_sessions where id=p_exam_id) then
    raise exception 'Không tìm thấy kỳ thi.';
  end if;
  foreach v_table in array array['exam_script_runs','exam_mcq_scores','exam_absences',
    'exam_elective_room_plans','exam_mandatory_room_plans'] loop
    execute format('select exists(select 1 from public.%I where exam_id=$1)',v_table)
      into v_exists using p_exam_id;
    if v_exists then
      raise exception 'Chưa thể lập lại SBD: còn dữ liệu tại %. Không có dữ liệu nào bị thay đổi.',v_table;
    end if;
  end loop;
  foreach v_table in array array['exam_candidates','exam_rooming_round_plans',
    'exam_rooming_plan_snapshots','exam_rooming_finalizations','exam_room_assignments'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where exam_id=$1',v_table)
      into v_rows using p_exam_id;
    v_payload := v_payload || jsonb_build_object(v_table,v_rows);
  end loop;
  insert into public.exam_sbd_reset_archives(exam_id,created_by,reason,payload)
    values(p_exam_id,auth.uid(),'Lập lại SBD theo phương án mới',v_payload) returning id into v_archive;
  perform set_config('exam.cascade_delete','on',true);
  -- All subjects and rounds share the same SBD: retire every old room plan.
  delete from public.exam_room_assignments where exam_id=p_exam_id;
  delete from public.exam_rooming_finalizations where exam_id=p_exam_id;
  delete from public.exam_rooming_plan_snapshots where exam_id=p_exam_id;
  delete from public.exam_rooming_round_plans where exam_id=p_exam_id;
  perform set_config('exam.reset_sbd','on',true);
  update public.exam_candidates set sbd=null where exam_id=p_exam_id and nullif(btrim(sbd),'') is not null;
  get diagnostics v_count = row_count;
  perform set_config('exam.reset_sbd',coalesce(v_reset_setting,''),true);
  perform set_config('exam.cascade_delete',coalesce(v_delete_setting,''),true);
  return jsonb_build_object('archive_id',v_archive,'cleared_count',v_count);
end;
$function$;
revoke all on function public.exam_archive_rooming_and_reset_sbd(uuid,text) from public,anon;
grant execute on function public.exam_archive_rooming_and_reset_sbd(uuid,text) to authenticated;
commit;
