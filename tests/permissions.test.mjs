import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccess, canSeeTask, canSeeMeeting, canSeeFile, DEFAULT_ROLES } from "../lib/permissions.mjs";
import { availableActions } from "../lib/workflow.mjs";

const projects = [
  { name: "Homera", ops_managers: ["مدير تشغيل أ"], managers: ["لجين"], members: ["عهود"], clients: ["عميل هوميرا"], unit_id: "u-dev" },
  { name: "ZL.Tours", ops_managers: ["مدير تشغيل ب"], managers: ["وجد"], members: [], clients: [], unit_id: "u-mkt" },
  { name: "Jaz chocolate", managers: [], members: [], clients: [], unit_id: "u-mkt" },
];
const units = [{ id: "u-mkt", name: "التسويق", managers: ["مدير وحدة التسويق"] }];
const ctx = { roles: DEFAULT_ROLES, projects, units };
const U = (id, name, role, extra = {}) => ({ id, name, role, ...extra });
const opsA = U("a", "مدير تشغيل أ", "ops_manager");
const opsB = U("b", "مدير تشغيل ب", "ops_manager");
const ohood = U("o", "عهود", "member");
const unitMgr = U("m", "مدير وحدة التسويق", "unit_manager");
const exec = U("e", "تنفيذي", "executive");
const admin = U("x", "مدير النظام", "manager");
const client = U("c", "عميل هوميرا", "client");
const loner = U("l", "موظف بلا مشاريع", "member");
const acc = (u) => buildAccess(u, ctx);
const withAccess = (u) => ({ ...u, access: acc(u) });

test("مدير التشغيل يرى مشاريعه فقط", () => {
  assert.deepEqual(acc(opsA).visibleProjects, ["Homera"]);
  assert.deepEqual(acc(opsB).visibleProjects, ["ZL.Tours"]);
  assert.ok(!acc(opsA).canSeeProject("ZL.Tours"));
  assert.ok(!acc(opsA).can("task.edit", "ZL.Tours"));
  assert.ok(acc(opsA).can("task.edit", "Homera"));
});

test("مدير الوحدة يرى مشاريع وحدته فقط", () => {
  assert.deepEqual(acc(unitMgr).visibleProjects.sort(), ["Jaz chocolate", "ZL.Tours"]);
  assert.ok(!acc(unitMgr).canSeeProject("Homera"));
});

test("الإدارة العليا ومدير النظام يرون الكل", () => {
  assert.equal(acc(exec).visibleProjects, null);
  assert.ok(acc(exec).canSeeProject("أي مشروع"));
  assert.ok(acc(admin).can("users.manage"));
  assert.ok(!acc(exec).can("users.manage"));
  assert.ok(!acc(exec).can("page.team"));
});

test("الموظف بلا مشاريع لا يرى أي مشروع (أُلغي الرجوع لرؤية الكل)", () => {
  assert.deepEqual(acc(loner).visibleProjects, []);
});

test("الموظف لا يرى صفحات الإدارة", () => {
  for (const p of ["page.team", "page.settings", "page.access", "page.audit", "page.kpis", "page.overview"]) {
    assert.ok(!acc(ohood).can(p), p);
  }
  assert.ok(acc(ohood).can("page.tasks"));
});

test("دور المشروع يمنح صلاحيات داخل المشروع فقط", () => {
  const lujain = U("j", "لجين", "member");
  assert.ok(acc(lujain).can("task.delete", "Homera"), "مدير المشروع يحذف داخل مشروعه");
  assert.ok(!acc(lujain).can("task.delete", "ZL.Tours"));
  assert.ok(!acc(ohood).can("task.delete", "Homera"), "العضو لا يحذف");
});

test("العميل: اطلاع فقط", () => {
  const a = acc(client);
  assert.deepEqual(a.visibleProjects, ["Homera"]);
  assert.ok(!a.can("task.create", "Homera"));
  assert.ok(!a.canAny("task.create"));
  assert.ok(a.can("page.tasks"));
});

test("نطاق المهام والاجتماعات والملفات", () => {
  const t = { project: "ZL.Tours", assignee_id: null, assigned_to: "" };
  assert.ok(!canSeeTask(t, acc(opsA), opsA));
  assert.ok(canSeeTask({ ...t, reviewer_id: opsA.id }, acc(opsA), opsA), "يرى المهمة إن كان طرفاً فيها");
  assert.ok(canSeeTask({ ...t, assigned_to: "Ohood (IT)" }, acc({ ...ohood, aliases: ["Ohood"] }), { ...ohood, aliases: ["Ohood"] }));
  const m = { project: "ZL.Tours", attendees: ["عهود"] };
  assert.ok(canSeeMeeting(m, acc(ohood), ohood), "المدعو يرى الاجتماع");
  assert.ok(!canSeeMeeting({ ...m, attendees: [] }, acc(ohood), ohood));
  assert.ok(!canSeeFile({ project: "ZL.Tours" }, acc(opsA)));
  assert.ok(canSeeFile({ project: "Homera" }, acc(opsA)));
  assert.ok(!canSeeFile({ project: "" }, acc(opsA)), "الملفات بلا مشروع للإدارة فقط");
});

test("المراجعة لا تمنح الاعتماد النهائي", () => {
  const t = { id: "t", project: "Homera", assignee_id: ohood.id, workflow: "full", stage: "in_review" };
  const a = withAccess(opsA);
  assert.ok(availableActions(t, a).some((x) => x.action === "accept"), "مدير التشغيل يراجع في مشروعه");
  assert.deepEqual(availableActions({ ...t, stage: "pending_final" }, a), [], "لكنه لا يعتمد نهائياً");
  assert.ok(availableActions({ ...t, stage: "pending_final" }, withAccess(exec)).some((x) => x.action === "accept"));
  assert.deepEqual(availableActions({ ...t, project: "ZL.Tours" }, a), [], "ولا يراجع في مشروع آخر");
});

test("الأدوار الافتراضية في ترحيل SQL مطابقة لـ lib/permissions.mjs", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../supabase/migrations/002_permissions_scoping.sql", import.meta.url), "utf8");
  for (const r of DEFAULT_ROLES) {
    const m = sql.match(new RegExp(`\\('${r.key}', '[^']*', '[^']*', '(\\[[^']*\\])'::jsonb`));
    assert.ok(m, `الدور ${r.key} موجود في الترحيل`);
    assert.deepEqual(JSON.parse(m[1]), r.permissions, `صلاحيات ${r.key}`);
  }
  const { PROJECT_ROLE_PERMS } = await import("../lib/permissions.mjs");
  const arr = sql.match(/p_perm = any\(array\[([^\]]*)\]\)/)[1].split(",").map((x) => x.trim().replace(/'/g, ""));
  assert.deepEqual(arr, PROJECT_ROLE_PERMS.manager);
});
