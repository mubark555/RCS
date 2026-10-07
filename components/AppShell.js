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
import AmalAssistant from "@/components/AmalAssistant";
import { ensureCloudSeeded, ensureQunaif } from "@/lib/store";

export default function AppShell({ children }) {
  const { loading, authed, isCloud, authEmail, signOut } = useAuth();
  const { ready, noAccess, can } = useRole();
  const path = usePathname();
  const section = sectionOfPath(path);
  const blocked = ready && section && !can(section, "view");

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
            <button className="btn ghost" onClick={signOut}>تسجيل الخروج</button>
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
      <AmalAssistant />
    </div>
  );
}
