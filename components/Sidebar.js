"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCloud } from "@/lib/supabase";
import { useRole } from "@/components/RoleProvider";
import { useSettings } from "@/components/SettingsProvider";
import Icon from "@/components/Icon";

// كل رابط يظهر فقط لمن يملك صلاحية الصفحة
const ALL_LINKS = [
  { href: "/", label: "مهامي", ico: "home", show: (r) => r.role !== "client" },
  { href: "/", label: "الرئيسية", ico: "home", show: (r) => r.role === "client" },
  { href: "/overview", label: "لوحة القيادة", ico: "flag", perm: "page.overview" },
  { href: "/tasks", label: "المهام", ico: "tasks", perm: "page.tasks" },
  { href: "/projects", label: "المشاريع", ico: "projects", perm: "page.projects" },
  { href: "/meetings", label: "الاجتماعات", ico: "calendar", perm: "page.meetings" },
  { href: "/archive", label: "الأرشيف", ico: "archive", perm: "page.archive" },
  { href: "/kpis", label: "الأداء والمستهدفات", ico: "chart", perm: "page.kpis" },
  { href: "/team", label: "الفريق", ico: "users", perm: "page.team" },
  { href: "/audit", label: "سجل الإجراءات", ico: "clock", perm: "page.audit" },
  { href: "/access", label: "الصلاحيات والوحدات", ico: "briefcase", perm: "page.access" },
  { href: "/settings", label: "تخصيص النظام", ico: "settings", perm: "page.settings" },
];


export default function Sidebar() {
  const path = usePathname();
  const ctx = useRole();
  const { users, roles, viewer, viewerId, setViewer, role, authRequired, signOut, can, access } = ctx;
  const roleName = (key) => roles.find((r) => r.key === key)?.name || key;
  const { settings } = useSettings();
  const links = ALL_LINKS.filter((l) => (l.perm ? can(l.perm) : l.show(ctx)));

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
            <Link key={l.href + l.label} href={l.href} className={`side-link ${active ? "active" : ""}`}>
              <span className="ico"><Icon name={l.ico} size={19} /></span>
              <span>{l.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="side-foot">
        {/* تبديل الدور (وضع تجريبي — يختفي عند تفعيل تسجيل الدخول) */}
        {!authRequired && <div className="role-switch">
          <div className="rs-label">عرض النظام كـ</div>
          <select value={viewerId || ""} onChange={(e) => setViewer(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {roleName(u.role)}
                {u.project ? ` (${u.project})` : ""}
              </option>
            ))}
          </select>
          {viewer && (
            <div className="rs-active">
              الدور الفعّال: <b>{access.role?.name || roleName(role)}</b>
              {viewer.project ? ` · ${viewer.project}` : ""}
            </div>
          )}
        </div>}

        <div className="side-user">
          <span className="av">{(viewer?.name || "ف").slice(0, 1)}</span>
          <span>
            <b>{viewer?.name || "فريق ڤيوليت"}</b>
            <small>{viewer?.title || "إدارة مشاريع سيم برايم"}</small>
          </span>
        </div>
        {authRequired && <button className="btn sm ghost" style={{ width: "100%", marginTop: 8 }} onClick={signOut}>تسجيل الخروج</button>}
        <div className="side-mode">
          <span className="d" style={{ background: isCloud ? "#3f8e7f" : "#e0a23a" }} />
          {isCloud ? "متصل بالسحابة" : "الوضع المحلي (تجريبي)"}
        </div>
      </div>
    </aside>
  );
}
