"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase, isCloud } from "@/lib/supabase";
import { endSession } from "@/lib/sessions";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isCloud); // في الوضع المحلي لا انتظار

  useEffect(() => {
    if (!isCloud) {
      setLoading(false);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session || null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const value = {
    isCloud,
    loading,
    session,
    authEmail: session?.user?.email || null,
    // في الوضع المحلي التجريبي يعتبر المستخدم مسجّلاً دائماً
    authed: isCloud ? !!session : true,
    // إرسال رمز تحقق (OTP) إلى البريد — بلا رابط، رمز مكوّن من 6 أرقام
    async signInWithEmail(email) {
      if (!isCloud) return { error: null };
      const addr = String(email || "").trim();
      // فحص مسبق: لا نرسل رمزاً (ولا ننشئ حساباً) لبريد غير مضاف في الفريق أو موقوف.
      // إن لم تُشغَّل ترقية الحماية بعد (الدالة غير موجودة) نكمل كالمعتاد.
      try {
        const { data, error } = await supabase.rpc("can_request_login", { p_email: addr });
        if (!error && data === false) {
          return { error: { message: "هذا البريد غير مضاف في النظام أو موقوف — تواصل مع مدير النظام." } };
        }
      } catch {}
      return supabase.auth.signInWithOtp({ email: addr });
    },
    // التحقق من الرمز الذي أدخله المستخدم
    async verifyOtp(email, token) {
      if (!isCloud) return { error: null };
      return supabase.auth.verifyOtp({ email, token, type: "email" });
    },
    async signOut() {
      await endSession().catch(() => {}); // توثيق وقت الخروج قبل إنهاء الجلسة
      if (isCloud) await supabase.auth.signOut();
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return (
    useContext(AuthCtx) || {
      isCloud: false,
      loading: false,
      session: null,
      authEmail: null,
      authed: true,
      signInWithEmail: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
      signOut: async () => {},
    }
  );
}
