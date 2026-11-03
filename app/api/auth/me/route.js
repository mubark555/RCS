// المستخدم الحالي (من جلسة الدخول)
import { NextResponse } from "next/server";
import { authEnabled, verify, AUTH_COOKIE } from "@/lib/server/auth-token";
import { sb, serverCloud } from "@/lib/server/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!authEnabled()) return NextResponse.json({ enabled: false, user: null });
  const s = await verify(req.cookies.get(AUTH_COOKIE)?.value);
  if (!s || s.t !== "auth") return NextResponse.json({ enabled: true, user: null });
  let user = { id: s.uid, name: s.n, role: s.r, email: s.e };
  // تحديث الاسم/الدور من قاعدة البيانات (قد يتغيّر بعد الدخول)
  if (serverCloud && !String(s.uid).startsWith("admin:")) {
    const { data } = await sb.from("users").select("id,name,role,email").eq("id", s.uid).maybeSingle();
    if (!data) return NextResponse.json({ enabled: true, user: null, removed: true });
    const admin = (process.env.AUTH_ADMIN_EMAILS || "").toLowerCase().split(/[\s,;]+/).includes(String(data.email || "").toLowerCase());
    user = { id: String(data.id), name: data.name, role: admin ? "manager" : data.role, email: data.email };
  }
  return NextResponse.json({ enabled: true, user, expiresAt: s.x });
}
