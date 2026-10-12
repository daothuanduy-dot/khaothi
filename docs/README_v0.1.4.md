# Khảo thí v0.1.4 — sửa lỗi mã hóa tiếng Việt và tối ưu đăng ký môn

## Các thay đổi
- CSV được đọc theo UTF-8 nghiêm ngặt; hỗ trợ dự phòng Windows-1258 và CSV có BOM UTF-16LE/BE.
- Khuyến nghị tải trực tiếp `.xlsx` để tránh lỗi mã hóa từ CSV xuất bằng Excel.
- Phạm vi áp dụng môn gồm: theo khối, theo lớp, chọn danh sách học sinh trong lớp, theo mã học sinh, hoặc nhập từ CSV/Excel.
- Thứ tự ca chỉ hiển thị khi loại môn là "Môn lựa chọn". Môn bắt buộc không lưu thứ tự ca.
- SQL không thay đổi trong phiên bản này.

## Cập nhật GitHub
Trong ZIP overlay, thay đúng `index.html` và `js/app.js`; thêm `docs/README_v0.1.4.md` và `CHANGELOG_v0.1.4.md`. Giữ nguyên các file còn lại.

## Quan trọng về dữ liệu tên đã bị hỏng
Nếu tên đã lưu trong Supabase thành dấu `?` thật sự, không thể khôi phục từ dữ liệu đó. Sau khi cập nhật, hãy nhập lại từ file Excel gốc (.xlsx) để upsert lại tên đúng. Nếu file gốc cũng chứa `?` thì cần lấy lại danh sách gốc chưa bị lỗi.

## Đăng ký môn
- Môn bắt buộc: chọn loại "Môn bắt buộc", chọn môn, rồi áp dụng phạm vi. Trường ca thi bị ẩn và `subject_order` được lưu `null`.
- Môn lựa chọn: chọn loại "Môn lựa chọn", chọn môn, chọn ca 1 hoặc ca 2, rồi áp dụng phạm vi.
- "Chọn học sinh trong lớp": nhập lớp và danh sách mã học sinh (mỗi dòng hoặc phân cách bằng dấu phẩy). Tất cả mã phải thuộc lớp đã chọn.
- "Theo khối": lọc lớp có mã bắt đầu bằng khối đã chọn (ví dụ `10A1`, `11B2`, `12A10`).

## Kiểm thử
- `node --check js/app.js`: đạt.
- Chưa kiểm thử end-to-end trên project Supabase của người dùng.
