// أدوات المحادثات: القنوات، قفل شات المهمة بعد انتهائها، والإشارات (@)

import { isDone } from "./constants";

// القنوات: الشات العام، شات كل مشروع، وشات متابعة كل مهمة
export const GENERAL = "general";
export const projectChannel = (id) => `project:${id}`;
export const taskChannel = (id) => `task:${id}`;
export function parseChannel(ch) {
  const s = String(ch || "");
  if (s === GENERAL) return { kind: "general" };
  const i = s.indexOf(":");
  const kind = s.slice(0, i);
  return kind === "project" || kind === "task" ? { kind, id: s.slice(i + 1) } : { kind: "" };
}

// شات المهمة ينقفل بعد 24 ساعة من اعتمادها/اكتمالها، وينفتح تلقائياً لو رجعت للتعديل
export const CHAT_CLOSE_HOURS = 24;
const HOUR = 3600000;
export function taskChatState(t, now = Date.now()) {
  if (!t || !isDone(t)) return { closed: false, closesAt: null };
  const ended = new Date(t.completed_at || t.reviewed_at || 0).getTime();
  // مهمة منتهية قديماً بلا تاريخ انتهاء محفوظ: تُعامل كمقفلة
  if (!ended) return { closed: true, closesAt: null };
  const closesAt = ended + CHAT_CLOSE_HOURS * HOUR;
  return { closed: now >= closesAt, closesAt };
}
export function hoursLeft(closesAt, now = Date.now()) {
  return Math.max(1, Math.ceil((closesAt - now) / HOUR));
}

// المستخدمون المشار إليهم في نص الرسالة بصيغة «@الاسم» (الأطول أولاً حتى لا يلتبس «أمل» مع «أمل محمد»)
export function findMentions(body, users) {
  let text = String(body || "");
  const out = [];
  const list = (users || []).filter((u) => u?.name && u.status !== "suspended").sort((a, b) => b.name.length - a.name.length);
  for (const u of list) {
    const tag = `@${u.name}`;
    if (text.includes(tag)) {
      out.push(u);
      text = text.split(tag).join(" ");
    }
  }
  return out;
}

// تقسيم النص لأجزاء عادية وإشارات لعرضها مميّزة
export function splitMentions(body, names) {
  const text = String(body || "");
  const tags = (names || []).filter(Boolean).sort((a, b) => b.length - a.length).map((n) => `@${n}`);
  if (!tags.length || !text.includes("@")) return [{ text }];
  const parts = [];
  let i = 0, buf = "";
  while (i < text.length) {
    const tag = text[i] === "@" ? tags.find((t) => text.startsWith(t, i)) : null;
    if (tag) {
      if (buf) parts.push({ text: buf });
      parts.push({ text: tag, mention: true });
      buf = "";
      i += tag.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  if (buf) parts.push({ text: buf });
  return parts;
}
