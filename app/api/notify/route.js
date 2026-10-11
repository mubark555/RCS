// مسار آمن (سيرفر فقط) لإرسال إشعارات البريد عبر Resend.
// المفتاح السرّي RESEND_API_KEY يُقرأ من بيئة Vercel ولا يُكشف للمتصفح.
// الحماية: يتطلب جلسة دخول صالحة لمستخدم نشط في النظام، ولا يرسل إلا إلى
// بريد مستخدمي النظام أو البريد الإضافي المحفوظ في إعدادات الإشعارات.

import { createClient } from "@supabase/supabase-js";
import { allowedRecipients, isActiveUserEmail, checkRecipients } from "@/lib/notifyGuard.mjs";

export const runtime = "nodejs";

async function authorize(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: "إرسال البريد متاح في الوضع السحابي فقط.", status: 503 };
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "يجب تسجيل الدخول لإرسال البريد.", status: 401 };
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: who, error } = await sb.auth.getUser(token);
  if (error || !who?.user?.email) return { error: "جلسة الدخول غير صالحة.", status: 401 };
  const [{ data: users }, { data: setting }] = await Promise.all([
    sb.from("users").select("email,status"),
    sb.from("app_settings").select("value").eq("key", "notify").maybeSingle(),
  ]);
  if (!isActiveUserEmail(users, who.user.email)) return { error: "حسابك غير مخوّل بإرسال البريد.", status: 403 };
  return { allowed: allowedRecipients(users, setting?.value) };
}

export async function POST(req) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return Response.json({ error: "RESEND_API_KEY غير مضبوط في بيئة الخادم." }, { status: 500 });
  }

  const auth = await authorize(req).catch(() => ({ error: "تعذّر التحقق من الهوية.", status: 500 }));
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  let payload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  const { to, subject, html, fromName } = payload || {};
  const check = checkRecipients(to, auth.allowed);
  if (!check.ok) {
    return Response.json({ error: `مستقبِلون غير مسموح بهم (ليسوا من مستخدمي النظام ولا من البريد الإضافي المحفوظ): ${check.rejected.join("، ")}` }, { status: 403 });
  }
  const recipients = check.recipients;

  if (!recipients.length || !subject) {
    return Response.json({ error: "الحقول المطلوبة ناقصة (المستقبلون / العنوان)." }, { status: 400 });
  }

  const baseFrom = process.env.NOTIFY_FROM || "سيم برايم <no-reply@vuletmedia.com>";
  // اسم مُرسِل مخصّص من الإعدادات: نستبدل الاسم الظاهر مع الإبقاء على عنوان
  // البريد الموثّق (الجزء داخل < >) كما هو، حفاظاً على صحة الإرسال.
  let from = baseFrom;
  const name = String(fromName || "").trim().replace(/[<>"]/g, "");
  if (name) {
    const m = baseFrom.match(/<([^>]+)>/);
    const addr = m ? m[1] : baseFrom;
    from = `${name} <${addr}>`;
  }

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: recipients, subject, html: html || subject }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json({ error: data?.message || "فشل الإرسال." }, { status: r.status });
    }
    return Response.json({ ok: true, id: data?.id });
  } catch (e) {
    return Response.json({ error: e?.message || "خطأ في الاتصال بخدمة البريد." }, { status: 502 });
  }
}
