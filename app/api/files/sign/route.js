// رابط رفع موقّع (صالح لمرة واحدة) — الملف يُرفع من المتصفح مباشرة إلى التخزين دون المرور بالخادم
import { NextResponse } from "next/server";
import { sb } from "@/lib/server/supabase-server";
import { HttpError, fail, requireDb, identity, can, TABLES, readJson } from "@/lib/server/db-guard";
import { FILES_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    requireDb();
    const who = await identity(req);
    if (!can(who, TABLES.files.write)) throw new HttpError(403, "ليست لديك صلاحية رفع الملفات");
    const { name } = await readJson(req);
    const safe = String(name || "file").replace(/[^\w.\-]+/g, "_").slice(-120);
    const path = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}_${safe}`;
    const { data, error } = await sb.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return NextResponse.json({ ok: true, path: data.path || path, token: data.token, signedUrl: data.signedUrl });
  } catch (e) {
    return fail(e);
  }
}
