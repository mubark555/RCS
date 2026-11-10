// الحضور التلقائي اليومي: يُسجَّل حضور هؤلاء الموظفين كل يوم الساعة 9:00 ص (بتوقيت الرياض)
// ويصلهم إشعار بذلك. التسجيل يظهر في «سجل الأنشطة» موسوماً بـ «حضور تلقائي» حتى يتميّز عن الدخول الفعلي.
export const AUTO_ATTENDANCE = ["فاطمة السيد", "لجين احمد", "نورة احمد", "وجد جندلي", "أمل فضل", "حسن حمدي"];
export const AUTO_ATTENDANCE_HOUR = 9; // بتوقيت الرياض (UTC+3)
export const AUTO_DEVICE = "حضور تلقائي 9:00 ص";

// توحيد الأسماء: التشكيل والهمزات والتاء المربوطة والمسافات
export const normName = (n) => String(n || "")
  .replace(/[ً-ْ]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ة/g, "ه")
  .replace(/\s+/g, " ")
  .trim();

// هل المستخدم ضمن القائمة؟ (بالاسم أو أي اسم بديل، ويُقبل لقب قبل الاسم مثل «أ. حسن حمدي»)
export function matchesList(user, list) {
  if (!user) return false;
  const names = [user.name, ...(Array.isArray(user.aliases) ? user.aliases : [])].map(normName).filter(Boolean);
  return list.some((a) => { const x = normName(a); return names.some((n) => n === x || n.endsWith(" " + x)); });
}

// بداية الدوام اليوم 9:00 بتوقيت الرياض كـ ISO
export function todayAt9(now = new Date()) {
  const riyadh = new Date(now.getTime() + 3 * 3600_000);
  const d = Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate(), AUTO_ATTENDANCE_HOUR - 3, 0, 0);
  return new Date(d).toISOString();
}
