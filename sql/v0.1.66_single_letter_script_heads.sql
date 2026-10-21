-- Restrict each room head to one uppercase letter. Heads only need to be
-- unique among rooms in the same subject run, not across different subjects.
do $migration$
declare
  v_definition text;
  v_old_alpha text:='^[A-Za-z]{1,3}$';
  v_old_alphanumeric text:='^[A-Za-z0-9]{1,6}$';
  v_new text:='^[A-Z]$';
begin
  select pg_get_functiondef(
    'public.exam_create_script_run(uuid,text,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_old_alpha in v_definition)>0
    or position(v_old_alphanumeric in v_definition)>0 then
    v_definition:=replace(
      replace(v_definition,v_old_alpha,v_new),
      v_old_alphanumeric,v_new
    );
    execute v_definition;
  elsif position(v_new in v_definition)=0 then
    raise exception 'Không nhận dạng được phiên bản exam_create_script_run; chưa đổi quy tắc đầu phách.';
  end if;
end;
$migration$;

drop trigger if exists exam_validate_script_subject_heads on public.exam_script_runs;
drop function if exists public.exam_validate_script_subject_heads();
