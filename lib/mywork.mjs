// منطق «المطلوب مني» وقواعد القرار — دوال نقية بلا اعتماديات (قابلة للاختبار بـ node --test).
// الأشخاص في النظام يُحفظون بالاسم (assigned_to / ready_by / holder / خطوات السلسلة)،
// لذا تتم المطابقة بالاسم بعد توحيد الكتابة.

export function normName(s) {
  return String(s || "")
    .replace(/\([^)]*\)?/g, " ") // ما بين الأقواس: «Ohood (IT)» = «Ohood»
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ْـ]/g, "") // التشكيل والتطويل
    .replace(/\s+/g, " ")
    .trim();
}

export const sameName = (a, b) => {
  const x = normName(a);
  return Boolean(x) && x === normName(b);
};

// جسر أسماء جاهز: المهام المستوردة تستخدم أسماء لاتينية بينما المستخدمون بالعربية
// (يُضاف إليه ما يحدده مدير الفريق في حقل «أسماء بديلة» لكل مستخدم)
export const NAME_ALIASES = {
  "عهود": ["ohood"],
  "لجين": ["lujain"],
  "وجد": ["wajd"],
  "أمل": ["amal"],
  "مبارك": ["mubarak", "mubrak"],
  "رائد": ["raed"],
  "أحمد": ["ahmad"],
  "عاصم": ["asem"],
  "سامي الشبيلي": ["sami"],
  "فاطمة": ["fatimah"],
};

// هل الاسم يعود لهذا الشخص؟ who = اسم أو مستخدم { name, aliases[] }
// الأسماء البديلة تربط البيانات القديمة (مثل «Ohood (IT)») بالمستخدم «عهود»
export function isMe(name, who) {
  if (!who) return false;
  if (typeof who === "string") return sameName(name, who);
  const aliases = [...(Array.isArray(who.aliases) ? who.aliases : []), ...(NAME_ALIASES[who.name] || [])];
  return sameName(name, who.name) || aliases.some((a) => sameName(name, a));
}

const DONE = ["Approved", "Completed"];
export const isDoneTask = (t) => DONE.includes(t?.status);

const dayStart = (d) => {
  const x = new Date(d);
  return isNaN(x) ? NaN : new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};

// عمل الشخص نفسه: هو المسؤول عن المهمة أو من سلّمها للمراجعة
export const isOwnWork = (t, who) => isMe(t?.assigned_to, who) || isMe(t?.ready_by, who);

// اتخاذ قرار الاعتماد/طلب التعديل: يتطلب صلاحية الاعتماد،
// ولا يُسمح باعتماد العمل الذاتي إلا بصلاحية صريحة (selfApprove).
export function decisionBlock(t, viewer, abilities = {}) {
  if (!abilities.approve) return "لا تملك صلاحية الاعتماد وطلب التعديل.";
  if (!abilities.selfApprove && isOwnWork(t, viewer)) {
    return "لا يمكنك اعتماد عملك أو طلب تعديله بنفسك — يتخذ القرار شخص آخر لديه صلاحية الاعتماد.";
  }
  return null;
}
export const canDecide = (t, viewer, abilities) => decisionBlock(t, viewer, abilities) === null;

// خطوة سلسلة الاعتماد: صاحب الخطوة لا يعتمد خطوة مهمة هو منفذها إلا بصلاحية صريحة
export function stepBlock(t, step, viewer, abilities = {}, isManager = false) {
  if (!step) return "لا توجد خطوة نشطة.";
  if (!isManager && !isMe(step.person, viewer)) return "هذه الخطوة ليست دورك.";
  if (step.type === "approve" && !abilities.selfApprove && isOwnWork(t, viewer)) {
    return "لا يمكنك اعتماد خطوة على مهمة أنت منفذها.";
  }
  return null;
}

// الانتقالات المسموح بها مباشرة عند سحب البطاقة في لوحة المهام.
// ما عداها يمر عبر نوافذ القرار (تسليم/اعتماد/طلب تعديل) أو يُمنع.
export function dragRule(t, toStatus, { canDeliver, decideBlock, isManager }) {
  const from = t.status;
  if (from === toStatus) return { kind: "none" };
  if (toStatus === "Pending Review") {
    if (!canDeliver) return { kind: "deny", msg: "لا تملك صلاحية إرسال التسليمات للمراجعة." };
    if (isDoneTask(t)) return { kind: "deny", msg: "المهمة معتمدة — أعد فتحها أولاً." };
    return { kind: "dialog", mode: "submit" };
  }
  if (toStatus === "Approved" || toStatus === "Revision Needed") {
    if (from !== "Pending Review") return { kind: "deny", msg: "يجب أن تكون المهمة «بانتظار المراجعة» أولاً." };
    if (decideBlock) return { kind: "deny", msg: decideBlock };
    return { kind: "dialog", mode: toStatus === "Approved" ? "approve" : "revision" };
  }
  // إلى «لم تبدأ» أو «قيد التنفيذ»
  if (isDoneTask(t)) {
    return isManager ? { kind: "reopen" } : { kind: "deny", msg: "إعادة فتح مهمة معتمدة من صلاحية المدير فقط." };
  }
  if (from === "Pending Review") return { kind: "withdraw" }; // سحب التسليم قبل القرار — يُسجَّل
  if (from === "Revision Needed" && toStatus === "Not Started") return { kind: "deny", msg: "المهمة مطلوب تعديلها — انقلها إلى «قيد التنفيذ»." };
  return { kind: "direct" };
}

// تصنيف مهام المستخدم: كل مهمة في أهم قسم ينطبق عليها
// opts.currentStepOf(t) → خطوة السلسلة الحالية {person,type} أو null
export function myBuckets(tasks, viewer, abilities = {}, opts = {}) {
  const me = viewer;
  const now = opts.now || new Date();
  const today = dayStart(now);
  const out = { returned: [], decide: [], myStep: [], overdue: [], today: [], upcoming: [], waiting: [], done: [] };
  if (!me?.name) return out;
  for (const t of tasks || []) {
    const mine = isMe(t.assigned_to, me);
    const step = opts.currentStepOf ? opts.currentStepOf(t) : null;
    const done = isDoneTask(t);
    const due = t.due_date ? dayStart(t.due_date) : NaN;
    if (mine && t.status === "Revision Needed") out.returned.push(t);
    else if (t.status === "Pending Review" && canDecide(t, viewer, abilities)) out.decide.push(t);
    else if (!done && step && isMe(step.person, me) && !(step.type === "approve" && isOwnWork(t, me) && !abilities.selfApprove)) out.myStep.push(t);
    else if (mine && !done && t.status !== "Pending Review" && due < today) out.overdue.push(t);
    else if (mine && !done && t.status !== "Pending Review" && due === today) out.today.push(t);
    else if (mine && !done && t.status !== "Pending Review") out.upcoming.push(t);
    else if (isOwnWork(t, me) && t.status === "Pending Review") out.waiting.push(t);
    else if (mine && done) out.done.push(t);
  }
  const byDue = (a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999"));
  Object.values(out).forEach((l) => l.sort(byDue));
  out.decide.sort((a, b) => String(a.ready_at || "").localeCompare(String(b.ready_at || "")));
  out.done.sort((a, b) => String(b.completed_at || b.reviewed_at || "").localeCompare(String(a.completed_at || a.reviewed_at || "")));
  return out;
}

// المطلوب من المستخدم في مهمة معيّنة (نص قصير للعرض)
export const BUCKET_ACTION = {
  returned: "تعديل ثم إعادة التسليم",
  decide: "اعتماد أو طلب تعديل",
  myStep: "إجراء خطوتك في سلسلة الاعتماد",
  overdue: "التنفيذ (متأخرة)",
  today: "التنفيذ (مستحقة اليوم)",
  upcoming: "التنفيذ والتسليم",
  waiting: "لا شيء — بانتظار قرار المراجِع",
  done: "",
};
