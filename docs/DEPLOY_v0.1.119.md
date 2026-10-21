# v0.1.119 — Tài khoản và nhập điểm theo phách

## Trạng thái

Mã nguồn và kiểm thử đã được cập nhật cục bộ. Chưa đẩy GitHub, chưa chạy SQL trên Supabase thật, chưa kiểm thử bản mới trên website đang hoạt động.

## Triển khai

1. Sao lưu CSDL và triển khai lúc không có giáo viên đang nhập điểm.
2. Trên CSDL đã chạy v0.1.118, chạy toàn bộ [migration v0.1.119](../sql/v0.1.119_accounts_grading_security.sql) trong Supabase SQL Editor bằng tài khoản chủ CSDL. Migration có transaction, có thể chạy lại; không xóa điểm cũ.
3. Cập nhật đồng bộ các file lên GitHub Pages:
   - [index.html](../index.html)
   - [js/app.js](../js/app.js)
   - [js/module-loader.js](../js/module-loader.js)
   - [js/operations.js](../js/operations.js)
   - [js/accounts.js](../js/accounts.js) — mới
   - [modules/accounts.html](../modules/accounts.html) — mới
4. Lưu cùng phiên bản các file SQL, tài liệu này và các kiểm thử trong GitHub. SQL không tự chạy khi tải lên GitHub.
5. Tải lại trang không dùng bộ nhớ đệm; kiểm tra phiên bản v0.1.119.

## Thiết lập ban đầu

- Giữ nguyên cơ chế đăng nhập Google. Giáo viên đăng nhập một lần để có tài khoản trong hệ thống, sau đó Admin chọn tài khoản trong tab **Quản lý tài khoản**.
- Lưu vai trò **Giáo viên**, chọn đúng một môn. Chọn kỳ thi và cấp quyền nhập điểm.
- Tài khoản giáo viên cũ cũng cần được xác nhận môn tại tab này; không tự suy luận vai trò từ phân công cũ. Quyền Admin cũ tiếp tục được nhận diện bằng cơ chế hiện có.
- Đặt thời gian bắt đầu/kết thúc cho từng kỳ thi. Chưa đặt thời hạn nghĩa là khóa nhập điểm. Giờ hiển thị theo múi giờ thiết bị; CSDL kiểm tra thời gian máy chủ.
- Phải có cấu hình điểm và phương án phách đã khóa. Nếu đã phân công túi/phòng riêng thì hạn chế đó vẫn được áp dụng.
- Đổi môn thu hồi phân công môn cũ; phải cấp quyền kỳ thi cho môn mới. Người dùng tải lại trang sau khi được đổi quyền.

## Quy tắc dữ liệu

- Giáo viên chỉ truy cập môn được gán. Đầu phách được giữ cho người đầu tiên lưu điểm thành công; người khác không thấy đầu phách đó trong lựa chọn mới tải và không thể ghi qua API.
- Chủ đầu phách được sửa điểm của mình trong thời hạn. Người/thời điểm nhập đầu tiên được giữ nguyên; nhật ký bổ sung giá trị cũ, mới, người và thời gian sửa.
- Đầu phách cũ có điểm của nhiều người hoặc không xác định được người nhập sẽ bị chặn thay vì tự chuyển quyền. Không có chức năng chuyển chủ đầu phách trong bản này.
- Nhập nhanh: `85 → 8,5`, `875 → 8,75`, `10 → 10`; kết quả vẫn phải đúng điểm tối đa, số chữ số thập phân và bước điểm đã cấu hình.
- Nhập file là một giao dịch: có dòng không hợp lệ thì toàn bộ giao dịch không được lưu.
- Nhật ký được xem theo kỳ thi trong tab quản lý tài khoản. Dữ liệu lịch sử trước phiên bản này chỉ phản ánh những gì hệ thống cũ đã lưu; không thể phục hồi lịch sử đã bị ghi đè hoặc xóa trước đó.
- Chức năng xóa phương án phách hiện có vẫn có thể xóa các điểm/nhật ký gắn với phương án. Đây không phải kho lưu trữ kiểm toán chống xóa; cần sao lưu trước thao tác xóa.

## Kiểm thử

Chạy các kiểm thử JavaScript:

```powershell
node --test tests/*.test.mjs
```

Kiểm thử SQL dùng PostgreSQL WebAssembly (PGlite), không kết nối CSDL thật. Cài `@electric-sql/pglite` vào một thư mục thử nghiệm riêng, rồi đặt biến `PGLITE_MODULE` trỏ tới file `dist/index.js` của gói:

```powershell
$env:PGLITE_MODULE='C:\thu-muc-thu-nghiem\node_modules\@electric-sql\pglite\dist\index.js'
node --test tests/grading-security.integration.mjs
```

Sau khi triển khai, thử bằng hai tài khoản giáo viên trên kỳ thi thử: phân môn, thời hạn, nhập cùng đầu phách, sửa điểm, xem nhật ký. Chưa kiểm thử tranh chấp đồng thời bằng hai kết nối PostgreSQL thật; kiểm thử tự động kiểm tra việc từ chối giáo viên thứ hai sau khi người thứ nhất đã lưu.
