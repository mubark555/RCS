"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { appSettings } from "@/lib/store";

// الهوية المشتركة: شعارا ڤيوليت (الشريك التشغيلي) وسيم برايم
export const DEFAULT_SETTINGS = {
  appName: "سيم برايم",       // اسم سيم
  logoText: "س",
  logoUrl: "",                // شعار سيم
  partnerName: "ڤيوليت",      // اسم ڤيوليت
  partnerLogoText: "ڤ",
  partnerLogoUrl: "",         // شعار ڤيوليت
  tagline: "مركز القيادة الموحد",
  primaryColor: "#e05a50",
};

// إعدادات محفوظة قبل تحديث الهوية: الوصف القديم يُستبدل بالجديد تلقائياً
function migrate(s) {
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  if (!out.tagline || out.tagline.trim().toUpperCase() === "DIGITAL MARKETING") out.tagline = DEFAULT_SETTINGS.tagline;
  return out;
}

// الاسم الكامل للعرض: «ڤيوليت × سيم برايم»
export function brandTitle(s) {
  return [s?.partnerName, s?.appName].filter((x) => x && String(x).trim()).join(" × ");
}

const Ctx = createContext(null);

// نسخة حالية من الهوية لاستخدامها خارج React (مستندات الطباعة والبريد)
let _current = DEFAULT_SETTINGS;
export const currentBrand = () => _current;

// ترويسة HTML موحّدة للمستندات الورقية: شعار ڤيوليت + اسم النظام + شعار سيم
export function brandHeaderHtml(s = _current, docTitle = "", docSub = "") {
  const esc = (x) => String(x || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tile = (url, letter, color) => url
    ? `<span style="width:54px;height:54px;border-radius:14px;border:1px solid #ece5da;background:#fff;display:inline-flex;align-items:center;justify-content:center;overflow:hidden"><img src="${esc(url)}" style="max-width:100%;max-height:100%;object-fit:contain;padding:4px"></span>`
    : `<span style="width:54px;height:54px;border-radius:14px;background:${color};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:25px;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(letter)}</span>`;
  const primary = s.primaryColor || "#e05a50";
  return `<div style="display:flex;align-items:center;gap:14px;border-bottom:2.5px solid ${primary};padding-bottom:12px;margin-bottom:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
    ${tile(s.partnerLogoUrl, s.partnerLogoText || (s.partnerName || "ڤ").trim().charAt(0), "#6d4aa8")}
    <div style="flex:1;text-align:center">
      <div style="font-size:21px;font-weight:800;color:${primary}">${esc(brandTitle(s))}</div>
      <div style="font-size:12px;color:#8a8078;font-weight:700">${esc(s.tagline || "")}</div>
      ${docTitle ? `<div style="font-size:13px;color:#2b2a32;font-weight:800;margin-top:4px">${esc(docTitle)}${docSub ? ` <span style="color:#8a8078;font-weight:600">· ${esc(docSub)}</span>` : ""}</div>` : ""}
    </div>
    ${tile(s.logoUrl, s.logoText || (s.appName || "س").trim().charAt(0), primary)}
  </div>`;
}

// ---- أدوات الألوان ----
function hexToRgb(h) {
  h = String(h || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h || "e05a50", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function clamp(x) {
  return Math.max(0, Math.min(255, Math.round(x)));
}
function toHex(r, g, b) {
  return "#" + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, "0")).join("");
}
function darken(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return toHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
function tint(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}

export function applyTheme(primary) {
  if (typeof document === "undefined") return;
  const [r, g, b] = hexToRgb(primary);
  const root = document.documentElement.style;
  root.setProperty("--primary", primary);
  root.setProperty("--primary-2", darken(primary, 0.14));
  root.setProperty("--primary-soft", tint(primary, 0.9));
  root.setProperty("--ring", `rgba(${r}, ${g}, ${b}, 0.28)`);
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const s = JSON.parse(window.localStorage.getItem("sp_settings"));
      if (s) setSettings(migrate(s));
    } catch {}
    // الهوية مشتركة للفريق كامل عبر السحابة (تظهر أيضاً في صفحة الدخول)
    appSettings.get("branding").then((cloud) => {
      if (cloud && typeof cloud === "object") {
        setSettings((prev) => {
          const next = migrate({ ...prev, ...cloud });
          try { window.localStorage.setItem("sp_settings", JSON.stringify(next)); } catch {}
          return next;
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { _current = settings; }, [settings]);

  useEffect(() => {
    applyTheme(settings.primaryColor);
    try {
      document.title = `${brandTitle(settings) || "سيم برايم"} | ${settings.tagline || "مركز القيادة الموحد"}`;
    } catch {}
    // أيقونة التبويب (favicon): شعار النظام المرفوع إن وُجد
    try {
      if (settings.logoUrl) {
        let link = document.querySelector("link#app-favicon");
        if (!link) {
          link = document.createElement("link");
          link.id = "app-favicon";
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = settings.logoUrl;
      }
    } catch {}
  }, [settings.primaryColor, settings.appName, settings.partnerName, settings.tagline, settings.logoUrl]);

  const save = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem("sp_settings", JSON.stringify(next));
      } catch {}
      appSettings.set("branding", next).catch(() => {});
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      window.localStorage.removeItem("sp_settings");
    } catch {}
    appSettings.set("branding", DEFAULT_SETTINGS).catch(() => {});
  }, []);

  return <Ctx.Provider value={{ settings, save, reset }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx) || { settings: DEFAULT_SETTINGS, save: () => {}, reset: () => {} };
}
