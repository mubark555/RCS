// جلسات الدخول: كل مستخدم يبدأ/يحدّث جلسته هو فقط، والقراءة للمدير فقط
import { NextResponse } from "next/server";
import { sb } from "@/lib/server/supabase-server";
import { HttpError, fail, requireDb, identity, readJson } from "@/lib/server/db-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    requireDb();
    const who = await identity(req);
    if (who.role !== "manager") throw new HttpError(403, "متاح للمدير فقط");
    const sp = req.nextUrl.searchParams;
    let q = sb.from("user_sessions").select("*").order("started_at", { ascending: false }).limit(3000);
    if (sp.get("to")) q = q.lt("started_at", sp.get("to"));
    if (sp.get("from")) q = q.gte("last_seen_at", sp.get("from"));
    if (sp.get("user")) q = q.eq("user_name", sp.get("user"));
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ ok: true, data: data || [] });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req) {
  try {
    requireDb();
    const who = await identity(req);
    const { rec } = await readJson(req);
    const now = new Date().toISOString();
    const row = {
      user_id: who.open ? String(rec?.user_id || "") : who.id,
      user_name: who.open ? String(rec?.user_name || "").slice(0, 80) : who.name,
      started_at: now,
      last_seen_at: now,
      ended_at: null,
      device: String(rec?.device || "").slice(0, 80),
    };
    const { data, error } = await sb.from("user_sessions").insert([row]).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return fail(e);
  }
}

// تحديث النبض أو إنهاء الجلسة — لجلسة المستخدم نفسه فقط
export async function PATCH(req) {
  try {
    requireDb();
    const who = await identity(req);
    const { id, end } = await readJson(req);
    if (!id) throw new HttpError(400, "id مطلوب");
    const now = new Date().toISOString();
    let q = sb.from("user_sessions").update(end ? { ended_at: now, last_seen_at: now } : { last_seen_at: now }).eq("id", id).is("ended_at", null);
    if (!who.open) q = q.eq("user_id", who.id);
    const { error } = await q;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
