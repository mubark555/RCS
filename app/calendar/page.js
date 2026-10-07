"use client";

import { useEffect, useMemo, useState } from "react";
import { appSettings } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { EVENT_TYPES, mergeEvents } from "@/lib/calendar-seed";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const WD = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
const pad = (n) => String(n).padStart(2, "0");
const KEY = "calendar_events";
const uid = () => Math.random().toString(36).slice(2, 10);

// الروزنامة السنوية: 12 شهراً بالمناسبات الوطنية والدينية والأيام العالمية والمواسم والمؤتمرات
// (للمناسبات والفعاليات فقط — التسليمات والاجتماعات في أقسامها).
export default function CalendarPage() {
  const { can } = useRole();
  const canManage = can("calendar", "edit");
  const [events, setEvents] = useState(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [types, setTypes] = useState([]); // [] = الكل
  const [removed, setRemoved] = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    appSettings.get(KEY).then((v) => { setRemoved(v?.removed || []); setEvents(mergeEvents(v)); }).catch(() => setEvents(mergeEvents(null)));
  }, []);

  async function persist(list, rm = removed) {
    setEvents(list);
    setRemoved(rm);
    await appSettings.set(KEY, { events: list, removed: rm });
  }

  // كل البنود في السنة المعروضة، مفهرسة بالتاريخ YYYY-MM-DD
  const byDate = useMemo(() => {
    const map = {};
    const add = (d, item) => { (map[d] = map[d] || []).push(item); };
    const s = q.trim();
    (events || []).forEach((e) => {
      if (types.length && !types.includes(e.type)) return;
      if (s && !`${e.title} ${e.desc || ""} ${e.tip || ""} ${e.note || ""}`.includes(s)) return;
      const md = (e.date || "").slice(5);
      if (e.yearly) add(`${year}-${md}`, { kind: "event", ...e });
      else if ((e.date || "").startsWith(`${year}-`)) add(e.date, { kind: "event", ...e });
    });
    return map;
  }, [events, year, types, q]);

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
          <div className="mtg-search yc-search">
            <span style={{ color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={15} /></span>
            <input placeholder="ابحث عن مناسبة…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
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
                    const ev = list[0];
                    const color = ev ? (EVENT_TYPES[ev.type]?.color || "#999") : null;
                    return (
                      <span key={i} className={`yc-d ${key === todayKey ? "today" : ""} ${list.length ? "has" : ""}`}
                        style={color ? { background: `${color}22`, color, fontWeight: 800, cursor: "pointer" } : undefined}
                        title={list.map((x) => x.title).join("\n")}
                        onClick={ev ? (e) => { e.stopPropagation(); setMonth(m); setViewing({ ...ev, day: key }); } : undefined}>
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
              const color = EVENT_TYPES[x.type]?.color || "#64748b";
              const label = EVENT_TYPES[x.type]?.ar;
              return (
                <div className="yc-item" key={`${x.kind}-${x.id}-${i}`} onClick={() => setViewing(x)} style={{ cursor: "pointer" }}>
                  <span className="yc-daybox" style={{ background: `${color}1a`, color }}>{d}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{x.title}</b>
                    <small className="muted">
                      {label}{x.approx ? " · تاريخ تقريبي" : ""}{x.note ? ` · ${x.note}` : ""}
                    </small>
                    {x.desc && <small className="yc-desc">{x.desc}</small>}
                  </div>
                  {canManage && x.kind === "event" && (
                    <button className="btn sm ghost icon" title="تعديل" onClick={(e) => { e.stopPropagation(); setEditing(events.find((ev) => ev.id === x.id)); }}><Icon name="edit" size={13} /></button>
                  )}
                </div>
              );
            })}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
            المناسبات الهجرية تقريبية (تُحدَّد برؤية الهلال)، ومواعيد المؤتمرات تتغيّر سنوياً — راجِعها من مصادرها الرسمية.
          </p>
        </div>
      </div>

      {viewing && (
        <Modal title="تفاصيل المناسبة" onClose={() => setViewing(null)}>
          <EventDetail ev={viewing} canManage={canManage} onEdit={() => { setEditing(events.find((e) => e.id === viewing.id)); setViewing(null); }} />
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? "تعديل الفعالية" : "فعالية جديدة"} onClose={() => setEditing(null)}>
          <EventForm initial={editing}
            onCancel={() => setEditing(null)}
            onDelete={editing.id ? async () => { if (confirm(`حذف «${editing.title}»؟`)) { await persist(events.filter((e) => e.id !== editing.id), [...new Set([...removed, editing.id])]); setEditing(null); } } : null}
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
    <form onSubmit={(e) => { e.preventDefault(); if (f.title.trim() && f.date) { const { kind, day, ...rest } = f; onSave({ ...rest, title: f.title.trim(), note: (f.note || "").trim() }); } }}>
      <div className="form-grid">
        <label className="field full"><span>العنوان *</span><input value={f.title} onChange={set("title")} required /></label>
        <label className="field"><span>التاريخ *</span><input type="date" value={f.date} onChange={set("date")} required /></label>
        <label className="field"><span>النوع</span>
          <select value={f.type} onChange={set("type")}>{Object.entries(EVENT_TYPES).map(([k, m]) => <option key={k} value={k}>{m.ar}</option>)}</select>
        </label>
        <label className="field full"><span>ملاحظة قصيرة</span><input value={f.note || ""} onChange={set("note")} placeholder="مثال: مناسب لحملة مشروع…" /></label>
        <label className="field full"><span>نبذة عن المناسبة</span><textarea rows={2} value={f.desc || ""} onChange={set("desc")} /></label>
        <label className="field full"><span>فكرة محتوى / تسويق</span><textarea rows={2} value={f.tip || ""} onChange={set("tip")} /></label>
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

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function EventDetail({ ev, canManage, onEdit }) {
  const t = EVENT_TYPES[ev.type] || { ar: "", color: "#64748b" };
  const day = ev.day || ev.date;
  const d = new Date(day);
  const left = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().toDateString())) / 86400000);
  return (
    <div className="yc-detail">
      <div className="yc-dhead" style={{ background: `${t.color}14`, borderColor: `${t.color}40` }}>
        <span className="yc-dday" style={{ background: t.color }}>
          <b>{d.getDate()}</b><small>{MONTHS[d.getMonth()]}</small>
        </span>
        <div style={{ minWidth: 0 }}>
          <h4>{ev.title}</h4>
          <div className="yc-dmeta">
            <span style={{ color: t.color }}>{t.ar}</span>
            <span>{WEEKDAYS[d.getDay()]}</span>
            {ev.yearly && <span>سنوية</span>}
            {ev.approx && <span>تاريخ تقريبي</span>}
            <span>{left === 0 ? "اليوم" : left > 0 ? `بعد ${left} يوم` : `مضت قبل ${-left} يوم`}</span>
          </div>
        </div>
      </div>
      {ev.desc && <div className="yc-dsec"><b><Icon name="info" size={15} /> نبذة</b><p>{ev.desc}</p></div>}
      {ev.tip && <div className="yc-dsec"><b><Icon name="flag" size={15} /> فكرة محتوى / تسويق</b><p>{ev.tip}</p></div>}
      {ev.note && <div className="yc-dsec"><b><Icon name="projects" size={15} /> ملاحظة</b><p>{ev.note}</p></div>}
      {ev.greet && <div className="yc-dsec"><b><Icon name="gift" size={15} /> تهنئة النظام</b><p>تظهر للفريق عند الدخول: «{ev.greet.message}»</p></div>}
      {ev.approx && <p className="muted" style={{ fontSize: 12 }}>التاريخ تقريبي — راجِعه من المصدر الرسمي قبل الاعتماد عليه.</p>}
      {canManage && <div className="modal-actions"><button className="btn" onClick={onEdit}><Icon name="edit" size={15} /> تعديل</button></div>}
    </div>
  );
}
