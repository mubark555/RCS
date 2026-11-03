// قوالب البريد الإلكتروني (HTML + نص) ودعوات التقويم (ICS) — تُستخدم على الخادم فقط
import { NOTIFY_EVENTS, asArray, reminderLabel } from "../notify-core";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
const isUrl = (s) => /^https?:\/\//i.test(String(s || "").trim());

const STATUS_AR = { Scheduled: "مجدول", Done: "منتهي", Cancelled: "ملغى" };

export function fmtDateParts(iso, tz) {
  const d = new Date(iso);
  const opt = (o) => {
    try { return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: tz, ...o }); }
    catch { return d.toLocaleString("ar", o); }
  };
  let hijri = "";
  try {
    hijri = d.toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", { timeZone: tz, day: "numeric", month: "long", year: "numeric" });
  } catch {}
  return {
    date: opt({ weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    time: opt({ hour: "2-digit", minute: "2-digit" }),
    hijri,
  };
}

function endOf(m) {
  return new Date(new Date(m.start_at).getTime() + (Number(m.duration) || 30) * 60000);
}
const icsDate = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(m, appName) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title || "اجتماع",
    dates: `${icsDate(new Date(m.start_at))}/${icsDate(endOf(m))}`,
    details: [lines(m.agenda).map((x) => `• ${x}`).join("\n"), appName ? `— ${appName}` : ""].filter(Boolean).join("\n\n"),
    location: m.location || "",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// ---------------- ICS ----------------
function icsText(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
// طيّ الأسطر عند 75 بايت دون كسر حروف UTF-8
function fold(line) {
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(m, { method = "REQUEST", recipients = [], organizerEmail, organizerName, appName }) {
  const cancelled = method === "CANCEL";
  const seq = Math.floor(Date.now() / 1000) % 2147483647;
  const desc = [
    lines(m.agenda).length ? "جدول الأعمال:\n" + lines(m.agenda).map((x) => `• ${x}`).join("\n") : "",
    m.project ? `المشروع: ${m.project}` : "",
  ].filter(Boolean).join("\n\n");
  const L = [
    "BEGIN:VCALENDAR",
    `PRODID:-//${icsText(appName || "Violet")}//Meetings//AR`,
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:meeting-${m.id}@seem-prime`,
    `SEQUENCE:${seq}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(new Date(m.start_at))}`,
    `DTEND:${icsDate(endOf(m))}`,
    `SUMMARY:${icsText(m.title)}`,
    desc ? `DESCRIPTION:${icsText(desc)}` : null,
    m.location ? `LOCATION:${icsText(m.location)}` : null,
    isUrl(m.location) ? `URL:${icsText(m.location)}` : null,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    organizerEmail ? `ORGANIZER;CN=${icsText(organizerName || appName || "")}:mailto:${organizerEmail}` : null,
    ...recipients.map((r) => `ATTENDEE;CN=${icsText(r.name || r.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${r.email}`),
    ...(cancelled ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:تذكير بالاجتماع", "TRIGGER:-PT15M", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return L.map(fold).join("\r\n") + "\r\n";
}

// ---------------- HTML ----------------
function row(k, v) {
  return `<tr><td style="padding:9px 0;color:#8a8078;font-size:13px;font-weight:700;width:110px;vertical-align:top;border-bottom:1px dashed #eee6dc">${esc(k)}</td><td style="padding:9px 0;color:#2b2a32;font-size:14px;border-bottom:1px dashed #eee6dc">${v}</td></tr>`;
}
function button(href, label, bg, fg = "#ffffff", border) {
  return `<a href="${esc(href)}" target="_blank" style="display:inline-block;margin:4px;padding:11px 20px;border-radius:12px;background:${bg};color:${fg};font-weight:700;font-size:14px;text-decoration:none;${border ? `border:1px solid ${border};` : ""}">${esc(label)}</a>`;
}
function section(title, color, body) {
  return `<tr><td style="padding:18px 28px 0"><div style="font-size:14px;font-weight:800;color:${color};margin-bottom:8px;border-right:4px solid ${color};padding-right:8px">${esc(title)}</div>${body}</td></tr>`;
}
function bulletList(arr) {
  return `<ul style="margin:0;padding-right:20px;padding-left:0;color:#3d3b44;font-size:14px;line-height:1.9">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
}

function intro(event, m, ctx) {
  switch (event) {
    case "created": return `تمت دعوتك لحضور اجتماع <b>«${esc(m.title)}»</b>. تجد التفاصيل أدناه، ويمكنك إضافته مباشرة إلى تقويمك.`;
    case "updated": return `تم تحديث بيانات اجتماع <b>«${esc(m.title)}»</b>${ctx.changes?.length ? ` — التغييرات: <b>${esc(ctx.changes.join("، "))}</b>` : ""}. يرجى مراجعة الموعد الجديد.`;
    case "cancelled": return `نعتذر، تم <b style="color:#dc2626">إلغاء</b> اجتماع <b>«${esc(m.title)}»</b>. لا حاجة لأي إجراء من طرفك، وسيُحذف من تقويمك تلقائياً إن كان مضافاً.`;
    case "closed": return `انتهى اجتماع <b>«${esc(m.title)}»</b>. نرفق لك ملخص المحضر والقرارات والمهام الناتجة عنه.`;
    case "reminder": return `تذكير: اجتماع <b>«${esc(m.title)}»</b> يبدأ <b>${esc(ctx.relative || "قريباً")}</b>.`;
    case "test": return `هذه رسالة تجريبية للتأكد من أن إعدادات البريد في النظام تعمل بشكل صحيح ✅`;
    default: return "";
  }
}

export function relativeStart(m, now = Date.now()) {
  const mins = Math.round((new Date(m.start_at).getTime() - now) / 60000);
  if (mins <= 0) return "الآن";
  if (mins < 60) return `بعد ${mins} دقيقة`;
  const h = Math.round(mins / 60);
  if (h < 24) return h === 1 ? "بعد ساعة" : h === 2 ? "بعد ساعتين" : `بعد ${h} ساعات`;
  const d = Math.round(h / 24);
  return d === 1 ? "غداً (بعد يوم)" : d === 2 ? "بعد يومين" : `بعد ${d} أيام`;
}

export function subjectFor(event, m, ctx = {}) {
  const t = m?.title || "";
  switch (event) {
    case "created": return `📅 دعوة اجتماع: ${t}`;
    case "updated": return `🔄 تحديث موعد الاجتماع: ${t}`;
    case "cancelled": return `❌ تم إلغاء الاجتماع: ${t}`;
    case "closed": return `✅ محضر وقرارات الاجتماع: ${t}`;
    case "reminder": return `⏰ تذكير: ${t} — ${ctx.relative || reminderLabel(ctx.offset)}`;
    case "test": return `✉️ رسالة تجريبية من ${ctx.brand?.appName || "النظام"}`;
    default: return t;
  }
}

/**
 * يبني البريد لمستلم واحد.
 * ctx: { brand:{appName,primaryColor,tagline}, tz, appUrl, recipient:{name,email}, changes, relative, offset }
 */
export function renderEmail(event, m, ctx) {
  const brand = ctx.brand || {};
  const appName = brand.appName || "ڤيوليت";
  const primary = /^#[0-9a-f]{3,8}$/i.test(brand.primaryColor || "") ? brand.primaryColor : "#e05a50";
  const ev = NOTIFY_EVENTS[event] || NOTIFY_EVENTS.created;
  const accent = event === "created" ? primary : ev.color;
  const r = ctx.recipient || {};
  const greeting = r.name ? `مرحباً ${esc(r.name)}،` : "مرحباً،";
  const subject = subjectFor(event, m, ctx);

  let body = "";
  let text = `${r.name ? `مرحباً ${r.name}،` : "مرحباً،"}\n\n${intro(event, m, ctx).replace(/<[^>]+>/g, "")}\n\n`;

  if (event !== "test" && m) {
    const when = fmtDateParts(m.start_at, ctx.tz);
    const attendees = asArray(m.attendees);
    const loc = m.location
      ? isUrl(m.location) ? `<a href="${esc(m.location)}" style="color:${primary};font-weight:700" target="_blank">${esc(m.location)}</a>` : esc(m.location)
      : "—";
    const details =
      row("التاريخ", `${esc(when.date)}${when.hijri ? `<div style="color:#a49c94;font-size:12px">${esc(when.hijri)}</div>` : ""}`) +
      row("الوقت", `${esc(when.time)} <span style="color:#a49c94;font-size:12px">(${esc(ctx.tz)})</span>`) +
      row("المدة", `${esc(m.duration || 30)} دقيقة`) +
      (m.project ? row("المشروع", esc(m.project)) : "") +
      row("المكان / الرابط", loc) +
      (event === "closed" || event === "cancelled" ? row("الحالة", esc(STATUS_AR[m.status] || m.status)) : "") +
      (attendees.length ? row("الحضور", attendees.map((a) => `<span style="display:inline-block;background:#f4efe8;border:1px solid #ece5da;border-radius:20px;padding:2px 10px;margin:2px;font-size:12px">${esc(a)}</span>`).join("")) : "");

    body += `<tr><td style="padding:18px 28px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf6f0;border:1px solid #ece5da;border-radius:14px;padding:6px 16px">${details}</table></td></tr>`;
    text += `الموعد: ${when.date} — ${when.time} (${ctx.tz})\nالمدة: ${m.duration || 30} دقيقة\n${m.project ? `المشروع: ${m.project}\n` : ""}المكان: ${m.location || "—"}\n${attendees.length ? `الحضور: ${attendees.join("، ")}\n` : ""}`;

    const agenda = lines(m.agenda);
    if (agenda.length && event !== "cancelled") {
      body += section("جدول الأعمال", accent, bulletList(agenda));
      text += `\nجدول الأعمال:\n${agenda.map((x) => `• ${x}`).join("\n")}\n`;
    }

    if (event === "closed") {
      const minutes = lines(m.minutes);
      body += section("ملخص المحضر", accent, minutes.length ? bulletList(minutes) : `<div style="color:#a49c94;font-size:13px">لم يُدوَّن محضر لهذا الاجتماع.</div>`);
      if (minutes.length) text += `\nملخص المحضر:\n${minutes.map((x) => `• ${x}`).join("\n")}\n`;
      const items = Array.isArray(m.action_items) ? m.action_items.filter((a) => a?.text) : [];
      if (items.length) {
        const mine = items.filter((a) => r.name && a.assignee === r.name);
        const rows = items.map((a) => {
          const me = r.name && a.assignee === r.name;
          return `<tr style="${me ? "background:#fff6e0;" : ""}"><td style="padding:8px 10px;border:1px solid #ece5da;font-size:13px">${esc(a.text)}${me ? ` <b style="color:#d97706">(مهمتك)</b>` : ""}</td><td style="padding:8px 10px;border:1px solid #ece5da;font-size:13px;white-space:nowrap">${esc(a.assignee || "—")}</td><td style="padding:8px 10px;border:1px solid #ece5da;font-size:13px;white-space:nowrap">${esc(a.due || "—")}</td></tr>`;
        }).join("");
        body += section(
          `القرارات والمهام الناتجة (${items.length})${mine.length ? ` — لديك ${mine.length}` : ""}`,
          accent,
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;text-align:right"><tr style="background:#faf6f0"><th style="padding:8px 10px;border:1px solid #ece5da;font-size:12px;color:#6a6058">القرار / المهمة</th><th style="padding:8px 10px;border:1px solid #ece5da;font-size:12px;color:#6a6058">المسؤول</th><th style="padding:8px 10px;border:1px solid #ece5da;font-size:12px;color:#6a6058">الاستحقاق</th></tr>${rows}</table>`
        );
        text += `\nالقرارات والمهام:\n${items.map((a) => `• ${a.text} — ${a.assignee || "غير مُسند"}${a.due ? ` (${a.due})` : ""}`).join("\n")}\n`;
      }
      const links = Array.isArray(m.links) ? m.links.filter((l) => l?.url) : [];
      if (links.length) {
        body += section("المرفقات والروابط", accent, `<div>${links.map((l) => `<div style="margin:4px 0"><a href="${esc(l.url)}" style="color:${primary};font-weight:700" target="_blank">${esc(l.label || l.type || l.url)}</a> <span style="color:#a49c94;font-size:12px">${esc(l.type || "")}</span></div>`).join("")}</div>`);
      }
    }

    // أزرار الإجراءات
    const btns = [];
    if (event !== "cancelled" && event !== "closed" && isUrl(m.location)) btns.push(button(m.location, "الانضمام للاجتماع", accent));
    if (event === "created" || event === "updated") btns.push(button(googleCalendarUrl(m, appName), "إضافة إلى Google Calendar", "#ffffff", "#2b2a32", "#e0d8ca"));
    if (ctx.appUrl) btns.push(button(`${ctx.appUrl.replace(/\/$/, "")}/meetings`, "فتح في النظام", "#ffffff", "#2b2a32", "#e0d8ca"));
    if (btns.length) body += `<tr><td align="center" style="padding:22px 20px 0">${btns.join("")}</td></tr>`;
    if (event === "created" || event === "updated") {
      body += `<tr><td style="padding:12px 28px 0;color:#a49c94;font-size:12px;text-align:center">📎 مرفق دعوة تقويم (invite.ics) تعمل مع Outlook و Google و Apple Calendar.</td></tr>`;
    }
    if (isUrl(m.location)) text += `\nرابط الاجتماع: ${m.location}\n`;
  }

  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4efe8;font-family:Tahoma,'Segoe UI','Noto Sans Arabic',Arial,sans-serif;direction:rtl">
<div style="display:none;max-height:0;overflow:hidden">${esc(intro(event, m || {}, ctx).replace(/<[^>]+>/g, ""))}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe8;padding:24px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(66,48,40,.09);text-align:right" dir="rtl">
  <tr><td style="background:${primary};padding:20px 28px;color:#fff">
    <div style="font-size:22px;font-weight:800">${esc(appName)}</div>
    ${brand.tagline ? `<div style="font-size:10px;letter-spacing:3px;opacity:.85;font-weight:700">${esc(brand.tagline)}</div>` : ""}
  </td></tr>
  <tr><td style="padding:22px 28px 0">
    <span style="display:inline-block;background:${accent}1f;color:${accent};border-radius:20px;padding:4px 12px;font-size:12px;font-weight:800">${esc(ev.ar)}</span>
    <h1 style="margin:12px 0 6px;font-size:20px;color:#2c2b34">${esc(event === "test" ? "تم إعداد البريد بنجاح" : m?.title || "")}</h1>
    <p style="margin:0;color:#3d3b44;font-size:15px;line-height:1.9">${greeting}<br>${intro(event, m || {}, ctx)}</p>
  </td></tr>
  ${body}
  <tr><td style="padding:26px 28px 22px"><div style="border-top:1px solid #eee6dc;padding-top:14px;color:#a49c94;font-size:11.5px;line-height:1.8">
    هذه رسالة آلية من نظام ${esc(appName)} لإدارة المشاريع — وصلتك لأنك ضمن حضور هذا الاجتماع.
  </div></td></tr>
</table></td></tr></table></body></html>`;

  text += `\n—\n${appName}`;
  return { subject, html, text };
}
