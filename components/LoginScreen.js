"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useSettings } from "@/components/SettingsProvider";
import Icon from "@/components/Icon";

export default function LoginScreen() {
  const { signInWithEmail } = useAuth();
  const { settings } = useSettings();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setSending(true);
    setErr("");
    try {
      const { error } = await signInWithEmail(addr);
      if (error) setErr(error.message || "تعذّر الإرسال، تأكد من البريد وحاول مجدداً.");
      else setSent(true);
    } catch (e2) {
      setErr(e2?.message || "حدث خطأ غير متوقع.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <span className="logo" style={{ overflow: "hidden", padding: 0 }}>
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              settings.logoText
            )}
          </span>
          <div>
            <b>{settings.appName}</b>
            <small>{settings.tagline}</small>
          </div>
        </div>

        {sent ? (
          <div className="login-sent">
            <div className="ic"><Icon name="mail" size={30} /></div>
            <h2>تفقّد بريدك</h2>
            <p>
              أرسلنا رابط دخول إلى <b>{email}</b>.
              <br />
              افتح الرسالة واضغط على الرابط للدخول مباشرة.
            </p>
            <button className="btn ghost" onClick={() => { setSent(false); setEmail(""); }}>
              استخدام بريد آخر
            </button>
          </div>
        ) : (
          <>
            <h1>تسجيل الدخول</h1>
            <p className="sub">أدخل بريدك الإلكتروني وسنرسل لك رابط دخول آمن — بلا كلمة مرور.</p>
            <form onSubmit={submit}>
              <label className="field">
                <span>البريد الإلكتروني</span>
                <input
                  type="email"
                  dir="ltr"
                  placeholder="name@violet.sa"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              {err && <div className="login-err">{err}</div>}
              <button className="btn primary" type="submit" disabled={sending} style={{ width: "100%", justifyContent: "center", padding: 13, marginTop: 4 }}>
                {sending ? "جاري الإرسال…" : "إرسال رابط الدخول"}
              </button>
            </form>
            <div className="login-note">
              الدخول متاح فقط للأعضاء المسجّلين. إن لم يصلك الرابط، تواصل مع مدير النظام لإضافة بريدك.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
