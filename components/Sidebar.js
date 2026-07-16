"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCloud } from "@/lib/supabase";

const LINKS = [
  { href: "/", label: "لوحة المؤشرات", ico: "▚" },
  { href: "/tasks", label: "المهام", ico: "✓" },
  { href: "/meetings", label: "الاجتماعات", ico: "🗓" },
  { href: "/archive", label: "الأرشيف", ico: "🗂" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">◈</span>
        <span>
          <b>سيم برايم</b>
          <small>إدارة المشاريع — فيوليت</small>
        </span>
      </div>

      <div className="side-label">القائمة</div>
      <nav>
        {LINKS.map((l) => {
          const active =
            l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`side-link ${active ? "active" : ""}`}
            >
              <span className="ico">{l.ico}</span>
              <span>{l.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="side-foot">
        <div className="side-mode">
          <span
            className="d"
            style={{ background: isCloud ? "#34d399" : "#fbbf24" }}
          />
          {isCloud ? "متصل بالسحابة" : "الوضع المحلي (تجريبي)"}
        </div>
      </div>
    </aside>
  );
}
