-- =====================================================================
--  ترحيل 003 — الإشعارات وتفضيلاتها
--  يتطلب 001 و 002. لا يحذف أي بيانات.
-- =====================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,  -- المستلم
  kind        text not null,
  title       text not null,
  body        text default '',
  link        text default '',
  task_id     uuid,
  meeting_id  uuid,
  created_by  uuid references public.users(id) on delete set null,
  read_at     timestamptz,
  created_at  timestamptz default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- تفضيلات كل مستخدم: {"نوع": true/false} — الأنواع غير المذكورة تأخذ الافتراضي
alter table public.users add column if not exists notify_prefs jsonb default '{}'::jsonb;

alter table public.notifications enable row level security;
drop policy if exists p3_notif_select on public.notifications;
drop policy if exists p3_notif_insert on public.notifications;
drop policy if exists p3_notif_update on public.notifications;
drop policy if exists p3_notif_delete on public.notifications;
-- كل مستخدم يرى إشعاراته فقط، ويُرسل الإشعار باسمه فقط
create policy p3_notif_select on public.notifications for select
  using (not public.rls_enforced() or user_id = public.me());
create policy p3_notif_insert on public.notifications for insert
  with check (not public.rls_enforced() or (public.me() is not null and created_by = public.me()));
create policy p3_notif_update on public.notifications for update
  using (not public.rls_enforced() or user_id = public.me())
  with check (not public.rls_enforced() or user_id = public.me());
create policy p3_notif_delete on public.notifications for delete
  using (not public.rls_enforced() or user_id = public.me());

-- المستخدم يعدّل تفضيلاته فقط (جدول المستخدمين نفسه محصور بمدير المستخدمين)
create or replace function public.set_my_notify_prefs(p_prefs jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.me();
begin
  if v_id is null then
    if public.rls_enforced() then
      raise exception 'يجب تسجيل الدخول' using errcode = '42501';
    end if;
    return null;
  end if;
  if jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'تفضيلات غير صالحة' using errcode = '22023';
  end if;
  update public.users set notify_prefs = p_prefs where id = v_id;
  return p_prefs;
end $$;
grant execute on function public.set_my_notify_prefs(jsonb) to authenticated;
