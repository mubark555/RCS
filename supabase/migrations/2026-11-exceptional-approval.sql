-- =====================================================================
--  الموافقة الاستثنائية (أمل فضل / حسن حمدي)
--  تسمح لهما بتعديل المهمة لتخطي جميع الاعتمادات ونقلها إلى الموافقة النهائية
--  حتى لو لم تكن لديهما صلاحية تعديل المهام في مصفوفة الصلاحيات.
--  شغّله بعد: 2026-11-role-permissions.sql — آمن للتكرار ولا يحذف أي بيانات.
-- =====================================================================
begin;

create or replace function public.is_exceptional_approver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member() and exists (
    select 1 from unnest((select public.my_names())) n
    -- نفس مطابقة الواجهة: توحيد الهمزات والمسافات، ويُقبل لقب قبل الاسم (مثل «أ. حسن حمدي»)
    where regexp_replace(translate(trim(n), 'أإآ', 'ااا'), '\s+', ' ', 'g') ~ '(^|\s)(امل فضل|حسن حمدي)$'
  );
$$;

drop policy if exists tasks_update_exceptional on public.tasks;
create policy tasks_update_exceptional on public.tasks for update to authenticated
  using ((select public.is_exceptional_approver()))
  with check ((select public.is_exceptional_approver()));

commit;
