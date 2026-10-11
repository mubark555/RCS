// محرك سير عمل المهام — منطق نقي بلا اعتماديات، يُستخدم في الواجهة وفي الوضع المحلي.
// نفس القواعد مطبّقة في قاعدة البيانات عبر الدالة public.task_transition
// (supabase/migrations/001_workflow_identity.sql) — أي تعديل هنا يجب أن ينعكس هناك.

// ---------------- المراحل ----------------
export const STAGES = {
  not_started: { ar: "لم تبدأ", color: "#64748b", status: "Not Started" },
  in_progress: { ar: "قيد التنفيذ", color: "#2563eb", status: "In Progress" },
  changes_requested: { ar: "مطلوب تعديل", color: "#d97706", status: "In Progress" },
  in_review: { ar: "بانتظار المراجعة", color: "#7c3aed", status: "In Progress" },
  pending_approval: { ar: "بانتظار الموافقة", color: "#0d9488", status: "In Progress" },
  pending_final: { ar: "بانتظار الاعتماد النهائي", color: "#db2777", status: "In Progress" },
  on_hold: { ar: "متوقفة", color: "#b45309", status: "On Hold" },
  closed: { ar: "مغلقة", color: "#16a34a", status: "Completed" },
};

// خطوات ما بعد التنفيذ
export const STEPS = {
  review: { stage: "in_review", field: "reviewer_id", ar: "المراجعة", who: "المراجع", accept: "قبول المراجعة", submit: "إرسال للمراجعة" },
  approval: { stage: "pending_approval", field: "approver_id", ar: "الموافقة", who: "صاحب الموافقة", accept: "الموافقة", submit: "إرسال للموافقة" },
  final: { stage: "pending_final", field: "final_approver_id", ar: "الاعتماد النهائي", who: "صاحب الاعتماد", accept: "اعتماد نهائي", submit: "إرسال للاعتماد" },
};
const STEP_BY_STAGE = Object.fromEntries(Object.entries(STEPS).map(([k, v]) => [v.stage, k]));

// قوالب سير العمل (افتراضي المشروع، ويمكن تغييره لكل مهمة)
export const WORKFLOWS = {
  simple: { ar: "تنفيذ فقط", steps: [] },
  review: { ar: "تنفيذ ← مراجعة", steps: ["review"] },
  approve: { ar: "تنفيذ ← اعتماد", steps: ["final"] },
  review_approve: { ar: "تنفيذ ← مراجعة ← موافقة", steps: ["review", "approval"] },
  full: { ar: "تنفيذ ← مراجعة ← موافقة ← اعتماد نهائي", steps: ["review", "approval", "final"] },
};
export const DEFAULT_WORKFLOW = "review";

export const ACTION_AR = {
  create: "إنشاء المهمة",
  edit: "تعديل بيانات المهمة",
  delete: "حذف المهمة",
  handoff: "تحويل يدوي",
  start: "بدء التنفيذ",
  submit: "تسليم المخرجات",
  accept: "قبول",
  request_changes: "طلب تعديل",
  hold: "إيقاف المهمة",
  resume: "استئناف",
  reopen: "إعادة فتح",
};

// ---------------- مطابقة الأسماء ----------------
// البيانات القديمة تحفظ المسؤول نصاً حراً مثل "Ohood (IT )" — نطابقها مع اسم المستخدم وأسمائه البديلة.
export function normName(s) {
  return String(s || "")
    .replace(/\([^)]*\)?/g, " ")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^a-zء-ي]+/g, "");
}

export function userNames(user) {
  return [user?.name, ...(Array.isArray(user?.aliases) ? user.aliases : [])].map(normName).filter(Boolean);
}

export function nameMatchesUser(name, user) {
  const n = normName(name);
  return Boolean(n) && userNames(user).includes(n);
}

export function findUserByName(name, users) {
  if (!name) return null;
  return (users || []).find((u) => nameMatchesUser(name, u)) || null;
}

// ---------------- اشتقاق الحالة للمهام القديمة ----------------
export function deriveStage(t) {
  if (t.status === "Completed") return "closed";
  if (t.status === "On Hold") return "on_hold";
  if (t.approval_status === "Pending Review") return "in_review";
  if (t.approval_status === "Revision needed") return "changes_requested";
  if (t.status === "In Progress") return "in_progress";
  return "not_started";
}

export function stageOf(t) {
  return t.stage && STAGES[t.stage] ? t.stage : deriveStage(t);
}

export function workflowOf(t) {
  if (t.workflow && WORKFLOWS[t.workflow]) return t.workflow;
  // المهام القديمة: تبقى بلا مراجعة إلا إذا كانت أصلاً في مسار مراجعة
  return t.approval_status === "Pending Review" || t.approval_status === "Revision needed" ? "review" : "simple";
}

export function stepsOf(t) {
  return WORKFLOWS[workflowOf(t)].steps;
}

// ---------------- الأدوار في المهمة ----------------
// الصلاحيات تأتي من user.access (lib/permissions.mjs) داخل مشروع المهمة.
// بدونها (اختبارات/بيانات قديمة) يُعامل دور manager كصاحب كل الصلاحيات.
function has(user, perm, t) {
  if (!user) return false;
  if (user.access) return user.access.can(perm, t?.project);
  return user.role === "manager";
}

export function isAssignee(t, user) {
  if (!user) return false;
  if (t.assignee_id) return t.assignee_id === user.id;
  return nameMatchesUser(t.assigned_to, user);
}

function hasAssignee(t) {
  return Boolean(t.assignee_id || String(t.assigned_to || "").trim());
}

// من يحق له إجراءات التنفيذ: المسؤول، أو صاحب صلاحية الإسناد إن لم يُحدَّد مسؤول
function canExecute(t, user) {
  return isAssignee(t, user) || (!hasAssignee(t) && has(user, "task.assign", t));
}

// من يحق له قبول/رفض خطوة: الشخص المحدد لها، وإن لم يُحدَّد فصاحب الصلاحية
// (المراجعة/الموافقة: task.review_any — الاعتماد النهائي: task.final_approve).
// المنفذ لا يعتمد عمله بنفسه إلا بصلاحية صريحة (can_self_approve).
export function canActOnStep(t, user, step) {
  if (!user) return false;
  if (isAssignee(t, user) && !user.can_self_approve) return false;
  const designated = t[STEPS[step].field];
  if (designated) return designated === user.id;
  return has(user, step === "final" ? "task.final_approve" : "task.review_any", t);
}

// ---------------- الإجراءات المتاحة ----------------
export function availableActions(t, user) {
  if (!user) return [];
  const stage = stageOf(t);
  const steps = stepsOf(t);
  const out = [];
  const exec = canExecute(t, user);
  const submitLabel = steps.length ? STEPS[steps[0]].submit : "إنهاء المهمة";

  if (["not_started", "in_progress", "changes_requested"].includes(stage)) {
    if (exec && stage === "not_started") out.push({ action: "start", label: "بدء التنفيذ", tone: "" });
    if (exec) out.push({ action: "submit", label: stage === "changes_requested" ? `إعادة ${submitLabel.replace("إرسال", "الإرسال")}` : submitLabel, tone: "primary" });
    if (exec || has(user, "task.assign", t)) out.push({ action: "hold", label: "إيقاف", tone: "ghost", needsNote: true, notePrompt: "سبب التوقف" });
  }
  if (stage === "on_hold" && (exec || has(user, "task.assign", t))) out.push({ action: "resume", label: "استئناف", tone: "primary" });

  const step = STEP_BY_STAGE[stage];
  if (step && canActOnStep(t, user, step)) {
    const last = steps.indexOf(step) === steps.length - 1;
    out.push({ action: "accept", label: STEPS[step].accept + (last ? " وإغلاق" : ""), tone: "primary" });
    out.push({ action: "request_changes", label: "طلب تعديل", tone: "danger", needsNote: true, notePrompt: "ملاحظات التعديل المطلوبة" });
  }
  if (stage === "closed" && has(user, "task.reopen", t)) out.push({ action: "reopen", label: "إعادة فتح", tone: "ghost", needsNote: true, notePrompt: "سبب إعادة الفتح" });
  return out;
}

function nextStage(steps, fromStep) {
  const i = fromStep ? steps.indexOf(fromStep) + 1 : 0;
  return i < steps.length ? STEPS[steps[i]].stage : "closed";
}

// يُرجع { patch, event } أو يرمي خطأ بالعربية
export function applyAction(t, action, user, note = "", now = new Date().toISOString()) {
  note = String(note || "").trim();
  const allowed = availableActions(t, user).find((a) => a.action === action);
  if (!allowed) throw new Error("لا تملك صلاحية تنفيذ هذا الإجراء في المرحلة الحالية للمهمة.");
  if (allowed.needsNote && !note) throw new Error(`يجب كتابة ${allowed.notePrompt}.`);

  const from = stageOf(t);
  const steps = stepsOf(t);
  let to;
  const patch = { workflow: workflowOf(t) };
  switch (action) {
    case "start": to = "in_progress"; break;
    case "submit": to = nextStage(steps, null); patch.submitted_at = now; patch.review_note = ""; break;
    case "accept": to = nextStage(steps, STEP_BY_STAGE[from]); break;
    case "request_changes": to = "changes_requested"; patch.review_note = note; break;
    case "hold": to = "on_hold"; patch.hold_reason = note; break;
    case "resume": to = "in_progress"; patch.hold_reason = ""; break;
    case "reopen": to = "in_progress"; break;
    default: throw new Error("إجراء غير معروف.");
  }
  Object.assign(patch, stagePatch(t, to, steps, now));
  const event = { task_id: t.id, actor_id: user.id, actor_name: user.name, action, from_stage: from, to_stage: to, note };
  return { patch, event };
}

// الحقول القديمة (status/approval_status/health) تُحدَّث لتبقى الصفحات الحالية متسقة
function stagePatch(t, to, steps, now) {
  const p = { stage: to, status: STAGES[to].status };
  if (["in_review", "pending_approval", "pending_final"].includes(to)) p.approval_status = "Pending Review";
  else if (to === "changes_requested") p.approval_status = "Revision needed";
  else if (to === "closed") p.approval_status = steps.length ? "Approved" : t.approval_status || "";
  else p.approval_status = "";
  if (to === "closed") {
    p.completed_at = now;
    p.health = "Completed";
  } else {
    p.completed_at = null;
    if (t.health === "Completed") p.health = "On Track";
  }
  return p;
}

// ---------------- لمن تنتظر المهمة ----------------
export function waitingOn(t, users) {
  const stage = stageOf(t);
  const byId = (id) => (users || []).find((u) => u.id === id);
  const assigneeName = byId(t.assignee_id)?.name || t.assigned_to || "غير محدد";
  if (stage === "closed") return null;
  if (stage === "on_hold") return { who: assigneeName, what: "متوقفة" + (t.hold_reason ? `: ${t.hold_reason}` : "") };
  if (stage === "not_started") return { who: assigneeName, what: "بدء التنفيذ" };
  if (stage === "in_progress") return { who: assigneeName, what: "التنفيذ وتسليم المخرجات" };
  if (stage === "changes_requested") return { who: assigneeName, what: "إجراء التعديلات المطلوبة" };
  const step = STEP_BY_STAGE[stage];
  const designated = byId(t[STEPS[step].field]);
  return { who: designated?.name || "الإدارة", what: STEPS[step].ar };
}

// ---------------- الإجراء المطلوب من مستخدم معيّن ----------------
// kind: fix | execute | review | approval | final | resume
export function myAction(t, user) {
  if (!user) return null;
  const stage = stageOf(t);
  const step = STEP_BY_STAGE[stage];
  if (step) return canActOnStep(t, user, step) ? { kind: step, label: STEPS[step].ar } : null;
  if (!canExecute(t, user)) return null;
  if (stage === "changes_requested") return { kind: "fix", label: "التعديل المطلوب" };
  if (stage === "not_started" || stage === "in_progress") return { kind: "execute", label: "التنفيذ" };
  if (stage === "on_hold") return { kind: "resume", label: "متوقفة — بانتظار الاستئناف" };
  return null;
}

// المهمة سلّمها المستخدم وهي الآن عند غيره
export function isWaitingOnOthers(t, user) {
  return isAssignee(t, user) && Boolean(STEP_BY_STAGE[stageOf(t)]) && !myAction(t, user);
}

// تحويل سحب بطاقة بين أعمدة الحالة (كانبان) إلى إجراء سير عمل
export function actionForStatus(t, user, targetStatus) {
  const acts = availableActions(t, user).map((a) => a.action);
  const stage = stageOf(t);
  const pick = (...names) => names.find((n) => acts.includes(n)) || null;
  if (targetStatus === "In Progress") return stage === "on_hold" ? pick("resume") : stage === "closed" ? pick("reopen") : pick("start");
  if (targetStatus === "Completed") return pick("submit", "accept");
  if (targetStatus === "On Hold") return pick("hold");
  return null;
}
