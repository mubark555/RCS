-- اختبار سير العمل على مستوى قاعدة البيانات. يفشل التشغيل عند أول خطأ (ON_ERROR_STOP).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- مستخدمون للاختبار
insert into public.users (id, name, role, aliases) values
  ('00000000-0000-0000-0000-00000000000a', 'أنور', 'member', '["Anwar"]'),
  ('00000000-0000-0000-0000-00000000000b', 'مراجع', 'member', '[]'),
  ('00000000-0000-0000-0000-00000000000c', 'مدير', 'manager', '[]'),
  ('00000000-0000-0000-0000-00000000000d', 'مبارك', 'member', '["Mubarak","Mubrak"]');

create or replace function pg_temp.expect_error(sql text, pattern text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'كان يُتوقع فشل: %', sql;
exception when others then
  if sqlerrm like 'كان يُتوقع فشل%' then raise; end if;
  if sqlerrm !~ pattern then raise exception 'رسالة غير متوقعة: % (المتوقع: %)', sqlerrm, pattern; end if;
end $$;

do $$
declare
  anwar uuid := '00000000-0000-0000-0000-00000000000a';
  rev   uuid := '00000000-0000-0000-0000-00000000000b';
  boss  uuid := '00000000-0000-0000-0000-00000000000c';
  tid uuid;
  t public.tasks;
begin
  -- مطابقة الأسماء
  assert public.norm_name('Ohood (IT )') = 'ohood', 'norm ohood';
  assert public.norm_name('إيمان') = public.norm_name('ايمان'), 'norm alef';
  assert public.user_matches('Mubrak (IT)', '00000000-0000-0000-0000-00000000000d'), 'alias match';

  -- تعبئة البيانات القديمة: كل المهام لها مرحلة ومسار
  assert (select count(*) from public.tasks where stage is null or workflow is null) = 0, 'backfill';
  assert (select count(*) from public.tasks where status = 'Completed' and stage <> 'closed') = 0, 'closed backfill';

  insert into public.tasks (task, assignee_id, assigned_to, workflow, reviewer_id, stage, status)
  values ('اختبار', anwar, 'أنور', 'review_approve', rev, 'not_started', 'Not Started') returning id into tid;

  -- لا تغيير مباشر للحالة
  perform pg_temp.expect_error(format('update public.tasks set status = %L where id = %L', 'Completed', tid), 'سير العمل');
  perform pg_temp.expect_error(format('update public.tasks set stage = %L where id = %L', 'closed', tid), 'سير العمل');

  -- غير المسؤول لا ينفذ
  perform pg_temp.expect_error(format('select public.task_transition(%L, %L, %L, %L)', tid, 'submit', '', rev), 'صلاحية');

  t := public.task_transition(tid, 'start', '', anwar);
  assert t.stage = 'in_progress' and t.status = 'In Progress', 'start';
  t := public.task_transition(tid, 'submit', '', anwar);
  assert t.stage = 'in_review' and t.approval_status = 'Pending Review', 'submit';

  -- المنفذ لا يعتمد نفسه
  perform pg_temp.expect_error(format('select public.task_transition(%L, %L, %L, %L)', tid, 'accept', '', anwar), 'صلاحية');
  -- المدير لا يتجاوز المراجع المحدد
  perform pg_temp.expect_error(format('select public.task_transition(%L, %L, %L, %L)', tid, 'accept', '', boss), 'صلاحية');
  -- طلب التعديل يتطلب ملاحظات
  perform pg_temp.expect_error(format('select public.task_transition(%L, %L, %L, %L)', tid, 'request_changes', ' ', rev), 'ملاحظات');

  t := public.task_transition(tid, 'request_changes', 'أضف المصادر', rev);
  assert t.stage = 'changes_requested' and t.review_note = 'أضف المصادر', 'changes';
  t := public.task_transition(tid, 'submit', '', anwar);
  assert t.stage = 'in_review' and t.review_note = '', 'resubmit';
  t := public.task_transition(tid, 'accept', '', rev);
  assert t.stage = 'pending_approval', 'review accepted';
  -- لا يوجد صاحب موافقة محدد: المراجع العضو لا يوافق، والمدير يوافق
  perform pg_temp.expect_error(format('select public.task_transition(%L, %L, %L, %L)', tid, 'accept', '', rev), 'صلاحية');
  t := public.task_transition(tid, 'accept', '', boss);
  assert t.stage = 'closed' and t.status = 'Completed' and t.approval_status = 'Approved' and t.completed_at is not null, 'closed';

  -- إعادة الفتح للإدارة فقط وبسبب
  perform pg_temp.expect_error(format('select public.task_transition(%L, %L, %L, %L)', tid, 'reopen', 'x', anwar), 'صلاحية');
  t := public.task_transition(tid, 'reopen', 'خطأ', boss);
  assert t.stage = 'in_progress' and t.completed_at is null, 'reopen';

  -- سجل التدقيق
  assert (select count(*) from public.task_events where task_id = tid) = 7, 'events count';
  assert (select actor_name from public.task_events where task_id = tid and action = 'request_changes') = 'مراجع', 'event actor';

  -- مهمة قديمة بمسؤول نصي يطابق اسماً بديلاً
  insert into public.tasks (task, assigned_to, status) values ('قديمة', 'Mubrak (IT)', 'In Progress') returning id into tid;
  t := public.task_transition(tid, 'submit', '', '00000000-0000-0000-0000-00000000000d');
  assert t.stage = 'closed', 'legacy simple submit by alias';

  -- مع تفعيل الدخول: المعرّف المرسل من الواجهة لا يُقبل
  update public.app_config set value = 'true' where key = 'auth_required';
  insert into public.tasks (task, assignee_id, workflow) values ('دخول', anwar, 'review') returning id into tid;
  perform pg_temp.expect_error(format('select public.task_transition(%L, %L, %L, %L)', tid, 'start', '', anwar), 'التعرف');
  update public.users set auth_id = '10000000-0000-0000-0000-00000000000a' where id = anwar;
  perform set_config('test.uid', '10000000-0000-0000-0000-00000000000a', true);
  -- انتحال مستخدم آخر عبر p_actor لا يفيد: الهوية من auth.uid()
  t := public.task_transition(tid, 'start', '', boss);
  assert (select actor_id from public.task_events where task_id = tid order by created_at desc limit 1) = anwar, 'actor from auth';
  -- المنفذ لا يغيّر مسار مهمته
  perform pg_temp.expect_error(format('update public.tasks set workflow = %L where id = %L', 'simple', tid), 'للمنفذ');
  perform pg_temp.expect_error(format('update public.tasks set reviewer_id = %L where id = %L', anwar, tid), 'للمنفذ');
  -- مهمة جديدة من مستخدم مسجّل تبدأ دائماً من البداية
  insert into public.tasks (task, assignee_id, status, stage) values ('محاولة', anwar, 'Completed', 'closed') returning id into tid;
  assert (select stage from public.tasks where id = tid) = 'not_started', 'insert forced';
  perform set_config('test.uid', '', true);
  update public.app_config set value = 'false' where key = 'auth_required';

  raise warning 'كل اختبارات قاعدة البيانات نجحت';
end $$;
