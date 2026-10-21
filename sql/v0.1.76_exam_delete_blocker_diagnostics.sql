create or replace function public.exam_get_delete_blockers(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_fk record;
  v_join_condition text;
  v_row_count bigint;
  v_blockers jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền kiểm tra dữ liệu kỳ thi.' using errcode='42501';
  end if;
  if p_exam_id is null or not exists(
    select 1 from public.exam_sessions where id=p_exam_id
  ) then
    raise exception 'Không tìm thấy kỳ thi cần kiểm tra.' using errcode='22023';
  end if;

  for v_fk in
    select c.conname,c.conkey,c.confkey,child.relname as table_name,c.confdeltype
    from pg_constraint c
    join pg_class child on child.oid=c.conrelid
    join pg_namespace child_ns on child_ns.oid=child.relnamespace
    where c.contype='f'
      and c.confrelid='public.exam_sessions'::regclass
      and child_ns.nspname='public'
      and c.confdeltype in ('a','r')
    order by child.relname,c.conname
  loop
    select string_agg(
      format('child.%I = parent.%I',child_column.attname,parent_column.attname),
      ' AND ' order by child_key.ordinality
    )
    into v_join_condition
    from unnest(v_fk.conkey) with ordinality as child_key(attnum,ordinality)
    join unnest(v_fk.confkey) with ordinality as parent_key(attnum,ordinality)
      on parent_key.ordinality=child_key.ordinality
    join pg_attribute child_column
      on child_column.attrelid=format('public.%I',v_fk.table_name)::regclass
      and child_column.attnum=child_key.attnum
    join pg_attribute parent_column
      on parent_column.attrelid='public.exam_sessions'::regclass
      and parent_column.attnum=parent_key.attnum;

    execute format(
      'select count(*) from public.%I child where exists (
         select 1 from public.exam_sessions parent where parent.id=$1 and %s
       )',
      v_fk.table_name,v_join_condition
    ) into v_row_count using p_exam_id;

    if v_row_count>0 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'table_name',v_fk.table_name,
        'constraint_name',v_fk.conname,
        'row_count',v_row_count,
        'on_delete',case v_fk.confdeltype when 'r' then 'RESTRICT' else 'NO ACTION' end
      ));
    end if;
  end loop;

  return jsonb_build_object('exam_id',p_exam_id,'blockers',v_blockers);
end;
$$;

revoke all on function public.exam_get_delete_blockers(uuid) from public;
grant execute on function public.exam_get_delete_blockers(uuid) to authenticated;
