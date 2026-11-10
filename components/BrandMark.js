"use client";

import { useSettings, brandTitle } from "@/components/SettingsProvider";

// شعار واحد: صورة مرفوعة، أو حرف على خلفية ملوّنة
export function LogoTile({ url, text, fallback, color, size = 40, radius = 11 }) {
  return (
    <span
      className="brand-tile"
      style={{
        width: size, height: size, borderRadius: radius, flex: "none",
        background: url ? "#fff" : color, color: "#fff",
        display: "grid", placeItems: "center", overflow: "hidden",
        fontWeight: 800, fontSize: Math.round(size * 0.46),
        border: url ? "1px solid var(--border, #ece6da)" : "none",
      }}
    >
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: Math.max(2, Math.round(size / 14)) }} /> : (text || fallback || "؟")}
    </span>
  );
}

// الشعاران معاً: ڤيوليت + سيم برايم
export function BrandLogos({ settings, size = 40, gap = 6 }) {
  const s = settings;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap, flex: "none" }}>
      <LogoTile url={s.partnerLogoUrl} text={s.partnerLogoText} fallback={(s.partnerName || "ڤ").trim().charAt(0)} color="#6d4aa8" size={size} radius={Math.round(size * 0.27)} />
      <LogoTile url={s.logoUrl} text={s.logoText} fallback={(s.appName || "س").trim().charAt(0)} color={s.primaryColor || "var(--primary)"} size={size} radius={Math.round(size * 0.27)} />
    </span>
  );
}

// كتلة الهوية الكاملة (الشعاران + الاسم + الوصف)
export default function BrandMark({ size = 36, titleSize, taglineSize, settings: override }) {
  const { settings: ctx } = useSettings();
  const s = override || ctx;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <BrandLogos settings={s} size={size} />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <b style={{ fontSize: titleSize, lineHeight: 1.25 }}>{brandTitle(s)}</b>
        <small style={{ fontSize: taglineSize }}>{s.tagline}</small>
      </span>
    </span>
  );
}
