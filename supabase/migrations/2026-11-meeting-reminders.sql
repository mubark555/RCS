-- =====================================================================
--  بريد الاجتماعات للحضور + التذكير قبل الموعد
--  شغّله بعد 2026-11-security.sql. آمن للتكرار، ولا يحذف أي بيانات (إضافات فقط).
-- =====================================================================
alter table public.meetings add column if not exists notify_attendees boolean default true;           -- إرسال بريد للحضور
alter table public.meetings add column if not exists reminders        jsonb   default '[1440,60]'::jsonb; -- دقائق قبل الموعد
alter table public.meetings add column if not exists reminders_sent   jsonb   default '[]'::jsonb;     -- ما أُرسل (منع التكرار)
alter table public.meetings add column if not exists mail_log         jsonb   default '[]'::jsonb;     -- سجل البريد المرسل للحضور
create index if not exists meetings_status_start_idx on public.meetings (status, start_at);

-- حجز تذكير بشكل ذرّي: يضمن ألا يُرسل التذكير نفسه مرتين
-- (حتى لو كان النظام مفتوحاً عند عدة أشخاص مع المهمة المجدولة في نفس الوقت).
-- يُرجع true لمن حجز أولاً فقط.
create or replace function public.claim_meeting_reminder(p_id uuid, p_offset int, p_skip int[] default '{}')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not (public.is_member() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'غير مصرّح';
  end if;
  update public.meetings
     set reminders_sent = (
       select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
       from jsonb_array_elements(coalesce(reminders_sent, '[]'::jsonb) || to_jsonb(array[p_offset] || coalesce(p_skip, '{}'))) as x
     )
   where id = p_id
     and coalesce(status, 'Scheduled') = 'Scheduled'
     and not (coalesce(reminders_sent, '[]'::jsonb) @> to_jsonb(array[p_offset]));
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.claim_meeting_reminder(uuid, int, int[]) from public, anon;
grant execute on function public.claim_meeting_reminder(uuid, int, int[]) to authenticated, service_role;
