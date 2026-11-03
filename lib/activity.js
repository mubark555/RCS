"use client";

// سجل النشاط وجلسات الدخول/الخروج للموظفين
// - كل إضافة/تعديل/حذف عبر طبقة البيانات تُسجَّل تلقائياً باسم المستخدم الحالي
// - الجلسات: دخول عند فتح النظام/اختيار المستخدم، نبض كل دقيقة، خروج عند التبديل أو الخمول

import { supabase, isCloud } from "./supabase";
import { STATUS_META, PRIORITY_META, HEALTH_META, APPROVAL_META } from "./constants";

const LS_ACT = "sp_activity";
const LS_SES = "sp_sessions";
const LS_CUR = "sp_session_cur";
const MAX_LOCAL = 5000;

export const HEARTBEAT_MS = 60_000;
export const IDLE_END_MS = 5 * 60_000; // جلسة بلا نبض أكثر من 5 دقائق تُعدّ منتهية

// ---------------- الفاعل الحالي ----------------
let actor = null;
export function setActor(u) {
  actor = u ? { id: u.id, name: u.name, role: u.role } : null;
}
export const getActor = () => actor;

// ---------------- التخزين المحلي ----------------
function lsRead(k, fb) {
  if (typeof window === "undefined") return fb;
  try { const r = window.localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; }
}
function lsWrite(k, v) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(k, JSON.stringify(v)); } catch {
    // امتلاء التخزين: احتفظ بالنصف الأحدث
    try { if (Array.isArray(v)) window.localStorage.setItem(k, JSON.stringify(v.slice(-Math.floor(v.length / 2)))); } catch {}
  }
}
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------------- تعريف الكيانات ----------------
export const ENTITIES = {
  task: { ar: "مهمة", plural: "المهام", titleKey: "task", color: "#2563eb", icon: "tasks" },
  meeting: { ar: "اجتماع", plural: "الاجتماعات", titleKey: "title", color: "#7c3aed", icon: "calendar" },
  project: { ar: "مشروع", plural: "المشاريع", titleKey: "name", color: "#0d9488", icon: "projects" },
  user: { ar: "مستخدم", plural: "الفريق", titleKey: "name", color: "#d97706", icon: "users" },
  kpi: { ar: "مؤشر أداء", plural: "المؤشرات", titleKey: "name", color: "#16a34a", icon: "chart" },
  file: { ar: "ملف", plural: "الملفات", titleKey: "name", color: "#64748b", icon: "file" },
  session: { ar: "جلسة", plural: "الدخول والخروج", titleKey: "", color: "#e05a50", icon: "clock" },
};
export const TABLE_ENTITY = { tasks: "task", meetings: "meeting", projects: "project", users: "user", kpis: "kpi", files: "file" };

const FIELD_AR = {
  task: "المهمة", activity: "النشاط", project: "المشروع", priority: "الأولوية", status: "الحالة",
  assigned_to: "المسؤول", due_date: "الاستحقاق", waiting_on: "بانتظار", blocker: "العائق",
  approval_status: "الاعتماد", notes: "الملاحظات", health: "الصحة", holder: "لدى", handoffs: "سير العمل",
  links: "الروابط", title: "العنوان", start_at: "الموعد", duration: "المدة", location: "المكان",
  attendees: "الحضور", agenda: "جدول الأعمال", minutes: "المحضر", action_items: "القرارات",
  name: "الاسم", description: "الوصف", managers: "المدراء", clients: "العملاء", members: "الأعضاء",
  color: "اللون", logo: "الشعار", role: "الدور", email: "البريد", current: "القيمة الحالية",
  target: "المستهدف", unit: "الوحدة", category: "التصنيف", notify: "إشعارات البريد",
  reminders: "التذكيرات", extra_emails: "بريد إضافي", archived: "الأرشفة", note: "ملاحظة", url: "الرابط",
};
// حقول تقنية لا تُسجَّل
const IGNORED = new Set(["id", "created_at", "updated_at", "order_index", "notify_log", "reminders_sent", "data_url"]);

const VALUE_AR = (field, v) => {
  if (field === "status") return (STATUS_META[v] || { Scheduled: { ar: "مجدول" }, Done: { ar: "منتهي" }, Cancelled: { ar: "ملغى" } }[v])?.ar ?? v;
  if (field === "priority") return PRIORITY_META[v]?.ar ?? v;
  if (field === "health") return HEALTH_META[v]?.ar ?? v;
  if (field === "approval_status") return APPROVAL_META[v]?.ar ?? v;
  return v;
};

function show(field, v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (field === "start_at") {
    try { return new Date(v).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }); } catch {}
  }
  if (Array.isArray(v)) {
    if (field === "handoffs") return `${v.length} خطوة`;
    if (v.every((x) => typeof x !== "object")) return v.join("، ") || "—";
    return `${v.length} عنصر`;
  }
  if (typeof v === "object") return "…";
  const s = String(VALUE_AR(field, v));
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
}

const same = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

export function diffRecords(prev, patch) {
  const out = [];
  for (const k of Object.keys(patch || {})) {
    if (IGNORED.has(k)) continue;
    if (prev && same(prev[k], patch[k])) continue;
    out.push({ field: k, label: FIELD_AR[k] || k, from: prev ? show(k, prev[k]) : "—", to: show(k, patch[k]) });
  }
  return out;
}

// ---------------- كتابة السجل ----------------
/**
 * entry: { action, entity, entity_id, title, project, details }
 * action: create | update | status | delete | login | logout | upload | link | convert
 */
export async function logActivity(entry) {
  try {
    const a = entry.actor || actor;
    const rec = {
      at: new Date().toISOString(),
      user_id: a?.id ? String(a.id) : "",
      user_name: a?.name || "غير معروف",
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id ? String(entry.entity_id) : "",
      title: String(entry.title || "").slice(0, 300),
      project: entry.project || "",
      details: entry.details || {},
    };
    if (isCloud) {
      await supabase.from("activity_log").insert([rec]);
    } else {
      const list = lsRead(LS_ACT, []);
      list.push({ id: rid(), ...rec });
      lsWrite(LS_ACT, list.length > MAX_LOCAL ? list.slice(-MAX_LOCAL) : list);
    }
    if (typeof window !== "undefined") window.dispatchEvent(new Event("sp-activity"));
  } catch {
    // السجل لا يجب أن يعطّل العمل الأساسي أبداً
  }
}

// يُستدعى من طبقة البيانات بعد كل عملية
export function trackMutation(table, op, { prev, rec, patch, id }) {
  const entity = TABLE_ENTITY[table];
  if (!entity || !actor) return;
  const def = ENTITIES[entity];
  const base = rec || prev || {};
  const title = base[def.titleKey] || base.name || base.title || "";
  const project = base.project || (entity === "project" ? base.name : "") || "";
  if (op === "create") {
    logActivity({ action: "create", entity, entity_id: rec?.id, title, project });
  } else if (op === "delete") {
    logActivity({ action: "delete", entity, entity_id: id, title, project });
  } else if (op === "update") {
    const changes = diffRecords(prev, patch);
    if (!changes.length) return;
    const onlyStatus = changes.length === 1 && changes[0].field === "status";
    logActivity({ action: onlyStatus ? "status" : "update", entity, entity_id: id, title, project, details: { changes } });
  }
}

// ---------------- قراءة السجل ----------------
export async function listActivity({ from, to, user } = {}) {
  if (isCloud) {
    let q = supabase.from("activity_log").select("*").order("at", { ascending: false }).limit(5000);
    if (from) q = q.gte("at", from.toISOString());
    if (to) q = q.lt("at", to.toISOString());
    if (user) q = q.eq("user_name", user);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }
  const f = from?.toISOString(), t = to?.toISOString();
  return lsRead(LS_ACT, [])
    .filter((e) => (!f || e.at >= f) && (!t || e.at < t) && (!user || e.user_name === user))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function listSessions({ from, to, user } = {}) {
  // الجلسات المتداخلة مع الفترة: بدأت قبل نهايتها وآخر ظهور بعد بدايتها
  if (isCloud) {
    let q = supabase.from("user_sessions").select("*").order("started_at", { ascending: false }).limit(3000);
    if (to) q = q.lt("started_at", to.toISOString());
    if (from) q = q.gte("last_seen_at", from.toISOString());
    if (user) q = q.eq("user_name", user);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }
  const f = from?.toISOString(), t = to?.toISOString();
  return lsRead(LS_SES, [])
    .filter((s) => (!t || s.started_at < t) && (!f || s.last_seen_at >= f) && (!user || s.user_name === user))
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

// نهاية الجلسة الفعلية: وقت الخروج الصريح، أو آخر نبض إن انقطعت
export function sessionEnd(s, now = Date.now()) {
  if (s.ended_at) return { at: s.ended_at, explicit: true, active: false };
  const last = new Date(s.last_seen_at).getTime();
  if (now - last < IDLE_END_MS) return { at: new Date(now).toISOString(), explicit: false, active: true };
  return { at: s.last_seen_at, explicit: false, active: false };
}

// ---------------- الجلسات ----------------
async function sesInsert(rec) {
  if (isCloud) {
    const { data, error } = await supabase.from("user_sessions").insert([rec]).select().single();
    if (error) throw error;
    return data;
  }
  const r = { id: rid(), ...rec };
  const list = lsRead(LS_SES, []);
  list.push(r);
  lsWrite(LS_SES, list.length > 3000 ? list.slice(-3000) : list);
  return r;
}
async function sesPatch(id, patch) {
  if (isCloud) {
    await supabase.from("user_sessions").update(patch).eq("id", id);
    return;
  }
  const list = lsRead(LS_SES, []);
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) { list[i] = { ...list[i], ...patch }; lsWrite(LS_SES, list); }
}

function device() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent || "";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ");
}

let _starting = null;

// يبدأ جلسة للمستخدم أو يستأنفها (مشتركة بين تبويبات المتصفح نفسه)
export async function ensureSession(user) {
  if (!user) return null;
  if (_starting) return _starting;
  _starting = (async () => {
    const cur = lsRead(LS_CUR, null);
    const now = Date.now();
    if (cur && cur.userId === user.id && now - (cur.last || 0) < IDLE_END_MS) {
      await heartbeat();
      return cur.id;
    }
    if (cur && cur.userId !== user.id && now - (cur.last || 0) < IDLE_END_MS) {
      await endSession("switch");
    }
    const startedAt = new Date().toISOString();
    const rec = await sesInsert({ user_id: String(user.id), user_name: user.name, started_at: startedAt, last_seen_at: startedAt, ended_at: null, device: device() });
    lsWrite(LS_CUR, { id: rec.id, userId: user.id, userName: user.name, last: now });
    logActivity({ action: "login", entity: "session", entity_id: rec.id, title: "", actor: user, details: { device: device() } });
    return rec.id;
  })().finally(() => { _starting = null; });
  return _starting;
}

export async function heartbeat() {
  const cur = lsRead(LS_CUR, null);
  if (!cur) return;
  const now = Date.now();
  if (now - (cur.last || 0) < 20_000) return; // لا داعي لنبض متكرر من عدة تبويبات
  lsWrite(LS_CUR, { ...cur, last: now });
  await sesPatch(cur.id, { last_seen_at: new Date(now).toISOString() }).catch(() => {});
}

export async function endSession(reason = "logout") {
  const cur = lsRead(LS_CUR, null);
  if (!cur) return;
  const at = new Date().toISOString();
  try { window.localStorage.removeItem(LS_CUR); } catch {}
  await sesPatch(cur.id, { ended_at: at, last_seen_at: at }).catch(() => {});
  await logActivity({ action: "logout", entity: "session", entity_id: cur.id, title: "", actor: { id: cur.userId, name: cur.userName }, details: { reason } });
}

// خروج سريع عند إغلاق التبويب (الوضع المحلي فقط يكتب متزامناً)
export function endSessionOnUnloadLocal() {
  if (isCloud) return;
  const cur = lsRead(LS_CUR, null);
  if (!cur) return;
  const list = lsRead(LS_SES, []);
  const i = list.findIndex((x) => x.id === cur.id);
  if (i >= 0) { list[i].last_seen_at = new Date().toISOString(); lsWrite(LS_SES, list); }
}
