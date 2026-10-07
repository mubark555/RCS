// القوائم الثابتة المستخدمة في النظام (مشتقة من ملف الإكسل الأصلي)

export const PRIORITIES = ["High", "Medium", "Low"];

// دورة العمل والاعتماد: جاهزية التسليم من ڤيوليت منفصلة عن اعتماد سيم
export const STATUSES = ["Not Started", "In Progress", "Pending Review", "Revision Needed", "Approved"];

// الحالات القديمة → الجديدة (للبيانات المحفوظة قبل تحديث دورة العمل)
// «معلّقة» لم تعد حالة مستقلة: تصبح «قيد التنفيذ» مع علامة تعليق (on_hold)
export function normalizeTask(t) {
  if (!t) return t;
  if (t.status === "Completed") return { ...t, status: "Approved", progress: t.progress ?? 100 };
  if (t.status === "On Hold") return { ...t, status: "In Progress", on_hold: true };
  return t;
}

// المهمة منتهية = معتمدة من سيم
export const isDone = (t) => t?.status === "Approved" || t?.status === "Completed";

// متأخرة = تجاوزت تاريخ الاستحقاق ولم تُعتمد بعد
export function isOverdue(t, today = new Date()) {
  if (!t?.due_date || isDone(t)) return false;
  const d = new Date(t.due_date);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return !isNaN(d) && d < t0;
}

// نسبة إنجاز المهمة: القيمة المُدخلة إن كانت أكبر من صفر، وإلا تقدير من الحالة.
// (عمود progress في قاعدة البيانات قيمته الافتراضية 0 للمهام القديمة، فالصفر = «لم تُحدَّد»)
export function taskProgress(t) {
  if (isDone(t)) return 100;
  const p = Math.round(Number(t?.progress));
  if (p > 0) return Math.min(100, p);
  return { "Pending Review": 90, "Revision Needed": 75, "In Progress": 40 }[t?.status] ?? 0;
}

export const HEALTHS = ["On Track", "At Risk", "Delayed", "Completed"];

export const APPROVALS = [
  "",
  "Pending Review",
  "Approved",
  "Revision needed",
  "Rejected",
];

// الجهة المطلوب منها الإجراء
export const WAITING_ON = ["سيم برايم", "ڤيوليت", "IT TEAM", "CONTENT"];

// ============ المالية ============
// طرفا العلاقة المالية: فيوليت (مزوّد الخدمة الذي يُصدر الفواتير) وسيم برايم (الجهة التي تدفع)
export const FINANCE_PROVIDER = "فيوليت";   // يُصدر الفواتير
export const FINANCE_PAYER = "سيم برايم";    // يدفع المقابل
export const CURRENCY = "ريال";

export const INVOICE_STATUSES = ["مسودة", "مُرسلة", "مدفوعة", "ملغاة"];
export const INVOICE_STATUS_META = {
  "مسودة":  { color: "#64748b", bg: "#eef2f7" },
  "مُرسلة": { color: "#2563eb", bg: "#eaf1fd" },
  "مدفوعة": { color: "#16a34a", bg: "#eaf6ef" },
  "ملغاة":  { color: "#e0574e", bg: "#fdeceb" },
};

export const PAYMENT_METHODS = ["تحويل بنكي", "شيك", "نقدي", "أخرى"];

// الحالة المحسوبة لفاتورة بناءً على المدفوعات وتاريخ الاستحقاق
// paid = مجموع مدفوعاتها؛ ترجع { key, label, color, bg }
export function invoiceState(inv, paid) {
  const amount = Number(inv?.amount) || 0;
  const p = Number(paid) || 0;
  if (inv?.status === "ملغاة") return { key: "cancelled", label: "ملغاة", color: "#e0574e", bg: "#fdeceb" };
  if (inv?.status === "مسودة") return { key: "draft", label: "مسودة", color: "#64748b", bg: "#eef2f7" };
  if (amount > 0 && p >= amount) return { key: "paid", label: "مدفوعة", color: "#16a34a", bg: "#eaf6ef" };
  if (p > 0 && p < amount) return { key: "partial", label: "مدفوعة جزئياً", color: "#c88a2e", bg: "#fbf0de" };
  const due = inv?.due_date ? new Date(inv.due_date) : null;
  if (due && !isNaN(due) && due < new Date(new Date().toDateString())) {
    return { key: "overdue", label: "متأخرة", color: "#e0574e", bg: "#fdeceb" };
  }
  return { key: "due", label: "مستحقة", color: "#2563eb", bg: "#eaf1fd" };
}

// المشاريع الحالية (يمكن إضافة غيرها من الواجهة)
export const PROJECTS = [
  "سيم برايم",
  "Homera",
  "ZL.Tours",
  "Jaz chocolate",
  "eat plus",
  "مزرعة قنيف",
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
  "Pending Review": { ar: "بانتظار مراجعة سيم", color: "#7c3aed" },
  "Revision Needed": { ar: "مطلوب تعديل", color: "#d97706" },
  Approved: { ar: "معتمدة", color: "#16a34a" },
  // حالات قديمة (للتوافق فقط)
  "On Hold": { ar: "معلّقة", color: "#d97706" },
  Completed: { ar: "معتمدة", color: "#16a34a" },
};

// قرارات سيم على التسليم
export const REVIEW_META = {
  approved: { ar: "اعتماد", past: "اعتُمدت", color: "#16a34a", bg: "#eaf6ef" },
  revision: { ar: "طلب تعديل", past: "طُلب تعديل", color: "#d97706", bg: "#fbf0de" },
  submitted: { ar: "إرسال للمراجعة", past: "أُرسلت للمراجعة", color: "#7c3aed", bg: "#f1ebfd" },
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

// رؤية المستهدف: عامة (تظهر للعملاء) أو خاصة (داخلية لا تظهر للعملاء)
export const VISIBILITIES = ["public", "private"];
export const VISIBILITY_META = {
  public: { ar: "عامة", desc: "تظهر للعملاء", color: "#16a34a", bg: "#eaf6ef" },
  private: { ar: "خاصة", desc: "داخلية — لا تظهر للعملاء", color: "#e0574e", bg: "#fdeceb" },
};
export const isPublicKpi = (k) => (k?.visibility || "private") === "public";

// مساعدات المشروع — تدعم الصيغة الجديدة (مصفوفات) والقديمة (قيمة مفردة)
export const projManagers = (p) => (p?.managers?.length ? p.managers : p?.manager ? [p.manager] : []);
export const projClients = (p) => (p?.clients?.length ? p.clients : p?.client ? [p.client] : []);
export const projMembers = (p) => (Array.isArray(p?.members) ? p.members : []);

// مشاريع المستخدم (للعميل) — تدعم الصيغة الجديدة (مصفوفة) والقديمة (قيمة مفردة)
export const userProjects = (u) => (u?.projects?.length ? u.projects : u?.project ? [u.project] : []);

// الموظفون المسؤولون عن المستهدف — يدعم الصيغة الجديدة (مصفوفة) والقديمة (قيمة مفردة)
export const kpiAssignees = (k) => (k?.assignees?.length ? k.assignees : k?.owner ? [k.owner] : []);

// مرفق مالي (فاتورة/إيصال سداد) — يظهر فقط لمن يملك صلاحية المالية
export const isFinanceFile = (f) => /^(invoice|payment):/.test(f?.ref || "") || f?.category === "مالية";
