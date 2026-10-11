import { test } from "node:test";
import assert from "node:assert/strict";
import { normName, nameMatchesUser, availableActions, applyAction, myAction, waitingOn, stageOf, workflowOf, actionForStatus, isWaitingOnOthers } from "../lib/workflow.mjs";

const anwar = { id: "u-anwar", name: "أنور", role: "member" };
const reviewer = { id: "u-rev", name: "مراجع", role: "member" };
const approver = { id: "u-app", name: "معتمد", role: "member" };
const boss = { id: "u-boss", name: "مدير", role: "manager" };
const other = { id: "u-x", name: "آخر", role: "member" };

const base = (over = {}) => ({ id: "t1", task: "مهمة", assignee_id: anwar.id, workflow: "full", reviewer_id: reviewer.id, approver_id: approver.id, final_approver_id: boss.id, stage: "not_started", status: "Not Started", approval_status: "", health: "On Track", ...over });
const act = (t, a, u, note) => ({ ...t, ...applyAction(t, a, u, note).patch });
const names = (t, u) => availableActions(t, u).map((a) => a.action);

test("مطابقة الأسماء القديمة", () => {
  assert.equal(normName("Ohood (IT )"), "ohood");
  assert.equal(normName("Amal (AccounManager)"), "amal");
  assert.equal(normName("إيمان"), normName("ايمان"));
  assert.ok(nameMatchesUser("Lujain(PM)", { name: "لجين", aliases: ["Lujain"] }));
  assert.ok(!nameMatchesUser("Lujain(PM)", { name: "لجين" }));
  assert.ok(!nameMatchesUser("", { name: "" }));
});

test("المسار الكامل: تنفيذ ← مراجعة ← موافقة ← اعتماد ← إغلاق", () => {
  let t = base();
  t = act(t, "start", anwar);
  assert.equal(t.stage, "in_progress");
  t = act(t, "submit", anwar);
  assert.equal(t.stage, "in_review");
  assert.equal(t.status, "In Progress");
  assert.equal(t.approval_status, "Pending Review");
  t = act(t, "accept", reviewer);
  assert.equal(t.stage, "pending_approval");
  t = act(t, "accept", approver);
  assert.equal(t.stage, "pending_final");
  t = act(t, "accept", boss);
  assert.equal(t.stage, "closed");
  assert.equal(t.status, "Completed");
  assert.equal(t.approval_status, "Approved");
  assert.ok(t.completed_at);
});

test("طلب التعديل يعيد المهمة للمنفذ مع الملاحظات، والملاحظة إلزامية", () => {
  let t = act(base({ stage: "in_progress" }), "submit", anwar);
  assert.throws(() => applyAction(t, "request_changes", reviewer, "  "), /ملاحظات/);
  t = act(t, "request_changes", reviewer, "الشعار غير واضح");
  assert.equal(t.stage, "changes_requested");
  assert.equal(t.review_note, "الشعار غير واضح");
  assert.equal(myAction(t, anwar).kind, "fix");
  assert.equal(waitingOn(t, [anwar]).who, "أنور");
  t = act(t, "submit", anwar);
  assert.equal(t.stage, "in_review");
  assert.equal(t.review_note, "");
});

test("المنفذ لا يتجاوز المراجعة ولا يعتمد عمله بنفسه", () => {
  const t = act(base({ stage: "in_progress" }), "submit", anwar);
  assert.deepEqual(names(t, anwar), []);
  assert.throws(() => applyAction(t, "accept", anwar), /صلاحية/);
  // حتى لو كان هو المراجع المحدد
  const self = { ...t, reviewer_id: anwar.id };
  assert.throws(() => applyAction(self, "accept", anwar), /صلاحية/);
  // إلا بصلاحية صريحة
  assert.equal(act(self, "accept", { ...anwar, can_self_approve: true }).stage, "pending_approval");
});

test("المراجع لا يستطيع الاعتماد النهائي", () => {
  const t = base({ stage: "pending_final" });
  assert.deepEqual(names(t, reviewer), []);
  assert.deepEqual(names(t, other), []);
  assert.ok(names(t, boss).includes("accept"));
});

test("المدير المنفذ لا يعتمد مهمته، ومدير آخر يعتمدها عند عدم تحديد معتمد", () => {
  const boss2 = { id: "u-b2", name: "مدير2", role: "manager" };
  const t = base({ assignee_id: boss.id, workflow: "approve", final_approver_id: null, reviewer_id: null, stage: "pending_final" });
  assert.deepEqual(names(t, boss), []);
  assert.ok(names(t, boss2).includes("accept"));
});

test("سير عمل بسيط: المنفذ يغلق مباشرة", () => {
  const t = act(base({ workflow: "simple", stage: "in_progress" }), "submit", anwar);
  assert.equal(t.stage, "closed");
});

test("الإيقاف يتطلب سبباً، والاستئناف يعيد التنفيذ", () => {
  assert.throws(() => applyAction(base(), "hold", anwar, ""), /سبب/);
  let t = act(base(), "hold", anwar, "بانتظار العميل");
  assert.equal(t.status, "On Hold");
  assert.equal(waitingOn(t, [anwar]).what, "متوقفة: بانتظار العميل");
  t = act(t, "resume", anwar);
  assert.equal(t.stage, "in_progress");
});

test("المهام القديمة: اشتقاق المرحلة وسير العمل ومطابقة المسؤول بالاسم", () => {
  const legacy = { id: "t2", assigned_to: "Mubarak(IT)", status: "In Progress", approval_status: "Pending Review" };
  assert.equal(stageOf(legacy), "in_review");
  assert.equal(workflowOf(legacy), "review");
  assert.equal(stageOf({ status: "Completed" }), "closed");
  assert.equal(workflowOf({ status: "In Progress" }), "simple");
  const mubarak = { id: "u-m", name: "مبارك", aliases: ["Mubarak", "Mubrak"], role: "member" };
  assert.ok(isWaitingOnOthers(legacy, mubarak));
  assert.equal(myAction(legacy, boss).kind, "review");
  assert.equal(myAction({ ...legacy, approval_status: "", stage: "in_progress" }, mubarak).kind, "execute");
});

test("سحب البطاقة إلى «مكتملة» يمر عبر سير العمل", () => {
  const t = base({ stage: "in_progress" });
  assert.equal(actionForStatus(t, anwar, "Completed"), "submit");
  assert.equal(actionForStatus(t, other, "Completed"), null);
  assert.equal(actionForStatus(base({ stage: "in_review" }), anwar, "Completed"), null);
  assert.equal(actionForStatus(base({ stage: "in_review" }), reviewer, "Completed"), "accept");
});

test("إعادة فتح المغلقة للإدارة فقط", () => {
  const t = base({ stage: "closed", status: "Completed" });
  assert.deepEqual(names(t, anwar), []);
  assert.equal(act(t, "reopen", boss, "خطأ في التسليم").stage, "in_progress");
});
