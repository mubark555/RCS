-- =====================================================================
--  سجل الأنشطة المتقدّم: الدخول والخروج + تفاصيل التعديلات
--  شغّله بعد 2026-11-security.sql. آمن للتكرار، ولا يحذف أي بيانات (إضافات فقط).
-- =====================================================================

-- ---------- أعمدة إضافية لسجل الأنشطة ----------
alter table public.activity add column if not exists actor_email text  default '';
alter table public.activity add column if not exists entity_id   text  default '';
alter table public.activity add column if not exists project     text  default '';
alter table public.activity add column if not exists details     jsonb default '{}'::jsonb; -- { changes: [{field,label,from,to}] }
create index if not exists activity_actor_idx on public.activity (actor, created_at desc);

-- هوية المنفّذ ووقت التسجيل يحددهما الخادم — لا يمكن تسجيل نشاط باسم شخص آخر
create or replace function public.activity_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_name  text;
begin
  new.created_at := now();
  if v_email <> '' then
    select u.name into v_name from public.users u where lower(trim(u.email)) = v_email limit 1;
    new.actor_email := v_email;
    if v_name is not null then new.actor := v_name; end if;
  end if;
  return new;
end $$;

drop trigger if exists activity_stamp on public.activity;
create trigger activity_stamp before insert on public.activity
  for each row execute function public.activity_stamp();

-- السجل للإضافة فقط: لا تعديل ولا حذف (حتى لا يُمسح أثر أي عملية)
create or replace function public.activity_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'سجل الأنشطة للإضافة فقط — لا يمكن تعديله أو حذفه';
end $$;

drop trigger if exists activity_append_only on public.activity;
create trigger activity_append_only before update or delete on public.activity
  for each row execute function public.activity_append_only();

-- ---------- جلسات الدخول والخروج ----------
create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_email    text        default '',
  user_name     text        default '',
  started_at    timestamptz default now(),   -- وقت الدخول
  last_seen_at  timestamptz default now(),   -- آخر نشاط (نبض كل دقيقة أثناء الاستخدام)
  ended_at      timestamptz,                 -- وقت تسجيل الخروج الصريح
  device        text        default ''
);
create index if not exists user_sessions_started_idx on public.user_sessions (started_at desc);
create index if not exists user_sessions_user_idx    on public.user_sessions (user_email, started_at desc);

alter table public.user_sessions enable row level security;
revoke all on public.user_sessions from anon;
-- القراءة للأعضاء (صفحة السجل محكومة بصلاحية «سجل الأنشطة»)؛ الكتابة فقط عبر الدوال أدناه
drop policy if exists user_sessions_read on public.user_sessions;
create policy user_sessions_read on public.user_sessions
  for select to authenticated using (public.is_member());

-- بدء جلسة للمستخدم الحالي (الهوية والوقت من الخادم)
create or replace function public.session_start(p_device text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_name  text;
  v_id    uuid;
begin
  if v_email = '' or not public.is_member() then
    raise exception 'غير مصرّح';
  end if;
  select u.name into v_name from public.users u where lower(trim(u.email)) = v_email limit 1;
  insert into public.user_sessions (user_email, user_name, device)
  values (v_email, coalesce(v_name, v_email), left(coalesce(p_device, ''), 80))
  returning id into v_id;
  return v_id;
end $$;

-- نبض الجلسة أو إنهاؤها — لجلسة المستخدم نفسه فقط
create or replace function public.session_ping(p_id uuid, p_end boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  n int;
begin
  update public.user_sessions
     set last_seen_at = now(),
         ended_at = case when p_end then now() else ended_at end
   where id = p_id and user_email = v_email and ended_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.session_start(text)          from public, anon;
revoke all on function public.session_ping(uuid, boolean)  from public, anon;
revoke all on function public.activity_stamp()             from public, anon;
grant execute on function public.session_start(text)         to authenticated;
grant execute on function public.session_ping(uuid, boolean) to authenticated;
