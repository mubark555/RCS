// خدمة الدخول برمز لمرة واحدة (OTP) عبر البريد
import { isEmail } from "../notify-core";
import { sb, serverCloud } from "./supabase-server";
import { hmac } from "./auth-token";

export const OTP_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_SECONDS = 60;

const adminEmails = () =>
  (process.env.AUTH_ADMIN_EMAILS || "").split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(isEmail);

// إيجاد المستخدم بالبريد: من قاعدة البيانات (سحابي) أو من القائمة المرسلة (الوضع المحلي التجريبي)
export async function findUserByEmail(email, clientUsers) {
  email = String(email || "").trim().toLowerCase();
  let user = null;
  if (serverCloud) {
    const { data } = await sb.from("users").select("id,name,role,email,title").ilike("email", email).limit(1);
    user = data?.[0] || null;
  } else if (Array.isArray(clientUsers)) {
    const u = clientUsers.find((x) => String(x?.email || "").trim().toLowerCase() === email);
    if (u) user = { id: String(u.id), name: u.name, role: u.role, email, title: u.title || "" };
  }
  if (!user && adminEmails().includes(email)) {
    user = { id: `admin:${email}`, name: email.split("@")[0], role: "manager", email, title: "مدير النظام" };
  }
  if (user && adminEmails().includes(email)) user.role = "manager";
  return user;
}

export const otpHash = (nonce, email, code) => hmac(`otp:${nonce}:${email}:${code}`);

// ---------- تتبّع المحاولات (قاعدة البيانات إن وُجدت، وإلا الذاكرة) ----------
const MEM = new Map(); // nonce → { attempts, used, at }
const SENDS = new Map(); // key → [timestamps]

function memGc() {
  if (MEM.size < 2000) return;
  const cut = Date.now() - OTP_MINUTES * 60_000 * 2;
  for (const [k, v] of MEM) if (v.at < cut) MEM.delete(k);
}

export async function registerOtp(nonce, email) {
  memGc();
  MEM.set(nonce, { attempts: 0, used: false, at: Date.now() });
  if (serverCloud) {
    await sb.from("auth_otps").insert([{ nonce, email }]).then(() => {}, () => {});
  }
}

// يُرجع { ok } أو { error } — ويزيد عدد المحاولات
export async function consumeAttempt(nonce) {
  if (serverCloud) {
    const { data, error } = await sb.from("auth_otps").select("attempts,used").eq("nonce", nonce).maybeSingle();
    if (!error && data) {
      if (data.used) return { error: "تم استخدام هذا الرمز مسبقاً — اطلب رمزاً جديداً" };
      if (data.attempts >= MAX_ATTEMPTS) return { error: "تجاوزت عدد المحاولات المسموح — اطلب رمزاً جديداً" };
      await sb.from("auth_otps").update({ attempts: data.attempts + 1 }).eq("nonce", nonce);
      return { ok: true, left: MAX_ATTEMPTS - data.attempts - 1 };
    }
    // إن لم يوجد الجدول نرجع للذاكرة
  }
  const m = MEM.get(nonce) || { attempts: 0, used: false, at: Date.now() };
  if (m.used) return { error: "تم استخدام هذا الرمز مسبقاً — اطلب رمزاً جديداً" };
  if (m.attempts >= MAX_ATTEMPTS) return { error: "تجاوزت عدد المحاولات المسموح — اطلب رمزاً جديداً" };
  m.attempts += 1;
  MEM.set(nonce, m);
  return { ok: true, left: MAX_ATTEMPTS - m.attempts };
}

export async function markUsed(nonce) {
  const m = MEM.get(nonce);
  if (m) m.used = true;
  if (serverCloud) await sb.from("auth_otps").update({ used: true }).eq("nonce", nonce).then(() => {}, () => {});
}

// حدّ الإرسال: رمز كل 60 ثانية، و5 رموز كل ساعة لكل بريد/عنوان
export function sendLimited(key) {
  const now = Date.now();
  const arr = (SENDS.get(key) || []).filter((t) => now - t < 3600_000);
  if (arr.length && now - arr[arr.length - 1] < RESEND_SECONDS * 1000) return `انتظر ${Math.ceil((RESEND_SECONDS * 1000 - (now - arr[arr.length - 1])) / 1000)} ثانية قبل طلب رمز جديد`;
  if (arr.length >= 5) return "طلبات كثيرة لهذا البريد — حاول بعد ساعة";
  arr.push(now);
  SENDS.set(key, arr);
  if (SENDS.size > 5000) SENDS.clear();
  return null;
}

const HITS = new Map();
export function ipLimited(ip, max = 20) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > max;
}

export function clientIp(req) {
  return (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local").split(",")[0].trim();
}

export function deviceOf(ua = "") {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ");
}

export function maskEmail(e) {
  const [u, d] = String(e).split("@");
  if (!d) return e;
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}
