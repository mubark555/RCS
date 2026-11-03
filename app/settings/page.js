"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/components/SettingsProvider";
import { useRole } from "@/components/RoleProvider";
import Icon from "@/components/Icon";
import { toast } from "@/components/Toaster";
import { REMINDER_OPTIONS, isEmail } from "@/lib/notify-core";
import { notifyPrefsOf, getEmailStatus } from "@/lib/notifications";

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
    const { notifications, ...rest } = f; // إعدادات الإشعارات تُحفظ فوراً من بطاقتها
    save(rest);
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
      <NotificationSettings />
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

// ================= إعدادات إشعارات البريد =================
const TOGGLES = [
  ["onCreate", "عند إنشاء اجتماع", "دعوة بالبريد مع مرفق تقويم (ICS) ورابط Google Calendar"],
  ["onUpdate", "عند تعديل الاجتماع", "تغيير الموعد أو المكان أو الحضور — مع توضيح ما تغيّر"],
  ["onClose", "عند إغلاق الاجتماع", "إرسال ملخص المحضر والقرارات والمهام لكل الحضور"],
  ["onCancel", "عند إلغاء / حذف الاجتماع", "إشعار إلغاء يحذف الحدث من تقويم الحضور تلقائياً"],
  ["reminders", "التذكير قبل الاجتماع", "تذكيرات تلقائية حسب التوقيت المحدد لكل اجتماع"],
  ["includeIcs", "إرفاق دعوة التقويم", "ملف invite.ics متوافق مع Outlook و Google و Apple"],
  ["askBeforeSend", "السؤال قبل كل إرسال", "تأكيد يدوي قبل إرسال أي بريد"],
];

function NotificationSettings() {
  const { settings, save } = useSettings();
  const { viewer } = useRole();
  const prefs = notifyPrefsOf(settings);
  const [status, setStatus] = useState(null);
  const [to, setTo] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => { getEmailStatus(true).then(setStatus); }, []);
  useEffect(() => { if (!to && viewer?.email) setTo(viewer.email); }, [viewer]); // eslint-disable-line

  const put = (patch) => save({ notifications: { ...prefs, ...patch } });
  const toggleRem = (min) => {
    const cur = prefs.defaultReminders || [];
    put({ defaultReminders: cur.includes(min) ? cur.filter((x) => x !== min) : [...cur, min].sort((a, b) => b - a) });
  };

  async function test() {
    if (!isEmail(to)) return toast("أدخل بريداً صحيحاً", "error");
    setTesting(true);
    try {
      const r = await fetch("/api/notify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "test", to, name: viewer?.name || "", brand: { appName: settings.appName, tagline: settings.tagline, primaryColor: settings.primaryColor } }),
      });
      const d = await r.json().catch(() => ({}));
      toast(d.ok ? `✅ أُرسلت رسالة تجريبية إلى ${to}` : `⚠️ ${d.error || "فشل الإرسال"}`, d.ok ? "success" : "error", 8000);
    } finally { setTesting(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="section-title" style={{ margin: 0 }}>إشعارات البريد الإلكتروني للاجتماعات</div>
        <label className="switch" style={{ marginInlineStart: "auto" }} title="تفعيل / إيقاف كل الإشعارات">
          <input type="checkbox" checked={prefs.enabled} onChange={(e) => put({ enabled: e.target.checked })} />
          <span />
        </label>
      </div>

      <div className={`mail-status ${status?.configured ? "ok" : "warn"}`}>
        {!status ? "جاري فحص إعداد البريد…" : status.configured ? (
          <>✅ البريد مُعدّ عبر <b>{status.provider === "resend" ? "Resend" : "SMTP"}</b> — المرسل: <span dir="ltr">{status.from}</span>
            {" · "}التذكيرات المجدولة على الخادم: {status.cron && status.cloud ? "مفعّلة ✅" : "غير مفعّلة (تعمل التذكيرات أثناء فتح النظام فقط)"}</>
        ) : (
          <>⚠️ البريد غير مُعدّ على الخادم. أضِف متغيرات البيئة <code>RESEND_API_KEY</code> و <code>EMAIL_FROM</code> (أو إعدادات <code>SMTP_*</code>) في Vercel ثم أعد النشر. التفاصيل في README.</>
        )}
      </div>

      <div className="notify-grid" style={{ opacity: prefs.enabled ? 1 : 0.5, pointerEvents: prefs.enabled ? "auto" : "none" }}>
        {TOGGLES.map(([k, label, hint]) => (
          <label key={k} className="notify-opt">
            <input type="checkbox" checked={prefs[k] !== false} onChange={(e) => put({ [k]: e.target.checked })} />
            <span><b>{label}</b><small>{hint}</small></span>
          </label>
        ))}
      </div>

      <div className="nb-label" style={{ marginTop: 16 }}>التذكيرات الافتراضية للاجتماعات الجديدة</div>
      <div className="attendee-picker">
        {REMINDER_OPTIONS.map((o) => (
          <span key={o.min} className={`att-chip ${(prefs.defaultReminders || []).includes(o.min) ? "on" : ""}`} onClick={() => toggleRem(o.min)}>{o.ar}</span>
        ))}
      </div>

      <div className="nb-label" style={{ marginTop: 16 }}>إرسال رسالة تجريبية</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" dir="ltr" style={{ flex: 1, minWidth: 200 }} />
        <button className="btn" onClick={test} disabled={testing || !status?.configured}><Icon name="bell" size={16} /> {testing ? "جاري الإرسال…" : "إرسال تجربة"}</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        يصل البريد للحضور الذين لديهم بريد مسجّل في صفحة «الفريق»، ولأي بريد إضافي يُكتب في نموذج الاجتماع.
      </p>
    </div>
  );
}
