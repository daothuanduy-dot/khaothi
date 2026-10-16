# khaothi v0.1.79 — sửa bộ lọc và chọn học sinh

## Nguồn
- Gói GitHub `khaothi-main.zip` do người dùng cung cấp, phiên bản gốc v0.1.77.
- Chỉ sửa frontend; không sửa SQL, RPC, RLS hoặc dữ liệu.

## Tệp thay đổi
- `index.html`: phiên bản hiển thị và cache-busting URL lên v0.1.79.
- `js/app.js`: chuẩn hóa dữ liệu khối/lớp/mã học sinh; lọc lớp theo khối bằng cùng quy tắc; đổi khối sẽ reset lớp cũ; checkbox chọn học sinh dùng mã học sinh dạng chuỗi thống nhất.

## Tệp không thay đổi
- Các tệp còn lại giữ nguyên, không nằm trong overlay.

## Kiểm thử
- `node --check js/app.js`: đạt.
- Chưa chạy được kiểm thử trình duyệt kết nối Supabase trong môi trường này; cần xác nhận trực tiếp sau triển khai.
