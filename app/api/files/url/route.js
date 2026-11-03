// رابط تنزيل مؤقت لملف — بعد التحقق من صلاحية الوصول لمشروعه
import { NextResponse } from "next/server";
import { sb } from "@/lib/server/supabase-server";
import { HttpError, fail, requireDb, identity, can, TABLES, clientProjects } from "@/lib/server/db-guard";
import { FILES_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    requireDb();
    const who = await identity(req);
    if (!can(who, TABLES.files.read)) throw new HttpError(403, "غير مصرّح");
    const id = req.nextUrl.searchParams.get("id");
    const { data: rec } = await sb.from("files").select("*").eq("id", id).maybeSingle();
    if (!rec) throw new HttpError(404, "الملف غير موجود");
    if (who.role === "client" && !(await clientProjects(who)).includes(rec.project)) throw new HttpError(403, "غير مصرّح");
    if (rec.kind === "link") return NextResponse.json({ ok: true, url: rec.url });
    const { data, error } = await sb.storage.from(FILES_BUCKET).createSignedUrl(rec.path, 60 * 60);
    if (error) throw error;
    return NextResponse.json({ ok: true, url: data.signedUrl });
  } catch (e) {
    return fail(e);
  }
}
