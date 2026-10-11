import { test } from "node:test";
import assert from "node:assert/strict";
import { forTaskEvent, forMeeting, dueAlerts, wants } from "../lib/notify.mjs";
import { managementReport, toCSV } from "../lib/reports.mjs";
import { applyAction } from "../lib/workflow.mjs";

const anwar = { id: "a", name: "أنور", role: "member" };
const rev = { id: "r", name: "مراجع", role: "member" };
const boss = { id: "b", name: "مدير", role: "manager" };
const boss2 = { id: "b2", name: "مدير2", role: "manager" };
const users = [anwar, rev, boss, boss2];
const T = (o = {}) => ({ id: "t1", task: "تصميم", project: "Homera", assignee_id: "a", workflow: "full", reviewer_id: "r", stage: "not_started", ...o });
const step = (t, action, actor, note) => ({ ...t, ...applyAction(t, action, actor, note).patch });

test("إسناد مهمة جديدة يُبلغ المنفذ ولا يُبلغ المنشئ نفسه", () => {
  const n = forTaskEvent({ before: null, after: T(), actor: boss, users });
  assert.deepEqual(n.map((x) => [x.user_id, x.kind]), [["a", "task_assigned"]]);
  assert.equal(n[0].link, "/?task=t1");
  assert.deepEqual(forTaskEvent({ before: null, after: T(), actor: anwar, users }), []);
});

test("قرار اجتماع يُبلَّغ كتكليف من اجتماع", () => {
  const n = forTaskEvent({ before: null, after: T({ meeting_id: "m1" }), actor: boss, users });
  assert.equal(n[0].kind, "meeting_decision");
});

test("وصول المهمة للمراجعة ثم الموافقة ثم الإعادة والإغلاق", () => {
  const t0 = T({ stage: "in_progress" });
  const t1 = step(t0, "submit", anwar);
  assert.deepEqual(forTaskEvent({ before: t0, after: t1, actor: anwar, users }).map((x) => [x.user_id, x.kind]), [["r", "review_requested"]]);
  const t2 = step(t1, "request_changes", rev, "المقاس");
  const back = forTaskEvent({ before: t1, after: t2, actor: rev, users });
  assert.deepEqual(back.map((x) => [x.user_id, x.kind]), [["a", "changes_requested"]]);
  assert.equal(back[0].body, "المقاس");
  // الموافقة بلا شخص محدد: تُبلَّغ الإدارة (كل من يحق له)، لا المنفذ
  const t3 = step(step(t2, "submit", anwar), "accept", rev);
  const appr = forTaskEvent({ before: step(t2, "submit", anwar), after: t3, actor: rev, users });
  assert.deepEqual(appr.map((x) => x.user_id).sort(), ["b", "b2"]);
  assert.ok(appr.every((x) => x.kind === "approval_requested"));
  const t5 = step(step(t3, "accept", boss), "accept", boss2);
  const closed = forTaskEvent({ before: step(t3, "accept", boss), after: t5, actor: boss2, users });
  assert.deepEqual(closed.map((x) => [x.user_id, x.kind]), [["a", "task_closed"]]);
});

test("تفضيلات الإشعارات تُحترم", () => {
  const quiet = { ...anwar, notify_prefs: { task_assigned: false } };
  assert.deepEqual(forTaskEvent({ before: null, after: T(), actor: boss, users: [quiet, boss] }), []);
  assert.equal(wants(anwar, "meeting_optional"), false);
  assert.equal(wants({ notify_prefs: { meeting_optional: true } }, "meeting_optional"), true);
});

test("دعوات الاجتماع: إلزامي/أساسي افتراضياً، الاختياري معطّل، ورفع التصنيف لإلزامي يُبلَّغ", () => {
  const m = { id: "m1", title: "إطلاق", start_at: "2030-01-01T10:00:00Z", attendees: ["أنور", "مراجع", "مدير"], attendance: { "أنور": "mandatory", "مراجع": "optional", "مدير": "key" } };
  const n = forMeeting({ before: null, after: m, actor: boss, users });
  assert.deepEqual(n.map((x) => [x.user_id, x.kind]), [["a", "meeting_invite"]]);
  assert.ok(n[0].title.includes("إلزامي"));
  assert.equal(n[0].link, "/meetings?m=m1");
  const up = { ...m, attendance: { ...m.attendance, "مراجع": "mandatory" } };
  assert.deepEqual(forMeeting({ before: m, after: up, actor: boss, users }).map((x) => x.user_id), ["r"]);
  assert.deepEqual(forMeeting({ before: m, after: m, actor: boss, users }), []);
});

test("تنبيهات المواعيد", () => {
  const now = new Date("2026-10-11T09:00:00");
  const list = [
    T({ id: "late", due_date: "2026-10-01", stage: "in_progress" }),
    T({ id: "tomorrow", due_date: "2026-10-12", stage: "in_progress" }),
    T({ id: "far", due_date: "2026-11-01", stage: "in_progress" }),
    T({ id: "review", due_date: "2026-10-01", stage: "in_review" }),
  ];
  assert.deepEqual(dueAlerts(list, anwar, now).map((x) => [x.task_id, x.kind]), [["late", "overdue"], ["tomorrow", "due_soon"]]);
});

test("تقرير الإدارة: الإجماليات والتوزيع والالتزام بالمواعيد", () => {
  const now = new Date("2026-10-11T09:00:00");
  const tasks = [
    T({ id: "1", stage: "in_progress", due_date: "2026-10-01" }),
    T({ id: "2", stage: "in_review" }),
    T({ id: "3", stage: "on_hold", hold_reason: "بانتظار العميل", project: "ZL" }),
    T({ id: "4", stage: "closed", due_date: "2026-10-05", completed_at: "2026-10-04T10:00:00Z" }),
    T({ id: "5", stage: "closed", due_date: "2026-10-05", completed_at: "2026-10-08T10:00:00Z" }),
    T({ id: "6", stage: "in_progress", assignee_id: null, assigned_to: "Asem(MediaPayer)" }),
  ];
  const r = managementReport({ tasks, users, now });
  assert.equal(r.totals.open, 4);
  assert.equal(r.totals.overdue, 1);
  assert.equal(r.totals.inReview, 1);
  assert.equal(r.totals.onHold, 1);
  assert.equal(r.totals.rate, 50);
  assert.equal(r.stopped[0].reason, "بانتظار العميل");
  const a = r.employees.find((e) => e.key === "a");
  assert.deepEqual([a.open, a.overdue, a.waitingOthers, a.rate], [3, 1, 1, 50]);
  assert.equal(r.employees.find((e) => e.key === "r").awaiting, 1, "المراجع لديه مهمة بانتظار مراجعته");
  assert.ok(r.employees.some((e) => e.name.includes("غير مربوط")));
  assert.equal(r.projects[0].status, "late");
  assert.equal(r.projects.find((p) => p.name === "ZL").status, "blocked");
});

test("تصدير CSV يدعم العربية والفواصل", () => {
  const csv = toCSV([{ n: "أنور، مبارك", v: 3 }], [{ label: "الاسم", get: (r) => r.n }, { label: "العدد", get: (r) => r.v }]);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes("أنور، مبارك,3"));
});
