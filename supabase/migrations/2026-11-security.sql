-- =====================================================================
--  حماية قاعدة البيانات (RLS) — المرحلة الأولى
--
--  قبل: كل الجداول مفتوحة لأي شخص يملك المفتاح العام (anon) حتى بدون تسجيل دخول.
--  بعد: لا يقرأ ولا يكتب إلا مستخدم:
--        1) سجّل دخوله برمز OTP (Supabase Auth)
--        2) بريده مضاف في قسم «الفريق»
--        3) حسابه غير موقوف (status <> 'suspended')
--
--  شغّل هذا الملف من Supabase → SQL Editor → Run (بعد كل ملفات migrations السابقة).
--  آمن للتكرار، ولا يحذف أي بيانات. للتراجع: 2026-11-security-rollback.sql
--
--  ملاحظة التمهيد: إن لم يكن لأي مستخدم بريد بعد (تركيب جديد)، يُسمح لأول من يسجّل
--  الدخول حتى يُربط بريد المدير الأول — نفس منطق «تمهيد الأدمن الأول» في النظام.
-- =====================================================================

-- ---------- هل المستخدم الحالي عضو فعّال؟ ----------
-- security definer: تقرأ جدول users متجاوزةً RLS (وإلا ستدور السياسة على نفسها)
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and (
      exists (
        select 1 from public.users u
        where lower(trim(u.email)) = lower(trim(auth.jwt() ->> 'email'))
          and coalesce(u.status, 'active') <> 'suspended'
      )
      -- تمهيد: لا يوجد أي بريد مربوط بعد
      or not exists (select 1 from public.users u where coalesce(trim(u.email), '') <> '')
    );
$$;

-- ---------- حالة وصول المستخدم الحالي (لعرض رسالة واضحة في الواجهة) ----------
-- member | suspended | none
create or replace function public.my_access()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth.jwt() ->> 'email', '') = '' then 'none'
    when not exists (select 1 from public.users u where coalesce(trim(u.email), '') <> '') then 'member'
    when exists (
      select 1 from public.users u
      where lower(trim(u.email)) = lower(trim(auth.jwt() ->> 'email'))
        and coalesce(u.status, 'active') = 'suspended'
    ) then 'suspended'
    when exists (
      select 1 from public.users u
      where lower(trim(u.email)) = lower(trim(auth.jwt() ->> 'email'))
    ) then 'member'
    else 'none'
  end;
$$;

-- ---------- هل يحق لهذا البريد طلب رمز دخول؟ (قبل الدخول) ----------
-- يمنع إرسال رموز وإنشاء حسابات لأي بريد غير مضاف في الفريق
create or replace function public.can_request_login(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(trim(p_email), '') <> ''
    and (
      exists (
        select 1 from public.users u
        where lower(trim(u.email)) = lower(trim(p_email))
          and coalesce(u.status, 'active') <> 'suspended'
      )
      or not exists (select 1 from public.users u where coalesce(trim(u.email), '') <> '')
    );
$$;

-- ---------- نبض يومي يُبقي مشروع Supabase المجاني نشطاً (بلا كشف أي بيانات) ----------
create or replace function public.keepalive()
returns timestamptz
language sql
stable
as $$ select now(); $$;

revoke all on function public.is_member()               from public;
revoke all on function public.my_access()               from public;
revoke all on function public.can_request_login(text)   from public;
revoke all on function public.keepalive()               from public;
-- Supabase يمنح anon صلاحية تنفيذ الدوال الجديدة افتراضياً — نسحبها صراحةً من الدوال الداخلية
revoke all on function public.is_member()               from anon;
revoke all on function public.my_access()               from anon;
grant execute on function public.is_member()             to authenticated;
grant execute on function public.my_access()             to authenticated;
grant execute on function public.can_request_login(text) to anon, authenticated;
grant execute on function public.keepalive()             to anon, authenticated;

-- ---------- السياسات: الأعضاء الفعّالون فقط ----------
do $$
declare
  t text;
  tables text[] := array[
    'tasks', 'meetings', 'files', 'projects', 'users', 'kpis', 'notifications',
    'app_settings', 'invoices', 'payments', 'activity', 'task_comments', 'chat_messages'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue; -- جدول غير موجود في هذا التركيب
    end if;
    execute format('alter table public.%I enable row level security', t);
    -- إزالة السياسة المفتوحة القديمة (using true)
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    -- سياسة الأعضاء
    execute format('drop policy if exists %I on public.%I', t || '_members', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())',
      t || '_members', t
    );
    -- لا شيء للمفتاح العام (طبقة ثانية فوق RLS)
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- هوية النظام (الاسم والشعار واللون) تظهر في شاشة الدخول قبل تسجيل الدخول:
-- نسمح بقراءة مفتاح branding فقط — بقية الإعدادات (البريد، Google Drive…) تبقى محمية.
grant select on public.app_settings to anon;
drop policy if exists app_settings_branding_read on public.app_settings;
create policy app_settings_branding_read on public.app_settings
  for select to anon, authenticated
  using (key = 'branding');

-- ---------- التخزين (الأرشيف والمرفقات) ----------
drop policy if exists archive_all on storage.objects;
drop policy if exists archive_members on storage.objects;
create policy archive_members on storage.objects
  for all to authenticated
  using (bucket_id = 'archive' and public.is_member())
  with check (bucket_id = 'archive' and public.is_member());

update storage.buckets set public = false where id = 'archive';
