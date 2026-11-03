import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// النظام يعمل بقاعدة بيانات سحابية إذا كانت المفاتيح موجودة،
// وإلا يتحول تلقائياً إلى الحفظ المحلي (localStorage) للتجربة.
export const isCloud = Boolean(url && anonKey);

// ملاحظة أمنية: المتصفح لا يقرأ ولا يكتب في قاعدة البيانات مباشرة — كل شيء يمر عبر /api/db
// على الخادم بعد التحقق من الصلاحيات. هذا العميل يُستخدم فقط لرفع الملفات عبر رابط موقّع
// يصدره الخادم (المفتاح العام وحده لا يملك أي صلاحية بعد تفعيل سياسات schema.sql).
export const supabase = isCloud ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

export const FILES_BUCKET = "archive";
