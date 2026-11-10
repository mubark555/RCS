-- =====================================================================
--  الدفعة 2: نطاق العمل للمشروع + فترة ومصدر المؤشرات + مرفقات المالية
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run (بعد ملف الدفعة 1)
--  آمن للتكرار، ولا يحذف أي بيانات.
-- =====================================================================

-- المشاريع: نطاق العمل
alter table public.projects add column if not exists scope text default '';

-- المؤشرات: الفترة ومصدر القياس
alter table public.kpis add column if not exists period_type text default 'quarter'; -- month | quarter | year
alter table public.kpis add column if not exists period      text default '';        -- تسمية الفترة (مثال: الربع الثالث 2026)
alter table public.kpis add column if not exists source      text default '';        -- مصدر القياس

-- الملفات: ربط عام بسجل (invoice:<id> مرفق فاتورة، payment:<id> إيصال سداد)
alter table public.files add column if not exists ref text default '';
create index if not exists files_ref_idx on public.files (ref);
