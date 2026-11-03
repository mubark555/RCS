// رموز موقّعة (HMAC-SHA256) عبر Web Crypto — تعمل في الـ Middleware (Edge) وفي واجهات Node
export const AUTH_COOKIE = "sp_auth";
export const OTP_COOKIE = "sp_otp";

export const authEnabled = () => Boolean((process.env.AUTH_SECRET || "").trim());
const secret = () => (process.env.AUTH_SECRET || "").trim();

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes) {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let _key = null;
let _keyFor = "";
async function key() {
  if (_key && _keyFor === secret()) return _key;
  _keyFor = secret();
  _key = await crypto.subtle.importKey("raw", enc.encode(_keyFor), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return _key;
}

export async function hmac(text) {
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(text));
  return b64url(sig);
}

// مقارنة بزمن ثابت
export function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function sign(payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

export async function verify(token) {
  if (!token || !secret()) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, await hmac(body))) return null;
  try {
    const p = JSON.parse(dec.decode(unb64url(body)));
    if (!p.x || Date.now() > p.x) return null;
    return p;
  } catch {
    return null;
  }
}

export function randomNonce(n = 16) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}

// رمز من 6 أرقام بتوزيع منتظم
export function randomCode() {
  const a = new Uint32Array(1);
  let v;
  do { crypto.getRandomValues(a); v = a[0]; } while (v >= 4294000000); // إزالة الانحياز
  return String(v % 1000000).padStart(6, "0");
}

export const SESSION_HOURS = () => Math.min(24 * 30, Math.max(1, Number(process.env.AUTH_SESSION_HOURS) || 24 * 7));
