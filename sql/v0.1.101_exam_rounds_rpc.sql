-- v0.1.101: expose exam rounds through the same SECURITY DEFINER path used by rooming.

create or replace function public.exam_get_rounds(p_exam_id uuid)
returns table(round_no smallint, name text, is_active boolean)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền đọc danh sách đợt thi.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.exam_sessions where id=p_exam_id) then
    raise exception 'Không tìm thấy kỳ thi.';
  end if;
  return query
    select r.round_no, r.name, r.is_active
      from public.exam_rounds r
     where r.exam_id=p_exam_id
       and r.is_active
     order by r.round_no;
end;
$function$;

grant execute on function public.exam_get_rounds(uuid) to authenticated;
