-- v0.1.61: use PostgreSQL's built-in UUID generator for random script codes.
-- This avoids a runtime dependency on the pgcrypto gen_random_bytes function.
do $migration$
declare
  v_definition text;
  v_old text := $old$upper(substr(encode(gen_random_bytes(8),'hex'),1,16))$old$;
  v_new text := $new$upper(replace(gen_random_uuid()::text,'-',''))$new$;
begin
  select pg_get_functiondef(
    'public.exam_create_script_run(uuid,text,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_old in v_definition)=0 then
    if position(v_new in v_definition)>0 then return; end if;
    raise exception 'Không nhận dạng được phiên bản hiện tại của exam_create_script_run; chưa thay đổi CSDL.';
  end if;

  execute replace(v_definition,v_old,v_new);
end;
$migration$;
