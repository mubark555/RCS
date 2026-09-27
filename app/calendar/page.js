"use client";

import { useEffect, useMemo, useState } from "react";
import { appSettings, tasksStore, meetingsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { isDone } from "@/lib/constants";
import { EVENT_TYPES, SEED_EVENTS } from "@/lib/calendar-seed";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const WD = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
const pad = (n) => String(n).padStart(2, "0");
const KEY = "calendar_events";
const uid = () => Math.random().toString(36).slice(2, 10);

// الروزنامة السنوية: 12 شهراً بالمناسبات الوطنية والدينية والأيام العالمية والمؤتمرات،
// مع إمكانية عرض تسليمات المهام والاجتماعات عليها.
export default function CalendarPage() {
  const { canManage, scopeProjects } = useRole();
  const [events, setEvents] = useState(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [types, setTypes] = useState([]); // [] = الكل
  const [showWork, setShowWork] = useState(true);
  const [work, setWork] = useState({ tasks: [], meetings: [] });
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    appSettings.get(KEY).then((v) => setEvents(Array.isArray(v?.events) ? v.events : SEED_EVENTS)).catch(() => setEvents(SEED_EVENTS));
    Promise.all([tasksStore.list().catch(() => []), meetingsStore.list().catch(() => [])]).then(([tasks, meetings]) => {
      const inScope = (p) => !scopeProjects || scopeProjects.includes(p);
      setWork({
        tasks: tasks.filter((t) => t.due_date && !isDone(t) && inScope(t.project)),
        meetings: meetings.filter((m) => m.start_at && m.status !== "Cancelled" && (!m.project || inScope(m.project))),
      });
    });
  }, [scopeProjects]);

  async function persist(list) {
    setEvents(list);
    await appSettings.set(KEY, { events: list });
  }

  // كل البنود في السنة المعروضة، مفهرسة بالتاريخ YYYY-MM-DD
  const byDate = useMemo(() => {
    const map = {};
    const add = (d, item) => { (map[d] = map[d] || []).push(item); };
    (events || []).forEach((e) => {
      if (types.length && !types.includes(e.type)) return;
      const md = (e.date || "").slice(5);
      if (e.yearly) add(`${year}-${md}`, { kind: "event", ...e });
      else if ((e.date || "").startsWith(`${year}-`)) add(e.date, { kind: "event", ...e });
    });
    if (showWork) {
      work.tasks.forEach((t) => { if (t.due_date.startsWith(`${year}-`)) add(t.due_date.slice(0, 10), { kind: "task", id: t.id, title: t.task, project: t.project }); });
      work.meetings.forEach((m) => {
        const d = new Date(m.start_at);
        if (d.getFullYear() === year) add(`${year}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, { kind: "meeting", id: m.id, title: m.title, project: m.project });
      });
    }
    return map;
  }, [events, year, types, showWork, work]);

  const monthItems = useMemo(() => {
    const prefix = `${year}-${pad(month + 1)}-`;
    return Object.entries(byDate)
      .filter(([d]) => d.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([d, list]) => list.map((x) => ({ ...x, day: d })));
  }, [byDate, year, month]);

  const todayKey = (() => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; })();
  const toggleType = (t) => setTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  if (!events) return <div className="empty">جاري التحميل…</div>;

  return (
    <div className="yc">
      <div className="yc-bar">
        <div className="rep-nav">
          <button className="btn sm icon" onClick={() => setYear((y) => y - 1)}>›</button>
          <b style={{ minWidth: 60 }}>{year}</b>
          <button className="btn sm icon" onClick={() => setYear((y) => y + 1)}>‹</button>
        </div>
        <div className="yc-types">
          <span className={`att-chip ${types.length === 0 ? "on" : ""}`} onClick={() => setTypes([])}>الكل</span>
          {Object.entries(EVENT_TYPES).map(([k, m]) => (
            <span key={k} className={`att-chip ${types.includes(k) ? "on" : ""}`} onClick={() => toggleType(k)}>
              <i className="yc-dot" style={{ background: m.color }} /> {m.ar}
            </span>
          ))}
          <label className="yc-work">
            <input type="checkbox" checked={showWork} onChange={(e) => setShowWork(e.target.checked)} /> التسليمات والاجتماعات
          </label>
        </div>
        {canManage && <button className="btn primary" style={{ marginInlineStart: "auto" }} onClick={() => setEditing({ date: `${year}-${pad(month + 1)}-01`, type: "internal" })}>+ فعالية</button>}
      </div>

      <div className="yc-layout">
        {/* الأشهر الـ12 */}
        <div className="yc-grid">
          {MONTHS.map((mName, m) => {
            const first = new Date(year, m, 1).getDay();
            const days = new Date(year, m + 1, 0).getDate();
            const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
            const count = Object.keys(byDate).filter((d) => d.startsWith(`${year}-${pad(m + 1)}-`)).reduce((s, d) => s + byDate[d].length, 0);
            return (
              <div key={m} className={`yc-month ${m === month ? "on" : ""}`} onClick={() => setMonth(m)}>
                <div className="yc-mhead"><b>{mName}</b>{count > 0 && <span className="yc-count">{count}</span>}</div>
                <div className="yc-days">
                  {WD.map((w) => <span key={w} className="yc-wd">{w}</span>)}
                  {cells.map((d, i) => {
                    if (!d) return <span key={i} />;
                    const key = `${year}-${pad(m + 1)}-${pad(d)}`;
                    const list = byDate[key] || [];
                    const ev = list.find((x) => x.kind === "event");
                    const color = ev ? (EVENT_TYPES[ev.type]?.color || "#999") : list.length ? "#94a3b8" : null;
                    return (
                      <span key={i} className={`yc-d ${key === todayKey ? "today" : ""} ${list.length ? "has" : ""}`}
                        style={color ? { background: `${color}22`, color, fontWeight: 800 } : undefined}
                        title={list.map((x) => x.title).join("\n")}>
                        {d}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* تفاصيل الشهر المختار */}
        <div className="card yc-list">
          <div className="section-title"><span>{MONTHS[month]} {year}</span></div>
          {monthItems.length === 0 ? <div className="empty" style={{ padding: "20px 0" }}>لا فعاليات في هذا الشهر.</div> :
            monthItems.map((x, i) => {
              const d = Number(x.day.slice(8));
              const color = x.kind === "event" ? EVENT_TYPES[x.type]?.color : x.kind === "meeting" ? "#0ea5e9" : "#64748b";
              const label = x.kind === "event" ? EVENT_TYPES[x.type]?.ar : x.kind === "meeting" ? "اجتماع" : "تسليم";
              return (
                <div className="yc-item" key={`${x.kind}-${x.id}-${i}`}>
                  <span className="yc-daybox" style={{ background: `${color}1a`, color }}>{d}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{x.title}</b>
                    <small className="muted">
                      {label}{x.project ? ` · ${x.project}` : ""}{x.approx ? " · تاريخ تقريبي" : ""}{x.note ? ` · ${x.note}` : ""}
                    </small>
                  </div>
                  {canManage && x.kind === "event" && (
                    <button className="btn sm ghost icon" title="تعديل" onClick={() => setEditing(events.find((e) => e.id === x.id))}><Icon name="edit" size={13} /></button>
                  )}
                </div>
              );
            })}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
            المناسبات الهجرية تقريبية (تُحدَّد برؤية الهلال)، ومواعيد المؤتمرات تتغيّر سنوياً — راجِعها من مصادرها الرسمية.
          </p>
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? "تعديل الفعالية" : "فعالية جديدة"} onClose={() => setEditing(null)}>
          <EventForm initial={editing}
            onCancel={() => setEditing(null)}
            onDelete={editing.id ? async () => { if (confirm(`حذف «${editing.title}»؟`)) { await persist(events.filter((e) => e.id !== editing.id)); setEditing(null); } } : null}
            onSave={async (ev) => {
              const list = ev.id ? events.map((e) => (e.id === ev.id ? ev : e)) : [...events, { ...ev, id: uid() }];
              await persist(list);
              setMonth(Number(ev.date.slice(5, 7)) - 1);
              setEditing(null);
            }} />
        </Modal>
      )}
    </div>
  );
}

function EventForm({ initial, onSave, onCancel, onDelete }) {
  const [f, setF] = useState({ title: "", date: "", type: "internal", yearly: false, approx: false, note: "", ...initial });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (f.title.trim() && f.date) onSave({ ...f, title: f.title.trim(), note: (f.note || "").trim() }); }}>
      <div className="form-grid">
        <label className="field full"><span>العنوان *</span><input value={f.title} onChange={set("title")} required /></label>
        <label className="field"><span>التاريخ *</span><input type="date" value={f.date} onChange={set("date")} required /></label>
        <label className="field"><span>النوع</span>
          <select value={f.type} onChange={set("type")}>{Object.entries(EVENT_TYPES).map(([k, m]) => <option key={k} value={k}>{m.ar}</option>)}</select>
        </label>
        <label className="field full"><span>ملاحظة</span><input value={f.note || ""} onChange={set("note")} placeholder="مثال: مناسب لحملة مشروع…" /></label>
      </div>
      <label className="hold-check"><input type="checkbox" checked={!!f.yearly} onChange={set("yearly")} /> <span>تتكرر كل سنة بنفس التاريخ</span></label>
      <label className="hold-check"><input type="checkbox" checked={!!f.approx} onChange={set("approx")} /> <span>تاريخ تقريبي</span></label>
      <div className="modal-actions">
        <button type="submit" className="btn primary">حفظ</button>
        {onDelete && <button type="button" className="btn danger" onClick={onDelete}>حذف</button>}
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
