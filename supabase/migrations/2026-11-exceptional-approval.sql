-- =====================================================================
--  الموافقة الاستثنائية (أمل فضل / حسن حمدي)
--  تسمح لهما بتعديل المهمة لتخطي جميع الاعتمادات ونقلها إلى الموافقة النهائية
--  حتى لو لم تكن لديهما صلاحية تعديل المهام في مصفوفة الصلاحيات.
--
--  آمن للتكرار ولا يحذف أي بيانات.
--  إذا لم تُشغَّل ملفات الحماية بعد (2026-11-security.sql / 2026-11-role-permissions.sql)
--  فجدول المهام مفتوح أصلاً ولا حاجة لشيء — يتخطى الملف نفسه بدون خطأ.
--  وإذا شغّلت ملفات الحماية لاحقاً، أعد تشغيل هذا الملف بعدها.
-- =====================================================================
do $mig$
begin
  if to_regprocedure('public.is_member()') is null or to_regprocedure('public.my_names()') is null then
    raise notice 'ملفات الحماية غير مطبّقة — جدول المهام مفتوح، لا حاجة لسياسة الموافقة الاستثنائية الآن.';
    return;
  end if;

  execute $f$
    create or replace function public.is_exceptional_approver()
    returns boolean language sql stable security definer set search_path = public as $$
      select public.is_member() and exists (
        select 1 from unnest((select public.my_names())) n
        -- نفس مطابقة الواجهة: توحيد الهمزات والمسافات، ويُقبل لقب قبل الاسم (مثل «أ. حسن حمدي»)
        where regexp_replace(translate(trim(n), 'أإآ', 'ااا'), '\s+', ' ', 'g') ~ '(^|\s)(امل فضل|حسن حمدي)$'
      );
    $$
  $f$;

  execute 'drop policy if exists tasks_update_exceptional on public.tasks';
  execute $p$
    create policy tasks_update_exceptional on public.tasks for update to authenticated
      using ((select public.is_exceptional_approver()))
      with check ((select public.is_exceptional_approver()))
  $p$;
end
$mig$;
