// عميل Supabase للخادم فقط. بعد إغلاق السياسات العامة يجب استخدام مفتاح service_role
// (لا يُكشف للمتصفح أبداً — بلا بادئة NEXT_PUBLIC)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = service || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const serverCloud = Boolean(url && key);
export const hasServiceRole = Boolean(url && service);
export const sb = serverCloud ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
