// الإشعارات: من يُبلَّغ بماذا عند كل إجراء — منطق نقي قابل للاختبار.
import { STAGES, STEPS, stageOf, canActOnStep, myAction, findUserByName, nameMatchesUser } from "./workflow.mjs";
import { ATTENDANCE_TYPES, attendanceOf } from "./attendance.mjs";

export const NOTIFY_KINDS = {
  task_assigned: { ar: "إسناد مهمة جديدة إليّ", def: true },
  review_requested: { ar: "وصول مهمة لمراجعتي", def: true },
  approval_requested: { ar: "طلب موافقة أو اعتماد مني", def: true },
  changes_requested: { ar: "إعادة مهمتي للتعديل", def: true },
  task_closed: { ar: "اعتماد مهمتي وإغلاقها", def: true },
  meeting_decision: { ar: "تكليف جديد من اجتماع", def: true },
  meeting_invite: { ar: "دعوة لاجتماع إلزامي أو أساسي", def: true },
  meeting_optional: { ar: "دعوة لاجتماع اختياري", def: false },
  due_soon: { ar: "اقتراب موعد استحقاق مهامي", def: true },
  overdue: { ar: "تجاوز موعد استحقاق مهامي", def: true },
};

export function wants(user, kind) {
  const p = user?.notify_prefs && typeof user.notify_prefs === "object" ? user.notify_prefs : {};
  return kind in p ? Boolean(p[kind]) : Boolean(NOTIFY_KINDS[kind]?.def);
}

const taskLink = (t) => `/?task=${encodeURIComponent(t.id)}`;
const assigneeOf = (t, users) => (t.assignee_id ? users.find((u) => u.id === t.assignee_id) : findUserByName(t.assigned_to, users)) || null;

// إشعارات حدث على مهمة. withAccess(u) يُرجع المستخدم مع صلاحياته (لمعرفة من يحق له المراجعة عند عدم تحديد شخص)
export function forTaskEvent({ before, after, actor, users = [], withAccess = (u) => u }) {
  if (!after) return [];
  const out = [];
  const push = (user, kind, title, body = "") => {
    if (!user || user.id === actor?.id || !wants(user, kind)) return;
    if (out.some((n) => n.user_id === user.id && n.kind === kind)) return;
    out.push({ user_id: user.id, kind, title, body, link: taskLink(after), task_id: after.id });
  };

  // إسناد جديد (إنشاء أو تغيير المسؤول)
  const prevAssignee = before ? assigneeOf(before, users) : null;
  const nextAssignee = assigneeOf(after, users);
  if (nextAssignee && nextAssignee.id !== prevAssignee?.id && stageOf(after) !== "closed") {
    if (!before && after.meeting_id) push(nextAssignee, "meeting_decision", `تكليف من اجتماع: ${after.task}`, after.due_date ? `الموعد النهائي ${after.due_date}` : "");
    else push(nextAssignee, "task_assigned", `أُسندت إليك مهمة: ${after.task}`, after.project || "");
  }

  // تغيّر المرحلة
  const from = before ? stageOf(before) : null;
  const to = stageOf(after);
  if (before && from !== to) {
    const step = Object.keys(STEPS).find((k) => STEPS[k].stage === to);
    if (step) {
      const kind = step === "review" ? "review_requested" : "approval_requested";
      const designated = after[STEPS[step].field];
      const recipients = designated
        ? users.filter((u) => u.id === designated)
        : users.filter((u) => u.role !== "client" && canActOnStep(after, withAccess(u), step));
      for (const u of recipients) push(u, kind, `${STAGES[to].ar}: ${after.task}`, after.project || "");
    }
    if (to === "changes_requested") push(nextAssignee, "changes_requested", `مطلوب تعديل: ${after.task}`, after.review_note || "");
    if (to === "closed") push(nextAssignee, "task_closed", `اعتُمدت وأُغلقت: ${after.task}`, "");
  }
  return out;
}

// دعوات الاجتماع: للمدعوين الجدد، ولمن رُفع تصنيفه إلى إلزامي
export function forMeeting({ before, after, actor, users = [] }) {
  if (!after || after.status === "Cancelled") return [];
  const prev = new Set(Array.isArray(before?.attendees) ? before.attendees : []);
  const out = [];
  for (const name of Array.isArray(after.attendees) ? after.attendees : []) {
    const type = attendanceOf(after, name);
    const upgraded = prev.has(name) && type === "mandatory" && attendanceOf(before, name) !== "mandatory";
    if (prev.has(name) && !upgraded) continue;
    const u = users.find((x) => nameMatchesUser(name, x));
    if (!u || u.id === actor?.id) continue;
    const kind = type === "optional" ? "meeting_optional" : "meeting_invite";
    if (!wants(u, kind)) continue;
    const when = after.start_at ? new Date(after.start_at).toLocaleString("ar-SA-u-ca-gregory", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    out.push({
      user_id: u.id, kind, meeting_id: after.id, link: `/meetings?m=${encodeURIComponent(after.id)}`,
      title: `دعوة اجتماع (${ATTENDANCE_TYPES[type].ar}): ${after.title}`,
      body: [when, type === "mandatory" ? "حضورك مطلوب" : ATTENDANCE_TYPES[type].desc].filter(Boolean).join(" · "),
    });
  }
  return out;
}

// تنبيهات المواعيد تُحسب عند العرض (لا تُخزَّن): مهام المطلوب منه تنفيذها
export function dueAlerts(tasks, user, now = new Date()) {
  const out = [];
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = day(now);
  for (const t of tasks || []) {
    if (!t.due_date) continue;
    const a = myAction(t, user);
    if (!a || !["execute", "fix"].includes(a.kind)) continue;
    const due = day(new Date(t.due_date));
    if (isNaN(due)) continue;
    const kind = due < today ? "overdue" : due - today <= 86400000 ? "due_soon" : null;
    if (!kind || !wants(user, kind)) continue;
    out.push({
      id: `due-${t.id}`, derived: true, kind, link: taskLink(t), task_id: t.id,
      title: kind === "overdue" ? `متأخرة: ${t.task}` : `${due === today ? "مستحقة اليوم" : "مستحقة غداً"}: ${t.task}`,
      body: t.project || "",
    });
  }
  return out;
}
