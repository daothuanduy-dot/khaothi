# v0.1.269 — Đính chính phách an toàn (có điều kiện)

- Đồng bộ trạng thái vắng từ `exam_absences` khi xem trước và áp dụng; tính lại phách theo thứ tự đã lưu.
- Giữ nguyên toàn bộ `exam_script_scores`; nếu có điểm thuộc bài bị đổi phách hoặc chuyển sang vắng thì từ chối áp dụng để yêu cầu đối chiếu thủ công.
- SQL: `sql/v0.1.269_repair_safe.sql` thay thế hàm RPC; phải sao lưu CSDL và thử trên staging trước.
- Mã nguồn: `js/operations.js`, `js/app.js`, `index.html`.
- Không thay đổi các tệp khác từ v0.1.268.

**Giới hạn:** Chưa tự động chuyển điểm khi đổi phách. Khi `affected_score_count > 0`, thao tác bị chặn để bảo vệ điểm.
