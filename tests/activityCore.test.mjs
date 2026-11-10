import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRecords, sessionEnd, clipDuration, summarize, sessionEvents, IDLE_END_MS } from "../lib/activityCore.mjs";

test("diffRecords: يلتقط الحقول المتغيّرة فقط مع أسمائها بالعربية", () => {
  const prev = { id: "1", task: "تصميم", status: "In Progress", notes: "", order_index: 3 };
  const patch = { task: "تصميم", status: "Completed", notes: "تم", order_index: 4 };
  const ch = diffRecords(prev, patch);
  assert.deepEqual(ch.map((c) => c.field), ["status", "notes"]);
  assert.equal(ch[0].label, "الحالة");
  assert.equal(ch[1].from, "—");
  assert.equal(ch[1].to, "تم");
});

test("diffRecords: ترجمة القيم عبر valueLabel وتلخيص المصفوفات", () => {
  const vl = (f, v) => (f === "status" ? { Completed: "مكتملة", "In Progress": "قيد التنفيذ" }[v] : v);
  const ch = diffRecords({ status: "In Progress", attendees: ["أمل"] }, { status: "Completed", attendees: ["أمل", "لجين"] }, vl);
  assert.equal(ch[0].from, "قيد التنفيذ");
  assert.equal(ch[0].to, "مكتملة");
  assert.equal(ch[1].to, "أمل، لجين");
});

test("diffRecords: بلا تغيير ذي معنى → فارغة", () => {
  assert.deepEqual(diffRecords({ a: 1, order_index: 1 }, { a: 1, order_index: 2 }), []);
  assert.deepEqual(diffRecords(null, null), []);
});

test("sessionEnd: خروج صريح / نشطة / منقطعة", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  assert.equal(sessionEnd({ started_at: "2026-11-03T08:00:00Z", ended_at: "2026-11-03T10:00:00Z" }, now).explicit, true);
  const active = sessionEnd({ started_at: "2026-11-03T11:00:00Z", last_seen_at: new Date(now - 60_000).toISOString() }, now);
  assert.equal(active.active, true);
  const idle = sessionEnd({ started_at: "2026-11-03T08:00:00Z", last_seen_at: new Date(now - IDLE_END_MS - 1000).toISOString() }, now);
  assert.equal(idle.active, false);
  assert.equal(idle.explicit, false);
});

test("clipDuration: تُحسب المدة داخل اليوم فقط (جلسة تعبر منتصف الليل)", () => {
  const s = { started_at: "2026-11-02T23:00:00Z", ended_at: "2026-11-03T01:00:00Z" };
  assert.equal(clipDuration(s, "2026-11-03T00:00:00Z", "2026-11-04T00:00:00Z"), 3600_000);
  assert.equal(clipDuration(s, "2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z"), 3600_000);
});

test("summarize: أول دخول وآخر خروج والمدة والعمليات والمهام لكل موظف", () => {
  const from = "2026-11-03T00:00:00Z", to = "2026-11-04T00:00:00Z", now = Date.parse("2026-11-03T20:00:00Z");
  const sessions = [
    { id: "a", user_name: "أمل", started_at: "2026-11-03T08:00:00Z", ended_at: "2026-11-03T10:00:00Z" },
    { id: "b", user_name: "أمل", started_at: "2026-11-03T13:00:00Z", last_seen_at: "2026-11-03T14:00:00Z" },
  ];
  const acts = [
    { actor: "أمل", action: "update", entity: "مهمة", entity_id: "t1", created_at: "2026-11-03T09:00:00Z" },
    { actor: "أمل", action: "update", entity: "مهمة", entity_id: "t1", created_at: "2026-11-03T09:10:00Z" },
    { actor: "لجين", action: "create", entity: "اجتماع", created_at: "2026-11-03T11:00:00Z" },
  ];
  const rows = summarize(acts, sessions, from, to, now);
  const amal = rows.find((r) => r.name === "أمل");
  assert.equal(amal.sessions, 2);
  assert.equal(amal.dur, 3 * 3600_000);
  assert.equal(amal.first, "2026-11-03T08:00:00Z");
  assert.equal(amal.last.at, "2026-11-03T14:00:00.000Z");
  assert.equal(amal.actions, 2);
  assert.equal(amal.tasks.size, 1);
  assert.equal(rows.find((r) => r.name === "لجين").sessions, 0);
});

test("sessionEvents: دخول + خروج صريح + انتهاء بالخمول، والجلسة النشطة بلا خروج", () => {
  const now = Date.parse("2026-11-03T20:00:00Z");
  const ev = sessionEvents([
    { id: "1", user_name: "أمل", started_at: "2026-11-03T08:00:00Z", ended_at: "2026-11-03T09:00:00Z" },
    { id: "2", user_name: "لجين", started_at: "2026-11-03T10:00:00Z", last_seen_at: "2026-11-03T11:00:00Z" },
    { id: "3", user_name: "وجد", started_at: "2026-11-03T19:58:00Z", last_seen_at: "2026-11-03T19:59:30Z" },
  ], "2026-11-03T00:00:00Z", "2026-11-04T00:00:00Z", now);
  const kinds = ev.map((e) => `${e.actor}:${e.action}`).sort();
  assert.deepEqual(kinds, ["أمل:login", "أمل:logout", "لجين:idle", "لجين:login", "وجد:login"]);
});
