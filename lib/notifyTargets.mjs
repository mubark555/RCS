// مستلمو إشعارات الجرس — دوال نقية (قابلة للاختبار بـ node --test).
// كل إشعار يُحفظ لكل مستلم على حدة (recipient = معرّف المستخدم)، فلا يرى أحد إشعارات غيره:
// • المهمة: أطرافها (المسؤول، الحائز، المُسلِّم، أصحاب خطوات السلسلة) + مدراؤهم المباشرون صعوداً.
// • الاجتماع: المدعوون + المنظّم.
// • غير ذلك (مشاريع، مستخدمون، مستهدفات، مالية…): المدراء.
// المنفِّذ نفسه لا يُشعَر بما فعله (يكفيه التوست).
import { isMe } from "./mywork.mjs";

const active = (users) => (users || []).filter((u) => u && u.id && u.status !== "suspended");

// أسماء → مستخدمون (مع الأسماء البديلة مثل «Lujain(PM)» = «لجين»)
export function usersByNames(names, users) {
  const list = active(users);
  const out = [];
  for (const n of names || []) {
    if (!String(n || "").trim()) continue;
    const u = list.find((x) => isMe(n, x));
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

// سلسلة المسؤولين المباشرين (reports_to) لكل شخص صعوداً
export function lineManagersOf(people, users) {
  const list = active(users);
  const out = [];
  const seen = new Set(people.map((p) => p.id));
  let level = people;
  while (level.length) {
    const next = [];
    for (const p of level) {
      const boss = String(p.reports_to || "").trim() && list.find((u) => isMe(p.reports_to, u));
      if (boss && !seen.has(boss.id)) { seen.add(boss.id); next.push(boss); out.push(boss); }
    }
    level = next;
  }
  return out;
}

const attendeeNames = (v) => {
  if (Array.isArray(v)) return v;
  const s = String(v || "").trim();
  if (s.startsWith("[")) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a; } catch {} }
  return s ? s.split(/[,،]/) : [];
};

// أسماء أطراف السجل بحسب نوعه
export function partiesOf(entity, rec = {}) {
  if (entity === "مهمة" || entity === "تسليم") {
    const chain = Array.isArray(rec.chain) ? rec.chain.map((st) => st?.person) : [];
    return [rec.assigned_to, rec.holder, rec.ready_by, ...chain];
  }
  if (entity === "اجتماع") return [...attendeeNames(rec.attendees), rec.organizer || rec.created_by];
  return [];
}

const managers = (users) => active(users).filter((u) => u.role === "manager");

// معرّفات المستلمين لحدث بيانات { entity, record }
export function eventRecipients(evt, users, actor) {
  const people = usersByNames(partiesOf(evt.entity, evt.record || {}), users);
  let to;
  if (people.length) {
    to = [...people];
    // مدير الوحدة يتابع مهام من يتبعونه
    if (evt.entity === "مهمة" || evt.entity === "تسليم") to.push(...lineManagersOf(people, users));
  } else {
    to = managers(users); // سجل بلا أطراف معروفة (أو حذف بلا تفاصيل) → المدراء فقط
  }
  return finalize(to, actor);
}

// معرّفات المستلمين لإعلان صريح: أشخاص بالاسم + جمهور ("managers" | "team" | "none")
export function announceRecipients({ people = [], audience = "managers" } = {}, users, actor) {
  const to = usersByNames(people, users);
  if (audience === "managers") to.push(...managers(users));
  if (audience === "team") to.push(...active(users).filter((u) => u.role !== "client"));
  return finalize(to, actor);
}

function finalize(list, actor) {
  const ids = [];
  for (const u of list) if (u?.id && u.id !== actor?.id && !ids.includes(u.id)) ids.push(u.id);
  return ids;
}

// هل يظهر الإشعار لهذا المستخدم؟ الإشعارات القديمة (بلا مستلم) تظهر للمدراء فقط
export function isMine(n, viewer) {
  if (!viewer) return false;
  if (n?.recipient) return n.recipient === viewer.id;
  return viewer.role === "manager";
}
