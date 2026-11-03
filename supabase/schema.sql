-- =====================================================================
--  نظام إدارة مشروع سيم برايم (Seem Prime) — مخطط قاعدة البيانات
--  شغّل هذا الملف في Supabase > SQL Editor
-- =====================================================================

-- امتداد توليد UUID
create extension if not exists "pgcrypto";

-- ------------------------- جدول المهام -------------------------
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  order_index     int          default 0,
  activity        text         default '',
  project         text         default '',
  task            text         not null,
  priority        text         default 'High',
  status          text         default 'Not Started',
  assigned_to     text         default '',
  due_date        date,
  waiting_on      text         default '',
  blocker         text         default '',
  approval_status text         default '',
  notes           text         default '',
  health          text         default 'On Track',
  created_at      timestamptz  default now()
);

create index if not exists tasks_project_idx on public.tasks (project);
create index if not exists tasks_status_idx  on public.tasks (status);

-- ------------------------- جدول الاجتماعات -------------------------
create table if not exists public.meetings (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null,
  project     text        default '',
  start_at    timestamptz not null,
  duration    int         default 30,        -- بالدقائق
  location    text        default '',        -- رابط اونلاين أو مكان
  attendees   text        default '',
  agenda      text        default '',
  status      text        default 'Scheduled', -- Scheduled / Done / Cancelled
  created_at  timestamptz default now()
);

create index if not exists meetings_start_idx on public.meetings (start_at);

-- ------------------------- جدول الملفات (الأرشيف) -------------------------
create table if not exists public.files (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,   -- الاسم الأصلي
  path        text        not null,   -- المسار داخل bucket التخزين
  size        bigint      default 0,
  mime        text        default '',
  project     text        default '',
  category    text        default '',
  note        text        default '',
  created_at  timestamptz default now()
);

create index if not exists files_project_idx on public.files (project);

-- ------------------------- المشاريع -------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  order_index int         default 0,
  name        text        not null,
  description text        default '',
  manager     text        default '',   -- مدير المشروع (اسم مستخدم)
  client      text        default '',   -- العميل (اسم مستخدم)
  color       text        default '#e05a50',
  status      text        default 'نشط',
  created_at  timestamptz default now()
);

-- ------------------------- مؤشرات الأداء -------------------------
create table if not exists public.kpis (
  id          uuid primary key default gen_random_uuid(),
  order_index int         default 0,
  name        text        not null,
  category    text        default '',
  unit        text        default '',
  current     numeric     default 0,
  target      numeric     default 0,
  up          boolean     default true,
  trend       text        default '',
  created_at  timestamptz default now()
);

-- ------------------------- المستخدمون -------------------------
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  order_index int         default 0,
  name        text        not null,
  role        text        default 'member',  -- manager | member | client
  title       text        default '',
  project     text        default '',        -- المشروع المرتبط (للعميل)
  email       text        default '',
  created_at  timestamptz default now()
);

-- ------------------------- أعمدة إضافية -------------------------
alter table public.tasks    add column if not exists holder   text  default '';
alter table public.tasks    add column if not exists handoffs jsonb default '[]'::jsonb;
alter table public.meetings add column if not exists attendees jsonb default '[]'::jsonb;
alter table public.meetings add column if not exists links     jsonb default '[]'::jsonb;
alter table public.meetings add column if not exists minutes   text  default '';
alter table public.tasks    add column if not exists links     jsonb default '[]'::jsonb;
alter table public.files    add column if not exists kind text default 'file'; -- file | link
alter table public.files    add column if not exists url  text default '';
alter table public.files    alter column path drop not null;   -- الروابط بلا مسار تخزين

-- ------------------------- إشعارات البريد للاجتماعات -------------------------
alter table public.meetings add column if not exists action_items   jsonb   default '[]'::jsonb;
alter table public.meetings add column if not exists notify         boolean default true;          -- تفعيل الإشعارات لهذا الاجتماع
alter table public.meetings add column if not exists reminders      jsonb   default '[1440,60]'::jsonb; -- دقائق قبل الموعد
alter table public.meetings add column if not exists reminders_sent jsonb   default '[]'::jsonb;    -- التذكيرات المُرسلة (منع التكرار)
alter table public.meetings add column if not exists extra_emails   text    default '';             -- ضيوف من خارج النظام
alter table public.meetings add column if not exists notify_log     jsonb   default '[]'::jsonb;    -- سجل الإشعارات المرسلة
create index if not exists meetings_status_start_idx on public.meetings (status, start_at);

-- ------------------------- سجل النشاط وجلسات الدخول -------------------------
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz default now(),
  user_id     text        default '',
  user_name   text        default '',
  action      text        not null,   -- create | update | status | delete | login | logout | upload | link
  entity      text        default '',  -- task | meeting | project | user | kpi | file | session
  entity_id   text        default '',
  title       text        default '',
  project     text        default '',
  details     jsonb       default '{}'::jsonb   -- { changes: [{field,label,from,to}] }
);
create index if not exists activity_at_idx   on public.activity_log (at desc);
create index if not exists activity_user_idx on public.activity_log (user_name, at desc);

create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       text        default '',
  user_name     text        default '',
  started_at    timestamptz default now(),   -- وقت الدخول
  last_seen_at  timestamptz default now(),   -- آخر نشاط (نبض كل دقيقة)
  ended_at      timestamptz,                 -- وقت الخروج الصريح
  device        text        default ''
);
create index if not exists sessions_started_idx on public.user_sessions (started_at desc);
create index if not exists sessions_user_idx    on public.user_sessions (user_name, started_at desc);

-- ------------------------- رموز الدخول (OTP) -------------------------
-- تتبّع محاولات التحقق ومنع إعادة استخدام الرمز (الرمز نفسه لا يُخزَّن)
create table if not exists public.auth_otps (
  nonce       text primary key,
  email       text        default '',
  attempts    int         default 0,
  used        boolean     default false,
  created_at  timestamptz default now()
);

-- =====================================================================
--  سياسات الوصول (RLS)
--  ملاحظة: هذه سياسات مفتوحة للبدء السريع (anon يقرأ/يكتب).
--  للاستخدام الحقيقي فعّل مصادقة Supabase وقيّد السياسات حسب auth.uid().
-- =====================================================================
alter table public.tasks    enable row level security;
alter table public.meetings enable row level security;
alter table public.files    enable row level security;
alter table public.projects enable row level security;
alter table public.users    enable row level security;
alter table public.kpis     enable row level security;
alter table public.activity_log  enable row level security;
alter table public.user_sessions enable row level security;
alter table public.auth_otps     enable row level security;  -- بلا سياسات: يصل إليه الخادم فقط بمفتاح service_role

do $$
begin
  if not exists (select 1 from pg_policies where tablename='tasks' and policyname='tasks_all') then
    create policy tasks_all on public.tasks for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='meetings' and policyname='meetings_all') then
    create policy meetings_all on public.meetings for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='files' and policyname='files_all') then
    create policy files_all on public.files for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='projects' and policyname='projects_all') then
    create policy projects_all on public.projects for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='users' and policyname='users_all') then
    create policy users_all on public.users for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='kpis' and policyname='kpis_all') then
    create policy kpis_all on public.kpis for all using (true) with check (true);
  end if;
  -- سجل النشاط: إضافة وقراءة فقط (لا تعديل ولا حذف للحفاظ على موثوقية السجل)
  if not exists (select 1 from pg_policies where tablename='activity_log' and policyname='activity_insert') then
    create policy activity_insert on public.activity_log for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='activity_log' and policyname='activity_select') then
    create policy activity_select on public.activity_log for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='user_sessions' and policyname='sessions_all') then
    create policy sessions_all on public.user_sessions for all using (true) with check (true);
  end if;
end $$;

-- =====================================================================
--  التخزين (Storage): أنشئ bucket باسم archive
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('archive', 'archive', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='objects' and policyname='archive_all') then
    create policy archive_all on storage.objects for all
      using (bucket_id = 'archive') with check (bucket_id = 'archive');
  end if;
end $$;
