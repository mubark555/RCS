// إرسال البريد من الخادم: يدعم Resend (HTTP API) أو أي خادم SMTP (Gmail / Outlook / Zoho…)
import nodemailer from "nodemailer";

const env = (k) => (process.env[k] || "").trim();

export function mailConfig() {
  const from = env("EMAIL_FROM");
  if (env("RESEND_API_KEY")) return { provider: "resend", from: from || "onboarding@resend.dev" };
  if (env("SMTP_HOST")) return { provider: "smtp", from: from || env("SMTP_USER") };
  return { provider: null, from: from || "" };
}

// "اسم <email>" → { name, email }
export function parseFrom(from) {
  const m = String(from || "").match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: "", email: String(from || "").trim() };
}

let _transport = null;
function smtp() {
  if (_transport) return _transport;
  const port = Number(env("SMTP_PORT") || 587);
  _transport = nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port,
    secure: env("SMTP_SECURE") ? env("SMTP_SECURE") === "true" : port === 465,
    auth: env("SMTP_USER") ? { user: env("SMTP_USER"), pass: env("SMTP_PASS") } : undefined,
  });
  return _transport;
}

/**
 * msg: { to, subject, html, text, replyTo, ics: { method, content } }
 */
export async function sendMail(msg) {
  const cfg = mailConfig();
  if (!cfg.provider) throw new Error("لم يتم إعداد مزوّد البريد (RESEND_API_KEY أو SMTP_HOST)");
  const replyTo = msg.replyTo || env("EMAIL_REPLY_TO") || undefined;

  if (cfg.provider === "resend") {
    const body = {
      from: cfg.from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(msg.ics
        ? {
            attachments: [{
              filename: msg.ics.method === "CANCEL" ? "cancel.ics" : "invite.ics",
              content: Buffer.from(msg.ics.content, "utf8").toString("base64"),
              content_type: `text/calendar; charset=utf-8; method=${msg.ics.method}`,
            }],
          }
        : {}),
    };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Resend HTTP ${res.status}`);
    return { id: data.id };
  }

  const info = await smtp().sendMail({
    from: cfg.from,
    to: msg.to,
    replyTo,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    ...(msg.ics
      ? { icalEvent: { method: msg.ics.method, filename: msg.ics.method === "CANCEL" ? "cancel.ics" : "invite.ics", content: msg.ics.content } }
      : {}),
  });
  return { id: info.messageId };
}
