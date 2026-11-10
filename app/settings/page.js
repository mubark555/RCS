"use client";

import { useMemo, useRef, useState } from "react";
import { useSettings, DEFAULT_SETTINGS } from "@/components/SettingsProvider";
import BrandMark from "@/components/BrandMark";
import { useRole } from "@/components/RoleProvider";
import NotifSettings from "@/components/NotifSettings";
import Icon from "@/components/Icon";
import Link from "next/link";

const PRESETS = ["#e05a50", "#3f8e7f", "#2563eb", "#7c3aed", "#d97706", "#0d9488", "#db2777", "#0ea5e9", "#111827"];

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// معالجة احترافية للشعار: SVG يبقى متجهاً (أعلى جودة)، والصور النقطية
// تُحجَّم بجودة عالية إلى حدٍّ أقصى مع الحفاظ على الشفافية والنسبة.
async function processLogo(file, maxSize = 512) {
  // SVG متجه — نبقيه كما هو للحصول على حدّة مثالية بأي حجم
  if (file.type === "image/svg+xml") return readAsDataUrl(file);

  const dataUrl = await readAsDataUrl(file);
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return dataUrl;

  // نُصغّر فقط (لا نُكبّر حتى لا تتشوّه الصورة الصغيرة)
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, tw, th);

  // PNG يحافظ على الشفافية وحدّة الشعارات
  return canvas.toDataURL("image/png");
}

export default function SettingsPage() {
  const { can } = useRole();
  const canManage = can("settings", "edit");
  const { settings, save, reset } = useSettings();
  const [f, setF] = useState(settings);
  const [saved, setSaved] = useState(false);
  const logoRef = useRef(null);
  const partnerRef = useRef(null);
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setSaved(false); };

  // معاينة حيّة للّون تُطبّق فوراً
  function pickColor(c) {
    setF((s) => ({ ...s, primaryColor: c }));
    save({ primaryColor: c }); // تطبيق فوري على الواجهة
    setSaved(false);
  }

  // key: logoUrl (شعار سيم) | partnerLogoUrl (شعار ڤيوليت)
  async function onLogo(e, key, ref) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await processLogo(file);
      setF((s) => ({ ...s, [key]: url }));
      save({ [key]: url }); // حفظ فوري ليظهر مباشرة في كل النظام
      setSaved(false);
    } catch {
      alert("تعذّرت معالجة الصورة. جرّب صورة أخرى (PNG أو SVG مفضّلة).");
    } finally {
      if (ref.current) ref.current.value = "";
    }
  }

  function apply() {
    save(f);
    setSaved(true);
  }
  function restore() {
    if (!confirm("استعادة الإعدادات الافتراضية؟")) return;
    reset();
    setF(DEFAULT_SETTINGS);
    setSaved(false);
  }

  if (!canManage) return <div className="empty">هذا القسم متاح للمدير فقط.</div>;

  return (
    <div>
      <div className="dash-2col" style={{ marginTop: 0 }}>
        <div className="card">
          <div className="section-title">هوية النظام</div>
          <label className="field"><span>الوصف (يظهر تحت الاسم)</span><input value={f.tagline} onChange={set("tagline")} placeholder="مركز القيادة الموحد" /></label>

          <LogoField
            title="ڤيوليت (الشريك التشغيلي)"
            name={f.partnerName} onName={set("partnerName")}
            letter={f.partnerLogoText} onLetter={set("partnerLogoText")}
            url={f.partnerLogoUrl} inputRef={partnerRef}
            onFile={(e) => onLogo(e, "partnerLogoUrl", partnerRef)}
            onUrl={set("partnerLogoUrl")}
            onRemove={() => { setF((s) => ({ ...s, partnerLogoUrl: "" })); save({ partnerLogoUrl: "" }); }}
          />
          <LogoField
            title="سيم برايم"
            name={f.appName} onName={set("appName")}
            letter={f.logoText} onLetter={set("logoText")}
            url={f.logoUrl} inputRef={logoRef}
            onFile={(e) => onLogo(e, "logoUrl", logoRef)}
            onUrl={set("logoUrl")}
            onRemove={() => { setF((s) => ({ ...s, logoUrl: "" })); save({ logoUrl: "" }); }}
          />
          <p className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            للحصول على أفضل جودة استخدم صورة مربّعة وواضحة بصيغة <b dir="ltr">PNG</b> بخلفية شفافة، أو <b dir="ltr">SVG</b>. الهوية تُحفظ للفريق كامل وتظهر في صفحة الدخول.
          </p>

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
          <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)", color: "var(--ink)" }}>
            <BrandMark settings={f} size={52} titleSize={18} taglineSize={12.5} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn primary" style={{ background: f.primaryColor }}>زر أساسي</button>
            <span className="badge" style={{ background: `${f.primaryColor}22`, color: f.primaryColor }}><span className="dot" style={{ background: f.primaryColor }} />شارة</span>
            <span className="pill" style={{ color: f.primaryColor }}>وسم</span>
          </div>
          <div className="progress" style={{ marginTop: 16 }}><span style={{ width: "65%", background: f.primaryColor }} /></div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 16 }}>
            يُطبّق اللون فوراً على الأزرار والشارات والعناصر النشطة في كل النظام. الاسمان والشعاران يظهران في الشريط الجانبي وصفحة الدخول.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-title"><span>الصلاحيات</span></div>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
          صلاحيات كل شخص على كل قسم (بما فيها قسم المالية) والصلاحيات الخاصة كالاعتماد والإجازات تُدار الآن من مكان واحد.
        </p>
        <Link href="/team?tab=perms" className="btn primary" style={{ display: "inline-flex" }}><Icon name="shield" size={16} /> فتح مصفوفة الصلاحيات</Link>
      </div>

      <NotifSettings />
    </div>
  );
}

function LogoField({ title, name, onName, letter, onLetter, url, inputRef, onFile, onUrl, onRemove }) {
  return (
    <div className="logo-field">
      <div className="lf-title">{title}</div>
      <div className="tf-grid2">
        <label className="field"><span>الاسم</span><input value={name || ""} onChange={onName} /></label>
        <label className="field"><span>حرف الشعار (إن لم توجد صورة)</span><input value={letter || ""} onChange={onLetter} maxLength={2} /></label>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={onFile} />
        {url && (
          <span style={{ width: 44, height: 44, borderRadius: 10, background: "#fff", border: "1px solid var(--border)", display: "grid", placeItems: "center", overflow: "hidden", flex: "none" }}>
            <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4 }} />
          </span>
        )}
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}><Icon name="upload" size={16} /> رفع الشعار</button>
        <input value={url?.startsWith("data:") ? "" : (url || "")} onChange={onUrl} placeholder="أو الصق رابط صورة…" style={{ flex: 1, minWidth: 140 }} />
        {url && <button type="button" className="btn sm ghost" onClick={onRemove}>إزالة</button>}
      </div>
    </div>
  );
}

