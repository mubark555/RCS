"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sectionOfPath, SECTIONS } from "@/lib/permissions";
import WelcomeGate from "@/components/WelcomeGate";
import PrintHeader from "@/components/PrintHeader";
import { useAuth } from "@/components/AuthProvider";
import { useRole } from "@/components/RoleProvider";
import LoginScreen from "@/components/LoginScreen";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Icon from "@/components/Icon";
import DeadlineAlerts from "@/components/DeadlineAlerts";
import dynamic from "next/dynamic";
// أمل تُحمَّل بعد ظهور الصفحة حتى لا تؤخر فتحها
const AmalAssistant = dynamic(() => import("@/components/AmalAssistant"), { ssr: false });
import { ensureCloudSeeded, ensureQunaif } from "@/lib/store";
import { useAmalEnabled } from "@/lib/amalPref";

export default function AppShell({ children }) {
  const { loading, authed, isCloud, authEmail, signOut } = useAuth();
  const { ready, noAccess, loadError, retryLogin, can } = useRole();
  const path = usePathname();
  const section = sectionOfPath(path);
  const blocked = ready && section && !can(section, "view");
  const [amalOn] = useAmalEnabled();

  // عند الدخول في الوضع السحابي: عبّئ البيانات الأولية إن كانت القاعدة فارغة
  useEffect(() => {
    if (isCloud && authed) ensureCloudSeeded().then(ensureQunaif);
  }, [isCloud, authed]);

  if (loading || (isCloud && authed && !ready)) {
    return (
      <div className="auth-splash">
        <div className="spin" />
        <span>جارٍ التحميل…</span>
      </div>
    );
  }

  if (!authed) return <LoginScreen />;

  // تعذّر تحميل بيانات الحساب (شبكة/جلسة) — ليس «لا صلاحية»
  if (loadError) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: "center" }}>
          <div className="login-sent">
            <div className="ic"><Icon name="alert" size={30} /></div>
            <h2>تعذّر الاتصال بالنظام</h2>
            <p>
              ما قدرنا نحمّل بيانات حسابك <b dir="ltr">{authEmail}</b> الحين.
              <br />
              تأكد من اتصال الإنترنت ثم اضغط «إعادة المحاولة».
            </p>
            <small className="muted" dir="auto" style={{ display: "block", marginBottom: 12 }}>{loadError}</small>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn primary" onClick={retryLogin}>إعادة المحاولة</button>
              <button className="btn ghost" onClick={signOut}>تسجيل الخروج</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (noAccess) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: "center" }}>
          <div className="login-sent">
            <div className="ic"><Icon name="alert" size={30} /></div>
            <h2>لا تملك صلاحية الدخول</h2>
            <p>
              بريدك <b dir="ltr">{authEmail}</b> غير مضاف كمستخدم في النظام.
              <br />
              تواصل مع مدير النظام لإضافة بريدك إلى قسم الفريق.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn" onClick={retryLogin}>إعادة المحاولة</button>
              <button className="btn ghost" onClick={signOut}>تسجيل الخروج</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <DeadlineAlerts />
      <Sidebar />
      <div className="main">
        <TopBar />
        <div className="content">
          <PrintHeader />
          {blocked ? (
            <div className="perm-blocked">
              <span className="ic"><Icon name="lock" size={30} /></span>
              <h2>لا تملك صلاحية على قسم «{SECTIONS.find((x) => x.key === section)?.ar}»</h2>
              <p>تواصل مع مدير النظام لمنحك الصلاحية من قسم الفريق ← الصلاحيات.</p>
            </div>
          ) : children}
        </div>
        <WelcomeGate />
      </div>
      {amalOn && <AmalAssistant />}
    </div>
  );
}
