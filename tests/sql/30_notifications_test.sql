\set ON_ERROR_STOP 1
set client_min_messages = warning;
grant all on all tables in schema public to anon, authenticated;
insert into public.users (id, name, role, auth_id) values
  ('60000000-0000-0000-0000-00000000000a', 'مستلم', 'member', '70000000-0000-0000-0000-00000000000a'),
  ('60000000-0000-0000-0000-00000000000b', 'آخر', 'member', '70000000-0000-0000-0000-00000000000b');
update public.app_config set value = 'true' where key = 'auth_required';

set role authenticated;
set test.uid = '70000000-0000-0000-0000-00000000000b';
-- «آخر» يرسل إشعاراً لـ«مستلم» باسمه
insert into public.notifications (user_id, kind, title, created_by) values ('60000000-0000-0000-0000-00000000000a', 'task_assigned', 'مهمة', '60000000-0000-0000-0000-00000000000b');
select public.t_fails($$insert into public.notifications (user_id, kind, title, created_by) values ('60000000-0000-0000-0000-00000000000a', 'x', 'مزوّر', '60000000-0000-0000-0000-00000000000a')$$, 'لا إشعار باسم غيرك');
select public.t_assert((select count(*) from public.notifications) = 0, 'المرسل لا يقرأ إشعارات غيره');
select public.t_assert(public.set_my_notify_prefs('{"task_assigned": false}') is not null, 'حفظ التفضيلات');
set test.uid = '70000000-0000-0000-0000-00000000000a';
select public.t_assert((select count(*) from public.notifications) = 1, 'المستلم يرى إشعاره');
update public.notifications set read_at = now();
select public.t_assert((select count(*) from public.notifications where read_at is not null) = 1, 'المستلم يعلّم إشعاره كمقروء');
select public.t_fails($$update public.users set notify_prefs = '{}' where id = '60000000-0000-0000-0000-00000000000b' returning 1/0$$, 'لا تعديل لتفضيلات غيرك');
reset role;
select public.t_assert((select notify_prefs ->> 'task_assigned' from public.users where id = '60000000-0000-0000-0000-00000000000b') = 'false', 'التفضيلات محفوظة لصاحبها فقط');
update public.app_config set value = 'false' where key = 'auth_required';
do $$ begin raise warning 'كل اختبارات الإشعارات نجحت'; end $$;
