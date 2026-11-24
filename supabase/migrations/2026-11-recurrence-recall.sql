-- =====================================================================
--  تكرار الاجتماعات + سحب المهمة للتعديل
--  آمن للتكرار، ولا يحذف أي بيانات (إضافات فقط).
-- =====================================================================
-- تكرار الاجتماعات: كل موعد صف مستقل يجمعها series_id
alter table public.meetings add column if not exists action_items   jsonb default '[]'::jsonb;
alter table public.meetings add column if not exists series_id      text  default null;
alter table public.meetings add column if not exists recurrence     text  default 'none';  -- none/daily/weekdays/weekly/biweekly/monthly
alter table public.meetings add column if not exists recurrence_end jsonb default null;    -- {endType, count, until}
create index if not exists meetings_series_idx on public.meetings (series_id);

-- صاحب المهمة (من أنشأها) — يقدر يسحبها لعنده للتعديل بعد إرسالها
-- (بدون هذا العمود يُعرف صاحب المهمة من أول حركة «created» في سجل القرارات)
alter table public.tasks add column if not exists created_by text default '';
