"use client";

// دورة العمل والاعتماد:
// لم تبدأ → قيد التنفيذ → (ڤيوليت: جاهزة للتسليم) → بانتظار مراجعة سيم → معتمدة
//                                                                 ↘ مطلوب تعديل → يعود للمسؤول مع الملاحظات
// جاهزية التسليم (ڤيوليت) مُسجّلة منفصلة عن قرار الاعتماد (سيم).

import { tasksStore, projectsStore } from "./store";

const nowISO = () => new Date().toISOString();
const reviewsOf = (t) => (Array.isArray(t?.reviews) ? t.reviews : []);

// من يستطيع اتخاذ قرار الاعتماد: ممثل سيم (عميل) أو مدير النظام (نيابةً عن سيم)
export const canReview = (role) => role === "client" || role === "manager";
// من يستطيع تسليم العمل للمراجعة: فريق ڤيوليت
export const canSubmit = (role) => role === "manager" || role === "member";

// ڤيوليت: التسليم جاهز → يُرسل لمراجعة سيم
export async function submitForReview(task, actor, note = "") {
  const at = nowISO();
  return tasksStore.update(task.id, {
    status: "Pending Review",
    ready_at: at,
    ready_by: actor || "",
    holder: "سيم برايم",
    waiting_on: "سيم برايم",
    on_hold: false,
    reviews: [...reviewsOf(task), { decision: "submitted", by: actor || "", at, note }],
  }, { action: "submit", entity: "تسليم" });
}

// سيم: اعتماد
export async function approveTask(task, actor, note = "") {
  const at = nowISO();
  return tasksStore.update(task.id, {
    status: "Approved",
    progress: 100,
    reviewed_by: actor || "",
    reviewed_at: at,
    review_note: note,
    completed_at: at,
    health: "Completed",
    holder: "",
    waiting_on: "",
    on_hold: false,
    approval_status: "Approved",
    reviews: [...reviewsOf(task), { decision: "approved", by: actor || "", at, note }],
  }, { action: "approve", entity: "تسليم" });
}

// سيم: طلب تعديل — تعود المهمة إلى المسؤول مع الملاحظات
export async function requestRevision(task, actor, note) {
  const at = nowISO();
  return tasksStore.update(task.id, {
    status: "Revision Needed",
    reviewed_by: actor || "",
    reviewed_at: at,
    review_note: note || "",
    holder: task.assigned_to || "",
    waiting_on: "ڤيوليت",
    approval_status: "Revision needed",
    reviews: [...reviewsOf(task), { decision: "revision", by: actor || "", at, note: note || "" }],
  }, { action: "revision", entity: "تسليم" });
}

// كل القرارات عبر المهام (للسجل في قسم الاعتمادات)
export function allReviews(tasks) {
  const out = [];
  (tasks || []).forEach((t) => reviewsOf(t).forEach((r, i) => out.push({ ...r, task: t, key: `${t.id}-${i}` })));
  return out.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
}

// إضافة مخرج جديد لقائمة مخرجات المشروع (إن لم يكن موجوداً) — مصدر بيانات واحد
export async function ensureDeliverable(projectName, deliverable) {
  const d = String(deliverable || "").trim();
  if (!projectName || !d) return;
  try {
    const p = (await projectsStore.list()).find((x) => x.name === projectName);
    if (!p) return;
    const list = Array.isArray(p.deliverables) ? p.deliverables : [];
    if (list.includes(d)) return;
    await projectsStore.update(p.id, { deliverables: [...list, d] }, { action: "update", entity: "" });
  } catch {}
}
