"use client";

import { useEffect, useMemo, useState } from "react";
import { meetingsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import { PROJECTS } from "@/lib/constants";

const EMPTY = {
  title: "", project: "", start_at: "", duration: 30, location: "",
  attendees: [], links: [], agenda: "", status: "Scheduled",
};

const STATUS_AR = {
  Scheduled: { ar: "مجدول", color: "#2563eb" },
  Done: { ar: "منتهي", color: "#16a34a" },
  Cancelled: { ar: "ملغى", color: "#dc2626" },
};

export default function MeetingsPage() {
  const { readOnly, clientProject, users } = useRole();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);

  async function reload() {
    setItems(await meetingsStore.list());
  }
  useEffect(() => {
    reload().catch(() => setItems([]));
  }, []);

  const scoped = useMemo(() => {
    if (!items) return [];
    return clientProject ? items.filter((m) => m.project === clientProject) : items;
  }, [items, clientProject]);

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
        <div style={{ marginInlineStart: "auto" }} />
        {!readOnly && <button className="btn primary" onClick={() => setEditing({})}>+ اجتماع جديد</button>}
      </div>

      <div className="section-title">القادمة ({upcoming.length})</div>
      {upcoming.length === 0 ? (
        <div className="empty">لا توجد اجتماعات قادمة.</div>
      ) : (
        upcoming.map((m) => <MeetingCard key={m.id} m={m} readOnly={readOnly} onEdit={() => setEditing(m)} onChange={reload} />)
      )}

      {past.length > 0 && (
        <>
          <div className="section-title">السابقة / المنتهية ({past.length})</div>
          {past.map((m) => <MeetingCard key={m.id} m={m} readOnly={readOnly} onEdit={() => setEditing(m)} onChange={reload} dim />)}
        </>
      )}

      {editing && (
        <Modal title={editing.id ? "تعديل الاجتماع" : "اجتماع جديد"} onClose={() => setEditing(null)}>
          <MeetingForm
            initial={editing.id ? editing : null}
            users={users}
            onCancel={() => setEditing(null)}
            onSave={async (payload) => {
              if (editing.id) await meetingsStore.update(editing.id, payload);
              else await meetingsStore.create(payload);
              setEditing(null);
              await reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function MeetingCard({ m, onEdit, onChange, dim, readOnly }) {
  const st = STATUS_AR[m.status] || STATUS_AR.Scheduled;
  const dt = m.start_at ? new Date(m.start_at) : null;
  const dateStr = dt
    ? dt.toLocaleString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const attendees = Array.isArray(m.attendees) ? m.attendees : (m.attendees ? String(m.attendees).split(",").map((x) => x.trim()) : []);
  const links = Array.isArray(m.links) ? m.links : [];

  async function del() {
    if (!confirm(`حذف الاجتماع؟\n\n${m.title}`)) return;
    await meetingsStore.remove(m.id);
    await onChange();
  }

  return (
    <div className="list-card" style={dim ? { opacity: 0.7 } : undefined}>
      <div className="ic">🗓️</div>
      <div className="body">
        <h4>
          {m.title}
          <span className="badge" style={{ background: `${st.color}22`, color: st.color }}>{st.ar}</span>
        </h4>
        <div className="meta">
          <span>🕒 {dateStr}</span>
          <span>⏱ {m.duration} دقيقة</span>
          {m.project && <span>📁 {m.project}</span>}
          {m.location && <span>📍 {m.location}</span>}
        </div>
        {attendees.length > 0 && (
          <div className="meta" style={{ marginTop: 6 }}>👥 {attendees.join("، ")}</div>
        )}
        {m.agenda && <div style={{ marginTop: 8, fontSize: 13 }}>{m.agenda}</div>}
        {links.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" className="pill" style={{ color: "var(--primary)" }}>
                {iconForLink(l)} {l.label || "رابط"}
              </a>
            ))}
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="row-actions">
          <button className="btn sm ghost" onClick={onEdit}>✎</button>
          <button className="btn sm danger" onClick={del}>🗑</button>
        </div>
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

function MeetingForm({ initial, users, onSave, onCancel }) {
  const [f, setF] = useState({
    ...EMPTY,
    ...(initial || {}),
    attendees: Array.isArray(initial?.attendees) ? initial.attendees : [],
    links: Array.isArray(initial?.links) ? initial.links : [],
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const toggleAtt = (name) =>
    setF((s) => ({ ...s, attendees: s.attendees.includes(name) ? s.attendees.filter((x) => x !== name) : [...s.attendees, name] }));

  const addLink = () => setF((s) => ({ ...s, links: [...s.links, { type: "محضر", label: "", url: "" }] }));
  const setLink = (i, k, v) => setF((s) => ({ ...s, links: s.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const rmLink = (i) => setF((s) => ({ ...s, links: s.links.filter((_, j) => j !== i) }));

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.start_at) return;
    setSaving(true);
    try {
      await onSave({ ...f, duration: Number(f.duration) || 30, links: f.links.filter((l) => l.url) });
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
          <span style={{ display: "flex", alignItems: "center", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>
            المرفقات والروابط (محاضر / تسجيلات)
            <button type="button" className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={addLink}>+ إضافة رابط</button>
          </span>
          {f.links.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select value={l.type} onChange={(e) => setLink(i, "type", e.target.value)} style={{ width: 120 }}>
                <option value="محضر">محضر</option>
                <option value="تسجيل">تسجيل</option>
                <option value="مستند">مستند</option>
                <option value="رابط">رابط</option>
              </select>
              <input placeholder="الوصف" value={l.label} onChange={(e) => setLink(i, "label", e.target.value)} />
              <input placeholder="https://…" value={l.url} onChange={(e) => setLink(i, "url", e.target.value)} />
              <button type="button" className="btn sm danger" onClick={() => rmLink(i)}>✕</button>
            </div>
          ))}
        </div>

        <label className="field full"><span>جدول الأعمال</span><textarea rows={3} value={f.agenda} onChange={set("agenda")} /></label>
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
