-- =====================================================================
--  الدفعة 4: دورة حياة الاجتماع (إنهاء → محضر → اعتماد وإرسال) + بيانات الفريق
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run (بعد الدفعات 1–3)
--  آمن للتكرار، ولا يحذف أي بيانات.
--  (الصلاحيات والإجازات وسلاسل اعتماد المشاريع تُحفظ في app_settings ولا تحتاج جداول جديدة)
-- =====================================================================

-- ---------- الاجتماعات ----------
alter table public.meetings add column if not exists present       jsonb       default '[]'::jsonb; -- الحضور الفعلي
alter table public.meetings add column if not exists created_by    text        default '';
alter table public.meetings add column if not exists ended_at      timestamptz;
alter table public.meetings add column if not exists ended_by      text        default '';
alter table public.meetings add column if not exists approved_at   timestamptz;
alter table public.meetings add column if not exists approved_by   text        default '';
alter table public.meetings add column if not exists emailed_at    timestamptz;
alter table public.meetings add column if not exists emailed_count int         default 0;
alter table public.meetings add column if not exists email_error   text        default '';

-- ---------- المستخدمون ----------
alter table public.users add column if not exists status     text default 'active'; -- active | suspended
alter table public.users add column if not exists department text default '';
alter table public.users add column if not exists reports_to text default '';
alter table public.users add column if not exists start_date date;
alter table public.users add column if not exists notes      text default '';
