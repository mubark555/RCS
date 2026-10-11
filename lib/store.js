"use client";

// طبقة الوصول للبيانات: تستخدم Supabase عند توفر المفاتيح،
// وإلا تتحول تلقائياً إلى الحفظ المحلي (localStorage) لتجربة فورية.

import { supabase, isCloud, FILES_BUCKET } from "./supabase";
import { SEED_TASKS } from "./seed-data";
import { applyAction, ACTION_AR } from "./workflow.mjs";
import { DEFAULT_ROLES } from "./permissions.mjs";

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
  { name: "أمل", role: "member", title: "مدير حسابات", project: "", email: "", aliases: ["Amal"] },
  { name: "لجين", role: "member", title: "مدير مشروع", project: "", email: "", aliases: ["Lujain"] },
  { name: "وجد", role: "member", title: "مدير مشروع", project: "", email: "", aliases: ["Wajd"] },
  { name: "عهود", role: "member", title: "تطوير (IT)", project: "", email: "", aliases: ["Ohood"] },
  { name: "مبارك", role: "member", title: "تطوير (IT)", project: "", email: "", aliases: ["Mubarak", "Mubrak"] },
  { name: "رائد", role: "member", title: "مدير المحتوى", project: "", email: "", aliases: ["Raed"] },
  { name: "أحمد", role: "member", title: "مصمم", project: "", email: "", aliases: ["Ahmad"] },
  { name: "عميل سيم برايم", role: "client", title: "عميل", project: "Seem prime", email: "" },
  { name: "عميل هوميرا", role: "client", title: "عميل", project: "Homera", email: "" },
  { name: "عميل ZL.Tours", role: "client", title: "عميل", project: "ZL.Tours", email: "" },
  { name: "عميل جاز", role: "client", title: "عميل", project: "Jaz chocolate", email: "" },
  { name: "عميل إيت بلس", role: "client", title: "عميل", project: "eat plus", email: "" },
];

export const SEED_KPIS = [
  { name: "إيرادات الوكالة", category: "مالي", unit: "ريال", current: 342000, target: 500000, up: true },
  { name: "عدد العملاء الجدد", category: "نمو", unit: "عميل", current: 14, target: 20, up: true },
  { name: "إنجاز المشاريع في الوقت المحدد", category: "تشغيلي", unit: "%", current: 82, target: 90, up: true },
  { name: "رضا العملاء (CSAT)", category: "رضا", unit: "%", current: 91, target: 95, up: true },
  { name: "متابعو حسابات السوشال ميديا", category: "تسويقي", unit: "", current: 198000, target: 250000, up: true },
  { name: "معدل تحويل الحملات الإعلانية", category: "تسويقي", unit: "%", current: 3.8, target: 4.5, up: false },
  { name: "المهام المنجزة", category: "تشغيلي", unit: "مهمة", current: 91, target: 120, up: true },
  { name: "هامش صافي الربح", category: "مالي", unit: "%", current: 24, target: 30, up: false },
];

// ================= الوضع المحلي (localStorage) =================
const LS_KEYS = {
  tasks: "sp_tasks",
  meetings: "sp_meetings",
  files: "sp_files",
  projects: "sp_projects",
  users: "sp_users",
  kpis: "sp_kpis",
  events: "sp_task_events",
  roles: "sp_roles",
  units: "sp_units",
  seededRoles: "sp_seeded_roles_v1",
  seeded: "sp_seeded_v1",
  seededPU: "sp_seeded_pu_v1",
  seededKpi: "sp_seeded_kpi_v1",
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
  if (!window.localStorage.getItem(LS_KEYS.seededRoles)) {
    lsWrite(LS_KEYS.roles, DEFAULT_ROLES.map((r, i) => ({ id: uid(), order_index: i, created_at: nowISO(), ...r })));
    if (!window.localStorage.getItem(LS_KEYS.units)) lsWrite(LS_KEYS.units, []);
    window.localStorage.setItem(LS_KEYS.seededRoles, "1");
  }
  if (!window.localStorage.getItem(LS_KEYS.seededKpi)) {
    lsWrite(LS_KEYS.kpis, SEED_KPIS.map((k, i) => ({ id: uid(), order_index: i, created_at: nowISO(), ...k })));
    window.localStorage.setItem(LS_KEYS.seededKpi, "1");
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

// ================= المستخدم الحالي (لسجل التدقيق) =================
let _actor = null;
export function setActor(user) {
  _actor = user || null;
}
const actorFields = () => ({ actor_id: _actor?.id || null, actor_name: _actor?.name || "" });

// حقول المعرّفات: النص الفارغ يُحفظ null (أعمدة uuid في قاعدة البيانات)
const ID_FIELDS = ["assignee_id", "reviewer_id", "approver_id", "final_approver_id", "created_by", "meeting_id"];
function cleanIds(rec) {
  const r = { ...rec };
  for (const k of ID_FIELDS) if (k in r && !r[k]) r[k] = null;
  return r;
}

// ================= سجل التدقيق =================
const _events = makeStore("task_events", LS_KEYS.events, "created_at", true);
export const eventsStore = {
  async forTask(taskId) {
    if (isCloud) {
      const { data, error } = await supabase.from("task_events").select("*").eq("task_id", taskId).order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    }
    return (await _events.list()).filter((e) => e.task_id === taskId);
  },
  async recent(limit = 200) {
    if (isCloud) {
      const { data, error } = await supabase.from("task_events").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    }
    return (await _events.list()).slice(-limit).reverse();
  },
  // التسجيل لا يجب أن يُفشل العملية الأصلية
  async log(e) {
    try {
      await _events.create({ ...actorFields(), from_stage: null, to_stage: null, note: "", ...e });
    } catch (err) {
      console.warn("audit log failed", err);
    }
  },
};

const FIELD_AR = {
  task: "المهمة", project: "المشروع", activity: "النشاط", priority: "الأولوية", assigned_to: "المسؤول", assignee_id: "المسؤول",
  due_date: "الاستحقاق", notes: "الملاحظات", blocker: "العائق", health: "الصحة", workflow: "مسار الاعتماد",
  reviewer_id: "المراجع", approver_id: "صاحب الموافقة", final_approver_id: "صاحب الاعتماد", waiting_on: "بانتظار",
  links: "الروابط", holder: "الحائز", handoffs: "التحويلات",
};

const _tasks = makeStore("tasks", LS_KEYS.tasks, "order_index", true);
export const tasksStore = {
  list: _tasks.list,
  async create(rec) {
    const r = await _tasks.create(cleanIds({ stage: "not_started", status: "Not Started", approval_status: "", created_by: _actor?.id || null, ...rec }));
    await eventsStore.log({ task_id: r.id, task_title: r.task, action: "create", to_stage: r.stage || "not_started" });
    return r;
  },
  // تعديل البيانات فقط — الحالة لا تتغير إلا عبر transition
  async update(id, patch, prev) {
    const { stage, status, approval_status, completed_at, submitted_at, review_note, ...rest } = patch;
    const r = await _tasks.update(id, cleanIds(rest));
    const changed = Object.keys(rest).filter((k) => !prev || JSON.stringify(prev[k] ?? "") !== JSON.stringify(rest[k] ?? ""));
    if (changed.length) {
      const handoff = changed.includes("handoffs") && changed.includes("holder");
      await eventsStore.log({
        task_id: id, task_title: r?.task || prev?.task || "", action: handoff ? "handoff" : "edit",
        note: handoff ? (rest.handoffs?.[rest.handoffs.length - 1]?.note || "") : changed.map((k) => FIELD_AR[k] || k).join("، "),
        meta: handoff ? { to: rest.holder } : { fields: changed },
      });
    }
    return r;
  },
  async remove(id, prev) {
    await eventsStore.log({ task_id: id, task_title: prev?.task || "", action: "delete" });
    return _tasks.remove(id);
  },
  // تنفيذ إجراء سير عمل (تنفيذ/مراجعة/موافقة/اعتماد…)
  async transition(task, action, note = "") {
    if (isCloud) {
      const { data, error } = await supabase.rpc("task_transition", { p_task: task.id, p_action: action, p_note: note, p_actor: _actor?.id || null });
      if (error) {
        if (/task_transition/.test(error.message || "") && /find|exist/i.test(error.message || "")) {
          throw new Error("يجب تشغيل ترحيل قاعدة البيانات supabase/migrations/001_workflow_identity.sql أولاً.");
        }
        throw new Error(error.message);
      }
      return data;
    }
    const { patch, event } = applyAction(task, action, _actor, note);
    const r = await _tasks.update(task.id, patch);
    await eventsStore.log({ ...event, task_title: task.task });
    return r;
  },
};
export { ACTION_AR };
export const meetingsStore = makeStore("meetings", LS_KEYS.meetings, "start_at", true);
export const projectsStore = makeStore("projects", LS_KEYS.projects, "order_index", true);
export const usersStore = makeStore("users", LS_KEYS.users, "order_index", true);
export const kpisStore = makeStore("kpis", LS_KEYS.kpis, "created_at", true);
export const rolesStore = makeStore("roles", LS_KEYS.roles, "order_index", true);
export const unitsStore = makeStore("units", LS_KEYS.units, "order_index", true);

// ربط حساب الدخول بالمستخدم عند أول دخول (عبر البريد) — يتم في الخادم
export async function linkMyAccount() {
  if (!isCloud) return null;
  const { data, error } = await supabase.rpc("link_my_account");
  if (error) throw error;
  return data && data.id ? data : null;
}

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
