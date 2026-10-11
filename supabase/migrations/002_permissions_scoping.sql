-- =====================================================================
--  ترحيل 002 — الصلاحيات والوحدات وفصل المشاريع
--  يتطلب تشغيل 001 أولاً. لا يحذف أي بيانات.
--
--  مهم: الفصل في قاعدة البيانات لا يُفعَّل إلا بعد تفعيل تسجيل الدخول:
--      update public.app_config set value = 'true' where key = 'auth_required';
--  قبل ذلك تبقى القاعدة مفتوحة كما هي اليوم (لا يوجد مستخدم معروف لتطبيق الصلاحيات عليه)،
--  وتُطبَّق الصلاحيات في الواجهة فقط.
-- =====================================================================

-- ---------- 1) الأدوار ----------
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  description text default '',
  permissions jsonb default '[]'::jsonb,
  system      boolean default false,   -- أدوار أساسية لا تُحذف
  order_index int default 0,
  created_at  timestamptz default now()
);

-- الأدوار الافتراضية (مولّدة من lib/permissions.mjs — لا تُستبدل إن كانت موجودة)
insert into public.roles (key, name, description, permissions, system, order_index) values
  ('manager', 'مدير النظام', 'صلاحيات كاملة — يُنصح بقصره على شخص أو اثنين', '["page.overview","page.tasks","page.projects","page.meetings","page.archive","page.kpis","page.team","page.audit","page.settings","page.access","scope.all_projects","task.create","task.edit","task.delete","task.assign","task.review_any","task.final_approve","task.reopen","meeting.create","meeting.edit","meeting.delete","file.upload","file.delete","project.create","project.edit","project.delete","users.manage","roles.manage","units.manage","settings.manage","report.overview","report.kpis","kpi.edit","report.audit","report.export"]'::jsonb, true, 0),
  ('executive', 'الإدارة العليا', 'اطلاع على كل المشاريع والتقارير مع الاعتماد النهائي، دون إدارة النظام', '["page.tasks","page.projects","page.meetings","page.archive","page.overview","page.kpis","page.audit","scope.all_projects","task.create","task.edit","task.assign","task.review_any","task.final_approve","task.reopen","meeting.create","meeting.edit","file.upload","report.overview","report.kpis","report.audit","report.export"]'::jsonb, false, 1),
  ('ops_manager', 'مدير تشغيل', 'يدير المشاريع المسندة إليه فقط', '["page.tasks","page.projects","page.meetings","page.archive","page.overview","task.create","task.edit","task.delete","task.assign","task.review_any","task.reopen","meeting.create","meeting.edit","meeting.delete","file.upload","file.delete","report.overview","report.export"]'::jsonb, false, 2),
  ('unit_manager', 'مدير وحدة', 'يرى أعمال وحدته ويديرها', '["page.tasks","page.projects","page.meetings","page.archive","page.overview","task.create","task.edit","task.assign","task.review_any","task.reopen","meeting.create","meeting.edit","file.upload","report.overview","report.export"]'::jsonb, false, 3),
  ('member', 'موظف', 'يرى مشاريعه ومهامه وينفّذها', '["page.tasks","page.projects","page.meetings","page.archive","task.create","task.edit","meeting.create","meeting.edit","file.upload","report.export"]'::jsonb, true, 4),
  ('client', 'عميل', 'اطلاع فقط على مشروعه', '["page.tasks","page.projects","page.meetings","report.export"]'::jsonb, true, 5)
on conflict (key) do nothing;

-- ---------- 2) الوحدات وربط المشاريع ----------
create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text default '',
  managers    jsonb default '[]'::jsonb,   -- أسماء مديري الوحدة
  order_index int default 0,
  created_at  timestamptz default now()
);
alter table public.projects add column if not exists unit_id      uuid references public.units(id) on delete set null;
alter table public.projects add column if not exists ops_managers jsonb default '[]'::jsonb;  -- مديرو التشغيل (أسماء)

-- ---------- 3) دوال الصلاحيات (مطابقة لـ lib/permissions.mjs) ----------
create or replace function public.rls_enforced() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_config where key = 'auth_required'), 'false'::jsonb) = 'true'::jsonb
$$;

create or replace function public.me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.users where auth_id = auth.uid() and auth.uid() is not null
$$;

create or replace function public.role_perms(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((
    select array(select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)))
    from public.users u join public.roles r on r.key = u.role
    where u.id = p_user), '{}'::text[])
$$;

create or replace function public.name_in(p_names jsonb, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from jsonb_array_elements_text(
      case when jsonb_typeof(p_names) = 'array' then p_names else '[]'::jsonb end) n
    where public.user_matches(n, p_user))
$$;

create or replace function public.project_role(p_user uuid, p_project text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.name_in(p.ops_managers, p_user) then 'ops_manager'
    when public.name_in(case when jsonb_array_length(coalesce(p.managers, '[]'::jsonb)) > 0
                             then p.managers else jsonb_build_array(coalesce(p.manager, '')) end, p_user) then 'manager'
    when public.name_in(p.members, p_user) then 'member'
    when public.name_in(case when jsonb_array_length(coalesce(p.clients, '[]'::jsonb)) > 0
                             then p.clients else jsonb_build_array(coalesce(p.client, '')) end, p_user) then 'client'
  end
  from public.projects p where p.name = p_project and p_user is not null
  limit 1
$$;

create or replace function public.can_see_project(p_user uuid, p_project text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    'scope.all_projects' = any(public.role_perms(p_user))
    or public.project_role(p_user, p_project) is not null
    or exists (select 1 from public.projects p join public.units un on un.id = p.unit_id
               where p.name = p_project and public.name_in(un.managers, p_user)))
$$;

create or replace function public.has_perm(p_user uuid, p_perm text, p_project text default null) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_perms text[];
  v_role  text;
begin
  if p_user is null then return false; end if;
  v_perms := public.role_perms(p_user);
  if p_project is null or p_project = '' then
    return p_perm = any(v_perms);
  end if;
  v_role := public.project_role(p_user, p_project);
  if v_role = 'client' then
    return p_perm = any(v_perms) and p_perm like 'page.%';
  end if;
  if p_perm = any(v_perms) and public.can_see_project(p_user, p_project) then
    return true;
  end if;
  -- coalesce: بدون دور في المشروع تكون النتيجة false وليس NULL (NULL يُسقط شروط الرفض)
  return coalesce(v_role in ('ops_manager', 'manager'), false) and p_perm = any(array['task.create','task.edit','task.delete','task.assign','task.review_any','task.reopen','meeting.create','meeting.edit','meeting.delete','file.upload','file.delete']);
end $$;

-- الصلاحية في أي مشروع (مثلاً رفع ملف قبل معرفة مشروعه)
create or replace function public.has_perm_any(p_user uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    p_perm = any(public.role_perms(p_user))
    or (p_perm = any(array['task.create','task.edit','task.delete','task.assign','task.review_any','task.reopen','meeting.create','meeting.edit','meeting.delete','file.upload','file.delete'])
        and exists (select 1 from public.projects p
                    where public.project_role(p_user, p.name) in ('ops_manager', 'manager'))))
$$;

create or replace function public.is_involved(p_user uuid, t public.tasks) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    p_user in (t.assignee_id, t.reviewer_id, t.approver_id, t.final_approver_id, t.created_by)
    or (t.assignee_id is null and public.user_matches(t.assigned_to, p_user)))
$$;

create or replace function public.can_see_task(p_user uuid, t public.tasks) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_see_project(p_user, t.project) or public.is_involved(p_user, t)
$$;

-- الحضور قد يكون نصاً (مخطط قديم) أو مصفوفة JSON
create or replace function public.as_name_array(v jsonb) returns jsonb
language plpgsql immutable as $$
begin
  if v is null then return '[]'::jsonb; end if;
  if jsonb_typeof(v) = 'array' then return v; end if;
  if jsonb_typeof(v) = 'string' then
    begin
      v := (v #>> '{}')::jsonb;
      if jsonb_typeof(v) = 'array' then return v; end if;
    exception when others then
      return to_jsonb(regexp_split_to_array(v #>> '{}', '\s*,\s*'));
    end;
  end if;
  return '[]'::jsonb;
end $$;

create or replace function public.can_see_meeting(p_user uuid, m public.meetings) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    'scope.all_projects' = any(public.role_perms(p_user))
    or (coalesce(m.project, '') <> '' and public.can_see_project(p_user, m.project))
    or public.name_in(public.as_name_array(to_jsonb(m.attendees)), p_user)
    or public.user_matches(m.organizer, p_user))
$$;

create or replace function public.can_see_file(p_user uuid, f public.files) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    'scope.all_projects' = any(public.role_perms(p_user))
    or (coalesce(f.project, '') <> '' and public.can_see_project(p_user, f.project)))
$$;

-- ربط حساب الدخول بالمستخدم عند أول دخول (بالبريد)
create or replace function public.link_my_account() returns public.users
language plpgsql security definer set search_path = public as $$
declare
  u public.users;
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول' using errcode = '42501';
  end if;
  select * into u from public.users where auth_id = auth.uid();
  if u.id is not null then return u; end if;
  if v_email = '' then return u; end if;
  update public.users set auth_id = auth.uid()
  where id = (select id from public.users
              where auth_id is null and lower(btrim(coalesce(email, ''))) = v_email
              order by created_at limit 1)
  returning * into u;
  return u;
end $$;
grant execute on function public.link_my_account() to authenticated;

-- ---------- 4) سير العمل: استبدال فحص دور manager بالصلاحيات ----------
create or replace function public.task_transition(p_task uuid, p_action text, p_note text default '', p_actor uuid default null)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare
  u        public.users;
  t        public.tasks;
  v_from   text;
  v_to     text;
  v_steps  text[];
  v_step   text;
  v_idx    int;
  v_asg    boolean;
  v_exec   boolean;
  v_assign boolean;
  v_desig  uuid;
  v_note   text := btrim(coalesce(p_note, ''));
begin
  u := public.current_app_user(p_actor);
  if u.id is null then
    raise exception 'لم يتم التعرف على المستخدم' using errcode = '42501';
  end if;

  select * into t from public.tasks where id = p_task for update;
  if t.id is null or (public.rls_enforced() and not public.can_see_task(u.id, t)) then
    raise exception 'المهمة غير موجودة' using errcode = 'P0002';
  end if;

  v_from   := coalesce(t.stage, public.derive_stage(t.status, t.approval_status));
  t.workflow := coalesce(t.workflow, public.derive_workflow(t.approval_status));
  v_steps  := public.workflow_steps(t.workflow);
  v_assign := public.has_perm(u.id, 'task.assign', t.project);
  v_asg    := case when t.assignee_id is not null then t.assignee_id = u.id
                   else public.user_matches(t.assigned_to, u.id) end;
  v_exec   := v_asg or (t.assignee_id is null and btrim(coalesce(t.assigned_to, '')) = '' and v_assign);
  v_step   := case v_from when 'in_review' then 'review' when 'pending_approval' then 'approval'
                          when 'pending_final' then 'final' end;

  if p_action in ('start', 'submit') then
    if not v_exec or v_from not in ('not_started', 'in_progress', 'changes_requested')
       or (p_action = 'start' and v_from <> 'not_started') then
      raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء في المرحلة الحالية للمهمة.' using errcode = '42501';
    end if;
    if p_action = 'start' then
      v_to := 'in_progress';
    else
      v_to := coalesce(public.step_stage(v_steps[1]), 'closed');
      t.submitted_at := now();
      t.review_note := '';
    end if;

  elsif p_action = 'hold' then
    if not (v_exec or v_assign) or v_from not in ('not_started', 'in_progress', 'changes_requested') then
      raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء في المرحلة الحالية للمهمة.' using errcode = '42501';
    end if;
    if v_note = '' then raise exception 'يجب كتابة سبب التوقف.' using errcode = '22023'; end if;
    v_to := 'on_hold';
    t.hold_reason := v_note;

  elsif p_action = 'resume' then
    if not (v_exec or v_assign) or v_from <> 'on_hold' then
      raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء في المرحلة الحالية للمهمة.' using errcode = '42501';
    end if;
    v_to := 'in_progress';
    t.hold_reason := '';

  elsif p_action in ('accept', 'request_changes') then
    if v_step is null then
      raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء في المرحلة الحالية للمهمة.' using errcode = '42501';
    end if;
    v_desig := case v_step when 'review' then t.reviewer_id when 'approval' then t.approver_id else t.final_approver_id end;
    if (v_asg and not coalesce(u.can_self_approve, false))
       or (v_desig is not null and v_desig <> u.id)
       or (v_desig is null and not public.has_perm(u.id,
             case when v_step = 'final' then 'task.final_approve' else 'task.review_any' end, t.project)) then
      raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء في المرحلة الحالية للمهمة.' using errcode = '42501';
    end if;
    if p_action = 'request_changes' then
      if v_note = '' then raise exception 'يجب كتابة ملاحظات التعديل المطلوبة.' using errcode = '22023'; end if;
      v_to := 'changes_requested';
      t.review_note := v_note;
    else
      v_idx := array_position(v_steps, v_step);
      v_to := coalesce(public.step_stage(v_steps[v_idx + 1]), 'closed');
    end if;

  elsif p_action = 'reopen' then
    if not public.has_perm(u.id, 'task.reopen', t.project) or v_from <> 'closed' then
      raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء في المرحلة الحالية للمهمة.' using errcode = '42501';
    end if;
    if v_note = '' then raise exception 'يجب كتابة سبب إعادة الفتح.' using errcode = '22023'; end if;
    v_to := 'in_progress';

  else
    raise exception 'إجراء غير معروف' using errcode = '22023';
  end if;

  t.stage  := v_to;
  t.status := public.stage_status(v_to);
  t.approval_status := case
    when v_to in ('in_review', 'pending_approval', 'pending_final') then 'Pending Review'
    when v_to = 'changes_requested' then 'Revision needed'
    when v_to = 'closed' then case when cardinality(v_steps) > 0 then 'Approved' else coalesce(t.approval_status, '') end
    else '' end;
  if v_to = 'closed' then
    t.completed_at := now();
    t.health := 'Completed';
  else
    t.completed_at := null;
    if t.health = 'Completed' then t.health := 'On Track'; end if;
  end if;

  perform set_config('app.task_transition', 'on', true);
  update public.tasks set
    stage = t.stage, status = t.status, approval_status = t.approval_status, workflow = t.workflow,
    completed_at = t.completed_at, health = t.health, submitted_at = t.submitted_at,
    review_note = t.review_note, hold_reason = t.hold_reason
  where id = t.id
  returning * into t;
  perform set_config('app.task_transition', 'off', true);

  insert into public.task_events (task_id, task_title, actor_id, actor_name, action, from_stage, to_stage, note)
  values (t.id, t.task, u.id, u.name, p_action, v_from, v_to, v_note);

  return t;
end $$;

create or replace function public.tasks_guard() returns trigger
language plpgsql as $$
declare
  u public.users;
begin
  if current_setting('app.task_transition', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.stage := 'not_started';
      new.status := 'Not Started';
      new.approval_status := '';
      new.completed_at := null;
      new.submitted_at := null;
    else
      new.stage := coalesce(new.stage, public.derive_stage(new.status, new.approval_status));
      new.status := public.stage_status(new.stage);
    end if;
    new.workflow := coalesce(new.workflow, public.derive_workflow(new.approval_status));
    return new;
  end if;

  if new.stage is distinct from old.stage
     or new.status is distinct from old.status
     or new.approval_status is distinct from old.approval_status
     or new.completed_at is distinct from old.completed_at
     or new.submitted_at is distinct from old.submitted_at
     or new.review_note is distinct from old.review_note then
    raise exception 'لا يمكن تغيير حالة المهمة إلا عبر إجراءات سير العمل (task_transition).' using errcode = '42501';
  end if;

  -- تغيير المسؤول أو مسار الاعتماد يتطلب صلاحية الإسناد في المشروع
  if auth.uid() is not null
     and (new.workflow is distinct from old.workflow
          or new.reviewer_id is distinct from old.reviewer_id
          or new.approver_id is distinct from old.approver_id
          or new.final_approver_id is distinct from old.final_approver_id
          or new.assignee_id is distinct from old.assignee_id) then
    u := public.current_app_user(null);
    if u.id is null or not public.has_perm(u.id, 'task.assign', old.project)
       or (public.is_involved(u.id, old) and old.created_by is distinct from u.id
           and (old.assignee_id = u.id or (old.assignee_id is null and public.user_matches(old.assigned_to, u.id)))) then
      raise exception 'لا يمكن للمنفذ تغيير مسار الاعتماد أو المراجع أو المسؤول.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ---------- 5) سياسات الوصول (RLS) ----------
-- تحل محل السياسات المفتوحة. كل سياسة تبدأ بـ (not rls_enforced()) لتبقى القاعدة كما هي
-- حتى تفعيل auth_required، ثم تُفرض الصلاحيات بالكامل.
alter table public.roles enable row level security;
alter table public.units enable row level security;

do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and (tablename, policyname) in (('tasks','tasks_all'), ('meetings','meetings_all'), ('files','files_all'),
                                             ('projects','projects_all'), ('users','users_all'), ('kpis','kpis_all'),
                                             ('task_events','task_events_read'), ('task_events','task_events_insert'))
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- إعادة إنشاء آمنة لإمكانية تشغيل الملف أكثر من مرة
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and policyname like 'p2\_%'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- المهام
create policy p2_tasks_select on public.tasks for select
  using (not public.rls_enforced() or public.can_see_task(public.me(), tasks));
create policy p2_tasks_insert on public.tasks for insert
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'task.create', project));
create policy p2_tasks_update on public.tasks for update
  using (not public.rls_enforced() or (public.can_see_task(public.me(), tasks) and public.has_perm(public.me(), 'task.edit', project)))
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'task.edit', project));
create policy p2_tasks_delete on public.tasks for delete
  using (not public.rls_enforced() or public.has_perm(public.me(), 'task.delete', project));

-- الاجتماعات
create policy p2_meetings_select on public.meetings for select
  using (not public.rls_enforced() or public.can_see_meeting(public.me(), meetings));
create policy p2_meetings_insert on public.meetings for insert
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'meeting.create', nullif(project, '')));
create policy p2_meetings_update on public.meetings for update
  using (not public.rls_enforced() or (public.can_see_meeting(public.me(), meetings) and public.has_perm(public.me(), 'meeting.edit', nullif(project, ''))))
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'meeting.edit', nullif(project, '')));
create policy p2_meetings_delete on public.meetings for delete
  using (not public.rls_enforced() or (public.can_see_meeting(public.me(), meetings) and public.has_perm(public.me(), 'meeting.delete', nullif(project, ''))));

-- الملفات
create policy p2_files_select on public.files for select
  using (not public.rls_enforced() or public.can_see_file(public.me(), files));
create policy p2_files_insert on public.files for insert
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'file.upload', nullif(project, '')));
create policy p2_files_delete on public.files for delete
  using (not public.rls_enforced() or (public.can_see_file(public.me(), files) and public.has_perm(public.me(), 'file.delete', nullif(project, ''))));

-- المشاريع
create policy p2_projects_select on public.projects for select
  using (not public.rls_enforced() or public.can_see_project(public.me(), name));
create policy p2_projects_insert on public.projects for insert
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'project.create'));
create policy p2_projects_update on public.projects for update
  using (not public.rls_enforced() or (public.can_see_project(public.me(), name) and public.has_perm(public.me(), 'project.edit')))
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'project.edit'));
create policy p2_projects_delete on public.projects for delete
  using (not public.rls_enforced() or public.has_perm(public.me(), 'project.delete'));

-- المستخدمون: القراءة لكل مستخدم مسجّل (لعرض الأسماء)، والتعديل لمدير المستخدمين
create policy p2_users_select on public.users for select
  using (not public.rls_enforced() or public.me() is not null);
create policy p2_users_write on public.users for all
  using (not public.rls_enforced() or public.has_perm(public.me(), 'users.manage'))
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'users.manage'));

-- مؤشرات الأداء
create policy p2_kpis_select on public.kpis for select
  using (not public.rls_enforced() or public.has_perm(public.me(), 'report.kpis'));
create policy p2_kpis_write on public.kpis for all
  using (not public.rls_enforced() or public.has_perm(public.me(), 'kpi.edit'))
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'kpi.edit'));

-- سجل التدقيق: قراءة لصاحب صلاحية السجل أو لمن يرى المهمة، والإضافة باسم المستخدم نفسه فقط
create policy p2_events_select on public.task_events for select
  using (not public.rls_enforced() or public.has_perm(public.me(), 'report.audit')
         or exists (select 1 from public.tasks t where t.id = task_events.task_id and public.can_see_task(public.me(), t)));
create policy p2_events_insert on public.task_events for insert
  with check (not public.rls_enforced() or (public.me() is not null and actor_id = public.me()));

-- الأدوار والوحدات
create policy p2_roles_select on public.roles for select
  using (not public.rls_enforced() or public.me() is not null);
create policy p2_roles_write on public.roles for all
  using (not public.rls_enforced() or public.has_perm(public.me(), 'roles.manage'))
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'roles.manage'));
create policy p2_units_select on public.units for select
  using (not public.rls_enforced() or public.me() is not null);
create policy p2_units_write on public.units for all
  using (not public.rls_enforced() or public.has_perm(public.me(), 'units.manage'))
  with check (not public.rls_enforced() or public.has_perm(public.me(), 'units.manage'));

-- التخزين (bucket: archive) — الملف يُرى بقدر رؤية سجله في جدول files
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'archive_all') then
    drop policy archive_all on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'p2\_archive%') then
    drop policy if exists p2_archive_select on storage.objects;
    drop policy if exists p2_archive_insert on storage.objects;
    drop policy if exists p2_archive_delete on storage.objects;
  end if;
end $$;
create policy p2_archive_select on storage.objects for select
  using (bucket_id = 'archive' and (not public.rls_enforced()
         or exists (select 1 from public.files f where f.path = storage.objects.name and public.can_see_file(public.me(), f))));
create policy p2_archive_insert on storage.objects for insert
  with check (bucket_id = 'archive' and (not public.rls_enforced() or public.has_perm_any(public.me(), 'file.upload')));
create policy p2_archive_delete on storage.objects for delete
  using (bucket_id = 'archive' and (not public.rls_enforced()
         or exists (select 1 from public.files f where f.path = storage.objects.name
                    and public.can_see_file(public.me(), f) and public.has_perm(public.me(), 'file.delete', nullif(f.project, '')))));
