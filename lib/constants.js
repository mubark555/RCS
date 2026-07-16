// القوائم الثابتة المستخدمة في النظام (مشتقة من ملف الإكسل الأصلي)

export const PRIORITIES = ["High", "Medium", "Low"];

export const STATUSES = ["Not Started", "In Progress", "On Hold", "Completed"];

export const HEALTHS = ["On Track", "At Risk", "Delayed", "Completed"];

export const APPROVALS = [
  "",
  "Pending Review",
  "Approved",
  "Revision needed",
  "Rejected",
];

export const WAITING_ON = ["VULET", "SEEM", "IT TEAM", "CONTENT"];

// المشاريع الحالية (يمكن إضافة غيرها من الواجهة)
export const PROJECTS = [
  "Seem prime",
  "Homera",
  "ZL.Tours",
  "Jaz chocolate",
  "eat plus",
];

// الأنشطة الشائعة (اقتراحات فقط، الحقل حرّ)
export const ACTIVITIES = [
  "Administration",
  "Operation",
  "Marketing",
  "Marketing Strategy",
  "Advertising Plan",
  "Social Media Plan",
  "Website Development",
  "Website Homera",
  "Branding",
  "Profile & Branding",
  "Packaging",
  "Corporate Profile",
  "Developments & Marketing",
  "Landing Page",
];

// الترجمات والألوان لكل حالة
export const STATUS_META = {
  "Not Started": { ar: "لم تبدأ", color: "#94a3b8" },
  "In Progress": { ar: "قيد التنفيذ", color: "#3b82f6" },
  "On Hold": { ar: "معلّقة", color: "#f59e0b" },
  Completed: { ar: "مكتملة", color: "#22c55e" },
};

export const PRIORITY_META = {
  High: { ar: "عالية", color: "#ef4444" },
  Medium: { ar: "متوسطة", color: "#f59e0b" },
  Low: { ar: "منخفضة", color: "#64748b" },
};

export const HEALTH_META = {
  "On Track": { ar: "سليمة", color: "#22c55e" },
  "At Risk": { ar: "معرّضة للتعثر", color: "#f59e0b" },
  Delayed: { ar: "متعثرة", color: "#ef4444" },
  Completed: { ar: "مكتملة", color: "#14b8a6" },
};

export const APPROVAL_META = {
  "": { ar: "—", color: "#94a3b8" },
  "Pending Review": { ar: "بانتظار المراجعة", color: "#3b82f6" },
  Approved: { ar: "معتمدة", color: "#22c55e" },
  "Revision needed": { ar: "تحتاج تعديل", color: "#f59e0b" },
  Rejected: { ar: "مرفوضة", color: "#ef4444" },
};

export function metaOf(map, key, fallbackAr) {
  return map[key] || { ar: fallbackAr ?? key ?? "—", color: "#94a3b8" };
}
