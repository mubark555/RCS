// قاعدة ترتيب الملفات في Google Drive (نفسها للمحاكاة وللربط الحقيقي لاحقاً):
//   <المجلد الرئيسي> / <المشروع> / <التصنيف> / الملف
//   <المجلد الرئيسي> / <المشروع> / المهام / <اسم المهمة> / الملف

export const DRIVE_CATEGORIES = ["عقود", "تصاميم", "عروض", "تقارير", "فواتير", "محاضر", "تسجيلات", "أخرى"];
export const TASKS_FOLDER = "المهام";
export const FINANCE_CATEGORIES = ["فواتير"];

// أسماء المجلدات لا تقبل «/» في Drive (نستبدلها حتى لا تنكسر المسارات)
const clean = (s) => String(s || "").replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "بدون اسم";

// مسار المجلد الذي يُرفع إليه الملف
export function drivePathFor({ project, category, task }) {
  const base = [clean(project || "عام")];
  if (task) return [...base, TASKS_FOLDER, clean(task)];
  return [...base, clean(category || "أخرى")];
}
