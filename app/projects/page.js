"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { projectsStore, tasksStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import ProjectDetail from "@/components/ProjectDetail";
import ChipMulti from "@/components/ChipMulti";
import Icon from "@/components/Icon";
import { projManagers, projClients, projMembers } from "@/lib/constants";

const COLORS = ["#e05a50", "#3f8e7f", "#2563eb", "#d97706", "#7c3aed", "#0d9488"];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function ProjectsPage() {
  const { canManage, scopeProjects, users, reloadProjects } = useRole();
  const [projects, setProjects] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [fMember, setFMember] = useState("");

  async function reload() {
    setProjects(await projectsStore.list());
    setTasks(await tasksStore.list());
    reloadProjects();
  }
  useEffect(() => {
    reload().catch(() => setProjects([]));
  }, []);

  const shown = useMemo(() => {
    if (!projects) return [];
    let list = scopeProjects ? projects.filter((p) => scopeProjects.includes(p.name)) : projects;
    if (fMember) {
      list = list.filter((p) =>
        projManagers(p).includes(fMember) || projMembers(p).includes(fMember) || projClients(p).includes(fMember)
      );
    }
    return list;
  }, [projects, scopeProjects, fMember]);

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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span className="pill" style={{ fontSize: 13, padding: "6px 12px" }}>{shown.length} مشروع</span>
        <select value={fMember} onChange={(e) => setFMember(e.target.value)} style={{ width: "auto", minWidth: 190 }} title="عرض مشاريع موظف معيّن">
          <option value="">فلترة حسب الموظف / العميل</option>
          {users.map((u) => (
            <option key={u.id} value={u.name}>{u.name} ({u.role === "client" ? "عميل" : u.role === "manager" ? "مدير" : "عضو"})</option>
          ))}
        </select>
        <div style={{ marginInlineStart: "auto" }} />
        {canManage && <button className="btn primary" onClick={() => setEditing({})}>+ مشروع جديد</button>}
      </div>

      <div className="proj-grid">
        {shown.map((p) => {
          const st = statOf(p.name);
          const managers = projManagers(p);
          const clients = projClients(p);
          const members = projMembers(p);
          return (
            <div className="proj-card" key={p.id}>
              <div className="pc-top">
                <span className="pc-badge" style={{ background: p.color || "#e05a50", padding: 0, overflow: "hidden" }}>
                  {p.logo ? <img src={p.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : p.name.slice(0, 1)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{p.name}</h3>
                  <div className="pc-sub">{p.status || "نشط"} · {st.total} مهمة</div>
                </div>
                <div className="row-actions">
                  <button className="btn sm ghost icon" title="عرض التفاصيل" onClick={() => setViewing(p)}><Icon name="eye" size={16} /></button>
                  {canManage && <button className="btn sm ghost icon" title="تعديل" onClick={() => setEditing(p)}><Icon name="edit" size={15} /></button>}
                  {canManage && <button className="btn sm danger icon" title="حذف" onClick={() => del(p)}><Icon name="trash" size={15} /></button>}
                </div>
              </div>
              {p.description && <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{p.description}</div>}
              <div className="progress"><span style={{ width: `${st.pct}%`, background: p.color || "#e05a50" }} /></div>
              <div className="pc-row"><span>الإنجاز</span><b>{st.done}/{st.total} · {st.pct}%</b></div>
              <div className="pc-row"><span>المدراء</span><b>{managers.join("، ") || "—"}</b></div>
              <div className="pc-row"><span>العملاء</span><b>{clients.join("، ") || "—"}</b></div>
              <div className="pc-row"><span>الموظفون</span><b>{members.length ? `${members.length} موظف` : "—"}</b></div>
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

function ProjectForm({ initial, users, onSave, onCancel }) {
  const [f, setF] = useState({
    name: "", description: "", logo: "", color: COLORS[0], status: "نشط",
    ...(initial || {}),
    managers: projManagers(initial || {}),
    clients: projClients(initial || {}),
    members: projMembers(initial || {}),
  });
  const [saving, setSaving] = useState(false);
  const logoRef = useRef(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setArr = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  async function onLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await fileToDataUrl(file);
    setF((s) => ({ ...s, logo: url }));
    if (logoRef.current) logoRef.current.value = "";
  }

  const managerOptions = users.filter((u) => u.role !== "client");
  const clientOptions = users.filter((u) => u.role === "client");
  const memberOptions = users.filter((u) => u.role === "member" || u.role === "manager");

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      // تنظيف الحقول المفردة القديمة
      const { manager, client, ...rest } = f;
      await onSave(rest);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full"><span>اسم المشروع *</span><input value={f.name} onChange={set("name")} required /></label>
        <label className="field full"><span>الوصف</span><textarea rows={2} value={f.description} onChange={set("description")} placeholder="نبذة عن المشروع…" /></label>

        <label className="field">
          <span>شعار المشروع (رفع صورة أو رابط)</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={onLogo} />
            <button type="button" className="btn" onClick={() => logoRef.current?.click()}><Icon name="upload" size={15} /> رفع</button>
            <input value={f.logo?.startsWith("data:") ? "" : (f.logo || "")} onChange={set("logo")} placeholder="أو رابط صورة…" />
          </div>
        </label>
        <div className="field">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>معاينة</span>
          <span className="pc-badge" style={{ background: f.color, width: 46, height: 46, borderRadius: 13, display: "inline-grid", placeItems: "center", color: "#fff", fontWeight: 800, overflow: "hidden" }}>
            {f.logo ? <img src={f.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (f.name.slice(0, 1) || "؟")}
          </span>
        </div>

        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>مدراء المشروع (يمكن اختيار أكثر من واحد)</span>
          <ChipMulti options={managerOptions} value={f.managers} onChange={setArr("managers")} empty="أضِف مستخدمين أولاً" />
        </div>
        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>حسابات العملاء (موظفو العميل — أكثر من حساب)</span>
          <ChipMulti options={clientOptions} value={f.clients} onChange={setArr("clients")} empty="أضِف حسابات عملاء من قسم الفريق" />
        </div>
        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>الموظفون المصرّح لهم برؤية هذا المشروع</span>
          <ChipMulti options={memberOptions} value={f.members} onChange={setArr("members")} empty="أضِف موظفين من قسم الفريق" />
        </div>

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
