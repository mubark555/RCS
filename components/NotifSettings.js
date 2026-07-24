"use client";

import { useState } from "react";
import { useNotifications } from "@/components/NotificationsProvider";
import { useRole } from "@/components/RoleProvider";

const EVENTS = [
  { key: "person", label: "المستخدمون والمستفيدون والعملاء" },
  { key: "project", label: "المشاريع" },
  { key: "task", label: "المهام" },
  { key: "kpi", label: "المستهدفات" },
  { key: "meeting", label: "الاجتماعات" },
];

const ROLE_AR = { manager: "مدير", member: "عضو", client: "عميل" };

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
  const { users } = useRole();
  const p = notifyPrefs;
  const [testing, setTesting] = useState(false);

  const withEmail = users.filter((u) => (u.email || "").includes("@"));
  const withoutEmail = users.filter((u) => !(u.email || "").includes("@"));
  const selected = Array.isArray(p.recipientUsers) ? p.recipientUsers : [];

  function toggleUser(name) {
    const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
    saveNotifyPrefs({ recipientUsers: next });
  }

  function resolveEmails() {
    const set = new Set();
    selected.forEach((name) => { const u = users.find((x) => x.name === name); if (u?.email) set.add(u.email.trim()); });
    (p.extraEmails || "").split(/[,\s;]+/).forEach((e) => { if (e && e.includes("@")) set.add(e.trim()); });
    return [...set];
  }

  async function sendTest() {
    const to = resolveEmails();
    if (!to.length) { pushToast("اختر مستخدماً واحداً على الأقل (له بريد) أو أضِف بريداً إضافياً.", "danger"); return; }
    setTesting(true);
    try {
      const r = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: "اختبار إشعار ڤيوليت", html: "<div dir='rtl'>هذه رسالة اختبار من نظام ڤيوليت. الإعدادات تعمل بنجاح ✅</div>" }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) pushToast(`تم إرسال الاختبار إلى ${to.length} مستقبِل ✅`, "success");
      else pushToast(`فشل الإرسال: ${data?.error || r.status}`, "danger");
    } catch {
      pushToast("تعذّر الاتصال بخدمة البريد.", "danger");
    } finally { setTesting(false); }
  }

  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--border)" };
  const dis = !p.emailEnabled;

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="section-title">إشعارات البريد الإلكتروني</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 8 }}>
        رسائل التوست ومركز الجرس تعمل دائماً داخل النظام. هنا تتحكّم بإشعارات <b>البريد</b> ونصوصها.
      </p>

      <div style={{ ...row, borderTop: "1px solid var(--border)" }}>
        <div>
          <b style={{ fontSize: 14 }}>تفعيل إشعارات البريد</b>
          <div className="muted" style={{ fontSize: 12 }}>المفتاح الرئيسي — عند إيقافه لا تُرسل أي رسائل بريد.</div>
        </div>
        <Toggle on={!!p.emailEnabled} onChange={(v) => saveNotifyPrefs({ emailEnabled: v })} />
      </div>

      {/* اختيار المستقبلين من المستخدمين */}
      <div className="section-title" style={{ marginTop: 18, fontSize: 14 }}>المستقبلون (من المستخدمين)</div>
      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>اختر من له بريد مسجّل. لإضافة بريد لمستخدم، عدّله من قسم «الفريق».</p>
      {withEmail.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: "6px 0" }}>لا يوجد مستخدمون لديهم بريد بعد — أضِف البريد من قسم الفريق.</div>
      ) : (
        <div className="attendee-picker">
          {withEmail.map((u) => (
            <span key={u.id || u.name} className={`att-chip ${selected.includes(u.name) ? "on" : ""}`} onClick={() => !dis && toggleUser(u.name)} style={{ opacity: dis ? 0.5 : 1, cursor: dis ? "not-allowed" : "pointer" }} title={u.email}>
              {u.name} · {ROLE_AR[u.role] || u.role}
            </span>
          ))}
        </div>
      )}
      {withoutEmail.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          بلا بريد ({withoutEmail.length}): {withoutEmail.map((u) => u.name).join("، ")}
        </div>
      )}

      <label className="field" style={{ marginTop: 14 }}>
        <span>بريد إضافي خارجي (اختياري)</span>
        <input dir="ltr" placeholder="external@example.com" value={p.extraEmails || ""} onChange={(e) => saveNotifyPrefs({ extraEmails: e.target.value })} disabled={dis} />
      </label>

      <div style={{ ...row }}>
        <div><b style={{ fontSize: 13.5 }}>إرسال أيضاً للشخص المُسنَد إليه</b><div className="muted" style={{ fontSize: 12 }}>يُرسل لبريد الموظف المسؤول عن المهمة.</div></div>
        <Toggle on={!!p.notifyAssignee} onChange={(v) => saveNotifyPrefs({ notifyAssignee: v })} disabled={dis} />
      </div>
      <div style={{ ...row }}>
        <div><b style={{ fontSize: 13.5 }}>الإرسال عند الإضافة فقط</b><div className="muted" style={{ fontSize: 12 }}>يُرسل عند إنشاء عنصر جديد فقط (لتقليل الرسائل).</div></div>
        <Toggle on={!!p.onCreateOnly} onChange={(v) => saveNotifyPrefs({ onCreateOnly: v })} disabled={dis} />
      </div>

      {/* الأحداث */}
      <div className="section-title" style={{ marginTop: 18, fontSize: 14 }}>الأحداث التي تُرسل بريداً</div>
      {EVENTS.map((ev) => (
        <div key={ev.key} style={row}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ev.label}</span>
          <Toggle on={!!p.events?.[ev.key]} onChange={(v) => saveNotifyPrefs({ events: { [ev.key]: v } })} disabled={dis} />
        </div>
      ))}

      {/* قوالب النصوص */}
      <div className="section-title" style={{ marginTop: 18, fontSize: 14 }}>نصوص الرسائل</div>
      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
        المتغيّرات المتاحة: <b dir="rtl">{"{الإجراء}"}</b> (تمت إضافة/تحديث/حذف) · <b>{"{النوع}"}</b> (مشروع/مهمة…) · <b>{"{الاسم}"}</b>
      </p>
      <label className="field">
        <span>عنوان الرسالة (يظهر في التوست والجرس والبريد)</span>
        <input value={p.titleTemplate || ""} onChange={(e) => saveNotifyPrefs({ titleTemplate: e.target.value })} placeholder="{الإجراء} {النوع}: {الاسم}" />
      </label>
      <label className="field">
        <span>نص البريد</span>
        <textarea rows={3} value={p.bodyTemplate || ""} onChange={(e) => saveNotifyPrefs({ bodyTemplate: e.target.value })} placeholder="{الإجراء} {النوع}: {الاسم}" />
      </label>

      <div className="modal-actions" style={{ marginTop: 14 }}>
        <button className="btn" onClick={sendTest} disabled={testing || dis}>{testing ? "جاري الإرسال…" : "إرسال رسالة اختبار"}</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        يتطلب ضبط <b dir="ltr">RESEND_API_KEY</b> في إعدادات Vercel. الإعدادات هنا تُحفظ تلقائياً.
      </p>
    </div>
  );
}
