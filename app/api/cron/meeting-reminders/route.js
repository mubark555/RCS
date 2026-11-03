// مهمة مجدولة: ترسل تذكيرات الاجتماعات المستحقة حتى لو لم يكن أحد يفتح النظام.
// تُستدعى كل 10–15 دقيقة (GitHub Actions أو أي خدمة cron) مع الترويسة:
//   Authorization: Bearer <CRON_SECRET>
// تحتاج على الخادم: CRON_SECRET + SUPABASE_SERVICE_ROLE_KEY + RESEND_API_KEY
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_MEETING_MAIL, dueReminder, buildMeetingMail, relativeStart, reminderLabel } from "@/lib/meetingMail.mjs";
import { fromWithName, DEFAULT_FROM, sendResend } from "@/lib/resend.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET غير مضبوط." }, { status: 503 });
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) return Response.json({ ok: false, error: "غير مصرّح." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = process.env.RESEND_API_KEY;
  if (!url || !service) return Response.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY غير مضبوط." }, { status: 503 });
  if (!key) return Response.json({ ok: false, error: "RESEND_API_KEY غير مضبوط." }, { status: 503 });

  const sb = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: setting } = await sb.from("app_settings").select("value").eq("key", "notify").maybeSingle();
  const notify = setting?.value || {};
  const prefs = { ...DEFAULT_MEETING_MAIL, ...(notify.meetingMail || {}) };
  if (!notify.emailEnabled || !prefs.reminders) return Response.json({ ok: true, skipped: "التذكيرات متوقفة من الإعدادات" });

  const now = Date.now();
  const { data: meetings, error } = await sb
    .from("meetings")
    .select("*")
    .eq("status", "Scheduled")
    .gt("start_at", new Date(now).toISOString())
    .lte("start_at", new Date(now + 3 * 86400_000).toISOString());
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const due = (meetings || []).map((m) => ({ m, d: dueReminder(m, now, prefs) })).filter((x) => x.d);
  if (!due.length) return Response.json({ ok: true, sent: 0 });

  const { data: users } = await sb.from("users").select("id,name,email,status");
  const from = fromWithName(DEFAULT_FROM(), notify.senderName);
  const appUrl = String(notify.systemUrl || process.env.APP_URL || "").trim();
  const tz = process.env.APP_TIMEZONE || "Asia/Riyadh";
  const results = [];
  for (const { m, d } of due) {
    const { data: claimed } = await sb.rpc("claim_meeting_reminder", { p_id: m.id, p_offset: d.offset, p_skip: d.skip });
    if (!claimed) continue; // أُرسل من مكان آخر
    const { mail } = buildMeetingMail("reminder", m, users || [], { appUrl, tz, relative: relativeStart(m, now), offset: d.offset });
    if (!mail) continue;
    const r = await sendResend({ key, from, ...mail });
    const entry = { at: new Date().toISOString(), kind: "reminder", label: reminderLabel(d.offset), to: r.ok ? mail.to.length : 0, error: r.ok ? "" : r.error, by: "مجدول" };
    await sb.from("meetings").update({ mail_log: [entry, ...(Array.isArray(m.mail_log) ? m.mail_log : [])].slice(0, 30) }).eq("id", m.id);
    results.push({ title: m.title, offset: d.offset, ok: r.ok, to: mail.to.length });
  }
  return Response.json({ ok: true, sent: results.length, results });
}

export const GET = handle;
export const POST = handle;
