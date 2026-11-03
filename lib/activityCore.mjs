// منطق سجل الأنشطة — دوال نقية (قابلة للاختبار بـ node --test)
// • diffRecords: ما الذي تغيّر في السجل (من ← إلى) لكل حقل
// • sessionEnd / clipDuration / summarizeDay: حسابات الدخول والخروج ومدة الاستخدام

// أسماء الحقول بالعربية (ما لا يوجد هنا يظهر باسمه الأصلي)
export const FIELD_AR = {
  task: "المهمة", activity: "النشاط", project: "المشروع", priority: "الأولوية", status: "الحالة",
  assigned_to: "المسؤول", due_date: "الاستحقاق", waiting_on: "بانتظار", blocker: "العائق",
  approval_status: "الاعتماد", notes: "الملاحظات", health: "الصحة", holder: "لدى", handoffs: "سير العمل",
  links: "الروابط", chain: "سلسلة التسليم", deliverable: "المخرج", ready_by: "جاهز بواسطة", reviews: "المراجعات",
  title: "العنوان", start_at: "الموعد", duration: "المدة", location: "المكان", attendees: "الحضور",
  agenda: "جدول الأعمال", minutes: "المحضر", action_items: "القرارات", organizer: "المنظّم",
  name: "الاسم", description: "الوصف", managers: "المدراء", clients: "العملاء", members: "الأعضاء",
  color: "اللون", logo: "الشعار", role: "الدور", email: "البريد", department: "القسم", reports_to: "المدير المباشر",
  current: "القيمة الحالية", target: "المستهدف", unit: "الوحدة", category: "التصنيف",
  amount: "المبلغ", number: "الرقم", note: "ملاحظة", url: "الرابط", start_date: "تاريخ الانضمام",
};

// حقول تقنية لا تُعرض في تفاصيل التعديل
export const IGNORED_FIELDS = new Set([
  "id", "created_at", "updated_at", "order_index", "data_url", "email_error", "notify_log", "reminders_sent",
]);

const same = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

/**
 * يحوّل قيمة إلى نص قصير مقروء.
 * valueLabel(field, value) اختياري: لترجمة القيم (مثل الحالة In Progress ← قيد التنفيذ)
 */
export function showValue(field, v, valueLabel) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    if (v.every((x) => typeof x !== "object" || x === null)) return v.join("، ");
    return `${v.length} عنصر`;
  }
  if (typeof v === "object") return "…";
  const mapped = valueLabel ? valueLabel(field, v) : v;
  const s = String(mapped ?? v);
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
}

/**
 * الفروقات بين السجل قبل التعديل والتعديل المطبَّق.
 * يُرجع [{ field, label, from, to }] — فارغة إن لم يتغيّر شيء ذو معنى.
 */
export function diffRecords(prev, patch, valueLabel) {
  const out = [];
  if (!patch || typeof patch !== "object") return out;
  for (const k of Object.keys(patch)) {
    if (IGNORED_FIELDS.has(k)) continue;
    if (prev && same(prev[k], patch[k])) continue;
    out.push({
      field: k,
      label: FIELD_AR[k] || k,
      from: prev ? showValue(k, prev[k], valueLabel) : "—",
      to: showValue(k, patch[k], valueLabel),
    });
  }
  return out.slice(0, 25);
}

// ---------------- الجلسات ----------------
export const IDLE_END_MS = 5 * 60_000; // جلسة بلا نبض أكثر من 5 دقائق = انتهت

// نهاية الجلسة الفعلية: خروج صريح، أو آخر نبض إن انقطعت، أو «الآن» إن كانت نشطة
export function sessionEnd(s, now = Date.now()) {
  if (s.ended_at) return { at: s.ended_at, explicit: true, active: false };
  const last = new Date(s.last_seen_at || s.started_at).getTime();
  if (now - last < IDLE_END_MS) return { at: new Date(now).toISOString(), explicit: false, active: true };
  return { at: new Date(last).toISOString(), explicit: false, active: false };
}

// مدة الجلسة داخل نافذة زمنية [from, to)
export function clipDuration(s, from, to, now = Date.now()) {
  const st = Math.max(new Date(s.started_at).getTime(), new Date(from).getTime());
  const en = Math.min(new Date(sessionEnd(s, now).at).getTime(), new Date(to).getTime());
  return Math.max(0, en - st);
}

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * ملخّص لكل موظف ضمن الفترة: أول دخول، آخر خروج، المدة، عدد الجلسات، العمليات، المهام، الأيام
 * acts: [{ actor, action, entity, entity_id, label, created_at }]
 * sessions: [{ user_name, started_at, last_seen_at, ended_at }]
 */
export function summarize(acts, sessions, from, to, now = Date.now()) {
  const map = new Map();
  const get = (name) => {
    if (!map.has(name)) {
      map.set(name, { name, first: null, last: null, dur: 0, sessions: 0, actions: 0, tasks: new Set(), online: false, days: new Set(), lastSeen: null });
    }
    return map.get(name);
  };
  for (const s of sessions || []) {
    const end = sessionEnd(s, now);
    const d = clipDuration(s, from, to, now);
    if (d <= 0 && !end.active) continue;
    const e = get(s.user_name || s.user_email || "—");
    e.sessions += 1;
    e.dur += d;
    if (!e.first || s.started_at < e.first) e.first = s.started_at;
    if (!e.last || end.at > e.last.at) e.last = end;
    if (end.active) e.online = true;
    e.days.add(dayKey(new Date(Math.max(new Date(s.started_at).getTime(), new Date(from).getTime()))));
    const seen = s.last_seen_at || s.started_at;
    if (!e.lastSeen || seen > e.lastSeen) e.lastSeen = seen;
  }
  for (const a of acts || []) {
    const e = get(a.actor || "مستخدم");
    e.actions += 1;
    if ((a.entity === "مهمة" || a.entity === "تسليم") && a.action !== "delete") e.tasks.add(a.entity_id || a.label);
    e.days.add(dayKey(new Date(a.created_at)));
    if (!e.lastSeen || a.created_at > e.lastSeen) e.lastSeen = a.created_at;
  }
  return Array.from(map.values()).sort((a, b) => b.actions + b.dur / 6e5 - (a.actions + a.dur / 6e5));
}

/**
 * أحداث الدخول والخروج المستنتجة من الجلسات (لعرضها في الخط الزمني مع بقية الأنشطة)
 * كل جلسة → «دخول» + («خروج» صريح أو «انتهت الجلسة» عند آخر ظهور)
 */
export function sessionEvents(sessions, from, to, now = Date.now()) {
  const f = new Date(from).toISOString();
  const t = new Date(to).toISOString();
  const out = [];
  for (const s of sessions || []) {
    const who = s.user_name || s.user_email || "—";
    if (s.started_at >= f && s.started_at < t) {
      out.push({ id: `in-${s.id}`, actor: who, action: "login", entity: "جلسة", label: "", created_at: s.started_at, details: { device: s.device || "" } });
    }
    const end = sessionEnd(s, now);
    if (end.active) continue;
    if (end.at >= f && end.at < t) {
      out.push({ id: `out-${s.id}`, actor: who, action: end.explicit ? "logout" : "idle", entity: "جلسة", label: "", created_at: end.at, details: { started: s.started_at } });
    }
  }
  return out;
}
