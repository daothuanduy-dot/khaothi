-- v0.1.111: explicitly reset SBD and saved elective room plans before a new plan.

create or replace function public.exam_prevent_sbd_overwrite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.sbd is not null and btrim(new.sbd) <> '' and new.sbd !~ '^[0-9]{6}$|^[0-9]{8}$' then
    raise exception 'SBD phai gom dung 6 hoac 8 chu so.';
  end if;
  -- Only the guarded admin reset RPC may clear an existing SBD.
  if current_setting('exam.reset_sbd', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then return new; end if;
  if old.sbd is not null and btrim(old.sbd) <> '' and new.sbd is distinct from old.sbd then
    raise exception 'SBD da cap khong duoc thay doi hoac xoa truc tiep.';
  end if;
  return new;
end;
$function$;

create or replace function public.exam_reset_sbd_and_elective_room_plan(
  p_exam_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_official integer;
  v_cleared integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Khong co quyen xoa SBD cu.' using errcode = '42501';
  end if;
  if p_exam_id is null then raise exception 'Ky thi khong hop le.'; end if;

  select count(*) into v_official
    from public.exam_rooming_round_plans
   where exam_id=p_exam_id and status='official';
  select v_official + count(*) into v_official
    from public.exam_rooming_finalizations
   where exam_id=p_exam_id and is_current;
  if v_official > 0 then
    raise exception 'Khong the reset SBD vi ky thi da co phuong an phan phong chinh thuc. Hãy luu tru/ket thuc ho so chinh thuc truoc.';
  end if;

  perform set_config('exam.reset_sbd','on',true);
  perform set_config('exam.cascade_delete','on',true);
  delete from public.exam_rooming_round_plans
   where exam_id=p_exam_id and status='saved'
     and plan_type='elective';
  delete from public.exam_rooming_plan_snapshots
   where exam_id=p_exam_id and plan_type='elective';
  update public.exam_candidates set sbd=null where exam_id=p_exam_id;
  get diagnostics v_cleared = row_count;
  return jsonb_build_object('exam_id',p_exam_id,'cleared_count',v_cleared);
end;
$function$;

revoke all on function public.exam_reset_sbd_and_elective_room_plan(uuid) from public;
grant execute on function public.exam_reset_sbd_and_elective_room_plan(uuid) to authenticated;
