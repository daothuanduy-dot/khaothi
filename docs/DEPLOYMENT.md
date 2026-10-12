# Hướng dẫn triển khai nhanh

## Thứ tự SQL
1. `sql/001_schema.sql`
2. Tạo user trong Supabase Auth và cấp quyền admin qua `exam_profiles` (hướng dẫn trong README).
3. `sql/002_rooming_rpc.sql`

## GitHub Pages
- `index.html` phải nằm ở thư mục gốc repository.
- Đẩy nguyên cấu trúc `css/`, `js/`, `sql/`, `docs/` lên GitHub.
- Settings → Pages → Deploy from branch → `main` → `/(root)`.

## Khuyến nghị kiểm thử
- Tạo kỳ thi thử.
- Tải CSV mẫu từ giao diện, bổ sung ít nhất 10 thí sinh với các cặp môn khác nhau.
- Tạo phương án xem trước với sức chứa 3 hoặc 4 để buộc thuật toán chia phòng.
- Xác minh mỗi học sinh xuất hiện đúng một lần, không phòng nào có cùng môn ở hai ca, và không phòng nào quá sức chứa.
- Lưu phương án rồi kiểm tra bảng `exam_elective_room_plans`, `exam_elective_room_plan_rooms`, `exam_elective_room_plan_candidates`.
- Thử đăng nhập tài khoản không có `is_admin=true`; thao tác đọc/ghi quản trị phải bị từ chối.
