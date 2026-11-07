# v0.1.268 — Bản bảo vệ dữ liệu, chưa phải bản sửa hoàn chỉnh

## Đã thay đổi
- `js/operations.js`: tải lại danh sách vắng từ CSDL sau khi lưu; vô hiệu hóa thao tác xác nhận đính chính phách có thể hủy điểm, vẫn cho phép xem trước.
- `js/app.js`, `index.html`: nâng nhãn phiên bản và cache-buster.
- `sql/v0.1.268_diagnostic_readonly.sql`: truy vấn CHỈ ĐỌC để thu thập định nghĩa hàm Supabase và cấu trúc bảng.

## Chưa hoàn thành / cần kết quả truy vấn
- Đồng bộ trạng thái vắng trong `exam_script_records` với nguồn báo vắng sau khi đã khóa lượt phách.
- Tính lại phách khi khôi phục học sinh có mặt, kiểm tra trùng phách và ảnh hưởng điểm.
- Viết migration transaction-safe để chỉ vô hiệu hóa hoặc ánh xạ điểm thực sự bị ảnh hưởng.

**Không chạy cập nhật SQL phá hủy dữ liệu hoặc tự sửa cờ `is_absent` thủ công.**

## Cập nhật GitHub
Giữ nguyên cấu trúc thư mục gốc trong ZIP; thay thế ba tệp giao diện/mã nguồn trên và thêm tài liệu/truy vấn SQL. Những tệp khác giữ nguyên byte so với ZIP đầu vào. Truy vấn SQL chạy thủ công trong Supabase SQL Editor, không phải migration thay đổi dữ liệu.
