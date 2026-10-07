"use client";

// الإجازات والغياب: طلب → موافقة/رفض المدير → يعرف الفريق → «الحمد لله على السلامة» عند العودة.
// تُحفظ في app_settings بالمفتاح "leaves" (قائمة مشتركة سحابياً، بلا جدول جديد).

import { useCallback, useEffect, useState } from "react";
import { appSettings } from "./store";

export const LEAVE_TYPES = {
  sick: { ar: "إجازة مرضية", short: "مرضية", color: "#e0574e", bg: "#fdeceb", emoji: "🤒" },
  off: { ar: "يوم أوف", short: "أوف", color: "#2563eb", bg: "#eaf1fd", emoji: "🌴" },
  annual: { ar: "إجازة سنوية", short: "سنوية", color: "#0d9488", bg: "#e0f2ec", emoji: "✈️" },
  emergency: { ar: "إجازة طارئة", short: "طارئة", color: "#c88a2e", bg: "#fbf0de", emoji: "⚡" },
  other: { ar: "إجازة أخرى", short: "أخرى", color: "#7c3aed", bg: "#f1ebfd", emoji: "📌" },
};

export const LEAVE_STATUS = {
  pending: { ar: "بانتظار الموافقة", color: "#c88a2e", bg: "#fbf0de" },
  approved: { ar: "معتمدة", color: "#16a34a", bg: "#eaf6ef" },
  rejected: { ar: "مرفوضة", color: "#e0574e", bg: "#fdeceb" },
  cancelled: { ar: "ملغاة", color: "#64748b", bg: "#eef2f7" },
};

const KEY = "leaves";
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => `lv_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function leaveDays(l) {
  if (!l?.start || !l?.end) return 0;
  const a = new Date(l.start), b = new Date(l.end);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

// الإجازة المعتمدة التي تغطي تاريخاً ما (اليوم افتراضياً)
export function activeLeaveOf(leaves, name, day = ymd()) {
  return (leaves || []).find((l) => l.status === "approved" && l.person === name && l.start <= day && l.end >= day) || null;
}
// كل الغائبين في يوم
export function awayOn(leaves, day = ymd()) {
  return (leaves || []).filter((l) => l.status === "approved" && l.start <= day && l.end >= day);
}
// الإجازات المعتمدة القادمة (خلال n يوماً)
export function upcomingLeaves(leaves, days = 14) {
  const today = ymd();
  const lim = ymd(new Date(Date.now() + days * 86400000));
  return (leaves || []).filter((l) => l.status === "approved" && l.start > today && l.start <= lim)
    .sort((a, b) => a.start.localeCompare(b.start));
}
// إجازة انتهت ولم يُرحَّب بصاحبها بعد → «الحمد لله على السلامة»
export function returnedLeaveOf(leaves, name, day = ymd()) {
  return (leaves || [])
    .filter((l) => l.status === "approved" && l.person === name && l.end < day && !l.welcomed_at)
    .sort((a, b) => b.end.localeCompare(a.end))[0] || null;
}

async function readAll() {
  const v = await appSettings.get(KEY).catch(() => null);
  return Array.isArray(v) ? v : [];
}
async function writeAll(list) {
  await appSettings.set(KEY, list);
  return list;
}

export const leavesApi = {
  list: readAll,
  async create(rec) {
    const list = await readAll();
    const r = { id: uid(), created_at: new Date().toISOString(), status: "pending", ...rec };
    await writeAll([r, ...list]);
    return r;
  },
  async update(id, patch) {
    const list = await readAll();
    const next = list.map((l) => (l.id === id ? { ...l, ...patch } : l));
    await writeAll(next);
    return next.find((l) => l.id === id);
  },
  async remove(id) {
    const list = await readAll();
    await writeAll(list.filter((l) => l.id !== id));
  },
};

// خطاف موحّد لقراءة الإجازات وتحديثها
export function useLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    const l = await readAll();
    setLeaves(l);
    setLoaded(true);
    return l;
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { leaves, loaded, reload };
}
