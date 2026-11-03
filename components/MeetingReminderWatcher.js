"use client";

// يرسل تذكيرات الاجتماعات المستحقة أثناء فتح النظام (مكمّل للمهمة المجدولة على الخادم).
// منع التكرار: الحجز الذرّي claim_meeting_reminder في قاعدة البيانات (سحابياً).
import { useEffect, useRef } from "react";
import { useRole } from "@/components/RoleProvider";
import { useNotifications } from "@/components/NotificationsProvider";
import { meetingsStore } from "@/lib/store";
import { supabase, isCloud } from "@/lib/supabase";
import { DEFAULT_MEETING_MAIL, dueReminder } from "@/lib/meetingMail.mjs";

const TICK = 60_000;

async function claim(m, d) {
  if (isCloud) {
    const { data, error } = await supabase.rpc("claim_meeting_reminder", { p_id: m.id, p_offset: d.offset, p_skip: d.skip });
    return !error && data === true; // قبل ترقية قاعدة البيانات: لا إرسال (المهمة المجدولة تتولاه)
  }
  const sent = Array.isArray(m.reminders_sent) ? m.reminders_sent : [];
  if (sent.map(Number).includes(d.offset)) return false;
  await meetingsStore.update(m.id, { reminders_sent: [...new Set([...sent, d.offset, ...d.skip])] }, { action: "update", entity: "" });
  return true;
}

export default function MeetingReminderWatcher() {
  const { viewer, can } = useRole();
  const { notifyPrefs, sendMeetingMail } = useNotifications();
  const ref = useRef({});
  ref.current = { notifyPrefs, sendMeetingMail };
  const allowed = Boolean(viewer) && can("meetings", "edit");

  useEffect(() => {
    if (!allowed) return;
    let running = false;
    async function tick() {
      const { notifyPrefs: p, sendMeetingMail: send } = ref.current;
      const mm = { ...DEFAULT_MEETING_MAIL, ...(p?.meetingMail || {}) };
      if (running || !p?.emailEnabled || !mm.reminders) return;
      running = true;
      try {
        const list = await meetingsStore.list().catch(() => []);
        for (const m of list) {
          const d = dueReminder(m, Date.now(), mm);
          if (!d) continue;
          if (!(await claim(m, d))) continue;
          await send("reminder", m, { offset: d.offset });
        }
      } finally {
        running = false;
      }
    }
    const first = setTimeout(tick, 8000);
    const iv = setInterval(tick, TICK);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [allowed]);

  return null;
}
