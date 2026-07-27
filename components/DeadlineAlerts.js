"use client";

// مراقب الاستحقاقات: يفحص المهام والاجتماعات والفواتير دورياً ويولّد
// تنبيهات (توست + مركز الإشعارات) للبنود القريبة أو المتأخرة، مع منع التكرار.
import { useEffect, useRef } from "react";
import { tasksStore, meetingsStore, invoicesStore, paymentsStore, notificationsStore } from "@/lib/store";
import { useNotifications } from "@/components/NotificationsProvider";
import { useRole } from "@/components/RoleProvider";
import { invoiceState } from "@/lib/constants";

const DAY = 86400000;
const ALERTED_KEY = "sp_alerted_v1";

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function readAlerted() {
  try { return JSON.parse(window.localStorage.getItem(ALERTED_KEY) || "{}"); } catch { return {}; }
}
function writeAlerted(obj) {
  try { window.localStorage.setItem(ALERTED_KEY, JSON.stringify(obj)); } catch {}
}

export default function DeadlineAlerts() {
  const { pushToast, reload: reloadNotifs } = useNotifications();
  const { role, canFinance, scopeProjects, ready } = useRole();
  const ran = useRef(false);

  useEffect(() => {
    // العملاء لا يتلقّون تنبيهات تشغيلية؛ ننتظر جهوزية الأدوار
    if (!ready || role === "client") return;

    let cancelled = false;

    async function scan() {
      const alerted = readAlerted();
      const today = startOfDay(new Date());
      const now = Date.now();
      const fresh = [];

      const push = (key, tone, message) => {
        if (alerted[key]) return;
        alerted[key] = now;
        fresh.push({ tone, message });
      };
      const inScope = (proj) => !scopeProjects || scopeProjects.includes(proj);

      // ---- المهام ----
      try {
        const tasks = await tasksStore.list();
        (tasks || []).filter((t) => t.status !== "Completed" && t.due_date && inScope(t.project)).forEach((t) => {
          const due = startOfDay(new Date(t.due_date));
          if (isNaN(due)) return;
          if (due < today) push(`task:${t.id}:overdue`, "danger", `مهمة متأخرة: ${t.task}`);
          else if (due <= today + 3 * DAY) push(`task:${t.id}:soon`, "info", `مهمة قريبة الاستحقاق: ${t.task}`);
        });
      } catch {}

      // ---- الاجتماعات (خلال 24 ساعة) ----
      try {
        const meetings = await meetingsStore.list();
        (meetings || []).filter((m) => m.status !== "Cancelled" && m.start_at && inScope(m.project)).forEach((m) => {
          const start = new Date(m.start_at).getTime();
          if (isNaN(start)) return;
          if (start >= now && start <= now + DAY) {
            const d = new Date(m.start_at);
            const time = d.toLocaleString("ar-SA", { hour: "2-digit", minute: "2-digit" });
            push(`meeting:${m.id}:soon`, "info", `اجتماع قريب: ${m.title} — ${time}`);
          }
        });
      } catch {}

      // ---- الفواتير (لأصحاب صلاحية المالية فقط) ----
      if (canFinance) {
        try {
          const [invoices, payments] = await Promise.all([invoicesStore.list(), paymentsStore.list()]);
          const paidByInv = {};
          (payments || []).forEach((p) => { paidByInv[p.invoice_id] = (paidByInv[p.invoice_id] || 0) + (Number(p.amount) || 0); });
          (invoices || []).forEach((inv) => {
            if (inv.status === "مسودة" || inv.status === "ملغاة") return;
            const st = invoiceState(inv, paidByInv[inv.id] || 0);
            if (st.key === "paid") return;
            const due = inv.due_date ? startOfDay(new Date(inv.due_date)) : NaN;
            if (st.key === "overdue") push(`invoice:${inv.id}:overdue`, "danger", `فاتورة متأخرة السداد: ${inv.number} (${inv.project || "عام"})`);
            else if (!isNaN(due) && due <= today + 5 * DAY) push(`invoice:${inv.id}:soon`, "info", `فاتورة مستحقة قريباً: ${inv.number} (${inv.project || "عام"})`);
          });
        } catch {}
      }

      if (cancelled || !fresh.length) { writeAlerted(alerted); return; }
      writeAlerted(alerted);
      // اعرض التوست + سجّل في مركز الإشعارات
      fresh.slice(0, 8).forEach((f) => pushToast(f.message, f.tone));
      for (const f of fresh) {
        await notificationsStore.create({ kind: "info", entity: "تنبيه", title: f.message, body: "", read: false }).catch(() => {});
      }
      // حدّث مركز الإشعارات (الجرس) ليعكس التنبيهات الجديدة فوراً
      if (reloadNotifs) reloadNotifs().catch(() => {});
    }

    // فحص أولي بعد لحظة من التحميل، ثم كل 30 دقيقة
    const t0 = setTimeout(() => { if (!ran.current) { ran.current = true; scan(); } }, 2500);
    const iv = setInterval(scan, 30 * 60 * 1000);
    return () => { cancelled = true; clearTimeout(t0); clearInterval(iv); };
  }, [ready, role, canFinance, scopeProjects, pushToast, reloadNotifs]);

  return null;
}
