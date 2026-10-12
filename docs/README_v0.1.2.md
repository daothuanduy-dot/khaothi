# Khảo thí v0.1.2 — Tách hồ sơ thí sinh và đăng ký môn thi

## Triển khai
1. Giữ nguyên các tệp hiện có; thay thế `index.html` và `js/app.js` bằng hai tệp trong gói overlay.
2. Trên Supabase SQL Editor chạy `sql/003_student_subject_separation.sql` sau migrations v0.1.0.
3. Đăng xuất/đăng nhập lại và tải lại GitHub Pages.

## Quy trình nghiệp vụ
- **Hồ sơ thí sinh**: nhập `student_code,student_name,date_of_birth,gender,ethnicity,class_code`; không bắt buộc SBD hoặc môn thi.
- **Môn thi**: chọn loại bắt buộc/lựa chọn, áp dụng theo lớp, cá nhân hoặc file CSV.
- Môn lựa chọn dùng `subject_order=1` cho ca 1 và `subject_order=2` cho ca 2.
- **Xếp phòng môn lựa chọn** chỉ dùng những học sinh có đúng hai đăng ký loại `elective` có thứ tự 1 và 2. Học sinh chưa đăng ký đủ hai môn sẽ bị báo lỗi trong bước xếp phòng.
- SBD chưa được tự sinh ở v0.1.2; module này không còn yêu cầu SBD khi nhập hồ sơ.

## CSV hồ sơ thí sinh
`student_code,student_name,date_of_birth,gender,ethnicity,class_code`

## CSV môn thi
`student_code,class_code,subject_code,subject_order,subject_type`
Mỗi dòng cần `student_code` hoặc `class_code`. Các mã môn hỗ trợ: `TOAN,VAN,SU,DIA,GDKTPL,LY,HOA,SINH,TIN`.

## Giới hạn
- Trình duyệt đọc CSV; Excel cần lưu dạng CSV UTF-8 trước khi tải lên.
- Khi áp dụng theo lớp từ file, một dòng class_code sẽ áp dụng môn cho tất cả học sinh thuộc lớp trong kỳ thi.
- Cần kiểm thử trên project staging trước khi dùng dữ liệu thật; SQL chưa được thực thi trong project người dùng.
