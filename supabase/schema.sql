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

-- =====================================================================
--  سياسات الوصول (RLS)
--  ملاحظة: هذه سياسات مفتوحة للبدء السريع (anon يقرأ/يكتب).
--  للاستخدام الحقيقي فعّل مصادقة Supabase وقيّد السياسات حسب auth.uid().
-- =====================================================================
alter table public.tasks    enable row level security;
alter table public.meetings enable row level security;
alter table public.files    enable row level security;

do $$
begin
  -- tasks
  if not exists (select 1 from pg_policies where tablename='tasks' and policyname='tasks_all') then
    create policy tasks_all on public.tasks for all using (true) with check (true);
  end if;
  -- meetings
  if not exists (select 1 from pg_policies where tablename='meetings' and policyname='meetings_all') then
    create policy meetings_all on public.meetings for all using (true) with check (true);
  end if;
  -- files
  if not exists (select 1 from pg_policies where tablename='files' and policyname='files_all') then
    create policy files_all on public.files for all using (true) with check (true);
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
