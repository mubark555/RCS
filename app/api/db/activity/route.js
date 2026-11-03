// سجل النشاط: أي مستخدم يضيف (باسمه هو فقط)، والقراءة للمدير فقط، ولا تعديل ولا حذف
import { NextResponse } from "next/server";
import { sb } from "@/lib/server/supabase-server";
import { HttpError, fail, requireDb, identity, readJson } from "@/lib/server/db-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["create", "update", "status", "delete", "login", "logout", "upload", "link"]);
const ENTITIES = new Set(["task", "meeting", "project", "user", "kpi", "file", "session"]);

export async function GET(req) {
  try {
    requireDb();
    const who = await identity(req);
    if (who.role !== "manager") throw new HttpError(403, "سجل النشاط متاح للمدير فقط");
    const sp = req.nextUrl.searchParams;
    let q = sb.from("activity_log").select("*").order("at", { ascending: false }).limit(5000);
    if (sp.get("from")) q = q.gte("at", sp.get("from"));
    if (sp.get("to")) q = q.lt("at", sp.get("to"));
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
    if (!rec || !ACTIONS.has(rec.action) || !ENTITIES.has(rec.entity)) throw new HttpError(400, "سجل غير صالح");
    const row = {
      at: new Date().toISOString(), // وقت الخادم — لا يُقبل وقت من المتصفح
      // الهوية من جلسة الدخول وليس من المتصفح (منع الانتحال)
      user_id: who.open ? String(rec.user_id || "") : who.id,
      user_name: who.open ? String(rec.user_name || "غير معروف").slice(0, 80) : who.name,
      action: rec.action,
      entity: rec.entity,
      entity_id: String(rec.entity_id || "").slice(0, 80),
      title: String(rec.title || "").slice(0, 300),
      project: String(rec.project || "").slice(0, 120),
      details: rec.details && typeof rec.details === "object" ? rec.details : {},
    };
    const { error } = await sb.from("activity_log").insert([row]);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
