"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksStore } from "@/lib/store";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import TaskForm from "@/components/TaskForm";
import TaskDetail from "@/components/TaskDetail";
import Icon from "@/components/Icon";
import { useRole } from "@/components/RoleProvider";
import {
  STATUS_META,
  PRIORITY_META,
  HEALTH_META,
  APPROVAL_META,
  STATUSES,
  PROJECTS,
} from "@/lib/constants";

export default function TasksPage() {
  const { readOnly, scopeProjects } = useRole();
  const [tasks, setTasks] = useState(null);
  const [q, setQ] = useState("");
  const [fProject, setFProject] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [editing, setEditing] = useState(null); // task object or {} for new
  const [viewing, setViewing] = useState(null); // task being viewed in detail drawer
  const [busy, setBusy] = useState(false);

  async function reload() {
    const data = await tasksStore.list();
    setTasks(data);
  }

  useEffect(() => {
    reload().catch(() => setTasks([]));
    // تعبئة البحث من رابط الشريط العلوي (?q=...)
    try {
      const p = new URLSearchParams(window.location.search).get("q");
      if (p) setQ(p);
    } catch {}
  }, []);

  const assignees = useMemo(() => {
    if (!tasks) return [];
    return [...new Set(tasks.map((t) => (t.assigned_to || "").trim()).filter(Boolean))].sort();
  }, [tasks]);

  const filtered = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (scopeProjects && !scopeProjects.includes(t.project)) return false;
      if (fProject && t.project !== fProject) return false;
      if (fStatus && t.status !== fStatus) return false;
      if (fAssignee && (t.assigned_to || "").trim() !== fAssignee) return false;
      if (q) {
        const hay = `${t.task} ${t.activity} ${t.assigned_to} ${t.notes}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [tasks, q, fProject, fStatus, fAssignee, scopeProjects]);

  async function handleSave(payload) {
    if (editing && editing.id) {
      await tasksStore.update(editing.id, payload);
    } else {
      await tasksStore.create(payload);
    }
    setEditing(null);
    await reload();
  }

  async function handleDelete(t) {
    if (!confirm(`حذف المهمة؟\n\n${t.task}`)) return;
    setBusy(true);
    try {
      await tasksStore.remove(t.id);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (!tasks) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span className="pill" style={{ fontSize: 13, padding: "6px 12px" }}>
          {filtered.length} من {tasks.length} مهمة
        </span>
        <div style={{ marginInlineStart: "auto" }} />
        {!readOnly && (
          <button className="btn primary" onClick={() => setEditing({})}>
            + مهمة جديدة
          </button>
        )}
      </div>

      <div className="toolbar">
        <input
          placeholder="بحث في المهام…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select value={fProject} onChange={(e) => setFProject(e.target.value)}>
          <option value="">كل المشاريع</option>
          {PROJECTS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].ar}
            </option>
          ))}
        </select>
        <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} title="فلترة حسب الموظف المسؤول">
          <option value="">كل الموظفين</option>
          {assignees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {(q || fProject || fStatus || fAssignee) && (
          <button className="btn sm ghost" onClick={() => { setQ(""); setFProject(""); setFStatus(""); setFAssignee(""); }}>
            مسح الفلاتر
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">لا توجد مهام مطابقة.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>المهمة</th>
                <th>المشروع</th>
                <th>النشاط</th>
                <th>الأولوية</th>
                <th>الحالة</th>
                <th>المسؤول</th>
                <th>الاستحقاق</th>
                <th>بانتظار</th>
                <th>الاعتماد</th>
                <th>الصحة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td
                    className="task-cell"
                    style={{ cursor: "pointer" }}
                    onClick={() => setViewing(t)}
                    title="اضغط لفتح التفاصيل"
                  >
                    {t.task}
                    {t.blocker && (
                      <div className="cell-block">⚠ {t.blocker}</div>
                    )}
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
                      <button className="btn sm ghost icon" title="فتح التفاصيل" onClick={() => setViewing(t)}><Icon name="eye" size={16} /></button>
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
          onUpdate={async (id, patch) => {
            await tasksStore.update(id, patch);
            await reload();
          }}
          onEdit={(t) => {
            setViewing(null);
            setEditing(t);
          }}
          onDelete={async (t) => {
            setViewing(null);
            await handleDelete(t);
          }}
        />
      )}

      {editing && (
        <Modal
          title={editing.id ? "تعديل المهمة" : "مهمة جديدة"}
          onClose={() => setEditing(null)}
        >
          <TaskForm initial={editing.id ? editing : null} onSave={handleSave} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
