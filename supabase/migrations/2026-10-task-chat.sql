-- =====================================================================
--  شات الملاحظات تحت كل مهمة (رسائل + مرفقات + تحديث فوري)
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run
--  آمن للتكرار، ولا يحذف أي بيانات. المرفقات تُحفظ في bucket الأرشيف (archive).
-- =====================================================================

create table if not exists public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid        not null references public.tasks(id) on delete cascade,
  author      text        default '',
  author_role text        default '',     -- manager | member | client
  body        text        default '',
  attachments jsonb       default '[]'::jsonb,  -- [{name, size, mime, path}]
  created_at  timestamptz default now()
);

create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='task_comments' and policyname='task_comments_all') then
    create policy task_comments_all on public.task_comments for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_comments'
  ) then
    alter publication supabase_realtime add table public.task_comments;
  end if;
end $$;
