"use client";

// تسجيل الدخول برمز لمرة واحدة (OTP) يُرسل إلى البريد الإلكتروني
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSettings } from "@/components/SettingsProvider";
import { usersStore, isCloud } from "@/lib/store";
import Icon from "@/components/Icon";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const { settings } = useSettings();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState(null); // { to, name, devCode }
  const [wait, setWait] = useState(0);
  const [expires, setExpires] = useState(0);
  const [enabled, setEnabled] = useState(null);
  const inputs = useRef([]);

  useEffect(() => {
    try { const e = window.localStorage.getItem("sp_last_email"); if (e) setEmail(e); } catch {}
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setEnabled(d.enabled);
      if (d.user) window.location.href = next;
    }).catch(() => setEnabled(false));
  }, []); // eslint-disable-line

  useEffect(() => {
    if (wait <= 0 && expires <= 0) return;
    const t = setInterval(() => { setWait((w) => Math.max(0, w - 1)); setExpires((x) => Math.max(0, x - 1)); }, 1000);
    return () => clearInterval(t);
  }, [wait > 0 || expires > 0]); // eslint-disable-line

  async function requestCode(e) {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const users = isCloud ? undefined : (await usersStore.list().catch(() => [])).map((u) => ({ id: u.id, name: u.name, role: u.role, email: u.email, title: u.title }));
      const r = await fetch("/api/auth/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, users, brand: { appName: settings.appName } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d.ok) {
        setErr(d.error || "تعذر إرسال الرمز");
        if (d.retryIn && step === "code") setWait(d.retryIn);
        return;
      }
      try { window.localStorage.setItem("sp_last_email", email.trim().toLowerCase()); } catch {}
      setInfo(d);
      setStep("code");
      setDigits(["", "", "", "", "", ""]);
      setWait(d.retryIn || 60);
      setExpires(d.expiresIn || 600);
      setTimeout(() => inputs.current[0]?.focus(), 50);
    } finally {
      setBusy(false);
    }
  }

  async function verify(code) {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, remember }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d.ok) {
        setErr(d.error || "الرمز غير صحيح");
        setDigits(["", "", "", "", "", ""]);
        if (!d.expired) setTimeout(() => inputs.current[0]?.focus(), 30);
        return;
      }
      try { window.localStorage.setItem("sp_viewer", d.user.id); } catch {}
      window.location.href = next;
    } finally {
      setBusy(false);
    }
  }

  function setDigit(i, v) {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) return fill(clean, i);
    const nx = [...digits];
    nx[i] = clean;
    setDigits(nx);
    if (clean && i < 5) inputs.current[i + 1]?.focus();
    if (nx.every(Boolean)) verify(nx.join(""));
  }
  function fill(str, from = 0) {
    const nx = [...digits];
    for (let k = 0; k < str.length && from + k < 6; k++) nx[from + k] = str[k];
    setDigits(nx);
    const last = Math.min(5, from + str.length);
    inputs.current[last]?.focus();
    if (nx.every(Boolean)) verify(nx.join(""));
  }
  function onKey(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i < 5) inputs.current[i + 1]?.focus();
  }

  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <span className="logo">
            {settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : settings.logoText}
          </span>
          <div>
            <b>{settings.appName}</b>
            <small>{settings.tagline}</small>
          </div>
        </div>

        {enabled === false ? (
          <div>
            <h1>الدخول بالرمز غير مفعّل</h1>
            <p className="muted">أضِف المتغيّر <code>AUTH_SECRET</code> على الخادم لتفعيل تسجيل الدخول برمز OTP.</p>
            <a className="btn primary block" href="/">الدخول إلى النظام</a>
          </div>
        ) : step === "email" ? (
          <form onSubmit={requestCode}>
            <h1>تسجيل الدخول</h1>
            <p className="muted">أدخل بريدك الإلكتروني المسجّل وسنرسل لك رمز دخول لمرة واحدة.</p>
            <label className="field">
              <span>البريد الإلكتروني</span>
              <div className="login-input">
                <Icon name="mail" size={18} />
                <input type="email" dir="ltr" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              </div>
            </label>
            {err && <div className="login-err">{err}</div>}
            <button className="btn primary block" disabled={busy || !email}>{busy ? "جاري الإرسال…" : "إرسال رمز الدخول"}</button>
          </form>
        ) : (
          <div>
            <h1>أدخل رمز التحقق</h1>
            <p className="muted">
              أرسلنا رمزاً من 6 أرقام إلى <b dir="ltr">{info?.to}</b>
              {info?.name ? ` (${info.name})` : ""}.
            </p>
            <div className="otp-boxes" dir="ltr" onPaste={(e) => { e.preventDefault(); fill(e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)); }}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputs.current[i] = el)}
                  value={d}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={i === 0 ? 6 : 1}
                  aria-label={`الرقم ${i + 1}`}
                  disabled={busy}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  onFocus={(e) => e.target.select()}
                  className={d ? "filled" : ""}
                />
              ))}
            </div>

            {info?.devCode && (
              <div className="login-dev">وضع التطوير (البريد غير مُعدّ): الرمز <b dir="ltr">{info.devCode}</b></div>
            )}
            {err && <div className="login-err">{err}</div>}

            <div className="login-meta">
              {expires > 0 ? <span>ينتهي الرمز خلال <b>{mmss(expires)}</b></span> : <span style={{ color: "#dc2626" }}>انتهت صلاحية الرمز</span>}
            </div>

            <label className="nb-check" style={{ justifyContent: "center" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> تذكّرني على هذا الجهاز
            </label>

            <button className="btn primary block" disabled={busy || digits.some((x) => !x)} onClick={() => verify(digits.join(""))}>
              {busy ? "جاري التحقق…" : "تأكيد الدخول"}
            </button>
            <div className="login-actions">
              <button className="link-btn" disabled={wait > 0 || busy} onClick={requestCode}>
                {wait > 0 ? `إعادة الإرسال بعد ${wait} ث` : "إعادة إرسال الرمز"}
              </button>
              <button className="link-btn" onClick={() => { setStep("email"); setErr(""); }}>تغيير البريد</button>
            </div>
          </div>
        )}

        <div className="login-foot"><Icon name="lock" size={13} /> دخول آمن برمز لمرة واحدة — لا حاجة لكلمة مرور</div>
      </div>
    </div>
  );
}

function safeNext(n) {
  if (!n || !n.startsWith("/") || n.startsWith("//") || n.startsWith("/login")) return "/";
  return n;
}
