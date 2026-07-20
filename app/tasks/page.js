"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tasksStore } from "@/lib/store";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import TaskForm from "@/components/TaskForm";
import TaskDetail from "@/components/TaskDetail";
import Icon from "@/components/Icon";
import { useRole } from "@/components/RoleProvider";
import { STATUS_META, PRIORITY_META, HEALTH_META, APPROVAL_META, STATUSES, PROJECTS } from "@/lib/constants";

export default function TasksPage() {
  const { readOnly, scopeProjects } = useRole();
  const [tasks, setTasks] = useState(null);
  const [view, setView] = useState("board"); // board | table
  const [q, setQ] = useState("");
  const [fProjects, setFProjects] = useState([]); // متعدد
  const [fStatus, setFStatus] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragCol, setDragCol] = useState(null);
  const dragId = useRef(null);

  async function reload() {
    setTasks(await tasksStore.list());
  }
  useEffect(() => {
    reload().catch(() => setTasks([]));
    try {
      const p = new URLSearchParams(window.location.search).get("q");
      if (p) setQ(p);
    } catch {}
  }, []);

  const projectOptions = useMemo(() => {
    const base = scopeProjects || PROJECTS;
    return base;
  }, [scopeProjects]);

  const assignees = useMemo(() => {
    if (!tasks) return [];
    return [...new Set(tasks.map((t) => (t.assigned_to || "").trim()).filter(Boolean))].sort();
  }, [tasks]);

  // مرئية بعد كل الفلاتر عدا الحالة (الحالة = أعمدة اللوحة)
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

  const tableRows = useMemo(
    () => (fStatus ? visible.filter((t) => t.status === fStatus) : visible),
    [visible, fStatus]
  );

  async function handleSave(payload) {
    if (editing && editing.id) await tasksStore.update(editing.id, payload);
    else await tasksStore.create(payload);
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
    await tasksStore.update(id, { status });
    await reload();
  }

  const toggleProj = (p) =>
    setFProjects((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  if (!tasks) return <div className="empty">جاري التحميل…</div>;
  const hasFilter = q || fProjects.length || fStatus || fAssignee;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span className="pill" style={{ fontSize: 13, padding: "6px 12px" }}>{visible.length} من {tasks.length} مهمة</span>
        <div className="seg">
          <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}>لوحة</button>
          <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>جدول</button>
        </div>
        <div style={{ marginInlineStart: "auto" }} />
        {!readOnly && <button className="btn primary" onClick={() => setEditing({})}>+ مهمة جديدة</button>}
      </div>

      <div className="toolbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="بحث في المهام…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220, flex: 1 }} />
          <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} title="فلترة حسب الموظف">
            <option value="">كل الموظفين</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {view === "table" && (
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">كل الحالات</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].ar}</option>)}
            </select>
          )}
          {hasFilter && (
            <button className="btn sm ghost" onClick={() => { setQ(""); setFProjects([]); setFStatus(""); setFAssignee(""); }}>مسح الفلاتر</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>المشاريع:</span>
          {projectOptions.map((p) => (
            <span key={p} className={`att-chip ${fProjects.includes(p) ? "on" : ""}`} onClick={() => toggleProj(p)}>{p}</span>
          ))}
        </div>
      </div>

      {view === "board" ? (
        <div className="kanban">
          {STATUSES.map((status) => {
            const col = visible.filter((t) => t.status === status);
            const meta = STATUS_META[status];
            return (
              <div
                key={status}
                className={`kb-col ${dragCol === status ? "drag-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); if (dragCol !== status) setDragCol(status); }}
                onDragLeave={() => setDragCol((c) => (c === status ? null : c))}
                onDrop={() => moveTo(status)}
              >
                <div className="kb-col-head">
                  <span className="dot" style={{ background: meta.color, width: 9, height: 9, borderRadius: 9 }} />
                  {meta.ar}
                  <span className="cnt">{col.length}</span>
                </div>
                {col.map((t) => (
                  <div
                    key={t.id}
                    className="kb-card"
                    draggable={!readOnly}
                    onDragStart={() => (dragId.current = t.id)}
                    onClick={() => setViewing(t)}
                  >
                    <div className="kb-badges">
                      <Badge map={PRIORITY_META} value={t.priority} />
                      <Badge map={HEALTH_META} value={t.health} />
                    </div>
                    <div className="kb-title">{t.task}</div>
                    <div className="kb-meta">
                      <span>{t.project}</span>
                      {t.assigned_to && <span>· {t.assigned_to}</span>}
                    </div>
                    {t.due_date && <div className="kb-meta" style={{ marginTop: 3 }}>⏱ {t.due_date}</div>}
                  </div>
                ))}
                {col.length === 0 && <div className="kb-empty">—</div>}
              </div>
            );
          })}
        </div>
      ) : tableRows.length === 0 ? (
        <div className="empty">لا توجد مهام مطابقة.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>المهمة</th><th>المشروع</th><th>النشاط</th><th>الأولوية</th><th>الحالة</th>
                <th>المسؤول</th><th>الاستحقاق</th><th>بانتظار</th><th>الاعتماد</th><th>الصحة</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((t) => (
                <tr key={t.id}>
                  <td className="task-cell" style={{ cursor: "pointer" }} onClick={() => setViewing(t)}>
                    {t.task}
                    {t.blocker && <div className="cell-block">⚠ {t.blocker}</div>}
                  </td>
                  <td className="nowrap">{t.project}</td>
                  <td className="muted nowrap">{t.activity}</td>
                  <td><Badge map={PRIORITY_META} value={t.priority} /></td>
                  <td><Badge map={STATUS_META} value={t.status} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>{t.assigned_to}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{t.due_date || "—"}</td>
                  <td className="muted">{t.waiting_on || "—"}</td>
                  <td>{t.approval_status ? <Badge map={APPROVAL_META} value={t.approval_status} /> : <span className="muted">—</span>}</td>
                  <td><Badge map={HEALTH_META} value={t.health} /></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn sm ghost icon" title="التفاصيل" onClick={() => setViewing(t)}><Icon name="eye" size={16} /></button>
                      {!readOnly && <button className="btn sm ghost icon" title="تعديل" onClick={() => setEditing(t)}><Icon name="edit" size={16} /></button>}
                      {!readOnly && <button className="btn sm danger icon" title="حذف" disabled={busy} onClick={() => handleDelete(t)}><Icon name="trash" size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <TaskDetail
          task={viewing}
          onClose={() => setViewing(null)}
          onUpdate={async (id, patch) => { await tasksStore.update(id, patch); await reload(); }}
          onEdit={(t) => { setViewing(null); setEditing(t); }}
          onDelete={async (t) => { setViewing(null); await handleDelete(t); }}
        />
      )}
      {editing && (
        <Modal title={editing.id ? "تعديل المهمة" : "مهمة جديدة"} onClose={() => setEditing(null)}>
          <TaskForm initial={editing.id ? editing : null} onSave={handleSave} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
