// «أمل» — المساعدة الذكية داخل النظام (المرحلة الأولى: قواعد بلا ذكاء اصطناعي).
// تفهم نوع السؤال من الكلمات المفتاحية، وتستخرج المشروع/الشخص/الفترة، ثم تجيب
// من بيانات النظام مباشرة وبنفس صلاحيات المستخدم. كل الدوال هنا نقية (بلا واجهة)
// حتى يسهل اختبارها وإضافة الذكاء الاصطناعي فوقها لاحقاً.

import { isDone, isOverdue, taskProgress, STATUS_META, PRIORITY_META, chainHolder, normalizeChain, projManagers } from "./constants";
import { taskStats, projectHealth, upcomingTasks, overdueTasks, daysUntil, relDays, kpiPct, kpiAchievement, invoiceRows, receivables } from "./metrics";
import { MEETING_STATUS, parseAttendees } from "./meetings";
import { LEAVE_TYPES, awayOn, upcomingLeaves, ymd } from "./leaves";
import { timeGreeting } from "./amalLife";
import { explainSection } from "./amalTour";

export const AMAL_NAME = "أمل";

// ================= تطبيع النص العربي =================
export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "") // التشكيل والتطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[؟?!.,،؛:"'«»()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// هل يحتوي النص على أي من الكلمات (بعد التطبيع)
const has = (q, words) => words.some((w) => q.includes(norm(w)));
// كلمة كاملة (لتجنّب «امل» داخل «اكمل» مثلاً)
const hasWord = (q, w) => new RegExp(`(^|\\s|ل|ب|و|ف)${escapeRe(norm(w))}($|\\s)`).test(q);
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ================= أسماء بديلة للمشاريع =================
const PROJECT_ALIASES = {
  Homera: ["هوميرا", "هومرا", "homera"],
  "ZL.Tours": ["zl", "زد ال", "زل تورز", "زد ال تورز", "zl tours", "تورز"],
  "Jaz chocolate": ["جاز", "jaz", "شوكولا", "شوكلت"],
  "eat plus": ["ايت بلس", "eat plus", "eatplus", "ايت"],
  "سيم برايم": ["سيم", "seem", "seem prime"],
  "مزرعة قنيف": ["قنيف", "المزرعه"],
};

export function detectProject(q, projectNames) {
  const names = [...new Set(projectNames || [])];
  // الأطول أولاً حتى لا يطغى اسم قصير على اسم أطول يحتويه
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (q.includes(norm(name))) return name;
  }
  for (const name of sorted) {
    const al = PROJECT_ALIASES[name] || [];
    if (al.some((a) => hasWord(q, a) || q.includes(norm(a) + " ") || q.endsWith(norm(a)))) return name;
  }
  return null;
}

// ================= أسماء الأشخاص بالعربي والإنجليزي =================
// المهام المستوردة من الإكسل تكتب المسؤول بالإنجليزي («Lujain(PM)») والمستخدمون بالعربي
const NAME_ALIASES = {
  "لجين": ["lujain", "lujein", "lujin"],
  "امل": ["amal"],
  "وجد": ["wajd"],
  "عهود": ["ohood", "ohoud", "ahood"],
  "مبارك": ["mubarak", "mubrak", "mobarak"],
  "رائد": ["raed", "raid"],
  "احمد": ["ahmad", "ahmed"],
  "سامي": ["sami"],
  "خالد": ["khaled", "khalid"],
  "عاصم": ["asem", "assem"],
  "ايناس": ["enas", "inas"],
  "فاطمه": ["fatimah", "fatima"],
};
// «Lujain» ← «لجين» (اسم المستخدم بالعربي إن وُجد)
function displayName(raw, users) {
  const n = norm(raw);
  const first = n.split(/\s/)[0];
  for (const [ar, en] of Object.entries(NAME_ALIASES)) {
    if (en.includes(first) || ar === first) {
      const u = (users || []).find((x) => norm(x.name).split(" ")[0] === ar);
      return u ? u.name : ar;
    }
  }
  return raw;
}
function nameVariants(name) {
  const n = norm(name);
  const firstTok = n.split(" ")[0];
  return [...new Set([n, firstTok, ...(NAME_ALIASES[firstTok] || []), ...(NAME_ALIASES[n] || [])])].filter((x) => x.length >= 2);
}
const fieldHasName = (field, variants) => {
  const f = norm(field).replace(/[()\-_/]/g, " ");
  return variants.some((v) => new RegExp(`(^|[^a-z\u0600-\u06FF])${escapeRe(v)}($|[^a-z\u0600-\u06FF])`).test(f));
};

// يستبعد مناداة المساعدة («يا أمل») حتى لا تُفهم كاسم الموظفة أمل
function stripVocative(q) {
  return q.replace(/^(يا\s*)?امل(\s|$)/, "").replace(/\sيا\s*امل(\s|$)/, " ").trim();
}

export function detectPerson(q, users, viewer) {
  const named = detectNamed(q, users);
  if (named) return named;
  // «علي» قد تكون «على» بعد التطبيع، فنقبلها فقط في صيغ مثل «وش علي»
  if (viewer && (/(^|\s)(عندي|مهامي|لي|حقتي|حقي|انا|اسوي|مسؤوليتي)($|\s)/.test(q) || /(وش|ايش|اللي|شنو)\s+علي($|\s)/.test(q))) return viewer.name;
  return null;
}

function detectNamed(q, users) {
  const list = [...(users || [])].sort((a, b) => (b.name || "").length - (a.name || "").length);
  for (const u of list) {
    if (!u?.name) continue;
    const n = norm(u.name);
    if (n.length < 2) continue;
    if (hasWord(q, n) || q.includes(n + " ")) return u.name;
    // الاسم الأول فقط («خالد» من «خالد المطيري»)
    const first = n.split(" ")[0];
    if (first.length >= 3 && first !== n && hasWord(q, first)) return u.name;
  }
  // أشخاص يظهرون في المهام دون سجل مستخدم، أو مكتوبون بالإنجليزي
  for (const [ar, en] of Object.entries(NAME_ALIASES)) {
    if (hasWord(q, ar) || en.some((e) => hasWord(q, e))) {
      const u = list.find((x) => norm(x.name).split(" ")[0] === ar);
      return u ? u.name : ar;
    }
  }
  return null;
}

// ================= التواريخ =================
const WEEKDAYS = [
  ["الاحد", "احد"], ["الاثنين", "اثنين", "الاتنين"], ["الثلاثاء", "ثلاثاء", "الثلاثا"], ["الاربعاء", "اربعاء", "الاربعا"],
  ["الخميس", "خميس"], ["الجمعه", "جمعه"], ["السبت", "سبت"],
];

// يستخرج تاريخ استحقاق من نص الطلب ← "YYYY-MM-DD" أو null
export function parseDue(q, now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const add = (n) => ymd(new Date(base.getTime() + n * 86400000));
  let m = q.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = q.match(/(^|\s)(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?($|\s)/);
  if (m) {
    let y = m[5] ? Number(m[5].length === 2 ? "20" + m[5] : m[5]) : base.getFullYear();
    const d = new Date(y, Number(m[3]) - 1, Number(m[2]));
    if (!m[5] && d < base) d.setFullYear(y + 1);
    if (!isNaN(d)) return ymd(d);
  }
  if (/بعد\s*بكره|بعد\s*غد/.test(q)) return add(2);
  if (/(^|\s)(بكره|بكرا|غدا|غدوه|الغد)($|\s)/.test(q)) return add(1);
  if (/(^|\s)اليوم($|\s)(?!الوطني|التاسيس|العالمي)/.test(q)) return add(0);
  m = q.match(/بعد\s*(\d+)\s*(يوم|ايام)/);
  if (m) return add(Number(m[1]));
  if (/بعد\s*(اسبوع|اسبوعين)/.test(q)) return add(q.includes("اسبوعين") ? 14 : 7);
  for (let i = 0; i < 7; i++) {
    if (WEEKDAYS[i].some((w) => hasWord(q, w))) {
      let diff = (i - base.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      return add(diff);
    }
  }
  return null;
}

// الفترة الزمنية للسؤال (لأسئلة «المستحق»)
function detectRange(q) {
  if (/(^|\s)(اليوم)($|\s)/.test(q)) return { days: 0, label: "اليوم" };
  if (/(^|\s)(بكره|بكرا|غدا)($|\s)/.test(q)) return { days: 1, only: 1, label: "بكرة" };
  if (has(q, ["الشهر", "شهر"])) return { days: 30, label: "خلال الشهر" };
  if (has(q, ["اسبوعين"])) return { days: 14, label: "خلال أسبوعين" };
  return { days: 7, label: "خلال الأسبوع" };
}

// ================= تنسيق =================
const fmtDate = (d) => {
  if (!d) return "";
  const x = new Date(d);
  return isNaN(x) ? "" : x.toLocaleDateString("ar-SA", { weekday: "short", day: "numeric", month: "short" });
};
const fmtDateTime = (d) => {
  if (!d) return "";
  const x = new Date(d);
  return isNaN(x) ? "" : x.toLocaleString("ar-SA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const money = (n) => `${Math.round(Number(n) || 0).toLocaleString("ar-SA")} ريال`;
const plural = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`);
const tasksWord = (n) => plural(n, "مهمة واحدة", "مهمتين", "مهام", "مهمة");

const holderOf = (t) => chainHolder(normalizeChain(t.chain)) || t.holder || t.waiting_on || t.assigned_to || "";
const involves = (t, name) => {
  const v = nameVariants(name);
  return [t.assigned_to, t.holder, t.waiting_on].some((x) => x && fieldHasName(x, v)) ||
    normalizeChain(t.chain).some((s) => fieldHasName(s.person, v));
};

export function taskItem(t) {
  const st = STATUS_META[t.status] || { ar: t.status, color: "#94a3b8" };
  const d = daysUntil(t.due_date);
  const late = isOverdue(t);
  return {
    kind: "task",
    id: t.id,
    title: String(t.task || "").trim() || "(مهمة بلا عنوان)",
    sub: [t.project, holderOf(t) && `عند: ${holderOf(t)}`, t.due_date && (isDone(t) ? fmtDate(t.due_date) : relDays(d))].filter(Boolean).join(" · "),
    badge: late ? { text: "متأخرة", color: "#dc2626" } : { text: st.ar, color: st.color },
    href: `/tasks?q=${encodeURIComponent(String(t.task || "").slice(0, 60))}`,
  };
}

function listReply(text, tasks, { limit = 8, more } = {}) {
  const items = tasks.slice(0, limit).map(taskItem);
  const rest = tasks.length - items.length;
  return { text, items, footer: rest > 0 ? (more || `و${tasksWord(rest)} أخرى في صفحة المهام.`) : "" };
}

// ================= الأسئلة المقترحة =================
export function suggestions(ctx) {
  const s = [];
  const { can, viewer, role } = ctx;
  if (can("tasks")) {
    s.push("ملخّص اليوم");
    if (role !== "client") s.push("وش المهام اللي عندي؟");
    s.push("المهام المتأخرة");
    s.push("وش المستحق هالأسبوع؟");
  }
  if (can("projects")) s.push("وضع المشاريع");
  if (can("tasks")) s.push("وش ينتظر الاعتماد؟");
  if (can("meetings")) s.push("الاجتماعات الجاية");
  if (can("leaves")) s.push("مين غايب اليوم؟");
  if (can("kpis")) s.push("المستهدفات المتأخرة");
  if (can("finance")) s.push("الفواتير غير المسددة");
  if (can("tasks", "edit") && viewer) s.push("أنشئ مهمة");
  s.splice(1, 0, "سوي لي جولة على النظام");
  return s;
}

// ================= المحرّك =================
// ctx: { viewer, role, can, tasks, projects, users, meetings, kpis, leaves, invoices, payments }
// يرجع: { text, items?, footer?, chips?, action? }
export function answer(raw, ctx) {
  const q0 = norm(raw);
  const q = stripVocative(q0);
  const { viewer, role, can } = ctx;
  const tasks = ctx.tasks || [];
  const projectNames = (ctx.projects || []).map((p) => p.name);
  const project = detectProject(q, projectNames.length ? projectNames : [...new Set(tasks.map((t) => t.project).filter(Boolean))]);
  const person = role === "client" ? null : detectPerson(q, ctx.users, viewer);
  const scoped = tasks.filter((t) => (!project || t.project === project));
  const first = role === "client" ? "" : (viewer?.name || "").split(" ")[0];

  if (!q) return greet(ctx, first);

  // ---------- تحية / مساعدة ----------
  if (/^(مرحبا|هلا|اهلا|السلام|سلام|هاي|صباح|مساء|hi|hello)/.test(q) && q.split(" ").length <= 4 && !has(q, ["ملخص"])) return greet(ctx, first);
  if (has(q, ["وش تقدرين", "ايش تقدرين", "وش تسوين", "مساعده", "ساعديني", "help", "كيف استخدم", "وش تعرفين"])) return help(ctx);
  if (has(q, ["شكرا", "يعطيك العافيه", "مشكوره", "تسلمين", "الله يعافيك"])) return { text: `العفو${first ? ` يا ${first}` : ""} 🌷 أنا هنا متى ما احتجتني.` };
  if (has(q, ["من انت", "مين انت", "وش اسمك", "عرفي بنفسك"])) return { text: `أنا ${AMAL_NAME}، مساعدتك داخل النظام. أقرأ المهام والمشاريع والاجتماعات والمستهدفات وأجاوبك عنها بحسب صلاحياتك، وأقدر أنشئ لك مهام.`, chips: suggestions(ctx).slice(0, 4) };

  // ---------- الجولة التعريفية والإرشاد ----------
  if (has(q, ["جوله", "تعريفيه", "عرفيني على النظام", "علميني النظام", "علميني", "كيف استخدم النظام", "انا جديد", "موظف جديد", "ورني النظام", "فرجيني"])) {
    return { mood: "happy", text: "أبشر! بمشي معك على أجزاء النظام وحدة وحدة 🚶‍♀️", action: { type: "tour" } };
  }
  if (has(q, ["اشرحي الصفحه", "اشرحي هالصفحه", "اشرح الصفحه", "وش هالصفحه", "وش هذي الصفحه", "اشرحي لي هنا", "وش الصفحه"])) {
    return { mood: "talk", text: "خلني أوريك أجزاء هالصفحة 👇", action: { type: "pageTour" } };
  }
  if (/(وش|ايش|شنو|اشرحي|اشرح|كيف استخدم|وش فايده|ايش فايده|وش يعني)\s/.test(q + " ") && has(q, ["قسم", "صفحه", "فايده", "اشرح", "استخدم", "يعني"])) {
    const ex = explainSection(q, can);
    if (ex) return ex;
  }

  // ---------- إنشاء مهمة ----------
  if (/(^|\s)(انشي|انشئ|انشاء|سوي|سو|اضف|ضيف|اضافه|ابي|ابغى|ابغي|سجلي|سجل|افتحي|افتح)\s*(لي\s*)?(مهمه|تاسك|task)/.test(q) || /^(مهمه جديده|مهمه)\s*[:：-]/.test(q)) {
    if (!can("tasks", "edit")) return { text: "ما عندك صلاحية إضافة مهام. تقدر تطلب من مدير المشروع يضيفها." };
    return createTaskDraft(raw, q, ctx, project);
  }

  // ---------- ملخّص اليوم ----------
  if (has(q, ["ملخص", "الخلاصه", "بريف", "وش الوضع", "ايش الوضع", "وش عندنا اليوم", "صباح الخير", "تقرير اليوم", "وش صاير"]) && !project) {
    return dailyBrief(ctx, first);
  }

  // ---------- الغياب والإجازات ----------
  if (has(q, ["غايب", "غياب", "اجازه", "اجازات", "غايبين", "اوف", "مجاز"])) {
    if (!can("leaves")) return noPerm("الإجازات");
    return leavesReply(ctx, q, person);
  }

  // ---------- المالية ----------
  if (has(q, ["فاتوره", "فواتير", "مستحقات", "مالي", "الماليه", "مدفوع", "سداد", "دفعات", "مبلغ", "مبالغ", "فلوس"])) {
    if (!can("finance")) return noPerm("المالية");
    return financeReply(ctx, q, project);
  }

  // ---------- المستهدفات ----------
  if (has(q, ["مستهدف", "kpi", "مؤشر", "مؤشرات", "اداء", "تارقت", "target"])) {
    if (!can("kpis")) return noPerm("الأداء والمستهدفات");
    return kpiReply(ctx, q, project);
  }

  // ---------- الاجتماعات ----------
  if (has(q, ["اجتماع", "اجتماعات", "ميتنق", "ميتنج", "meeting", "محضر", "محاضر"])) {
    if (!can("meetings")) return noPerm("الاجتماعات");
    return meetingsReply(ctx, q, project);
  }

  if (!can("tasks")) return { text: "ما عندك صلاحية على المهام، فما أقدر أجاوب على هذا السؤال." };

  // ---------- من عنده أكثر ----------
  if (has(q, ["مين عنده اكثر", "من عنده اكثر", "اكثر واحد", "توزيع المهام", "ضغط الشغل", "حمل العمل"])) {
    const lateOnly = has(q, ["متاخر"]);
    const counts = {};
    scoped.filter((t) => !isDone(t) && (!lateOnly || isOverdue(t))).forEach((t) => {
      const h = displayName(String(t.assigned_to || holderOf(t) || "").replace(/\s*\(.*$/, "").trim(), ctx.users) || "غير محدد";
      counts[h] = (counts[h] || 0) + 1;
    });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!rows.length) return { text: "ما فيه مهام مفتوحة حالياً." };
    return {
      text: `توزيع المهام ${lateOnly ? "المتأخرة" : "المفتوحة"}${project ? ` في ${project}` : ""} حسب المسؤول:`,
      items: rows.map(([n, c]) => ({ kind: "stat", title: n, sub: tasksWord(c), href: `/tasks?q=${encodeURIComponent(n)}` })),
    };
  }

  // ---------- المتأخرة ----------
  if (has(q, ["متاخر", "تاخر", "تاخير", "فات موعد", "متعثر", "overdue"])) {
    let list = scoped;
    if (person) list = list.filter((t) => involves(t, person));
    const od = overdueTasks(list).map((x) => x.t);
    const where = [project && `في ${project}`, person && (person === viewer?.name ? "عندك" : `عند ${person}`)].filter(Boolean).join(" ");
    if (!od.length) return { text: `ما فيه مهام متأخرة${where ? ` ${where}` : ""} 👏`, chips: ["وش المستحق هالأسبوع؟", "ملخّص اليوم"] };
    return { ...listReply(`فيه ${tasksWord(od.length)} متأخرة${where ? ` ${where}` : ""}، مرتبة من الأقدم:`, od), chips: ["مين عنده أكثر مهام متأخرة؟"] };
  }

  // ---------- بانتظار الاعتماد ----------
  if (has(q, ["اعتماد", "اعتمادات", "مراجعه", "ينتظر", "انتظار", "تعديل مطلوب", "مطلوب تعديل"])) {
    const pr = scoped.filter((t) => t.status === "Pending Review");
    const rv = scoped.filter((t) => t.status === "Revision Needed");
    if (has(q, ["تعديل"]) && rv.length) return listReply(`فيه ${tasksWord(rv.length)} مطلوب فيها تعديل${project ? ` في ${project}` : ""}:`, rv);
    if (!pr.length && !rv.length) return { text: `ما فيه شي ينتظر الاعتماد${project ? ` في ${project}` : ""} حالياً ✅` };
    const r = listReply(`${pr.length ? `${tasksWord(pr.length)} بانتظار مراجعة سيم واعتمادها` : "ما فيه مهام بانتظار المراجعة"}${rv.length ? `، و${tasksWord(rv.length)} مطلوب فيها تعديل` : ""}${project ? ` في ${project}` : ""}:`, [...pr, ...rv]);
    return { ...r, link: can("approvals") ? { text: "فتح صفحة الاعتمادات", href: "/approvals" } : null };
  }

  // ---------- المعلّقة / العوائق ----------
  if (has(q, ["معلق", "عائق", "عوائق", "واقف", "متوقف", "بلوكر", "blocker", "مشكله", "مشاكل"])) {
    const hold = scoped.filter((t) => !isDone(t) && (t.on_hold || String(t.blocker || "").trim()));
    if (!hold.length) return { text: `ما فيه مهام معلّقة أو عليها عائق${project ? ` في ${project}` : ""}.` };
    const r = listReply(`فيه ${tasksWord(hold.length)} معلّقة أو عليها عائق${project ? ` في ${project}` : ""}:`, hold);
    r.items = r.items.map((it, i) => {
      const t = hold[i];
      return t.blocker ? { ...it, sub: `${it.sub} · العائق: ${String(t.blocker).slice(0, 80)}` } : it;
    });
    return r;
  }

  // ---------- المستحق قريباً ----------
  const dueWords = ["مستحق", "تستحق", "تسليم", "تسليمات", "ديدلاين", "deadline", "المطلوب"];
  const timeWords = ["قريب", "الجاي", "القادمه", "الجايه", "هالاسبوع", "هذا الاسبوع", "الاسبوع", "اليوم", "بكره", "الشهر"];
  const taskWords = ["مهام", "مهمه", "شغل", "عندي", "علي", "عندنا", "عنده", "عندها", "تاسك"];
  if ((has(q, dueWords) || (has(q, timeWords) && (has(q, taskWords) || person))) && !has(q, ["اجتماع"])) {
    const rg = detectRange(q);
    let list = scoped;
    if (person) list = list.filter((t) => involves(t, person));
    let up = upcomingTasks(list, rg.days).filter((x) => (rg.only ? x.days === rg.only : true)).map((x) => x.t);
    const late = has(q, ["اليوم"]) ? overdueTasks(list).map((x) => x.t) : [];
    const who = person ? (person === viewer?.name ? " عليك" : ` على ${person}`) : "";
    if (!up.length && !late.length) return { text: `ما فيه تسليمات مستحقة${who} ${rg.label}${project ? ` في ${project}` : ""}.`, chips: ["المهام المتأخرة"] };
    const r = listReply(`المستحق${who} ${rg.label}${project ? ` في ${project}` : ""}: ${up.length ? tasksWord(up.length) : "لا شيء"}${late.length ? `، وفوقها ${tasksWord(late.length)} متأخرة` : ""}.`, [...late, ...up], { limit: 10 });
    return r;
  }

  // ---------- وضع المشروع ----------
  if (project && (has(q, ["وضع", "نسبه", "انجاز", "تقدم", "حال", "كيف", "وين وصل", "ملخص", "تقرير", "مشروع"]) || q === norm(project))) {
    return projectReply(ctx, project);
  }
  if (has(q, ["المشاريع", "مشاريع", "كل المشاريع", "وضع المشاريع"]) && can("projects")) {
    return projectsOverview(ctx);
  }

  // ---------- مهام شخص ----------
  if (person && (has(q, ["مهام", "مهمه", "شغل", "عند", "عنده", "عندها", "عندي", "مهامي", "وش علي", "ايش علي"]) || norm(person) === q)) {
    const mine = tasks.filter((t) => !isDone(t) && involves(t, person) && (!project || t.project === project))
      .sort((a, b) => (isOverdue(b) - isOverdue(a)) || String(a.due_date || "9").localeCompare(String(b.due_date || "9")));
    const isMe = person === viewer?.name;
    if (!mine.length) return { text: `${isMe ? "ما عندك" : `ما عند ${person}`} مهام مفتوحة${project ? ` في ${project}` : ""} 👌` };
    const od = mine.filter((t) => isOverdue(t)).length;
    return listReply(`${isMe ? "عندك" : `عند ${person}`} ${tasksWord(mine.length)} مفتوحة${project ? ` في ${project}` : ""}${od ? `، منها ${od} متأخرة` : ""}:`, mine, { limit: 10 });
  }

  // ---------- عدّ ----------
  if (has(q, ["كم مهمه", "كم عدد", "عدد المهام", "كم تاسك"])) {
    const st = taskStats(scoped);
    return { text: `${project ? `في ${project}` : "في كل المشاريع"}: ${st.total} مهمة — ${st.done} معتمدة، ${st.open} مفتوحة، ${st.overdue.length} متأخرة، ${st.pendingReview.length} بانتظار المراجعة. نسبة الإنجاز ${st.progress}%.` };
  }

  // ---------- بحث ----------
  const term = q.replace(/^(ابحث|ابحثي|دوري|دور|وين|فين|عن|المهمه|مهمه|عطيني|اعطيني)\s+/g, "").replace(/^(عن|المهمه|مهمه)\s+/, "").trim();
  if (term.length >= 3) {
    const words = term.split(" ").filter((w) => w.length >= 2 && !STOP.has(w));
    if (words.length) {
      const hits = tasks
        .map((t) => {
          const hay = norm(`${t.task} ${t.activity} ${t.deliverable} ${t.notes}`);
          return { t, score: words.filter((w) => hay.includes(w)).length };
        })
        .filter((x) => x.score > 0 && x.score >= Math.ceil(words.length / 2))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.t);
      if (hits.length) return listReply(`لقيت ${tasksWord(hits.length)} تطابق «${term.slice(0, 40)}»:`, hits);
    }
  }

  if (project) return projectReply(ctx, project);

  return {
    text: "ما فهمت سؤالك تماماً 🙏 أنا للحين أفهم أسئلة محددة عن المهام والمشاريع والاجتماعات والمستهدفات. جرّب وحدة من هذي:",
    chips: suggestions(ctx).slice(0, 6),
  };
}

const STOP = new Set(["في", "من", "على", "الى", "عن", "ما", "وش", "ايش", "هل", "مع", "او", "و", "ال", "لي", "ابي", "ابغى", "كل", "اللي", "هذا", "هذي"]);

function noPerm(section) {
  return { text: `ما عندك صلاحية على قسم «${section}»، فما أقدر أعرض لك هالمعلومات.` };
}

function greet(ctx, first) {
  return {
    text: `هلا${first ? ` ${first}` : ""} 👋 أنا ${AMAL_NAME}، مساعدتك في النظام. اسألني عن المهام والمشاريع والاجتماعات، أو اختر من هنا:`,
    chips: suggestions(ctx).slice(0, 6),
  };
}

function help(ctx) {
  const lines = [];
  const { can } = ctx;
  if (can("tasks")) lines.push("• المهام: المتأخرة، المستحقة اليوم أو هالأسبوع، مهام شخص معيّن، ووش ينتظر الاعتماد.");
  if (can("projects")) lines.push("• المشاريع: نسبة الإنجاز وحالة كل مشروع.");
  if (can("meetings")) lines.push("• الاجتماعات: الجاية، وآخر اجتماع لمشروع، والمحاضر اللي تنتظر الاعتماد.");
  if (can("leaves")) lines.push("• الإجازات: مين غايب اليوم ومين عنده إجازة قريبة.");
  if (can("kpis")) lines.push("• المستهدفات: وين وصلنا ووش المتأخر عن الهدف.");
  if (can("finance")) lines.push("• المالية: الفواتير غير المسددة والمتأخرة.");
  if (can("tasks", "edit")) lines.push("• وأقدر أنشئ لك مهمة: «أنشئ مهمة تصميم بوست لجاز لأحمد بكرة».");
  return { text: `أقدر أساعدك في:\n${lines.join("\n")}`, chips: suggestions(ctx).slice(0, 6) };
}

function dailyBrief(ctx, first) {
  const { viewer, role, can } = ctx;
  const tasks = ctx.tasks || [];
  const lines = [];
  const items = [];
  const st = taskStats(tasks);
  if (can("tasks")) {
    const today = upcomingTasks(tasks, 0).map((x) => x.t);
    const week = upcomingTasks(tasks, 7);
    lines.push(`📋 ${st.open} مهمة مفتوحة، نسبة الإنجاز ${st.progress}%.`);
    lines.push(today.length || week.length
      ? `⏰ المستحق اليوم: ${today.length ? tasksWord(today.length) : "لا شيء"}، وخلال الأسبوع: ${week.length ? tasksWord(week.length) : "لا شيء"}.`
      : "⏰ ما فيه تسليمات مستحقة خلال الأسبوع.");
    if (st.overdue.length) lines.push(`🔴 ${tasksWord(st.overdue.length)} متأخرة.`);
    if (st.pendingReview.length) lines.push(`🟣 ${tasksWord(st.pendingReview.length)} بانتظار اعتماد سيم.`);
    if (viewer && role !== "client") {
      const mine = tasks.filter((t) => !isDone(t) && norm(holderOf(t)) === norm(viewer.name));
      if (mine.length) lines.push(`👤 عندك الدور في ${tasksWord(mine.length)}.`);
    }
    items.push(...[...overdueTasks(tasks).map((x) => x.t).slice(0, 3), ...today.slice(0, 3)].map(taskItem));
  }
  if (can("meetings")) {
    const t0 = ymd();
    const todays = (ctx.meetings || []).filter((m) => (m.status || "Scheduled") === "Scheduled" && String(m.start_at || "").slice(0, 10) === t0);
    if (todays.length) {
      lines.push(`📅 عندكم ${plural(todays.length, "اجتماع واحد", "اجتماعين", "اجتماعات", "اجتماعاً")} اليوم.`);
      items.push(...todays.slice(0, 2).map(meetingItem));
    }
  }
  if (can("leaves")) {
    const away = awayOn(ctx.leaves || []);
    if (away.length) lines.push(`🌴 غايب اليوم: ${away.map((l) => l.person).join("، ")}.`);
  }
  return {
    text: `${timeGreeting()}${first ? ` ${first}` : ""} ☀️\nهذا ملخّص اليوم:\n${lines.join("\n")}`,
    items,
    chips: ["المهام المتأخرة", "وش المستحق هالأسبوع؟", "وضع المشاريع"].filter((c) => !c.includes("المشاريع") || can("projects")),
  };
}

function projectStats(ctx, name) {
  const list = (ctx.tasks || []).filter((t) => t.project === name);
  const p = (ctx.projects || []).find((x) => x.name === name);
  const st = taskStats(list);
  return { p, list, st, health: projectHealth(st, p?.status) };
}

function projectReply(ctx, name) {
  const { p, list, st, health } = projectStats(ctx, name);
  if (!list.length) return { text: `ما فيه مهام مسجلة في مشروع ${name} للحين.` };
  const lines = [
    `الحالة: ${health.label} — نسبة الإنجاز ${st.progress}%.`,
    `المهام: ${st.total} (معتمدة ${st.done}، مفتوحة ${st.open}).`,
  ];
  if (st.overdue.length) lines.push(`متأخرة: ${st.overdue.length}.`);
  if (st.pendingReview.length) lines.push(`بانتظار اعتماد سيم: ${st.pendingReview.length}.`);
  if (st.revision.length) lines.push(`مطلوب تعديل: ${st.revision.length}.`);
  if (st.onHold.length) lines.push(`معلّقة: ${st.onHold.length}.`);
  const mgr = p ? projManagers(p) : [];
  if (mgr.length) lines.push(`مدير المشروع: ${mgr.join("، ")}.`);
  const next = upcomingTasks(list, 14).map((x) => x.t);
  const focus = [...st.overdue, ...next].slice(0, 5);
  return {
    text: `📁 ${name}\n${lines.join("\n")}${focus.length ? "\n\nأهم ما يحتاج متابعة:" : ""}`,
    items: focus.map(taskItem),
    link: p?.id && ctx.can("projects") ? { text: `فتح صفحة ${name}`, href: `/projects/${p.id}` } : null,
    chips: [`المهام المتأخرة في ${name}`, `وش ينتظر الاعتماد في ${name}؟`],
  };
}

function projectsOverview(ctx) {
  const names = (ctx.projects || []).map((p) => p.name);
  const rows = names.map((n) => ({ n, ...projectStats(ctx, n) })).filter((r) => r.list.length);
  if (!rows.length) return { text: "ما فيه مشاريع فيها مهام للحين." };
  rows.sort((a, b) => b.st.overdue.length - a.st.overdue.length);
  return {
    text: `وضع ${plural(rows.length, "المشروع", "المشروعين", "مشاريع", "مشروعاً")} (الأكثر تأخيراً أولاً):`,
    items: rows.map((r) => ({
      kind: "project",
      title: r.n,
      sub: `إنجاز ${r.st.progress}% · ${r.st.open} مفتوحة${r.st.overdue.length ? ` · ${r.st.overdue.length} متأخرة` : ""}`,
      badge: { text: r.health.label, color: r.health.color },
      href: r.p?.id ? `/projects/${r.p.id}` : "/projects",
    })),
  };
}

export function meetingItem(m) {
  const st = MEETING_STATUS[m.status || "Scheduled"] || MEETING_STATUS.Scheduled;
  return {
    kind: "meeting",
    title: m.title,
    sub: [m.project, fmtDateTime(m.start_at), m.location].filter(Boolean).join(" · "),
    badge: { text: st.short || st.ar, color: st.color },
    href: "/meetings",
  };
}

function meetingsReply(ctx, q, project) {
  const all = (ctx.meetings || []).filter((m) => !project || m.project === project);
  const now = new Date().toISOString();
  if (has(q, ["محضر", "محاضر", "اعتماد"])) {
    const pending = all.filter((m) => m.status === "Done");
    if (!pending.length) return { text: "ما فيه محاضر تنتظر الاعتماد ✅" };
    return { text: `فيه ${plural(pending.length, "محضر واحد", "محضرين", "محاضر", "محضراً")} بانتظار الاعتماد:`, items: pending.slice(0, 8).map(meetingItem) };
  }
  if (has(q, ["اخر", "الماضي", "السابق", "قبل"])) {
    const past = all.filter((m) => m.start_at && m.start_at < now && m.status !== "Cancelled").sort((a, b) => String(b.start_at).localeCompare(String(a.start_at)));
    if (!past.length) return { text: `ما فيه اجتماعات سابقة${project ? ` لمشروع ${project}` : ""}.` };
    const m = past[0];
    const decisions = (Array.isArray(m.action_items) ? m.action_items : []).map((a) => (typeof a === "string" ? a : a?.text || a?.title)).filter(Boolean);
    const att = parseAttendees(m.present?.length ? m.present : m.attendees);
    const lines = [`آخر اجتماع${project ? ` لمشروع ${project}` : ""}: «${m.title}» — ${fmtDateTime(m.start_at)}.`];
    if (att.length) lines.push(`الحضور: ${att.join("، ")}.`);
    if (decisions.length) lines.push(`القرارات والإجراءات:\n${decisions.slice(0, 6).map((d) => `• ${d}`).join("\n")}`);
    else if (m.minutes) lines.push(`من المحضر: ${String(m.minutes).slice(0, 220)}${String(m.minutes).length > 220 ? "…" : ""}`);
    return { text: lines.join("\n"), items: [meetingItem(m)] };
  }
  const t0 = ymd();
  const onlyToday = /(^|\s)اليوم($|\s)/.test(q);
  const up = all.filter((m) => (m.status || "Scheduled") === "Scheduled" && m.start_at && (onlyToday ? String(m.start_at).slice(0, 10) === t0 : m.start_at >= now))
    .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  if (!up.length) return { text: `ما فيه اجتماعات ${onlyToday ? "اليوم" : "قادمة"}${project ? ` لمشروع ${project}` : ""}.`, chips: ["آخر اجتماع"] };
  return { text: `${onlyToday ? "اجتماعات اليوم" : "الاجتماعات الجاية"}${project ? ` لمشروع ${project}` : ""}:`, items: up.slice(0, 8).map(meetingItem) };
}

function leavesReply(ctx, q, person) {
  const leaves = ctx.leaves || [];
  if (person && !has(q, ["اليوم", "مين", "من"])) {
    const mine = leaves.filter((l) => l.person === person && l.status === "approved" && l.end >= ymd()).sort((a, b) => a.start.localeCompare(b.start));
    if (!mine.length) return { text: `ما عند ${person} إجازات حالية أو قادمة.` };
    return { text: `إجازات ${person}:`, items: mine.map(leaveItem) };
  }
  const away = awayOn(leaves);
  const soon = upcomingLeaves(leaves, 14);
  const lines = [away.length ? `غايب اليوم: ${away.map((l) => l.person).join("، ")}.` : "ما فيه أحد غايب اليوم 👌"];
  if (soon.length) lines.push(`وعندهم إجازة خلال الأسبوعين الجاية: ${soon.length}.`);
  return { text: lines.join("\n"), items: [...away, ...soon].slice(0, 8).map(leaveItem), link: { text: "فتح الإجازات", href: "/leaves" } };
}

function leaveItem(l) {
  const ty = LEAVE_TYPES[l.type] || LEAVE_TYPES.other;
  return {
    kind: "leave",
    title: `${ty.emoji} ${l.person}`,
    sub: `${ty.ar} · ${fmtDate(l.start)}${l.end && l.end !== l.start ? ` ← ${fmtDate(l.end)}` : ""}`,
    badge: { text: ty.short, color: ty.color },
    href: "/leaves",
  };
}

function kpiReply(ctx, q, project) {
  let kpis = ctx.kpis || [];
  if (ctx.role === "client") kpis = kpis.filter((k) => (k.visibility || "private") === "public");
  if (project) kpis = kpis.filter((k) => !k.project || k.project === project);
  if (!kpis.length) return { text: "ما فيه مستهدفات مسجلة." };
  const ach = kpiAchievement(kpis);
  const behind = kpis.filter((k) => kpiPct(k) < 100).sort((a, b) => kpiPct(a) - kpiPct(b));
  const onlyBehind = has(q, ["متاخر", "بعيد", "اقل", "ما وصل", "ضعيف"]);
  const list = onlyBehind ? behind : [...kpis].sort((a, b) => kpiPct(a) - kpiPct(b));
  return {
    text: `متوسط تحقق المستهدفات${project ? ` في ${project}` : ""}: ${ach}%. ${behind.length ? `${behind.length} منها ما وصلت للهدف.` : "كلها محققة 🎉"}`,
    items: list.slice(0, 8).map((k) => ({
      kind: "kpi",
      title: k.name,
      sub: `${Number(k.current).toLocaleString("ar-SA")} من ${Number(k.target).toLocaleString("ar-SA")} ${k.unit || ""}`.trim(),
      badge: { text: `${kpiPct(k)}%`, color: kpiPct(k) >= 100 ? "#16a34a" : kpiPct(k) >= 70 ? "#d97706" : "#dc2626" },
      href: "/kpis",
    })),
  };
}

function financeReply(ctx, q, project) {
  let rows = invoiceRows(ctx.invoices || [], ctx.payments || []);
  if (project) rows = rows.filter((r) => r.project === project);
  const rec = receivables(rows);
  if (!rec.open.length) return { text: `ما فيه فواتير غير مسددة${project ? ` لمشروع ${project}` : ""} ✅` };
  const list = has(q, ["متاخر"]) ? rec.overdue : rec.open;
  return {
    text: `المستحقات غير المسددة${project ? ` لمشروع ${project}` : ""}: ${money(rec.total)} في ${plural(rec.open.length, "فاتورة واحدة", "فاتورتين", "فواتير", "فاتورة")}.${rec.overdue.length ? `\nالمتأخرة منها: ${rec.overdue.length} بقيمة ${money(rec.overdueTotal)}.` : ""}`,
    items: list.slice(0, 8).map((r) => ({
      kind: "invoice",
      title: `فاتورة ${r.number || "—"}${r.project ? ` · ${r.project}` : ""}`,
      sub: `المتبقي ${money(r.outstanding)} من ${money(r.amount)}${r.due_date ? ` · ${relDays(r.days).replace("متأخرة", "متأخرة")}` : ""}`,
      badge: { text: r.st.label, color: r.st.color },
      href: "/finance",
    })),
  };
}

// ================= مسودة إنشاء مهمة =================
const CREATE_PREFIX = /^.*?(انشي|انشئ|انشاء|سوي|سو|اضف|ضيف|اضافه|ابي|ابغى|ابغي|سجلي|سجل|افتحي|افتح)\s*(لي\s*)?(مهمه|تاسك|task)\s*(جديده)?\s*[:：-]?\s*/;

const SPECIAL_DAYS = /(^|\s)(اليوم|يوم)\s+(الوطني|التاسيس|العالمي|المعلم|الام)/;

function createTaskDraft(raw, q, ctx, project) {
  const { users, viewer } = ctx;
  const body = q.replace(CREATE_PREFIX, "");
  // «سوي لي مهمة» لا تعني إسنادها لي: نبحث عن الشخص في نص المهمة فقط
  const person = detectPerson(body.replace(/(^|\s)(لي|علي|عندي)(\s|$)/g, " "), users, null);
  let title = body;
  const protect = title.match(SPECIAL_DAYS)?.[0] || "";
  if (protect) title = title.replace(protect, " __SPECIAL__ ");
  const strip = (x) => { if (x) title = title.replace(new RegExp(`(^|\\s)(ل|في|ب|حق|لمشروع|مشروع|مع)?\\s*${escapeRe(norm(x))}(?=$|\\s)`, "g"), " "); };
  if (project) { strip(project); (PROJECT_ALIASES[project] || []).forEach(strip); }
  if (person) nameVariants(person).forEach(strip);
  title = title
    .replace(/(^|\s)(مسنده|اسنديها|اسندها|عطها|عطيها)\s*(ل|الى)?(?=\s|$)/g, " ")
    .replace(/(^|\s)(عاجل|عاجله|مستعجل|مستعجله|ضروري|اولويه عاليه|مو مستعجل)(?=\s|$)/g, " ")
    .replace(/(^|\s)(تستحق|موعدها|موعد|قبل|تاريخ|الموعد)(?=\s|$)/g, " ")
    .replace(/(^|\s)(اليوم|بكره|بكرا|غدا|بعد\s*بكره|بعد\s*\d+\s*(يوم|ايام)|بعد\s*اسبوعين|بعد\s*اسبوع)(?=\s|$)/g, " ")
    .replace(/\d{4}-\d{1,2}-\d{1,2}|(^|\s)\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, " ");
  WEEKDAYS.forEach((ws) => ws.forEach((w) => {
    title = title.replace(new RegExp(`(^|\\s)(يوم\\s+)?(ال)?${escapeRe(w.replace(/^ال/, ""))}(?=\\s|$)`, "g"), " ");
  }));
  if (protect) title = title.replace("__SPECIAL__", protect.trim());
  title = title.replace(/\s+/g, " ").trim().replace(/(\s(ل|في|و|الى|مع|يوم))+$/g, "").replace(/^(ل|في|و|مع)\s/, "").trim();

  // استرجاع كلمات العنوان بحروفها الأصلية (ة، أ، التشكيل…) بالترتيب
  const origWords = String(raw).replace(/\s+/g, " ").trim().split(" ");
  const tks = title.split(" ").filter(Boolean);
  const out = [];
  let k = 0;
  for (const w of origWords) {
    if (k < tks.length && norm(w) === tks[k]) { out.push(w.replace(/[؟?!.,،]+$/, "")); k++; }
  }
  if (k === tks.length && out.length) title = out.join(" ");

  const draft = {
    task: title,
    project: project || (ctx.scopeProjects && ctx.scopeProjects.length === 1 ? ctx.scopeProjects[0] : ""),
    assigned_to: person || "",
    due_date: parseDue(q) || "",
    priority: has(q, ["عاجل", "مستعجل", "ضروري", "عاليه"]) && !has(q, ["مو مستعجل"]) ? "High" : has(q, ["منخفضه", "مو مستعجل"]) ? "Low" : "Medium",
  };
  return {
    text: title
      ? "جهّزت لك المهمة، راجع التفاصيل وعدّل اللي تبي ثم اضغط «إنشاء»:"
      : "تمام، عبّي تفاصيل المهمة واضغط «إنشاء»:",
    action: { type: "createTask", draft, projects: (ctx.projects || []).map((p) => p.name), users: (users || []).filter((u) => u.role !== "client").map((u) => u.name) },
  };
}

export const PRIORITY_OPTIONS = Object.entries(PRIORITY_META).map(([k, v]) => ({ value: k, label: v.ar }));
export { taskProgress };
