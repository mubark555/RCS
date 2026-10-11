-- اختبار الصلاحيات وفصل المشاريع على مستوى قاعدة البيانات (RLS) بدور authenticated كما في Supabase.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

grant usage on schema public, storage to anon, authenticated;
grant all on all tables in schema public, storage to anon, authenticated;

create or replace function public.t_assert(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'فشل: %', msg; end if;
end $$;
create or replace function public.t_fails(sql text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'فشل (كان يجب الرفض): %', msg;
exception when others then
  if sqlerrm like 'فشل (كان%' then raise; end if;
end $$;
grant execute on function public.t_assert(boolean, text), public.t_fails(text, text) to anon, authenticated;

-- البيانات
delete from public.users where name in ('أ تشغيل', 'ب تشغيل', 'عضو هوميرا', 'تنفيذي', 'مدير وحدة', 'عميل هوميرا');
insert into public.units (id, name, managers) values ('20000000-0000-0000-0000-000000000001', 'التسويق', '["مدير وحدة"]');
insert into public.users (id, name, role, auth_id, email) values
  ('30000000-0000-0000-0000-00000000000a', 'أ تشغيل', 'ops_manager', '40000000-0000-0000-0000-00000000000a', ''),
  ('30000000-0000-0000-0000-00000000000b', 'ب تشغيل', 'ops_manager', '40000000-0000-0000-0000-00000000000b', ''),
  ('30000000-0000-0000-0000-00000000000c', 'عضو هوميرا', 'member', '40000000-0000-0000-0000-00000000000c', ''),
  ('30000000-0000-0000-0000-00000000000d', 'تنفيذي', 'executive', '40000000-0000-0000-0000-00000000000d', ''),
  ('30000000-0000-0000-0000-00000000000e', 'مدير وحدة', 'unit_manager', '40000000-0000-0000-0000-00000000000e', ''),
  ('30000000-0000-0000-0000-00000000000f', 'عميل هوميرا', 'client', null, 'client@homera.test');
insert into public.projects (name, ops_managers, members, clients) values
  ('Homera', '["أ تشغيل"]', '["عضو هوميرا"]', '["عميل هوميرا"]'),
  ('ZL.Tours', '["ب تشغيل"]', '[]', '[]');
insert into public.projects (name, unit_id) values ('Jaz chocolate', '20000000-0000-0000-0000-000000000001');
insert into public.tasks (id, task, project, workflow, assignee_id) values
  ('50000000-0000-0000-0000-000000000001', 'مهمة هوميرا', 'Homera', 'full', '30000000-0000-0000-0000-00000000000c'),
  ('50000000-0000-0000-0000-000000000002', 'مهمة زد إل', 'ZL.Tours', 'review', null);
insert into public.meetings (title, project, start_at, attendees) values
  ('اجتماع زد إل', 'ZL.Tours', now(), '["عضو هوميرا"]'),
  ('اجتماع زد إل 2', 'ZL.Tours', now(), '[]');
insert into public.files (name, path, project) values ('ملف زد', 'zl.pdf', 'ZL.Tours'), ('ملف هوميرا', 'hm.pdf', 'Homera');
insert into storage.objects (bucket_id, name) values ('archive', 'zl.pdf'), ('archive', 'hm.pdf');

-- 1) قبل التفعيل: القاعدة مفتوحة كما هي اليوم (لا تغيير في السلوك الحالي)
set role anon;
select public.t_assert((select count(*) from public.tasks) > 2, 'قبل التفعيل: المجهول يرى المهام');
reset role;

-- 2) التفعيل
update public.app_config set value = 'true' where key = 'auth_required';

-- مجهول بلا جلسة: لا شيء
set role anon;
set test.uid = '';
select public.t_assert((select count(*) from public.tasks) = 0, 'بعد التفعيل: المجهول لا يرى أي مهمة');
select public.t_assert((select count(*) from public.users) = 0, 'المجهول لا يرى المستخدمين');
reset role;

-- 3) مدير التشغيل (أ): مشروعه فقط
set role authenticated;
set test.uid = '40000000-0000-0000-0000-00000000000a';
select public.t_assert((select array_agg(name order by name) from public.projects) = array['Homera'], 'أ يرى Homera فقط');
select public.t_assert((select count(*) from public.tasks where project = 'ZL.Tours') = 0, 'أ لا يرى مهام ZL.Tours');
select public.t_assert((select count(*) from public.tasks where id = '50000000-0000-0000-0000-000000000002') = 0, 'أ لا يفتح مهمة ZL.Tours بمعرّفها مباشرة');
select public.t_assert((select count(*) from public.meetings where project = 'ZL.Tours') = 0, 'أ لا يرى اجتماعات ZL.Tours');
select public.t_assert((select count(*) from public.files) = 1, 'أ يرى ملفات Homera فقط');
select public.t_assert((select count(*) from storage.objects where name = 'zl.pdf') = 0, 'أ لا يحمّل ملف ZL.Tours من التخزين');
select public.t_fails($$insert into public.tasks (task, project) values ('محاولة', 'ZL.Tours')$$, 'أ لا ينشئ مهمة في ZL.Tours');
update public.tasks set notes = 'اختراق' where id = '50000000-0000-0000-0000-000000000002';
reset role;
select public.t_assert((select notes from public.tasks where id = '50000000-0000-0000-0000-000000000002') is distinct from 'اختراق', 'أ لا يعدّل مهمة ZL.Tours');
set role authenticated;
set test.uid = '40000000-0000-0000-0000-00000000000a';
insert into public.tasks (task, project) values ('مهمة جديدة من أ', 'Homera');
select public.t_assert((select count(*) from public.users) > 0, 'المستخدم المسجّل يرى قائمة المستخدمين');
select public.t_fails($$insert into public.users (name) values ('دخيل')$$, 'أ لا يضيف مستخدمين');
select public.t_fails($$insert into public.task_events (task_id, actor_id, actor_name, action) values (gen_random_uuid(), '30000000-0000-0000-0000-00000000000b', 'ب', 'edit')$$, 'لا تزوير لهوية منفذ الإجراء في السجل');
select public.t_assert((select count(*) from public.kpis) = 0, 'مدير التشغيل لا يرى مؤشرات الأداء');
reset role;

-- 4) مدير الوحدة: مشاريع وحدته
set role authenticated;
set test.uid = '40000000-0000-0000-0000-00000000000e';
select public.t_assert((select array_agg(name order by name) from public.projects) = array['Jaz chocolate'], 'مدير الوحدة يرى مشاريع وحدته فقط');
reset role;

-- 5) الموظف: مهامه ومشروعه + الاجتماع المدعو إليه في مشروع آخر
set role authenticated;
set test.uid = '40000000-0000-0000-0000-00000000000c';
select public.t_assert((select count(*) from public.meetings where title = 'اجتماع زد إل') = 1, 'المدعو يرى الاجتماع');
select public.t_assert((select count(*) from public.meetings where title = 'اجتماع زد إل 2') = 0, 'ولا يرى غيره في المشروع نفسه');
select public.t_fails($$delete from public.tasks where id = '50000000-0000-0000-0000-000000000001' returning 1/0$$, 'نتيجة الحذف');
reset role;
select public.t_assert((select count(*) from public.tasks where id = '50000000-0000-0000-0000-000000000001') = 1, 'الموظف لا يحذف المهام');

-- 6) سير العمل بالصلاحيات: أ يراجع في مشروعه ولا يعتمد نهائياً
set role authenticated;
set test.uid = '40000000-0000-0000-0000-00000000000c';
select public.task_transition('50000000-0000-0000-0000-000000000001', 'submit');
set test.uid = '40000000-0000-0000-0000-00000000000b';
select public.t_fails($$select public.task_transition('50000000-0000-0000-0000-000000000001', 'accept')$$, 'ب لا يراجع في مشروع غيره');
set test.uid = '40000000-0000-0000-0000-00000000000a';
select public.task_transition('50000000-0000-0000-0000-000000000001', 'accept');
select public.task_transition('50000000-0000-0000-0000-000000000001', 'accept');
select public.t_fails($$select public.task_transition('50000000-0000-0000-0000-000000000001', 'accept')$$, 'المراجع لا يعتمد نهائياً');
set test.uid = '40000000-0000-0000-0000-00000000000d';
select public.task_transition('50000000-0000-0000-0000-000000000001', 'accept');
reset role;
select public.t_assert((select stage from public.tasks where id = '50000000-0000-0000-0000-000000000001') = 'closed', 'الإدارة العليا تعتمد نهائياً');

-- 7) الإدارة العليا ترى كل شيء والسجل
set role authenticated;
set test.uid = '40000000-0000-0000-0000-00000000000d';
select public.t_assert((select count(*) from public.projects) >= 3, 'الإدارة العليا ترى كل المشاريع');
select public.t_assert((select count(*) from public.task_events) > 0, 'الإدارة العليا ترى سجل الإجراءات');
reset role;

-- 8) ربط حساب العميل عند أول دخول بالبريد، ثم رؤية مشروعه فقط دون أي تعديل
set role authenticated;
set test.uid = '40000000-0000-0000-0000-0000000000f0';
set test.jwt = '{"email": "Client@Homera.test"}';
select public.t_assert((select name from public.link_my_account()) = 'عميل هوميرا', 'ربط الحساب بالبريد');
select public.t_assert((select array_agg(name) from public.projects) = array['Homera'], 'العميل يرى مشروعه فقط');
select public.t_fails($$insert into public.tasks (task, project) values ('من العميل', 'Homera')$$, 'العميل لا ينشئ مهام');
reset role;

update public.app_config set value = 'false' where key = 'auth_required';
do $$ begin raise warning 'كل اختبارات الصلاحيات نجحت'; end $$;
