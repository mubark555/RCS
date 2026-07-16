"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCloud } from "@/lib/supabase";

const LINKS = [
  { href: "/", label: "لوحة المؤشرات" },
  { href: "/tasks", label: "المهام" },
  { href: "/meetings", label: "الاجتماعات" },
  { href: "/archive", label: "الأرشيف" },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="logo">◆</span>
          <span>
            سيم برايم
            <small>إدارة المشاريع والمتعاقدين — فيوليت</small>
          </span>
        </div>
        <nav className="nav">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={active ? "active" : ""}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <span className={`mode-badge ${isCloud ? "cloud" : "local"}`}>
          {isCloud ? "☁ سحابي" : "◐ محلي (تجريبي)"}
        </span>
      </div>
    </header>
  );
}
