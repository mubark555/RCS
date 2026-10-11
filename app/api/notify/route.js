// مسار آمن (سيرفر فقط) لإرسال إشعارات البريد عبر Resend.
// المفتاح السرّي RESEND_API_KEY يُقرأ من بيئة Vercel ولا يُكشف للمتصفح.

export const runtime = "nodejs";

export async function POST(req) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return Response.json({ error: "RESEND_API_KEY غير مضبوط في بيئة الخادم." }, { status: 500 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  const { to, subject, html, fromName } = payload || {};
  const recipients = (Array.isArray(to) ? to : [to])
    .map((x) => String(x || "").trim())
    .filter((x) => x && x.includes("@"));

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
