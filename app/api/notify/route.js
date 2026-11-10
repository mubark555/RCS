// مسار آمن (سيرفر فقط) لإرسال إشعارات البريد عبر Resend.
// المفتاح السرّي RESEND_API_KEY يُقرأ من بيئة Vercel ولا يُكشف للمتصفح.
// الحماية: يتطلب جلسة دخول صالحة لمستخدم نشط في النظام، ولا يرسل إلا إلى
// بريد مستخدمي النظام أو البريد الإضافي المحفوظ في إعدادات الإشعارات.

import { createClient } from "@supabase/supabase-js";
import { allowedRecipients, isActiveUserEmail, checkRecipients } from "@/lib/notifyGuard.mjs";
import { fromWithName, DEFAULT_FROM, cleanAttachments, sendResend } from "@/lib/resend.mjs";

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

  // مرفق دعوة التقويم (اختياري — ملفات .ics فقط)
  const att = cleanAttachments(payload?.attachments);
  if (!att.ok) return Response.json({ error: att.error }, { status: 400 });

  // اسم مُرسِل مخصّص من الإعدادات: نستبدل الاسم الظاهر مع الإبقاء على عنوان
  // البريد الموثّق (الجزء داخل < >) كما هو، حفاظاً على صحة الإرسال.
  const from = fromWithName(DEFAULT_FROM(), fromName);

  try {
    const r = await sendResend({ key, from, to: recipients, subject, html, attachments: att.attachments });
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status || 502 });
    return Response.json({ ok: true, id: r.id });
  } catch (e) {
    return Response.json({ error: e?.message || "خطأ في الاتصال بخدمة البريد." }, { status: 502 });
  }
}
