// الفعاليات الافتراضية للروزنامة السنوية.
// yearly: تتكرر بنفس اليوم كل سنة (ميلادية ثابتة).
// approx: تاريخ تقريبي (مناسبات هجرية تُحدَّد برؤية الهلال، أو مؤتمرات يتغيّر موعدها سنوياً) — راجِعها قبل الاعتماد عليها.
// desc: نبذة عن المناسبة · tip: فكرة محتوى/تسويق مقترحة · fit: المشاريع المناسبة لها
// greet: مناسبة تُعرض لها تهنئة عند دخول النظام (days = عدد أيام التهنئة)
export const EVENT_TYPES = {
  national: { ar: "مناسبة وطنية", color: "#16a34a" },
  religious: { ar: "مناسبة دينية", color: "#0d9488" },
  global: { ar: "يوم عالمي", color: "#2563eb" },
  season: { ar: "موسم تسويقي", color: "#db2777" },
  conference: { ar: "مؤتمر / معرض", color: "#7c3aed" },
  internal: { ar: "فعالية داخلية", color: "#c88a2e" },
};

// ثيمات التهنئة (ألوان + رمز) — تُستخدم في نافذة الترحيب
export const GREET_THEMES = {
  national: { from: "#0f7b3f", to: "#16a34a", accent: "#e8f7ee", emoji: "🇸🇦" },
  ramadan: { from: "#1e2a5a", to: "#3b4a8f", accent: "#f6e7b4", emoji: "🌙" },
  eid: { from: "#7c3aed", to: "#c026d3", accent: "#fde7ff", emoji: "🎉" },
  hijri: { from: "#0d9488", to: "#14b8a6", accent: "#e0f7f4", emoji: "🕌" },
  global: { from: "#2563eb", to: "#0ea5e9", accent: "#e6f2ff", emoji: "🌍" },
};

export const SEED_EVENTS = [
  // ================= وطنية (ثابتة) =================
  { id: "sa-founding", date: "2026-02-22", title: "يوم التأسيس السعودي", type: "national", yearly: true,
    desc: "ذكرى تأسيس الدولة السعودية الأولى على يد الإمام محمد بن سعود عام 1727م. إجازة رسمية.",
    tip: "محتوى يربط العلامة بالهوية والتراث السعودي، وعروض خاصة بالمناسبة.",
    greet: { theme: "national", days: 1, title: "يوم التأسيس", message: "يوم بدينا 🇸🇦 — كل عام ووطننا بعزّ وفخر" } },
  { id: "sa-flag", date: "2026-03-11", title: "يوم العلم السعودي", type: "national", yearly: true,
    desc: "يُحتفى به بذكرى إقرار الملك عبدالعزيز للعلم عام 1937م، رمز التوحيد والوحدة.",
    tip: "منشورات تعتمد ألوان العلم بدون استخدام شعار التوحيد في الإعلانات التجارية.",
    greet: { theme: "national", days: 1, title: "يوم العلم", message: "رايتنا شامخة — كل عام وعلمنا خفّاق 🇸🇦" } },
  { id: "sa-national", date: "2026-09-23", title: "اليوم الوطني السعودي", type: "national", yearly: true,
    desc: "ذكرى توحيد المملكة على يد الملك عبدالعزيز عام 1932م. إجازة رسمية وأكبر موسم احتفالي وطني.",
    tip: "حملة متكاملة قبل أسبوعين: هوية خاصة، عروض، ومحتوى عن الإنجازات.",
    greet: { theme: "national", days: 2, title: "اليوم الوطني السعودي", message: "دام عزّك يا وطن 🇸🇦 — كل عام والمملكة بخير" } },
  { id: "sa-vision", date: "2026-04-25", title: "ذكرى إطلاق رؤية السعودية 2030", type: "national", yearly: true,
    desc: "أُعلنت الرؤية في 25 أبريل 2016 لتنويع الاقتصاد وتمكين القطاعات الواعدة.",
    tip: "محتوى عن مساهمة المشروع في مستهدفات الرؤية (السياحة، العقار، الغذاء)." },

  // ================= دينية (هجرية — تقريبية) =================
  { id: "ramadan-1447", date: "2026-02-18", title: "بداية شهر رمضان 1447", type: "religious", approx: true,
    desc: "شهر الصيام. تتغيّر ساعات العمل ويرتفع الاستهلاك الرقمي ليلاً.",
    tip: "جدولة النشر بعد الإفطار وقبل السحور، وحملات رمضانية من منتصف شعبان.",
    greet: { theme: "ramadan", days: 3, title: "رمضان كريم", message: "مبارك عليكم الشهر — تقبّل الله صيامكم وقيامكم 🌙" } },
  { id: "fitr-1447", date: "2026-03-20", title: "عيد الفطر 1447", type: "religious", approx: true,
    desc: "أول أيام شوال. إجازة رسمية، وموسم تسوّق وهدايا.",
    tip: "تهنئة + عروض العيد، والتجهيز للحملة قبل العشر الأواخر.",
    greet: { theme: "eid", days: 3, title: "عيد الفطر المبارك", message: "عيدكم مبارك وكل عام وأنتم بخير 🎉" } },
  { id: "arafah-1447", date: "2026-05-26", title: "يوم عرفة 1447", type: "religious", approx: true,
    desc: "التاسع من ذي الحجة، أفضل أيام السنة وذروة مناسك الحج.",
    tip: "محتوى روحاني هادئ بلا طابع ترويجي.",
    greet: { theme: "hijri", days: 1, title: "يوم عرفة", message: "اللهم اجعلنا من عتقائك في هذا اليوم المبارك 🤲" } },
  { id: "adha-1447", date: "2026-05-27", title: "عيد الأضحى 1447", type: "religious", approx: true,
    desc: "العاشر من ذي الحجة. إجازة رسمية، وموسم ذبائح وهدايا وسفر.",
    tip: "عروض ما قبل العيد، ومحتوى عن اللمّة العائلية.",
    greet: { theme: "eid", days: 4, title: "عيد الأضحى المبارك", message: "أضحى مبارك — تقبّل الله منا ومنكم 🐑" } },
  { id: "hijri-1448", date: "2026-06-16", title: "رأس السنة الهجرية 1448", type: "religious", approx: true,
    desc: "بداية شهر محرّم وعام هجري جديد.",
    tip: "تهنئة بالعام الجديد ومراجعة إنجازات العام.",
    greet: { theme: "hijri", days: 1, title: "عام هجري جديد", message: "كل عام وأنتم بخير — عام 1448 مبارك 🕌" } },
  { id: "ashura-1448", date: "2026-06-25", title: "يوم عاشوراء 1448", type: "religious", approx: true,
    desc: "العاشر من محرّم، يُستحب صيامه." },
  { id: "ramadan-1448", date: "2027-02-08", title: "بداية شهر رمضان 1448", type: "religious", approx: true,
    desc: "شهر الصيام. تتغيّر ساعات العمل ويرتفع الاستهلاك الرقمي ليلاً.",
    tip: "جدولة النشر بعد الإفطار وقبل السحور.",
    greet: { theme: "ramadan", days: 3, title: "رمضان كريم", message: "مبارك عليكم الشهر — تقبّل الله صيامكم وقيامكم 🌙" } },
  { id: "fitr-1448", date: "2027-03-10", title: "عيد الفطر 1448", type: "religious", approx: true,
    desc: "أول أيام شوال. إجازة رسمية، وموسم تسوّق وهدايا.",
    greet: { theme: "eid", days: 3, title: "عيد الفطر المبارك", message: "عيدكم مبارك وكل عام وأنتم بخير 🎉" } },
  { id: "arafah-1448", date: "2027-05-15", title: "يوم عرفة 1448", type: "religious", approx: true,
    desc: "التاسع من ذي الحجة.",
    greet: { theme: "hijri", days: 1, title: "يوم عرفة", message: "اللهم اجعلنا من عتقائك في هذا اليوم المبارك 🤲" } },
  { id: "adha-1448", date: "2027-05-16", title: "عيد الأضحى 1448", type: "religious", approx: true,
    desc: "العاشر من ذي الحجة. إجازة رسمية.",
    greet: { theme: "eid", days: 4, title: "عيد الأضحى المبارك", message: "أضحى مبارك — تقبّل الله منا ومنكم 🐑" } },
  { id: "hijri-1449", date: "2027-06-06", title: "رأس السنة الهجرية 1449", type: "religious", approx: true,
    desc: "بداية عام هجري جديد.",
    greet: { theme: "hijri", days: 1, title: "عام هجري جديد", message: "كل عام وأنتم بخير — عام 1449 مبارك 🕌" } },

  // ================= أيام عالمية (ثابتة) =================
  { id: "new-year", date: "2026-01-01", title: "بداية السنة الميلادية", type: "global", yearly: true,
    desc: "بداية العام المالي لكثير من الجهات.", tip: "مراجعة سنوية للأرقام، ومحتوى «حصاد العام»." },
  { id: "education-day", date: "2026-01-24", title: "اليوم الدولي للتعليم", type: "global", yearly: true,
    desc: "أقرّته الأمم المتحدة للتأكيد على دور التعليم في التنمية." },
  { id: "privacy-day", date: "2026-01-28", title: "يوم حماية البيانات", type: "global", yearly: true,
    desc: "للتوعية بخصوصية البيانات الشخصية وحمايتها.", tip: "مناسب للمنصات الرقمية (ZL.Tours، Homera) لطمأنة المستخدمين." },
  { id: "cancer-day", date: "2026-02-04", title: "اليوم العالمي للسرطان", type: "global", yearly: true,
    desc: "للتوعية بالوقاية والكشف المبكر." },
  { id: "women-science", date: "2026-02-11", title: "اليوم الدولي للمرأة والفتاة في العلوم", type: "global", yearly: true,
    desc: "للاحتفاء بإسهام المرأة في العلوم والتقنية." },
  { id: "radio-day", date: "2026-02-13", title: "اليوم العالمي للإذاعة", type: "global", yearly: true,
    desc: "يحتفي بالإذاعة كوسيلة إعلام جماهيرية." },
  { id: "social-justice", date: "2026-02-20", title: "اليوم العالمي للعدالة الاجتماعية", type: "global", yearly: true,
    desc: "يوم أممي لتعزيز العدالة الاجتماعية." },
  { id: "mother-lang", date: "2026-02-21", title: "اليوم الدولي للغة الأم", type: "global", yearly: true,
    desc: "لتعزيز التنوع اللغوي والثقافي.", tip: "محتوى يعتزّ باللغة العربية في الهوية." },
  { id: "intl-women", date: "2026-03-08", title: "اليوم العالمي للمرأة", type: "global", yearly: true,
    desc: "يحتفي بإنجازات المرأة.", tip: "إبراز فريق العمل النسائي في المشاريع." },
  { id: "consumer-day", date: "2026-03-15", title: "اليوم العالمي لحقوق المستهلك", type: "global", yearly: true,
    desc: "للتوعية بحقوق المستهلك.", tip: "محتوى عن الشفافية والجودة وخدمة العملاء." },
  { id: "happiness-day", date: "2026-03-20", title: "اليوم الدولي للسعادة", type: "global", yearly: true,
    desc: "يوم أممي يؤكد أهمية السعادة وجودة الحياة.", tip: "مناسب لـ Jaz chocolate — «لحظات سعيدة»." },
  { id: "mother-day", date: "2026-03-21", title: "يوم الأم (عربياً)", type: "global", yearly: true,
    desc: "يُحتفل به في معظم الدول العربية.", tip: "هدايا وعروض، مناسب لـ Jaz chocolate." },
  { id: "water-day", date: "2026-03-22", title: "اليوم العالمي للمياه", type: "global", yearly: true,
    desc: "للتوعية بأهمية المياه العذبة وترشيد استهلاكها.", tip: "مناسب لمزرعة قنيف — الري الذكي والاستدامة." },
  { id: "autism-day", date: "2026-04-02", title: "اليوم العالمي للتوعية بالتوحد", type: "global", yearly: true,
    desc: "للتوعية باضطراب طيف التوحد ودعم الأسر." },
  { id: "health-day", date: "2026-04-07", title: "يوم الصحة العالمي", type: "global", yearly: true,
    desc: "ذكرى تأسيس منظمة الصحة العالمية.", tip: "مناسب لـ eat plus — التغذية الصحية." },
  { id: "creativity-day", date: "2026-04-21", title: "اليوم العالمي للإبداع والابتكار", type: "global", yearly: true,
    desc: "يحتفي بدور الإبداع في حل المشكلات والتنمية.", tip: "إبراز أعمال ڤيوليت الإبداعية." },
  { id: "earth-day", date: "2026-04-22", title: "يوم الأرض", type: "global", yearly: true,
    desc: "للتوعية بحماية البيئة.", tip: "مناسب لمزرعة قنيف." },
  { id: "book-day", date: "2026-04-23", title: "اليوم العالمي للكتاب", type: "global", yearly: true,
    desc: "يوم اليونسكو للكتاب وحقوق المؤلف." },
  { id: "ip-day", date: "2026-04-26", title: "اليوم العالمي للملكية الفكرية", type: "global", yearly: true,
    desc: "للتوعية بحماية العلامات والتصاميم وحقوق النشر.", tip: "تذكير بتسجيل العلامات التجارية للمشاريع." },
  { id: "labour-day", date: "2026-05-01", title: "يوم العمال العالمي", type: "global", yearly: true,
    desc: "يحتفي بالعمال وإنجازاتهم.", tip: "شكر فريق العمل." },
  { id: "press-day", date: "2026-05-03", title: "اليوم العالمي لحرية الصحافة", type: "global", yearly: true,
    desc: "يوم أممي لدعم الإعلام." },
  { id: "telecom-day", date: "2026-05-17", title: "اليوم العالمي للاتصالات ومجتمع المعلومات", type: "global", yearly: true,
    desc: "يحتفي بدور التقنية والإنترنت.", tip: "مناسب للمنصات الرقمية." },
  { id: "diversity-day", date: "2026-05-21", title: "اليوم العالمي للتنوع الثقافي", type: "global", yearly: true,
    desc: "لتعزيز الحوار بين الثقافات.", tip: "مناسب لـ ZL.Tours — ثقافات الوجهات." },
  { id: "no-tobacco", date: "2026-05-31", title: "اليوم العالمي لمكافحة التبغ", type: "global", yearly: true,
    desc: "للتوعية بأضرار التدخين." },
  { id: "parents-day", date: "2026-06-01", title: "اليوم العالمي للوالدين", type: "global", yearly: true,
    desc: "تكريم دور الوالدين في الأسرة." },
  { id: "env-day", date: "2026-06-05", title: "اليوم العالمي للبيئة", type: "global", yearly: true,
    desc: "أكبر منصة أممية للتوعية البيئية.", tip: "مناسب لمزرعة قنيف." },
  { id: "food-safety", date: "2026-06-07", title: "اليوم العالمي لسلامة الأغذية", type: "global", yearly: true,
    desc: "للتوعية بسلامة الغذاء من المزرعة إلى المائدة.", tip: "مناسب لـ eat plus ومزرعة قنيف وJaz chocolate." },
  { id: "oceans-day", date: "2026-06-08", title: "اليوم العالمي للمحيطات", type: "global", yearly: true,
    desc: "للتوعية بحماية البحار.", tip: "مناسب لـ ZL.Tours — وجهات البحر الأحمر." },
  { id: "blood-day", date: "2026-06-14", title: "اليوم العالمي للمتبرعين بالدم", type: "global", yearly: true,
    desc: "شكر المتبرعين وتشجيع التبرع." },
  { id: "msme-day", date: "2026-06-27", title: "اليوم العالمي للمنشآت الصغيرة والمتوسطة", type: "global", yearly: true,
    desc: "يحتفي بدور المنشآت الصغيرة في الاقتصاد." },
  { id: "chocolate-day", date: "2026-07-07", title: "اليوم العالمي للشوكولاتة", type: "global", yearly: true,
    desc: "يوم احتفالي عالمي بالشوكولاتة.", tip: "حملة رئيسية لـ Jaz chocolate — عروض وتجارب تذوّق.", note: "مناسب لـ Jaz chocolate" },
  { id: "youth-skills", date: "2026-07-15", title: "اليوم العالمي لمهارات الشباب", type: "global", yearly: true,
    desc: "لتعزيز مهارات الشباب للتوظيف وريادة الأعمال." },
  { id: "emoji-day", date: "2026-07-17", title: "اليوم العالمي للإيموجي", type: "global", yearly: true,
    desc: "يوم احتفالي على وسائل التواصل.", tip: "منشور تفاعلي خفيف على السوشال ميديا." },
  { id: "friendship-day", date: "2026-07-30", title: "اليوم الدولي للصداقة", type: "global", yearly: true,
    desc: "يوم أممي لتعزيز الصداقة.", tip: "عروض «لك ولصديقك»." },
  { id: "youth-day", date: "2026-08-12", title: "اليوم الدولي للشباب", type: "global", yearly: true,
    desc: "يحتفي بالشباب ودورهم في التنمية." },
  { id: "photo-day", date: "2026-08-19", title: "اليوم العالمي للتصوير الفوتوغرافي", type: "global", yearly: true,
    desc: "يحتفي بفن التصوير.", tip: "مسابقة تصوير للمتابعين — مناسب لـ ZL.Tours." },
  { id: "charity-day", date: "2026-09-05", title: "اليوم الدولي للعمل الخيري", type: "global", yearly: true,
    desc: "لتعزيز العمل الخيري والتطوعي." },
  { id: "literacy-day", date: "2026-09-08", title: "اليوم الدولي لمحو الأمية", type: "global", yearly: true,
    desc: "لتعزيز التعليم ومحو الأمية." },
  { id: "peace-day", date: "2026-09-21", title: "اليوم الدولي للسلام", type: "global", yearly: true,
    desc: "يوم أممي للسلام." },
  { id: "tourism-day", date: "2026-09-27", title: "اليوم العالمي للسياحة", type: "global", yearly: true,
    desc: "يحتفي بدور السياحة في الاقتصاد والتبادل الثقافي.", tip: "حملة رئيسية لـ ZL.Tours.", note: "مناسب لـ ZL.Tours" },
  { id: "heart-day", date: "2026-09-29", title: "اليوم العالمي للقلب", type: "global", yearly: true,
    desc: "للتوعية بأمراض القلب.", tip: "مناسب لـ eat plus — وجبات صحية للقلب." },
  { id: "coffee-day", date: "2026-10-01", title: "اليوم العالمي للقهوة", type: "global", yearly: true,
    desc: "يحتفي بالقهوة وثقافتها — والقهوة السعودية جزء أصيل من الهوية.", tip: "مناسب لـ Jaz chocolate (قهوة وشوكولاتة)." },
  { id: "pink-oct", date: "2026-10-01", title: "بداية أكتوبر الوردي", type: "global", yearly: true,
    desc: "شهر التوعية بسرطان الثدي.", tip: "هوية وردية مؤقتة ومحتوى توعوي." },
  { id: "teachers-day", date: "2026-10-05", title: "اليوم العالمي للمعلم", type: "global", yearly: true,
    desc: "تكريم المعلمين.", tip: "عروض خاصة للمعلمين." },
  { id: "mental-health", date: "2026-10-10", title: "اليوم العالمي للصحة النفسية", type: "global", yearly: true,
    desc: "للتوعية بالصحة النفسية وجودة الحياة.", tip: "رسالة داخلية للفريق عن التوازن." },
  { id: "food-day", date: "2026-10-16", title: "يوم الأغذية العالمي", type: "global", yearly: true,
    desc: "ذكرى تأسيس منظمة الأغذية والزراعة (فاو).", tip: "حملة مشتركة لـ eat plus ومزرعة قنيف.", note: "مناسب لـ eat plus ومزرعة قنيف" },
  { id: "kindness-day", date: "2026-11-13", title: "اليوم العالمي للُّطف", type: "global", yearly: true,
    desc: "لتشجيع أعمال اللطف.", tip: "مبادرة مجتمعية بسيطة." },
  { id: "diabetes-day", date: "2026-11-14", title: "اليوم العالمي للسكري", type: "global", yearly: true,
    desc: "للتوعية بالسكري.", tip: "مناسب لـ eat plus — خيارات قليلة السكر." },
  { id: "men-day", date: "2026-11-19", title: "اليوم العالمي للرجل", type: "global", yearly: true,
    desc: "يحتفي بإسهامات الرجل وصحته." },
  { id: "children-day", date: "2026-11-20", title: "اليوم العالمي للطفل", type: "global", yearly: true,
    desc: "ذكرى اعتماد اتفاقية حقوق الطفل.", tip: "محتوى عائلي — مناسب لـ Jaz chocolate." },
  { id: "disability-day", date: "2026-12-03", title: "اليوم الدولي للأشخاص ذوي الإعاقة", type: "global", yearly: true,
    desc: "لتعزيز حقوق ذوي الإعاقة والوصول الشامل.", tip: "مراجعة إمكانية الوصول في المواقع والتطبيقات." },
  { id: "volunteer-day", date: "2026-12-05", title: "اليوم الدولي للتطوع", type: "global", yearly: true,
    desc: "يحتفي بالمتطوعين." },
  { id: "rights-day", date: "2026-12-10", title: "يوم حقوق الإنسان", type: "global", yearly: true,
    desc: "ذكرى الإعلان العالمي لحقوق الإنسان." },
  { id: "arabic-day", date: "2026-12-18", title: "اليوم العالمي للغة العربية", type: "global", yearly: true,
    desc: "ذكرى اعتماد العربية لغةً رسمية في الأمم المتحدة.", tip: "محتوى بالخط العربي والعبارات الأصيلة." },

  // ================= مواسم تسويقية =================
  { id: "founding-sales", date: "2026-02-15", title: "موسم عروض يوم التأسيس", type: "season", yearly: true,
    desc: "أسبوع العروض المرتبطة بيوم التأسيس.", tip: "إطلاق الحملة قبل أسبوع من 22 فبراير." },
  { id: "ramadan-season", date: "2026-02-01", title: "التحضير لحملات رمضان", type: "season", approx: true,
    desc: "منتصف شعبان: تجهيز المحتوى والإعلانات الرمضانية.", tip: "حجز الميزانيات الإعلانية مبكراً لارتفاع التكلفة." },
  { id: "summer-season", date: "2026-06-21", title: "بداية موسم الصيف والسفر", type: "season", yearly: true,
    desc: "ذروة السفر والإجازات المدرسية.", tip: "حملة رئيسية لـ ZL.Tours." },
  { id: "jeddah-season", date: "2026-06-01", title: "موسم جدة (تقريبي)", type: "season", approx: true,
    desc: "فعاليات ترفيهية وسياحية في جدة.", tip: "مناسب لـ ZL.Tours." },
  { id: "back-to-school", date: "2026-08-23", title: "العودة للمدارس", type: "season", approx: true,
    desc: "بداية العام الدراسي — موسم تسوّق للأسر.", tip: "عروض الأسرة والوجبات المدرسية — eat plus." },
  { id: "national-sales", date: "2026-09-15", title: "موسم عروض اليوم الوطني", type: "season", yearly: true,
    desc: "عروض اليوم الوطني (تبدأ عادة قبل 23 سبتمبر بأسبوع).", tip: "التزام ضوابط استخدام الهوية الوطنية في الإعلان." },
  { id: "riyadh-season", date: "2026-10-15", title: "انطلاق موسم الرياض (تقريبي)", type: "season", approx: true,
    desc: "أكبر موسم ترفيهي في المنطقة.", tip: "مناسب لـ ZL.Tours وHomera (طلب السكن)." },
  { id: "singles-day", date: "2026-11-11", title: "تخفيضات 11.11", type: "season", yearly: true,
    desc: "أكبر يوم تسوّق إلكتروني عالمياً.", tip: "عروض محدودة 24 ساعة." },
  { id: "white-friday", date: "2026-11-27", title: "الجمعة البيضاء (Black Friday)", type: "season",
    desc: "آخر جمعة من نوفمبر — ذروة التخفيضات.", tip: "تجهيز الإعلانات قبلها بأسبوعين." },
  { id: "cyber-monday", date: "2026-11-30", title: "Cyber Monday", type: "season",
    desc: "يوم تخفيضات التسوّق الإلكتروني بعد الجمعة البيضاء." },
  { id: "twelve-twelve", date: "2026-12-12", title: "تخفيضات 12.12", type: "season", yearly: true,
    desc: "موسم تخفيضات نهاية العام." },
  { id: "year-end", date: "2026-12-20", title: "عروض نهاية العام", type: "season", yearly: true,
    desc: "تصفية المخزون واستعدادات العام الجديد." },

  // ================= مؤتمرات ومعارض (المواعيد تقريبية — تأكّد من الموقع الرسمي) =================
  { id: "gulfood", date: "2026-01-26", title: "Gulfood — دبي", type: "conference", approx: true,
    desc: "أكبر معرض للأغذية والمشروبات في المنطقة.", tip: "مناسب لـ eat plus وJaz chocolate ومزرعة قنيف." },
  { id: "leap", date: "2026-02-09", title: "مؤتمر LEAP — الرياض", type: "conference", approx: true,
    desc: "من أكبر مؤتمرات التقنية في العالم.", tip: "فرص شراكات تقنية للمنصات الرقمية." },
  { id: "atm", date: "2026-05-04", title: "سوق السفر العربي ATM — دبي", type: "conference", approx: true,
    desc: "المعرض الأبرز لصناعة السفر والسياحة.", tip: "مناسب لـ ZL.Tours." },
  { id: "saudi-food-show", date: "2026-05-11", title: "معرض الغذاء السعودي — الرياض", type: "conference", approx: true,
    desc: "معرض لقطاع الأغذية والمشروبات في المملكة.", tip: "مناسب لـ eat plus ومزرعة قنيف." },
  { id: "fhs", date: "2026-04-28", title: "قمة مستقبل الضيافة FHS — الرياض", type: "conference", approx: true,
    desc: "قمة الاستثمار في الضيافة والسياحة.", tip: "مناسب لـ ZL.Tours." },
  { id: "riyadh-book", date: "2026-10-02", title: "معرض الرياض الدولي للكتاب", type: "conference", approx: true,
    desc: "أكبر معرض للكتاب في المملكة." },
  { id: "gitex", date: "2026-10-12", title: "GITEX Global — دبي", type: "conference", approx: true,
    desc: "معرض التقنية الأكبر في الشرق الأوسط." },
  { id: "fii", date: "2026-10-27", title: "مبادرة مستقبل الاستثمار FII — الرياض", type: "conference", approx: true,
    desc: "منتدى الاستثمار العالمي في الرياض.", tip: "فرصة لعرض مشاريع سيم برايم الاستثمارية." },
  { id: "biban", date: "2026-11-09", title: "ملتقى بيبان — الرياض", type: "conference", approx: true,
    desc: "ملتقى ريادة الأعمال والمنشآت الصغيرة والمتوسطة." },
  { id: "cityscape", date: "2026-11-16", title: "Cityscape Global — الرياض", type: "conference", approx: true,
    desc: "أكبر معرض عقاري في المنطقة.", tip: "حملة رئيسية لـ Homera.", note: "مناسب لـ Homera" },
  { id: "blackhat-mea", date: "2026-12-01", title: "Black Hat MEA — الرياض", type: "conference", approx: true,
    desc: "مؤتمر الأمن السيبراني." },
];

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// يدمج الفعاليات المحفوظة مع الافتراضية (حتى تظهر الأيام الجديدة لمن حفظ روزنامته سابقاً)
// stored: { events: [], removed: [ids] } أو null
export function mergeEvents(stored) {
  const list = Array.isArray(stored?.events) ? stored.events : [];
  const removed = new Set(stored?.removed || []);
  const have = new Set(list.map((e) => e.id));
  const seeds = SEED_EVENTS.filter((e) => !have.has(e.id) && !removed.has(e.id));
  // الفعاليات المحفوظة قديماً تأخذ الوصف من الافتراضي إن لم يكن لديها
  const enriched = list.map((e) => {
    const s = SEED_EVENTS.find((x) => x.id === e.id);
    return s ? { ...s, ...e, desc: e.desc || s.desc, tip: e.tip || s.tip, greet: e.greet || s.greet } : e;
  });
  return [...enriched, ...seeds];
}

// تهنئة اليوم (إن وُجدت): أول مناسبة لها greet تغطي تاريخ اليوم
export function greetingFor(events, day = new Date()) {
  const today = keyOf(day);
  for (const e of events || []) {
    if (!e.greet || !e.date) continue;
    const span = Math.max(1, Number(e.greet.days) || 1);
    const base = e.yearly ? `${day.getFullYear()}-${e.date.slice(5)}` : e.date;
    const start = new Date(base);
    if (isNaN(start)) continue;
    for (let i = 0; i < span; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (keyOf(d) === today) return { ...e.greet, id: `${e.id}-${base}`, event: e };
    }
  }
  return null;
}
