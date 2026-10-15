-- =====================================================================
--  مهام eat plus من ملف Master Tracker (7 مهام)
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run
--  آمن للتكرار: يضيف فقط المهام غير الموجودة (نفس المشروع + نفس نص المهمة)،
--  ولا يعدّل أو يحذف أي مهمة موجودة.
-- =====================================================================

with src (n, activity, project, task, priority, status, progress, on_hold, assigned_to, due_date, waiting_on, blocker, approval_status, notes, health) as (
values
  (0, 'Advertising Plan', 'eat plus', 'اعداد ملف الفئات المستهدفة لمزودين خدمات التطبيق داتا الحملات الاعلانية', 'Medium', 'Approved', 100, false, 'Wajd (PM)', null, 'ڤيوليت', '', 'N/A', '', 'Completed'),
  (1, 'Marketing', 'eat plus', 'تفعيل الاستراتيجية التسويقية من الشركة المطورة للمنصة ومراجعتها', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-07-06', 'ڤيوليت', '', '', '', 'Completed'),
  (2, 'Marketing', 'eat plus', 'تطوير الاستراتجية والخطة التسويقية', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-07-16', 'ڤيوليت', '', 'Pending Review', '', 'Completed'),
  (3, 'Advertising Plan', 'eat plus', 'خطة اعلانات', 'High', 'In Progress', 0, false, 'Raed(Content Writer)', '2026-08-10', '', '', '', '', 'Delayed'),
  (4, 'Developments & Marketing', 'eat plus', 'خطة تطوير الموقع الالكتروني + التطبيق', 'High', 'Approved', 100, false, 'Nora(Marketing Specialist)', '2026-08-06', '', '', '', '', 'Completed'),
  (5, 'operation', 'eat plus', 'دليل المستخدم + فكررة المستخدم + الفورم', 'High', 'In Progress', 0, false, 'Wajd(PM)', '2026-08-10', '', '', '', '', 'Delayed'),
  (6, 'operation', 'eat plus', 'هيكلة الداتا + شركات التوصيل', 'High', 'Approved', 100, false, 'Nora(Marketing Specialist)', '2026-08-09', '', '', '', '', 'Completed')
),
base as (select coalesce(max(order_index), 0) as m from public.tasks)
insert into public.tasks (order_index, activity, project, task, priority, status, progress, on_hold, assigned_to, due_date, waiting_on, blocker, approval_status, notes, health)
select base.m + 1 + s.n, s.activity, s.project, s.task, s.priority, s.status, s.progress, s.on_hold, s.assigned_to, s.due_date::date, s.waiting_on, s.blocker, s.approval_status, s.notes, s.health
from src s, base
where not exists (
  select 1 from public.tasks t
  where t.project = s.project
    and regexp_replace(trim(t.task), '\s+', ' ', 'g') = s.task
)
returning project, task;
