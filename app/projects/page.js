"use client";

import { useEffect, useMemo, useState } from "react";
import { projectsStore, tasksStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import ProjectDetail from "@/components/ProjectDetail";
import Icon from "@/components/Icon";

export default function ProjectsPage() {
  const { canManage, clientProject, users } = useRole();
  const [projects, setProjects] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);

  async function reload() {
    setProjects(await projectsStore.list());
    setTasks(await tasksStore.list());
  }
  useEffect(() => {
    reload().catch(() => setProjects([]));
  }, []);

  const shown = useMemo(() => {
    if (!projects) return [];
    return clientProject ? projects.filter((p) => p.name === clientProject) : projects;
  }, [projects, clientProject]);

  function statOf(name) {
    const items = tasks.filter((t) => t.project === name);
    const done = items.filter((t) => t.status === "Completed").length;
    return { total: items.length, done, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
  }

  async function del(p) {
    if (!confirm(`حذف المشروع؟\n\n${p.name}`)) return;
    await projectsStore.remove(p.id);
    await reload();
  }

  if (!projects) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span className="pill" style={{ fontSize: 13, padding: "6px 12px" }}>{shown.length} مشروع</span>
        <div style={{ marginInlineStart: "auto" }} />
        {canManage && <button className="btn primary" onClick={() => setEditing({})}>+ مشروع جديد</button>}
      </div>

      <div className="proj-grid">
        {shown.map((p) => {
          const st = statOf(p.name);
          return (
            <div className="proj-card" key={p.id} onClick={() => setViewing(p)}>
              <div className="pc-top">
                <span className="pc-badge" style={{ background: p.color || "#e05a50" }}>{p.name.slice(0, 1)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{p.name}</h3>
                  <div className="pc-sub">{p.status || "نشط"} · {st.total} مهمة</div>
                </div>
                {canManage && (
                  <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn sm ghost icon" onClick={() => setEditing(p)} title="تعديل"><Icon name="edit" size={15} /></button>
                    <button className="btn sm danger icon" onClick={() => del(p)} title="حذف"><Icon name="trash" size={15} /></button>
                  </div>
                )}
              </div>
              {p.description && <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{p.description}</div>}
              <div className="progress"><span style={{ width: `${st.pct}%`, background: p.color || "#e05a50" }} /></div>
              <div className="pc-row"><span>الإنجاز</span><b>{st.done}/{st.total} · {st.pct}%</b></div>
              <div className="pc-row"><span>مدير المشروع</span><b>{p.manager || "—"}</b></div>
              <div className="pc-row"><span>العميل</span><b>{p.client || "—"}</b></div>
            </div>
          );
        })}
      </div>

      {viewing && <ProjectDetail project={viewing} onClose={() => setViewing(null)} />}

      {editing && (
        <Modal title={editing.id ? "تعديل المشروع" : "مشروع جديد"} onClose={() => setEditing(null)}>
          <ProjectForm
            initial={editing.id ? editing : null}
            users={users}
            onCancel={() => setEditing(null)}
            onSave={async (payload) => {
              if (editing.id) await projectsStore.update(editing.id, payload);
              else await projectsStore.create(payload);
              setEditing(null);
              await reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

const COLORS = ["#e05a50", "#3f8e7f", "#2563eb", "#d97706", "#7c3aed", "#0d9488"];

function ProjectForm({ initial, users, onSave, onCancel }) {
  const [f, setF] = useState({ name: "", description: "", manager: "", client: "", color: COLORS[0], status: "نشط", ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const managers = users.filter((u) => u.role !== "client");
  const clients = users.filter((u) => u.role === "client");

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      await onSave(f);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full"><span>اسم المشروع *</span><input value={f.name} onChange={set("name")} required /></label>
        <label className="field full"><span>الوصف</span><textarea rows={2} value={f.description} onChange={set("description")} /></label>
        <label className="field">
          <span>مدير المشروع</span>
          <select value={f.manager} onChange={set("manager")}>
            <option value="">— اختر —</option>
            {managers.map((u) => <option key={u.id} value={u.name}>{u.name} ({u.title})</option>)}
          </select>
        </label>
        <label className="field">
          <span>العميل</span>
          <select value={f.client} onChange={set("client")}>
            <option value="">— اختر —</option>
            {clients.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </label>
        <label className="field"><span>الحالة</span>
          <select value={f.status} onChange={set("status")}>
            <option value="نشط">نشط</option>
            <option value="مكتمل">مكتمل</option>
            <option value="معلّق">معلّق</option>
          </select>
        </label>
        <label className="field">
          <span>اللون</span>
          <div style={{ display: "flex", gap: 7, paddingTop: 6 }}>
            {COLORS.map((c) => (
              <span key={c} onClick={() => setF((s) => ({ ...s, color: c }))}
                style={{ width: 26, height: 26, borderRadius: 8, background: c, cursor: "pointer", border: f.color === c ? "3px solid #2c2b34" : "2px solid #fff", boxShadow: "0 0 0 1px #e0d8ca" }} />
            ))}
          </div>
        </label>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
