"use client";

// طبقة الوصول للبيانات: تستخدم Supabase عند توفر المفاتيح،
// وإلا تتحول تلقائياً إلى الحفظ المحلي (localStorage) لتجربة فورية.

import { supabase, isCloud, FILES_BUCKET } from "./supabase";
import { SEED_TASKS } from "./seed-data";

export { isCloud };

// ---------- توليد المعرّفات ----------
let _counter = 0;
function uid() {
  _counter += 1;
  const rnd = Math.floor(Math.random() * 1e9).toString(36);
  return `${rnd}${_counter.toString(36)}`;
}
function nowISO() {
  return new Date().toISOString();
}

// ================= بيانات أولية =================
export const SEED_PROJECTS = [
  { name: "Seem prime", description: "مشاريع سيم برايم الاستثمارية والبنية الرقمية", logo: "", managers: ["لجين"], clients: ["عميل سيم برايم"], members: ["لجين", "أمل", "مبارك"], color: "#e05a50", status: "نشط" },
  { name: "Homera", description: "منصة هوميرا العقارية الرقمية + التطبيق", logo: "", managers: ["لجين"], clients: ["عميل هوميرا"], members: ["لجين", "مبارك", "رائد"], color: "#3f8e7f", status: "نشط" },
  { name: "ZL.Tours", description: "منصة ZL للسياحة والحجوزات الإلكترونية", logo: "", managers: ["وجد"], clients: ["عميل ZL.Tours"], members: ["وجد", "عهود"], color: "#2563eb", status: "نشط" },
  { name: "Jaz chocolate", description: "الهوية والتغليف والتصاميم لعلامة جاز", logo: "", managers: ["وجد"], clients: ["عميل جاز"], members: ["وجد", "أحمد"], color: "#d97706", status: "نشط" },
  { name: "eat plus", description: "منصة eat plus", logo: "", managers: ["أمل"], clients: ["عميل إيت بلس"], members: ["أمل"], color: "#7c3aed", status: "نشط" },
];

export const SEED_USERS = [
  { name: "خالد المطيري", role: "manager", title: "مدير المشاريع", project: "", email: "" },
  { name: "سامي الشبيلي", role: "manager", title: "الرئيس التنفيذي", project: "", email: "" },
  { name: "أمل", role: "member", title: "مدير حسابات", project: "", email: "" },
  { name: "لجين", role: "member", title: "مدير مشروع", project: "", email: "" },
  { name: "وجد", role: "member", title: "مدير مشروع", project: "", email: "" },
  { name: "عهود", role: "member", title: "تطوير (IT)", project: "", email: "" },
  { name: "مبارك", role: "member", title: "تطوير (IT)", project: "", email: "" },
  { name: "رائد", role: "member", title: "مدير المحتوى", project: "", email: "" },
  { name: "أحمد", role: "member", title: "مصمم", project: "", email: "" },
  { name: "عميل سيم برايم", role: "client", title: "عميل", project: "Seem prime", email: "" },
  { name: "عميل هوميرا", role: "client", title: "عميل", project: "Homera", email: "" },
  { name: "عميل ZL.Tours", role: "client", title: "عميل", project: "ZL.Tours", email: "" },
  { name: "عميل جاز", role: "client", title: "عميل", project: "Jaz chocolate", email: "" },
  { name: "عميل إيت بلس", role: "client", title: "عميل", project: "eat plus", email: "" },
];

// ================= الوضع المحلي (localStorage) =================
const LS_KEYS = {
  tasks: "sp_tasks",
  meetings: "sp_meetings",
  files: "sp_files",
  projects: "sp_projects",
  users: "sp_users",
  seeded: "sp_seeded_v1",
  seededPU: "sp_seeded_pu_v1",
};

function lsRead(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsWrite(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function ensureSeeded() {
  if (typeof window === "undefined") return;
  if (!window.localStorage.getItem(LS_KEYS.seeded)) {
    const tasks = SEED_TASKS.map((t, i) => ({ id: uid(), order_index: i, created_at: nowISO(), ...t }));
    lsWrite(LS_KEYS.tasks, tasks);
    lsWrite(LS_KEYS.meetings, []);
    lsWrite(LS_KEYS.files, []);
    window.localStorage.setItem(LS_KEYS.seeded, "1");
  }
  if (!window.localStorage.getItem(LS_KEYS.seededPU)) {
    lsWrite(LS_KEYS.projects, SEED_PROJECTS.map((p, i) => ({ id: uid(), order_index: i, created_at: nowISO(), ...p })));
    lsWrite(LS_KEYS.users, SEED_USERS.map((u, i) => ({ id: uid(), order_index: i, created_at: nowISO(), ...u })));
    window.localStorage.setItem(LS_KEYS.seededPU, "1");
  }
}

// مولّد CRUD عام للوضع المحلي
function localCrud(key) {
  return {
    all() {
      ensureSeeded();
      return lsRead(key, []);
    },
    add(rec) {
      ensureSeeded();
      const list = lsRead(key, []);
      const r = { id: uid(), created_at: nowISO(), ...rec };
      list.push(r);
      lsWrite(key, list);
      return r;
    },
    patch(id, patch) {
      const list = lsRead(key, []);
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return null;
      list[i] = { ...list[i], ...patch };
      lsWrite(key, list);
      return list[i];
    },
    del(id) {
      lsWrite(key, lsRead(key, []).filter((x) => x.id !== id));
    },
  };
}

// مولّد store يجمع Supabase + المحلي
function makeStore(table, lsKey, orderCol = "created_at", asc = true) {
  const local = localCrud(lsKey);
  return {
    async list() {
      if (isCloud) {
        const { data, error } = await supabase.from(table).select("*").order(orderCol, { ascending: asc });
        if (error) throw error;
        return data || [];
      }
      return local.all();
    },
    async create(rec) {
      if (isCloud) {
        const { data, error } = await supabase.from(table).insert([rec]).select().single();
        if (error) throw error;
        return data;
      }
      return local.add(rec);
    },
    async update(id, patch) {
      if (isCloud) {
        const { data, error } = await supabase.from(table).update(patch).eq("id", id).select().single();
        if (error) throw error;
        return data;
      }
      return local.patch(id, patch);
    },
    async remove(id) {
      if (isCloud) {
        const { error } = await supabase.from(table).delete().eq("id", id);
        if (error) throw error;
        return;
      }
      local.del(id);
    },
  };
}

export const tasksStore = makeStore("tasks", LS_KEYS.tasks, "order_index", true);
export const meetingsStore = makeStore("meetings", LS_KEYS.meetings, "start_at", true);
export const projectsStore = makeStore("projects", LS_KEYS.projects, "order_index", true);
export const usersStore = makeStore("users", LS_KEYS.users, "order_index", true);

// ================= الأرشيف / الملفات (رفع + روابط) =================
export const filesStore = {
  async list() {
    if (isCloud) {
      const { data, error } = await supabase.from("files").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    }
    ensureSeeded();
    return lsRead(LS_KEYS.files, []);
  },

  // رفع ملف فعلي
  async upload(file, meta) {
    if (isCloud) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${uid()}_${safe}`;
      const up = await supabase.storage.from(FILES_BUCKET).upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const rec = { kind: "file", name: file.name, path, size: file.size, mime: file.type || "", project: meta.project || "", category: meta.category || "", note: meta.note || "" };
      const { data, error } = await supabase.from("files").insert([rec]).select().single();
      if (error) throw error;
      return data;
    }
    ensureSeeded();
    const dataUrl = await fileToDataUrl(file);
    const list = lsRead(LS_KEYS.files, []);
    const rec = { id: uid(), kind: "file", created_at: nowISO(), name: file.name, size: file.size, mime: file.type || "", project: meta.project || "", category: meta.category || "", note: meta.note || "", data_url: dataUrl };
    list.unshift(rec);
    lsWrite(LS_KEYS.files, list);
    return rec;
  },

  // إضافة رابط (محضر اجتماع، تسجيل، مستند خارجي…)
  async addLink({ name, url, project, category, note }) {
    const rec = { kind: "link", name: name || url, url, project: project || "", category: category || "رابط", note: note || "" };
    if (isCloud) {
      const { data, error } = await supabase.from("files").insert([rec]).select().single();
      if (error) throw error;
      return data;
    }
    ensureSeeded();
    const list = lsRead(LS_KEYS.files, []);
    const r = { id: uid(), created_at: nowISO(), ...rec };
    list.unshift(r);
    lsWrite(LS_KEYS.files, list);
    return r;
  },

  async getUrl(rec) {
    if (rec.kind === "link") return rec.url;
    if (isCloud) {
      const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(rec.path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    }
    return rec.data_url;
  },

  async remove(rec) {
    if (isCloud) {
      if (rec.kind !== "link" && rec.path) await supabase.storage.from(FILES_BUCKET).remove([rec.path]);
      const { error } = await supabase.from("files").delete().eq("id", rec.id);
      if (error) throw error;
      return;
    }
    lsWrite(LS_KEYS.files, lsRead(LS_KEYS.files, []).filter((x) => x.id !== rec.id));
  },
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
