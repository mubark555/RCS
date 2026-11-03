-- =====================================================================
--  الصلاحيات التفصيلية على مستوى قاعدة البيانات (المرحلة الثانية من الحماية)
--
--  تطابق مصفوفة الصلاحيات في الواجهة (lib/permissions.js → resolvePerms):
--    افتراضي الدور (مدير/عضو/عميل) ← صلاحية المالية القديمة ← التخصيص لكل شخص
--  وتطبّقها على كل جدول، فلا يمكن تجاوز الواجهة بالوصول المباشر لقاعدة البيانات.
--
--  شغّله بعد: 2026-11-security.sql و 2026-11-activity.sql و 2026-11-meeting-reminders.sql
--  آمن للتكرار، ولا يحذف أي بيانات. للتراجع: 2026-11-role-permissions-rollback.sql
-- =====================================================================

-- كل الملف في معاملة واحدة: إما يُطبَّق كاملاً أو لا يتغيّر شيء
begin;

-- ---------- المستخدم الحالي ----------
create or replace function public.bootstrap_mode()
returns boolean language sql stable security definer set search_path = public as $$
  -- تمهيد: لا يوجد أي بريد مربوط بعد (تركيب جديد) — نفس منطق is_member()
  select not exists (select 1 from public.users u where coalesce(trim(u.email), '') <> '');
$$;

create or replace function public.my_user_id()
returns text language sql stable security definer set search_path = public as $$
  select u.id::text from public.users u
  where lower(trim(u.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    and coalesce(trim(u.email), '') <> ''
    and coalesce(u.status, 'active') <> 'suspended'
  limit 1;
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select case when public.bootstrap_mode() then 'manager' else (
    select coalesce(u.role, 'member') from public.users u where u.id::text = public.my_user_id()
  ) end;
$$;

-- الاسم + الأسماء البديلة (مثل «Lujain(PM)» = «لجين») — لمطابقة الحضور والمسؤولين
create or replace function public.my_names()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(n), '{}') from (
    select u.name as n from public.users u where u.id::text = public.my_user_id()
    union
    select jsonb_array_elements_text(case when jsonb_typeof(u.aliases) = 'array' then u.aliases else '[]'::jsonb end)
    from public.users u where u.id::text = public.my_user_id()
  ) x where coalesce(n, '') <> '';
$$;

-- ---------- مصفوفة الصلاحيات (مطابقة لـ ROLE_DEFAULTS في الواجهة) ----------
create or replace function public.role_default_level(p_role text, p_section text)
returns int language sql immutable as $$
  select case coalesce(p_role, 'member')
    when 'manager' then 2
    when 'client' then case
      when p_section = 'chat' then 2
      when p_section in ('dashboard','tasks','projects','approvals','meetings','calendar','archive','drive') then 1
      else 0 end
    else case -- member
      when p_section in ('tasks','meetings','leaves','archive','chat','drive') then 2
      when p_section in ('finance','settings') then 0
      else 1 end
  end;
$$;

-- مستوى المستخدم الحالي في قسم: 0 بلا / 1 اطلاع / 2 تعديل
create or replace function public.perm_level(p_section text)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_id   text;
  v_role text;
  v_lvl  int;
  v_fin  jsonb;
  v_ov   text;
begin
  if public.bootstrap_mode() then return 2; end if;
  v_id := public.my_user_id();
  if v_id is null then return 0; end if;
  select coalesce(u.role, 'member') into v_role from public.users u where u.id::text = v_id;
  v_lvl := public.role_default_level(v_role, p_section);
  -- صلاحية المالية القديمة (finance_access) لغير المدراء
  if p_section = 'finance' and v_role <> 'manager' then
    select s.value into v_fin from public.app_settings s where s.key = 'finance_access';
    if coalesce(v_fin -> 'editors', '[]'::jsonb) ? v_id then v_lvl := 2;
    elsif coalesce(v_fin -> 'users', '[]'::jsonb) ? v_id then v_lvl := 1;
    end if;
  end if;
  -- التخصيص لكل شخص (permissions)
  select s.value -> v_id -> 'sections' ->> p_section into v_ov from public.app_settings s where s.key = 'permissions';
  if v_ov = 'none' then v_lvl := 0; elsif v_ov = 'view' then v_lvl := 1; elsif v_ov = 'edit' then v_lvl := 2; end if;
  -- أقسام للاطلاع فقط
  if p_section in ('dashboard','approvals','reports','activity') and v_lvl > 1 then v_lvl := 1; end if;
  return v_lvl;
end $$;

-- صلاحية خاصة (approve / deliver / approveMinutes / approveLeaves / permissions)
create or replace function public.has_ability(p_ability text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_id   text;
  v_role text;
  v_on   boolean;
  v_ov   jsonb;
begin
  if public.bootstrap_mode() then return true; end if;
  v_id := public.my_user_id();
  if v_id is null then return false; end if;
  select coalesce(u.role, 'member') into v_role from public.users u where u.id::text = v_id;
  v_on := case v_role
    when 'manager' then p_ability in ('approve','deliver','approveLeaves','approveMinutes','permissions')
    when 'client'  then p_ability = 'approve'
    else p_ability = 'deliver'
  end;
  select s.value -> v_id -> 'abilities' -> p_ability into v_ov from public.app_settings s where s.key = 'permissions';
  if v_ov is not null and jsonb_typeof(v_ov) = 'boolean' then v_on := v_ov::text::boolean; end if;
  return v_on;
end $$;

-- العميل بنطاق «ما يخصّه فقط» يرى مشاريعه فقط
create or replace function public.client_limited()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_id    text;
  v_role  text;
  v_scope text;
begin
  if public.bootstrap_mode() then return false; end if;
  v_id := public.my_user_id();
  if v_id is null then return true; end if;
  select coalesce(u.role, 'member') into v_role from public.users u where u.id::text = v_id;
  if v_role <> 'client' then return false; end if;
  select s.value -> v_id ->> 'scope' into v_scope from public.app_settings s where s.key = 'permissions';
  return coalesce(v_scope, 'own') <> 'all';
end $$;

-- مشاريع المستخدم: هو مدير/عضو/عميل فيها، أو مرتبط بها في سجله (project / projects)
create or replace function public.my_projects()
returns text[] language sql stable security definer set search_path = public as $$
  with me as (select public.my_names() as names),
  arr as (select p.name, p.client, p.manager, p.clients, p.members, p.managers from public.projects p)
  select coalesce(array_agg(distinct n), '{}') from (
    select a.name as n from arr a, me
    where a.client = any(me.names) or a.manager = any(me.names)
       or (jsonb_typeof(a.clients) = 'array'  and a.clients  ?| me.names)
       or (jsonb_typeof(a.members) = 'array'  and a.members  ?| me.names)
       or (jsonb_typeof(a.managers) = 'array' and a.managers ?| me.names)
    union
    select jsonb_array_elements_text(case when jsonb_typeof(u.projects) = 'array' then u.projects else '[]'::jsonb end)
    from public.users u where u.id::text = public.my_user_id()
    union
    select u.project from public.users u where u.id::text = public.my_user_id() and coalesce(u.project, '') <> ''
  ) x where coalesce(n, '') <> '';
$$;

do $$
declare f text;
begin
  foreach f in array array['bootstrap_mode()','my_user_id()','my_role()','my_names()','perm_level(text)',
                           'has_ability(text)','client_limited()','my_projects()','role_default_level(text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
--  السياسات لكل جدول (تحل محل سياسة «الأعضاء» العامة من 2026-11-security.sql)
--  ملاحظة أداء: (select …) تُحسب مرة واحدة لكل استعلام وليس لكل صف.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['tasks','meetings','files','projects','users','kpis','notifications','app_settings',
                           'invoices','payments','activity','task_comments','chat_messages','user_sessions'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_members', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  end loop;
end $$;

-- ---------- المهام ----------
-- القراءة: الأعضاء؛ والعميل لمهام مشاريعه أو ما هو طرف فيه
create policy tasks_read on public.tasks for select to authenticated using (
  public.is_member() and (
    not (select public.client_limited())
    or project = any((select public.my_projects())::text[])
    or assigned_to = any((select public.my_names())::text[]) or holder = any((select public.my_names())::text[])
  ));
create policy tasks_insert on public.tasks for insert to authenticated with check ((select public.perm_level('tasks')) >= 2);
-- التعديل: صلاحية تعديل المهام، أو اعتماد/إرسال التسليمات (العميل يعتمد ولا يعدّل)
create policy tasks_update on public.tasks for update to authenticated
  using (
    (select public.perm_level('tasks')) >= 2
    or ((select public.has_ability('approve')) or (select public.has_ability('deliver')))
       and (not (select public.client_limited()) or project = any((select public.my_projects())::text[]))
  )
  with check (
    (select public.perm_level('tasks')) >= 2
    or ((select public.has_ability('approve')) or (select public.has_ability('deliver')))
       and (not (select public.client_limited()) or project = any((select public.my_projects())::text[]))
  );
create policy tasks_delete on public.tasks for delete to authenticated using ((select public.perm_level('tasks')) >= 2);

-- ---------- الاجتماعات ----------
create policy meetings_read on public.meetings for select to authenticated using (
  public.is_member() and (
    not (select public.client_limited())
    or project = any((select public.my_projects())::text[])
    or exists (select 1 from unnest((select public.my_names())) n where position(n in coalesce(attendees::text, '')) > 0)
  ));
create policy meetings_insert on public.meetings for insert to authenticated with check ((select public.perm_level('meetings')) >= 2);
create policy meetings_update on public.meetings for update to authenticated
  using ((select public.perm_level('meetings')) >= 2 or (select public.has_ability('approveMinutes')))
  with check ((select public.perm_level('meetings')) >= 2 or (select public.has_ability('approveMinutes')));
create policy meetings_delete on public.meetings for delete to authenticated using ((select public.perm_level('meetings')) >= 2);

-- ---------- المشاريع ----------
create policy projects_read on public.projects for select to authenticated using (
  public.is_member() and (not (select public.client_limited()) or name = any((select public.my_projects())::text[])));
create policy projects_insert on public.projects for insert to authenticated with check ((select public.perm_level('projects')) >= 2);
create policy projects_update on public.projects for update to authenticated
  using ((select public.perm_level('projects')) >= 2) with check ((select public.perm_level('projects')) >= 2);
create policy projects_delete on public.projects for delete to authenticated using ((select public.perm_level('projects')) >= 2);

-- ---------- الملفات (الأرشيف) ----------
create policy files_read on public.files for select to authenticated using (
  public.is_member() and (not (select public.client_limited()) or project = any((select public.my_projects())::text[])));
create policy files_insert on public.files for insert to authenticated with check ((select public.perm_level('archive')) >= 2);
create policy files_update on public.files for update to authenticated
  using ((select public.perm_level('archive')) >= 2) with check ((select public.perm_level('archive')) >= 2);
create policy files_delete on public.files for delete to authenticated using ((select public.perm_level('archive')) >= 2);

-- ---------- الفريق (المستخدمون) ----------
create policy users_read on public.users for select to authenticated using (public.is_member());
create policy users_insert on public.users for insert to authenticated with check ((select public.perm_level('team')) >= 2);
create policy users_update on public.users for update to authenticated
  using ((select public.perm_level('team')) >= 2) with check ((select public.perm_level('team')) >= 2);
create policy users_delete on public.users for delete to authenticated using ((select public.perm_level('team')) >= 2);

-- ---------- المستهدفات ----------
create policy kpis_read on public.kpis for select to authenticated using ((select public.perm_level('kpis')) >= 1);
create policy kpis_insert on public.kpis for insert to authenticated with check ((select public.perm_level('kpis')) >= 2);
create policy kpis_update on public.kpis for update to authenticated
  using ((select public.perm_level('kpis')) >= 2) with check ((select public.perm_level('kpis')) >= 2);
create policy kpis_delete on public.kpis for delete to authenticated using ((select public.perm_level('kpis')) >= 2);

-- ---------- المالية (الفواتير والمدفوعات) ----------
create policy invoices_read on public.invoices for select to authenticated using ((select public.perm_level('finance')) >= 1);
create policy invoices_insert on public.invoices for insert to authenticated with check ((select public.perm_level('finance')) >= 2);
create policy invoices_update on public.invoices for update to authenticated
  using ((select public.perm_level('finance')) >= 2) with check ((select public.perm_level('finance')) >= 2);
create policy invoices_delete on public.invoices for delete to authenticated using ((select public.perm_level('finance')) >= 2);
create policy payments_read on public.payments for select to authenticated using ((select public.perm_level('finance')) >= 1);
create policy payments_insert on public.payments for insert to authenticated with check ((select public.perm_level('finance')) >= 2);
create policy payments_update on public.payments for update to authenticated
  using ((select public.perm_level('finance')) >= 2) with check ((select public.perm_level('finance')) >= 2);
create policy payments_delete on public.payments for delete to authenticated using ((select public.perm_level('finance')) >= 2);

-- ---------- الإشعارات (الجرس): كل شخص يرى إشعاراته فقط ----------
create policy notifications_read on public.notifications for select to authenticated using (
  public.is_member() and (
    recipient = (select public.my_user_id())
    or (recipient is null and (select public.my_role()) = 'manager')
  ));
create policy notifications_insert on public.notifications for insert to authenticated with check (public.is_member());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient = (select public.my_user_id()) or (recipient is null and (select public.my_role()) = 'manager'))
  with check (recipient = (select public.my_user_id()) or (recipient is null and (select public.my_role()) = 'manager'));
create policy notifications_delete on public.notifications for delete to authenticated
  using (recipient = (select public.my_user_id()) or (recipient is null and (select public.my_role()) = 'manager'));

-- ---------- سجل الأنشطة والجلسات: القراءة لمن له «سجل الأنشطة» ----------
create policy activity_read on public.activity for select to authenticated using ((select public.perm_level('activity')) >= 1);
create policy activity_insert on public.activity for insert to authenticated with check (public.is_member());
do $$ begin
  if to_regclass('public.user_sessions') is not null then
    execute 'drop policy if exists user_sessions_read on public.user_sessions';
    execute 'create policy user_sessions_read on public.user_sessions for select to authenticated using ((select public.perm_level(''activity'')) >= 1)';
  end if;
end $$;

-- ---------- المحادثات ----------
create policy chat_messages_read on public.chat_messages for select to authenticated using (
  public.is_member() and (
    not (select public.client_limited())
    or channel = 'general'
    or exists (select 1 from public.projects p where channel = 'project:' || p.id::text and p.name = any((select public.my_projects())::text[]))
    or exists (select 1 from public.tasks t where channel = 'task:' || t.id::text and t.project = any((select public.my_projects())::text[]))
  ));
create policy chat_messages_insert on public.chat_messages for insert to authenticated with check (
  (select public.perm_level('chat')) >= 2 and (
    not (select public.client_limited())
    or channel = 'general'
    or exists (select 1 from public.projects p where channel = 'project:' || p.id::text and p.name = any((select public.my_projects())::text[]))
    or exists (select 1 from public.tasks t where channel = 'task:' || t.id::text and t.project = any((select public.my_projects())::text[]))
  ));
create policy chat_messages_update on public.chat_messages for update to authenticated
  using ((select public.my_role()) = 'manager') with check ((select public.my_role()) = 'manager');
create policy chat_messages_delete on public.chat_messages for delete to authenticated using ((select public.my_role()) = 'manager');

-- شات المهمة: يتبع رؤية المهمة نفسها
create policy task_comments_read on public.task_comments for select to authenticated using (
  public.is_member() and (
    not (select public.client_limited())
    or exists (select 1 from public.tasks t where t.id = task_id and t.project = any((select public.my_projects())::text[]))
  ));
create policy task_comments_insert on public.task_comments for insert to authenticated with check (
  public.is_member() and (
    not (select public.client_limited())
    or exists (select 1 from public.tasks t where t.id = task_id and t.project = any((select public.my_projects())::text[]))
  ));
create policy task_comments_update on public.task_comments for update to authenticated
  using ((select public.my_role()) = 'manager') with check ((select public.my_role()) = 'manager');
create policy task_comments_delete on public.task_comments for delete to authenticated using ((select public.my_role()) = 'manager');

-- ---------- إعدادات النظام ----------
-- القراءة للأعضاء (+ هوية النظام قبل الدخول). الكتابة: المفاتيح الحساسة لأصحابها فقط
--   permissions / finance_access ← «إدارة الصلاحيات» (منع رفع الصلاحيات ذاتياً)
--   branding / notify / drive_oauth ← تعديل «تخصيص النظام»
--   بقية المفاتيح (الإجازات، الروزنامة، قراءة الشات، تفضيلات أمل…) ← أي عضو كما في الواجهة
create or replace function public.can_write_setting(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member() and case
    when p_key in ('permissions', 'finance_access') then public.has_ability('permissions')
    when p_key in ('branding', 'notify', 'drive_oauth') then public.perm_level('settings') >= 2
    else true
  end;
$$;
revoke all on function public.can_write_setting(text) from public, anon;
grant execute on function public.can_write_setting(text) to authenticated;

create policy app_settings_read on public.app_settings for select to authenticated using (public.is_member());
create policy app_settings_insert on public.app_settings for insert to authenticated with check (public.can_write_setting(key));
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.can_write_setting(key)) with check (public.can_write_setting(key));
create policy app_settings_delete on public.app_settings for delete to authenticated using (public.can_write_setting(key));
-- (سياسة app_settings_branding_read للقراءة قبل الدخول تبقى كما هي)

commit;
