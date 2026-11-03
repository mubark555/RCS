"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCloud } from "@/lib/supabase";
import { useRole } from "@/components/RoleProvider";
import { useSettings } from "@/components/SettingsProvider";
import Icon from "@/components/Icon";

const ALL_LINKS = [
  { href: "/", label: "الرئيسية", ico: "home", roles: ["manager", "member", "client"] },
  { href: "/tasks", label: "المهام", ico: "tasks", roles: ["manager", "member", "client"] },
  { href: "/projects", label: "المشاريع", ico: "projects", roles: ["manager", "member", "client"] },
  { href: "/kpis", label: "الأداء والمستهدفات", ico: "chart", roles: ["manager", "member"] },
  { href: "/meetings", label: "الاجتماعات", ico: "calendar", roles: ["manager", "member", "client"] },
  { href: "/team", label: "الفريق", ico: "users", roles: ["manager", "member"] },
  { href: "/activity", label: "سجل النشاط", ico: "clock", roles: ["manager"] },
  { href: "/settings", label: "تخصيص النظام", ico: "settings", roles: ["manager"] },
];

const ROLE_AR = { manager: "مدير", member: "عضو", client: "عميل" };

export default function Sidebar() {
  const path = usePathname();
  const { users, viewer, viewerId, setViewer, role, auth, realUser, canPreview, logout } = useRole();
  const { settings } = useSettings();
  const links = ALL_LINKS.filter((l) => l.roles.includes(role));

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo" style={{ overflow: "hidden", padding: 0 }}>
          {settings.logoUrl ? <img src={settings.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : settings.logoText}
        </span>
        <span>
          <b>{settings.appName}</b>
          <small>{settings.tagline}</small>
        </span>
      </div>

      <div className="side-label">القائمة</div>
      <nav>
        {links.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={`side-link ${active ? "active" : ""}`}>
              <span className="ico"><Icon name={l.ico} size={19} /></span>
              <span>{l.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="side-foot">
        {/* تبديل الدور: وضع تجريبي بلا دخول، أو «معاينة» للمدير بعد الدخول */}
        {canPreview && (
        <div className="role-switch">
          <div className="rs-label">{auth.enabled ? "معاينة النظام كـ" : "عرض النظام كـ"}</div>
          <select value={viewerId || ""} onChange={(e) => setViewer(e.target.value)}>
            {realUser && !users.some((u) => u.id === realUser.id) && (
              <option value={realUser.id}>{realUser.name} — {ROLE_AR[realUser.role] || realUser.role} (حسابي)</option>
            )}
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {ROLE_AR[u.role] || u.role}
                {u.project ? ` (${u.project})` : ""}
              </option>
            ))}
          </select>
          {viewer && (
            <div className="rs-active">
              الدور الفعّال: <b>{ROLE_AR[role]}</b>
              {viewer.project ? ` · ${viewer.project}` : ""}
            </div>
          )}
          {auth.enabled && realUser && viewer && viewer.id !== realUser.id && (
            <button className="link-btn" style={{ marginTop: 6, fontSize: 12 }} onClick={() => setViewer(realUser.id)}>العودة لحسابي</button>
          )}
        </div>
        )}

        <div className="side-user">
          <span className="av">{((realUser || viewer)?.name || "ف").slice(0, 1)}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <b>{(realUser || viewer)?.name || "فريق ڤيوليت"}</b>
            <small>{auth.enabled && realUser ? realUser.email || realUser.title : viewer?.title || "إدارة مشاريع سيم برايم"}</small>
          </span>
          {auth.enabled && realUser && (
            <button className="btn sm ghost icon" title="تسجيل الخروج" onClick={() => confirm("تسجيل الخروج من النظام؟") && logout()}>
              <Icon name="logout" size={17} />
            </button>
          )}
        </div>
        <div className="side-mode">
          <span className="d" style={{ background: isCloud ? "#3f8e7f" : "#e0a23a" }} />
          {isCloud ? "متصل بالسحابة" : "الوضع المحلي (تجريبي)"}
        </div>
      </div>
    </aside>
  );
}
