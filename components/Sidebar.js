"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCloud } from "@/lib/supabase";
import { useRole } from "@/components/RoleProvider";
import { useAuth } from "@/components/AuthProvider";
import { useSettings, brandTitle } from "@/components/SettingsProvider";
import { BrandLogos } from "@/components/BrandMark";
import Icon from "@/components/Icon";
import { SECTIONS } from "@/lib/permissions";

// روابط القائمة = الأقسام التي يملك المستخدم صلاحية الاطلاع عليها (مصفوفة الصلاحيات)
const ALL_LINKS = SECTIONS.filter((x) => x.nav !== false).map((x) => ({ href: x.href, label: x.ar, ico: x.ico, section: x.key }));

const ROLE_AR = { manager: "مدير", member: "عضو", client: "عميل" };

export default function Sidebar() {
  const path = usePathname();
  const { users, viewer, viewerId, setViewer, role, allowSwitch, can } = useRole();
  const { authEmail, signOut } = useAuth();
  const { settings } = useSettings();
  // كل قسم يظهر فقط لمن يملك صلاحية الاطلاع عليه
  const links = ALL_LINKS.filter((l) => can(l.section, "view"));

  return (
    <aside className="sidebar">
      <div className="brand brand-duo">
        <BrandLogos settings={settings} size={46} gap={8} />
        <span>
          <b>{brandTitle(settings)}</b>
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
        {/* تبديل الدور — متاح في الوضع التجريبي فقط */}
        {allowSwitch && (
          <div className="role-switch">
            <div className="rs-label">عرض النظام كـ</div>
            <select value={viewerId || ""} onChange={(e) => setViewer(e.target.value)}>
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
          </div>
        )}

        <div className="side-user">
          <span className="av">{(viewer?.name || "س").slice(0, 1)}</span>
          <span>
            <b>{viewer?.name || "فريق العمل"}</b>
            <small>{viewer?.title || authEmail || settings.tagline}</small>
          </span>
          {isCloud && (
            <button className="side-signout" onClick={signOut} title="تسجيل الخروج">
              <Icon name="arrow" size={16} />
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
