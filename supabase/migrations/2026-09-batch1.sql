-- =====================================================================
--  الدفعة 1: دورة العمل والاعتماد + المخرجات + المرفقات + مزرعة قنيف
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run
--  آمن للتكرار، ولا يحذف أي بيانات.
-- =====================================================================

-- ---------- المهام: المخرج، نسبة الإنجاز، التعليق/التأخير ----------
alter table public.tasks add column if not exists deliverable  text        default '';
alter table public.tasks add column if not exists progress     int         default 0;
alter table public.tasks add column if not exists on_hold      boolean     default false;
alter table public.tasks add column if not exists resolve_date date;                 -- موعد المعالجة

-- ---------- المهام: جاهزية ڤيوليت منفصلة عن اعتماد سيم ----------
alter table public.tasks add column if not exists ready_at     timestamptz;          -- متى سُلِّمت للمراجعة
alter table public.tasks add column if not exists ready_by     text        default '';
alter table public.tasks add column if not exists reviewed_at  timestamptz;          -- آخر قرار من سيم
alter table public.tasks add column if not exists reviewed_by  text        default '';
alter table public.tasks add column if not exists review_note  text        default '';
alter table public.tasks add column if not exists reviews      jsonb       default '[]'::jsonb; -- سجل القرارات

-- ---------- المشاريع: قائمة المخرجات ----------
alter table public.projects add column if not exists deliverables jsonb default '[]'::jsonb;

-- ---------- الملفات: ربط المرفق بمهمة ----------
alter table public.files add column if not exists task_id text default '';
create index if not exists files_task_idx on public.files (task_id);

-- ---------- تحويل الحالات القديمة إلى دورة العمل الجديدة ----------
-- «مكتملة» ← «معتمدة»
update public.tasks set status = 'Approved', progress = 100 where status = 'Completed';
-- «معلّقة» ← «قيد التنفيذ» + علامة تعليق
update public.tasks set status = 'In Progress', on_hold = true where status = 'On Hold';

-- ---------- مزرعة قنيف: مشروع مستقل ----------
insert into public.projects (order_index, name, description, color, status, managers, clients, members, deliverables)
select 99, 'مزرعة قنيف', 'مشروع مزرعة قنيف', '#65a30d', 'نشط', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.projects where name = 'مزرعة قنيف');
