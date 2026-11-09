-- v0.1.307: GVCN chỉ đọc bảng điểm lớp được phân công, kỳ thi đã công bố.
-- Chạy bằng Supabase SQL Editor với quyền quản trị; không sửa các hàm điểm hiện hành.
BEGIN;
CREATE TABLE IF NOT EXISTS public.exam_homeroom_exam_periods (
 exam_id uuid PRIMARY KEY REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
 period_id uuid NOT NULL REFERENCES public.school_teaching_periods(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exam_homeroom_exam_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_homeroom_exam_periods FROM anon, authenticated;
-- Chỉ dùng bảng liên kết đã cấu hình rõ ràng hoặc kỳ học từ xếp hạng; không suy đoán học kỳ từ tên kỳ thi.
CREATE OR REPLACE FUNCTION public.exam_homeroom_period_for_exam(p_exam_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
 SELECT coalesce((SELECT m.period_id FROM public.exam_homeroom_exam_periods m WHERE m.exam_id=p_exam_id),
 (SELECT s.period_id FROM public.exam_ranking_setups s WHERE s.exam_id=p_exam_id))
$fn$;
REVOKE ALL ON FUNCTION public.exam_homeroom_period_for_exam(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exam_homeroom_period_for_exam(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.exam_homeroom_my_exams()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('exam_id',q.exam_id,'exam_name',q.exam_name,
 'school_year',q.school_year,'semester',q.semester,'class_code',q.class_code,'grade_code',q.grade_code)
 ORDER BY q.school_year DESC,q.semester DESC,q.exam_name,q.class_code),'[]'::jsonb)
 FROM (
 SELECT DISTINCT e.id exam_id,e.name exam_name,e.school_year,p.semester,h.class_code,c.grade_code
 FROM public.exam_sessions e
 JOIN public.school_teaching_periods p ON p.id=public.exam_homeroom_period_for_exam(e.id)
 JOIN public.school_homeroom_assignments h ON h.period_id=p.id AND h.teacher_user_id=(SELECT auth.uid())
 JOIN public.exam_candidates c ON c.exam_id=e.id AND c.class_code=h.class_code
 JOIN public.exam_result_publications pub ON pub.exam_id=e.id AND pub.grade_code=c.grade_code AND pub.is_published IS TRUE
 WHERE (SELECT auth.uid()) IS NOT NULL AND e.school_year=p.school_year
 ) q;
$fn$;
REVOKE ALL ON FUNCTION public.exam_homeroom_my_exams() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exam_homeroom_my_exams() TO authenticated;
CREATE OR REPLACE FUNCTION public.exam_homeroom_subject_results(p_exam_id uuid, p_subject_code text, p_class_code text)
 RETURNS TABLE(candidate_id uuid, sbd text, student_code text, student_name text, class_code text, essay_score numeric, mcq_score numeric, total_score numeric, essay_missing boolean, mcq_missing boolean, score_mode text, is_absent boolean, no_paper boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c exam_subject_assessment_configs%rowtype;v_subject text:=upper(btrim(p_subject_code));v_mode text;v_exam_mode text;
begin
 if auth.uid() is null or auth.role() is distinct from 'authenticated' then
 raise exception 'Không có quyền xem điểm.' using errcode='42501'; end if;
 if not exists (
  select 1 from public.exam_sessions e
  join public.school_teaching_periods per on per.id=public.exam_homeroom_period_for_exam(e.id)
  join public.school_homeroom_assignments h on h.period_id=per.id and h.class_code=p_class_code and h.teacher_user_id=auth.uid()
  join public.exam_candidates cand on cand.exam_id=e.id and cand.class_code=p_class_code
  join public.exam_result_publications pub on pub.exam_id=e.id and pub.grade_code=cand.grade_code and pub.is_published is true
  where e.id=p_exam_id and e.school_year=per.school_year
 ) then raise exception 'Không được xem lớp này hoặc kỳ thi chưa công bố.' using errcode='42501'; end if;
 select e.exam_mode into v_exam_mode from exam_sessions e where e.id=p_exam_id;
 if not found then raise exception 'Kỳ thi không tồn tại.';end if;
 select * into c from exam_subject_assessment_configs cfg where cfg.exam_id=p_exam_id and cfg.subject_code=v_subject;
 if not found then raise exception 'Chưa cấu hình thang điểm của môn thi.';end if;
 v_mode:=coalesce(c.score_mode,case when c.is_essay then 'combined' else 'mcq' end);
 if v_mode in ('essay','combined') and (not c.is_essay or coalesce(c.maximum_score,0)<=0) then raise exception 'Cấu hình tự luận không phù hợp hình thức tính điểm.';end if;
 if v_mode in ('mcq','combined') and coalesce(c.mcq_maximum_score,0)<=0 then raise exception 'Cấu hình trắc nghiệm không phù hợp hình thức tính điểm.';end if;
 return query
 with latest as (
  select r.id from exam_script_runs r where r.exam_id=p_exam_id and r.subject_code=v_subject and r.status='locked'
  order by r.locked_at desc nulls last,r.id desc limit 1
 ), eligible as (
  select ec.* from exam_candidates ec where ec.exam_id=p_exam_id and ec.class_code=p_class_code and exists (select 1 from exam_result_publications pub where pub.exam_id=p_exam_id and pub.grade_code=ec.grade_code and pub.is_published is true) and (v_subject in ('TOAN','VAN') or
   case when v_exam_mode='default' then exists(select 1 from exam_subject_class_configs cfg
    where cfg.exam_id=p_exam_id and cfg.class_code=ec.class_code and cfg.subject_code=v_subject)
   when v_exam_mode='choice' then (exists(select 1 from exam_subject_class_configs cfg where cfg.exam_id=p_exam_id and cfg.class_code=ec.class_code and cfg.subject_code=v_subject)
    or exists(select 1 from exam_candidate_subjects cs where cs.exam_id=p_exam_id and cs.candidate_id=ec.id and cs.subject_code=v_subject))
   else exists(select 1 from exam_candidate_subjects cs where cs.exam_id=p_exam_id
    and cs.candidate_id=ec.id and cs.subject_code=v_subject) end) ), raw as (
  select e.id,e.sbd,e.student_code,e.student_name,e.class_code,
   case when v_mode in ('essay','combined') then
      case when cc.exam_method='class' then cls.essay_score
           when not coalesce(r.is_absent,false) then s.score end end as es,
   case when v_mode in ('mcq','combined') then m.score end as ms,
   (exists(select 1 from exam_absences a where a.exam_id=p_exam_id and a.candidate_id=e.id
    and a.subject_code in ('*',v_subject)) or (v_mode in ('essay','combined') and coalesce(r.is_absent,false))) as absent,
   (v_mode in ('essay','combined') and cc.exam_method is distinct from 'class' and coalesce(s.no_paper,false)) as np
  from eligible e
   left join exam_subject_class_configs cc on cc.exam_id=p_exam_id and cc.class_code=e.class_code and cc.subject_code=v_subject
   left join exam_class_scores cls on cls.exam_id=p_exam_id and cls.candidate_id=e.id and cls.subject_code=v_subject
   left join latest l on true
   left join exam_script_records r on r.run_id=l.id and r.candidate_id=e.id
   left join exam_script_scores s on s.script_record_id=r.id
   left join exam_mcq_scores m on m.exam_id=p_exam_id and m.subject_code=v_subject and m.candidate_id=e.id and m.sbd=e.sbd
 ), base as (
  select r.id,r.sbd,r.student_code,r.student_name,r.class_code,
   case when r.absent then a.essay_score else r.es end as es,
   case when r.absent then a.mcq_score else r.ms end as ms,
   case when r.absent then case when v_mode='essay' then a.essay_score when v_mode='mcq' then a.mcq_score when a.essay_score is not null and a.mcq_score is not null then a.essay_score+a.mcq_score end
    when v_mode='essay' then r.es when v_mode='mcq' then r.ms when r.es is not null and r.ms is not null then r.es+r.ms end as total,
   r.absent,r.np
  from raw r left join exam_absent_scores a on a.exam_id=p_exam_id and a.candidate_id=r.id and a.subject_code=v_subject
 ), overridden as (
  select b.*,g.scores as grade_scores,g.total_score as grade_total,
   (select sum((g.scores->>(p.component_no-1))::numeric) from exam_regrade_components p
    where p.exam_id=p_exam_id and p.subject_code=v_subject and p.component_type='essay') as grade_essay,
   (select sum((g.scores->>(p.component_no-1))::numeric) from exam_regrade_components p
    where p.exam_id=p_exam_id and p.subject_code=v_subject and p.component_type='mcq') as grade_mcq
  from base b left join exam_regrade_current g on g.exam_id=p_exam_id and g.subject_code=v_subject and g.candidate_id=b.id
 )
 select o.id,o.sbd,o.student_code,o.student_name,o.class_code,
  case when o.grade_scores is not null and not o.absent then o.grade_essay else o.es end,
  case when o.grade_scores is not null and not o.absent then o.grade_mcq else o.ms end,
  case when o.grade_scores is not null and not o.absent then o.grade_total else o.total end,
  (not o.absent and o.grade_scores is null and v_mode in ('essay','combined') and o.es is null),
  (not o.absent and o.grade_scores is null and v_mode in ('mcq','combined') and o.ms is null),
  v_mode,o.absent,o.np
 from overridden o order by o.class_code,o.sbd,o.id;
end $function$
;
REVOKE ALL ON FUNCTION public.exam_homeroom_subject_results(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exam_homeroom_subject_results(uuid,text,text) TO authenticated;

-- Danh sách môn theo kỳ thi và lớp, bảo vệ bằng cùng điều kiện phân công/công bố.
CREATE OR REPLACE FUNCTION public.exam_homeroom_exam_subjects(p_exam_id uuid,p_class_code text)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public','pg_temp' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
 SELECT 1 FROM exam_sessions e JOIN school_teaching_periods per ON per.id=public.exam_homeroom_period_for_exam(e.id)
 JOIN school_homeroom_assignments h ON h.period_id=per.id AND h.class_code=p_class_code AND h.teacher_user_id=auth.uid()
 JOIN exam_candidates c ON c.exam_id=e.id AND c.class_code=p_class_code
 JOIN exam_result_publications pub ON pub.exam_id=e.id AND pub.grade_code=c.grade_code AND pub.is_published IS TRUE
 WHERE e.id=p_exam_id AND e.school_year=per.school_year
 ) THEN RAISE EXCEPTION 'Không có quyền xem môn.' USING ERRCODE='42501'; END IF;
 RETURN ARRAY(SELECT DISTINCT s.subject_code FROM exam_subject_assessment_configs s WHERE s.exam_id=p_exam_id ORDER BY s.subject_code);
END $fn$;
REVOKE ALL ON FUNCTION public.exam_homeroom_exam_subjects(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exam_homeroom_exam_subjects(uuid,text) TO authenticated;

COMMIT;
