"use client";

import { useState } from "react";
import {
  useNotifications, renderTemplate, getNotif, buildEmailHtml, systemUrlFrom,
  NOTIF_CATALOG, NOTIF_ACTIONS, notifKey,
} from "@/components/NotificationsProvider";
import { useRole } from "@/components/RoleProvider";

const ROLE_AR = { manager: "مدير", member: "عضو", client: "عميل" };

// أمثلة توضيحية لكل نوع حدث تُستخدم في المعاينة الحيّة
const EVENT_SAMPLE = {
  person: { entity: "مستخدم", label: "أحمد الفلاني", record: { role: "member", title: "مصمم", email: "ahmad@example.com", project: "Homera" } },
  project: { entity: "مشروع", label: "Homera", record: {} },
  task: { entity: "مهمة", label: "تصميم الهوية البصرية", record: { assigned_to: "أحمد" } },
  kpi: { entity: "مستهدف", label: "رضا العملاء", record: {} },
  meeting: { entity: "اجتماع", label: "اجتماع متابعة أسبوعي", record: {} },
};

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
  const [openKey, setOpenKey] = useState(null); // مفتاح الإشعار المفتوح للتعديل

  const withEmail = users.filter((u) => (u.email || "").includes("@"));
  const withoutEmail = users.filter((u) => !(u.email || "").includes("@"));
  const selected = Array.isArray(p.recipientUsers) ? p.recipientUsers : [];

  function toggleUser(name) {
    const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
    saveNotifyPrefs({ recipientUsers: next });
  }

  // تحديث إشعار محدّد (on/subject/body)
  function setNotif(key, patch) {
    const cur = p.notifs || {};
    saveNotifyPrefs({ notifs: { ...cur, [key]: { ...(cur[key] || {}), ...patch } } });
  }
  function resetNotif(key) {
    const cur = { ...(p.notifs || {}) };
    const on = cur[key]?.on;
    cur[key] = { on: !!on }; // نُبقي حالة التشغيل ونمسح النصوص
    saveNotifyPrefs({ notifs: cur });
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
        body: JSON.stringify({
          to,
          subject: "اختبار إشعار ڤيوليت",
          html: buildEmailHtml("اختبار إشعار ڤيوليت", "هذه رسالة اختبار من نظام ڤيوليت. الإعدادات تعمل بنجاح ✅", systemUrlFrom(p)),
          fromName: (p.senderName || "").trim() || undefined,
        }),
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
        <div><b style={{ fontSize: 13.5 }}>إرسال للمستخدم الجديد نفسه</b><div className="muted" style={{ fontSize: 12 }}>عند إضافة/تعديل مستخدم، تصله رسالة الترحيب على بريده هو (وليس المستقبِلين فقط).</div></div>
        <Toggle on={!!p.sendToNewUser} onChange={(v) => saveNotifyPrefs({ sendToNewUser: v })} disabled={dis} />
      </div>
      <div style={{ ...row }}>
        <div><b style={{ fontSize: 13.5 }}>إرسال أيضاً للشخص المُسنَد إليه</b><div className="muted" style={{ fontSize: 12 }}>يُرسل لبريد الموظف المسؤول عن المهمة.</div></div>
        <Toggle on={!!p.notifyAssignee} onChange={(v) => saveNotifyPrefs({ notifyAssignee: v })} disabled={dis} />
      </div>

      {/* اسم المُرسِل ورابط النظام */}
      <div className="section-title" style={{ marginTop: 18, fontSize: 14 }}>اسم المُرسِل ورابط النظام</div>
      <label className="field">
        <span>الاسم الظاهر في خانة «من» بالبريد (اتركه فارغاً للاسم الافتراضي)</span>
        <input value={p.senderName || ""} onChange={(e) => saveNotifyPrefs({ senderName: e.target.value })} placeholder="ڤيوليت" disabled={dis} />
      </label>
      <label className="field">
        <span>رابط النظام (يظهر كزر «فتح النظام» في كل رسالة — اتركه فارغاً لاستخدام رابط الموقع الحالي تلقائياً)</span>
        <input dir="ltr" value={p.systemUrl || ""} onChange={(e) => saveNotifyPrefs({ systemUrl: e.target.value })} placeholder={systemUrlFrom({}) || "https://your-system.com"} disabled={dis} />
      </label>

      {/* الرسالة الافتراضية */}
      <div className="section-title" style={{ marginTop: 18, fontSize: 14 }}>الرسالة الافتراضية</div>
      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
        تُستخدم لأي إشعار لم تخصّص له نصاً خاصاً. المتغيّرات المتاحة:
        <span dir="rtl" style={{ display: "block", marginTop: 4 }}>
          <code>{"{الإجراء}"}</code> <code>{"{النوع}"}</code> <code>{"{الاسم}"}</code> <code>{"{الدور}"}</code> <code>{"{المسمى}"}</code> <code>{"{البريد}"}</code> <code>{"{المشروع}"}</code>
        </span>
      </p>
      <label className="field">
        <span>عنوان الرسالة</span>
        <input value={p.titleTemplate || ""} onChange={(e) => saveNotifyPrefs({ titleTemplate: e.target.value })} placeholder="{الإجراء} {النوع}: {الاسم}" disabled={dis} />
      </label>
      <label className="field">
        <span>نص البريد</span>
        <textarea rows={3} value={p.bodyTemplate || ""} onChange={(e) => saveNotifyPrefs({ bodyTemplate: e.target.value })} placeholder="{الإجراء} {النوع}: {الاسم}" disabled={dis} />
      </label>

      {/* قائمة الإشعارات المحدّدة */}
      <div className="section-title" style={{ marginTop: 20, fontSize: 14 }}>الإشعارات التي تُرسل بريداً</div>
      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>
        فعّل أو أوقف كل إشعار على حدة، واضغط <b>«تعديل»</b> لتخصيص عنوانه ونصّه. الحقول الفارغة ترث «الرسالة الافتراضية».
      </p>

      {NOTIF_CATALOG.map((cat) => (
        <div key={cat.entityKey} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--primary)", margin: "12px 0 2px" }}>{cat.group}</div>
          {NOTIF_ACTIONS.map((action) => {
            const key = notifKey(cat.entityKey, action);
            const nx = getNotif(p, cat.entityKey, action);
            const raw = (p.notifs || {})[key] || {};
            const isCustom = (raw.subject || "").trim() || (raw.body || "").trim();
            const expanded = openKey === key;

            // معاينة حيّة لهذا الإشعار
            const sampleEvt = { action, ...(EVENT_SAMPLE[cat.entityKey] || {}) };
            const previewSubject = renderTemplate(nx.subject, sampleEvt) || "(بدون عنوان)";
            const previewBody = renderTemplate(nx.body, sampleEvt);

            return (
              <div key={key} style={{ borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
                  <Toggle on={nx.on} onChange={(v) => setNotif(key, { on: v })} disabled={dis} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>
                    {cat.labels[action]}
                    {isCustom && <span className="muted" style={{ fontSize: 11, fontWeight: 700, marginInlineStart: 6 }}>✳︎ مخصّص</span>}
                  </span>
                  <button type="button" className={`btn sm ${expanded ? "" : "ghost"}`} onClick={() => setOpenKey(expanded ? null : key)} disabled={dis}>
                    {expanded ? "إغلاق" : "تعديل"}
                  </button>
                </div>

                {expanded && (
                  <div style={{ padding: "4px 0 14px", paddingInlineStart: 56 }}>
                    <label className="field">
                      <span>عنوان الرسالة</span>
                      <input value={raw.subject || ""} onChange={(e) => setNotif(key, { subject: e.target.value })} placeholder={`الافتراضي: ${p.titleTemplate || ""}`} disabled={dis} />
                    </label>
                    <label className="field">
                      <span>نص الرسالة</span>
                      <textarea rows={3} value={raw.body || ""} onChange={(e) => setNotif(key, { body: e.target.value })} placeholder={`الافتراضي: ${p.bodyTemplate || ""}`} disabled={dis} />
                    </label>

                    {/* معاينة */}
                    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface)", marginTop: 4 }}>
                      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                        <div className="muted" style={{ fontSize: 10.5 }}>من: {(p.senderName || "").trim() || "ڤيوليت"}</div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{previewSubject}</div>
                      </div>
                      <div style={{ padding: "10px 12px", fontSize: 12.5, lineHeight: 1.85, whiteSpace: "pre-line", color: "var(--text-2)" }}>
                        {previewBody || <span className="muted">(النص فارغ)</span>}
                      </div>
                    </div>

                    {isCustom && (
                      <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => resetNotif(key)} disabled={dis}>
                        العودة للرسالة الافتراضية
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button className="btn" onClick={sendTest} disabled={testing || dis}>{testing ? "جاري الإرسال…" : "إرسال رسالة اختبار"}</button>
      </div>
    </div>
  );
}
