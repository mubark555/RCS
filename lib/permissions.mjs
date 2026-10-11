// نظام الصلاحيات — منطق نقي بلا اعتماديات.
// نفس القواعد مطبّقة في قاعدة البيانات (supabase/migrations/002_permissions_scoping.sql):
// has_perm / can_see_project / can_see_task — أي تعديل هنا يجب أن ينعكس هناك.

import { nameMatchesUser } from "./workflow.mjs";

// ---------------- كتالوج الصلاحيات ----------------
export const PERMISSION_GROUPS = [
  {
    key: "pages", ar: "الصفحات",
    items: [
      ["page.overview", "لوحة القيادة"],
      ["page.tasks", "المهام"],
      ["page.projects", "المشاريع"],
      ["page.meetings", "الاجتماعات"],
      ["page.archive", "الأرشيف"],
      ["page.kpis", "الأداء والمستهدفات"],
      ["page.team", "الفريق"],
      ["page.audit", "سجل الإجراءات"],
      ["page.settings", "تخصيص النظام"],
      ["page.access", "الصلاحيات والوحدات"],
    ],
  },
  {
    key: "data", ar: "نطاق البيانات",
    items: [["scope.all_projects", "الاطلاع على جميع المشاريع (وإلا: المشاريع المسندة إليه ووحدته فقط)"]],
  },
  {
    key: "tasks", ar: "المهام",
    items: [
      ["task.create", "إنشاء مهمة"],
      ["task.edit", "تعديل بيانات المهام"],
      ["task.delete", "حذف مهمة"],
      ["task.assign", "إسناد المهام وتحديد مسار الاعتماد"],
      ["task.review_any", "المراجعة والموافقة عند عدم تحديد شخص"],
      ["task.final_approve", "الاعتماد النهائي عند عدم تحديد شخص"],
      ["task.reopen", "إعادة فتح المهام المغلقة"],
    ],
  },
  {
    key: "meetings", ar: "الاجتماعات والملفات",
    items: [
      ["meeting.create", "إنشاء اجتماع"],
      ["meeting.edit", "تعديل الاجتماعات والمحاضر"],
      ["meeting.delete", "حذف اجتماع"],
      ["file.upload", "رفع ملفات وروابط"],
      ["file.delete", "حذف ملفات"],
    ],
  },
  {
    key: "admin", ar: "الإدارة",
    items: [
      ["project.create", "إنشاء مشروع"],
      ["project.edit", "تعديل المشاريع وفرقها"],
      ["project.delete", "حذف مشروع"],
      ["users.manage", "إدارة المستخدمين"],
      ["roles.manage", "إدارة الأدوار والصلاحيات"],
      ["units.manage", "إدارة الوحدات"],
      ["settings.manage", "تخصيص النظام"],
    ],
  },
  {
    key: "reports", ar: "التقارير",
    items: [
      ["report.overview", "مؤشرات لوحة القيادة"],
      ["report.kpis", "مؤشرات الأداء والمستهدفات"],
      ["kpi.edit", "تعديل مؤشرات الأداء"],
      ["report.audit", "سجل الإجراءات"],
      ["report.export", "تصدير التقارير والمحاضر"],
    ],
  },
];
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map(([k]) => k));
export const PERMISSION_AR = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.items));

// ---------------- الأدوار الافتراضية (قابلة للتعديل من صفحة الصلاحيات) ----------------
const P = (...keys) => keys;
const STAFF_PAGES = P("page.tasks", "page.projects", "page.meetings", "page.archive");
export const DEFAULT_ROLES = [
  {
    key: "manager", name: "مدير النظام", system: true,
    description: "صلاحيات كاملة — يُنصح بقصره على شخص أو اثنين",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "executive", name: "الإدارة العليا",
    description: "اطلاع على كل المشاريع والتقارير مع الاعتماد النهائي، دون إدارة النظام",
    permissions: P(...STAFF_PAGES, "page.overview", "page.kpis", "page.audit", "scope.all_projects",
      "task.create", "task.edit", "task.assign", "task.review_any", "task.final_approve", "task.reopen",
      "meeting.create", "meeting.edit", "file.upload",
      "report.overview", "report.kpis", "report.audit", "report.export"),
  },
  {
    key: "ops_manager", name: "مدير تشغيل",
    description: "يدير المشاريع المسندة إليه فقط",
    permissions: P(...STAFF_PAGES, "page.overview",
      "task.create", "task.edit", "task.delete", "task.assign", "task.review_any", "task.reopen",
      "meeting.create", "meeting.edit", "meeting.delete", "file.upload", "file.delete",
      "report.overview", "report.export"),
  },
  {
    key: "unit_manager", name: "مدير وحدة",
    description: "يرى أعمال وحدته ويديرها",
    permissions: P(...STAFF_PAGES, "page.overview",
      "task.create", "task.edit", "task.assign", "task.review_any", "task.reopen",
      "meeting.create", "meeting.edit", "file.upload", "report.overview", "report.export"),
  },
  {
    key: "member", name: "موظف", system: true,
    description: "يرى مشاريعه ومهامه وينفّذها",
    permissions: P(...STAFF_PAGES, "task.create", "task.edit", "meeting.create", "meeting.edit", "file.upload", "report.export"),
  },
  {
    key: "client", name: "عميل", system: true,
    description: "اطلاع فقط على مشروعه",
    permissions: P("page.tasks", "page.projects", "page.meetings", "report.export"),
  },
];

// الأدوار داخل المشروع (من فريق المشروع) تمنح صلاحيات إضافية داخل ذلك المشروع فقط
export const PROJECT_ROLES = {
  ops_manager: { ar: "مدير تشغيل المشروع", field: "ops_managers" },
  manager: { ar: "مدير المشروع", field: "managers" },
  member: { ar: "عضو", field: "members" },
  client: { ar: "عميل", field: "clients" },
};
const MANAGE_IN_PROJECT = ["task.create", "task.edit", "task.delete", "task.assign", "task.review_any", "task.reopen",
  "meeting.create", "meeting.edit", "meeting.delete", "file.upload", "file.delete"];
export const PROJECT_ROLE_PERMS = {
  ops_manager: MANAGE_IN_PROJECT,
  manager: MANAGE_IN_PROJECT,
  member: [],
  client: [],
};

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
export const projectField = (p, field) => {
  if (field === "managers") return arr(p?.managers?.length ? p.managers : p?.manager);
  if (field === "clients") return arr(p?.clients?.length ? p.clients : p?.client);
  return arr(p?.[field]);
};

// دور المستخدم في مشروع (الأعلى إن تعدد)
export function projectRoleOf(user, project) {
  if (!user || !project) return null;
  for (const r of ["ops_manager", "manager", "member", "client"]) {
    if (projectField(project, PROJECT_ROLES[r].field).some((n) => nameMatchesUser(n, user))) return r;
  }
  return null;
}

export function roleOf(user, roles) {
  const key = user?.role;
  return (roles || []).find((r) => r.key === key) || DEFAULT_ROLES.find((r) => r.key === key) || null;
}

// ---------------- بناء صلاحيات المستخدم الفعلية ----------------
export function buildAccess(user, { roles = [], projects = [], units = [] } = {}) {
  const role = roleOf(user, roles);
  const perms = new Set(user ? role?.permissions || [] : []);
  const allProjects = perms.has("scope.all_projects");
  const myUnits = new Set(units.filter((u) => arr(u.managers).some((n) => nameMatchesUser(n, user))).map((u) => u.id));
  const projectRoles = {};
  const visible = new Set();
  for (const p of projects) {
    const r = projectRoleOf(user, p);
    if (r) projectRoles[p.name] = r;
    if (allProjects || r || (p.unit_id && myUnits.has(p.unit_id))) visible.add(p.name);
  }

  const canSeeProject = (name) => allProjects || visible.has(name);
  // الصلاحية العامة تسري داخل نطاق المستخدم؛ ودوره في المشروع يضيف صلاحيات لذلك المشروع فقط.
  // العميل لا يحصل على صلاحيات تنفيذ حتى لو كان دوره العام يسمح.
  function can(perm, projectName) {
    if (!user) return false;
    if (projectName === undefined || projectName === null || projectName === "") return perms.has(perm);
    const pr = projectRoles[projectName];
    if (pr === "client") return perms.has(perm) && perm.startsWith("page.");
    if (perms.has(perm) && canSeeProject(projectName)) return true;
    return Boolean(pr && PROJECT_ROLE_PERMS[pr].includes(perm));
  }
  // هل يملك الصلاحية في أي مشروع (لإظهار زر «إنشاء» مثلاً)
  const canAny = (perm) => perms.has(perm) || Object.values(projectRoles).some((r) => PROJECT_ROLE_PERMS[r].includes(perm));

  return {
    role,
    perms,
    allProjects,
    projectRoles,
    myUnits,
    visibleProjects: allProjects ? null : [...visible],
    canSeeProject,
    can,
    canAny,
  };
}

// ---------------- نطاق البيانات ----------------
// المهمة: ضمن مشروع مرئي، أو المستخدم طرف فيها (منفذ/مراجع/معتمد/منشئ)
export function isInvolved(t, user) {
  if (!user) return false;
  if ([t.assignee_id, t.reviewer_id, t.approver_id, t.final_approver_id, t.created_by].includes(user.id)) return true;
  return !t.assignee_id && nameMatchesUser(t.assigned_to, user);
}

export function canSeeTask(t, access, user) {
  return access.canSeeProject(t.project) || isInvolved(t, user);
}

export function canSeeMeeting(m, access, user) {
  if (access.allProjects) return true;
  if (m.project && access.canSeeProject(m.project)) return true;
  const att = Array.isArray(m.attendees) ? m.attendees : [];
  return att.some((n) => nameMatchesUser(n, user)) || nameMatchesUser(m.organizer, user);
}

export function canSeeFile(f, access) {
  return access.allProjects || (Boolean(f.project) && access.canSeeProject(f.project));
}
