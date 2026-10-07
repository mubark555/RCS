// مصفوفة الصلاحيات الموحّدة: لكل مستخدم ولكل قسم مستوى (بلا / اطلاع / تعديل)
// + صلاحيات خاصة (اعتماد التسليمات، إرسال التسليمات، اعتماد الإجازات…).
// القيم الافتراضية تأتي من الدور (مدير/عضو/عميل)، ويمكن تخصيص أي شخص على حدة.
// تُحفظ في app_settings بالمفتاح "permissions" على شكل { [userId]: { sections: {}, abilities: {} } }.

export const LEVELS = [
  { key: "none", ar: "بلا", desc: "لا يظهر القسم" },
  { key: "view", ar: "اطلاع", desc: "يرى فقط" },
  { key: "edit", ar: "تعديل", desc: "يرى ويضيف ويعدّل" },
];
const RANK = { none: 0, view: 1, edit: 2 };

// الأقسام بنفس ترتيب القائمة الجانبية
export const SECTIONS = [
  { key: "dashboard", ar: "الرئيسية", href: "/", ico: "home", viewOnly: true },
  { key: "tasks", ar: "المهام", href: "/tasks", ico: "tasks" },
  { key: "projects", ar: "المشاريع", href: "/projects", ico: "projects" },
  { key: "approvals", ar: "الاعتمادات", href: "/approvals", ico: "check", viewOnly: true },
  { key: "kpis", ar: "الأداء والمستهدفات", href: "/kpis", ico: "chart" },
  { key: "reports", ar: "التقارير", href: "/reports", ico: "file", viewOnly: true },
  { key: "finance", ar: "المالية", href: "/finance", ico: "briefcase" },
  { key: "meetings", ar: "الاجتماعات", href: "/meetings", ico: "calendar" },
  { key: "calendar", ar: "الروزنامة السنوية", href: "/calendar", ico: "flag" },
  { key: "leaves", ar: "الإجازات", href: "/leaves", ico: "sun" },
  { key: "archive", ar: "الأرشيف", href: "/archive", ico: "folder", nav: false },
  { key: "activity", ar: "سجل الأنشطة", href: "/activity", ico: "clock", viewOnly: true },
  { key: "team", ar: "الفريق", href: "/team", ico: "users" },
  { key: "settings", ar: "تخصيص النظام", href: "/settings", ico: "settings" },
];

// صلاحيات خاصة (مفتاح تشغيل/إيقاف)
export const ABILITIES = [
  { key: "approve", ar: "اعتماد التسليمات وطلب التعديل", desc: "قرار سيم على الأعمال المسلّمة" },
  { key: "deliver", ar: "إرسال التسليمات للمراجعة", desc: "تسليم العمل من فريق ڤيوليت" },
  { key: "approveLeaves", ar: "اعتماد طلبات الإجازة", desc: "قبول أو رفض إجازات الفريق" },
  { key: "approveMinutes", ar: "اعتماد محاضر الاجتماعات", desc: "اعتماد المحضر وإرساله للحضور" },
  { key: "permissions", ar: "إدارة الصلاحيات", desc: "تعديل صلاحيات الآخرين" },
];

const ALL = (lvl) => Object.fromEntries(SECTIONS.map((s) => [s.key, lvl]));

export const ROLE_DEFAULTS = {
  manager: {
    sections: ALL("edit"),
    abilities: { approve: true, deliver: true, approveLeaves: true, approveMinutes: true, permissions: true },
  },
  member: {
    sections: {
      ...ALL("view"),
      tasks: "edit", meetings: "edit", leaves: "edit", archive: "edit",
      finance: "none", settings: "none",
    },
    abilities: { approve: false, deliver: true, approveLeaves: false, approveMinutes: false, permissions: false },
  },
  client: {
    sections: {
      ...ALL("none"),
      dashboard: "view", tasks: "view", projects: "view", approvals: "view",
      meetings: "view", calendar: "view", archive: "view",
    },
    abilities: { approve: true, deliver: false, approveLeaves: false, approveMinutes: false, permissions: false },
  },
};

// الصلاحيات الفعلية لمستخدم = افتراضي الدور + تخصيصه
// legacyFinance: { users: [], editors: [] } من الإعداد القديم (صلاحية المالية)
export function resolvePerms(user, overrides, legacyFinance) {
  const role = user?.role || "member";
  const base = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.member;
  const sections = { ...base.sections };
  const abilities = { ...base.abilities };
  const id = user?.id;
  if (id && legacyFinance && role !== "manager") {
    if ((legacyFinance.editors || []).includes(id)) sections.finance = "edit";
    else if ((legacyFinance.users || []).includes(id)) sections.finance = "view";
  }
  const o = (id && overrides && overrides[id]) || null;
  if (o) {
    Object.entries(o.sections || {}).forEach(([k, v]) => { if (RANK[v] != null) sections[k] = v; });
    Object.entries(o.abilities || {}).forEach(([k, v]) => { abilities[k] = !!v; });
  }
  // أقسام للاطلاع فقط: «تعديل» = «اطلاع»
  SECTIONS.forEach((s) => { if (s.viewOnly && sections[s.key] === "edit") sections[s.key] = "view"; });
  return { sections, abilities };
}

export const atLeast = (lvl, need) => (RANK[lvl] ?? 0) >= (RANK[need] ?? 0);

// القسم المقابل لمسار الصفحة
export function sectionOfPath(path) {
  if (!path || path === "/") return "dashboard";
  const s = SECTIONS.find((x) => x.href !== "/" && path.startsWith(x.href));
  return s ? s.key : null;
}
