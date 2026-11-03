"use client";

// تنبيهات منبثقة خفيفة: استدعِ toast("نص", "success" | "error" | "info") من أي مكان
import { useEffect, useState } from "react";

export function toast(text, kind = "info", ms = 5000) {
  if (typeof window === "undefined" || !text) return;
  window.dispatchEvent(new CustomEvent("sp-toast", { detail: { text, kind, ms } }));
}

export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let n = 0;
    const on = (e) => {
      const id = ++n + Date.now();
      setItems((s) => [...s.slice(-3), { id, ...e.detail }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), e.detail.ms || 5000);
    };
    window.addEventListener("sp-toast", on);
    return () => window.removeEventListener("sp-toast", on);
  }, []);
  if (!items.length) return null;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
