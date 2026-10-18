// مسار Google Drive (سيرفر فقط): ربط حساب Google، والتصفّح والرفع والحذف داخل المجلد الرئيسي.
// الحماية: جلسة دخول صالحة لمستخدم نشط، وصلاحيته على قسم «Google Drive» (اطلاع/تعديل)
// تُحسب من مصفوفة الصلاحيات نفسها المستخدمة في الواجهة. الربط وإلغاؤه لمن يملك تعديل «تخصيص النظام».

import { createClient } from "@supabase/supabase-js";
import { isActiveUserEmail } from "@/lib/notifyGuard.mjs";
import { resolvePerms, atLeast } from "@/lib/permissions";
import {
  driveConfig, driveReady, listChildren, trailOf, ensurePath, startUpload, trash,
  authUrl, exchangeCode, revokeToken, seal, unseal, signState, readState, folderIdFrom, accountOf, folderInfo,
} from "@/lib/googleDrive.mjs";

export const runtime = "nodejs";
const STORE_KEY = "drive_oauth"; // { enc, email, root, root_name, connected_at, by } — رمز التحديث مشفّر

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
  const [{ data: users }, { data: perms }, { data: fin }, { data: stored }] = await Promise.all([
    sb.from("users").select("*"),
    sb.from("app_settings").select("value").eq("key", "permissions").maybeSingle(),
    sb.from("app_settings").select("value").eq("key", "finance_access").maybeSingle(),
    sb.from("app_settings").select("value").eq("key", STORE_KEY).maybeSingle(),
  ]);
  const email = who.user.email.trim().toLowerCase();
  if (!isActiveUserEmail(users, email)) return { error: "حسابك غير مخوّل.", status: 403 };
  const user = (users || []).find((u) => String(u.email || "").trim().toLowerCase() === email);
  const p = resolvePerms(user, perms?.value || {}, fin?.value || null);
  return { sb, user, level: p.sections.drive || "none", admin: atLeast(p.sections.settings, "edit"), stored: stored?.value || null };
}

// الإعداد الفعلي: مفاتيح البيئة + الحساب المربوط (رمزه المشفّر والمجلد الرئيسي)
function loadCfg(stored) {
  const cfg = driveConfig();
  if (cfg?.mode === "oauth" && stored) {
    if (!cfg.refreshToken && stored.enc) { try { cfg.refreshToken = unseal(cfg, stored.enc); } catch {} }
    if (!cfg.root && stored.root) cfg.root = stored.root;
  }
  return cfg;
}

const NEED = { status: "view", list: "view", trail: "view", ensure: "edit", upload: "edit", trash: "edit", connect: "admin", finish: "admin", disconnect: "admin" };
const fail = (error, status) => Response.json({ error }, { status });

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return fail("طلب غير صالح.", 400);
  }
  const need = NEED[body?.action];
  if (!need) return fail("إجراء غير معروف.", 400);

  const auth = await authorize(req).catch(() => ({ error: "تعذّر التحقق من الهوية.", status: 500 }));
  if (auth.error) return fail(auth.error, auth.status);
  if (need === "admin" ? !auth.admin : !atLeast(auth.level, need)) return fail("لا تملك صلاحية على هذا الإجراء في Google Drive.", 403);

  const cfg = loadCfg(auth.stored);
  const { action } = body;
  const origin = req.headers.get("origin") || new URL(req.url).origin;

  try {
    if (action === "status") {
      return Response.json({
        ready: driveReady(cfg),
        mode: cfg?.mode || null,
        canConnect: auth.admin && cfg?.mode === "oauth",
        admin: auth.admin,
        account: cfg?.mode === "oauth" ? auth.stored?.email || "" : cfg?.email || "",
        rootName: auth.stored?.root_name || "",
        redirectUri: `${origin}/drive`,
      });
    }

    if (action === "connect") {
      if (cfg?.mode !== "oauth") return fail("أضف GOOGLE_OAUTH_CLIENT_ID و GOOGLE_OAUTH_CLIENT_SECRET في إعدادات Vercel أولاً.", 503);
      const root = folderIdFrom(body.folder);
      if (!root) return fail("الصق رابط المجلد الرئيسي في Drive (يحتوي على /folders/).", 400);
      const redirectUri = `${origin}/drive`;
      const state = signState(cfg, { uid: auth.user?.id, root, redirectUri, exp: Date.now() + 15 * 60000 });
      return Response.json({ url: authUrl(cfg, { redirectUri, state }) });
    }

    if (action === "finish") {
      if (cfg?.mode !== "oauth") return fail("ربط حساب Google غير مفعّل في الخادم.", 503);
      const st = readState(cfg, body.state);
      if (!st || st.uid !== auth.user?.id) return fail("انتهت صلاحية طلب الربط أو بدأه شخص آخر — أعد المحاولة.", 400);
      const refreshToken = await exchangeCode(cfg, { code: String(body.code || ""), redirectUri: st.redirectUri });
      const linked = { ...cfg, refreshToken, root: st.root };
      const [me, folder] = await Promise.all([accountOf(linked), folderInfo(linked, st.root)]);
      const value = { enc: seal(cfg, refreshToken), email: me.emailAddress || "", root: folder.id, root_name: folder.name, connected_at: new Date().toISOString(), by: auth.user?.name || "" };
      const { error } = await auth.sb.from("app_settings").upsert({ key: STORE_KEY, value, updated_at: new Date().toISOString() });
      if (error) return fail(`تعذّر حفظ الربط: ${error.message}`, 500);
      return Response.json({ ok: true, account: value.email, rootName: value.root_name });
    }

    if (action === "disconnect") {
      if (cfg?.refreshToken && !process.env.GOOGLE_OAUTH_REFRESH_TOKEN) await revokeToken(cfg.refreshToken);
      await auth.sb.from("app_settings").upsert({ key: STORE_KEY, value: null, updated_at: new Date().toISOString() });
      return Response.json({ ok: true });
    }

    if (!driveReady(cfg)) return fail("Google Drive غير مربوط بعد.", 503);
    const { id, parent, names, name, mime, size } = body;
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
      if (!name) return fail("اسم الملف مطلوب.", 400);
      const url = await startUpload(cfg, { parent, name: String(name).slice(0, 250), mime, size, origin });
      return Response.json({ url });
    }
    if (action === "trash") {
      await trash(cfg, id);
      return Response.json({ ok: true });
    }
  } catch (e) {
    return fail(e?.message || "خطأ في Google Drive.", e?.status && e.status < 600 ? e.status : 500);
  }
}
