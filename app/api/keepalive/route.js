import { createClient } from "@supabase/supabase-js";

// يمنع إيقاف مشروع Supabase المجاني تلقائياً (يتوقف بعد ~7 أيام بلا نشاط):
// يستدعيه Vercel Cron مرة يومياً (انظر vercel.json) ويجري استعلاماً خفيفاً.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ ok: false, reason: "supabase not configured" });
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase.from("projects").select("id").limit(1);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
