"use client";

// بيئة اختبار تحاكي Google Drive داخل المتصفح (IndexedDB): مجلدات وملفات بمعرّفات وروابط،
// حتى نجرّب الرفع والترتيب التلقائي قبل الربط الحقيقي. لا تلمس قاعدة البيانات ولا Drive الحقيقي.

const DB = "sp_drive_sim";
const STORE = "items";

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("parent", "parent");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}
const uid = () => `sim_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const ROOT = "root";

export const driveSim = {
  ROOT,

  async children(parent = ROOT) {
    const list = await tx("readonly", (s) => s.index("parent").getAll(parent));
    return list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "ar") : a.kind === "folder" ? -1 : 1));
  },

  // محتوى مجلد + مساره (نفس استجابة Drive الحقيقي)
  async folder(id = ROOT) {
    const [items, trail] = await Promise.all([this.children(id), this.trail(id)]);
    return { items, trail };
  },

  async get(id) {
    return tx("readonly", (s) => s.get(id));
  },

  // يرجع معرّف المجلد الأخير في المسار، وينشئ أي مجلد ناقص (مثل Drive: files.create بـ mimeType folder)
  async ensurePath(names, by = "", from = ROOT) {
    let parent = from || ROOT;
    for (const name of names) {
      const kids = await this.children(parent);
      let f = kids.find((k) => k.kind === "folder" && k.name === name);
      if (!f) {
        f = { id: uid(), kind: "folder", name, parent, created_at: new Date().toISOString(), by };
        await tx("readwrite", (s) => s.put(f));
      }
      parent = f.id;
    }
    return parent;
  },

  async uploadTo(parent, file, by = "") {
    const rec = { id: uid(), kind: "file", name: file.name, parent, mime: file.type || "", size: file.size, blob: file, created_at: new Date().toISOString(), by };
    await tx("readwrite", (s) => s.put(rec));
    return rec;
  },

  async upload(file, names, by = "", from = ROOT) {
    return this.uploadTo(await this.ensurePath(names, by, from), file, by);
  },

  async open(item) {
    const rec = await this.get(item.id);
    if (!rec?.blob) return;
    const url = URL.createObjectURL(rec.blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  async remove(id) {
    const kids = await this.children(id);
    for (const k of kids) await this.remove(k.id);
    await tx("readwrite", (s) => s.delete(id));
  },

  // المسار من الجذر حتى العنصر: [{id, name}]
  async trail(id) {
    const out = [];
    let cur = id && id !== ROOT ? await this.get(id) : null;
    while (cur) {
      out.unshift({ id: cur.id, name: cur.name });
      cur = cur.parent && cur.parent !== ROOT ? await this.get(cur.parent) : null;
    }
    return out;
  },

  async stats() {
    const all = await tx("readonly", (s) => s.getAll());
    const files = all.filter((x) => x.kind === "file");
    return { folders: all.length - files.length, files: files.length, size: files.reduce((n, f) => n + (f.size || 0), 0) };
  },

  async reset() {
    await tx("readwrite", (s) => s.clear());
  },
};
