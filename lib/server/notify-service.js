// خدمة الإشعارات على الخادم: تبني الرسائل وترسلها لكل مستلم وتسجّل النتيجة
import { resolveRecipients, computeDueReminder, reminderLabel } from "../notify-core";
import { renderEmail, buildIcs, relativeStart } from "./email-templates";
import { sendMail, mailConfig, parseFrom } from "./mailer";
import { sb, serverCloud } from "./supabase-server";

export const MAX_RECIPIENTS = 60;
export const DEFAULT_TZ = process.env.APP_TIMEZONE || "Asia/Riyadh";
export const APP_URL = (process.env.APP_URL || "").trim();

export function defaultBrand() {
  return {
    appName: process.env.APP_NAME || "ڤيوليت",
    tagline: process.env.APP_TAGLINE || "DIGITAL MARKETING",
    primaryColor: process.env.APP_PRIMARY_COLOR || "#e05a50",
  };
}

function validTz(tz) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * يرسل إشعار حدث معيّن لكل حضور الاجتماع.
 * opts: { brand, tz, changes, offset, includeIcs }
 */
export async function dispatch(event, meeting, users, opts = {}) {
  const { recipients, missing } = resolveRecipients(meeting, users);
  const list = recipients.slice(0, MAX_RECIPIENTS);
  const brand = { ...defaultBrand(), ...(opts.brand || {}) };
  const tz = validTz(opts.tz || DEFAULT_TZ);
  const cfg = mailConfig();
  const org = parseFrom(cfg.from);

  const method = event === "cancelled" ? "CANCEL" : event === "created" || event === "updated" ? "REQUEST" : null;
  const ics = method && opts.includeIcs !== false
    ? { method, content: buildIcs(meeting, { method, recipients: list, organizerEmail: org.email, organizerName: org.name || brand.appName, appName: brand.appName }) }
    : null;

  const relative = event === "reminder" ? relativeStart(meeting) : undefined;

  const results = await pool(list, 4, async (r) => {
    const mail = renderEmail(event, meeting, { brand, tz, appUrl: APP_URL, recipient: r, changes: opts.changes, relative, offset: opts.offset });
    try {
      await sendMail({ to: r.email, subject: mail.subject, html: mail.html, text: mail.text, ics });
      return { email: r.email, ok: true };
    } catch (e) {
      return { email: r.email, ok: false, error: String(e?.message || e).slice(0, 200) };
    }
  });

  const sent = results.filter((x) => x.ok).map((x) => x.email);
  const failed = results.filter((x) => !x.ok);
  const entry = {
    at: new Date().toISOString(),
    event,
    ...(event === "reminder" ? { label: reminderLabel(opts.offset) } : {}),
    sent: sent.length,
    failed: failed.length,
    to: sent,
    ...(failed.length ? { error: failed[0].error } : {}),
    ...(missing.length ? { missing } : {}),
  };
  return { entry, sent, failed, missing, recipients: list };
}

// إلحاق سجل الإشعار بالاجتماع (سحابي فقط)
export async function appendLog(meetingId, entry) {
  if (!serverCloud) return false;
  const { data } = await sb.from("meetings").select("notify_log").eq("id", meetingId).maybeSingle();
  const log = [entry, ...(Array.isArray(data?.notify_log) ? data.notify_log : [])].slice(0, 30);
  const { error } = await sb.from("meetings").update({ notify_log: log }).eq("id", meetingId);
  return !error;
}

// حجز التذكير ذرّياً لمنع الإرسال المكرر (بين المتصفحات المفتوحة والمهمة المجدولة)
export async function claimReminder(meeting, offset, skip = []) {
  if (!serverCloud) return true;
  const sent = Array.isArray(meeting.reminders_sent) ? meeting.reminders_sent.map(Number) : [];
  const next = Array.from(new Set([...sent, offset, ...skip]));
  const { data, error } = await sb
    .from("meetings")
    .update({ reminders_sent: next })
    .eq("id", meeting.id)
    .not("reminders_sent", "cs", JSON.stringify([offset]))
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

export async function loadMeeting(id) {
  const { data, error } = await sb.from("meetings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function loadUsers() {
  const { data, error } = await sb.from("users").select("name,email");
  if (error) throw error;
  return data || [];
}

// معالجة كل التذكيرات المستحقة (للمهمة المجدولة)
export async function runDueReminders({ now = Date.now() } = {}) {
  if (!serverCloud) return { ok: false, reason: "no-database" };
  const horizon = new Date(now + 3 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb
    .from("meetings")
    .select("*")
    .eq("status", "Scheduled")
    .gt("start_at", new Date(now).toISOString())
    .lte("start_at", horizon);
  if (error) throw error;
  const due = (data || []).map((m) => ({ m, d: computeDueReminder(m, now) })).filter((x) => x.d);
  if (!due.length) return { ok: true, processed: 0, results: [] };
  const users = await loadUsers();
  const results = [];
  for (const { m, d } of due) {
    if (!(await claimReminder(m, d.offset, d.skip))) continue;
    const r = await dispatch("reminder", m, users, { offset: d.offset });
    await appendLog(m.id, r.entry);
    results.push({ id: m.id, title: m.title, offset: d.offset, sent: r.sent.length, failed: r.failed.length });
  }
  return { ok: true, processed: results.length, results };
}
