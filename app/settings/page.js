"use client";

import { useRef, useState } from "react";
import { useSettings } from "@/components/SettingsProvider";
import { useRole } from "@/components/RoleProvider";
import NotifSettings from "@/components/NotifSettings";
import Icon from "@/components/Icon";

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
    try {
      const url = await processLogo(file);
      setF((s) => ({ ...s, logoUrl: url }));
      save({ logoUrl: url }); // حفظ فوري ليظهر مباشرة في كل النظام
      setSaved(false);
    } catch {
      alert("تعذّرت معالجة الصورة. جرّب صورة أخرى (PNG أو SVG مفضّلة).");
    } finally {
      if (logoRef.current) logoRef.current.value = "";
    }
  }

  function apply() {
    save(f);
    setSaved(true);
  }
  function restore() {
    if (!confirm("استعادة الإعدادات الافتراضية؟")) return;
    reset();
    setF({ appName: "سيم برايم", tagline: "DIGITAL MARKETING", logoText: "س", logoUrl: "", primaryColor: "#e05a50" });
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
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={onLogo} />
              {f.logoUrl && (
                <span style={{ width: 44, height: 44, borderRadius: 10, background: "#fff", border: "1px solid var(--border)", display: "grid", placeItems: "center", overflow: "hidden", flex: "none" }}>
                  <img src={f.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4 }} />
                </span>
              )}
              <button type="button" className="btn" onClick={() => logoRef.current?.click()}><Icon name="upload" size={16} /> رفع صورة</button>
              <input value={f.logoUrl?.startsWith("data:") ? "" : (f.logoUrl || "")} onChange={set("logoUrl")} placeholder="أو الصق رابط صورة…" />
              {f.logoUrl && <button type="button" className="btn sm ghost" onClick={() => { setF((s) => ({ ...s, logoUrl: "" })); save({ logoUrl: "" }); }}>إزالة</button>}
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              للحصول على أفضل جودة استخدم صورة مربّعة وواضحة بصيغة <b dir="ltr">PNG</b> بخلفية شفافة، أو <b dir="ltr">SVG</b> (الأفضل — حدّة مثالية بأي حجم). تُحجَّم الصورة تلقائياً بجودة عالية.
            </p>
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
            <span style={{ width: 60, height: 60, borderRadius: 16, background: f.logoUrl ? "#fff" : f.primaryColor, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 28, overflow: "hidden", border: f.logoUrl ? "1px solid var(--border)" : "none" }}>
              {f.logoUrl ? <img src={f.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 2 }} /> : (f.logoText || (f.appName || "؟").trim().charAt(0) || "؟")}
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

      <FinanceAccessCard />

      <NotifSettings />
    </div>
  );
}

// إدارة صلاحية الوصول لقسم المالية — يعيّنها مالك النظام (المدير)
function FinanceAccessCard() {
  const { users, financeUsers, saveFinanceUsers } = useRole();
  const [sel, setSel] = useState(null);
  const [saved, setSaved] = useState(false);

  const current = sel ?? (Array.isArray(financeUsers) ? financeUsers : []);
  // المدراء لهم صلاحية دائمة؛ الباقون يُمنحون يدوياً
  const managers = users.filter((u) => u.role === "manager");
  const others = users.filter((u) => u.role !== "manager");

  function toggle(id) {
    setSaved(false);
    setSel((prev) => {
      const base = prev ?? current;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  }
  async function apply() {
    await saveFinanceUsers(current);
    setSaved(true);
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="section-title"><span>صلاحية قسم المالية</span></div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        قسم المالية (فواتير فيوليت ← سيم برايم والمدفوعات) حسّاس ويظهر فقط للحسابات التي تعيّنها هنا.
        <b> المدراء لهم صلاحية دائمة.</b>
      </p>

      {managers.length > 0 && (
        <div className="fa-list">
          {managers.map((u) => (
            <div className="fa-row" key={u.id}>
              <div><b>{u.name}</b> <span className="pill" style={{ fontSize: 11 }}>مدير</span></div>
              <span className="pill" style={{ background: "#eaf6ef", color: "#16a34a" }}>صلاحية دائمة</span>
            </div>
          ))}
        </div>
      )}

      <div className="fa-list" style={{ marginTop: 6 }}>
        {others.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>لا يوجد أعضاء آخرون لإضافتهم. أضِف المستخدمين من قسم «الفريق».</div>
        ) : others.map((u) => {
          const on = current.includes(u.id);
          return (
            <label className="fa-row" key={u.id} style={{ cursor: "pointer" }}>
              <div><b>{u.name}</b> {u.title ? <span className="muted" style={{ fontSize: 12 }}>· {u.title}</span> : null}</div>
              <button type="button" className={`fa-toggle ${on ? "on" : ""}`} onClick={() => toggle(u.id)} aria-pressed={on}>
                <span />
              </button>
            </label>
          );
        })}
      </div>

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={apply}>{saved ? "✓ تم الحفظ" : "حفظ الصلاحيات"}</button>
      </div>
    </div>
  );
}
