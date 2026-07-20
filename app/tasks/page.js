"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tasksStore } from "@/lib/store";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import TaskForm from "@/components/TaskForm";
import TaskDetail from "@/components/TaskDetail";
import Icon from "@/components/Icon";
import { useRole } from "@/components/RoleProvider";
import { STATUS_META, PRIORITY_META, HEALTH_META, STATUSES, PROJECTS } from "@/lib/constants";

const AV_COLORS = ["#e05a50", "#3f8e7f", "#2563eb", "#7c3aed", "#d97706", "#0d9488", "#db2777"];
const colorFor = (name) => {
  const s = String(name || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % AV_COLORS.length;
  return AV_COLORS[h];
};
const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const pad = (n) => String(n).padStart(2, "0");
const WEEK = 7 * 86400000;
// مؤرشفة: مهمة مكتملة مضى على إكمالها (أو تاريخها) أكثر من أسبوع
function isArchived(t) {
  if (t.status !== "Completed") return false;
  const r = t.completed_at || t.due_date || t.created_at;
  const d = r ? new Date(r).getTime() : NaN;
  return !isNaN(d) && d < Date.now() - WEEK;
}

export default function TasksPage() {
  const { readOnly, scopeProjects, projects } = useRole();
  const [tasks, setTasks] = useState(null);
  const [view, setView] = useState("board"); // board | list | calendar
  const [q, setQ] = useState("");
  const [fProjects, setFProjects] = useState([]);
  const [fAssignee, setFAssignee] = useState("");
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragCol, setDragCol] = useState(null);
  const [cal, setCal] = useState(null); // {y, m}
  const [showArchive, setShowArchive] = useState(false);
  const dragId = useRef(null);

  async function reload() {
    setTasks(await tasksStore.list());
  }
  useEffect(() => {
    reload().catch(() => setTasks([]));
    const now = new Date();
    setCal({ y: now.getFullYear(), m: now.getMonth() });
    try {
      const p = new URLSearchParams(window.location.search).get("q");
      if (p) setQ(p);
    } catch {}
  }, []);

  const projectColor = useMemo(() => {
    const map = {};
    (projects || []).forEach((p) => { map[p.name] = p.color; });
    return map;
  }, [projects]);

  const projectOptions = scopeProjects || PROJECTS;
  const assignees = useMemo(() => {
    if (!tasks) return [];
    return [...new Set(tasks.map((t) => (t.assigned_to || "").trim()).filter(Boolean))].sort();
  }, [tasks]);

  const visible = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (scopeProjects && !scopeProjects.includes(t.project)) return false;
      if (fProjects.length && !fProjects.includes(t.project)) return false;
      if (fAssignee && (t.assigned_to || "").trim() !== fAssignee) return false;
      if (q) {
        const hay = `${t.task} ${t.activity} ${t.assigned_to} ${t.notes}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [tasks, q, fProjects, fAssignee, scopeProjects]);

  const active = useMemo(() => visible.filter((t) => !isArchived(t)), [visible]);
  const archived = useMemo(() => visible.filter(isArchived), [visible]);

  async function handleSave(payload) {
    const p = { ...payload };
    if (p.status === "Completed" && !p.completed_at) p.completed_at = new Date().toISOString();
    if (editing && editing.id) await tasksStore.update(editing.id, p);
    else await tasksStore.create(p);
    setEditing(null);
    await reload();
  }
  async function handleDelete(t) {
    if (!confirm(`حذف المهمة؟\n\n${t.task}`)) return;
    setBusy(true);
    try { await tasksStore.remove(t.id); await reload(); } finally { setBusy(false); }
  }
  async function moveTo(status) {
    const id = dragId.current;
    dragId.current = null;
    setDragCol(null);
    if (!id) return;
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    const patch = { status };
    if (status === "Completed") patch.completed_at = new Date().toISOString();
    await tasksStore.update(id, patch);
    await reload();
  }
  const toggleProj = (p) => setFProjects((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  if (!tasks) return <div className="empty">جاري التحميل…</div>;
  const hasFilter = q || fProjects.length || fAssignee;

  // تجميع القائمة حسب المشروع
  const byProject = projectOptions
    .map((p) => ({ project: p, items: active.filter((t) => t.project === p) }))
    .filter((g) => g.items.length);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span className="pill" style={{ fontSize: 13, padding: "6px 12px" }}>{active.length} مهمة نشطة</span>
        <div className="seg">
          <button className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}>تقويم</button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>قائمة</button>
          <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}>لوحة</button>
        </div>
        <div style={{ marginInlineStart: "auto" }} />
        {!readOnly && <button className="btn primary" onClick={() => setEditing({})}>+ مهمة جديدة</button>}
      </div>

      <div className="toolbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="ابحث في المهام…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220, flex: 1 }} />
          <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} title="فلترة حسب الموظف">
            <option value="">كل الموظفين</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {hasFilter && <button className="btn sm ghost" onClick={() => { setQ(""); setFProjects([]); setFAssignee(""); }}>مسح</button>}
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <span className={`att-chip ${fProjects.length === 0 ? "on" : ""}`} onClick={() => setFProjects([])}>كل المشاريع</span>
          {projectOptions.map((p) => (
            <span key={p} className={`att-chip ${fProjects.includes(p) ? "on" : ""}`} onClick={() => toggleProj(p)}>{p}</span>
          ))}
        </div>
      </div>

      {/* ===== لوحة ===== */}
      {view === "board" && (
        <div className="kanban">
          {STATUSES.map((status) => {
            const col = active.filter((t) => t.status === status);
            const meta = STATUS_META[status];
            return (
              <div key={status} className={`kb-col ${dragCol === status ? "drag-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); if (dragCol !== status) setDragCol(status); }}
                onDragLeave={() => setDragCol((c) => (c === status ? null : c))}
                onDrop={() => moveTo(status)}>
                <div className="kb-col-head">
                  <span className="dot" style={{ background: meta.color, width: 9, height: 9, borderRadius: 9 }} />
                  {meta.ar}<span className="cnt">{col.length}</span>
                </div>
                {col.map((t) => (
                  <div key={t.id} className="kb-card" draggable={!readOnly}
                    onDragStart={() => (dragId.current = t.id)} onClick={() => setViewing(t)}>
                    <div className="kb-badges"><Badge map={PRIORITY_META} value={t.priority} /><Badge map={HEALTH_META} value={t.health} /></div>
                    <div className="kb-title">{t.task}</div>
                    <div className="kb-meta"><span>{t.project}</span>{t.assigned_to && <span>· {t.assigned_to}</span>}</div>
                    {t.due_date && <div className="kb-meta" style={{ marginTop: 3 }}>⏱ {t.due_date}</div>}
                  </div>
                ))}
                {col.length === 0 && <div className="kb-empty">—</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== قائمة ===== */}
      {view === "list" && (
        byProject.length === 0 ? <div className="empty">لا توجد مهام مطابقة.</div> :
        byProject.map((g) => (
          <div className="card lt-group" key={g.project}>
            <div className="lt-head">
              <span className="dot" style={{ background: projectColor[g.project] || "var(--primary)", width: 10, height: 10, borderRadius: 10 }} />
              <span>{g.project}</span>
              <span className="hint">({g.items.length})</span>
            </div>
            {g.items.map((t) => (
              <div className="lt-row" key={t.id} onClick={() => setViewing(t)}>
                <span className="lt-av" style={{ background: colorFor(t.assigned_to) }}>{(t.assigned_to || "؟").slice(0, 1)}</span>
                <div className="lt-main">
                  <b>{t.task}</b>
                  <small>{t.activity}{t.assigned_to ? ` · ${t.assigned_to}` : ""}</small>
                </div>
                <Badge map={PRIORITY_META} value={t.priority} />
                <Badge map={STATUS_META} value={t.status} />
                {t.due_date && <span className="lt-date">{fmtDay(t.due_date)}</span>}
                <span className="lt-dot" style={{ background: STATUS_META[t.status]?.color || "#ccc" }} />
              </div>
            ))}
          </div>
        ))
      )}

      {/* ===== تقويم ===== */}
      {view === "calendar" && cal && (
        <CalendarView cal={cal} setCal={setCal} tasks={active} projectColor={projectColor} onOpen={setViewing} />
      )}

      {/* ===== شريط المؤرشفة ===== */}
      {archived.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button className="arch-bar" onClick={() => setShowArchive((v) => !v)}>
            <Icon name="archive" size={17} />
            <span>المؤرشفة</span>
            <span className="arch-count">{archived.length}</span>
            <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>مهام مكتملة مضى عليها أكثر من أسبوع</span>
            <span style={{ marginInlineStart: "auto", transition: ".2s", transform: showArchive ? "rotate(90deg)" : "none" }}>‹</span>
          </button>
          {showArchive && (
            <div className="arch-list">
              {archived.map((t) => (
                <div className="arch-row" key={t.id} onClick={() => setViewing(t)}>
                  <span className="lt-dot" style={{ background: "#16a34a" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{t.task}</b>
                    <small>{t.project}{t.assigned_to ? ` · ${t.assigned_to}` : ""}{t.due_date ? ` · ${t.due_date}` : ""}</small>
                  </div>
                  <span className="pill" style={{ color: "#16a34a", borderColor: "#bfe6cd" }}>مكتملة</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewing && (
        <TaskDetail task={viewing} onClose={() => setViewing(null)}
          onUpdate={async (id, patch) => { await tasksStore.update(id, patch); await reload(); }}
          onEdit={(t) => { setViewing(null); setEditing(t); }}
          onDelete={async (t) => { setViewing(null); await handleDelete(t); }} />
      )}
      {editing && (
        <Modal title={editing.id ? "تعديل المهمة" : "مهمة جديدة"} onClose={() => setEditing(null)}>
          <TaskForm initial={editing.id ? editing : null} onSave={handleSave} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

function fmtDay(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function CalendarView({ cal, setCal, tasks, projectColor, onOpen }) {
  const { y, m } = cal;
  const first = new Date(y, m, 1);
  const lead = first.getDay(); // 0=الأحد
  const days = new Date(y, m + 1, 0).getDate();
  const byDate = {};
  tasks.forEach((t) => {
    if (!t.due_date) return;
    const d = new Date(t.due_date);
    if (isNaN(d) || d.getFullYear() !== y || d.getMonth() !== m) return;
    const k = d.getDate();
    (byDate[k] = byDate[k] || []).push(t);
  });
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const prev = () => setCal(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 });
  const next = () => setCal(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 });

  return (
    <div className="cal">
      <div className="cal-head">
        <div className="cal-nav">
          <button className="btn sm icon" onClick={prev}>‹</button>
          <button className="btn sm icon" onClick={next}>›</button>
        </div>
        <div className="cal-title">{MONTHS[m]} {y}</div>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => <div className="cal-wd" key={w}>{w}</div>)}
        {cells.map((d, i) => (
          <div className={`cal-cell ${d ? "" : "empty"}`} key={i}>
            {d && <div className="cal-day">{d}</div>}
            {d && (byDate[d] || []).map((t) => (
              <div key={t.id} className="cal-pill" onClick={() => onOpen(t)}
                style={{ background: `${projectColor[t.project] || "#e05a50"}22`, color: projectColor[t.project] || "#e05a50" }}
                title={t.task}>
                {t.task}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
