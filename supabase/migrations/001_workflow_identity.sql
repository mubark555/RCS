-- =====================================================================
--  ترحيل 001 — مزامنة المخطط + الهوية + سير عمل المهام + سجل التدقيق
--  إضافي فقط: لا يحذف أي جدول أو عمود أو بيانات. آمن لإعادة التشغيل.
--  شغّله في Supabase > SQL Editor بعد schema.sql (وبعد seed.sql إن وُجد).
--  يُنصح بأخذ نسخة احتياطية قبل التشغيل على قاعدة الإنتاج.
-- =====================================================================

-- ---------- 1) أعمدة يستخدمها الكود ولم تكن في schema.sql ----------
alter table public.projects add column if not exists managers jsonb default '[]'::jsonb;
alter table public.projects add column if not exists clients  jsonb default '[]'::jsonb;
alter table public.projects add column if not exists members  jsonb default '[]'::jsonb;
alter table public.projects add column if not exists logo     text  default '';
alter table public.projects add column if not exists default_workflow text default 'review';
alter table public.meetings add column if not exists action_items jsonb default '[]'::jsonb;
alter table public.meetings add column if not exists attendance   jsonb default '{}'::jsonb; -- {"الاسم": "mandatory|key|optional"}
alter table public.meetings add column if not exists organizer    text  default '';
alter table public.meetings add column if not exists objective    text  default '';
alter table public.tasks    add column if not exists completed_at timestamptz;

-- ---------- 2) الهوية: ربط المستخدم بحساب الدخول + أسماء بديلة ----------
alter table public.users add column if not exists auth_id uuid;
alter table public.users add column if not exists aliases jsonb default '[]'::jsonb;  -- أسماء قديمة مثل "Ohood"
alter table public.users add column if not exists can_self_approve boolean default false;
create unique index if not exists users_auth_id_key on public.users (auth_id) where auth_id is not null;

-- إعدادات على مستوى الخادم (لا تُعدَّل من الواجهة)
create table if not exists public.app_config (
  key   text primary key,
  value jsonb not null
);
insert into public.app_config (key, value) values ('auth_required', 'false'::jsonb)
on conflict (key) do nothing;
alter table public.app_config enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='app_config' and policyname='app_config_read') then
    create policy app_config_read on public.app_config for select using (true);
  end if;
end $$;

-- ---------- 3) حقول سير العمل في المهام ----------
alter table public.tasks add column if not exists stage             text;
alter table public.tasks add column if not exists workflow          text;
alter table public.tasks add column if not exists assignee_id       uuid references public.users(id) on delete set null;
alter table public.tasks add column if not exists reviewer_id       uuid references public.users(id) on delete set null;
alter table public.tasks add column if not exists approver_id       uuid references public.users(id) on delete set null;
alter table public.tasks add column if not exists final_approver_id uuid references public.users(id) on delete set null;
alter table public.tasks add column if not exists created_by        uuid references public.users(id) on delete set null;
alter table public.tasks add column if not exists meeting_id        uuid references public.meetings(id) on delete set null;
alter table public.tasks add column if not exists submitted_at      timestamptz;
alter table public.tasks add column if not exists review_note       text default '';
alter table public.tasks add column if not exists hold_reason       text default '';

create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists tasks_stage_idx    on public.tasks (stage);

-- ---------- 4) دوال مساعدة (مطابقة لـ lib/workflow.mjs) ----------
create or replace function public.norm_name(s text) returns text
language sql immutable as $$
  select regexp_replace(
           translate(lower(regexp_replace(coalesce(s, ''), '\([^)]*\)?', ' ', 'g')), 'أإآةى', 'اااهي'),
           '[^a-zء-ي]+', '', 'g')
$$;

create or replace function public.user_matches(p_name text, p_user uuid) returns boolean
language sql stable as $$
  select public.norm_name(p_name) <> '' and exists (
    select 1 from public.users u
    where u.id = p_user
      and (public.norm_name(u.name) = public.norm_name(p_name)
           or exists (select 1 from jsonb_array_elements_text(coalesce(u.aliases, '[]'::jsonb)) a
                      where public.norm_name(a) = public.norm_name(p_name)))
  )
$$;

create or replace function public.derive_stage(p_status text, p_approval text) returns text
language sql immutable as $$
  select case
    when p_status = 'Completed' then 'closed'
    when p_status = 'On Hold' then 'on_hold'
    when p_approval = 'Pending Review' then 'in_review'
    when p_approval = 'Revision needed' then 'changes_requested'
    when p_status = 'In Progress' then 'in_progress'
    else 'not_started' end
$$;

create or replace function public.derive_workflow(p_approval text) returns text
language sql immutable as $$
  select case when p_approval in ('Pending Review', 'Revision needed') then 'review' else 'simple' end
$$;

create or replace function public.workflow_steps(p_workflow text) returns text[]
language sql immutable as $$
  select case p_workflow
    when 'review' then array['review']
    when 'approve' then array['final']
    when 'review_approve' then array['review', 'approval']
    when 'full' then array['review', 'approval', 'final']
    else array[]::text[] end
$$;

create or replace function public.step_stage(p_step text) returns text
language sql immutable as $$
  select case p_step when 'review' then 'in_review' when 'approval' then 'pending_approval' when 'final' then 'pending_final' end
$$;

create or replace function public.stage_status(p_stage text) returns text
language sql immutable as $$
  select case p_stage when 'not_started' then 'Not Started' when 'on_hold' then 'On Hold'
                      when 'closed' then 'Completed' else 'In Progress' end
$$;

-- ---------- 5) تعبئة المهام الحالية (مرة واحدة، قبل تفعيل الحماية) ----------
update public.tasks set
  stage    = coalesce(stage, public.derive_stage(status, approval_status)),
  workflow = coalesce(workflow, public.derive_workflow(approval_status))
where stage is null or workflow is null;

-- ربط المسؤول النصي بالمستخدم عند وجود تطابق واحد فقط
update public.tasks t set assignee_id = m.uid
from (
  select t2.id as tid, min(u.id::text)::uuid as uid, count(*) as n
  from public.tasks t2 join public.users u on public.user_matches(t2.assigned_to, u.id)
  where t2.assignee_id is null
  group by t2.id
) m
where t.id = m.tid and m.n = 1;

-- ---------- 6) سجل التدقيق (إضافة وقراءة فقط — لا تعديل ولا حذف) ----------
create table if not exists public.task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid,                -- بلا مفتاح أجنبي: يبقى السجل بعد حذف المهمة
  task_title  text default '',
  actor_id    uuid,
  actor_name  text default '',
  action      text not null,
  from_stage  text,
  to_stage    text,
  note        text default '',
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);
create index if not exists task_events_task_idx on public.task_events (task_id, created_at);
alter table public.task_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='task_events' and policyname='task_events_read') then
    create policy task_events_read on public.task_events for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='task_events' and policyname='task_events_insert') then
    create policy task_events_insert on public.task_events for insert with check (true);
  end if;
end $$;

-- ---------- 7) المستخدم الحالي ----------
-- مع تفعيل الدخول: من auth.uid(). بدونه (auth_required = false): يُقبل المعرّف المرسل من الواجهة،
-- وهذا مماثل للوضع الحالي ويجب إيقافه بتفعيل auth_required بعد ربط الحسابات.
create or replace function public.current_app_user(p_fallback uuid) returns public.users
language plpgsql stable security definer set search_path = public as $$
declare
  u public.users;
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    select * into u from public.users where auth_id = v_uid;
  elsif coalesce((select value from public.app_config where key = 'auth_required'), 'false'::jsonb) = 'false'::jsonb then
    select * into u from public.users where id = p_fallback;
  end if;
  return u;
end $$;

-- ---------- 8) دالة الانتقال بين المراحل — الطريق الوحيد لتغيير حالة المهمة ----------
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
  v_mgr    boolean;
  v_asg    boolean;
  v_exec   boolean;
  v_desig  uuid;
  v_note   text := btrim(coalesce(p_note, ''));
begin
  u := public.current_app_user(p_actor);
  if u.id is null then
    raise exception 'لم يتم التعرف على المستخدم' using errcode = '42501';
  end if;

  select * into t from public.tasks where id = p_task for update;
  if t.id is null then
    raise exception 'المهمة غير موجودة' using errcode = 'P0002';
  end if;

  v_from  := coalesce(t.stage, public.derive_stage(t.status, t.approval_status));
  t.workflow := coalesce(t.workflow, public.derive_workflow(t.approval_status));
  v_steps := public.workflow_steps(t.workflow);
  v_mgr   := u.role = 'manager';
  v_asg   := case when t.assignee_id is not null then t.assignee_id = u.id
                  else public.user_matches(t.assigned_to, u.id) end;
  v_exec  := v_asg or (t.assignee_id is null and btrim(coalesce(t.assigned_to, '')) = '' and v_mgr);
  v_step  := case v_from when 'in_review' then 'review' when 'pending_approval' then 'approval'
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
    if not (v_exec or v_mgr) or v_from not in ('not_started', 'in_progress', 'changes_requested') then
      raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء في المرحلة الحالية للمهمة.' using errcode = '42501';
    end if;
    if v_note = '' then raise exception 'يجب كتابة سبب التوقف.' using errcode = '22023'; end if;
    v_to := 'on_hold';
    t.hold_reason := v_note;

  elsif p_action = 'resume' then
    if not (v_exec or v_mgr) or v_from <> 'on_hold' then
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
       or (v_desig is null and not v_mgr) then
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
    if not v_mgr or v_from <> 'closed' then
      raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء في المرحلة الحالية للمهمة.' using errcode = '42501';
    end if;
    if v_note = '' then raise exception 'يجب كتابة سبب إعادة الفتح.' using errcode = '22023'; end if;
    v_to := 'in_progress';

  else
    raise exception 'إجراء غير معروف' using errcode = '22023';
  end if;

  -- مزامنة الحقول القديمة لتبقى الصفحات الحالية متسقة
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

grant execute on function public.task_transition(uuid, text, text, uuid) to anon, authenticated;

-- ---------- 9) حماية: منع تغيير الحالة مباشرة خارج دالة الانتقال ----------
create or replace function public.tasks_guard() returns trigger
language plpgsql as $$
begin
  if current_setting('app.task_transition', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      -- مستخدم مسجّل: المهمة الجديدة تبدأ دائماً من أول المسار
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

  -- المنفذ لا يغيّر مسار مهمته ولا مراجعها أو معتمدها (يتطلب تفعيل الدخول لمعرفة المستخدم)
  if auth.uid() is not null
     and (new.workflow is distinct from old.workflow
          or new.reviewer_id is distinct from old.reviewer_id
          or new.approver_id is distinct from old.approver_id
          or new.final_approver_id is distinct from old.final_approver_id
          or new.assignee_id is distinct from old.assignee_id) then
    declare
      u public.users := public.current_app_user(null);
    begin
      if u.id is null or (u.role <> 'manager' and (
           old.assignee_id = u.id
           or (old.assignee_id is null and public.user_matches(old.assigned_to, u.id)))) then
        raise exception 'لا يمكن للمنفذ تغيير مسار الاعتماد أو المراجع أو المسؤول.' using errcode = '42501';
      end if;
    end;
  end if;
  return new;
end $$;

drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before insert or update on public.tasks
for each row execute function public.tasks_guard();
