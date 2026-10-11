// تصنيف الحضور في الاجتماعات (مرتّب من الأهم)
export const ATTENDANCE_TYPES = {
  mandatory: { ar: "إلزامي", desc: "مطلوب حضورك", color: "#dc2626" },
  key: { ar: "أساسي", desc: "مشارك رئيسي", color: "#2563eb" },
  optional: { ar: "اختياري", desc: "الحضور عند الحاجة", color: "#64748b" },
};
export const DEFAULT_ATTENDANCE = "key";
export const attendanceOf = (m, name) => {
  const v = m?.attendance && typeof m.attendance === "object" ? m.attendance[name] : null;
  return ATTENDANCE_TYPES[v] ? v : DEFAULT_ATTENDANCE;
};
