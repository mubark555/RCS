// بريد الاجتماعات للحضور — دوال نقية (قابلة للاختبار بـ node --test)
// • دعوة عند الإنشاء، وتحديث عند تغيّر الموعد/المكان/الحضور، وإلغاء، وتذكير قبل الموعد
// • مرفق تقويم (ICS) يعمل مع Outlook و Google و Apple Calendar
// المحضر المعتمد يُرسل من دورة اعتماد المحضر الموجودة (لا تكرار هنا).
import { isMe } from "./mywork.mjs";

export const MEETING_MAIL_KINDS = {
  invite: { ar: "دعوة لاجتماع", color: "#E36A62" },
  update: { ar: "تحديث على الاجتماع", color: "#2563eb" },
  cancel: { ar: "إلغاء الاجتماع", color: "#dc2626" },
  reminder: { ar: "تذكير بالاجتماع", color: "#d97706" },
};

export const REMINDER_OPTIONS = [
  { min: 10, ar: "قبل 10 دقائق" },
  { min: 30, ar: "قبل 30 دقيقة" },
  { min: 60, ar: "قبل ساعة" },
  { min: 180, ar: "قبل 3 ساعات" },
  { min: 1440, ar: "قبل يوم" },
  { min: 2880, ar: "قبل يومين" },
];
export const DEFAULT_REMINDERS = [1440, 60];

export const DEFAULT_MEETING_MAIL = {
  invite: true,     // دعوة الحضور عند الإنشاء
  update: true,     // عند تغيّر الموعد أو المكان أو الحضور
  cancel: true,     // عند الإلغاء أو حذف اجتماع قادم
  reminders: true,  // التذكير قبل الموعد
  defaultReminders: DEFAULT_REMINDERS,
  includeIcs: true, // إرفاق دعوة تقويم
};

export function reminderLabel(min) {
  const o = REMINDER_OPTIONS.find((x) => x.min === Number(min));
  if (o) return o.ar;
  const m = Number(min);
  if (m % 1440 === 0) return `قبل ${m / 1440} يوم`;
  if (m % 60 === 0) return `قبل ${m / 60} ساعة`;
  return `قبل ${m} دقيقة`;
}

function parseAttendees(v) {
  if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
  const s = String(v || "").trim();
  if (!s) return [];
  if (s.startsWith("[")) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch {} }
  return s.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
}

// المستلمون: المدعوون + المنظّم (من لديه بريد وغير موقوف)، بلا تكرار
export function meetingRecipients(m, users) {
  const names = [...parseAttendees(m?.attendees), m?.organizer || m?.created_by || ""].filter(Boolean);
  const active = (users || []).filter((u) => u && u.status !== "suspended");
  const seen = new Set();
  const recipients = [];
  const missing = [];
  for (const n of names) {
    const u = active.find((x) => isMe(n, x));
    const email = String(u?.email || "").trim().toLowerCase();
    if (!email.includes("@")) { if (!missing.includes(n)) missing.push(n); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ name: u.name, email });
  }
  return { recipients, missing };
}

export function meetingReminders(m, prefs = DEFAULT_MEETING_MAIL) {
  if (Array.isArray(m?.reminders)) return m.reminders.map(Number).filter((x) => x > 0);
  return (prefs?.defaultReminders || DEFAULT_REMINDERS).map(Number);
}

// التذكير المستحق الآن: أصغر فترة دخلنا نافذتها ولم تُرسل. الفترات الأكبر التي فاتت تُتخطّى.
export function dueReminder(m, now = Date.now(), prefs = DEFAULT_MEETING_MAIL) {
  if (!m || (m.status && m.status !== "Scheduled") || !m.start_at || m.notify_attendees === false) return null;
  const start = new Date(m.start_at).getTime();
  if (!(start > now)) return null;
  const sent = new Set((Array.isArray(m.reminders_sent) ? m.reminders_sent : []).map(Number));
  const entered = meetingReminders(m, prefs).filter((off) => now >= start - off * 60000).sort((a, b) => a - b);
  if (!entered.length || sent.has(entered[0])) return null;
  return { offset: entered[0], skip: entered.slice(1).filter((x) => !sent.has(x)) };
}

// نوع البريد المناسب بعد الحفظ (null = لا بريد)
export function detectMeetingMail(prev, next) {
  const st = next?.status || "Scheduled";
  if (!prev) return st === "Scheduled" ? "invite" : null;
  if (prev.status !== "Cancelled" && st === "Cancelled") return "cancel";
  if (st !== "Scheduled") return null;
  if (prev.status === "Cancelled") return "invite"; // أُعيد تفعيله
  return diffMeeting(prev, next).length ? "update" : null;
}

export function diffMeeting(prev, next) {
  if (!prev) return [];
  const out = [];
  if ((prev.title || "") !== (next.title || "")) out.push("العنوان");
  if (new Date(prev.start_at || 0).getTime() !== new Date(next.start_at || 0).getTime()) out.push("الموعد");
  if (Number(prev.duration || 30) !== Number(next.duration || 30)) out.push("المدة");
  if ((prev.location || "") !== (next.location || "")) out.push("المكان / الرابط");
  const a = parseAttendees(prev.attendees).sort().join("|");
  const b = parseAttendees(next.attendees).sort().join("|");
  if (a !== b) out.push("الحضور");
  return out;
}

export function relativeStart(m, now = Date.now()) {
  const mins = Math.round((new Date(m.start_at).getTime() - now) / 60000);
  if (mins <= 0) return "الآن";
  if (mins < 60) return `بعد ${mins} دقيقة`;
  const h = Math.round(mins / 60);
  if (h < 24) return h === 1 ? "بعد ساعة" : h === 2 ? "بعد ساعتين" : `بعد ${h} ساعات`;
  const d = Math.round(h / 24);
  return d === 1 ? "غداً" : d === 2 ? "بعد يومين" : `بعد ${d} أيام`;
}

// ---------------- التقويم ----------------
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const endOf = (m) => new Date(new Date(m.start_at).getTime() + (Number(m.duration) || 30) * 60000);
const isUrl = (s) => /^https?:\/\//i.test(String(s || "").trim());
const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);

export function googleCalendarUrl(m) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title || "اجتماع",
    dates: `${icsDate(m.start_at)}/${icsDate(endOf(m))}`,
    details: lines(m.agenda).map((x) => `• ${x}`).join("\n"),
    location: m.location || "",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// طيّ الأسطر عند 75 بايت دون كسر الحروف العربية (UTF-8)
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// method: REQUEST (دعوة/تحديث) | CANCEL (إلغاء)
export function buildIcs(m, { method = "REQUEST", recipients = [], organizerEmail = "", organizerName = "", now = Date.now() } = {}) {
  const cancelled = method === "CANCEL";
  const desc = [
    m.objective ? `الهدف: ${m.objective}` : "",
    lines(m.agenda).length ? "جدول الأعمال:\n" + lines(m.agenda).map((x) => `• ${x}`).join("\n") : "",
    m.project ? `المشروع: ${m.project}` : "",
  ].filter(Boolean).join("\n\n");
  const L = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Seem Prime//Meetings//AR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:meeting-${m.id}@seem-prime`,
    `SEQUENCE:${Math.floor(now / 1000) % 2147483647}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(m.start_at)}`,
    `DTEND:${icsDate(endOf(m))}`,
    `SUMMARY:${icsText(m.title)}`,
    desc ? `DESCRIPTION:${icsText(desc)}` : null,
    m.location ? `LOCATION:${icsText(m.location)}` : null,
    isUrl(m.location) ? `URL:${icsText(m.location)}` : null,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    organizerEmail ? `ORGANIZER;CN=${icsText(organizerName || "")}:mailto:${organizerEmail}` : null,
    ...recipients.map((r) => `ATTENDEE;CN=${icsText(r.name || r.email)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${r.email}`),
    ...(cancelled ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:تذكير بالاجتماع", "TRIGGER:-PT15M", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return L.map(fold).join("\r\n") + "\r\n";
}

// ---------------- البريد ----------------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function fmtWhen(iso, tz) {
  const d = new Date(iso);
  const o = (x) => { try { return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: tz || undefined, ...x }); } catch { return d.toLocaleString("ar", x); } };
  return { date: o({ weekday: "long", year: "numeric", month: "long", day: "numeric" }), time: o({ hour: "2-digit", minute: "2-digit" }) };
}

export function meetingSubject(kind, m, ctx = {}) {
  const t = m?.title || "";
  if (kind === "invite") return `📅 دعوة اجتماع: ${t}`;
  if (kind === "update") return `🔄 تحديث على الاجتماع: ${t}`;
  if (kind === "cancel") return `❌ تم إلغاء الاجتماع: ${t}`;
  if (kind === "reminder") return `⏰ تذكير: ${t} — ${ctx.relative || reminderLabel(ctx.offset)}`;
  return t;
}

/**
 * ctx: { appUrl, tz, changes, relative, offset, attendance(name→type) }
 */
export function meetingEmailHtml(kind, m, ctx = {}) {
  const k = MEETING_MAIL_KINDS[kind] || MEETING_MAIL_KINDS.invite;
  const when = fmtWhen(m.start_at, ctx.tz);
  const attendees = parseAttendees(m.attendees);
  const intro = {
    invite: `تمت دعوتك لحضور اجتماع <b>«${esc(m.title)}»</b>. يمكنك إضافته مباشرة إلى تقويمك.`,
    update: `تم تحديث اجتماع <b>«${esc(m.title)}»</b>${ctx.changes?.length ? ` — التغييرات: <b>${esc(ctx.changes.join("، "))}</b>` : ""}.`,
    cancel: `تم <b style="color:#dc2626">إلغاء</b> اجتماع <b>«${esc(m.title)}»</b>، وسيُحذف من تقويمك تلقائياً إن كان مضافاً.`,
    reminder: `تذكير: اجتماع <b>«${esc(m.title)}»</b> يبدأ <b>${esc(ctx.relative || "قريباً")}</b>.`,
  }[kind];
  const row = (label, val) => `<tr><td style="padding:8px 0;color:#8a8078;font-size:13px;font-weight:700;width:105px;vertical-align:top;border-bottom:1px dashed #eee6dc">${esc(label)}</td><td style="padding:8px 0;color:#23201C;font-size:14px;border-bottom:1px dashed #eee6dc">${val}</td></tr>`;
  const loc = m.location ? (isUrl(m.location) ? `<a href="${esc(m.location)}" style="color:#E36A62;font-weight:700">${esc(m.location)}</a>` : esc(m.location)) : "—";
  const btn = (href, label, primary) => `<a href="${esc(href)}" style="display:inline-block;margin:4px;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;${primary ? `background:${k.color};color:#fff` : "background:#fff;color:#23201C;border:1px solid #e0d8ca"}">${esc(label)}</a>`;
  const btns = [];
  if (kind !== "cancel" && isUrl(m.location)) btns.push(btn(m.location, "الانضمام للاجتماع", true));
  if (kind === "invite" || kind === "update") btns.push(btn(googleCalendarUrl(m), "إضافة إلى Google Calendar"));
  if (ctx.appUrl) btns.push(btn(`${String(ctx.appUrl).replace(/\/$/, "")}/meetings`, "فتح في النظام"));
  const agenda = lines(m.agenda);
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#23201C;max-width:560px;margin:auto;background:#fff">
  <div style="border-top:4px solid ${k.color};padding:18px 4px 0">
    <span style="display:inline-block;background:${k.color}1f;color:${k.color};border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700">${esc(k.ar)}</span>
    <h2 style="color:#23201C;margin:10px 0 6px;font-size:20px">${esc(m.title)}</h2>
    <div style="color:#555;font-size:14px;line-height:1.9">${intro}</div>
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;background:#faf6f0;border:1px solid #ece5da;border-radius:12px;padding:4px 14px">
    ${row("التاريخ", esc(when.date))}
    ${row("الوقت", `${esc(when.time)}${ctx.tz ? ` <span style="color:#a49c94;font-size:12px">(${esc(ctx.tz)})</span>` : ""}`)}
    ${row("المدة", `${esc(m.duration || 30)} دقيقة`)}
    ${m.project ? row("المشروع", esc(m.project)) : ""}
    ${row("المكان / الرابط", loc)}
    ${m.organizer ? row("المنظّم", esc(m.organizer)) : ""}
    ${attendees.length ? row("الحضور", attendees.map(esc).join("، ")) : ""}
  </table>
  ${m.objective && kind !== "cancel" ? `<div style="margin-top:14px;font-size:14px;color:#555"><b style="color:#E36A62">الهدف:</b> ${esc(m.objective)}</div>` : ""}
  ${agenda.length && kind !== "cancel" ? `<div style="margin-top:14px"><div style="font-weight:700;color:#E36A62;font-size:14px;margin-bottom:6px">جدول الأعمال</div><ul style="margin:0;padding-right:20px;color:#555;font-size:14px;line-height:1.9">${agenda.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
  ${btns.length ? `<div style="margin-top:20px;text-align:center">${btns.join("")}</div>` : ""}
  ${kind === "invite" || kind === "update" ? `<div style="margin-top:10px;font-size:12px;color:#9a9a9a;text-align:center">📎 مرفق دعوة تقويم (invite.ics) تعمل مع Outlook و Google و Apple Calendar.</div>` : ""}
  <div style="margin-top:22px;padding-top:12px;border-top:1px solid #eee;font-size:11.5px;color:#9a9a9a">إشعار تلقائي من نظام سيم برايم لإدارة المشاريع — وصلك لأنك ضمن حضور هذا الاجتماع.</div>
</div>`;
}

// base64 لنص UTF-8 (يعمل في المتصفح و Node)
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}

/**
 * يجهّز رسالة كاملة جاهزة لـ /api/notify:
 * { to, subject, html, attachments } أو null إن لم يوجد مستلمون
 */
export function buildMeetingMail(kind, m, users, ctx = {}) {
  const { recipients, missing } = meetingRecipients(m, users);
  if (!recipients.length) return { mail: null, missing };
  const method = kind === "cancel" ? "CANCEL" : kind === "invite" || kind === "update" ? "REQUEST" : null;
  const attachments = method && ctx.includeIcs !== false
    ? [{ filename: method === "CANCEL" ? "cancel.ics" : "invite.ics", content: toBase64(buildIcs(m, { method, recipients, organizerEmail: ctx.organizerEmail, organizerName: m.organizer })), content_type: `text/calendar; charset=utf-8; method=${method}` }]
    : undefined;
  return {
    mail: { to: recipients.map((r) => r.email), subject: meetingSubject(kind, m, ctx), html: meetingEmailHtml(kind, m, ctx), attachments },
    missing,
    recipients,
  };
}
