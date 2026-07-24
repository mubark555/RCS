"use client";

import { useEffect, useMemo, useState } from "react";
import { meetingsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import MinutesModal, { exportMinutes } from "@/components/MinutesModal";
import LineList from "@/components/LineList";
import { PROJECTS } from "@/lib/constants";

const EMPTY = {
  title: "", project: "", start_at: "", duration: 30, location: "",
  attendees: [], links: [], agenda: "", minutes: "", action_items: [], status: "Scheduled",
};

const LINK_TYPES = ["تسجيل", "مستند", "رابط"];

const STATUS_AR = {
  Scheduled: { ar: "مجدول", color: "#2563eb" },
  Done: { ar: "منتهي", color: "#16a34a" },
  Cancelled: { ar: "ملغى", color: "#dc2626" },
};

export default function MeetingsPage() {
  const { readOnly, scopeProjects, users } = useRole();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [minutesOf, setMinutesOf] = useState(null);
  const [q, setQ] = useState("");

  async function reload() {
    setItems(await meetingsStore.list());
  }
  useEffect(() => {
    reload().catch(() => setItems([]));
  }, []);

  const scoped = useMemo(() => {
    if (!items) return [];
    let arr = scopeProjects ? items.filter((m) => scopeProjects.includes(m.project)) : items;
    const s = q.trim().toLowerCase();
    if (s) {
      arr = arr.filter((m) =>
        [m.title, m.project, m.location, m.agenda,
         Array.isArray(m.attendees) ? m.attendees.join(" ") : m.attendees]
          .filter(Boolean).join(" ").toLowerCase().includes(s)
      );
    }
    return arr;
  }, [items, scopeProjects, q]);

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
      <div className="mtg-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", margin: 0 }}>الاجتماعات</h1>
            <span className="cnt-pill">{scoped.length} اجتماع</span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14.5, marginTop: 4 }}>جدولة ومتابعة اجتماعات الفريق والعملاء</p>
        </div>
        {!readOnly && (
          <button className="btn primary" onClick={() => setEditing({})} style={{ padding: "13px 22px", fontSize: 15, borderRadius: 14 }}>+ اجتماع جديد</button>
        )}
      </div>

      <div className="mtg-search">
        <span style={{ color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={18} /></span>
        <input placeholder="ابحث في الاجتماعات…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mtg-sec"><span className="bar" /><h2>القادمة ({upcoming.length})</h2></div>
      {upcoming.length === 0 ? (
        <div className="mtg-empty">لا توجد اجتماعات قادمة.</div>
      ) : (
        <div className="mtg-list">
          {upcoming.map((m) => <MeetingCard key={m.id} m={m} readOnly={readOnly} onEdit={() => setEditing(m)} onMinutes={() => setMinutesOf(m)} onChange={reload} />)}
        </div>
      )}

      {past.length > 0 && (
        <>
          <div className="mtg-sec"><span className="bar" /><h2>السابقة / المنتهية ({past.length})</h2></div>
          <div className="mtg-list">
            {past.map((m) => <MeetingCard key={m.id} m={m} readOnly={readOnly} onEdit={() => setEditing(m)} onMinutes={() => setMinutesOf(m)} onChange={reload} dim />)}
          </div>
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

function MeetingCard({ m, onEdit, onMinutes, onChange, dim, readOnly }) {
  const st = STATUS_AR[m.status] || STATUS_AR.Scheduled;
  const dt = m.start_at ? new Date(m.start_at) : null;
  const dateStr = dt
    ? dt.toLocaleString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const attendees = Array.isArray(m.attendees) ? m.attendees : (m.attendees ? String(m.attendees).split(",").map((x) => x.trim()) : []);
  const links = Array.isArray(m.links) ? m.links : [];
  const agendaPreview = (m.agenda || "").split("\n").filter(Boolean).join(" · ");
  const metaBits = [dateStr, `${m.duration} دقيقة`, m.project, m.location].filter(Boolean);

  async function del() {
    if (!confirm(`حذف الاجتماع؟\n\n${m.title}`)) return;
    await meetingsStore.remove(m.id);
    await onChange();
  }

  return (
    <div className={`mtg-card${dim ? " dim" : ""}`}>
      <div className="row">
        <div className="mtg-icon"><Icon name="calendar" size={26} /></div>
        <div className="mtg-body">
          <div className="t">
            <h3>{m.title}</h3>
            <span className="st" style={{ background: `${st.color}1e`, color: st.color }}>{st.ar}</span>
          </div>
          <div className="mtg-meta">{metaBits.join(" · ")}</div>
          {attendees.length > 0 && (
            <div className="mtg-att"><b>الحضور:</b> {attendees.join("، ")}</div>
          )}
          {agendaPreview && <div className="mtg-agenda">{agendaPreview}</div>}
          <div className="mtg-actions">
            <button className="mtg-btn pri" onClick={onMinutes}>
              <Icon name="file" size={15} /> {m.minutes ? "عرض المحضر" : "المحضر"}
            </button>
            <button className="mtg-btn neutral" onClick={() => exportMinutes(m)}>
              <Icon name="upload" size={15} /> تصدير
            </button>
            {links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" className="mtg-btn pri">
                <Icon name="link" size={15} /> {l.label || l.type || "رابط"}
              </a>
            ))}
          </div>
        </div>
        {!readOnly && (
          <div className="mtg-side">
            <button className="mtg-ib" onClick={onEdit} title="تعديل"><Icon name="edit" size={16} /></button>
            <button className="mtg-ib del" onClick={del} title="حذف"><Icon name="trash" size={16} /></button>
          </div>
        )}
      </div>
    </div>
  );
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
      });
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
