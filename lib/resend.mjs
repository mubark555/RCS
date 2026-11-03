// إرسال البريد عبر Resend — مشترك بين /api/notify ومهمة التذكيرات المجدولة (خادم فقط)

// اسم مُرسِل مخصّص مع الإبقاء على عنوان البريد الموثّق كما هو
export function fromWithName(baseFrom, fromName) {
  const name = String(fromName || "").trim().replace(/[<>"]/g, "");
  if (!name) return baseFrom;
  const m = baseFrom.match(/<([^>]+)>/);
  return `${name} <${m ? m[1] : baseFrom}>`;
}

export const DEFAULT_FROM = () => process.env.NOTIFY_FROM || "سيم برايم <no-reply@vuletmedia.com>";

// مرفقات مسموحة: دعوات تقويم فقط (.ics)، بحد أقصى 2 وبحجم صغير — حتى لا يُساء استخدام المسار
export function cleanAttachments(list) {
  if (!Array.isArray(list) || !list.length) return { ok: true, attachments: undefined };
  if (list.length > 2) return { ok: false, error: "عدد المرفقات كبير." };
  const out = [];
  for (const a of list) {
    const filename = String(a?.filename || "");
    const content = String(a?.content || "");
    if (!/^[\w.-]{1,40}\.ics$/.test(filename)) return { ok: false, error: "نوع مرفق غير مسموح." };
    if (!/^[A-Za-z0-9+/=]+$/.test(content) || content.length > 200_000) return { ok: false, error: "مرفق غير صالح." };
    const method = /method=CANCEL/i.test(String(a?.content_type || "")) ? "CANCEL" : "REQUEST";
    out.push({ filename, content, content_type: `text/calendar; charset=utf-8; method=${method}` });
  }
  return { ok: true, attachments: out };
}

export async function sendResend({ key, from, to, subject, html, attachments }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html: html || subject, ...(attachments ? { attachments } : {}) }),
  });
  const data = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: data?.id } : { ok: false, status: r.status, error: data?.message || "فشل الإرسال." };
}
