-- v0.1.43: bảo vệ SBD đã cấp; không cho cấp lại/ghi đè SBD trong cùng kỳ thi.
create or replace function public.exam_assign_candidate_sbd(
  p_exam_id uuid,
  p_assignments jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_candidate_id uuid;
  v_sbd text;
  v_updated integer := 0;
  v_total integer;
  v_distinct_sbd integer;
  v_existing_sbd text;
begin
  if auth.uid() is null or not public.exam_is_admin() then
    raise exception 'Không có quyền cấp số báo danh.';
  end if;
  if p_exam_id is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Kỳ thi hoặc danh sách cấp SBD không hợp lệ.';
  end if;
  v_total := jsonb_array_length(p_assignments);
  if v_total = 0 then raise exception 'Danh sách cấp SBD đang trống.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_assignments) x
    where coalesce(x->>'candidate_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(x->>'sbd','') !~ '^[0-9]{6}$|^[0-9]{8}$'
  ) then raise exception 'Mỗi bản ghi phải có candidate_id hợp lệ và SBD gồm 6 hoặc 8 chữ số.'; end if;
  if (select count(distinct x->>'candidate_id') from jsonb_array_elements(p_assignments) x) <> v_total then
    raise exception 'Danh sách có candidate_id bị trùng.';
  end if;
  select count(distinct x->>'sbd') into v_distinct_sbd from jsonb_array_elements(p_assignments) x;
  if v_distinct_sbd <> v_total then raise exception 'Danh sách có SBD bị trùng.'; end if;

  -- Kiểm tra toàn bộ trước khi cập nhật để thao tác có tính nguyên tử.
  for v_item in select value from jsonb_array_elements(p_assignments) loop
    v_candidate_id := (v_item->>'candidate_id')::uuid;
    v_sbd := v_item->>'sbd';
    select sbd into v_existing_sbd from public.exam_candidates
      where id = v_candidate_id and exam_id = p_exam_id;
    if not found then raise exception 'Không tìm thấy thí sinh % trong kỳ thi được chọn.', v_candidate_id; end if;
    if v_existing_sbd is not null and btrim(v_existing_sbd) <> '' and v_existing_sbd <> v_sbd then
      raise exception 'Thí sinh % đã có SBD %. Không được tự động cấp lại SBD trong cùng kỳ thi.', v_candidate_id, v_existing_sbd;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_assignments) loop
    v_candidate_id := (v_item->>'candidate_id')::uuid;
    v_sbd := v_item->>'sbd';
    update public.exam_candidates set sbd = v_sbd
      where id = v_candidate_id and exam_id = p_exam_id;
    v_updated := v_updated + 1;
  end loop;
  return jsonb_build_object('exam_id',p_exam_id,'updated_count',v_updated,'sbd_length',length((p_assignments->0)->>'sbd'));
end;
$$;
revoke all on function public.exam_assign_candidate_sbd(uuid,jsonb) from public;
grant execute on function public.exam_assign_candidate_sbd(uuid,jsonb) to authenticated;
