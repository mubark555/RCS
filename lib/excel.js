// قراءة الأسماء من ملف Excel داخل المتصفح عبر مكتبة SheetJS.
import * as XLSX from "xlsx";

// تحويل حرف العمود (A, B, ...) إلى فهرس يبدأ من صفر.
function columnLetterToIndex(letter) {
  let idx = 0;
  const up = String(letter).trim().toUpperCase();
  for (let i = 0; i < up.length; i++) {
    idx = idx * 26 + (up.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/**
 * يقرأ الأسماء من ملف Excel.
 * @param {ArrayBuffer} buffer محتوى ملف Excel
 * @param {object} opts { column, sheet, hasHeader }
 *   column: حرف مثل "A" أو رقم مثل "1" (الافتراضي أول عمود)
 *   sheet: اسم الورقة (الافتراضي أول ورقة)
 *   hasHeader: تجاهُل الصف الأول
 * @returns {string[]} قائمة الأسماء
 */
export function readNames(buffer, opts = {}) {
  const { column, sheet, hasHeader } = opts;
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = sheet && wb.Sheets[sheet] ? sheet : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("تعذّر قراءة الورقة من ملف Excel.");

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

  let colIdx = 0;
  if (column) {
    const c = String(column).trim();
    colIdx = /^\d+$/.test(c) ? parseInt(c, 10) - 1 : columnLetterToIndex(c);
  }
  if (colIdx < 0) colIdx = 0;

  const names = [];
  rows.forEach((row, i) => {
    if (hasHeader && i === 0) return;
    const value = row[colIdx];
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (text) names.push(text);
  });
  return names;
}

// أسماء الأوراق داخل الملف (لعرضها في الواجهة إن رغبنا).
export function listSheets(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames;
}
