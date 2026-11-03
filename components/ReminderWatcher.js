"use client";

// مراقب التذكيرات: يعمل بالخلفية أثناء فتح النظام ويرسل تذكيرات الاجتماعات المستحقة.
// (يُكمل المهمة المجدولة على الخادم؛ ومنع التكرار مضمون على الخادم في الوضع السحابي)
import { useEffect, useRef } from "react";
import { meetingsStore, isCloud } from "@/lib/store";
import { computeDueReminder } from "@/lib/notify-core";
import { getEmailStatus, sendMeetingNotification, notifyPrefsOf, eventEnabled } from "@/lib/notifications";
import { useSettings } from "@/components/SettingsProvider";
import { useRole } from "@/components/RoleProvider";
import { toast } from "@/components/Toaster";

const TICK = 60_000;

export default function ReminderWatcher() {
  const { settings } = useSettings();
  const { users, readOnly } = useRole();
  const ref = useRef({ settings, users });
  ref.current = { settings, users };

  useEffect(() => {
    if (readOnly) return; // العملاء لا يرسلون إشعارات
    let stop = false;
    let running = false;

    async function tick() {
      if (stop || running) return;
      const { settings, users } = ref.current;
      if (!eventEnabled(notifyPrefsOf(settings), "reminder")) return;
      running = true;
      try {
        const st = await getEmailStatus();
        if (!st.configured) return;
        const list = await meetingsStore.list();
        for (const m of list) {
          const due = computeDueReminder(m);
          if (!due) continue;
          // قفل محلي بسيط يمنع تبويبات المتصفح المتعددة من الإرسال معاً
          const lock = `sp_rem_lock_${m.id}_${due.offset}`;
          try {
            const t = Number(window.localStorage.getItem(lock) || 0);
            if (Date.now() - t < 5 * 60_000) continue;
            window.localStorage.setItem(lock, String(Date.now()));
          } catch {}
          const res = await sendMeetingNotification("reminder", m, { users, settings });
          if (res?.sent?.length) toast(`⏰ أُرسل تذكير «${m.title}» إلى ${res.sent.length} مستلم`, "success");
          if (!isCloud && res?.sent?.length) window.dispatchEvent(new Event("sp-meetings-changed"));
        }
      } catch {
      } finally {
        running = false;
      }
    }

    const first = setTimeout(tick, 4000);
    const iv = setInterval(tick, TICK);
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearTimeout(first); clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [readOnly]);

  return null;
}
