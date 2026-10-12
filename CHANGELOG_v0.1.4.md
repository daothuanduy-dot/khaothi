# CHANGELOG v0.1.4

## Fixed
- Khắc phục đọc CSV tiếng Việt sai mã hóa; hỗ trợ UTF-8, Windows-1258 fallback và BOM UTF-16.
- Nêu rõ `.xlsx` là định dạng nên dùng nếu tên tiếng Việt bị hỏng khi nhập CSV.

## Improved
- Phạm vi áp dụng môn: theo khối, theo lớp, chọn học sinh trong lớp, theo mã học sinh, hoặc từ file.
- Ẩn lựa chọn thứ tự ca đối với môn bắt buộc; chỉ môn lựa chọn mới cần ca 1/ca 2.

## Files
- Modified: `index.html`, `js/app.js`
- Added: `docs/README_v0.1.4.md`, `CHANGELOG_v0.1.4.md`
- Unchanged: `css/app.css`, `js/rooming.js`, all SQL migrations.

## Validation
- JavaScript syntax check passed.
- No SQL migration required.
- Not yet end-to-end tested against the user's live Supabase project.
