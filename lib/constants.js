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

// الترجمات والألوان لكل حالة (لوحة ألوان موحّدة عبر النظام كله)
export const STATUS_META = {
  "Not Started": { ar: "لم تبدأ", color: "#64748b" },
  "In Progress": { ar: "قيد التنفيذ", color: "#2563eb" },
  "On Hold": { ar: "معلّقة", color: "#d97706" },
  Completed: { ar: "مكتملة", color: "#16a34a" },
};

export const PRIORITY_META = {
  High: { ar: "عالية", color: "#dc2626" },
  Medium: { ar: "متوسطة", color: "#d97706" },
  Low: { ar: "منخفضة", color: "#64748b" },
};

export const HEALTH_META = {
  "On Track": { ar: "سليمة", color: "#16a34a" },
  "At Risk": { ar: "معرّضة للتعثر", color: "#d97706" },
  Delayed: { ar: "متعثرة", color: "#dc2626" },
  Completed: { ar: "مكتملة", color: "#0d9488" },
};

export const APPROVAL_META = {
  "": { ar: "—", color: "#94a3b8" },
  "Pending Review": { ar: "بانتظار المراجعة", color: "#2563eb" },
  Approved: { ar: "معتمدة", color: "#16a34a" },
  "Revision needed": { ar: "تحتاج تعديل", color: "#d97706" },
  Rejected: { ar: "مرفوضة", color: "#dc2626" },
};

export function metaOf(map, key, fallbackAr) {
  return map[key] || { ar: fallbackAr ?? key ?? "—", color: "#94a3b8" };
}

// مساعدات المشروع — تدعم الصيغة الجديدة (مصفوفات) والقديمة (قيمة مفردة)
export const projManagers = (p) => (p?.managers?.length ? p.managers : p?.manager ? [p.manager] : []);
export const projClients = (p) => (p?.clients?.length ? p.clients : p?.client ? [p.client] : []);
export const projMembers = (p) => (Array.isArray(p?.members) ? p.members : []);
