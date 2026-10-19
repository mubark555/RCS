-- =====================================================================
--  المحادثات: الشات العام + شات كل مشروع (رسائل + مرفقات + تحديث فوري)
--  شات المهام يبقى في جدول task_comments كما هو.
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run
--  آمن للتكرار، ولا يحذف أي بيانات. المرفقات تُحفظ في bucket الأرشيف (archive).
-- =====================================================================

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  channel     text        not null,           -- general | project:<id>
  author      text        default '',
  author_role text        default '',         -- manager | member | client
  body        text        default '',
  attachments jsonb       default '[]'::jsonb, -- [{name, size, mime, path}]
  created_at  timestamptz default now()
);

create index if not exists chat_messages_channel_idx on public.chat_messages (channel, created_at);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at);

create index if not exists task_comments_created_idx on public.task_comments (created_at);

alter table public.chat_messages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='chat_messages' and policyname='chat_messages_all') then
    create policy chat_messages_all on public.chat_messages for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
