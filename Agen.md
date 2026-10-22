# Yêu cầu nghiệp vụ cấu hình, tổ chức thi và nhập điểm

Cập nhật: 2026-10-21. Tài liệu ghi nhận trao đổi và yêu cầu của chủ dự án.

## Cập nhật triển khai — 2026-10-22

Đã triển khai mảng đầu tiên của cấu hình kỳ thi: hệ thống dùng hai loại kỳ thi là
**mặc định** và **theo môn**. Kỳ thi theo môn lập SBD riêng cho từng môn, bắt đầu
từ `0001` và sắp theo họ tên (tên → đệm → họ; cùng tên thì theo mã học sinh).
SBD này độc lập với SBD chung của kỳ thi mặc định. Migration triển khai là
[v0.1.125_subject_exam_sbd.sql](./sql/v0.1.125_subject_exam_sbd.sql).

## Cách sử dụng tài liệu

Trước khi cập nhật, bổ sung cấu hình kỳ thi, môn, lớp, nhóm, phòng, SBD, tài khoản,
phân công chấm, quản lý phách, nhập điểm hoặc tổng hợp kết quả, đọc tài liệu này
và [project_status.md](./project_status.md).
Đối chiếu mã nguồn thực tế, không coi yêu cầu trong tài liệu là chức năng đã hoàn thành.
Sau khi làm việc, cập nhật trạng thái, kết quả kiểm tra và các điểm còn cần xác định.
Yêu cầu mới nhất của chủ dự án được ưu tiên; cập nhật lại tài liệu khi có thay đổi.
Các quy tắc ghi là đã xác nhận dưới đây phải được sử dụng khi triển khai về sau,
không yêu cầu chủ dự án mô tả hoặc xác nhận lại. Chỉ làm rõ các điểm chưa chốt.

## 1. Trình tự nghiệp vụ đã xác nhận

1. Cấu hình kỳ thi, môn thi và phạm vi học sinh; với kỳ thi mặc định, thiết lập
   môn–lớp, hình thức thi và thuộc tính Tính điểm hoặc sao chép cấu hình.
2. Lập nhóm lớp, chọn thứ tự nhóm và tiêu chí sắp xếp học sinh.
3. Sắp xếp trong nhóm, chia phòng riêng từng nhóm và đánh SBD liên tục qua các nhóm.
   Sau khi có phòng và SBD, in danh sách gửi về lớp và danh sách niêm yết môn bắt buộc
   theo mục 15 để thông báo cho học sinh.
4. **Đánh phách bài thi trước khi nhập điểm theo phách. Không được bỏ qua bước này.**
5. Phân công bó bài đã đánh phách cho giáo viên hoặc nhóm môn, bảo đảm một bó/một người.
6. Nhập điểm theo phách hoặc theo lớp, áp dụng thời hạn và quy tắc điểm.
7. Theo dõi học sinh vắng, kiểm tra bổ sung và nhập điểm bổ sung theo môn.
8. Ghép điểm thành phần thành kết quả bài thi của từng môn.
9. Hiển thị kết quả, tính tổng, trung bình và xếp thứ hạng; dùng tổng điểm làm căn cứ
   cho kỳ tiếp theo.
10. Thống kê top 3, thống kê theo khối và xuất kết quả theo mẫu CSDL hoặc cho
    dự án Quản lý nề nếp.

Nhánh thi theo lớp sử dụng danh sách lớp để nhập điểm; không tự áp đặt thêm yêu cầu
đánh phách cho nhánh này khi chưa có yêu cầu. Bước đánh phách bắt buộc nằm trước
luồng nhập điểm theo phách.

## 2. Loại kỳ thi và cấu hình môn

Phân biệt **môn lựa chọn** (loại môn) với **kỳ thi theo môn** (loại kỳ thi).

| Chức năng | Kỳ thi mặc định | Kỳ thi theo môn |
|---|---|---|
| Thêm, sửa, xóa và cấu hình môn tại giao diện này | Có | Không có cụm chức năng này |
| Gán môn cho cả lớp và chọn hình thức thi theo môn–lớp | Có | Không áp dụng |
| Chọn thuộc tính Tính điểm cho môn | Có | Tổng hợp từ tất cả bài thi, trừ môn vắng |
| Sao chép cấu hình kỳ trước | Có | Không có |

Mỗi môn trong cấu hình kỳ thi mặc định có tên, mã môn, loại bắt buộc/lựa chọn,
thuộc tính Tính điểm, lựa chọn có/không có tự luận, danh sách lớp và hình thức thi
cho từng lớp.
Môn không được chọn Tính điểm vẫn có bài thi và kết quả riêng.

### Điểm thành phần của môn

- Khi tạo môn ở kỳ thi mặc định, có lựa chọn **có tự luận / không có tự luận**.
- Môn Tiếng Anh có thể có đến ba đầu điểm: **trắc nghiệm, tự luận, nói**.
- Không bắt buộc mọi môn có đủ ba thành phần; cấu hình phải phản ánh thành phần
  thực tế. Không ép môn không có tự luận đi qua luồng đánh phách tự luận.
- Ghép các thành phần về một kết quả bài thi/môn/học sinh/kỳ/đợt; các thành phần
  không phải các môn độc lập và không làm tăng mẫu số tính trung bình các môn.
- Chưa chốt công thức ghép, trọng số, thang điểm từng thành phần, cách xử lý thiếu
  thành phần và cách nhập điểm nói. Không tự mặc định cộng thẳng hoặc lấy trung bình.
- Sao chép cấu hình phải bao gồm thuộc tính thành phần của môn đã thiết lập.

Trong kỳ thi theo môn, không giới hạn đăng ký môn theo danh sách môn đã gán cho lớp
hoặc môn học sinh đang học. Đây là yêu cầu nghiệp vụ chủ dự án đã xác nhận;
tài liệu này không phải kết quả thẩm định văn bản pháp luật.

## 3. Gán lớp, hình thức thi và sao chép cấu hình

- Gán môn cho lớp áp dụng **toàn bộ học sinh của lớp**, kể cả môn thuộc loại lựa chọn.
- Mỗi học sinh thuộc phạm vi được gán phải được theo dõi kết quả môn đó.
- Mỗi cặp môn–lớp chọn thi chia phòng hoặc thi theo lớp.
- Ví dụ Vật lý: A1–A6 chia phòng, A7–A12 thi tại lớp. Một lớp có thể dùng hình thức
  khác nhau ở các môn khác nhau.
- Xếp phòng môn nào tự lấy học sinh của những lớp được gán thi chia phòng môn đó;
  không đưa học sinh được gán thi tại lớp vào danh sách chia phòng môn đó.
- Các cặp môn–lớp thi tại lớp đi vào luồng chọn khối, lớp, danh sách học sinh để nhập điểm.
- Sao chép cấu hình chỉ có ở kỳ thi mặc định: sao chép thiết lập môn, lớp và mọi
  thuộc tính cấu hình tại giao diện này, không sao chép điểm hoặc kết quả kỳ trước.
- Sao chép cấu hình và lấy tổng điểm kỳ trước để sắp xếp là hai thao tác riêng.

## 4. Nhóm lớp, xếp phòng và số báo danh

- Một nhóm gồm một hoặc nhiều lớp; quản trị quy định thứ tự nhóm.
- Gộp học sinh trong từng nhóm rồi sắp theo tiêu chí đã chọn: tên → đệm → họ,
  hoặc tổng điểm kỳ thi trước. Không dùng trung bình để thay cho tổng điểm.
- Khi tổng điểm bằng nhau, dùng tên → đệm → họ để sắp thứ hạng.
- Sau sắp xếp trong nhóm, chia phòng và đánh SBD theo thứ tự danh sách.
- **Không để học sinh của hai nhóm ngồi chung một phòng**, kể cả phòng cuối nhóm
  trước chưa đủ chỗ. Nhóm sau bắt đầu ở phòng riêng.
- SBD liên tục: đánh hết nhóm trước rồi đến nhóm sau, không bắt đầu lại hoặc tạo
  khoảng trống SBD chỉ vì nhóm trước còn ghế trống.
- Ví dụ 24 học sinh/phòng: nhóm 1 có 50 em dùng ba phòng (24,24,2), SBD 0001–0050;
  nhóm 2 có 30 em dùng hai phòng mới (24,6), SBD 0051–0080.
- Yêu cầu cần triển khai tiếp tại tab **Quản lý SBD** cho kỳ thi toàn trường: cấu hình đầu SBD
  riêng theo từng khối (10, 11, 12 hoặc đầu số do quản trị nhập) và chọn quy tắc xếp số cho
  từng khối. Chưa thay đổi cơ chế cấp SBD hiện tại cho đến khi triển khai riêng mảng này.
- Không gán một lớp trùng vào nhiều nhóm trong cùng phương án.
- Cần chốt chiều sắp theo tổng điểm, xử lý trùng toàn bộ họ tên và học sinh không có
  kết quả kỳ trước. Không yêu cầu xác nhận lại việc dùng tổng thay vì trung bình.

## 5. Tài khoản và phạm vi nhập điểm

Điều chỉnh đã xác nhận: tài khoản và nhóm giáo viên tồn tại độc lập với kỳ thi.
Không có bước cấp/thu hồi quyền nhập cả kỳ thi cho từng tài khoản. Quản trị lưu
vai trò/môn và nhóm dùng chung; khi giao chấm chọn giáo viên hoặc nhóm cùng môn
cho bài/túi bài cụ thể. Quyền nhập phải theo phân công thực tế, không tự mở các
túi chưa giao. Nội dung này thay thế luồng cấp quyền kỳ thi riêng mô tả trước đây.

Yêu cầu bổ sung: quản trị có chức năng thêm, sửa, xóa tài khoản. Đã triển khai mã
giao diện và Edge Function manage-exam-accounts (ảnh người dùng đã xác nhận deploy). Tạo email/mật khẩu/họ
tên, sửa thông tin hoặc mật khẩu, xóa tài khoản không có ràng buộc lịch sử; chặn tự
xóa. Không xóa điểm/nhật ký để xóa tài khoản. Sau tạo lưu vai trò/môn độc lập;
quyền nhập theo phân công bài thực tế, không cấp quyền kỳ thi riêng. Khóa quản trị
chỉ dùng phía máy chủ.
Admin có nút mở khu vực nhập điểm để xem giao diện và quay về quản lý; không giả
lập giáo viên hoặc bỏ kiểm tra quyền ghi. Đăng nhập tài khoản giáo viên đã phân công
để nhập điểm thực tế. Xem [hướng dẫn triển khai](./docs/DEPLOY_account_admin.md).

Đã triển khai bước đầu giao diện đăng nhập giáo viên: email/mật khẩu và Google,
hiện/ẩn mật khẩu, trạng thái xử lý, thông báo lỗi tiếng Việt. Vai trò lấy từ máy chủ:
giáo viên vào khu vực nhập điểm hiện có, admin vào quản lý; tài khoản chưa có quyền
được thông báo liên hệ quản trị. Người dùng không tự chọn quyền hoặc môn lúc đăng nhập.
Đây chưa phải triển khai đầy đủ các luồng nhập điểm mô tả bên dưới.

- Mỗi giáo viên có tài khoản riêng, môn dạy riêng do quản trị thiết lập.
- Sau đăng nhập, giáo viên chọn kỳ, đợt thi và cách nhập điểm phù hợp.
- Có hai cách nhập: theo bài thi/phách và theo lớp.
- Hai cách này phục vụ các nhóm học sinh có cách tổ chức thi khác nhau trong cùng môn.
  Ví dụ môn Vật lý: A1–A6 thi theo phân phòng, A7–A12 thi tại lớp.
- Nhập theo lớp có lựa chọn khối, lớp và danh sách học sinh tương ứng.
- Mỗi kết quả ứng với một bài tự luận / môn / học sinh trong kỳ, đợt thi tương ứng.
  Không tạo hai kết quả độc lập cho cùng một bài chỉ vì có hai cách nhập.

## 6. Đánh phách, phân công và tính nguyên vẹn của bó bài

- Bài thi thuộc luồng nhập theo phách phải được đánh phách trước khi giao bó và nhập.
- Đối chiếu cơ chế đánh phách hiện có khi triển khai; tài liệu chưa xác nhận chức năng
  đánh phách hiện tại đáp ứng toàn bộ quy trình mới.

- **Một bó bài chỉ giao cho một giáo viên. Không giao cùng một bó cho hai người.**
- Phải bảo đảm tính nguyên vẹn của bó bài khi nhập điểm; không chia các dòng của
  cùng bó cho nhiều giáo viên nhập.
- Quản trị có thể chọn giáo viên cụ thể hoặc giao cho nhóm môn tại Quản lý phách.
- Giao cho nhóm môn không có nghĩa là cho phép nhiều thành viên cùng nhập một bó.
  Khi bó đã có người nhận phụ trách, những thành viên khác không được nhận/nhập bó đó.
- Yêu cầu ban đầu: với nhóm môn, đầu phách đã có người khác nhập thì người dùng
  không chọn được đầu phách đó.
- Giao diện có danh sách đầu phách tương ứng với bó bài đã đánh phách; chọn đầu phách
  rồi nhập theo thứ tự từ bài đầu đến hết.
- Không mặc nhiên coi một đầu phách luôn tương đương một bó trong dữ liệu hiện có;
  phải kiểm tra cách xác định bó khi triển khai.
- Ví dụ giải thích trước đây “hai người cùng được giao một bó rồi ai lưu trước giữ
  quyền” không phải quy tắc được chấp nhận. Quy tắc cuối cùng là một bó/một người.
- Cần xác định thêm cơ chế nhận bó từ nhóm, thời điểm xác lập người phụ trách và
  quy trình quản trị chuyển giao bó. Không tự chốt rằng lưu điểm đầu tiên mới giữ quyền.

## 7. Nhập nhanh và quy tắc điểm

Các ví dụ đã được chủ dự án xác nhận:

| Chuỗi nhập | Điểm hiển thị chuẩn hóa |
|---|---|
| `10` | `10,00` |
| `7` | `7,00` |
| `45` | `4,50` |
| `075` | `0,75` |
| `75` | `7,50` |

- Điểm được chuyển thành giá trị số và hiển thị hai chữ số sau dấu phẩy.
- Giữ chuỗi nhập ban đầu để phân biệt số 0 đứng đầu; không chuyển `075` thành `75`
  trước khi giải mã cách nhập nhanh.
- Không áp dụng quy tắc chia 10 cho mọi đầu vào.
- Giá trị sau chuyển đổi phải tuân thủ thang điểm, bước điểm và ràng buộc quản trị
  thiết lập trên giao diện Quản lý phách.
- Quy tắc cho các chuỗi chưa được nêu và cách xử lý cấu hình độ chính xác khác hai
  chữ số cần được xác định khi thiết kế; không tự suy diễn hoặc làm tròn điểm sai quy tắc.

## 8. Không bài và điền điểm mặc định

- Có cột “Không bài”, mỗi dòng có ô đánh dấu khi phách không có bài.
- Cần phân biệt “Không bài”, điểm 0 và chưa nhập; cách lưu cụ thể chưa triển khai.
- Có nút chọn/điền điểm mặc định để điền nhanh, sau đó giáo viên sửa các bài có điểm khác.
- Chưa chốt việc điền mặc định chỉ áp dụng ô trống hay được ghi đè điểm đã nhập,
  cũng như phạm vi áp dụng trong màn hình nhập theo lớp.

## 9. Thời hạn

- Có giới hạn nhập điểm từ ngày đến ngày.
- Quản trị thiết lập và điều chỉnh thời hạn trên giao diện.
- Thiết kế cần bảo đảm việc lưu/sửa tuân thủ thời hạn.
- Phạm vi thời hạn theo kỳ/đợt, môn hay nhóm và giờ bắt đầu/kết thúc cụ thể chưa chốt.

## 10. Nhập điểm môn vắng

- Học sinh báo vắng vẫn phải kiểm tra bổ sung và được nhập điểm bổ sung.
- Giao diện nhập điểm hiển thị danh sách học sinh vắng của kỳ/đợt đang chọn.
- Giáo viên chỉ thấy học sinh vắng môn mình dạy và chỉ được nhập điểm môn đó;
  không được thấy danh sách vắng môn khác. Áp dụng cả quyền đọc và quyền ghi dữ liệu.
- Học sinh vắng nhiều môn xuất hiện trong danh sách riêng của từng môn tương ứng.
- Phân biệt chưa có điểm bổ sung và đã nhập điểm bổ sung.
- Điểm bổ sung gắn với đúng bài/môn/học sinh/kỳ/đợt, không tạo bài độc lập trùng kết quả.
- **Điểm của môn vắng không tham gia tổng và trung bình, kể cả sau khi đã nhập điểm
  kiểm tra bổ sung.** Đây là quy tắc chủ dự án đã xác nhận rõ, không còn là câu hỏi mở.
- Lưu được lịch sử/trạng thái vắng để việc bổ sung điểm không vô tình đưa môn đó
  trở lại phạm vi tổng hợp.

## 11. Tổng điểm, trung bình và xếp thứ hạng

- Kỳ thi mặc định: xét các môn được đánh dấu Tính điểm.
- Kỳ thi theo môn: xét tất cả bài thi của học sinh.
- Trong cả hai loại kỳ thi, loại môn vắng khỏi tổng và mẫu số tính trung bình,
  bao gồm cả điểm bổ sung của môn vắng.
- Nếu thiếu bài một môn, vẫn tính tổng và trung bình trên các môn có kết quả
  thuộc phạm vi tính điểm; không tự chuyển thiếu bài thành điểm 0.
- Tổng = tổng điểm các môn hợp lệ; trung bình = tổng / số môn hợp lệ có kết quả.
  Điểm 0 thực sự vẫn là kết quả và được tính vào số môn.
- Ví dụ Toán 8, Văn 7, Lý vắng: tổng 15, trung bình 7,50 trên hai môn.
  Sau khi nhập điểm bổ sung Lý, tổng vẫn 15 và trung bình vẫn 7,50.
- Dùng **tổng điểm**, không dùng trung bình, để xếp hạng theo điểm và làm căn cứ
  xếp phòng/SBD kỳ tiếp theo. Khi bằng tổng, xét tên → đệm → họ.
- Chưa chốt cách hiển thị khi không có môn hợp lệ (mẫu số 0), độ chính xác làm tròn
  tổng/trung bình và cách chọn kỳ trước. Không tự gán các trường hợp này thành điểm 0.

## 12. Hiển thị kết quả sau ghép điểm

Có hai phạm vi lựa chọn:

1. **Những môn được chọn Tính điểm**, lọc theo khối và lớp.
2. **Tất cả môn được gán**, gồm cả môn không tham gia tổng/trung bình.

Trong phạm vi những môn Tính điểm, có hai chế độ:

- **Tổng điểm bài thi:** hiển thị kết quả đã ghép của từng môn.
- **Điểm chi tiết:** hiển thị đầy đủ các điểm thành phần của bài thi, kết quả ghép,
  tổng điểm các môn, điểm trung bình, thứ hạng của học sinh trong nhóm và trong lớp.

Phân biệt tổng điểm bài thi của một môn với tổng điểm các môn của học sinh.
Chuyển sang hiển thị tất cả môn không tự thay đổi phạm vi tính tổng/trung bình.
Điểm bổ sung môn vắng vẫn có thể hiển thị nhưng luôn bị loại khỏi tổng/trung bình
theo mục 10–11. Xếp hạng học sinh theo tổng điểm, bằng tổng xét tên → đệm → họ.

## 13. Xuất kết quả vào mẫu Excel CSDL theo môn

- Hỗ trợ bốn đợt: **Giữa HKI, Cuối HKI, Giữa HKII, Cuối HKII**.
- Ghi kết quả môn đã ghép vào đúng cột đợt kiểm tra, đúng môn, khối, lớp, năm học
  và học kỳ của tệp mẫu.
- **Đối chiếu bằng mã định danh học sinh**, không ghép theo vị trí dòng, SBD hoặc
  chỉ theo họ tên. Giữ mã dưới dạng chuỗi để không mất số 0 đầu.
- Bảo toàn cấu trúc, trang tính, thông tin học sinh, định dạng và các cột không
  thuộc đợt cần xuất; xuất thành tệp kết quả, không sửa trực tiếp mẫu nguồn.
- Phát hiện mã trùng, mã thiếu, không tìm thấy hoặc sai lớp/môn; báo các dòng không
  thể đối chiếu, không âm thầm ghi vào học sinh khác.
- Các khối khác dùng mẫu tương tự nhưng tên tương ứng thay đổi; đọc cấu trúc/tiêu đề
  thực tế, không cố định tên khối 12 hoặc vị trí cột cho mọi mẫu tương lai.
- Danh mục 10 mẫu và cấu trúc đã kiểm tra được ghi tại
  [docs/score-export-requirements.md](./docs/score-export-requirements.md).
- Chưa chốt quy tắc xuất điểm bổ sung môn vắng vào mẫu CSDL, xử lý ô đã có điểm,
  làm tròn theo mẫu và dữ liệu thiếu. Việc loại điểm bổ sung khỏi tổng/trung bình
  đã chốt, nhưng không đồng nghĩa tự loại khỏi kết quả môn cần xuất.

## 14. Thống kê và xuất cho Quản lý nề nếp

- Có thống kê **top 3 học sinh có điểm thi cao nhất**. Cơ sở xếp hạng học sinh là
  tổng điểm theo mục 11; cần chốt phạm vi top 3 (khối/nhóm/lớp hoặc theo từng môn).
- Có thống kê theo khối theo ảnh mẫu: dòng lớp, điểm trung bình từng môn và thứ
  hạng môn (XT), tổng, TB, xếp thứ theo ban, tăng/giảm và xếp hạng kỳ đối chiếu;
  các lớp được trình bày thành các khối nhóm, có dòng ĐTB.
- Ảnh có dòng tên dưới lớp và dưới điểm môn; cần xác nhận nguồn và ý nghĩa các
  tên này trước khi triển khai, không mặc định đó là học sinh top 3.
- Không mặc định “ban” trong ảnh chính là nhóm xếp phòng. Cần chốt ánh xạ, phạm vi
  xếp hạng môn/lớp, công thức tổng/TB lớp, ĐTB khối, kỳ so sánh và tăng/giảm.
  Phân biệt thống kê lớp trong ảnh với xếp hạng cá nhân học sinh.
- Xuất **file điểm toàn khối** phục vụ dự án Quản lý nề nếp: tất cả môn, tổng điểm,
  trung bình, xếp hạng trong nhóm, xếp hạng trong lớp.
- Dữ liệu cần nhận diện được học sinh bằng mã định danh, họ tên, lớp, khối, nhóm,
  kỳ/đợt và năm học; cấu trúc cột nhận cụ thể của dự án đích chưa được cung cấp.
- Không tự thay đổi cách tính tổng vì file hiển thị tất cả môn.
- Đây là yêu cầu xuất tệp, chưa phải yêu cầu đồng bộ hoặc gửi dữ liệu trực tiếp
  sang dự án Quản lý nề nếp.

## 15. Biểu mẫu thông báo phòng thi và niêm yết

Bổ sung hai lựa chọn riêng trong mục **Biểu mẫu và danh sách**, theo kỳ thi và
đợt thi đang chọn. Dùng thông tin tiêu đề biểu mẫu đã khai báo cho kỳ thi.
Ảnh tham chiếu hiện có các lựa chọn Danh sách niêm yết, PTB bắt buộc, PTB lựa chọn,
PTB theo lớp, SBD và môn lựa chọn; cần đối chiếu chức năng thực tế khi triển khai,
không coi các mục có sẵn đã đáp ứng hai yêu cầu mới chỉ vì tên gần giống.

### 15.1. Danh sách thông tin dự thi gửi về lớp

- Mục đích: in theo từng lớp, chuyển về lớp để học sinh biết SBD và phòng thi.
- Các cột bắt buộc theo yêu cầu:

| SBD | Họ và tên | Ngày sinh | Phòng thi môn bắt buộc | Phòng thi môn lựa chọn | Ghi chú |
|---|---|---|---|---|---|

- Danh sách tập hợp học sinh theo lớp học, không theo phòng thi; tiêu đề thể hiện
  lớp và kỳ thi, **không hiển thị dòng Đợt** trên bản Excel hoặc in/PDF.
  Vẫn lọc dữ liệu theo đợt đang chọn. Mỗi lớp có phần in riêng, không trộn học sinh các lớp.
- Nếu Toán và Ngữ văn cùng phòng, gộp thành **Toán/Ngữ văn: P01** (theo số phòng
  thực tế). Nếu dữ liệu hai môn khác phòng thì giữ riêng để không thông báo sai.
- Hai nhóm cột phòng phải chỉ rõ môn tương ứng khi học sinh có nhiều môn/phòng
  khác nhau. Có thể dùng cột con theo môn hoặc ghi rõ môn–phòng; bố cục cụ thể
  sẽ chọn khi triển khai, không gộp thành một số phòng gây hiểu nhầm.
- Lấy SBD và phòng từ phương án đã xếp của đúng kỳ/đợt; không sinh lại SBD khi in.
- Với môn thi tại lớp, thể hiện thi tại lớp theo cấu hình thực tế; không tự gán
  phòng chia phòng. Phân biệt chưa xếp phòng với không dự thi môn đó.

### 15.2. Danh sách niêm yết môn thi bắt buộc

- Bổ sung biểu mẫu **Danh sách niêm yết môn bắt buộc**, tách biệt với PTB bắt buộc
  và các danh sách môn lựa chọn.
- Điều chỉnh đã xác nhận: tiêu đề chỉ có tên kỳ thi, tên biểu mẫu và PHÒNG;
  bỏ Đợt và dòng Môn: Toán/Ngữ văn. Vẫn lấy dữ liệu theo đợt đang chọn.
- In một danh sách cho mỗi phòng bắt buộc, gộp thí sinh trùng giữa các môn cùng
  phòng; cột Môn thi trong bảng giữ các môn thực tế của từng học sinh.
- Nội dung lấy đúng học sinh, SBD và phân phòng của môn bắt buộc trong kỳ/đợt đã chọn.
- Không dùng danh sách môn lựa chọn thay thế hoặc tự suy ra phòng môn bắt buộc
  từ phòng của môn lựa chọn.
- Yêu cầu có biểu mẫu đã được xác nhận; bộ cột, việc in riêng từng môn/phòng hay
  gộp các môn cùng phương án chưa được người dùng chỉ định. Khi triển khai, đối chiếu
  mẫu niêm yết hiện có và làm rõ phần bố cục còn thiếu, không tự ghi thành quy tắc đã chốt.

### 15.3. Kiểm tra khi triển khai

- Đúng kỳ/đợt, lớp, môn, SBD và phòng; không bỏ sót hoặc lặp học sinh.
- Mẫu gửi lớp thể hiện được trường hợp các môn có phòng khác nhau và môn thi tại lớp.
- In nhiều lớp không trộn danh sách; tiêu đề cột lặp trên trang tiếp theo nếu nhiều trang.
- Mẫu niêm yết môn bắt buộc không lẫn môn lựa chọn; dữ liệu in khớp phương án xếp phòng.
- Đã triển khai hai lựa chọn trong mã nguồn ngày 2026-10-21, hỗ trợ Excel và In/lưu PDF.
  Mẫu gửi lớp tái sử dụng bảng phòng theo lớp (có thêm STT và giới tính).
  Niêm yết bắt buộc in riêng theo phòng, các cột STT, SBD, họ tên, ngày sinh,
  lớp, môn thi, ghi chú. Phân loại môn lấy từ cấu hình đợt và phương án chính thức.
- Chưa xác nhận triển khai lên GitHub Pages hoặc thử in với dữ liệu production.
  Luồng thi tại lớp mới mô tả ở các mục trước chưa triển khai; mẫu hiện dùng
  phân phòng chính thức đang có, hiển thị “Chưa phân phòng” khi không có dữ liệu.

## 16. Phạm vi được phép ở lần ghi nhận này

Yêu cầu thao tác in đã bổ sung: In/lưu PDF sử dụng khung in ẩn ngay trong trang,
không mở tab/cửa sổ phụ. Vẫn hiển thị hộp thoại in hệ thống để chọn máy in hoặc
lưu PDF. Áp dụng cho biểu mẫu, danh sách xếp phòng và danh sách môn lựa chọn.

Các yêu cầu được lưu để triển khai theo từng phần. Ngày 2026-10-21 chủ dự án đã
yêu cầu triển khai ngay hai biểu mẫu ở mục 15; phần này đã sửa mã và kiểm thử.
Các chức năng khác không vì vậy được coi là đã hoàn thành. Xem
[project_status.md](./project_status.md) để biết trạng thái và giới hạn kiểm chứng.
