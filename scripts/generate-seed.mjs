// أداة اختيارية: تولّد supabase/seed.sql من lib/seed-data.js
// الاستخدام: npm run gen:seed
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SEED_TASKS } from "../lib/seed-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? "").replace(/'/g, "''");
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

const cols =
  "order_index, activity, project, task, priority, status, assigned_to, due_date, waiting_on, blocker, approval_status, notes, health";

const values = SEED_TASKS.map((t, i) => {
  const dd = isDate(t.due_date) ? `'${t.due_date}'` : "null";
  return `(${i}, '${esc(t.activity)}', '${esc(t.project)}', '${esc(t.task)}', '${esc(
    t.priority || "High"
  )}', '${esc(t.status || "Not Started")}', '${esc(t.assigned_to)}', ${dd}, '${esc(
    t.waiting_on
  )}', '${esc(t.blocker)}', '${esc(t.approval_status)}', '${esc(t.notes)}', '${esc(
    t.health || "On Track"
  )}')`;
}).join(",\n");

const sql = `-- بيانات المهام الأولية (${SEED_TASKS.length} مهمة) — مولّدة تلقائياً
truncate table public.tasks;
insert into public.tasks (${cols}) values
${values};
`;

writeFileSync(join(__dirname, "..", "supabase", "seed.sql"), sql, "utf8");
console.log(`✔ تم توليد supabase/seed.sql بعدد ${SEED_TASKS.length} مهمة`);
