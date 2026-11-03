-- =====================================================================
--  التراجع عن حماية قاعدة البيانات (2026-11-security.sql)
--  ⚠️ يعيد الجداول مفتوحة لأي شخص يملك المفتاح العام — استخدمه للطوارئ فقط.
--  آمن للتكرار، ولا يحذف أي بيانات.
-- =====================================================================
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
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_members', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    execute format('grant all on public.%I to anon', t);
  end loop;
end $$;

drop policy if exists app_settings_branding_read on public.app_settings;

drop policy if exists archive_members on storage.objects;
drop policy if exists archive_all on storage.objects;
create policy archive_all on storage.objects for all
  using (bucket_id = 'archive') with check (bucket_id = 'archive');

-- الدوال تبقى (غير ضارة)؛ الواجهة تتعامل مع غيابها أو وجودها.
