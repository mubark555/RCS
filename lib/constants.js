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

// ============ سلسلة تمرير/اعتماد المهمة (Workflow) ============
// نوع الخطوة: عمل (مشارك في التنفيذ) أو اعتماد (مراجعة/توقيع)
export const CHAIN_TYPE_META = {
  work: { ar: "عمل", color: "#2563eb", soft: "#e8f0fe" },
  approve: { ar: "اعتماد", color: "#16a34a", soft: "#e6f5ec" },
};

// الإجراءات المتاحة لكل نوع خطوة
export const CHAIN_ACTIONS = {
  work: ["تنفيذ", "تجهيز", "مشاركة", "تعديل"],
  approve: ["مراجعة", "اعتماد", "توقيع"],
};

// حالة كل خطوة: pending (بالانتظار) | done (منجزة) | approved (معتمدة) | rejected (مرفوضة)
export function normalizeChain(chain) {
  return Array.isArray(chain) ? chain.filter((s) => s && s.person) : [];
}

// أول خطوة لم تُنجَز بعد = الشخص الذي عليه الدور حالياً
export function chainHolder(chain) {
  const c = normalizeChain(chain);
  const step = c.find((s) => s.status !== "done" && s.status !== "approved");
  return step && step.status !== "rejected" ? step.person : null;
}

// تقدّم السلسلة
export function chainProgress(chain) {
  const c = normalizeChain(chain);
  if (!c.length) return null;
  const done = c.filter((s) => s.status === "done" || s.status === "approved").length;
  const rejected = c.some((s) => s.status === "rejected");
  return { done, total: c.length, rejected, complete: done === c.length && !rejected };
}

// مساعدات المشروع — تدعم الصيغة الجديدة (مصفوفات) والقديمة (قيمة مفردة)
export const projManagers = (p) => (p?.managers?.length ? p.managers : p?.manager ? [p.manager] : []);
export const projClients = (p) => (p?.clients?.length ? p.clients : p?.client ? [p.client] : []);
export const projMembers = (p) => (Array.isArray(p?.members) ? p.members : []);
