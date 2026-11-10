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

// حالة الربط: { ready, mode, canConnect, account, rootName, redirectUri }
export async function driveStatus() {
  try {
    return await call({ action: "status" });
  } catch {
    return { ready: false };
  }
}

// ربط حساب Google: الخادم يرجع رابط موافقة Google، ثم يرجع المستخدم لصفحة Drive مع الرمز
export async function driveConnect(folder) {
  const { url } = await call({ action: "connect", folder });
  window.location.href = url;
}
export const driveFinish = (code, state) => call({ action: "finish", code, state });
export const driveDisconnect = () => call({ action: "disconnect" });

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
