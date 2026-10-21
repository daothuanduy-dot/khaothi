# Mẫu Excel và yêu cầu thống kê, xuất điểm

Ghi nhận, cập nhật ngày 2026-10-21. Đọc cùng [Agen.md](../Agen.md) mục 12–14 và
[project_status.md](../project_status.md). Đây là đặc tả phục vụ phát triển,
chưa phải chức năng xuất đã triển khai.

## 1. Nguồn mẫu

Thư mục do chủ dự án cung cấp:
`D:/Documents/Du an Khao thi/mau nhap diem CSDL`.
Các tệp nằm ngoài repository; đường dẫn có thể cần cập nhật khi chuyển máy.
Đã đọc cấu trúc XLSX ở chế độ chỉ đọc, không sửa mẫu hoặc sao chép dữ liệu học sinh
vào tài liệu. Không suy ra cấu hình thi tương lai từ danh sách lớp trong mẫu.

| Tệp | Các trang lớp trong mẫu |
|---|---|
| bang_diem_hk_1_khoi_12_mon_vat_li.xlsx | 12A1–12A12 |
| bang_diem_hk_1_khoi_12_mon_dia_li.xlsx | 12A7–12A12 |
| bang_diem_hk_1_khoi_12_mon_gdkt_pl.xlsx | 12A7–12A12 |
| bang_diem_hk_1_khoi_12_mon_hoa_hoc.xlsx | 12A1–12A6 |
| bang_diem_hk_1_khoi_12_mon_lich_su.xlsx | 12A1–12A12 |
| bang_diem_hk_1_khoi_12_mon_ngoai_ngu_1.xlsx | 12A1–12A12 |
| bang_diem_hk_1_khoi_12_mon_ngu_van.xlsx | 12A1–12A12 |
| bang_diem_hk_1_khoi_12_mon_sinh_hoc.xlsx | 12A1–12A6 |
| bang_diem_hk_1_khoi_12_mon_tin_hoc.xlsx | 12A1–12A6 |
| bang_diem_hk_1_khoi_12_mon_toan.xlsx | 12A1–12A12 |

Mỗi tệp có thêm trang `HuongDan`. Tên môn hiển thị trong mẫu bao gồm
`NGOẠI NGỮ 1`, `GDKT&PL`; khi triển khai phải ánh xạ với mã môn hệ thống,
không mặc định tên tệp trùng mã môn hoặc mọi ngoại ngữ đều là Tiếng Anh.

## 2. Cấu trúc đã quan sát

Đã kiểm tra danh sách trang và tiêu đề một trang lớp của mỗi tệp trong cả 10 mẫu:

- E3: năm học 2026–2027, học kỳ I.
- A4: lớp; E4: tên môn.
- Hàng 6 có các tiêu đề sau:

| Cột | Tiêu đề |
|---|---|
| A | STT |
| B | Tên lớp |
| C | Mã định danh Bộ GD&ĐT |
| D | Họ và tên |
| E | Ngày sinh |
| F | ĐĐGtx |
| K | ĐĐGgk |
| L | ĐĐGck |

Với mẫu HKI đã xem: Giữa HKI tương ứng ĐĐGgk (K), Cuối HKI tương ứng ĐĐGck (L).
Đây là ánh xạ theo tiêu đề mẫu hiện tại, không phải vị trí cố định cho mọi tệp.
Chưa nhận/kiểm tra mẫu HKII: Giữa HKII và Cuối HKII phải dùng đúng mẫu học kỳ II
và xác minh tiêu đề tương ứng trước khi ghi. Không ghi điểm HKII vào mẫu HKI.
Các khối khác được chủ dự án mô tả là có cấu trúc tương tự, tên khối/lớp thay đổi;
chưa kiểm tra trực tiếp mẫu của các khối đó.

## 3. Luồng xuất theo mẫu

1. Chọn kỳ/đợt hệ thống và đợt định kỳ đích: Giữa HKI, Cuối HKI, Giữa HKII, Cuối HKII.
2. Xác định năm học, học kỳ, môn, khối và tệp mẫu phù hợp.
3. Đọc tiêu đề và danh sách trang; đối chiếu học sinh bằng mã định danh dạng chuỗi.
4. Lấy kết quả môn sau ghép trắc nghiệm/tự luận/nói theo cấu hình áp dụng.
5. Kiểm tra trùng/thiếu mã, sai môn/lớp, thiếu kết quả và ô đích đã có giá trị.
6. Ghi đúng cột đợt kiểm tra trên bản xuất, giữ các cột khác và cấu trúc mẫu.
7. Trả tệp kết quả cùng báo cáo các trường hợp không ghi được.

Không dùng STT, SBD, thứ tự dòng hoặc họ tên làm khóa thay thế âm thầm.
Chưa xác nhận chính sách ghi đè điểm có sẵn, làm tròn khi xuất và xuất điểm bổ sung
môn vắng; phải làm rõ trước khi triển khai các nhánh đó.

## 4. Ảnh thống kê tham chiếu

Ảnh người dùng cung cấp có tiêu đề “THỐNG KÊ KIỂM TRA GIỮA HỌC KỲ II”,
năm học 2025–2026. Ghi nhận bố cục để không phụ thuộc đường dẫn ảnh đính kèm tạm:

- Dòng theo lớp, ảnh minh họa 11B1–11B12, chia thành hai cụm.
- Cụm đầu có Văn, Toán, Anh, Lý, Hóa, Sinh; cụm sau đổi các môn cuối thành Sử,
  Địa, KTPL. Đây là ví dụ, không phải danh sách môn cố định cho hệ thống.
- Mỗi môn có điểm TB môn và cột XT; ảnh hiển thị TB môn ba chữ số thập phân.
- Có dòng tên bên dưới lớp và bên dưới số liệu môn.
- Bên phải là TỔNG, TB, XT THEO BAN, TĂNG/GIẢM, XẾP HẠNG HK1.
- Có dòng ĐTB cuối bảng và làm nổi bật thứ hạng đứng đầu.

Cần xác nhận công thức tổng/TB lớp, cách tổng hợp ĐTB khối (có trọng số học sinh
hay không), phạm vi XT, ý nghĩa tên, ánh xạ ban–nhóm và kỳ so sánh.
Không suy diễn các công thức chỉ từ ảnh. Yêu cầu điểm nhập hai chữ số thập phân
không tự xác định độ chính xác thống kê ba chữ số như ảnh.

## 5. Hai loại xuất và thống kê top 3

- **Xuất CSDL:** từng môn, theo mẫu sẵn, đúng mã định danh và đợt kiểm tra.
- **Xuất Quản lý nề nếp:** toàn khối, tất cả môn, tổng, trung bình, hạng nhóm, hạng lớp;
  cần thông tin định danh và ngữ cảnh kỳ/đợt. Chưa có hợp đồng cột từ dự án nhận.
- **Top 3:** yêu cầu đã ghi nhận; phạm vi thống kê chưa chốt. Khi xếp theo kết quả
  tổng hợp dùng tổng điểm và quy tắc phá hòa họ tên đã xác nhận.
- Giữ quy tắc loại môn vắng kể cả điểm bổ sung khỏi tổng/trung bình ở mọi đầu ra
  có tổng hợp; hiển thị đủ môn không có nghĩa tính tất cả môn vào tổng.

## 6. Kiểm chứng cần thực hiện khi phát triển

- Ghép đúng điểm thành phần, không nhân số môn khi tính trung bình.
- Đổi thứ tự dòng học sinh vẫn ghi đúng bằng mã định danh; giữ mã có số 0 đầu.
- Không ghi khi trùng/thiếu mã hoặc sai học kỳ, môn, lớp.
- Đúng cột giữa/cuối kỳ, không thay cột điểm khác, trang hướng dẫn hoặc thông tin học sinh.
- File tất cả môn vẫn giữ đúng tổng/trung bình, thứ hạng và quy tắc môn vắng.
- Kiểm thử nhiều khối, nhiều trang lớp, bốn đợt định kỳ và kết quả chưa đủ thành phần.
