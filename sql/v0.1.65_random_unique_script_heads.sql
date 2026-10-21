-- Keep the browser's 1-6 character alphanumeric head rule in sync with
-- exam_create_script_run, including installations that missed v0.1.63.
do $migration$
declare
  v_definition text;
  v_old text:='^[A-Za-z]{1,3}$';
  v_new text:='^[A-Za-z0-9]{1,6}$';
begin
  select pg_get_functiondef(
    'public.exam_create_script_run(uuid,text,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_old in v_definition)>0 then
    execute replace(v_definition,v_old,v_new);
  elsif position(v_new in v_definition)=0 then
    raise exception 'Không nhận dạng được phiên bản exam_create_script_run; chưa đổi quy tắc đầu phách.';
  end if;
end;
$migration$;

create or replace function public.exam_validate_script_subject_heads()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.method<>'room' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.exam_id::text||':script-subject-heads',1));

  if exists(
    select 1
    from public.exam_script_runs existing
    cross join lateral jsonb_array_elements(existing.room_order) old_room(value)
    cross join lateral jsonb_array_elements(new.room_order) new_room(value)
    where existing.exam_id=new.exam_id
      and existing.subject_code<>new.subject_code
      and existing.method='room'
      and upper(btrim(old_room.value->>'phach_prefix'))=
        upper(btrim(new_room.value->>'phach_prefix'))
  ) then
    raise exception 'Đầu phách phải khác nhau giữa các môn trong cùng kỳ thi.';
  end if;
  return new;
end;
$$;

drop trigger if exists exam_validate_script_subject_heads on public.exam_script_runs;
create trigger exam_validate_script_subject_heads
before insert on public.exam_script_runs
for each row execute function public.exam_validate_script_subject_heads();
