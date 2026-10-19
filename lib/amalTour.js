// جولة «أمل» التعريفية بالنظام — للموظف الجديد أو لأي شخص يبي يتعرّف على النظام.
// كل خطوة: الصفحة، العنصر المستهدف (عدة محددات بالترتيب، أول عنصر ظاهر يُعتمد)،
// القسم المطلوب صلاحيته، والعنوان والشرح. الخطوات التي لا يملك المستخدم صلاحيتها تُتخطّى تلقائياً.

const NEW_DAYS = 30;

// موظف جديد = انضم خلال آخر 30 يوماً (تاريخ المباشرة أو تاريخ إنشاء الحساب)
export function isNewEmployee(user) {
  const raw = user?.start_date || user?.created_at;
  if (!raw) return false;
  const d = new Date(raw);
  return !isNaN(d) && Date.now() - d.getTime() < NEW_DAYS * 86400000 && Date.now() >= d.getTime() - 86400000;
}

export const TOUR_STEPS = [
  {
    id: "meet", path: "/", target: null, mood: "wave", hero: true,
    title: "قبل كل شي… خلني أعرّفك على نفسي 💜",
    text: "{greet} {name}، وأهلاً بك في الفريق! أنا أمل، مساعدتك الذكية في النظام. أعرف كل شي عن المهام والمشاريع والاجتماعات، وأقدر:\n• أجاوبك: «وش علي اليوم؟» «وش المتأخر في هوميرا؟»\n• أنشئ لك مهمة من جملة وحدة\n• ألخّص لك أي مهمة وآخر نقاشها\n• أنبهك وأفرح معك بكل إنجاز 🎉\n\nتلقاني دايماً في الشاشة، اضغط عليّ وقت ما تحتاج. والحين بمشي معك جولة سريعة على النظام.",
  },
  {
    id: "intro", path: "/", target: null, mood: "wave",
    title: "أهلاً بك في مركز القيادة 👋",
    text: "خلنا نبدأ: بمشي معك على كل جزء في النظام وأشرح لك وش فايدته وكيف تستخدمه. الجولة تاخذ دقايق، وتقدر توقفها أو ترجع لها بأي وقت.",
  },
  {
    id: "sidebar", path: "/", target: [".sidebar"], mood: "talk",
    title: "القائمة الرئيسية",
    text: "من هنا تتنقل بين أقسام النظام: الرئيسية، المهام، المشاريع، الاعتمادات، الأداء، التقارير، الاجتماعات وغيرها. الأقسام اللي تشوفها تعتمد على صلاحياتك. وتحت تلقى حسابك وزر تسجيل الخروج.",
  },
  {
    id: "hero", path: "/", section: "dashboard", target: [".cc-hero"], mood: "happy",
    title: "الرئيسية — لوحة القيادة",
    text: "أول ما تدخل تشوف ترحيب بالتاريخ الميلادي والهجري، وملخص المشاريع: كم مشروع على المسار وكم متعثر. وفيه أزرار سريعة توديك للمهام والتقارير.",
  },
  {
    id: "stats", path: "/", section: "dashboard", target: [".cc-stats"], mood: "talk",
    title: "المؤشرات السريعة",
    text: "هالبطاقات تعطيك النبض العام: نسبة الإنجاز، التسليمات القريبة، الأعمال المتأخرة، الاعتمادات اللي تنتظر قرار، والمستحقات المالية (لمن له صلاحية). اضغط أي بطاقة توديك للتفاصيل.",
  },
  {
    id: "watch", path: "/", section: "dashboard", target: [".cc-watch"], mood: "concerned",
    title: "قائمة المتابعة",
    text: "أهم قائمة في يومك: المهام المتأخرة، والقادمة، واللي بانتظار سيم. ابدأ يومك منها وشوف وش يحتاج تحرك.",
  },
  {
    id: "projects-health", path: "/", section: "dashboard", target: [".cc-projects"], mood: "talk",
    title: "حالة المشاريع",
    text: "جدول لكل مشروع: حالته (على المسار / معرّض للتعثر / متعثر)، نسبة الإنجاز، عدد المتأخر، والتسليم القادم. الحالة تنحسب تلقائياً من المهام.",
  },
  {
    id: "side", path: "/", section: "dashboard", target: [".cc-side"], mood: "talk",
    title: "الفريق والمواعيد",
    text: "هنا تشوف مين غايب اليوم، والمناسبات والاجتماعات القادمة، وملخص المالية.",
  },
  {
    id: "search", path: "/", target: [".topbar .search"], mood: "talk",
    title: "البحث الشامل",
    text: "اكتب اسم مهمة أو مشروع أو ملف وتوصله مباشرة من أي صفحة.",
  },
  {
    id: "bell", path: "/", target: [".bell"], mood: "talk",
    title: "الإشعارات",
    text: "الجرس يجمع كل التحديثات: مهمة انضافت، تسليم انرسل للمراجعة، اعتماد، تعديل مطلوب، ومواعيد قربت. الرقم الأحمر = غير المقروء.",
  },
  {
    id: "tasks-views", path: "/tasks", section: "tasks", target: [".content .seg"], mood: "talk",
    title: "المهام — طرق العرض",
    text: "قلب النظام. تقدر تعرض المهام كلوحة (أعمدة حسب الحالة)، أو قائمة مجمّعة حسب المشروع، أو تقويم شهري حسب تاريخ الاستحقاق.",
  },
  {
    id: "tasks-filters", path: "/tasks", section: "tasks", target: [".content .toolbar"], mood: "talk",
    title: "البحث والفلاتر",
    text: "فلتر حسب الموظف، أو المشروع، أو اختصارات سريعة مثل «المتأخرة» و«المعلّقة» و«بانتظار سيم».",
  },
  {
    id: "tasks-card", path: "/tasks", section: "tasks", target: ["[draggable]", ".lt-row"], mood: "happy",
    title: "بطاقة المهمة",
    text: "كل بطاقة فيها الأولوية والصحة والمسؤول والموعد. اسحبها بين الأعمدة لتغيير حالتها، واضغط عليها لفتح التفاصيل.",
  },
  {
    id: "tasks-new", path: "/tasks", section: "tasks", edit: true, target: [{ sel: ".content .btn.primary", text: "مهمة جديدة" }], mood: "talk",
    title: "إضافة مهمة",
    text: "من هنا تضيف مهمة: العنوان، المشروع، المخرج، المسؤول، الأولوية، والموعد. أو قل لي «أنشئ مهمة …» وأجهزها لك.",
  },
  {
    id: "tasks-flow", path: "/tasks", section: "tasks", target: null, mood: "talk",
    title: "دورة حياة المهمة",
    text: "لم تبدأ ← قيد التنفيذ ← بانتظار مراجعة سيم ← معتمدة (أو «مطلوب تعديل» وترجع للتنفيذ).\n\nداخل المهمة تلقى: سلسلة الاعتماد، «حالياً عند» مين الدور، التحويل لشخص ثاني، المرفقات والروابط، وشات الملاحظات للتواصل مع الفريق والعميل. وزر «اسألي أمل» يلخّص لك المهمة.",
  },
  {
    id: "projects", path: "/projects", section: "projects", target: [".pj-toolbar", ".content"], mood: "talk",
    title: "المشاريع",
    text: "كل مشروع ببطاقة فيها الوصف والفريق ونسبة الإنجاز. اضغط المشروع تدخل صفحته: مهامه، ملفاته، اجتماعاته، ومستهدفاته في مكان واحد.",
  },
  {
    id: "approvals", path: "/approvals", section: "approvals", target: [".kpi-card", ".content"], mood: "talk",
    title: "الاعتمادات",
    text: "كل التسليمات اللي تنتظر قرار سيم: اعتماد أو طلب تعديل مع ملاحظة. اللي عنده صلاحية الاعتماد يقرر من هنا.",
  },
  {
    id: "kpis", path: "/kpis", section: "kpis", target: [".kpi-cat", ".content"], mood: "talk",
    title: "الأداء والمستهدفات",
    text: "مؤشرات الأداء مقارنة بالمستهدف لكل فترة (شهر/ربع/سنة)، مع الموظفين المسؤولين. المستهدف ممكن يكون عام يشوفه العميل أو خاص داخلي.",
  },
  {
    id: "reports", path: "/reports", section: "reports", target: [".rep-nav", ".content .seg", ".content"], mood: "talk",
    title: "التقارير",
    text: "تقارير يومية وأسبوعية وشهرية وربع سنوية: المستحق، المنجز، الجاري، المتأخر وأسبابه، والقرارات. وكل تقرير جاهز للطباعة بترويسة موحّدة.",
  },
  {
    id: "finance", path: "/finance", section: "finance", target: [".fin-card", ".content"], mood: "talk",
    title: "المالية",
    text: "فواتير ڤيوليت ← سيم برايم ومدفوعاتها (كامل أو جزئي)، والمستحقات والمتأخر. يظهر بس لمن عنده صلاحية المالية.",
  },
  {
    id: "meetings", path: "/meetings", section: "meetings", target: [".content"], mood: "talk",
    title: "الاجتماعات",
    text: "جدول اجتماع ← بعد ما يخلص «إنهاء الاجتماع» وتسجّل الحضور والمحضر والقرارات ← اعتماد المحضر وإرساله للحضور. وتقدر تحوّل القرارات لمهام بضغطة.",
  },
  {
    id: "calendar", path: "/calendar", section: "calendar", target: [".content"], mood: "happy",
    title: "الروزنامة السنوية",
    text: "المناسبات الوطنية والدينية والأيام العالمية والمواسم والمؤتمرات — تساعدكم تخططون المحتوى والحملات بدري.",
  },
  {
    id: "leaves", path: "/leaves", section: "leaves", target: [".content"], mood: "happy",
    title: "الإجازات",
    text: "اطلب إجازة (مرضية، أوف، سنوية، طارئة) ← يوافق المدير ← يعرف الفريق ويظهر في «غائبون اليوم». ولما ترجع نقول لك الحمد لله على السلامة 🌿",
  },
  {
    id: "team", path: "/team", section: "team", target: [".content"], mood: "talk",
    title: "الفريق",
    text: "بيانات أعضاء الفريق: القسم، المسؤول المباشر، تاريخ الانضمام، وحالة الحساب. ومنه تُدار الصلاحيات لكل شخص ولكل قسم.",
  },
  {
    id: "activity", path: "/activity", section: "activity", target: [".content"], mood: "talk",
    title: "سجل الأنشطة",
    text: "توثيق دائم لكل إضافة وتعديل وحذف: مين سوّاها ومتى. مرجع لأي استفسار.",
  },
  {
    id: "settings", path: "/settings", section: "settings", target: [".content"], mood: "talk",
    title: "تخصيص النظام",
    text: "الشعار والهوية وقوالب الإشعارات والبريد. غالباً للإدارة.",
  },
  {
    id: "amal", path: "/", target: [".amal-dock"], mood: "celebrate",
    title: "وأنا معك دايماً 💜",
    text: "خلصنا الجولة! أنا هنا دايماً في وسط الشاشة (وتقدر تسحبني لأي مكان يريحك، أو تصغّرني). اسألني «وش علي اليوم؟» أو «وش المتأخر في هوميرا؟»، أو قل «أنشئ مهمة …». وإذا نسيت شي، قل لي «اشرحي هالصفحة» أو «سوي لي جولة» من جديد.",
  },
];

// خطوات الجولة المسموحة لهذا المستخدم
export function tourFor(can, { path = null } = {}) {
  return TOUR_STEPS.filter((s) => {
    if (s.section && !can(s.section)) return false;
    if (s.edit && !can(s.section, "edit")) return false;
    if (path) return pathKey(s.path) === pathKey(path) && s.id !== "intro" && s.id !== "meet" && s.id !== "amal";
    return true;
  });
}

const pathKey = (p) => {
  const x = String(p || "/").split("?")[0];
  if (x === "/") return "/";
  return "/" + x.split("/").filter(Boolean)[0];
};

// شرح قسم بالاسم (لأسئلة مثل «وش قسم المالية؟»)
const SECTION_WORDS = [
  ["finance", ["الماليه", "مالي", "الفواتير"]],
  ["approvals", ["الاعتمادات", "اعتمادات"]],
  ["kpis", ["المستهدفات", "الاداء", "المؤشرات", "kpi"]],
  ["reports", ["التقارير", "تقرير"]],
  ["meetings", ["الاجتماعات", "اجتماع"]],
  ["calendar", ["الروزنامه", "التقويم السنوي", "المناسبات"]],
  ["leaves", ["الاجازات", "اجازه"]],
  ["team", ["الفريق", "الصلاحيات"]],
  ["activity", ["سجل الانشطه", "السجل", "الانشطه"]],
  ["settings", ["التخصيص", "الاعدادات"]],
  ["projects", ["المشاريع", "مشروع"]],
  ["tasks", ["المهام", "المهمه"]],
  ["dashboard", ["الرئيسيه", "لوحه القياده", "الداشبورد"]],
];
const HREF = { dashboard: "/", tasks: "/tasks", projects: "/projects", approvals: "/approvals", kpis: "/kpis", reports: "/reports", finance: "/finance", meetings: "/meetings", calendar: "/calendar", leaves: "/leaves", team: "/team", activity: "/activity", settings: "/settings" };

export function explainSection(q, can) {
  for (const [key, words] of SECTION_WORDS) {
    if (!words.some((w) => q.includes(w))) continue;
    if (!can(key)) return { text: "ما عندك صلاحية على هذا القسم، فما يظهر عندك في القائمة." };
    const steps = TOUR_STEPS.filter((s) => s.section === key);
    if (!steps.length) return null;
    return {
      mood: "talk",
      text: steps.map((s) => `${s.title}\n${s.text}`).join("\n\n"),
      link: { text: "خذني للقسم", href: HREF[key] },
      chips: ["اشرحي هالصفحة", "سوي لي جولة على النظام"],
    };
  }
  return null;
}
