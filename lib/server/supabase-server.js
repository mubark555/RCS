// عميل Supabase للخادم: يفضّل مفتاح service_role (لا يُكشف للمتصفح أبداً) ثم المفتاح العام
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const serverCloud = Boolean(url && key);
export const sb = serverCloud ? createClient(url, key, { auth: { persistSession: false } }) : null;
