import { test } from "node:test";
import assert from "node:assert/strict";
import { sameName, isOwnWork, decisionBlock, stepBlock, dragRule, myBuckets } from "../lib/mywork.mjs";

const anwar = { name: "أنور" };
const T = (o = {}) => ({ id: "t", task: "مهمة", assigned_to: "أنور", status: "In Progress", ...o });

test("مطابقة الأسماء بعد توحيد الكتابة", () => {
  assert.ok(sameName("أنور", "انور"));
  assert.ok(sameName(" حسن  مرعي ", "حسن مرعي"));
  assert.ok(!sameName("", ""));
  assert.ok(!sameName("حسن مرعي", "حسن فقيه"));
});

test("لا اعتماد ذاتي إلا بصلاحية صريحة", () => {
  const t = T({ status: "Pending Review", ready_by: "أنور" });
  assert.match(decisionBlock(t, anwar, { approve: true }), /عملك/);
  assert.equal(decisionBlock(t, anwar, { approve: true, selfApprove: true }), null);
  assert.equal(decisionBlock(t, { name: "مبارك" }, { approve: true }), null);
  assert.match(decisionBlock(t, { name: "مبارك" }, { approve: false }), /صلاحية/);
  // من سلّمها نيابةً عن غيره لا يعتمدها أيضاً
  assert.ok(isOwnWork(T({ assigned_to: "عهود", ready_by: "أنور" }), "أنور"));
});

test("خطوة السلسلة: صاحب الدور فقط، ولا يعتمد مهمة هو منفذها", () => {
  const t = T();
  assert.equal(stepBlock(t, { person: "مبارك", type: "approve" }, { name: "مبارك" }), null);
  assert.match(stepBlock(t, { person: "مبارك", type: "approve" }, { name: "حسن" }), /ليست دورك/);
  assert.match(stepBlock(t, { person: "أنور", type: "approve" }, anwar), /منفذها/);
  assert.equal(stepBlock(t, { person: "أنور", type: "work" }, anwar), null);
});

test("سحب البطاقة لا يتجاوز المراجعة", () => {
  const ctx = { canDeliver: true, decideBlock: null, isManager: false };
  assert.equal(dragRule(T(), "Approved", ctx).kind, "deny");
  assert.equal(dragRule(T(), "Pending Review", ctx).mode, "submit");
  assert.equal(dragRule(T({ status: "Pending Review" }), "Approved", { ...ctx, decideBlock: "x" }).kind, "deny");
  assert.equal(dragRule(T({ status: "Pending Review" }), "Approved", ctx).mode, "approve");
  assert.equal(dragRule(T({ status: "Approved" }), "In Progress", ctx).kind, "deny");
  assert.equal(dragRule(T({ status: "Approved" }), "In Progress", { ...ctx, isManager: true }).kind, "reopen");
  assert.equal(dragRule(T({ status: "Pending Review" }), "In Progress", ctx).kind, "withdraw");
  assert.equal(dragRule(T({ status: "Not Started" }), "In Progress", ctx).kind, "direct");
});

test("أقسام «المطلوب مني»", () => {
  const now = new Date("2026-10-11T10:00:00");
  const tasks = [
    T({ id: "ret", status: "Revision Needed", review_note: "عدّل" }),
    T({ id: "late", due_date: "2026-10-01" }),
    T({ id: "today", due_date: "2026-10-11" }),
    T({ id: "up", due_date: "2026-10-20" }),
    T({ id: "wait", status: "Pending Review", ready_by: "أنور" }),
    T({ id: "rev", assigned_to: "عهود", status: "Pending Review", ready_by: "عهود" }),
    T({ id: "step", assigned_to: "عهود", status: "In Progress" }),
    T({ id: "done", status: "Approved" }),
    T({ id: "other", assigned_to: "عهود" }),
  ];
  const b = myBuckets(tasks, anwar, { approve: true }, { now, currentStepOf: (t) => (t.id === "step" ? { person: "أنور", type: "approve" } : null) });
  const ids = (k) => b[k].map((t) => t.id);
  assert.deepEqual(ids("returned"), ["ret"]);
  assert.deepEqual(ids("overdue"), ["late"]);
  assert.deepEqual(ids("today"), ["today"]);
  assert.deepEqual(ids("upcoming"), ["up"]);
  assert.deepEqual(ids("waiting"), ["wait"], "تسليمه لا يظهر له للاعتماد");
  assert.deepEqual(ids("decide"), ["rev"]);
  assert.deepEqual(ids("myStep"), ["step"]);
  assert.deepEqual(ids("done"), ["done"]);
  // بدون صلاحية الاعتماد لا يظهر قسم القرار
  assert.deepEqual(myBuckets(tasks, anwar, {}, { now }).decide, []);
});

import { allowedRecipients, isActiveUserEmail, checkRecipients } from "../lib/notifyGuard.mjs";
test("مسار البريد: المرسل مستخدم نشط والمستقبلون من النظام فقط", () => {
  const users = [{ email: "A@x.com", status: "active" }, { email: "b@x.com", status: "suspended" }, { email: "" }];
  assert.ok(isActiveUserEmail(users, "a@x.com "));
  assert.ok(!isActiveUserEmail(users, "b@x.com"), "الموقوف لا يرسل");
  assert.ok(!isActiveUserEmail(users, "evil@x.com"));
  const allowed = allowedRecipients(users, { extraEmails: "boss@seem.sa، ceo@seem.sa" });
  assert.deepEqual(checkRecipients(["a@x.com", "boss@seem.sa"], allowed).ok, true);
  const bad = checkRecipients(["a@x.com", "victim@spam.com", "b@x.com"], allowed);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.rejected, ["victim@spam.com", "b@x.com"]);
});

import { isMe } from "../lib/mywork.mjs";
test("الأسماء البديلة تربط البيانات القديمة بالمستخدم", () => {
  const ohood = { name: "عهود", aliases: ["Ohood"] };
  assert.ok(isMe("Ohood (IT )", ohood));
  assert.ok(isMe("Ohood(IT)", ohood));
  assert.ok(isMe("عهود", ohood));
  assert.ok(!isMe("Hassan (Ops)", { name: "حسن مرعي" }), "بلا اسم بديل لا تطابق");
  assert.ok(isMe("Hassan (Ops)", { name: "حسن مرعي", aliases: ["Hassan"] }));
  const b = myBuckets([{ id: "x", assigned_to: "Ohood (IT )", status: "In Progress" }], ohood, {});
  assert.equal(b.upcoming.length, 1);
});

test("جسر الأسماء الجاهز يعمل دون إعداد", () => {
  assert.ok(isMe("Lujain(PM)", { name: "لجين" }));
  assert.ok(isMe("Mubrak (IT)", { name: "مبارك" }));
  assert.ok(!isMe("Lujain(PM)", { name: "وجد" }));
});
