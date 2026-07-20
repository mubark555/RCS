"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRole } from "@/components/RoleProvider";
import LoginScreen from "@/components/LoginScreen";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Icon from "@/components/Icon";
import { ensureCloudSeeded } from "@/lib/store";

export default function AppShell({ children }) {
  const { loading, authed, isCloud, authEmail, signOut } = useAuth();
  const { ready, noAccess } = useRole();

  // عند الدخول في الوضع السحابي: عبّئ البيانات الأولية إن كانت القاعدة فارغة
  useEffect(() => {
    if (isCloud && authed) ensureCloudSeeded();
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
      <Sidebar />
      <div className="main">
        <TopBar />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
