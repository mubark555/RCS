-- =====================================================================
--  إشعارات الجرس لكل موظف على حدة (بدل قائمة واحدة يراها الجميع)
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run
--  آمن للتكرار، ولا يحذف أي بيانات. الإشعارات القديمة (بلا مستلم) تظهر للمدراء فقط.
-- =====================================================================

alter table public.notifications add column if not exists recipient text;  -- معرّف المستخدم المستلم

create index if not exists notifications_recipient_idx on public.notifications (recipient, created_at desc);
