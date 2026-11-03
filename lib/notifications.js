"use client";

// طبقة الإشعارات في الواجهة: تستدعي /api/notify وتحفظ سجل الإرسال في الوضع المحلي
import { meetingsStore, isCloud } from "./store";
import { DEFAULT_REMINDERS } from "./notify-core";

export const DEFAULT_NOTIFY_PREFS = {
  enabled: true,          // تفعيل إشعارات البريد عموماً
  onCreate: true,         // عند إنشاء اجتماع
  onUpdate: true,         // عند تعديل الموعد/المكان/الحضور
  onCancel: true,         // عند الإلغاء أو الحذف
  onClose: true,          // عند إغلاق الاجتماع (مع المحضر والقرارات)
  reminders: true,        // التذكير قبل الاجتماع
  defaultReminders: DEFAULT_REMINDERS,
  includeIcs: true,       // إرفاق دعوة تقويم
  askBeforeSend: false,   // سؤال المستخدم قبل كل إرسال
};

export function notifyPrefsOf(settings) {
  return { ...DEFAULT_NOTIFY_PREFS, ...(settings?.notifications || {}) };
}

const PREF_KEY = { created: "onCreate", updated: "onUpdate", cancelled: "onCancel", closed: "onClose", reminder: "reminders" };
export function eventEnabled(prefs, event) {
  if (!prefs.enabled) return false;
  const k = PREF_KEY[event];
  return k ? prefs[k] !== false : true;
}

let _status = null;
let _statusAt = 0;
export async function getEmailStatus(force = false) {
  if (!force && _status && Date.now() - _statusAt < 60_000) return _status;
  try {
    const r = await fetch("/api/notify", { cache: "no-store" });
    _status = await r.json();
  } catch {
    _status = { configured: false, error: "تعذر الاتصال بالخادم" };
  }
  _statusAt = Date.now();
  return _status;
}

function tz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
}

/**
 * يرسل إشعار اجتماع. يُرجع رد الخادم { ok, sent, failed, missing, entry, skipped, error }
 */
export async function sendMeetingNotification(event, meeting, { users = [], settings, changes, force, offset } = {}) {
  const prefs = notifyPrefsOf(settings);
  const payload = {
    event,
    meetingId: meeting?.id,
    changes,
    force,
    offset,
    tz: tz(),
    includeIcs: prefs.includeIcs,
    brand: settings ? { appName: settings.appName, tagline: settings.tagline, primaryColor: settings.primaryColor } : undefined,
    // في الوضع المحلي لا يملك الخادم قاعدة بيانات، فنرسل البيانات معه
    ...(isCloud ? {} : { meeting, users: users.map((u) => ({ name: u.name, email: u.email })) }),
  };
  let res;
  try {
    const r = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    res = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  } catch (e) {
    res = { ok: false, error: "تعذر الاتصال بالخادم" };
  }

  // حفظ السجل محلياً عندما لا يحفظه الخادم
  if (!isCloud && meeting?.id && (res.entry || (event === "reminder" && res.skipped === "already-sent"))) {
    const patch = {};
    if (res.entry) patch.notify_log = [res.entry, ...(Array.isArray(meeting.notify_log) ? meeting.notify_log : [])].slice(0, 30);
    if (event === "reminder" && res.offset) {
      const sent = Array.isArray(meeting.reminders_sent) ? meeting.reminders_sent : [];
      patch.reminders_sent = Array.from(new Set([...sent, res.offset, ...(res.skip || [])]));
    }
    try { await meetingsStore.update(meeting.id, patch); } catch {}
  }
  return res;
}

// نص مختصر لنتيجة الإرسال (للتنبيهات)
export function describeResult(res) {
  if (!res) return "";
  if (res.skipped === "notifications-disabled") return "الإشعارات معطّلة لهذا الاجتماع";
  if (res.skipped === "not-due") return "لا يوجد تذكير مستحق الآن";
  if (res.skipped === "already-sent") return "أُرسل هذا التذكير مسبقاً";
  if (res.configured === false) return "⚠️ البريد غير مُعدّ على الخادم — راجع صفحة التخصيص";
  if (!res.ok && !res.sent?.length) return `⚠️ فشل الإرسال: ${res.error || res.failed?.[0]?.error || "خطأ غير معروف"}`;
  const parts = [`✉️ أُرسل البريد إلى ${res.sent?.length || 0} مستلم`];
  if (res.failed?.length) parts.push(`تعذر ${res.failed.length}`);
  if (res.missing?.length) parts.push(`بلا بريد: ${res.missing.join("، ")}`);
  if (!res.sent?.length && !res.failed?.length) parts[0] = "لا يوجد مستلمون لديهم بريد إلكتروني";
  return parts.join(" · ");
}
