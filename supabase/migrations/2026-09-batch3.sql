-- =====================================================================
--  الدفعة 3: ربط المهام بمحضر الاجتماع
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run (بعد الدفعتين 1 و2)
--  آمن للتكرار، ولا يحذف أي بيانات.
--  (الروزنامة السنوية تُحفظ في app_settings ولا تحتاج جدولاً جديداً)
-- =====================================================================
alter table public.tasks add column if not exists meeting_id text default '';
create index if not exists tasks_meeting_idx on public.tasks (meeting_id);
