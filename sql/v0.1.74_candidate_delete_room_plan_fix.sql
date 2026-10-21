-- Remove exam candidates atomically while cleaning references from editable
-- elective-room plans. Locked plans and other assessment history stay intact.
create or replace function public.exam_delete_candidates_from_exam(
  p_exam_id uuid,
  p_candidate_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requested integer;
  v_exam_candidates integer;
  v_removed_plan_assignments integer;
  v_deleted integer;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền xóa thí sinh.' using errcode='42501';
  end if;
  if p_exam_id is null or p_candidate_ids is null or cardinality(p_candidate_ids)=0
    or cardinality(p_candidate_ids)>500 then
    raise exception 'Hãy chọn kỳ thi và từ 1 đến 500 thí sinh.' using errcode='22023';
  end if;

  select count(distinct requested.candidate_id) into v_requested
  from unnest(p_candidate_ids) as requested(candidate_id)
  where requested.candidate_id is not null;
  if v_requested<>cardinality(p_candidate_ids) then
    raise exception 'Danh sách thí sinh không hợp lệ hoặc có ID trùng.' using errcode='22023';
  end if;

  select count(*) into v_exam_candidates
  from public.exam_candidates c
  where c.exam_id=p_exam_id and c.id=any(p_candidate_ids);
  if v_exam_candidates<>v_requested then
    raise exception 'Một hoặc nhiều thí sinh không thuộc kỳ thi đang chọn hoặc đã bị xóa.' using errcode='22023';
  end if;

  if exists(
    select 1
    from public.exam_elective_room_plan_candidates pc
    join public.exam_elective_room_plans p on p.id=pc.plan_id
    where p.exam_id=p_exam_id
      and pc.candidate_id=any(p_candidate_ids)
      and p.status='locked'
  ) then
    raise exception 'Không thể xóa thí sinh đang thuộc phương án xếp phòng lựa chọn đã khóa. Hãy giữ hồ sơ để bảo toàn phương án chính thức.';
  end if;

  delete from public.exam_elective_room_plan_candidates pc
  using public.exam_elective_room_plans p
  where p.id=pc.plan_id
    and p.exam_id=p_exam_id
    and p.status<>'locked'
    and pc.candidate_id=any(p_candidate_ids);
  get diagnostics v_removed_plan_assignments=row_count;

  delete from public.exam_candidates c
  where c.exam_id=p_exam_id and c.id=any(p_candidate_ids);
  get diagnostics v_deleted=row_count;
  if v_deleted<>v_requested then
    raise exception 'Chỉ xóa được %/% hồ sơ; thao tác đã được hủy để tránh xóa dở dang.',v_deleted,v_requested;
  end if;

  return jsonb_build_object(
    'deleted_count',v_deleted,
    'removed_elective_plan_assignments',v_removed_plan_assignments
  );
end;
$$;

revoke all on function public.exam_delete_candidates_from_exam(uuid,uuid[]) from public;
grant execute on function public.exam_delete_candidates_from_exam(uuid,uuid[]) to authenticated;
