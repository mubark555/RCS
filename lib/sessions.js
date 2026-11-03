"use client";

// جلسات الدخول والخروج: بدء جلسة عند الدخول، نبض كل دقيقة أثناء الاستخدام، إنهاء عند الخروج.
// سحابياً: عبر دوال الخادم session_start / session_ping (الهوية والوقت يحددهما الخادم).
// محلياً: localStorage (للتجربة).
import { supabase, isCloud } from "./supabase";
import { IDLE_END_MS } from "./activityCore.mjs";

export const HEARTBEAT_MS = 60_000;
const LS_SES = "sp_sessions";
const LS_CUR = "sp_session_cur";

function lsRead(k, fb) {
  try { const r = window.localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; }
}
function lsWrite(k, v) {
  try { window.localStorage.setItem(k, JSON.stringify(v)); } catch {}
}
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function deviceLabel() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent || "";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ");
}

let _starting = null;

// يبدأ جلسة أو يستأنف الحالية (مشتركة بين تبويبات المتصفح نفسه للمستخدم نفسه)
export async function ensureSession(user) {
  if (!user || typeof window === "undefined") return null;
  if (_starting) return _starting;
  _starting = (async () => {
    const key = String(user.email || user.id || user.name || "").toLowerCase();
    const cur = lsRead(LS_CUR, null);
    const now = Date.now();
    if (cur && cur.key === key && now - (cur.last || 0) < IDLE_END_MS) {
      await heartbeat();
      return cur.id;
    }
    if (cur && cur.key !== key && now - (cur.last || 0) < IDLE_END_MS) await endSession();
    let id = null;
    if (isCloud) {
      const { data, error } = await supabase.rpc("session_start", { p_device: deviceLabel() });
      if (error) return null; // الترقية لم تُشغَّل بعد — لا تتبّع
      id = data;
    } else {
      const at = new Date().toISOString();
      id = rid();
      const list = lsRead(LS_SES, []);
      list.push({ id, user_email: user.email || "", user_name: user.name, started_at: at, last_seen_at: at, ended_at: null, device: deviceLabel() });
      lsWrite(LS_SES, list.slice(-3000));
    }
    lsWrite(LS_CUR, { id, key, last: now });
    return id;
  })().finally(() => { _starting = null; });
  return _starting;
}

export async function heartbeat() {
  const cur = lsRead(LS_CUR, null);
  if (!cur) return;
  const now = Date.now();
  if (now - (cur.last || 0) < 20_000) return; // لا نبض متكرر من عدة تبويبات
  lsWrite(LS_CUR, { ...cur, last: now });
  await ping(cur.id, false);
}

export async function endSession() {
  if (typeof window === "undefined") return;
  const cur = lsRead(LS_CUR, null);
  if (!cur) return;
  try { window.localStorage.removeItem(LS_CUR); } catch {}
  await ping(cur.id, true);
}

async function ping(id, end) {
  try {
    if (isCloud) {
      await supabase.rpc("session_ping", { p_id: id, p_end: end });
      return;
    }
    const list = lsRead(LS_SES, []);
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const at = new Date().toISOString();
    list[i] = { ...list[i], last_seen_at: at, ...(end ? { ended_at: at } : {}) };
    lsWrite(LS_SES, list);
  } catch {}
}

// الجلسات المتداخلة مع الفترة [from, to)
export async function listSessions({ from, to } = {}) {
  const f = from ? new Date(from).toISOString() : "";
  const t = to ? new Date(to).toISOString() : "";
  if (isCloud) {
    let q = supabase.from("user_sessions").select("*").order("started_at", { ascending: false }).limit(3000);
    if (t) q = q.lt("started_at", t);
    if (f) q = q.gte("last_seen_at", f);
    const { data, error } = await q;
    if (error) return []; // الجدول غير موجود قبل الترقية
    return data || [];
  }
  return lsRead(LS_SES, []).filter((s) => (!t || s.started_at < t) && (!f || (s.last_seen_at || s.started_at) >= f));
}
