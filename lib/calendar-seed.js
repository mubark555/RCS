// الفعاليات الافتراضية للروزنامة السنوية.
// yearly: تتكرر بنفس اليوم كل سنة (ميلادية ثابتة).
// approx: تاريخ تقريبي (مناسبات هجرية تُحدَّد برؤية الهلال، أو مؤتمرات يتغيّر موعدها سنوياً) — راجِعها قبل الاعتماد عليها.
export const EVENT_TYPES = {
  national: { ar: "مناسبة وطنية", color: "#16a34a" },
  religious: { ar: "مناسبة دينية", color: "#0d9488" },
  global: { ar: "يوم عالمي", color: "#2563eb" },
  season: { ar: "موسم تسويقي", color: "#db2777" },
  conference: { ar: "مؤتمر / معرض", color: "#7c3aed" },
  internal: { ar: "فعالية داخلية", color: "#c88a2e" },
};

export const SEED_EVENTS = [
  // ---- وطنية (ثابتة) ----
  { id: "sa-founding", date: "2026-02-22", title: "يوم التأسيس السعودي", type: "national", yearly: true },
  { id: "sa-flag", date: "2026-03-11", title: "يوم العلم السعودي", type: "national", yearly: true },
  { id: "sa-national", date: "2026-09-23", title: "اليوم الوطني السعودي", type: "national", yearly: true },

  // ---- دينية (هجرية — تقريبية لعام 2026) ----
  { id: "ramadan-1447", date: "2026-02-18", title: "بداية شهر رمضان 1447", type: "religious", approx: true },
  { id: "fitr-1447", date: "2026-03-20", title: "عيد الفطر 1447", type: "religious", approx: true },
  { id: "arafah-1447", date: "2026-05-26", title: "يوم عرفة 1447", type: "religious", approx: true },
  { id: "adha-1447", date: "2026-05-27", title: "عيد الأضحى 1447", type: "religious", approx: true },
  { id: "hijri-1448", date: "2026-06-16", title: "رأس السنة الهجرية 1448", type: "religious", approx: true },

  // ---- أيام عالمية (ثابتة) ----
  { id: "intl-women", date: "2026-03-08", title: "اليوم العالمي للمرأة", type: "global", yearly: true },
  { id: "mother-day", date: "2026-03-21", title: "يوم الأم (عربياً)", type: "global", yearly: true },
  { id: "earth-day", date: "2026-04-22", title: "يوم الأرض", type: "global", yearly: true },
  { id: "env-day", date: "2026-06-05", title: "اليوم العالمي للبيئة", type: "global", yearly: true },
  { id: "chocolate-day", date: "2026-07-07", title: "اليوم العالمي للشوكولاتة", type: "global", yearly: true, note: "مناسب لـ Jaz chocolate" },
  { id: "tourism-day", date: "2026-09-27", title: "اليوم العالمي للسياحة", type: "global", yearly: true, note: "مناسب لـ ZL.Tours" },
  { id: "coffee-day", date: "2026-10-01", title: "اليوم العالمي للقهوة", type: "global", yearly: true },
  { id: "food-day", date: "2026-10-16", title: "يوم الأغذية العالمي", type: "global", yearly: true, note: "مناسب لـ eat plus ومزرعة قنيف" },
  { id: "arabic-day", date: "2026-12-18", title: "اليوم العالمي للغة العربية", type: "global", yearly: true },

  // ---- مواسم تسويقية ----
  { id: "singles-day", date: "2026-11-11", title: "تخفيضات 11.11", type: "season", yearly: true },
  { id: "white-friday", date: "2026-11-27", title: "الجمعة البيضاء (Black Friday)", type: "season" },
  { id: "riyadh-season", date: "2026-10-15", title: "انطلاق موسم الرياض (تقريبي)", type: "season", approx: true },

  // ---- مؤتمرات ومعارض (المواعيد تقريبية — تأكّد من الموقع الرسمي) ----
  { id: "leap", date: "2026-02-09", title: "مؤتمر LEAP — الرياض", type: "conference", approx: true },
  { id: "atm", date: "2026-05-04", title: "سوق السفر العربي ATM — دبي", type: "conference", approx: true },
  { id: "gitex", date: "2026-10-12", title: "GITEX Global — دبي", type: "conference", approx: true },
  { id: "fii", date: "2026-10-27", title: "مبادرة مستقبل الاستثمار FII — الرياض", type: "conference", approx: true },
  { id: "cityscape", date: "2026-11-16", title: "Cityscape Global — الرياض", type: "conference", approx: true, note: "مناسب لـ Homera" },
];
