"use client";

import { supabase } from "./supabase";

// استدعاء مسار البريد مع رمز جلسة المستخدم (المسار يرفض أي طلب بلا جلسة صالحة)
export async function postNotify(payload) {
  const headers = { "Content-Type": "application/json" };
  try {
    const { data } = supabase ? await supabase.auth.getSession() : { data: null };
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {}
  return fetch("/api/notify", { method: "POST", headers, body: JSON.stringify(payload) });
}
