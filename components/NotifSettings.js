"use client";

import { useState } from "react";
import { useNotifications } from "@/components/NotificationsProvider";

const EVENTS = [
  { key: "person", label: "المستخدمون والمستفيدون والعملاء" },
  { key: "project", label: "المشاريع" },
  { key: "task", label: "المهام" },
  { key: "kpi", label: "المستهدفات" },
  { key: "meeting", label: "الاجتماعات" },
];

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      aria-pressed={on}
      style={{
        width: 44, height: 26, borderRadius: 20, border: "none", position: "relative", flex: "none",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        background: on ? "var(--primary)" : "#cfc8bd", transition: "background .18s",
      }}
    >
      <span style={{ position: "absolute", top: 3, insetInlineStart: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "inset-inline-start .18s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </button>
  );
}

export default function NotifSettings() {
  const { notifyPrefs, saveNotifyPrefs, pushToast } = useNotifications();
  const p = notifyPrefs;
  const [testing, setTesting] = useState(false);

  async function sendTest() {
    const to = (p.recipients || "").split(/[,\s;]+/).filter((e) => e.includes("@"));
    if (!to.length) { pushToast("أضِف بريد مستقبِل واحد على الأقل أولاً.", "danger"); return; }
    setTesting(true);
    try {
      const r = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: "اختبار إشعار ڤيوليت", html: "<div dir='rtl'>هذه رسالة اختبار من نظام ڤيوليت. الإعدادات تعمل بنجاح ✅</div>" }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) pushToast("تم إرسال رسالة الاختبار بنجاح ✅", "success");
      else pushToast(`فشل الإرسال: ${data?.error || r.status}`, "danger");
    } catch (e) {
      pushToast("تعذّر الاتصال بخدمة البريد.", "danger");
    } finally { setTesting(false); }
  }

  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--border)" };

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="section-title">إشعارات البريد الإلكتروني</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 8 }}>
        رسائل التوست ومركز الجرس تعمل دائماً داخل النظام. هنا تتحكّم فقط بإشعارات <b>البريد</b>.
      </p>

      <div style={{ ...row, borderTop: "1px solid var(--border)" }}>
        <div>
          <b style={{ fontSize: 14 }}>تفعيل إشعارات البريد</b>
          <div className="muted" style={{ fontSize: 12 }}>المفتاح الرئيسي — عند إيقافه لا تُرسل أي رسائل بريد.</div>
        </div>
        <Toggle on={!!p.emailEnabled} onChange={(v) => saveNotifyPrefs({ emailEnabled: v })} />
      </div>

      <label className="field" style={{ marginTop: 14 }}>
        <span>بريد المستقبلين (يفصل بينهم فاصلة)</span>
        <input dir="ltr" placeholder="admin@vuletmedia.com, manager@..." value={p.recipients || ""} onChange={(e) => saveNotifyPrefs({ recipients: e.target.value })} disabled={!p.emailEnabled} />
      </label>

      <div style={{ ...row }}>
        <div><b style={{ fontSize: 13.5 }}>إرسال أيضاً للشخص المُسنَد إليه</b><div className="muted" style={{ fontSize: 12 }}>يُرسل لبريد الموظف المسؤول عن المهمة.</div></div>
        <Toggle on={!!p.notifyAssignee} onChange={(v) => saveNotifyPrefs({ notifyAssignee: v })} disabled={!p.emailEnabled} />
      </div>
      <div style={{ ...row }}>
        <div><b style={{ fontSize: 13.5 }}>الإرسال عند الإضافة فقط</b><div className="muted" style={{ fontSize: 12 }}>لتجنّب كثرة الرسائل — يُرسل عند إنشاء عنصر جديد فقط.</div></div>
        <Toggle on={!!p.onCreateOnly} onChange={(v) => saveNotifyPrefs({ onCreateOnly: v })} disabled={!p.emailEnabled} />
      </div>

      <div className="section-title" style={{ marginTop: 18, fontSize: 14 }}>الأحداث التي تُرسل بريداً</div>
      {EVENTS.map((ev) => (
        <div key={ev.key} style={row}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ev.label}</span>
          <Toggle on={!!p.events?.[ev.key]} onChange={(v) => saveNotifyPrefs({ events: { [ev.key]: v } })} disabled={!p.emailEnabled} />
        </div>
      ))}

      <div className="modal-actions" style={{ marginTop: 18 }}>
        <button className="btn" onClick={sendTest} disabled={testing || !p.emailEnabled}>{testing ? "جاري الإرسال…" : "إرسال رسالة اختبار"}</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        يتطلب ضبط <b dir="ltr">RESEND_API_KEY</b> في إعدادات Vercel. الإعدادات هنا تُحفظ تلقائياً.
      </p>
    </div>
  );
}
