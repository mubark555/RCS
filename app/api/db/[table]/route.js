// واجهة البيانات المحمية: كل قراءة/كتابة تمر من هنا بعد التحقق من الهوية والصلاحية
//   GET    /api/db/tasks            → القائمة (مع تقييد العميل بمشاريعه)
//   GET    /api/db/tasks?id=…       → سجل واحد
//   POST   /api/db/tasks  {rec}     → إضافة
//   PATCH  /api/db/tasks  {id,patch}→ تعديل (يُرجع السابق واللاحق)
//   DELETE /api/db/tasks?id=…       → حذف (يُرجع المحذوف)
import { NextResponse } from "next/server";
import { sb } from "@/lib/server/supabase-server";
import { TABLES, HttpError, fail, requireDb, identity, can, clientProjects, cleanRecord, readJson } from "@/lib/server/db-guard";
import { FILES_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function conf(params) {
  const t = TABLES[params.table];
  if (!t) throw new HttpError(404, "جدول غير معروف");
  return t;
}

async function scopeCheck(who, t, row) {
  if (who.role !== "client" || !t.scope || !row) return;
  const allowed = await clientProjects(who);
  if (!allowed.includes(row[t.scope])) throw new HttpError(403, "غير مصرّح");
}

function strip(who, t, rows) {
  if (who.role !== "client" || !t.hideForClient) return rows;
  return rows.map((r) => { const c = { ...r }; t.hideForClient.forEach((k) => delete c[k]); return c; });
}

export async function GET(req, { params }) {
  try {
    requireDb();
    const t = conf(params);
    const who = await identity(req);
    if (!can(who, t.read)) throw new HttpError(403, "غير مصرّح");
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const { data, error } = await sb.from(params.table).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      await scopeCheck(who, t, data);
      return NextResponse.json({ ok: true, data: data ? strip(who, t, [data])[0] : null });
    }
    let q = sb.from(params.table).select("*").order(t.order, { ascending: t.asc });
    if (who.role === "client" && t.scope) q = q.in(t.scope, await clientProjects(who));
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ ok: true, data: strip(who, t, data || []) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req, { params }) {
  try {
    requireDb();
    const t = conf(params);
    const who = await identity(req);
    if (!can(who, t.write)) throw new HttpError(403, "ليست لديك صلاحية الإضافة هنا");
    const { rec } = await readJson(req);
    const { data, error } = await sb.from(params.table).insert([cleanRecord(rec)]).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req, { params }) {
  try {
    requireDb();
    const t = conf(params);
    const who = await identity(req);
    if (!can(who, t.write)) throw new HttpError(403, "ليست لديك صلاحية التعديل هنا");
    const { id, patch } = await readJson(req);
    if (!id) throw new HttpError(400, "id مطلوب");
    const { data: prev } = await sb.from(params.table).select("*").eq("id", id).maybeSingle();
    if (!prev) throw new HttpError(404, "السجل غير موجود");
    const { data, error } = await sb.from(params.table).update(cleanRecord(patch)).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data, prev });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req, { params }) {
  try {
    requireDb();
    const t = conf(params);
    const who = await identity(req);
    if (!can(who, t.write)) throw new HttpError(403, "ليست لديك صلاحية الحذف هنا");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new HttpError(400, "id مطلوب");
    const { data: prev } = await sb.from(params.table).select("*").eq("id", id).maybeSingle();
    if (!prev) return NextResponse.json({ ok: true, prev: null });
    if (params.table === "files" && prev.kind !== "link" && prev.path) {
      await sb.storage.from(FILES_BUCKET).remove([prev.path]);
    }
    const { error } = await sb.from(params.table).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, prev });
  } catch (e) {
    return fail(e);
  }
}
