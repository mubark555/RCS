import { test } from "node:test";
import assert from "node:assert/strict";
import { eventRecipients, announceRecipients, lineManagersOf, isMine } from "../lib/notifyTargets.mjs";

const users = [
  { id: "m1", name: "مبارك", role: "manager" },
  { id: "w", name: "وجد", role: "member" },
  { id: "j", name: "جاز", role: "member", reports_to: "رائد" },
  { id: "r", name: "رائد", role: "member", reports_to: "مبارك" },
  { id: "l", name: "لجين", role: "member" },
  { id: "c", name: "سارة", role: "client" },
  { id: "s", name: "موقوف", role: "member", status: "suspended" },
];
const wajd = users[1];

test("مهمة جديدة لجاز من وجد: تصل لجاز ومسؤوليه فقط، لا للجين", () => {
  const to = eventRecipients({ entity: "مهمة", action: "create", record: { task: "x", assigned_to: "جاز" } }, users, wajd);
  assert.deepEqual(to.sort(), ["j", "m1", "r"]);
  assert.ok(!to.includes("l"));
  assert.ok(!to.includes("w"), "المنفِّذ لا يُشعَر بنفسه");
});

test("الأسماء اللاتينية القديمة تُطابق المستخدم", () => {
  const to = eventRecipients({ entity: "مهمة", record: { assigned_to: "Lujain(PM)" } }, users, wajd);
  assert.deepEqual(to, ["l"]);
});

test("أطراف السلسلة والمُسلِّم يُشعَرون", () => {
  const to = eventRecipients({ entity: "مهمة", record: { assigned_to: "وجد", ready_by: "لجين", chain: [{ person: "سارة" }] } }, users, users[0]);
  assert.deepEqual(to.sort(), ["c", "l", "w"]);
});

test("سجل بلا أطراف (مشروع/حذف) يذهب للمدراء فقط", () => {
  assert.deepEqual(eventRecipients({ entity: "مشروع", record: { name: "p" } }, users, wajd), ["m1"]);
  assert.deepEqual(eventRecipients({ entity: "مهمة", action: "delete", record: { id: "1" } }, users, wajd), ["m1"]);
});

test("الاجتماع: المدعوون والمنظّم", () => {
  const to = eventRecipients({ entity: "اجتماع", record: { attendees: '["جاز","لجين"]', created_by: "وجد" } }, users, users[0]);
  assert.deepEqual(to.sort(), ["j", "l", "w"]);
});

test("الموقوف لا يستلم، وسلسلة المسؤولين لا تدور للأبد", () => {
  const loop = [{ id: "a", name: "أ", reports_to: "ب" }, { id: "b", name: "ب", reports_to: "أ" }];
  assert.deepEqual(lineManagersOf([loop[0]], loop).map((u) => u.id), ["b"]);
  assert.deepEqual(eventRecipients({ entity: "مهمة", record: { assigned_to: "موقوف" } }, users, wajd), ["m1"]);
});

test("الإعلانات: الشخص المعني + الجمهور", () => {
  assert.deepEqual(announceRecipients({ people: ["جاز"], audience: "none" }, users, wajd), ["j"]);
  assert.deepEqual(announceRecipients({ people: ["جاز"] }, users, wajd).sort(), ["j", "m1"]);
  assert.ok(!announceRecipients({ audience: "team" }, users, wajd).includes("c"));
});

test("الجرس: إشعار المستلم له وحده، والقديم للمدراء فقط", () => {
  assert.ok(isMine({ recipient: "j" }, users[2]));
  assert.ok(!isMine({ recipient: "j" }, users[4]));
  assert.ok(isMine({}, users[0]));
  assert.ok(!isMine({}, users[4]));
});
