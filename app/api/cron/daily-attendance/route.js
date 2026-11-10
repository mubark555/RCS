// مهمة مجدولة يومية (Vercel Cron — انظر vercel.json): الساعة 9:00 ص بتوقيت الرياض
// تسجّل حضور موظفي القائمة AUTO_ATTENDANCE وترسل لكل واحد منهم إشعاراً، وملخّصاً للمدراء.
// تحتاج على الخادم: CRON_SECRET + SUPABASE_SERVICE_ROLE_KEY (و NEXT_PUBLIC_SUPABASE_URL)
import { createClient } from "@supabase/supabase-js";
import { AUTO_ATTENDANCE, AUTO_DEVICE, matchesList, todayAt9 } from "@/lib/autoAttendance.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET غير مضبوط." }, { status: 503 });
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) return Response.json({ ok: false, error: "غير مصرّح." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return Response.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY غير مضبوط." }, { status: 503 });
  const sb = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: users, error } = await sb.from("users").select("*");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const active = (users || []).filter((u) => (u.status || "active") !== "inactive" && u.status !== "disabled");
  const staff = active.filter((u) => matchesList(u, AUTO_ATTENDANCE));
  const at = todayAt9();
  const dayEnd = new Date(new Date(at).getTime() + 15 * 3600_000).toISOString();

  // 1) تسجيل الحضور في جلسات الدخول (مرة واحدة يومياً لكل موظف)
  let sessionsOk = true;
  const recorded = [];
  for (const u of staff) {
    const { data: exist, error: e1 } = await sb.from("user_sessions").select("id")
      .eq("user_name", u.name).eq("device", AUTO_DEVICE).gte("started_at", at).lt("started_at", dayEnd).limit(1);
    if (e1) { sessionsOk = false; break; } // الجدول غير موجود — شغّل ملف الترحيل
    if (exist && exist.length) continue; // سُجّل اليوم مسبقاً
    const { error: e2 } = await sb.from("user_sessions").insert({
      user_email: u.email || "", user_name: u.name, started_at: at, last_seen_at: at, ended_at: at, device: AUTO_DEVICE,
    });
    if (e2) { sessionsOk = false; break; }
    recorded.push(u);
  }
  if (!sessionsOk) return Response.json({ ok: false, error: "جدول user_sessions غير موجود — شغّل supabase/migrations/2026-11-daily-attendance.sql" }, { status: 500 });
  if (!recorded.length) return Response.json({ ok: true, recorded: 0, note: "لا جديد (سُجّل مسبقاً أو لا موظفين مطابقين)" });

  // 2) الإشعارات: لكل موظف إشعار، وملخّص للمدراء
  const time = "9:00 ص";
  const rows = recorded.map((u) => ({
    kind: "info", entity: "حضور", recipient: u.id,
    title: "تم تسجيل حضورك اليوم",
    body: `تم تسجيل حضورك في النظام الساعة ${time}.`,
  }));
  const names = recorded.map((u) => u.name).join("، ");
  active.filter((u) => u.role === "manager").forEach((m) => rows.push({
    kind: "info", entity: "حضور", recipient: m.id,
    title: `تم تسجيل حضور ${recorded.length} موظفين`,
    body: `تم تسجيل حضور: ${names} — الساعة ${time}.`,
  }));
  let { error: e3 } = await sb.from("notifications").insert(rows);
  if (e3 && /recipient/.test(e3.message || "")) {
    // قاعدة بلا عمود recipient: إشعار واحد عام
    ({ error: e3 } = await sb.from("notifications").insert({ kind: "info", entity: "حضور", title: "تسجيل الحضور اليومي", body: `تم تسجيل حضور: ${names} — الساعة ${time}.` }));
  }
  return Response.json({ ok: true, recorded: recorded.length, names: recorded.map((u) => u.name), notifyError: e3?.message || "" });
}

export const GET = handle;
export const POST = handle;
