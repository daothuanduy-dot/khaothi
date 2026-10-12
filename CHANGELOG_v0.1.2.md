# CHANGELOG v0.1.2

## Added
- Hồ sơ thí sinh không cần SBD hoặc môn thi.
- Thông tin ngày sinh, giới tính, dân tộc.
- Module đăng ký môn độc lập theo kỳ thi.
- Áp dụng môn theo lớp, theo học sinh hoặc nạp CSV (Excel lưu CSV UTF-8).
- Bảng `exam_candidate_subjects` và RPC xếp phòng xác thực theo đăng ký môn riêng.

## Modified
- `index.html`
- `js/app.js`
- `sql/003_student_subject_separation.sql`

## Unchanged
- `css/app.css`
- `js/rooming.js`
- `sql/001_schema.sql`
- `sql/002_rooming_rpc.sql`

## Validation
- Đã rà soát mã nguồn và migration tĩnh.
- Chưa chạy SQL trên Supabase thực tế hoặc kiểm thử trình duyệt end-to-end.
