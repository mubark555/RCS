"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useSettings } from "@/components/SettingsProvider";

const C = {
  primary: "#E36A62",
  primaryHover: "#d05a52",
  ink: "#23201C",
  muted: "#9C968B",
  faint: "#B0AA9E",
  boxBg: "#F6F1E8",
  line: "#E7DFD0",
};

const KEYFRAMES = `
@keyframes lg_cardIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes lg_spin{to{transform:rotate(360deg)}}
@keyframes lg_floatBlob{0%,100%{transform:translate(0,0)}50%{transform:translate(18px,-22px)}}
@keyframes lg_floatBlob2{0%,100%{transform:translate(0,0)}50%{transform:translate(-16px,18px)}}
@keyframes lg_logoPop{0%{opacity:0;transform:scale(.6) rotate(-12deg)}60%{transform:scale(1.12) rotate(4deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
`;

export default function LoginScreen() {
  const { signInWithEmail, verifyOtp } = useAuth();
  const { settings } = useSettings();

  const [step, setStep] = useState("email"); // email | otp
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const inputs = useRef([]);

  // عدّاد إعادة الإرسال
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  async function sendCode(addr) {
    setLoading(true);
    setEmailError("");
    setOtpError("");
    try {
      const { error } = await signInWithEmail(addr);
      if (error) {
        setEmailError(error.message || "تعذّر الإرسال، تأكد من البريد وحاول مجدداً.");
        return false;
      }
      setResendIn(45);
      return true;
    } catch (e) {
      setEmailError(e?.message || "حدث خطأ غير متوقع.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function submitEmail(e) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    const ok = await sendCode(addr);
    if (ok) {
      setDigits(["", "", "", "", "", ""]);
      setStep("otp");
      setTimeout(() => inputs.current[0]?.focus(), 60);
    }
  }

  async function verify(code) {
    setLoading(true);
    setOtpError("");
    try {
      const { error } = await verifyOtp(email.trim(), code);
      // عند النجاح تتغيّر الجلسة تلقائياً وتُستبدل الواجهة بالنظام
      if (error) {
        setOtpError(error.message || "الرمز غير صحيح أو منتهي الصلاحية.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => inputs.current[0]?.focus(), 40);
      }
    } catch (e) {
      setOtpError(e?.message || "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }

  function setDigit(i, val) {
    const v = val.replace(/\D/g, "").slice(-1);
    const next = digits.slice();
    next[i] = v;
    setDigits(next);
    setOtpError("");
    if (v && i < 5) inputs.current[i + 1]?.focus();
    const code = next.join("");
    if (code.length === 6 && !next.includes("")) verify(code);
  }

  function onKey(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i < 5) inputs.current[i + 1]?.focus();
    if (e.key === "ArrowRight" && i > 0) inputs.current[i - 1]?.focus();
  }

  function onPaste(e) {
    e.preventDefault();
    const txt = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!txt) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < txt.length; i++) next[i] = txt[i];
    setDigits(next);
    setOtpError("");
    const last = Math.min(txt.length, 5);
    inputs.current[last]?.focus();
    if (txt.length === 6) verify(txt);
  }

  async function resend() {
    if (resendIn > 0) return;
    await sendCode(email.trim());
  }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px", background: "#F2EDE3", color: C.ink }}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* فقاعات زخرفية متحركة */}
      <div style={{ position: "absolute", top: -140, insetInlineEnd: -120, width: 460, height: 460, borderRadius: "50%", background: "radial-gradient(circle,#F7CFC9,transparent 70%)", animation: "lg_floatBlob 13s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -160, insetInlineStart: -120, width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle,#F6DCC9,transparent 70%)", animation: "lg_floatBlob2 17s ease-in-out infinite", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 452, background: "#fff", borderRadius: 30, padding: "42px 40px 36px", boxShadow: "0 30px 70px rgba(60,50,40,.12)", position: "relative", zIndex: 1, animation: "lg_cardIn .5s ease both" }}>
        {/* رأس العلامة */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 13, marginBottom: 32 }}>
          <div style={{ textAlign: "start" }}>
            <div style={{ fontSize: 23, fontWeight: 800, color: C.primary, lineHeight: 1 }}>{settings.appName}</div>
            <div style={{ fontSize: 10, letterSpacing: "2.5px", color: C.muted, fontWeight: 700, marginTop: 4 }}>{settings.tagline}</div>
          </div>
          <div style={{ width: 58, height: 58, borderRadius: 17, background: C.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, flex: "none", overflow: "hidden", boxShadow: "0 12px 26px rgba(227,106,98,.35)", animation: "lg_logoPop .7s .15s cubic-bezier(.34,1.56,.64,1) both" }}>
            {settings.logoUrl ? <img src={settings.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : settings.logoText}
          </div>
        </div>

        {step === "email" ? (
          <div style={{ animation: "lg_cardIn .35s ease both" }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.5px" }}>تسجيل الدخول</h1>
            <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.9, marginTop: 8 }}>أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق عبر الإيميل.</p>
            <form onSubmit={submitEmail} style={{ marginTop: 26 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 9 }}>البريد الإلكتروني</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.boxBg, border: `1.5px solid ${emailError ? C.primary : "transparent"}`, borderRadius: 14, padding: "0 14px", height: 54 }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#C9BFAD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="3" /><path d="m3 6 9 6 9-6" /></svg>
                <input value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(""); }} type="email" dir="ltr" placeholder="name@violet.sa" required autoFocus style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 15.5, color: C.ink, textAlign: "left" }} />
              </div>
              {emailError && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.primary, fontSize: 13, fontWeight: 600, marginTop: 10 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                  {emailError}
                </div>
              )}
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? <span style={spinnerStyle} /> : "إرسال رمز الدخول"}
              </button>
            </form>
            <p style={{ color: C.faint, fontSize: 13, lineHeight: 1.9, textAlign: "center", marginTop: 22 }}>الدخول متاح للأعضاء المسجّلين فقط. تواصل مع مدير النظام لإضافة بياناتك.</p>
          </div>
        ) : (
          <div style={{ animation: "lg_cardIn .35s ease both" }}>
            <div style={{ width: 66, height: 66, borderRadius: 20, background: "#FDECEB", color: C.primary, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="3" /><path d="m3 6.5 9 6 9-6" /></svg>
            </div>
            <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-.5px" }}>تحقّق من بريدك</h1>
            <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.9, marginTop: 8 }}>
              أرسلنا رمزاً مكوّناً من 6 أرقام إلى<br />
              <b dir="ltr" style={{ color: C.ink, fontWeight: 700, display: "inline-block", marginTop: 2 }}>{email}</b>
            </p>

            <div dir="ltr" style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 22 }}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputs.current[i] = el)}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  onPaste={onPaste}
                  inputMode="numeric"
                  maxLength={1}
                  style={{ width: 48, height: 58, borderRadius: 14, border: `1.5px solid ${d ? C.primary : C.line}`, background: d ? "#fff" : C.boxBg, fontSize: 24, fontWeight: 800, textAlign: "center", color: C.ink, outline: "none", transition: "border-color .15s, background .15s" }}
                />
              ))}
            </div>

            {otpError && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: C.primary, fontSize: 13.5, fontWeight: 600, marginTop: 16 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                {otpError}
              </div>
            )}

            <button onClick={() => verify(digits.join(""))} disabled={loading || digits.includes("")} style={btnStyle(loading || digits.includes(""))}>
              {loading ? <span style={spinnerStyle} /> : "تأكيد وتسجيل الدخول"}
            </button>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22, fontSize: 13.5, color: C.muted }}>
              <span>لم يصلك الرمز؟</span>
              {resendIn > 0 ? (
                <span style={{ color: C.faint, fontWeight: 600 }}>إعادة الإرسال خلال {resendIn}ث</span>
              ) : (
                <button onClick={resend} type="button" style={{ background: "none", border: "none", fontFamily: "inherit", color: C.primary, fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: 0 }}>إعادة الإرسال</button>
              )}
            </div>

            <div style={{ textAlign: "center", marginTop: 14, paddingTop: 16, borderTop: "1px solid #F2EDE3" }}>
              <button onClick={() => { setStep("email"); setOtpError(""); }} type="button" style={{ background: "none", border: "none", fontFamily: "inherit", color: C.muted, fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                تغيير البريد الإلكتروني
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function btnStyle(disabled) {
  return {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
    width: "100%", marginTop: 22, background: disabled ? "#e79a94" : "#E36A62",
    color: "#fff", border: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 16,
    padding: 15, borderRadius: 16, cursor: disabled ? "default" : "pointer", transition: "background .15s",
  };
}

const spinnerStyle = {
  width: 18, height: 18, border: "2.5px solid rgba(255,255,255,.4)", borderTopColor: "#fff",
  borderRadius: "50%", display: "inline-block", animation: "lg_spin .7s linear infinite",
};
