-- v0.1.104: manage exam rounds independently from candidate assignment.

create or replace function public.exam_list_rounds(p_exam_id uuid)
returns table(round_no smallint, name text, is_active boolean, candidate_count bigint, subject_count bigint)
language plpgsql security definer stable set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền quản lý đợt thi.' using errcode = '42501';
  end if;
  return query
    select r.round_no, r.name, r.is_active,
           (select count(*) from public.exam_round_candidates c where c.exam_id=r.exam_id and c.round_no=r.round_no),
           (select count(*) from public.exam_round_subjects s where s.exam_id=r.exam_id and s.round_no=r.round_no)
      from public.exam_rounds r
     where r.exam_id=p_exam_id
     order by r.round_no;
end;
$function$;

create or replace function public.exam_create_round(
  p_exam_id uuid,
  p_round_no smallint,
  p_name text default ''
) returns public.exam_rounds
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_round public.exam_rounds;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền quản lý đợt thi.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.exam_sessions where id=p_exam_id) then
    raise exception 'Không tìm thấy kỳ thi.';
  end if;
  if p_round_no not in (1,2) then
    raise exception 'Số đợt thi chỉ được là 1 hoặc 2.';
  end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then
    raise exception 'Tên đợt thi không được để trống.';
  end if;
  if exists(select 1 from public.exam_rounds where exam_id=p_exam_id and round_no=p_round_no) then
    raise exception 'Đợt % đã tồn tại trong kỳ thi.',p_round_no;
  end if;
  insert into public.exam_rounds(exam_id,round_no,name,is_active,created_by,updated_at)
  values(p_exam_id,p_round_no,btrim(p_name),true,auth.uid(),now())
  returning * into v_round;
  return v_round;
end;
$function$;

create or replace function public.exam_update_round(
  p_exam_id uuid,
  p_round_no smallint,
  p_name text,
  p_is_active boolean default true
) returns public.exam_rounds
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_round public.exam_rounds;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền quản lý đợt thi.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then
    raise exception 'Tên đợt thi không được để trống.';
  end if;
  update public.exam_rounds
     set name=btrim(p_name), is_active=coalesce(p_is_active,true), updated_at=now()
   where exam_id=p_exam_id and round_no=p_round_no
   returning * into v_round;
  if not found then raise exception 'Không tìm thấy đợt % của kỳ thi.',p_round_no; end if;
  return v_round;
end;
$function$;

create or replace function public.exam_delete_round(
  p_exam_id uuid,
  p_round_no smallint
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_count integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền quản lý đợt thi.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.exam_rounds where exam_id=p_exam_id and round_no=p_round_no) then
    raise exception 'Không tìm thấy đợt % của kỳ thi.',p_round_no;
  end if;
  select count(*) into v_count
    from public.exam_rooming_round_plans
   where exam_id=p_exam_id and round_no=p_round_no and status='official';
  if v_count>0 then
    raise exception 'Không thể xoá đợt % vì đã có % phương án phòng chính thức. Hãy xử lý hồ sơ phòng trước.',p_round_no,v_count;
  end if;
  delete from public.exam_rooming_round_plans where exam_id=p_exam_id and round_no=p_round_no and status='saved';
  delete from public.exam_rounds where exam_id=p_exam_id and round_no=p_round_no;
  return jsonb_build_object('exam_id',p_exam_id,'round_no',p_round_no,'deleted',true);
end;
$function$;

revoke all on function public.exam_create_round(uuid,smallint,text) from public;
revoke all on function public.exam_update_round(uuid,smallint,text,boolean) from public;
revoke all on function public.exam_delete_round(uuid,smallint) from public;
revoke all on function public.exam_list_rounds(uuid) from public;
grant execute on function public.exam_list_rounds(uuid) to authenticated;
grant execute on function public.exam_create_round(uuid,smallint,text) to authenticated;
grant execute on function public.exam_update_round(uuid,smallint,text,boolean) to authenticated;
grant execute on function public.exam_delete_round(uuid,smallint) to authenticated;
