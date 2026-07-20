"use client";

import { useRef, useState } from "react";
import { useSettings } from "@/components/SettingsProvider";
import { useRole } from "@/components/RoleProvider";
import Icon from "@/components/Icon";

const PRESETS = ["#e05a50", "#3f8e7f", "#2563eb", "#7c3aed", "#d97706", "#0d9488", "#db2777", "#0ea5e9", "#111827"];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const { canManage } = useRole();
  const { settings, save, reset } = useSettings();
  const [f, setF] = useState(settings);
  const [saved, setSaved] = useState(false);
  const logoRef = useRef(null);
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setSaved(false); };

  // معاينة حيّة للّون تُطبّق فوراً
  function pickColor(c) {
    setF((s) => ({ ...s, primaryColor: c }));
    save({ primaryColor: c }); // تطبيق فوري على الواجهة
    setSaved(false);
  }

  async function onLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await fileToDataUrl(file);
    setF((s) => ({ ...s, logoUrl: url }));
    setSaved(false);
    if (logoRef.current) logoRef.current.value = "";
  }

  function apply() {
    save(f);
    setSaved(true);
  }
  function restore() {
    if (!confirm("استعادة الإعدادات الافتراضية؟")) return;
    reset();
    setF({ appName: "ڤيوليت", tagline: "DIGITAL MARKETING", logoText: "ڤ", logoUrl: "", primaryColor: "#e05a50" });
    setSaved(false);
  }

  if (!canManage) return <div className="empty">هذا القسم متاح للمدير فقط.</div>;

  return (
    <div>
      <div className="dash-2col" style={{ marginTop: 0 }}>
        <div className="card">
          <div className="section-title">هوية النظام</div>
          <label className="field"><span>اسم النظام</span><input value={f.appName} onChange={set("appName")} /></label>
          <label className="field"><span>الوصف / الشعار النصي</span><input value={f.tagline} onChange={set("tagline")} /></label>
          <label className="field"><span>حرف الشعار (يظهر إن لم توجد صورة)</span><input value={f.logoText} onChange={set("logoText")} maxLength={2} /></label>

          <div className="field">
            <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>شعار النظام (صورة)</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={onLogo} />
              <button type="button" className="btn" onClick={() => logoRef.current?.click()}><Icon name="upload" size={16} /> رفع صورة</button>
              <input value={f.logoUrl?.startsWith("data:") ? "" : (f.logoUrl || "")} onChange={set("logoUrl")} placeholder="أو الصق رابط صورة…" />
              {f.logoUrl && <button type="button" className="btn sm ghost" onClick={() => setF((s) => ({ ...s, logoUrl: "" }))}>إزالة</button>}
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 20 }}>اللون الأساسي</div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
            {PRESETS.map((c) => (
              <span key={c} onClick={() => pickColor(c)} title={c}
                style={{ width: 34, height: 34, borderRadius: 10, background: c, cursor: "pointer", border: f.primaryColor === c ? "3px solid #2c2b34" : "2px solid #fff", boxShadow: "0 0 0 1px #e0d8ca" }} />
            ))}
            <label className="btn" style={{ cursor: "pointer" }}>
              <Icon name="palette" size={16} /> مخصّص
              <input type="color" value={f.primaryColor} onChange={(e) => pickColor(e.target.value)} style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} />
            </label>
          </div>

          <div className="modal-actions" style={{ marginTop: 22 }}>
            <button className="btn primary" onClick={apply}>{saved ? "✓ تم الحفظ" : "حفظ التخصيص"}</button>
            <button className="btn ghost" onClick={restore}>استعادة الافتراضي</button>
          </div>
        </div>

        {/* معاينة حيّة */}
        <div className="card">
          <div className="section-title">معاينة</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ width: 48, height: 48, borderRadius: 14, background: f.primaryColor, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22, overflow: "hidden" }}>
              {f.logoUrl ? <img src={f.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (f.logoText || "؟")}
            </span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "var(--ink)" }}>{f.appName || "اسم النظام"}</div>
              <div style={{ fontSize: 11, letterSpacing: 2, color: "var(--muted)", fontWeight: 700 }}>{f.tagline}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn primary" style={{ background: f.primaryColor }}>زر أساسي</button>
            <span className="badge" style={{ background: `${f.primaryColor}22`, color: f.primaryColor }}><span className="dot" style={{ background: f.primaryColor }} />شارة</span>
            <span className="pill" style={{ color: f.primaryColor }}>وسم</span>
          </div>
          <div className="progress" style={{ marginTop: 16 }}><span style={{ width: "65%", background: f.primaryColor }} /></div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 16 }}>
            يُطبّق اللون فوراً على الأزرار والشارات والعناصر النشطة في كل النظام. اسم النظام وشعاره يظهران في الشريط الجانبي.
          </p>
        </div>
      </div>
    </div>
  );
}
