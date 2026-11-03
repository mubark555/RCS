"use client";

import { useEffect, useMemo, useState } from "react";
import { meetingsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import MinutesModal, { exportMinutes } from "@/components/MinutesModal";
import LineList from "@/components/LineList";
import { PROJECTS } from "@/lib/constants";
import { useSettings } from "@/components/SettingsProvider";
import { toast } from "@/components/Toaster";
import { NOTIFY_EVENTS, REMINDER_OPTIONS, reminderLabel, resolveRecipients, detectEvent, diffMeeting, meetingReminders } from "@/lib/notify-core";
import { sendMeetingNotification, describeResult, notifyPrefsOf, eventEnabled, getEmailStatus } from "@/lib/notifications";

const EMPTY = {
  title: "", project: "", start_at: "", duration: 30, location: "",
  attendees: [], links: [], agenda: "", minutes: "", action_items: [], status: "Scheduled",
  notify: true, reminders: null, extra_emails: "",
};

const LINK_TYPES = ["تسجيل", "مستند", "رابط"];

const STATUS_AR = {
  Scheduled: { ar: "مجدول", color: "#2563eb" },
  Done: { ar: "منتهي", color: "#16a34a" },
  Cancelled: { ar: "ملغى", color: "#dc2626" },
};

export default function MeetingsPage() {
  const { readOnly, scopeProjects, users } = useRole();
  const { settings } = useSettings();
  const prefs = notifyPrefsOf(settings);
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [minutesOf, setMinutesOf] = useState(null);
  const [mailStatus, setMailStatus] = useState(null);

  async function reload() {
    setItems(await meetingsStore.list());
  }
  useEffect(() => {
    reload().catch(() => setItems([]));
    getEmailStatus().then(setMailStatus);
    const on = () => reload().catch(() => {});
    window.addEventListener("sp-meetings-changed", on);
    return () => window.removeEventListener("sp-meetings-changed", on);
  }, []);

  // إرسال إشعار حدث (مع احترام الإعدادات العامة وإعداد الاجتماع)
  async function notify(event, meeting, extra = {}) {
    if (!meeting || (meeting.notify === false && !extra.force)) return;
    if (!extra.force && !eventEnabled(prefs, event)) return;
    if (prefs.askBeforeSend && !extra.force && !confirm(`إرسال بريد «${NOTIFY_EVENTS[event].ar}» لحضور الاجتماع؟`)) return;
    const res = await sendMeetingNotification(event, meeting, { users, settings, ...extra });
    if (res?.configured === false && !extra.force) return; // البريد غير مُعدّ — لا نزعج المستخدم في كل حفظ
    toast(describeResult(res), res?.ok && !res?.failed?.length ? "success" : "error", 7000);
    await reload();
  }

  async function closeMeeting(m) {
    if (!confirm(`إغلاق الاجتماع «${m.title}» وإرسال المحضر والقرارات للحضور؟`)) return;
    const saved = await meetingsStore.update(m.id, { status: "Done" });
    await reload();
    await notify("closed", saved || { ...m, status: "Done" });
  }

  const scoped = useMemo(() => {
    if (!items) return [];
    return scopeProjects ? items.filter((m) => scopeProjects.includes(m.project)) : items;
  }, [items, scopeProjects]);

  const { upcoming, past } = useMemo(() => {
    const now = new Date().toISOString();
    const up = [], pa = [];
    for (const m of scoped) {
      if (m.status !== "Cancelled" && m.start_at >= now) up.push(m);
      else pa.push(m);
    }
    up.sort((a, b) => a.start_at.localeCompare(b.start_at));
    pa.sort((a, b) => b.start_at.localeCompare(a.start_at));
    return { upcoming: up, past: pa };
  }, [scoped]);

  if (!items) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span className="pill" style={{ fontSize: 13, padding: "6px 12px" }}>{scoped.length} اجتماع</span>
        {mailStatus && !readOnly && (
          <span className="pill" title={mailStatus.configured ? `المرسل: ${mailStatus.from || ""}` : "أضف إعدادات البريد على الخادم لتفعيل الإشعارات"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, color: mailStatus.configured && prefs.enabled ? "#16a34a" : "#d97706" }}>
            <Icon name="bell" size={13} />
            {mailStatus.configured ? (prefs.enabled ? "إشعارات البريد مفعّلة" : "إشعارات البريد متوقفة") : "البريد غير مُعدّ"}
          </span>
        )}
        <div style={{ marginInlineStart: "auto" }} />
        {!readOnly && <button className="btn primary" onClick={() => setEditing({})}>+ اجتماع جديد</button>}
      </div>

      <div className="section-title">القادمة ({upcoming.length})</div>
      {upcoming.length === 0 ? (
        <div className="empty">لا توجد اجتماعات قادمة.</div>
      ) : (
        upcoming.map((m) => <MeetingCard key={m.id} m={m} readOnly={readOnly} onEdit={() => setEditing(m)} onMinutes={() => setMinutesOf(m)} onChange={reload} onNotify={notify} onClose={() => closeMeeting(m)} />)
      )}

      {past.length > 0 && (
        <>
          <div className="section-title">السابقة / المنتهية ({past.length})</div>
          {past.map((m) => <MeetingCard key={m.id} m={m} readOnly={readOnly} onEdit={() => setEditing(m)} onMinutes={() => setMinutesOf(m)} onChange={reload} onNotify={notify} onClose={() => closeMeeting(m)} dim />)}
        </>
      )}

      {minutesOf && (
        <MinutesModal
          meeting={minutesOf}
          readOnly={readOnly}
          onClose={() => setMinutesOf(null)}
          onUpdated={reload}
          onEdit={(m) => { setMinutesOf(null); setEditing(m); }}
        />
      )}

      {editing && (
        <Modal title={editing.id ? "تعديل الاجتماع" : "اجتماع جديد"} onClose={() => setEditing(null)}>
          <MeetingForm
            initial={editing.id ? editing : null}
            users={users}
            prefs={prefs}
            mailStatus={mailStatus}
            onCancel={() => setEditing(null)}
            onSave={async (payload, { sendNotice }) => {
              const prev = editing.id ? editing : null;
              let saved;
              if (prev) {
                // تغيّر الموعد → إعادة جدولة التذكيرات
                if (prev.start_at !== payload.start_at) payload = { ...payload, reminders_sent: [] };
                saved = await meetingsStore.update(prev.id, payload);
              } else {
                saved = await meetingsStore.create({ ...payload, reminders_sent: [], notify_log: [] });
              }
              setEditing(null);
              await reload();
              const ev = detectEvent(prev, saved || payload);
              if (ev && sendNotice) await notify(ev, saved, { changes: ev === "updated" ? diffMeeting(prev, saved) : undefined });
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function MeetingCard({ m, onEdit, onMinutes, onChange, onNotify, onClose, dim, readOnly }) {
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const log = Array.isArray(m.notify_log) ? m.notify_log : [];
  const upcoming = m.status === "Scheduled" && m.start_at && new Date(m.start_at) > new Date();
  const run = (fn) => async () => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const st = STATUS_AR[m.status] || STATUS_AR.Scheduled;
  const dt = m.start_at ? new Date(m.start_at) : null;
  const dateStr = dt
    ? dt.toLocaleString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const attendees = Array.isArray(m.attendees) ? m.attendees : (m.attendees ? String(m.attendees).split(",").map((x) => x.trim()) : []);
  const links = Array.isArray(m.links) ? m.links : [];

  async function del() {
    if (!confirm(`حذف الاجتماع؟\n\n${m.title}`)) return;
    // اجتماع قادم يُحذف → إشعار الحضور بالإلغاء أولاً
    if (upcoming && m.notify !== false && confirm("إرسال إشعار إلغاء للحضور قبل الحذف؟")) {
      await onNotify("cancelled", { ...m, status: "Cancelled" });
    }
    await meetingsStore.remove(m.id);
    await onChange();
  }

  return (
    <div className="list-card" style={dim ? { opacity: 0.7 } : undefined}>
      <div className="ic" style={{ color: "var(--primary)" }}><Icon name="calendar" size={22} /></div>
      <div className="body">
        <h4>
          {m.title}
          <span className="badge" style={{ background: `${st.color}22`, color: st.color }}>{st.ar}</span>
        </h4>
        <div className="meta">
          <span>{dateStr}</span>
          <span>{m.duration} دقيقة</span>
          {m.project && <span>{m.project}</span>}
          {m.location && <span>{m.location}</span>}
        </div>
        {attendees.length > 0 && (
          <div className="meta" style={{ marginTop: 6 }}>الحضور: {attendees.join("، ")}</div>
        )}
        {m.agenda && <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-2)" }}>{m.agenda}</div>}
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button className="pill" onClick={onMinutes} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, color: m.minutes ? "var(--primary)" : "var(--text-2)", borderColor: m.minutes ? "#f3cfc9" : "var(--border)" }}>
            <Icon name="file" size={13} /> {m.minutes ? "عرض المحضر" : "المحضر"}
          </button>
          <button className="pill" onClick={() => exportMinutes(m)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="upload" size={13} /> تصدير
          </button>
          {links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer" className="pill" style={{ color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="link" size={13} /> {l.label || l.type || "رابط"}
            </a>
          ))}
          {!readOnly && m.status === "Scheduled" && (
            <button className="pill" onClick={onClose} disabled={busy} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, color: "#16a34a", borderColor: "#bfe6cd" }}>
              <Icon name="check" size={13} /> إغلاق الاجتماع
            </button>
          )}
          {!readOnly && upcoming && m.notify !== false && (
            <button className="pill" disabled={busy} onClick={run(() => onNotify("reminder", m, { force: true }))} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="bell" size={13} /> {busy ? "جاري الإرسال…" : "إرسال تذكير الآن"}
            </button>
          )}
          {!readOnly && m.status !== "Cancelled" && (
            <button className="pill" disabled={busy} onClick={run(() => onNotify(m.status === "Done" ? "closed" : "created", m, { force: true }))} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="arrow" size={13} /> {m.status === "Done" ? "إعادة إرسال المحضر" : "إعادة إرسال الدعوة"}
            </button>
          )}
        </div>
        <NotifyStrip m={m} log={log} open={showLog} onToggle={() => setShowLog((x) => !x)} />
      </div>
      {!readOnly && (
        <div className="row-actions">
          <button className="btn sm ghost icon" onClick={onEdit} title="تعديل"><Icon name="edit" size={16} /></button>
          <button className="btn sm danger icon" onClick={del} title="حذف"><Icon name="trash" size={16} /></button>
        </div>
      )}
    </div>
  );
}


const fmtShort = (iso) => new Date(iso).toLocaleString("ar-SA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// شريط حالة الإشعارات + السجل
function NotifyStrip({ m, log, open, onToggle }) {
  if (m.notify === false) {
    return <div className="notify-strip muted"><Icon name="bell" size={13} /> إشعارات البريد متوقفة لهذا الاجتماع</div>;
  }
  const rem = meetingReminders(m);
  const sent = new Set((m.reminders_sent || []).map(Number));
  const last = log[0];
  return (
    <div className="notify-strip">
      <Icon name="bell" size={13} />
      {m.status === "Scheduled" && rem.length > 0 && (
        <span className="rem-list">
          {rem.slice().sort((a, b) => b - a).map((r) => (
            <span key={r} className={`rem ${sent.has(Number(r)) ? "done" : ""}`} title={sent.has(Number(r)) ? "تم الإرسال" : "مجدول"}>
              {sent.has(Number(r)) ? "✓ " : ""}{reminderLabel(r)}
            </span>
          ))}
        </span>
      )}
      {last ? (
        <button type="button" className="link-btn" onClick={onToggle}>
          آخر إشعار: {NOTIFY_EVENTS[last.event]?.short || last.event} · {fmtShort(last.at)} ({last.sent} مستلم){log.length > 1 ? ` · السجل (${log.length})` : ""}
        </button>
      ) : (
        <span className="muted">لم يُرسل أي إشعار بعد</span>
      )}
      {open && log.length > 0 && (
        <div className="notify-log">
          {log.map((e, i) => {
            const ev = NOTIFY_EVENTS[e.event] || {};
            return (
              <div key={i} className="nl-row">
                <span className="nl-dot" style={{ background: ev.color || "#94a3b8" }} />
                <b>{ev.short || e.event}{e.label ? ` (${e.label})` : ""}</b>
                <span className="muted">{fmtShort(e.at)}</span>
                <span>✉️ {e.sent}{e.failed ? ` · ⚠️ ${e.failed} فشل` : ""}</span>
                {e.to?.length > 0 && <span className="muted nl-to" title={e.to.join(", ")}>{e.to.join("، ")}</span>}
                {e.missing?.length > 0 && <span style={{ color: "#d97706" }}>بلا بريد: {e.missing.join("، ")}</span>}
                {e.error && <span style={{ color: "#dc2626" }}>{e.error}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// قسم إعدادات الإشعارات داخل نموذج الاجتماع
function NotifySection({ f, setF, users, prefs, mailStatus, sendNotice, setSendNotice, isEdit }) {
  const reminders = Array.isArray(f.reminders) ? f.reminders : prefs.defaultReminders || [];
  const { recipients, missing } = resolveRecipients(f, users);
  const toggleRem = (min) =>
    setF((s) => {
      const cur = Array.isArray(s.reminders) ? s.reminders : prefs.defaultReminders || [];
      return { ...s, reminders: cur.includes(min) ? cur.filter((x) => x !== min) : [...cur, min].sort((a, b) => b - a) };
    });
  const on = f.notify !== false;

  return (
    <div className="field full notify-box">
      <div className="nb-head">
        <span><Icon name="bell" size={15} /> إشعارات البريد الإلكتروني</span>
        <label className="switch">
          <input type="checkbox" checked={on} onChange={(e) => setF((s) => ({ ...s, notify: e.target.checked }))} />
          <span />
        </label>
      </div>
      {mailStatus && !mailStatus.configured && (
        <div className="nb-warn">⚠️ البريد غير مُعدّ على الخادم بعد — ستُحفظ الإعدادات وتعمل فور الإعداد (راجع «تخصيص النظام»).</div>
      )}
      {on && (
        <>
          <div className="nb-label">التذكير قبل الاجتماع</div>
          <div className="attendee-picker">
            {REMINDER_OPTIONS.map((o) => (
              <span key={o.min} className={`att-chip ${reminders.includes(o.min) ? "on" : ""}`} onClick={() => toggleRem(o.min)}>{o.ar}</span>
            ))}
          </div>

          <label className="nb-label" style={{ display: "block", marginTop: 12 }}>
            بريد إضافي (ضيوف من خارج النظام — افصل بفاصلة)
            <input value={f.extra_emails || ""} onChange={(e) => setF((s) => ({ ...s, extra_emails: e.target.value }))} placeholder="guest@company.com, client@mail.com" style={{ marginTop: 6 }} dir="ltr" />
          </label>

          <div className="nb-recip">
            <b>المستلمون ({recipients.length}):</b>{" "}
            {recipients.length ? recipients.map((r) => r.name || r.email).join("، ") : <span className="muted">لا أحد — اختر حضوراً لديهم بريد أو أضف بريداً</span>}
            {missing.length > 0 && <div style={{ color: "#d97706", marginTop: 4 }}>بلا بريد إلكتروني (لن يصلهم إشعار): {missing.join("، ")} — أضِف بريدهم من صفحة الفريق.</div>}
          </div>

          <label className="nb-check">
            <input type="checkbox" checked={sendNotice} onChange={(e) => setSendNotice(e.target.checked)} />
            {isEdit ? "إرسال إشعار للحضور بالتغييرات عند الحفظ (تحديث / إلغاء / إغلاق)" : "إرسال دعوة بالبريد للحضور فور الحفظ"}
          </label>
        </>
      )}
    </div>
  );
}

function iconForLink(l) {
  const t = (l.type || l.label || "").toString();
  if (/تسجيل|record/i.test(t)) return "🎥";
  if (/محضر|minute/i.test(t)) return "📝";
  return "🔗";
}

function MeetingForm({ initial, users, prefs, mailStatus, onSave, onCancel }) {
  const [f, setF] = useState({
    ...EMPTY,
    ...(initial || {}),
    attendees: Array.isArray(initial?.attendees) ? initial.attendees : [],
    links: Array.isArray(initial?.links) ? initial.links : [],
  });
  const [saving, setSaving] = useState(false);
  const [sendNotice, setSendNotice] = useState(prefs ? prefs.enabled : true);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const toggleAtt = (name) =>
    setF((s) => ({ ...s, attendees: s.attendees.includes(name) ? s.attendees.filter((x) => x !== name) : [...s.attendees, name] }));

  const addLink = () => setF((s) => ({ ...s, links: [...s.links, { type: "تسجيل", label: "", url: "" }] }));
  const setLink = (i, k, v) => setF((s) => ({ ...s, links: s.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const rmLink = (i) => setF((s) => ({ ...s, links: s.links.filter((_, j) => j !== i) }));

  const ai = Array.isArray(f.action_items) ? f.action_items : [];
  const addAI = () => setF((s) => ({ ...s, action_items: [...ai, { text: "", assignee: "", due: "" }] }));
  const setAI = (i, k, v) => setF((s) => ({ ...s, action_items: ai.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const rmAI = (i) => setF((s) => ({ ...s, action_items: ai.filter((_, j) => j !== i) }));

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.start_at) return;
    setSaving(true);
    try {
      await onSave({
        ...f,
        duration: Number(f.duration) || 30,
        links: f.links.filter((l) => l.url),
        action_items: ai.filter((a) => a.text && a.text.trim()),
        reminders: Array.isArray(f.reminders) ? f.reminders : (prefs?.defaultReminders || []),
        notify: f.notify !== false,
      }, { sendNotice: f.notify !== false && sendNotice });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full"><span>عنوان الاجتماع *</span><input value={f.title} onChange={set("title")} required /></label>
        <label className="field">
          <span>المشروع</span>
          <select value={f.project} onChange={set("project")}>
            <option value="">—</option>
            {PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field"><span>الحالة</span>
          <select value={f.status} onChange={set("status")}>
            <option value="Scheduled">مجدول</option>
            <option value="Done">منتهي</option>
            <option value="Cancelled">ملغى</option>
          </select>
        </label>
        <label className="field"><span>التاريخ والوقت *</span>
          <input type="datetime-local" value={toLocalInput(f.start_at)} onChange={(e) => setF((s) => ({ ...s, start_at: fromLocalInput(e.target.value) }))} required />
        </label>
        <label className="field"><span>المدة (دقيقة)</span><input type="number" min={5} step={5} value={f.duration} onChange={set("duration")} /></label>
        <label className="field full"><span>المكان / رابط الاجتماع</span><input value={f.location} onChange={set("location")} placeholder="Google Meet / Zoom / مكتب…" /></label>

        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>
            الحضور (اختر من المستخدمين)
          </span>
          <div className="attendee-picker">
            {users.length === 0 ? (
              <span className="muted" style={{ fontSize: 12.5 }}>لا مستخدمون بعد — أضِفهم من قسم الفريق.</span>
            ) : (
              users.map((u) => (
                <span key={u.id} className={`att-chip ${f.attendees.includes(u.name) ? "on" : ""}`} onClick={() => toggleAtt(u.name)}>
                  {u.name}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>جدول الأعمال</span>
          <LineList value={f.agenda} onChange={(v) => setF((s) => ({ ...s, agenda: v }))} placeholder="النقطة المطروحة للنقاش…" />
        </div>
        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>محضر الاجتماع (يُكتب هنا ويُصدَّر لاحقاً)</span>
          <LineList value={f.minutes} onChange={(v) => setF((s) => ({ ...s, minutes: v }))} placeholder="أهم النقاط والمخرجات…" />
        </div>

        <div className="field full">
          <span style={{ display: "flex", alignItems: "center", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>
            القرارات والمهام الناتجة (Action Items — تتحول لمهام)
            <button type="button" className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={addAI}>+ إضافة قرار</button>
          </span>
          {ai.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input placeholder="القرار / المهمة" value={a.text} onChange={(e) => setAI(i, "text", e.target.value)} style={{ flex: 2 }} />
              <select value={a.assignee} onChange={(e) => setAI(i, "assignee", e.target.value)} style={{ flex: 1, minWidth: 110 }}>
                <option value="">المسؤول…</option>
                {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
              <input type="date" value={a.due || ""} onChange={(e) => setAI(i, "due", e.target.value)} style={{ width: 150 }} />
              <button type="button" className="btn sm danger icon" onClick={() => rmAI(i)}><Icon name="close" size={14} /></button>
            </div>
          ))}
        </div>

        <NotifySection f={f} setF={setF} users={users} prefs={prefs || {}} mailStatus={mailStatus} sendNotice={sendNotice} setSendNotice={setSendNotice} isEdit={Boolean(initial)} />

        <div className="field full">
          <span style={{ display: "flex", alignItems: "center", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>
            المرفقات والروابط (اختيارية — تسجيل / مستند)
            <button type="button" className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={addLink}>+ إضافة رابط</button>
          </span>
          {f.links.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select value={l.type} onChange={(e) => setLink(i, "type", e.target.value)} style={{ width: 120 }}>
                {LINK_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <input placeholder="الوصف" value={l.label} onChange={(e) => setLink(i, "label", e.target.value)} />
              <input placeholder="https://…" value={l.url} onChange={(e) => setLink(i, "url", e.target.value)} />
              <button type="button" className="btn sm danger icon" onClick={() => rmLink(i)}><Icon name="close" size={14} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return "";
  return new Date(v).toISOString();
}
