// «حياة» أمل: ماذا تقول ومتى، بحسب الصفحة والوقت وأحداث النظام.
// دوال نقية تُرجع { mood, text, chips? } — والواجهة (AmalAssistant) تقرر العرض والحركة.
// المزاجات: idle | wave | happy | celebrate | concerned | thinking | talk | sleep | listen

import { isDone, isOverdue, normalizeChain, chainHolder, STATUS_META } from "./constants";
import { taskStats, projectHealth, upcomingTasks, overdueTasks, daysUntil, relDays, kpiPct, invoiceRows, receivables } from "./metrics";
import { awayOn } from "./leaves";

export function timeGreeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return "مساء الخير";
  if (h < 12) return "صباح الخير";
  return "مساء الخير";
}

const firstName = (viewer, role) => (role === "client" ? "" : String(viewer?.name || "").split(" ")[0]);
const n = (x, one, two, few, many) => (x === 1 ? one : x === 2 ? two : x <= 10 ? `${x} ${few}` : `${x} ${many}`);
const tasksW = (x) => n(x, "مهمة واحدة", "مهمتين", "مهام", "مهمة");
const holderOf = (t) => chainHolder(normalizeChain(t.chain)) || t.holder || t.waiting_on || t.assigned_to || "";

// ================= تحية الدخول =================
export function welcome(ctx) {
  const name = firstName(ctx.viewer, ctx.role);
  const g = timeGreeting();
  const st = taskStats(ctx.tasks || []);
  if (ctx.can("tasks") && st.overdue.length) {
    return {
      mood: "wave",
      text: `${g}${name ? ` يا ${name}` : ""} 👋 أنا أمل. لاحظت ${tasksW(st.overdue.length)} متأخرة، تبيني أعرضها لك؟`,
      chips: ["المهام المتأخرة", "ملخّص اليوم"],
    };
  }
  return { mood: "wave", text: `${g}${name ? ` يا ${name}` : ""} 👋 أنا أمل، موجودة هنا لو احتجتني.`, chips: ["ملخّص اليوم"] };
}

// ================= نصيحة حسب الصفحة =================
export function pageTip(path, ctx) {
  const { can } = ctx;
  const tasks = ctx.tasks || [];
  const p = String(path || "/");

  if (p === "/") {
    if (!can("tasks")) return null;
    const up = upcomingTasks(tasks, 0).length;
    const od = overdueTasks(tasks).length;
    if (!up && !od) return { mood: "happy", text: "ما فيه شي متأخر ولا مستحق اليوم، يوم هادي 😌", chips: ["وش المستحق هالأسبوع؟"] };
    return { mood: od ? "concerned" : "idle", text: `اليوم: ${up ? `${tasksW(up)} مستحقة` : "ما فيه مستحق"}${od ? `، و${tasksW(od)} متأخرة` : ""}.`, chips: ["ملخّص اليوم", od ? "المهام المتأخرة" : "وش المستحق هالأسبوع؟"] };
  }

  if (p.startsWith("/tasks")) {
    if (!can("tasks")) return null;
    if (ctx.viewer && ctx.role !== "client") {
      const mine = tasks.filter((t) => !isDone(t) && String(holderOf(t)).trim() === ctx.viewer.name);
      if (mine.length) return { mood: "idle", text: `عندك الدور في ${tasksW(mine.length)}. أرتّبها لك حسب الأولوية؟`, chips: ["وش المهام اللي عندي؟"] };
    }
    const pr = tasks.filter((t) => t.status === "Pending Review").length;
    if (pr) return { mood: "idle", text: `فيه ${tasksW(pr)} بانتظار اعتماد سيم.`, chips: ["وش ينتظر الاعتماد؟"] };
    return { mood: "idle", text: "تقدر تقول لي «أنشئ مهمة …» وأجهزها لك بثواني ✍️", chips: can("tasks", "edit") ? ["أنشئ مهمة"] : [] };
  }

  const projMatch = p.match(/^\/projects\/([^/]+)/);
  if (projMatch && can("projects")) {
    const pr = (ctx.projects || []).find((x) => String(x.id) === decodeURIComponent(projMatch[1]));
    if (!pr) return null;
    const list = tasks.filter((t) => t.project === pr.name);
    const st = taskStats(list);
    const h = projectHealth(st, pr.status);
    return {
      mood: h.key === "late" ? "concerned" : h.key === "ok" || h.key === "done" ? "happy" : "idle",
      text: `${pr.name}: ${h.label}، والإنجاز ${st.progress}%${st.overdue.length ? ` — فيه ${tasksW(st.overdue.length)} متأخرة` : ""}.`,
      chips: [`كيف وضع مشروع ${pr.name}`],
    };
  }

  if (p.startsWith("/projects") && can("projects")) {
    const rows = (ctx.projects || []).map((pr) => {
      const st = taskStats(tasks.filter((t) => t.project === pr.name));
      return { pr, st };
    }).filter((r) => r.st.total).sort((a, b) => b.st.overdue.length - a.st.overdue.length);
    if (!rows.length) return null;
    const top = rows[0];
    if (!top.st.overdue.length) return { mood: "happy", text: "كل المشاريع ماشية بدون تأخير 👏", chips: ["وضع المشاريع"] };
    return { mood: "concerned", text: `أكثر مشروع يحتاج انتباه: ${top.pr.name} (${tasksW(top.st.overdue.length)} متأخرة).`, chips: [`كيف وضع مشروع ${top.pr.name}`, "وضع المشاريع"] };
  }

  if (p.startsWith("/approvals")) {
    const pr = tasks.filter((t) => t.status === "Pending Review");
    const rv = tasks.filter((t) => t.status === "Revision Needed");
    if (!pr.length && !rv.length) return { mood: "happy", text: "ما فيه شي ينتظر الاعتماد ✅" };
    return { mood: "idle", text: `${pr.length ? `${tasksW(pr.length)} تنتظر قرار سيم` : ""}${pr.length && rv.length ? "، و" : ""}${rv.length ? `${tasksW(rv.length)} مطلوب فيها تعديل` : ""}.`, chips: ["وش ينتظر الاعتماد؟"] };
  }

  if (p.startsWith("/meetings") && can("meetings")) {
    const now = new Date().toISOString();
    const next = (ctx.meetings || []).filter((m) => (m.status || "Scheduled") === "Scheduled" && m.start_at >= now)
      .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))[0];
    const pending = (ctx.meetings || []).filter((m) => m.status === "Done").length;
    if (pending) return { mood: "idle", text: `فيه ${n(pending, "محضر واحد", "محضرين", "محاضر", "محضراً")} ينتظر الاعتماد.`, chips: ["المحاضر اللي تنتظر الاعتماد"] };
    if (next) {
      const d = daysUntil(next.start_at);
      return { mood: "idle", text: `أقرب اجتماع: «${next.title}» ${d === 0 ? "اليوم" : d === 1 ? "بكرة" : relDays(d)}.`, chips: ["الاجتماعات الجاية"] };
    }
    return { mood: "idle", text: "ما فيه اجتماعات قادمة مجدولة.", chips: ["آخر اجتماع"] };
  }

  if (p.startsWith("/kpis") && can("kpis")) {
    let k = ctx.kpis || [];
    if (ctx.role === "client") k = k.filter((x) => (x.visibility || "private") === "public");
    const weak = [...k].sort((a, b) => kpiPct(a) - kpiPct(b))[0];
    if (!weak) return null;
    return kpiPct(weak) >= 100
      ? { mood: "celebrate", text: "كل المستهدفات محققة! 🎉" }
      : { mood: "concerned", text: `أضعف مؤشر حالياً: «${weak.name}» عند ${kpiPct(weak)}% من الهدف.`, chips: ["المستهدفات المتأخرة"] };
  }

  if (p.startsWith("/finance") && can("finance")) {
    const rec = receivables(invoiceRows(ctx.invoices || [], ctx.payments || []));
    if (!rec.open.length) return { mood: "happy", text: "ما فيه فواتير غير مسددة ✅" };
    return { mood: rec.overdue.length ? "concerned" : "idle", text: `المستحقات المفتوحة ${Math.round(rec.total).toLocaleString("ar-SA")} ريال${rec.overdue.length ? `، منها ${rec.overdue.length} متأخرة` : ""}.`, chips: ["الفواتير غير المسددة"] };
  }

  if (p.startsWith("/leaves") && can("leaves")) {
    const away = awayOn(ctx.leaves || []);
    return away.length
      ? { mood: "idle", text: `غايب اليوم: ${away.map((l) => l.person).join("، ")}. الله يعطيهم العافية 🌿`, chips: ["مين غايب اليوم؟"] }
      : { mood: "happy", text: "الفريق كامل اليوم 💪", chips: ["مين غايب اليوم؟"] };
  }

  if (p.startsWith("/reports")) return { mood: "idle", text: "تبي ملخص سريع قبل التقرير الكامل؟", chips: ["ملخّص اليوم", "وضع المشاريع"].filter((c) => c !== "وضع المشاريع" || can("projects")) };
  return null;
}

// ================= ردود الفعل على أحداث النظام =================
// evt من onDataChange: { entity, action, record, label, table }
export function reactionFor(evt, viewer) {
  if (!evt) return null;
  const rec = evt.record || {};
  const label = String(evt.label || rec.task || rec.title || rec.name || "").slice(0, 60);
  const name = String(viewer?.name || "").split(" ")[0];

  if (evt.table === "tasks") {
    if (evt.action === "approve" || rec.status === "Approved") {
      return { mood: "celebrate", text: `مبروك! اعتُمدت «${label}» 🎉` };
    }
    if (evt.action === "submit" || rec.status === "Pending Review") return { mood: "happy", text: `أرسلتها للمراجعة 👏 بتابعها معك لين تنعتمد.` };
    if (evt.action === "revision" || rec.status === "Revision Needed") return { mood: "concerned", text: "طلبوا تعديل… ولا يهمك، نخلصها سوا 💪", chips: ["وش ينتظر الاعتماد؟"] };
    if (evt.action === "create") return { mood: "happy", text: `أضفت «${label}» ✍️ ${rec.due_date ? `موعدها ${relDays(daysUntil(rec.due_date))}.` : ""}`.trim() };
    if (evt.action === "delete") return { mood: "idle", text: "انحذفت المهمة 🗑️" };
    if (rec.status === "In Progress") return { mood: "happy", text: `يلا${name ? ` يا ${name}` : ""}! «${label}» صارت قيد التنفيذ 🚀` };
    if (rec.on_hold) return { mood: "concerned", text: "تعلّقت المهمة… إذا فيه عائق اكتبه عشان نتابعه." };
    return { mood: "idle", text: "تم حفظ التعديل ✔️" };
  }
  if (evt.table === "meetings") {
    if (evt.action === "approve") return { mood: "celebrate", text: "اعتمدتم المحضر 👌 تحب أحوّل قراراته لمهام؟" };
    if (evt.action === "create") return { mood: "happy", text: `انجدول «${label}» 📅` };
    return null;
  }
  if (evt.table === "payments" && evt.action === "create") return { mood: "celebrate", text: "وصلت دفعة جديدة 💰" };
  if (evt.table === "invoices" && evt.action === "create") return { mood: "happy", text: `انضافت الفاتورة ${label} 🧾` };
  if (evt.table === "kpis" && evt.action === "update" && Number(rec.current) >= Number(rec.target) && Number(rec.target) > 0) {
    return { mood: "celebrate", text: `حققتم مستهدف «${label}»! 🎯` };
  }
  return null;
}

// ================= تلميحات الخمول =================
export const IDLE_TIPS = [
  { text: "تدري إنك تقدر تسألني «وش علي اليوم؟» 😊", chips: ["وش علي اليوم؟"] },
  { text: "اكتب لي «أنشئ مهمة … لفلان بكرة» وأجهزها لك.", chips: ["أنشئ مهمة"] },
  { text: "أقدر أقول لك مين عنده أكثر مهام متأخرة.", chips: ["مين عنده أكثر مهام متأخرة؟"] },
  { text: "افتح أي مهمة واضغط «اسألي أمل» وألخّصها لك.", chips: [] },
];

// ================= ملخّص مهمة واحدة (زر «اسألي أمل» داخل المهمة) =================
export function summarizeTask(t, comments = []) {
  if (!t) return { text: "ما لقيت المهمة." };
  const st = STATUS_META[t.status] || { ar: t.status };
  const lines = [`📌 «${String(t.task || "").trim() || "مهمة بلا عنوان"}»${t.project ? ` — ${t.project}` : ""}`];
  lines.push(`الحالة: ${st.ar}${t.on_hold ? " (معلّقة)" : ""}${t.due_date ? ` · الاستحقاق ${isDone(t) ? t.due_date : relDays(daysUntil(t.due_date))}` : ""}.`);
  const holder = holderOf(t);
  if (holder) lines.push(`الدور حالياً عند: ${holder}.`);
  const chain = normalizeChain(t.chain);
  if (chain.length) {
    const done = chain.filter((s) => s.status === "done" || s.status === "approved").length;
    lines.push(`سلسلة العمل: ${done} من ${chain.length} خطوات منجزة.`);
  }
  if (String(t.blocker || "").trim()) lines.push(`⚠️ العائق: ${String(t.blocker).trim().slice(0, 140)}`);
  const hand = Array.isArray(t.handoffs) ? t.handoffs : [];
  if (hand.length) {
    const h = hand[hand.length - 1];
    lines.push(`آخر تحويل: من ${h.from} إلى ${h.to}${h.note ? ` (${h.note})` : ""}.`);
  }
  const msgs = (comments || []).filter((c) => String(c.body || "").trim() || (c.attachments || []).length);
  if (msgs.length) {
    lines.push(`\n💬 في الشات ${n(msgs.length, "رسالة واحدة", "رسالتين", "رسائل", "رسالة")}. آخر ما قيل:`);
    msgs.slice(-3).forEach((c) => {
      const att = (c.attachments || []).length ? ` 📎${(c.attachments || []).length}` : "";
      lines.push(`• ${c.author || "—"}: ${String(c.body || "").trim().slice(0, 110) || "(مرفق)"}${att}`);
    });
  } else {
    lines.push("\n💬 ما فيه نقاش في شات المهمة للحين.");
  }
  let mood = "idle";
  let advice = "";
  if (isDone(t)) { mood = "celebrate"; advice = "المهمة معتمدة ومنتهية 🎉"; }
  else if (isOverdue(t)) { mood = "concerned"; advice = `متأخرة — أقترح تتواصل مع ${holder || "المسؤول"} وتحدد موعد جديد.`; }
  else if (t.status === "Pending Review") advice = "تنتظر قرار سيم بالاعتماد أو التعديل.";
  else if (t.status === "Revision Needed") { mood = "concerned"; advice = "مطلوب فيها تعديل — راجع ملاحظة المراجعة."; }
  else if (t.on_hold || String(t.blocker || "").trim()) { mood = "concerned"; advice = "عليها عائق — الأفضل يتحدد مين مسؤول عن حله وموعده."; }
  if (advice) lines.push(`\n💡 ${advice}`);
  return { mood, text: lines.join("\n") };
}
