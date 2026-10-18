// مسار Google Drive (سيرفر فقط): التصفّح والرفع والحذف داخل المجلد الرئيسي للنظام.
// الحماية: جلسة دخول صالحة لمستخدم نشط، وصلاحيته على قسم «Google Drive» (اطلاع/تعديل)
// تُحسب من مصفوفة الصلاحيات نفسها المستخدمة في الواجهة.

import { createClient } from "@supabase/supabase-js";
import { isActiveUserEmail } from "@/lib/notifyGuard.mjs";
import { resolvePerms, atLeast } from "@/lib/permissions";
import { driveConfig, listChildren, trailOf, ensurePath, startUpload, trash } from "@/lib/googleDrive.mjs";

export const runtime = "nodejs";

async function authorize(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: "Google Drive متاح في الوضع السحابي فقط.", status: 503 };
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "يجب تسجيل الدخول.", status: 401 };
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: who, error } = await sb.auth.getUser(token);
  if (error || !who?.user?.email) return { error: "جلسة الدخول غير صالحة.", status: 401 };
  const [{ data: users }, { data: perms }, { data: fin }] = await Promise.all([
    sb.from("users").select("*"),
    sb.from("app_settings").select("value").eq("key", "permissions").maybeSingle(),
    sb.from("app_settings").select("value").eq("key", "finance_access").maybeSingle(),
  ]);
  const email = who.user.email.trim().toLowerCase();
  if (!isActiveUserEmail(users, email)) return { error: "حسابك غير مخوّل.", status: 403 };
  const user = (users || []).find((u) => String(u.email || "").trim().toLowerCase() === email);
  const level = resolvePerms(user, perms?.value || {}, fin?.value || null).sections.drive || "none";
  return { user, level };
}

const NEED = { list: "view", trail: "view", ensure: "edit", upload: "edit", trash: "edit" };

export async function GET() {
  return Response.json({ configured: Boolean(driveConfig()) });
}

export async function POST(req) {
  const cfg = driveConfig();
  if (!cfg) return Response.json({ error: "Google Drive غير مربوط بعد (مفاتيح حساب الخدمة غير مضبوطة في الخادم)." }, { status: 503 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "طلب غير صالح." }, { status: 400 });
  }
  const need = NEED[body?.action];
  if (!need) return Response.json({ error: "إجراء غير معروف." }, { status: 400 });

  const auth = await authorize(req).catch(() => ({ error: "تعذّر التحقق من الهوية.", status: 500 }));
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  if (!atLeast(auth.level, need)) return Response.json({ error: "لا تملك صلاحية على هذا الإجراء في Google Drive." }, { status: 403 });

  try {
    const { action, id, parent, names, name, mime, size } = body;
    if (action === "list") {
      const trail = await trailOf(cfg, id);
      return Response.json({ items: await listChildren(cfg, id), trail });
    }
    if (action === "trail") return Response.json({ trail: await trailOf(cfg, id) });
    if (action === "ensure") {
      const clean = (Array.isArray(names) ? names : []).map((n) => String(n || "").replace(/[\\/]+/g, "-").trim()).filter(Boolean).slice(0, 6);
      return Response.json({ id: await ensurePath(cfg, parent, clean) });
    }
    if (action === "upload") {
      if (!name) return Response.json({ error: "اسم الملف مطلوب." }, { status: 400 });
      const url = await startUpload(cfg, { parent, name: String(name).slice(0, 250), mime, size, origin: req.headers.get("origin") || "" });
      return Response.json({ url });
    }
    if (action === "trash") {
      await trash(cfg, id);
      return Response.json({ ok: true });
    }
  } catch (e) {
    return Response.json({ error: e?.message || "خطأ في Google Drive." }, { status: e?.status && e.status < 600 ? e.status : 500 });
  }
}
