// تكرار الاجتماعات: توليد مواعيد السلسلة انطلاقاً من الموعد الأول.
// كل موعد يُحفظ كاجتماع مستقل يحمل نفس series_id، ليكون لكل موعد محضره وحالته.

export const RECURRENCE_OPTIONS = [
  { value: "none", label: "بدون تكرار" },
  { value: "daily", label: "يومياً" },
  { value: "weekdays", label: "أيام العمل (الأحد – الخميس)" },
  { value: "weekly", label: "أسبوعياً" },
  { value: "biweekly", label: "كل أسبوعين" },
  { value: "monthly", label: "شهرياً" },
];

export const RECURRENCE_LABEL = Object.fromEntries(RECURRENCE_OPTIONS.map((o) => [o.value, o.label]));

export const MAX_OCCURRENCES = 365;

// يضيف أشهراً مع تثبيت اليوم الأصلي، وإن لم يوجد في الشهر (مثل 31) يُؤخذ آخر يوم فيه
function addMonths(base, n, day) {
  const d = new Date(base);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

/**
 * @param {string} startISO  موعد أول اجتماع
 * @param {{freq:string, endType:"count"|"until", count:number, until:string}} rule
 * @returns {string[]} مواعيد ISO مرتبة (أولها الموعد الأول)
 */
export function generateOccurrences(startISO, rule) {
  const start = new Date(startISO);
  if (!rule || rule.freq === "none" || isNaN(start)) return [startISO];

  const byCount = rule.endType !== "until";
  const count = Math.min(Math.max(Number(rule.count) || 1, 1), MAX_OCCURRENCES);
  // تاريخ الانتهاء شامل لليوم كاملاً بالتوقيت المحلي
  const until = !byCount && rule.until ? new Date(`${rule.until}T23:59:59`) : null;
  if (!byCount && (!until || isNaN(until))) return [startISO];

  const out = [];
  const day = start.getDate();
  for (let i = 0; out.length < MAX_OCCURRENCES && i < MAX_OCCURRENCES * 2; i++) {
    let d;
    switch (rule.freq) {
      case "daily":
      case "weekdays":
        d = new Date(start); d.setDate(start.getDate() + i); break;
      case "weekly":
        d = new Date(start); d.setDate(start.getDate() + i * 7); break;
      case "biweekly":
        d = new Date(start); d.setDate(start.getDate() + i * 14); break;
      case "monthly":
        d = addMonths(start, i, day); break;
      default:
        return [startISO];
    }
    if (until && d > until) break;
    // أيام العمل في السعودية: الأحد(0) إلى الخميس(4) — نتخطى الجمعة والسبت
    if (rule.freq === "weekdays" && (d.getDay() === 5 || d.getDay() === 6)) continue;
    out.push(d.toISOString());
    if (byCount && out.length >= count) break;
  }
  return out.length ? out : [startISO];
}

// وصف مختصر للقاعدة يُعرض على بطاقة الاجتماع
export function describeRule(m) {
  if (!m?.recurrence || m.recurrence === "none") return "";
  return RECURRENCE_LABEL[m.recurrence] || "";
}

