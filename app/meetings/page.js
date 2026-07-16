"use client";

import { useEffect, useMemo, useState } from "react";
import { meetingsStore } from "@/lib/store";
import Modal from "@/components/Modal";
import { PROJECTS } from "@/lib/constants";

const EMPTY = {
  title: "",
  project: "",
  start_at: "",
  duration: 30,
  location: "",
  attendees: "",
  agenda: "",
  status: "Scheduled",
};

const STATUS_AR = {
  Scheduled: { ar: "مجدول", color: "#3b82f6" },
  Done: { ar: "منتهي", color: "#22c55e" },
  Cancelled: { ar: "ملغى", color: "#ef4444" },
};

export default function MeetingsPage() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);

  async function reload() {
    setItems(await meetingsStore.list());
  }
  useEffect(() => {
    reload().catch(() => setItems([]));
  }, []);

  const { upcoming, past } = useMemo(() => {
    if (!items) return { upcoming: [], past: [] };
    const now = new Date().toISOString();
    const up = [];
    const pa = [];
    for (const m of items) {
      if (m.status !== "Cancelled" && m.start_at >= now) up.push(m);
      else pa.push(m);
    }
    up.sort((a, b) => a.start_at.localeCompare(b.start_at));
    pa.sort((a, b) => b.start_at.localeCompare(a.start_at));
    return { upcoming: up, past: pa };
  }, [items]);

  if (!items) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      <div className="section-title" style={{ marginTop: 10, justifyContent: "space-between" }}>
        <span>📅 جدولة الاجتماعات</span>
        <button className="btn primary" onClick={() => setEditing({})}>
          + اجتماع جديد
        </button>
      </div>

      <div className="section-title">القادمة ({upcoming.length})</div>
      {upcoming.length === 0 ? (
        <div className="empty">لا توجد اجتماعات قادمة.</div>
      ) : (
        upcoming.map((m) => (
          <MeetingCard key={m.id} m={m} onEdit={() => setEditing(m)} onChange={reload} />
        ))
      )}

      {past.length > 0 && (
        <>
          <div className="section-title">السابقة / المنتهية ({past.length})</div>
          {past.map((m) => (
            <MeetingCard key={m.id} m={m} onEdit={() => setEditing(m)} onChange={reload} dim />
          ))}
        </>
      )}

      {editing && (
        <Modal title={editing.id ? "تعديل الاجتماع" : "اجتماع جديد"} onClose={() => setEditing(null)}>
          <MeetingForm
            initial={editing.id ? editing : null}
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

function MeetingCard({ m, onEdit, onChange, dim }) {
  const st = STATUS_AR[m.status] || STATUS_AR.Scheduled;
  const dt = m.start_at ? new Date(m.start_at) : null;
  const dateStr = dt
    ? dt.toLocaleString("ar-SA", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  async function del() {
    if (!confirm(`حذف الاجتماع؟\n\n${m.title}`)) return;
    await meetingsStore.remove(m.id);
    await onChange();
  }

  return (
    <div className="list-card" style={dim ? { opacity: 0.65 } : undefined}>
      <div className="ic">🗓️</div>
      <div className="body">
        <h4>
          {m.title}{" "}
          <span className="badge" style={{ background: `${st.color}22`, color: st.color }}>
            {st.ar}
          </span>
        </h4>
        <div className="meta">
          <span>🕒 {dateStr}</span>
          <span>⏱ {m.duration} دقيقة</span>
          {m.project && <span>📁 {m.project}</span>}
          {m.location && <span>📍 {m.location}</span>}
        </div>
        {m.attendees && <div className="meta" style={{ marginTop: 4 }}>👥 {m.attendees}</div>}
        {m.agenda && <div style={{ marginTop: 6, fontSize: 13 }}>{m.agenda}</div>}
      </div>
      <div className="row-actions">
        <button className="btn sm ghost" onClick={onEdit}>✎</button>
        <button className="btn sm danger" onClick={del}>🗑</button>
      </div>
    </div>
  );
}

function MeetingForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ ...EMPTY, ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.start_at) return;
    setSaving(true);
    try {
      await onSave({ ...f, duration: Number(f.duration) || 30 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full">
          <span>عنوان الاجتماع *</span>
          <input value={f.title} onChange={set("title")} required />
        </label>
        <label className="field">
          <span>المشروع</span>
          <input list="mprojects" value={f.project} onChange={set("project")} />
          <datalist id="mprojects">
            {PROJECTS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>الحالة</span>
          <select value={f.status} onChange={set("status")}>
            <option value="Scheduled">مجدول</option>
            <option value="Done">منتهي</option>
            <option value="Cancelled">ملغى</option>
          </select>
        </label>
        <label className="field">
          <span>التاريخ والوقت *</span>
          <input type="datetime-local" value={toLocalInput(f.start_at)} onChange={(e) => setF((s) => ({ ...s, start_at: fromLocalInput(e.target.value) }))} required />
        </label>
        <label className="field">
          <span>المدة (دقيقة)</span>
          <input type="number" min={5} step={5} value={f.duration} onChange={set("duration")} />
        </label>
        <label className="field full">
          <span>المكان / الرابط</span>
          <input value={f.location} onChange={set("location")} placeholder="Google Meet / Zoom / مكتب فيوليت…" />
        </label>
        <label className="field full">
          <span>الحضور</span>
          <input value={f.attendees} onChange={set("attendees")} placeholder="أسماء مفصولة بفاصلة" />
        </label>
        <label className="field full">
          <span>جدول الأعمال</span>
          <textarea rows={3} value={f.agenda} onChange={set("agenda")} />
        </label>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "جاري الحفظ…" : "حفظ"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

// تحويل ISO <-> صيغة input[datetime-local] بدون تغيير المنطقة الزمنية
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
