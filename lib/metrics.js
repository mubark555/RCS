// حسابات موحّدة (مصدر واحد): الرئيسية وصفحة المشروع والتقارير تستخدم نفس الدوال،
// فأي تحديث على مهمة/مؤشر/فاتورة ينعكس في كل مكان تلقائياً.

import { isDone, isOverdue, taskProgress, invoiceState } from "./constants";

const DAY = 86400000;
export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// عدد الأيام من اليوم حتى تاريخ (سالب = مضى)
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.round((startOfDay(d) - startOfDay()) / DAY);
}
// «بعد 3 أيام» / «اليوم» / «متأخرة 5 أيام»
export function relDays(n) {
  if (n == null) return "—";
  if (n === 0) return "اليوم";
  if (n === 1) return "غداً";
  if (n > 0) return `بعد ${n} ${n <= 10 ? "أيام" : "يوماً"}`;
  const m = -n;
  return `متأخرة ${m} ${m === 1 ? "يوم" : m <= 10 ? "أيام" : "يوماً"}`;
}

// ---------------- المهام / المشاريع ----------------
export function taskStats(tasks) {
  const list = tasks || [];
  const total = list.length;
  const done = list.filter(isDone).length;
  const progress = total ? Math.round(list.reduce((s, t) => s + taskProgress(t), 0) / total) : 0;
  const overdue = list.filter((t) => isOverdue(t));
  const onHold = list.filter((t) => t.on_hold && !isDone(t));
  const pendingReview = list.filter((t) => t.status === "Pending Review");
  const revision = list.filter((t) => t.status === "Revision Needed");
  const open = total - done;
  return { total, done, open, progress, overdue, onHold, pendingReview, revision };
}

// حالة المشروع المحسوبة من مهامه
export function projectHealth(st, projectStatus) {
  if (projectStatus === "مكتمل" || (st.total > 0 && st.done === st.total)) return { key: "done", label: "مكتمل", color: "#0d9488", bg: "#e0f2ec" };
  if (projectStatus === "معلّق") return { key: "hold", label: "معلّق", color: "#b45309", bg: "#fdf0dd" };
  const lateRatio = st.open ? st.overdue.length / st.open : 0;
  if (st.overdue.length >= 3 || lateRatio > 0.25) return { key: "late", label: "متعثر", color: "#e0574e", bg: "#fdeceb" };
  if (st.overdue.length > 0 || st.onHold.length > 0 || st.revision.length > 0) return { key: "risk", label: "معرّض للتعثر", color: "#c88a2e", bg: "#fbf0de" };
  return { key: "ok", label: "على المسار", color: "#16a34a", bg: "#eaf6ef" };
}

// التسليمات القادمة خلال عدد أيام (غير المعتمدة)
export function upcomingTasks(tasks, days = 14) {
  return (tasks || [])
    .filter((t) => !isDone(t) && t.due_date)
    .map((t) => ({ t, days: daysUntil(t.due_date) }))
    .filter((x) => x.days != null && x.days >= 0 && x.days <= days)
    .sort((a, b) => a.days - b.days);
}
export function overdueTasks(tasks) {
  return (tasks || [])
    .filter((t) => isOverdue(t))
    .map((t) => ({ t, days: daysUntil(t.due_date) }))
    .sort((a, b) => a.days - b.days);
}

// ---------------- المؤشرات ----------------
// نسبة التحقق لمؤشر (قد تتجاوز 100%)
export function kpiPct(k) {
  const target = Number(k?.target) || 0;
  const cur = Number(k?.current) || 0;
  if (!target) return 0;
  return Math.min(999, Math.round((cur / target) * 100));
}
// متوسط التحقق (كل مؤشر بحدّ أقصى 100%)
export function kpiAchievement(kpis) {
  const list = kpis || [];
  if (!list.length) return null;
  return Math.round(list.reduce((s, k) => s + Math.min(100, kpiPct(k)), 0) / list.length);
}

// ---------------- المالية ----------------
export function invoiceRows(invoices, payments) {
  const paidBy = {};
  (payments || []).forEach((p) => { paidBy[p.invoice_id] = (paidBy[p.invoice_id] || 0) + (Number(p.amount) || 0); });
  return (invoices || []).map((inv) => {
    const paid = paidBy[inv.id] || 0;
    const amount = Number(inv.amount) || 0;
    return { ...inv, paid, amount, outstanding: Math.max(0, amount - paid), st: invoiceState(inv, paid), days: daysUntil(inv.due_date) };
  });
}
// المستحقات: الفواتير المُرسلة غير المسدّدة بالكامل
export function receivables(rows) {
  const open = (rows || []).filter((r) => r.status !== "ملغاة" && r.status !== "مسودة" && r.outstanding > 0);
  const sum = (l) => l.reduce((s, r) => s + r.outstanding, 0);
  const overdue = open.filter((r) => r.days != null && r.days < 0);
  const due30 = open.filter((r) => r.days != null && r.days >= 0 && r.days <= 30);
  return {
    open: open.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999)),
    total: sum(open),
    overdue, overdueTotal: sum(overdue),
    due30, due30Total: sum(due30),
  };
}
export function money(n) {
  return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
