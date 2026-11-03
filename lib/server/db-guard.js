// صلاحيات الوصول للبيانات على الخادم: من المستخدم؟ وماذا يحق له أن يقرأ أو يعدّل؟
import { NextResponse } from "next/server";
import { authEnabled, verify, AUTH_COOKIE } from "./auth-token";
import { sb, serverCloud, hasServiceRole } from "./supabase-server";

const ALL = ["manager", "member", "client"];
const STAFF = ["manager", "member"];

// إعدادات كل جدول
export const TABLES = {
  tasks: { order: "order_index", asc: true, read: ALL, write: STAFF, scope: "project" },
  meetings: { order: "start_at", asc: true, read: ALL, write: STAFF, scope: "project" },
  files: { order: "created_at", asc: false, read: ALL, write: STAFF, scope: "project" },
  projects: { order: "order_index", asc: true, read: ALL, write: ["manager"], scope: "name" },
  users: { order: "order_index", asc: true, read: ALL, write: ["manager"], hideForClient: ["email"] },
  kpis: { order: "created_at", asc: true, read: STAFF, write: ["manager"] },
};

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function fail(e) {
  const status = e?.status || 500;
  return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status });
}

export function requireDb() {
  if (!serverCloud) throw new HttpError(400, "قاعدة البيانات السحابية غير مُعدّة");
  if (!hasServiceRole) {
    throw new HttpError(500, "يلزم ضبط SUPABASE_SERVICE_ROLE_KEY على الخادم بعد تفعيل حماية قاعدة البيانات");
  }
}

/**
 * هوية الطلب:
 *  - الدخول مفعّل: المستخدم من جلسة OTP (ويُحدَّث دوره من قاعدة البيانات)
 *  - الدخول غير مفعّل: وضع مفتوح (يُعامل كمدير) — يُنصح بتفعيل AUTH_SECRET
 */
export async function identity(req) {
  if (!authEnabled()) return { open: true, id: "", name: "", role: "manager" };
  const s = await verify(req.cookies.get(AUTH_COOKIE)?.value);
  if (!s || s.t !== "auth") throw new HttpError(401, "يجب تسجيل الدخول");
  const admins = (process.env.AUTH_ADMIN_EMAILS || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const isAdmin = admins.includes(String(s.e || "").toLowerCase());
  if (String(s.uid).startsWith("admin:")) return { id: s.uid, name: s.n, role: "manager", email: s.e };
  const { data } = await sb.from("users").select("id,name,role,email,project").eq("id", s.uid).maybeSingle();
  if (!data) {
    if (isAdmin) return { id: s.uid, name: s.n, role: "manager", email: s.e };
    throw new HttpError(401, "الحساب لم يعد موجوداً — سجّل الدخول مجدداً");
  }
  return { id: String(data.id), name: data.name, role: isAdmin ? "manager" : data.role || "member", email: data.email, project: data.project };
}

export function can(who, roles) {
  return roles.includes(who.role);
}

// المشاريع المسموح للعميل برؤيتها
export async function clientProjects(who) {
  const { data } = await sb.from("projects").select("name,client,clients");
  const mine = (data || [])
    .filter((p) => (Array.isArray(p.clients) && p.clients.includes(who.name)) || p.client === who.name)
    .map((p) => p.name);
  if (!mine.length && who.project) mine.push(who.project);
  return mine;
}

// حقول لا يجوز للمتصفح تعيينها
const PROTECTED = new Set(["id", "created_at"]);
export function cleanRecord(rec) {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) throw new HttpError(400, "بيانات غير صالحة");
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    if (PROTECTED.has(k) || !/^[a-z_][a-z0-9_]{0,40}$/.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function readJson(req) {
  try { return await req.json(); } catch { throw new HttpError(400, "طلب غير صالح"); }
}
