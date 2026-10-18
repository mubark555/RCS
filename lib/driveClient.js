"use client";

// واجهة Google Drive الحقيقي في المتصفح (نفس شكل بيئة الاختبار driveSim)
// كل الطلبات تمر بمسار /api/drive مع جلسة الدخول، والرفع يذهب لـ Google مباشرة.

import { supabase } from "./supabase";

async function call(payload) {
  const headers = { "Content-Type": "application/json" };
  try {
    const { data } = supabase ? await supabase.auth.getSession() : { data: null };
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {}
  const r = await fetch("/api/drive", { method: "POST", headers, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "تعذّر الاتصال بـ Google Drive.");
  return j;
}

let _status = null;
export async function driveConfigured() {
  if (_status === null) {
    _status = fetch("/api/drive").then((r) => r.json()).then((j) => Boolean(j.configured)).catch(() => false);
  }
  return _status;
}

export const driveReal = {
  ROOT: "root",
  real: true,
  async folder(id = "root") {
    return call({ action: "list", id });
  },
  async children(id = "root") {
    return (await call({ action: "list", id })).items;
  },
  async trail(id) {
    return (await call({ action: "trail", id })).trail;
  },
  async ensurePath(names, _by, parent = "root") {
    return (await call({ action: "ensure", parent, names })).id;
  },
  // رفع ملف لمجلد بعينه (جلسة رفع من الخادم ثم رفع مباشر لـ Google)
  async uploadTo(folderId, file) {
    const { url } = await call({ action: "upload", parent: folderId, name: file.name, mime: file.type || "application/octet-stream", size: file.size });
    const r = await fetch(url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `تعذّر رفع «${file.name}»`);
    return { id: j.id, parent: folderId, name: j.name, link: j.webViewLink };
  },
  async upload(file, names, by, parent = "root") {
    return this.uploadTo(await this.ensurePath(names, by, parent), file);
  },
  async remove(id) {
    await call({ action: "trash", id });
  },
  open(item) {
    if (item.link) window.open(item.link, "_blank", "noopener");
  },
};
