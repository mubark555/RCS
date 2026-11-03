// منطق الإشعارات المشترك بين الواجهة والخادم (بلا أي اعتماديات خاصة بالمتصفح أو Node)

export const NOTIFY_EVENTS = {
  created: { ar: "دعوة لاجتماع جديد", short: "إنشاء", color: "#e05a50" },
  updated: { ar: "تحديث على الاجتماع", short: "تحديث", color: "#2563eb" },
  cancelled: { ar: "إلغاء الاجتماع", short: "إلغاء", color: "#dc2626" },
  closed: { ar: "إغلاق الاجتماع والمحضر", short: "إغلاق", color: "#16a34a" },
  reminder: { ar: "تذكير بالاجتماع", short: "تذكير", color: "#d97706" },
  test: { ar: "رسالة تجريبية", short: "تجربة", color: "#7c3aed" },
};

// خيارات التذكير المسبق (بالدقائق)
export const REMINDER_OPTIONS = [
  { min: 10, ar: "قبل 10 دقائق" },
  { min: 30, ar: "قبل 30 دقيقة" },
  { min: 60, ar: "قبل ساعة" },
  { min: 180, ar: "قبل 3 ساعات" },
  { min: 1440, ar: "قبل يوم" },
  { min: 2880, ar: "قبل يومين" },
];

export const DEFAULT_REMINDERS = [1440, 60];

export function reminderLabel(min) {
  const o = REMINDER_OPTIONS.find((x) => x.min === Number(min));
  if (o) return o.ar;
  const m = Number(min);
  if (m >= 1440 && m % 1440 === 0) return `قبل ${m / 1440} يوم`;
  if (m >= 60 && m % 60 === 0) return `قبل ${m / 60} ساعة`;
  return `قبل ${m} دقيقة`;
}

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
export const isEmail = (s) => EMAIL_RE.test(String(s || "").trim());

export function parseEmails(s) {
  return String(s || "")
    .split(/[\s,;،\n]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(isEmail);
}

export const asArray = (v) =>
  Array.isArray(v) ? v : v ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : [];

// المستلمون: الحضور (من جدول المستخدمين) + بريد إضافي، بلا تكرار
// يُرجع { recipients: [{name,email}], missing: [أسماء بلا بريد] }
export function resolveRecipients(meeting, users = []) {
  const byName = new Map(users.map((u) => [u.name, u]));
  const seen = new Set();
  const recipients = [];
  const missing = [];
  for (const name of asArray(meeting?.attendees)) {
    const u = byName.get(name);
    const email = String(u?.email || "").trim().toLowerCase();
    if (!isEmail(email)) { missing.push(name); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ name, email });
  }
  for (const email of parseEmails(meeting?.extra_emails)) {
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ name: "", email });
  }
  return { recipients, missing };
}

export function meetingReminders(m) {
  if (Array.isArray(m?.reminders)) return m.reminders.map(Number).filter((x) => x > 0);
  return DEFAULT_REMINDERS;
}

// التذكير المستحق الآن: أصغر فترة دخلنا نافذتها ولم تُرسل بعد.
// يُرجع { offset, skip: [فترات أكبر فاتت ولن تُرسل] } أو null
export function computeDueReminder(m, now = Date.now()) {
  if (!m || m.notify === false || (m.status && m.status !== "Scheduled") || !m.start_at) return null;
  const start = new Date(m.start_at).getTime();
  if (!(start > now)) return null;
  const sent = new Set((Array.isArray(m.reminders_sent) ? m.reminders_sent : []).map(Number));
  const entered = meetingReminders(m)
    .filter((off) => now >= start - off * 60000)
    .sort((a, b) => a - b);
  if (!entered.length) return null;
  const offset = entered[0];
  if (sent.has(offset)) return null;
  return { offset, skip: entered.slice(1).filter((x) => !sent.has(x)) };
}

// يحدد نوع الإشعار المناسب بعد الحفظ بمقارنة النسخة القديمة بالجديدة
export function detectEvent(prev, next) {
  if (!prev) return next.status === "Cancelled" ? null : next.status === "Done" ? "closed" : "created";
  if (prev.status !== next.status) {
    if (next.status === "Cancelled") return "cancelled";
    if (next.status === "Done") return "closed";
    if (next.status === "Scheduled") return "updated";
  }
  if (next.status !== "Scheduled") return null;
  const keys = ["start_at", "duration", "location", "title"];
  const changed = keys.some((k) => String(prev[k] ?? "") !== String(next[k] ?? ""));
  const att = (x) => asArray(x.attendees).slice().sort().join("|");
  return changed || att(prev) !== att(next) ? "updated" : null;
}

// ما الذي تغيّر (لعرضه في رسالة التحديث)
export function diffMeeting(prev, next) {
  if (!prev) return [];
  const out = [];
  if (prev.title !== next.title) out.push("العنوان");
  if (prev.start_at !== next.start_at) out.push("الموعد");
  if (Number(prev.duration) !== Number(next.duration)) out.push("المدة");
  if ((prev.location || "") !== (next.location || "")) out.push("المكان / الرابط");
  const a = asArray(prev.attendees).slice().sort().join("|");
  const b = asArray(next.attendees).slice().sort().join("|");
  if (a !== b) out.push("الحضور");
  if (prev.status !== next.status) out.push("الحالة");
  return out;
}
