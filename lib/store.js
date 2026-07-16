"use client";

// طبقة الوصول للبيانات: تستخدم Supabase عند توفر المفاتيح،
// وإلا تتحول تلقائياً إلى الحفظ المحلي (localStorage) لتجربة فورية.

import { supabase, isCloud, FILES_BUCKET } from "./supabase";
import { SEED_TASKS } from "./seed-data";

export { isCloud };

// ---------- توليد المعرّفات (بدون Date.now للتوافق) ----------
let _counter = 0;
function uid() {
  _counter += 1;
  const rnd = Math.floor(Math.random() * 1e9).toString(36);
  return `${rnd}${_counter.toString(36)}`;
}

function nowISO() {
  return new Date().toISOString();
}

// ================= الوضع المحلي (localStorage) =================
const LS_KEYS = {
  tasks: "sp_tasks",
  meetings: "sp_meetings",
  files: "sp_files",
  seeded: "sp_seeded_v1",
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
  if (window.localStorage.getItem(LS_KEYS.seeded)) return;
  const tasks = SEED_TASKS.map((t, i) => ({
    id: uid(),
    order_index: i,
    created_at: nowISO(),
    ...t,
  }));
  lsWrite(LS_KEYS.tasks, tasks);
  lsWrite(LS_KEYS.meetings, []);
  lsWrite(LS_KEYS.files, []);
  window.localStorage.setItem(LS_KEYS.seeded, "1");
}

// ================= المهام =================
export const tasksStore = {
  async list() {
    if (isCloud) {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data || [];
    }
    ensureSeeded();
    return lsRead(LS_KEYS.tasks, []);
  },

  async create(task) {
    if (isCloud) {
      const { data, error } = await supabase
        .from("tasks")
        .insert([task])
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    ensureSeeded();
    const tasks = lsRead(LS_KEYS.tasks, []);
    const rec = { id: uid(), created_at: nowISO(), order_index: tasks.length, ...task };
    tasks.push(rec);
    lsWrite(LS_KEYS.tasks, tasks);
    return rec;
  },

  async update(id, patch) {
    if (isCloud) {
      const { data, error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const tasks = lsRead(LS_KEYS.tasks, []);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx], ...patch };
      lsWrite(LS_KEYS.tasks, tasks);
      return tasks[idx];
    }
    return null;
  },

  async remove(id) {
    if (isCloud) {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
      return;
    }
    const tasks = lsRead(LS_KEYS.tasks, []).filter((t) => t.id !== id);
    lsWrite(LS_KEYS.tasks, tasks);
  },
};

// ================= الاجتماعات =================
export const meetingsStore = {
  async list() {
    if (isCloud) {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .order("start_at", { ascending: true });
      if (error) throw error;
      return data || [];
    }
    ensureSeeded();
    return lsRead(LS_KEYS.meetings, []);
  },

  async create(m) {
    if (isCloud) {
      const { data, error } = await supabase
        .from("meetings")
        .insert([m])
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    ensureSeeded();
    const list = lsRead(LS_KEYS.meetings, []);
    const rec = { id: uid(), created_at: nowISO(), ...m };
    list.push(rec);
    lsWrite(LS_KEYS.meetings, list);
    return rec;
  },

  async update(id, patch) {
    if (isCloud) {
      const { data, error } = await supabase
        .from("meetings")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const list = lsRead(LS_KEYS.meetings, []);
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
      lsWrite(LS_KEYS.meetings, list);
      return list[idx];
    }
    return null;
  },

  async remove(id) {
    if (isCloud) {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
      return;
    }
    const list = lsRead(LS_KEYS.meetings, []).filter((x) => x.id !== id);
    lsWrite(LS_KEYS.meetings, list);
  },
};

// ================= الأرشيف / الملفات =================
export const filesStore = {
  async list() {
    if (isCloud) {
      const { data, error } = await supabase
        .from("files")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    }
    ensureSeeded();
    return lsRead(LS_KEYS.files, []);
  },

  // file: File object من متصفح المستخدم. meta: { project, category, note }
  async upload(file, meta) {
    if (isCloud) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${uid()}_${safe}`;
      const up = await supabase.storage
        .from(FILES_BUCKET)
        .upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const rec = {
        name: file.name,
        path,
        size: file.size,
        mime: file.type || "",
        project: meta.project || "",
        category: meta.category || "",
        note: meta.note || "",
      };
      const { data, error } = await supabase
        .from("files")
        .insert([rec])
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    // محلي: نخزّن الملف كـ base64 (مناسب للتجربة والملفات الصغيرة)
    ensureSeeded();
    const dataUrl = await fileToDataUrl(file);
    const list = lsRead(LS_KEYS.files, []);
    const rec = {
      id: uid(),
      created_at: nowISO(),
      name: file.name,
      size: file.size,
      mime: file.type || "",
      project: meta.project || "",
      category: meta.category || "",
      note: meta.note || "",
      data_url: dataUrl,
    };
    list.unshift(rec);
    lsWrite(LS_KEYS.files, list);
    return rec;
  },

  async getUrl(rec) {
    if (isCloud) {
      const { data, error } = await supabase.storage
        .from(FILES_BUCKET)
        .createSignedUrl(rec.path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    }
    return rec.data_url;
  },

  async remove(rec) {
    if (isCloud) {
      await supabase.storage.from(FILES_BUCKET).remove([rec.path]);
      const { error } = await supabase.from("files").delete().eq("id", rec.id);
      if (error) throw error;
      return;
    }
    const list = lsRead(LS_KEYS.files, []).filter((x) => x.id !== rec.id);
    lsWrite(LS_KEYS.files, list);
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
