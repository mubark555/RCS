-- =====================================================================
--  مهام Jaz chocolate ومزرعة قنيف من ملف Master Tracker (45 مهمة)
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run
--  آمن للتكرار: يضيف فقط المهام غير الموجودة (نفس المشروع + نفس نص المهمة)،
--  ولا يعدّل أو يحذف أي مهمة موجودة.
-- =====================================================================

with src (n, activity, project, task, priority, status, progress, on_hold, assigned_to, due_date, waiting_on, blocker, approval_status, notes, health) as (
values
  (0, 'Art Direction', 'Jaz chocolate', 'المتطلبات العامة للاعمال الفنية (اسم اللوحة - القصة - التوقيع) وبطاقة المعلومات', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-06-15', 'ڤيوليت', 'جاري التعديل على المحتوى مع كاتبة المحتوى فاطمة', 'N/A', '', 'Completed'),
  (1, 'Art Direction', 'Jaz chocolate', 'الدفعات والتسعير وعقود الفنانين', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-06-10', 'سيم برايم', '', 'Aprproved', 'توحيد سعر جميع الاعمال 2000 ريال', 'Completed'),
  (2, 'Artwork', 'Jaz chocolate', 'تجهيز الأعمال الفنية', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-06-23', 'ڤيوليت', 'جاري اضافة تعديلات مم ادى الى تاخير العمل', 'Pending Review', '', 'Completed'),
  (3, 'Packaging', 'Jaz chocolate', 'تصميم عبوة الهدايا 200 جرام', 'High', 'Approved', 100, false, 'Enas(Designer)', '2026-06-15', 'ڤيوليت', 'تم الرفض من قبل مديرة المشروع للتعديل', 'Pending Review', '', 'Completed'),
  (4, 'Packaging', 'Jaz chocolate', 'تغليف الـ Dessert', 'High', 'In Progress', 0, true, 'Enas (Designer)', '2026-06-15', 'ڤيوليت', '', 'Reveision needed', '', 'Delayed'),
  (5, 'Profile & Branding', 'Jaz chocolate', 'العرض الحكومي (Presentation)', 'High', 'Approved', 100, false, 'Ahmad (Designer)', '2026-06-01', 'ڤيوليت', '', 'Pending Review', '', 'Completed'),
  (6, 'Packaging', 'Jaz chocolate', 'تجهيز واستلام القيم الغذائية للمنتج', 'High', 'Approved', 100, false, 'Wajd (PM)', null, 'سيم برايم', 'بانتظار الدكتورة منال', 'N/A', '', 'Completed'),
  (7, 'Social Media Plan', 'Jaz chocolate', 'انشاء الحسابات', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-06-08', 'ڤيوليت', '', 'Aprproved', 'تحتاج تعديلات', 'Completed'),
  (8, 'Branding & Packaging', 'Jaz chocolate', 'اعداد ملف باسم كل مجموعة', 'High', 'In Progress', 0, true, 'Wajd (PM)', null, 'ڤيوليت', '', 'Pending Review', '', 'On Track'),
  (9, 'Website', 'Jaz chocolate', 'منصة جاز الالكترونية', 'High', 'In Progress', 0, false, 'Mubarak(IT)', '2026-08-01', 'ڤيوليت', '', 'N/A', '', 'Delayed'),
  (10, 'Marketing', 'Jaz chocolate', 'اعداد الاستراتيجية و الخطة التسويقية', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-07-04', 'ڤيوليت', '', 'N/A', '', 'Completed'),
  (11, 'Branding', 'Jaz chocolate', 'قصة جاز', 'High', 'Approved', 100, false, 'Fatimah(Content)', '2026-06-13', 'سيم برايم', '', 'Pending Review', '', 'Completed'),
  (12, 'Marketing', 'Jaz chocolate', 'سكربت الفيلم التعريفي للعلامة التجارية', 'High', 'Approved', 100, false, 'Fatimah(Content)', '2026-07-25', 'ڤيوليت', 'يوجد ملاحظات من قبل مديرة المشروع', 'Pending Review', '', 'Completed'),
  (13, 'Marketing', 'Jaz chocolate', 'كتابة سيناريوالفيلم الوثائقي للمصنع', 'High', 'Approved', 100, false, 'Fatimah(Content)', '2026-07-30', 'CONTENT', 'تم الرفض من قبل مديرة المشروع', 'Reveision needed', '', 'Completed'),
  (14, 'Operation', 'Jaz chocolate', 'زيارة المصنع من قبل مديرة المشروع', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-08-19', 'ڤيوليت', '', 'Aprproved', '', 'Completed'),
  (15, 'Marketing', 'Jaz chocolate', 'تصوير الفيلم التعريفي + الوثائقي داخل المصنع', 'High', 'Approved', 100, false, 'Photography Team', '2026-09-17', 'ڤيوليت', '', '', '', 'Completed'),
  (16, 'Marketing', 'Jaz chocolate', 'انتاج الفيلم التعريفي + الوثائقي', 'High', 'In Progress', 0, false, 'Production Team', '2026-09-20', 'ڤيوليت', '', '', '', 'On Track'),
  (17, 'Marketing', 'Jaz chocolate', 'جلسة تصوير الشيف جورج', 'High', 'Approved', 100, false, 'Photography Team', '2026-09-17', 'ڤيوليت', '', '', '', 'Completed'),
  (18, 'Marketing', 'Jaz chocolate', 'خطة محتوى جاز', 'High', 'In Progress', 0, false, 'Wajd (PM)', '2026-10-08', 'ڤيوليت', '', '', '', 'Delayed'),
  (19, 'Marketing', 'Jaz chocolate', 'بانر المصنع و البحث عن خامات اكريلك للجدارية', 'High', 'In Progress', 0, false, 'Wajd (PM)', '2026-10-08', 'ڤيوليت', '', '', '', 'Delayed'),
  (20, 'Operation', 'Jaz chocolate', 'انشطة تدريب للشغوفين بصناعة الشوكولاتة', 'Low', 'Not Started', 0, false, '', '2026-01-12', 'سيم برايم', '', '', '', 'Delayed'),
  (21, 'Operation', 'Jaz chocolate', 'برزنتيشن للموزعين', 'High', 'In Progress', 0, false, 'Designer(Nader)', '2026-09-08', 'ڤيوليت', '', '', '', 'Delayed'),
  (22, 'Operation', 'Jaz chocolate', 'المواد الدعائية وشركات الموردين', 'High', 'Not Started', 0, false, '', null, 'سيم برايم', '', '', '', 'On Track'),
  (23, 'Operation', 'Jaz chocolate', 'تنسيق افكار جاز لمطار جازان الدولي', 'Medium', 'Approved', 100, false, 'Wajd(PM)', '2026-12-12', 'ڤيوليت', '', '', '', 'Completed'),
  (24, 'Marketing', 'Jaz chocolate', 'التنسيق لمشاركة الشيف جورج في الأنشطة الإعلامية والترويجية والاعلامية', 'Medium', 'Approved', 100, false, 'Wajd (PM)', '2026-09-10', 'ڤيوليت', '', '', '', 'Completed'),
  (25, 'Marketing', 'Jaz chocolate', 'ايفنت توقيع اول دفعة انتاج في اليوم الوطني ايفنت', 'Medium', 'In Progress', 0, false, 'Wajd (PM)', '2026-08-29', 'ڤيوليت', '', '', '', 'On Track'),
  (26, 'Profile & Branding', 'Jaz chocolate', 'الهوية البصرية لـ حاني', 'Low', 'In Progress', 0, true, 'Ahmad (Designer)', null, 'سيم برايم', '', '', '', 'On Track'),
  (27, 'Profile & Branding', 'Jaz chocolate', 'الهوية البصرية لـ شهدان', 'Low', 'In Progress', 0, true, 'AHmad (Designer)', null, 'سيم برايم', '', '', '', 'On Track'),
  (28, 'Profile & Branding', 'Jaz chocolate', 'الهوية البصرية لـ حوايج', 'Low', 'In Progress', 0, true, 'AHmad (Designer)', null, 'سيم برايم', '', '', '', 'On Track'),
  (29, 'Branding', 'Jaz chocolate', 'تسليم واستلام الأعمال الفنية لمقر الشركة', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-07-02', 'ڤيوليت', '', '', '', 'Completed'),
  (30, 'Branding', 'Jaz chocolate', 'انشاء الحسابات الإعلانية لجاز', 'High', 'In Progress', 0, false, 'Wajd (PM)', '2026-07-11', 'سيم برايم', 'تحت التعديل', 'Pending Review', '', 'Delayed'),
  (31, 'Advertising Plan', 'Jaz chocolate', 'الحسابات الاعلانية', 'High', 'In Progress', 0, false, 'Asem(MediaPayer)', '2026-07-15', 'ڤيوليت', '', '', '', 'Delayed'),
  (32, 'Branding', 'Jaz chocolate', 'تسليم أعمال جاز للمطبعة', 'High', 'Approved', 100, false, 'Wajd (PM)', '2026-07-15', 'ڤيوليت', '', '', '', 'Completed'),
  (33, 'operation', 'Jaz chocolate', 'برزنتيشن الموردين', 'High', 'Approved', 100, false, 'Nader(Designer)', '2026-08-05', 'ڤيوليت', '', '', '', 'Completed'),
  (34, 'operation', 'Jaz chocolate', 'التنسيق مع موردين المواد الدعائية', 'Medium', 'Not Started', 0, false, 'Wajd(PM)', '2026-08-06', 'ڤيوليت', '', '', '', 'Delayed'),
  (35, 'Website Development', 'Jaz chocolate', 'محتوى الموقع الاكتروني لجاز التسويقي', 'High', 'Approved', 100, false, 'Marketing and Content', '2026-08-29', 'ڤيوليت', '', '', '', 'Completed'),
  (36, 'Branding', 'Jaz chocolate', 'افكار الاكريلك لجدارية المصنع', 'High', 'In Progress', 0, false, 'Wajd(PM)(Nora)', '2026-09-02', 'ڤيوليت', '', '', '', 'Delayed'),
  (37, 'Marketing', 'Jaz chocolate', 'ملف ارشادي وحملة تذوق مع فيديو تعريفي', 'Medium', 'Not Started', 0, false, '', null, '', '', '', '', 'On Track'),
  (38, 'Branding', 'Jaz chocolate', 'تعديل التصاميم 30 ج الى 20ج', 'High', 'In Progress', 0, false, '', null, '', '', '', '', 'On Track'),
  (39, 'Marketing', 'Jaz chocolate', 'معرض الشوكولاتة والقهوة في جدة - اكتوبر', 'Medium', 'Not Started', 0, false, '', null, '', '', '', '', 'On Track'),
  (40, 'operation', 'مزرعة قنيف', 'اجتماع انطلاق المشروع وتحديد نطاق العمل', 'High', 'Not Started', 0, false, 'Vulet', '2026-09-21', '', '', '', '', 'On Track'),
  (41, 'Branding', 'مزرعة قنيف', 'مراجعة الهوية البصرية الحالية للمشروع', 'High', 'Not Started', 0, false, 'Nora(PM)', null, '', '', '', '', 'On Track'),
  (42, 'Marketing', 'مزرعة قنيف', 'اعداد الاستراتيجية التسويقية للمشروع', 'High', 'In Progress', 0, false, 'Nora(PM)', '2026-09-28', '', '', '', '', 'On Track'),
  (43, 'Marketing', 'مزرعة قنيف', 'تصوير لقطات جديدة للمزرعة والتجارب', 'High', 'Not Started', 0, false, 'Photography Team', '2026-09-27', '', '', '', '', 'On Track'),
  (44, 'Marketing', 'مزرعة قنيف', 'تصوير النزل الريفية والاكواخ', 'High', 'Not Started', 0, false, 'Photography Team', '2026-09-27', '', '', '', '', 'On Track')
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
