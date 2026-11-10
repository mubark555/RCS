"use client";

import { useEffect, useState } from "react";
import ChatBox from "@/components/ChatBox";
import { taskChannel, taskChatState, hoursLeft, CHAT_CLOSE_HOURS } from "@/lib/chat";

// شات متابعة المهمة: مفتوح حتى تنتهي المهمة، ثم ينقفل بعد 24 ساعة (ويبقى للقراءة)
export default function TaskChat({ task, onCount, tall = false }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!task) return null;
  const st = taskChatState(task, now);
  return (
    <ChatBox
      channel={taskChannel(task.id)}
      label={`شات مهمة «${task.task || ""}»`}
      link={`/chat?c=${encodeURIComponent(taskChannel(task.id))}`}
      onCount={onCount}
      tall={tall}
      closed={st.closed}
      lockNote={`انقفل الشات بعد ${CHAT_CLOSE_HOURS} ساعة من انتهاء المهمة — الرسائل محفوظة للرجوع لها.`}
      notice={st.closesAt && !st.closed ? `المهمة انتهت — الشات ينقفل بعد ${hoursLeft(st.closesAt, now)} ساعة.` : ""}
      emptyText="لا ملاحظات بعد — ابدأ المحادثة حول هذه المهمة."
    />
  );
}
