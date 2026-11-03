-- =====================================================================
--  التراجع عن الصلاحيات التفصيلية (2026-11-role-permissions.sql)
--  يعيد سياسة «الأعضاء الفعّالين» العامة (المرحلة الأولى من الحماية) — لا يفتح قاعدة البيانات.
--  آمن للتكرار، ولا يحذف أي بيانات.
-- =====================================================================

-- كل الملف في معاملة واحدة: إما يُطبَّق كاملاً أو لا يتغيّر شيء
begin;
do $$
declare t text;
begin
  foreach t in array array['tasks','meetings','files','projects','users','kpis','notifications','app_settings',
                           'invoices','payments','activity','task_comments','chat_messages'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('drop policy if exists %I on public.%I', t || '_members', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())',
      t || '_members', t
    );
  end loop;
  if to_regclass('public.user_sessions') is not null then
    execute 'drop policy if exists user_sessions_read on public.user_sessions';
    execute 'create policy user_sessions_read on public.user_sessions for select to authenticated using (public.is_member())';
  end if;
end $$;

commit;
