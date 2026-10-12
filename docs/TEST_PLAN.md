# Kế hoạch kiểm thử v0.1.0

## Đã kiểm tra cục bộ
- Mã JavaScript của thuật toán có thể được nạp và chạy với dữ liệu mẫu.
- Kiểm tra thiếu ID/SBD, trùng ID/SBD, không đủ hai môn, mã môn không hợp lệ.
- Chia nhóm theo cặp môn có thứ tự: `elective_1` luôn là ca 1, `elective_2` luôn là ca 2.
- Chia phòng theo sức chứa và số phòng liên tục.
- Kiểm tra trùng môn giữa ca 1/ca 2 và học sinh bị phân công nhiều lần.

## Chưa thể xác nhận trong môi trường này
- Chưa chạy migration lên Supabase project thật.
- Chưa kiểm thử Auth/RLS trên tài khoản admin và non-admin thực tế.
- Chưa kiểm thử GitHub Pages từ repository của người dùng.

## Bộ dữ liệu thử tối thiểu đề nghị
1. 10 thí sinh: 4 `HOA,LY`; 3 `SU,DIA`; 3 `DIA,SU` (kiểm tra cặp có thứ tự khác nhau).
2. Sức chứa phòng = 3; kỳ vọng có ít nhất 4 phòng.
3. Xác minh phòng chỉ có một cặp môn theo đúng thứ tự ca.
4. Thử CSV có SBD trùng, môn trùng, thiếu môn và mã môn lạ; phải từ chối nhập.
5. Thử tài khoản không có `exam_profiles.is_admin=true`; không được đọc/ghi dữ liệu quản trị.
