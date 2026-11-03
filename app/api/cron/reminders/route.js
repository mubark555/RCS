// مهمة مجدولة: ترسل التذكيرات المستحقة قبل الاجتماعات حتى لو لم يكن أحد يفتح النظام.
// تُستدعى كل 5–15 دقيقة من GitHub Actions أو Vercel Cron أو أي خدمة cron خارجية
// مع الترويسة:  Authorization: Bearer <CRON_SECRET>
import { NextResponse } from "next/server";
import { runDueReminders } from "@/lib/server/notify-service";
import { mailConfig } from "@/lib/server/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET غير مُعدّ" }, { status: 503 });
  const auth = req.headers.get("authorization") || "";
  const q = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && q !== secret) return NextResponse.json({ ok: false, error: "غير مصرّح" }, { status: 401 });
  if (!mailConfig().provider) return NextResponse.json({ ok: false, error: "البريد غير مُعدّ" }, { status: 503 });
  try {
    return NextResponse.json(await runDueReminders());
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
