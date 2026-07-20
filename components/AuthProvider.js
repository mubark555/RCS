"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase, isCloud } from "@/lib/supabase";

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
    async signInWithEmail(email) {
      if (!isCloud) return { error: null };
      const redirect = typeof window !== "undefined" ? window.location.origin : undefined;
      return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    },
    async signOut() {
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
      signOut: async () => {},
    }
  );
}
