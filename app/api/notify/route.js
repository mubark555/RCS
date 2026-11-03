// واجهة إرسال إشعارات الاجتماعات بالبريد
//   GET  → حالة إعداد البريد (هل المزوّد مُعدّ؟)
//   POST → { event, meetingId, ... } يرسل الإشعار لحضور الاجتماع
import { NextResponse } from "next/server";
import { NOTIFY_EVENTS, computeDueReminder, isEmail } from "@/lib/notify-core";
import { mailConfig, sendMail } from "@/lib/server/mailer";
import { renderEmail } from "@/lib/server/email-templates";
import { serverCloud } from "@/lib/server/supabase-server";
import { dispatch, appendLog, claimReminder, loadMeeting, loadUsers, defaultBrand, DEFAULT_TZ, APP_URL } from "@/lib/server/notify-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// حدّ بسيط لعدد الطلبات لكل عنوان IP (حماية من الإساءة)
const HITS = new Map();
function limited(ip, max = 40, windowMs = 60_000) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > max;
}

export async function GET() {
  const cfg = mailConfig();
  return NextResponse.json({
    configured: Boolean(cfg.provider),
    provider: cfg.provider,
    from: cfg.from || null,
    cloud: serverCloud,
    cron: Boolean(process.env.CRON_SECRET),
    timezone: DEFAULT_TZ,
    appUrl: APP_URL || null,
  });
}

export async function POST(req) {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (limited(ip)) return NextResponse.json({ ok: false, error: "طلبات كثيرة، حاول بعد دقيقة" }, { status: 429 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 }); }
  const { event, meetingId } = body || {};
  if (!NOTIFY_EVENTS[event]) return NextResponse.json({ ok: false, error: "نوع إشعار غير معروف" }, { status: 400 });

  const cfg = mailConfig();
  if (!cfg.provider) {
    return NextResponse.json({ ok: false, configured: false, error: "البريد غير مُعدّ على الخادم — أضف RESEND_API_KEY أو إعدادات SMTP" }, { status: 503 });
  }

  const brand = { ...defaultBrand(), ...pickBrand(body.brand) };
  const tz = typeof body.tz === "string" ? body.tz : DEFAULT_TZ;

  try {
    // رسالة تجريبية
    if (event === "test") {
      const to = String(body.to || "").trim();
      if (!isEmail(to)) return NextResponse.json({ ok: false, error: "بريد غير صالح" }, { status: 400 });
      const mail = renderEmail("test", null, { brand, tz, appUrl: APP_URL, recipient: { name: body.name || "" } });
      await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text });
      return NextResponse.json({ ok: true, sent: [to] });
    }

    // مصدر البيانات: قاعدة البيانات (سحابي — موثوق) أو ما يرسله المتصفح (الوضع المحلي)
    let meeting, users;
    if (serverCloud) {
      if (!meetingId) return NextResponse.json({ ok: false, error: "meetingId مطلوب" }, { status: 400 });
      meeting = await loadMeeting(meetingId);
      if (!meeting) return NextResponse.json({ ok: false, error: "الاجتماع غير موجود" }, { status: 404 });
      users = await loadUsers();
    } else {
      meeting = body.meeting;
      users = Array.isArray(body.users) ? body.users.map((u) => ({ name: u?.name, email: u?.email })) : [];
      if (!meeting?.start_at && event !== "closed") return NextResponse.json({ ok: false, error: "بيانات الاجتماع ناقصة" }, { status: 400 });
    }

    if (meeting.notify === false && !body.force) {
      return NextResponse.json({ ok: true, skipped: "notifications-disabled", sent: [] });
    }

    let offset;
    if (event === "reminder") {
      const due = computeDueReminder(meeting);
      if (!due && !body.force) return NextResponse.json({ ok: true, skipped: "not-due", sent: [] });
      offset = due ? due.offset : Number(body.offset) || 60;
      if (due && !(await claimReminder(meeting, due.offset, due.skip))) {
        return NextResponse.json({ ok: true, skipped: "already-sent", sent: [] });
      }
      if (due) body.skip = due.skip;
    }

    const r = await dispatch(event, meeting, users, {
      brand, tz, offset,
      changes: Array.isArray(body.changes) ? body.changes.slice(0, 10).map(String) : undefined,
      includeIcs: body.includeIcs !== false,
    });
    const persisted = serverCloud ? await appendLog(meeting.id, r.entry) : false;

    return NextResponse.json({
      ok: r.failed.length === 0 || r.sent.length > 0,
      entry: r.entry,
      sent: r.sent,
      failed: r.failed,
      missing: r.missing,
      offset,
      skip: body.skip || [],
      persisted,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

function pickBrand(b) {
  if (!b || typeof b !== "object") return {};
  const out = {};
  if (typeof b.appName === "string" && b.appName.trim()) out.appName = b.appName.slice(0, 60);
  if (typeof b.tagline === "string") out.tagline = b.tagline.slice(0, 60);
  if (typeof b.primaryColor === "string" && /^#[0-9a-f]{3,8}$/i.test(b.primaryColor)) out.primaryColor = b.primaryColor;
  return out;
}
