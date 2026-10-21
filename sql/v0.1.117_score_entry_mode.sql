-- v0.1.117: allow free-form essay scores or scores constrained by a step.

alter table public.exam_subject_assessment_configs
  drop constraint if exists exam_subject_assessment_configs_check;

alter table public.exam_subject_assessment_configs
  add constraint exam_subject_assessment_configs_check check (
    (not is_essay and maximum_score is null and score_step is null and default_score is null)
    or
    (is_essay and maximum_score is not null and
      (score_step is null or score_step > 0) and
      (default_score is null or default_score <= maximum_score))
  );

create or replace function public.exam_save_subject_assessment_config(
  p_exam_id uuid, p_subject_code text, p_is_essay boolean,
  p_maximum_score numeric, p_score_step numeric, p_decimal_places integer,
  p_default_score numeric default null
) returns jsonb
language plpgsql security definer
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
    or (p_score_step is not null and p_score_step <= 0)
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

create or replace function public.exam_save_script_score(
  p_exam_id uuid,p_subject_code text,p_phach_code text,p_score numeric
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_script_id uuid; v_previous_score numeric;
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
    or (v_config.score_step is not null and mod(p_score,v_config.score_step)<>0) then
    raise exception 'Điểm phải từ 0 đến % và phù hợp quy cách đã chọn.',v_config.maximum_score;
  end if;
  select rec.id into v_script_id
  from public.exam_script_runs run join public.exam_script_records rec on rec.run_id=run.id
  where run.exam_id=p_exam_id and run.subject_code=upper(btrim(p_subject_code))
    and run.status='locked' and not rec.is_absent and rec.phach_code=p_phach_code
  order by run.locked_at desc limit 1;
  if v_script_id is null then raise exception 'Không tìm thấy phách hợp lệ trong phương án đã khóa.'; end if;
  select score into v_previous_score from public.exam_script_scores where script_record_id=v_script_id;
  insert into public.exam_script_scores(script_record_id,score,entered_by,entered_at,updated_at)
  values(v_script_id,p_score,auth.uid(),now(),now())
  on conflict (script_record_id) do update set score=excluded.score,entered_by=auth.uid(),entered_at=now(),updated_at=now();
  insert into public.exam_script_score_events(script_record_id,previous_score,new_score,changed_by)
  values(v_script_id,v_previous_score,p_score,auth.uid());
  return jsonb_build_object('phach_code',p_phach_code,'score',p_score);
end;
$$;

revoke all on function public.exam_save_subject_assessment_config(uuid,text,boolean,numeric,numeric,integer,numeric) from public;
revoke all on function public.exam_save_script_score(uuid,text,text,numeric) from public;
grant execute on function public.exam_save_subject_assessment_config(uuid,text,boolean,numeric,numeric,integer,numeric) to authenticated;
grant execute on function public.exam_save_script_score(uuid,text,text,numeric) to authenticated;
