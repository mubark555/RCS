// حسابات لوحة الإدارة — منطق نقي. يُمرَّر إليه نطاق المستخدم فقط (المهام/الاجتماعات المرئية له).
import { stageOf, myAction, findUserByName, STEPS } from "./workflow.mjs";
import { ATTENDANCE_TYPES, attendanceOf } from "./attendance.mjs";

const DAY = 86400000;
const dayOf = (d) => {
  const x = new Date(d);
  return isNaN(x) ? NaN : new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};
const REVIEW_STAGES = Object.values(STEPS).map((s) => s.stage);

export function isLate(t, now = new Date()) {
  return stageOf(t) !== "closed" && Boolean(t.due_date) && dayOf(t.due_date) < dayOf(now);
}

// أُنجزت في موعدها: أُغلقت يوم الاستحقاق أو قبله. المهام القديمة بلا تاريخ إغلاق لا تُحتسب.
function onTimeStats(list) {
  const measured = list.filter((t) => stageOf(t) === "closed" && t.due_date && t.completed_at);
  const ok = measured.filter((t) => dayOf(t.completed_at) <= dayOf(t.due_date)).length;
  return { measured: measured.length, onTime: ok, rate: measured.length ? Math.round((ok / measured.length) * 100) : null };
}

export function managementReport({ tasks = [], users = [], meetings = [], withAccess = (u) => u, now = new Date() }) {
  const open = tasks.filter((t) => stageOf(t) !== "closed");
  const count = (st) => open.filter((t) => stageOf(t) === st).length;
  const totals = {
    open: open.length,
    overdue: open.filter((t) => isLate(t, now)).length,
    inReview: count("in_review"),
    pendingApproval: count("pending_approval") + count("pending_final"),
    changes: count("changes_requested"),
    onHold: count("on_hold"),
    ...onTimeStats(tasks),
  };

  // المتوقفة وأسباب توقفها + المفتوحة التي سُجّل عليها عائق
  const stopped = open
    .filter((t) => stageOf(t) === "on_hold" || String(t.blocker || "").trim())
    .map((t) => ({ task: t, reason: stageOf(t) === "on_hold" ? t.hold_reason || t.blocker || "بدون سبب مسجّل" : t.blocker, hold: stageOf(t) === "on_hold" }))
    .sort((a, b) => Number(b.hold) - Number(a.hold));

  // التوزيع على الموظفين
  const staff = users.filter((u) => u.role !== "client");
  const rows = new Map();
  const rowFor = (key, label, user) => {
    if (!rows.has(key)) rows.set(key, { key, label, user, tasks: [] });
    return rows.get(key);
  };
  for (const t of tasks) {
    const u = t.assignee_id ? users.find((x) => x.id === t.assignee_id) : findUserByName(t.assigned_to, users);
    if (u) rowFor(u.id, u.name, u).tasks.push(t);
    else if (String(t.assigned_to || "").trim()) rowFor(`legacy:${t.assigned_to.trim()}`, `${t.assigned_to.trim()} (غير مربوط)`, null).tasks.push(t);
    else rowFor("none", "بدون مسؤول", null).tasks.push(t);
  }
  const since = dayOf(now) - 30 * DAY;
  // ما ينتظر قرار المستخدم (مراجعة/موافقة/اعتماد) — حتى لو لم تُسند إليه مهام تنفيذ
  const awaitingOf = (user) => (user ? tasks.filter((t) => {
    const a = myAction(t, withAccess(user));
    return a && ["review", "approval", "final"].includes(a.kind);
  }).length : 0);
  const employees = [...rows.values()].map((r) => {
    const o = r.tasks.filter((t) => stageOf(t) !== "closed");
    const awaiting = awaitingOf(r.user);
    return {
      key: r.key, name: r.label, user: r.user,
      open: o.length,
      overdue: o.filter((t) => isLate(t, now)).length,
      waitingOthers: o.filter((t) => REVIEW_STAGES.includes(stageOf(t))).length,
      awaiting,
      closed30: r.tasks.filter((t) => stageOf(t) === "closed" && t.completed_at && dayOf(t.completed_at) >= since).length,
      ...onTimeStats(r.tasks),
    };
  });
  // الموظفون بلا مهام يظهرون أيضاً (لمعرفة من لديه سعة)
  for (const u of staff) {
    if (!rows.has(u.id)) employees.push({ key: u.id, name: u.name, user: u, open: 0, overdue: 0, waitingOthers: 0, awaiting: awaitingOf(u), closed30: 0, measured: 0, onTime: 0, rate: null });
  }
  employees.sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name, "ar"));

  // المشاريع
  const byProject = new Map();
  for (const t of tasks) {
    const k = t.project || "بدون مشروع";
    if (!byProject.has(k)) byProject.set(k, []);
    byProject.get(k).push(t);
  }
  const projects = [...byProject.entries()].map(([name, list]) => {
    const o = list.filter((t) => stageOf(t) !== "closed");
    const overdue = o.filter((t) => isLate(t, now)).length;
    const onHold = o.filter((t) => stageOf(t) === "on_hold").length;
    const blocked = o.filter((t) => String(t.blocker || "").trim() || t.health === "Delayed").length;
    const closed = list.length - o.length;
    const status = overdue ? "late" : onHold || blocked ? "blocked" : "ok";
    return { name, total: list.length, open: o.length, overdue, onHold, blocked, closed, pct: list.length ? Math.round((closed / list.length) * 100) : 0, status, ...onTimeStats(list) };
  }).sort((a, b) => ({ late: 0, blocked: 1, ok: 2 }[a.status] - { late: 0, blocked: 1, ok: 2 }[b.status]) || b.overdue - a.overdue);

  // الاجتماعات القادمة وتصنيف الحضور
  const nowIso = now.toISOString();
  const upcoming = meetings
    .filter((m) => m.status !== "Cancelled" && m.start_at >= nowIso)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, 6)
    .map((m) => {
      const att = Array.isArray(m.attendees) ? m.attendees : [];
      const byType = Object.fromEntries(Object.keys(ATTENDANCE_TYPES).map((k) => [k, att.filter((a) => attendanceOf(m, a) === k)]));
      return { meeting: m, byType };
    });

  return { totals, stopped, employees, projects, upcoming };
}

export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(c.get(r))).join(","))].join("\n");
}
