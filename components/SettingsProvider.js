"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const DEFAULT_SETTINGS = {
  appName: "ڤيوليت",
  tagline: "DIGITAL MARKETING",
  logoText: "ڤ",
  logoUrl: "",
  primaryColor: "#e05a50",
};

const Ctx = createContext(null);

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
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
    } catch {}
  }, []);

  useEffect(() => {
    applyTheme(settings.primaryColor);
    try {
      document.title = `${settings.appName} | نظام إدارة المشاريع`;
    } catch {}
  }, [settings.primaryColor, settings.appName]);

  const save = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem("sp_settings", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      window.localStorage.removeItem("sp_settings");
    } catch {}
  }, []);

  return <Ctx.Provider value={{ settings, save, reset }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx) || { settings: DEFAULT_SETTINGS, save: () => {}, reset: () => {} };
}
