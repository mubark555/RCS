"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/components/RoleProvider";
import { useSettings } from "@/components/SettingsProvider";

// يحجب النظام كاملاً حتى تسجيل الدخول (عند تفعيل NEXT_PUBLIC_AUTH_REQUIRED فقط)
export default function AuthGate({ children }) {
  const { authRequired, session, ready, viewer, signOut } = useRole();
  if (!authRequired) return children;
  if (session === undefined) return <div className="empty">جاري التحقق…</div>;
  if (!session) return <LoginScreen />;
  if (!ready) return <div className="empty">جاري التحميل…</div>;
  if (!viewer) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h2>الحساب غير مرتبط</h2>
          <p className="muted">
            تم تسجيل الدخول بالبريد <b>{session.user.email}</b> لكنه غير مرتبط بأي مستخدم في النظام.
            اطلب من مدير النظام إضافة هذا البريد إلى ملفك في صفحة «الفريق».
          </p>
          <button className="btn" onClick={signOut}>تسجيل الخروج</button>
        </div>
      </div>
    );
  }
  return children;
}

function LoginScreen() {
  const { settings } = useSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr("بيانات الدخول غير صحيحة.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!email.trim()) return setErr("اكتب بريدك أولاً.");
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ justifyContent: "center", marginBottom: 6 }}>
          <span className="logo">{settings.logoText}</span>
          <span><b>{settings.appName}</b><small>{settings.tagline}</small></span>
        </div>
        <h2>تسجيل الدخول</h2>
        <label className="field"><span>البريد الإلكتروني</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" dir="ltr" />
        </label>
        <label className="field"><span>كلمة المرور</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" dir="ltr" />
        </label>
        {err && <div className="login-err">{err}</div>}
        {sent && <div className="muted">أُرسل رابط إعادة التعيين إلى بريدك.</div>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "جاري الدخول…" : "دخول"}</button>
        <button className="btn ghost sm" type="button" onClick={reset} disabled={busy}>نسيت كلمة المرور؟</button>
      </form>
    </div>
  );
}
