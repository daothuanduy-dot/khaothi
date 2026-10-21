# Khắc phục quyền nhập điểm và triển khai quản lý tài khoản

## 1. Cơ sở dữ liệu — bắt buộc

Thông báo `Could not find the function public.exam_manage_accounts ... schema cache`
cho biết API hiện chưa có hàm quản lý tài khoản. Chỉ cập nhật GitHub không đủ.

Trên CSDL đã cập nhật đến v0.1.118, chạy toàn bộ
[v0.1.119_accounts_grading_security.sql](../sql/v0.1.119_accounts_grading_security.sql)
trong Supabase SQL Editor bằng tài khoản chủ CSDL. Script có transaction và reload
schema cache; không xóa điểm cũ. Nếu đã chạy mà còn lỗi, kiểm tra đúng project đang
kết nối và việc script đã hoàn tất. Không bỏ qua lỗi khi chạy script.

Luồng tài khoản/nhóm độc lập với kỳ thi cần chạy tiếp
[v0.1.120_global_graders.sql](../sql/v0.1.120_global_graders.sql).
Chạy SQL trước khi cập nhật giao diện. Không chạy tệp TOML hoặc JavaScript
trong SQL Editor. Các nhóm cũ giữ nguyên ID và thành viên, chuyển sang dùng chung;
các túi chưa giao không còn mở cho mọi giáo viên. Kiểm tra lại phân công thực tế
của các kỳ đang chấm sau cập nhật; phân công kỳ thi kiểu cũ không cấp quyền nhập nữa.

## 2. Backend thêm/sửa/xóa — triển khai trên Supabase

Triển khai Edge Function tên **manage-exam-accounts**, gồm hai tệp:

- [index.ts](../supabase/functions/manage-exam-accounts/index.ts)
- [handler.mjs](../supabase/functions/manage-exam-accounts/handler.mjs)

Có thể tạo function trong Dashboard rồi đưa cả hai tệp vào cùng thư mục, hoặc dùng
Supabase CLI tại thư mục dự án đã liên kết đúng project:

```sh
supabase functions deploy manage-exam-accounts --project-ref YOUR_PROJECT_REF
```

Tệp `supabase/config.toml` đặt `verify_jwt = false` cho function này vì mã
function tự xác thực phiên bằng `auth.getUser()`. Khi triển khai bằng CLI,
hãy giữ tệp cấu hình này trong thư mục dự án; nếu tạo function trực tiếp trên
Dashboard, tắt tùy chọn Verify JWT để request được chuyển vào handler.

Các biến môi trường server dùng là SUPABASE_URL, SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY (môi trường Supabase hosted cung cấp). Không đưa service
key vào GitHub, HTML, localStorage hoặc ô kết nối của ứng dụng. Function xác thực
JWT bằng getUser và kiểm tra exam_is_admin bằng phiên người gọi trước Auth Admin API.
Không lấy quyền từ role do trình duyệt gửi lên.

Tham khảo chính thức: [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid),
[deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).

Tạo tài khoản dùng email được Admin xác nhận, mật khẩu từ 8 ký tự (còn chịu chính
sách mật khẩu Supabase). Tài khoản mới chưa có quyền nhập: phải phân môn và giao bài
ở bước 4. Khi sửa, để trống mật khẩu để giữ nguyên. Họ tên đồng bộ qua trigger
exam_sync_user_profile có từ migration 63. Xóa bị chặn nếu tự xóa hoặc dữ liệu liên
quan đang có khóa ngoại bảo vệ; không xóa điểm/nhật ký để ép xóa tài khoản. Tài khoản
có lịch sử nên thu hồi phân công thay cho xóa. Function chưa hỗ trợ khóa tài khoản.

## 3. Frontend — cập nhật đồng bộ lên GitHub

- [index.html](../index.html)
- [js/app.js](../js/app.js)
- [js/accounts.js](../js/accounts.js)
- [js/operations.js](../js/operations.js)
- [js/module-loader.js](../js/module-loader.js)
- [modules/accounts.html](../modules/accounts.html)
- [modules/scripts.html](../modules/scripts.html)

Giữ nguyên đường dẫn; không chỉ cập nhật app vì phụ thuộc vào operations/accounts
và HTML tương ứng. Chờ GitHub Pages hoàn tất rồi Ctrl+F5.

## 4. Đưa giáo viên vào nhập điểm

1. Admin mở Quản lý tài khoản, bấm Thêm mới, nhập họ tên/email/mật khẩu, Tạo tài khoản.
2. Chọn tài khoản, vai trò Giáo viên, một môn phụ trách; Lưu vai trò và môn.
3. Nếu giao theo nhóm, tạo nhóm cùng môn và chọn giáo viên từ danh mục dùng chung.
   Nhóm và tài khoản không thuộc kỳ thi, không cần bước cho phép nhập kỳ thi.
4. Với kỳ thi cần chấm, cấu hình điểm, tạo và khóa phương án phách. Mở phân công
   túi, chọn giáo viên hoặc nhóm cùng môn rồi Lưu phân công túi. Túi chưa giao bị đóng.
5. Đặt khoảng thời gian và Lưu thời hạn. Chưa có khoảng thời gian nghĩa là đóng.
6. Giáo viên đăng nhập bằng tài khoản riêng, tự vào khu vực nhập điểm. Nếu đang dùng
   tài khoản Admin, nút Mở khu vực nhập điểm chỉ để kiểm tra giao diện, không cấp quyền
   ghi điểm thay giáo viên. Nút Về quản lý tài khoản đưa Admin trở lại.

## 5. Kiểm chứng và giới hạn

Đã kiểm thử bằng mock Auth API, không tạo/sửa/xóa tài khoản production:

```sh
node --test tests/account-admin.test.mjs tests/accounts.test.mjs tests/login.test.mjs tests/grader-entry.test.mjs tests/modules.test.mjs tests/forms-initialization.test.mjs
```

40 kiểm thử là kết quả lịch sử của luồng v119. Xem [trạng thái dự án](../project_status.md)
để biết kiểm thử luồng dùng chung v120. Ảnh người dùng đã xác nhận Edge Function
được triển khai; bản sửa luồng nhóm không cần sửa hoặc deploy lại function này.
Chưa chạy migration v120 lên production. Cần kiểm tra sau triển khai, gồm tài khoản
không phải admin, tự xóa, email trùng, đổi mật khẩu và xóa tài khoản có lịch sử.
Việc Auth thay đổi và phân quyền là hai thao tác riêng, không giả định giao dịch chung.
