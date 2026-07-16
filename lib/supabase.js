import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// النظام يعمل بقاعدة بيانات سحابية إذا كانت المفاتيح موجودة،
// وإلا يتحول تلقائياً إلى الحفظ المحلي (localStorage) للتجربة.
export const isCloud = Boolean(url && anonKey);

export const supabase = isCloud ? createClient(url, anonKey) : null;

export const FILES_BUCKET = "archive";
