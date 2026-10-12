# Hệ thống khảo thí THPT Lê Hồng Phong — v0.1.0

## Đây là gì?
Bản nền khởi tạo từ đầu, chạy giao diện tĩnh trên GitHub Pages và dùng Supabase làm xác thực/cơ sở dữ liệu. Gói có `index.html` nên có thể truy cập website sau khi triển khai GitHub Pages và cấu hình Supabase.

## Chức năng có trong v0.1.0
- Màn hình cấu hình Supabase URL + publishable/anon key; không dùng `service_role` trong trình duyệt.
- Đăng nhập Supabase Auth.
- Tạo và liệt kê kỳ thi.
- Nhập thí sinh bằng CSV, kiểm tra cột bắt buộc, mã môn và SBD trùng trong file.
- Xem danh sách thí sinh đã nhập.
- Tạo phương án xem trước xếp phòng môn lựa chọn: học sinh chọn đúng hai môn trong SU, DIA, GDKTPL, LY, HOA, SINH, TIN; ca 1/ca 2 lấy theo cặp môn; một phòng chỉ ghép học sinh cùng cặp môn; sức chứa cấu hình được; phòng đánh số liên tục.
- Lưu hoặc khóa phương án qua RPC kiểm tra phía máy chủ; xuất CSV danh sách phân phòng.

## Cấu trúc
- `index.html`: trang bắt đầu — đường dẫn website.
- `css/app.css`: giao diện.
- `js/app.js`: xác thực, quản lý kỳ thi/thí sinh, giao diện.
- `js/rooming.js`: thuật toán xếp phòng và kiểm tra ràng buộc.
- `sql/001_schema.sql`: schema/RLS nền.
- `sql/002_rooming_rpc.sql`: RPC lưu/khóa phương án.
- `docs/`: hướng dẫn và nhật ký phiên bản.

## Triển khai Supabase
1. Tạo một project Supabase riêng cho hệ thống khảo thí.
2. Mở SQL Editor, chạy `sql/001_schema.sql`.
3. Chạy tiếp `sql/002_rooming_rpc.sql`.
4. Tạo người dùng quản trị trong Authentication → Users.
5. Sao chép UUID của user đó rồi chạy SQL sau trong SQL Editor, thay UUID và tên hiển thị:

```sql
insert into public.exam_profiles(user_id, display_name, is_admin)
values ('UUID-USER-QUAN-TRI', 'Quản trị khảo thí', true)
on conflict (user_id) do update set display_name=excluded.display_name, is_admin=true;
```

6. Không cấp `is_admin=true` cho người dùng không được phép quản trị. Cột quyền chỉ được sửa bởi người có quyền SQL Dashboard.
7. Vào Project Settings → API/Connect, lấy Project URL và publishable key (hoặc anon key legacy). Mở website, nhập hai giá trị rồi đăng nhập.

## Triển khai GitHub Pages
1. Giải nén ZIP mã nguồn đầy đủ.
2. Tạo repository GitHub mới, chép **toàn bộ nội dung bên trong thư mục** (để `index.html` ở root repository).
3. Commit/push lên nhánh `main`.
4. Vào Settings → Pages, chọn deploy từ branch `main`, folder `/ (root)`.
5. Mở URL GitHub Pages mà GitHub cung cấp. Lần đầu nhập Supabase URL và publishable/anon key.

## CSV nhập thí sinh
Header bắt buộc:

```csv
sbd,student_code,student_name,class_code,elective_1,elective_2
100001,HS0001,Nguyen Van A,10A1,HOA,LY
```

Mã môn: `SU`, `DIA`, `GDKTPL`, `LY`, `HOA`, `SINH`, `TIN`. Mỗi học sinh phải đăng ký đúng hai mã khác nhau. Toán và Ngữ văn là các môn bắt buộc theo lịch cứng và không thuộc chức năng xếp phòng môn lựa chọn ở phiên bản này.

## Giới hạn v0.1.0 — đọc trước khi sử dụng
- Đây là bản nền ban đầu, chưa phải hệ thống sản xuất hoàn chỉnh. Chưa có chức năng tự sinh SBD 6/8 chữ số theo tiền tố khối; CSV hiện yêu cầu SBD đã được cung cấp. Chưa có quản lý phân phòng theo môn bắt buộc, đánh phách/chấm thi, kết quả/xếp hạng hoặc đồng bộ trực tiếp dữ liệu từ hệ thống nề nếp cũ.
- Chức năng khóa tạo bản ghi phương án mới ở trạng thái `locked`; không sửa hoặc xóa phương án đã lưu trước đó.
- Các migration chưa được thực thi trên project Supabase thật trong phiên này. Chạy ở project thử nghiệm trước, kiểm tra policy, RPC và dữ liệu mẫu trước khi dùng chính thức.
- GitHub Pages là website tĩnh. Chỉ dùng publishable/anon key; quyền truy cập dữ liệu được bảo vệ bởi Supabase Auth, RLS và RPC. Không đưa `service_role` vào mã nguồn.
