-- =====================================================================
--  الحضور التلقائي اليومي (9:00 ص)
--  ينشئ جدول جلسات الدخول user_sessions إن لم يكن موجوداً، حتى تُسجَّل فيه
--  المهمة المجدولة /api/cron/daily-attendance حضور الموظفين يومياً.
--  آمن للتكرار ولا يحذف أي بيانات. إذا كان 2026-11-activity.sql مطبّقاً فلا يغيّر شيئاً.
-- =====================================================================
create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_email    text        default '',
  user_name     text        default '',
  started_at    timestamptz default now(),
  last_seen_at  timestamptz default now(),
  ended_at      timestamptz,
  device        text        default ''
);
create index if not exists user_sessions_started_idx on public.user_sessions (started_at desc);
create index if not exists user_sessions_user_idx    on public.user_sessions (user_email, started_at desc);
alter table public.user_sessions enable row level security;

do $mig$
begin
  -- قاعدة بلا ملفات الحماية (الجداول مفتوحة): قراءة مفتوحة مثل بقية الجداول حتى تظهر في «سجل الأنشطة»
  -- (الكتابة من المهمة المجدولة بمفتاح الخدمة). إن كانت الحماية مطبّقة فسياسة القراءة من ملف الأنشطة.
  if to_regprocedure('public.is_member()') is null
     and not exists (select 1 from pg_policies where tablename = 'user_sessions') then
    execute 'create policy user_sessions_open_read on public.user_sessions for select using (true)';
  end if;
end
$mig$;
