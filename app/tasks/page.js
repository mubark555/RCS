"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksStore } from "@/lib/store";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import TaskForm from "@/components/TaskForm";
import {
  STATUS_META,
  PRIORITY_META,
  HEALTH_META,
  APPROVAL_META,
  STATUSES,
  PROJECTS,
} from "@/lib/constants";

export default function TasksPage() {
  const [tasks, setTasks] = useState(null);
  const [q, setQ] = useState("");
  const [fProject, setFProject] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [editing, setEditing] = useState(null); // task object or {} for new
  const [busy, setBusy] = useState(false);

  async function reload() {
    const data = await tasksStore.list();
    setTasks(data);
  }

  useEffect(() => {
    reload().catch(() => setTasks([]));
  }, []);

  const filtered = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (fProject && t.project !== fProject) return false;
      if (fStatus && t.status !== fStatus) return false;
      if (q) {
        const hay = `${t.task} ${t.activity} ${t.assigned_to} ${t.notes}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [tasks, q, fProject, fStatus]);

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
      <div className="section-title" style={{ marginTop: 10, justifyContent: "space-between" }}>
        <span>📋 إدارة المهام ({filtered.length})</span>
        <button className="btn primary" onClick={() => setEditing({})}>
          + مهمة جديدة
        </button>
      </div>

      <div className="toolbar">
        <input
          placeholder="🔍 بحث في المهام…"
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
        {(q || fProject || fStatus) && (
          <button className="btn sm ghost" onClick={() => { setQ(""); setFProject(""); setFStatus(""); }}>
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
                  <td className="task-cell">
                    {t.task}
                    {t.blocker && (
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                        ⚠ {t.blocker}
                      </div>
                    )}
                  </td>
                  <td>{t.project}</td>
                  <td className="muted">{t.activity}</td>
                  <td><Badge map={PRIORITY_META} value={t.priority} /></td>
                  <td><Badge map={STATUS_META} value={t.status} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>{t.assigned_to}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{t.due_date || "—"}</td>
                  <td className="muted">{t.waiting_on || "—"}</td>
                  <td>{t.approval_status ? <Badge map={APPROVAL_META} value={t.approval_status} /> : <span className="muted">—</span>}</td>
                  <td><Badge map={HEALTH_META} value={t.health} /></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn sm ghost" onClick={() => setEditing(t)}>✎</button>
                      <button className="btn sm danger" disabled={busy} onClick={() => handleDelete(t)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
