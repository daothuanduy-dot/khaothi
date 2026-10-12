/*
 * Patch v0.1.3 — chuẩn hóa ngày sinh trước khi gửi lên Supabase.
 * Thêm hàm này vào js/app.js trước async function importCsv(...).
 */
function normalizeDateForSupabase(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const s = String(value).trim();

  // ISO date or ISO timestamp: keep only YYYY-MM-DD.
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (isValidYMD(y, mo, d)) return `${String(y).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    throw new Error(`Ngày sinh không hợp lệ: "${s}".`);
  }

  // Vietnamese common format dd/MM/yyyy or dd-MM-yyyy.
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    if (isValidYMD(y, mo, d)) return `${String(y).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    throw new Error(`Ngày sinh không hợp lệ: "${s}". Dùng dd/MM/yyyy hoặc yyyy-MM-dd.`);
  }

  throw new Error(`Không đọc được ngày sinh "${s}". Hãy dùng dd/MM/yyyy hoặc yyyy-MM-dd.`);
}

function isValidYMD(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/*
 * Trong importCsv(), đổi thuộc tính:
 *   date_of_birth:r.date_of_birth||null,
 * thành:
 *   date_of_birth:normalizeDateForSupabase(r.date_of_birth),
 *
 * Nếu muốn báo lỗi rõ theo dòng, nên chuẩn hóa trong try/catch theo từng dòng
 * trước khi upsert để người dùng biết dòng nào có ngày sinh sai.
 */
