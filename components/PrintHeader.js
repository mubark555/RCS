"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSettings, brandTitle } from "@/components/SettingsProvider";
import { LogoTile } from "@/components/BrandMark";

// ترويسة تظهر في الطباعة فقط (كل التقارير الورقية): شعار ڤيوليت + اسم النظام + شعار سيم
export default function PrintHeader() {
  const { settings: s } = useSettings();
  const path = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // التاريخ والوقت على المتصفح فقط (تفادي عدم تطابق الترطيب)
  if (path === "/" || !mounted) return null;
  const now = new Date();
  return (
    <div className="print-header print-only">
      <LogoTile url={s.partnerLogoUrl} text={s.partnerLogoText} fallback={(s.partnerName || "ڤ").trim().charAt(0)} color="#6d4aa8" size={58} radius={15} />
      <div className="ph-mid">
        <b style={{ color: s.primaryColor || "var(--primary)" }}>{brandTitle(s)}</b>
        <small>{s.tagline}</small>
        <span>طُبع في {now.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", day: "numeric" })} · {now.toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <LogoTile url={s.logoUrl} text={s.logoText} fallback={(s.appName || "س").trim().charAt(0)} color={s.primaryColor || "var(--primary)"} size={58} radius={15} />
    </div>
  );
}
