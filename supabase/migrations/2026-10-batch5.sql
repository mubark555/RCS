-- =====================================================================
--  الدفعة 5: تصنيف الحضور في الاجتماعات + المنظّم + الهدف
--  شغّل هذا الملف مرة واحدة من Supabase → SQL Editor → Run (بعد الدفعات 1–4)
--  آمن للتكرار، ولا يحذف أي بيانات.
--  (قبل تشغيله يعمل النظام كالمعتاد: طبقة البيانات تتجاوز الأعمدة غير الموجودة)
-- =====================================================================
alter table public.meetings add column if not exists attendance jsonb default '{}'::jsonb; -- {"الاسم": "mandatory|key|optional"}
alter table public.meetings add column if not exists organizer  text  default '';           -- المنظّم (الافتراضي: من أنشأ الاجتماع)
alter table public.meetings add column if not exists objective  text  default '';           -- هدف الاجتماع
alter table public.users    add column if not exists aliases    jsonb default '[]'::jsonb;   -- أسماء بديلة تربط البيانات القديمة (مثل Ohood) بالمستخدم
