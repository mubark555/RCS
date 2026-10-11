"use client";

import { useMemo, useState } from "react";
import { rolesStore, unitsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Guard from "@/components/Guard";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import ChipMulti from "@/components/ChipMulti";
import { PERMISSION_GROUPS, PERMISSION_AR, DEFAULT_ROLES, PROJECT_ROLES, buildAccess, projectField } from "@/lib/permissions.mjs";
import { findUserByName } from "@/lib/workflow.mjs";

export default function AccessPage() {
  return <Guard perm="page.access"><Access /></Guard>;
}

function Access() {
  const [tab, setTab] = useState("review");
  return (
    <div>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={tab === "review" ? "on" : ""} onClick={() => setTab("review")}>مراجعة وصول المستخدمين</button>
        <button className={tab === "roles" ? "on" : ""} onClick={() => setTab("roles")}>الأدوار والصلاحيات</button>
        <button className={tab === "units" ? "on" : ""} onClick={() => setTab("units")}>الوحدات</button>
      </div>
      {tab === "review" && <AccessReview />}
      {tab === "roles" && <RolesMatrix />}
      {tab === "units" && <Units />}
    </div>
  );
}

// ---------------- مراجعة الوصول: ماذا يرى كل مستخدم + التعارضات ----------------
function AccessReview() {
  const { users, roles, projects, units } = useRole();
  const roleList = roles.length ? roles : DEFAULT_ROLES;
  const rows = useMemo(() => users.map((u) => ({ u, a: buildAccess(u, { roles: roleList, projects, units }) })), [users, roleList, projects, units]);

  const issues = useMemo(() => {
    const out = [];
    const keys = new Set(roleList.map((r) => r.key));
    for (const { u, a } of rows) {
      if (!keys.has(u.role)) out.push({ level: "high", text: `${u.name}: دوره «${u.role}» غير معرّف — لا يملك أي صلاحية.` });
      if (u.role !== "client" && !a.allProjects && a.visibleProjects.length === 0)
        out.push({ level: "mid", text: `${u.name}: غير مسند لأي مشروع أو وحدة — سيرى فقط المهام المسندة إليه مباشرة.` });
      if (u.role === "client" && a.visibleProjects && a.visibleProjects.length === 0)
        out.push({ level: "mid", text: `${u.name} (عميل): غير مربوط بأي مشروع.` });
      if (u.can_self_approve) out.push({ level: "mid", text: `${u.name}: يملك صلاحية اعتماد عمله بنفسه (استثناء).` });
      for (const [pname, pr] of Object.entries(a.projectRoles)) {
        if (u.role === "client" && pr !== "client") out.push({ level: "high", text: `${u.name} (عميل) مضاف كـ«${PROJECT_ROLES[pr].ar}» في ${pname}.` });
        if (u.role !== "client" && pr === "client") out.push({ level: "high", text: `${u.name} (موظف) مضاف كعميل في ${pname}.` });
      }
    }
    const admins = rows.filter(({ a }) => a.perms.has("roles.manage")).map(({ u }) => u.name);
    if (admins.length === 0) out.push({ level: "high", text: "لا يوجد أي مستخدم يملك إدارة الصلاحيات." });
    if (admins.length > 2) out.push({ level: "mid", text: `${admins.length} مستخدمين يملكون إدارة الصلاحيات (${admins.join("، ")}) — يُنصح بتقليلهم.` });
    for (const p of projects) {
      if (!projectField(p, "ops_managers").length && !projectField(p, "managers").length)
        out.push({ level: "mid", text: `المشروع ${p.name}: بلا مدير تشغيل أو مدير مشروع.` });
      for (const f of ["ops_managers", "managers", "members", "clients"]) {
        for (const n of projectField(p, f)) {
          if (n && !findUserByName(n, users)) out.push({ level: "mid", text: `المشروع ${p.name}: الاسم «${n}» في ${PROJECT_ROLES[Object.keys(PROJECT_ROLES).find((k) => PROJECT_ROLES[k].field === f)].ar} لا يطابق أي مستخدم.` });
        }
      }
    }
    for (const un of units) {
      if (!(un.managers || []).length) out.push({ level: "mid", text: `الوحدة ${un.name}: بلا مدير.` });
    }
    return out;
  }, [rows, roleList, projects, units, users]);

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>تعارضات ونقاط تحتاج قراراً <span className="hint">({issues.length})</span></div>
        {issues.length === 0 ? <div className="muted">لا توجد تعارضات.</div> : (
          <ul className="mlist" style={{ margin: 0 }}>
            {issues.map((x, i) => <li key={i} style={{ color: x.level === "high" ? "#dc2626" : "var(--text)" }}>{x.text}</li>)}
          </ul>
        )}
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="audit-table">
          <thead><tr><th>المستخدم</th><th>الدور</th><th>المشاريع المرئية</th><th>أدواره في المشاريع</th><th>الصفحات</th><th>صلاحيات حساسة</th></tr></thead>
          <tbody>
            {rows.map(({ u, a }) => (
              <tr key={u.id}>
                <td><b>{u.name}</b><div className="muted" style={{ fontSize: 11.5 }}>{u.title}</div></td>
                <td>{a.role?.name || <span style={{ color: "#dc2626" }}>{u.role} (غير معرّف)</span>}</td>
                <td>{a.allProjects ? <b>كل المشاريع</b> : a.visibleProjects.length ? a.visibleProjects.join("، ") : <span className="muted">لا شيء</span>}</td>
                <td>{Object.entries(a.projectRoles).map(([p, r]) => `${p}: ${PROJECT_ROLES[r].ar}`).join(" · ") || "—"}</td>
                <td style={{ fontSize: 12 }}>{[...a.perms].filter((p) => p.startsWith("page.")).map((p) => PERMISSION_AR[p]).join("، ") || "—"}</td>
                <td style={{ fontSize: 12 }}>{["users.manage", "roles.manage", "settings.manage", "task.final_approve", "scope.all_projects", "report.audit"].filter((p) => a.perms.has(p)).map((p) => PERMISSION_AR[p].split(" (")[0]).join("، ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- مصفوفة الأدوار والصلاحيات ----------------
function RolesMatrix() {
  const { roles, users, can, reloadAccess } = useRole();
  const editable = can("roles.manage");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const list = roles.length ? roles : DEFAULT_ROLES;

  async function toggle(role, perm) {
    if (!editable || !role.id) return;
    if (role.key === "manager" && ["roles.manage", "page.access"].includes(perm)) {
      return alert("لا يمكن سحب إدارة الصلاحيات من دور مدير النظام حتى لا يُقفل النظام.");
    }
    const has = (role.permissions || []).includes(perm);
    const permissions = has ? role.permissions.filter((p) => p !== perm) : [...(role.permissions || []), perm];
    setBusy(true);
    try {
      await rolesStore.update(role.id, { permissions });
      await reloadAccess();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(role) {
    const n = users.filter((u) => u.role === role.key).length;
    if (n) return alert(`لا يمكن حذف الدور: ${n} مستخدم مسند إليه.`);
    if (!confirm(`حذف الدور «${role.name}»؟`)) return;
    await rolesStore.remove(role.id);
    await reloadAccess();
  }

  return (
    <div>
      {!roles.length && <div className="card" style={{ marginBottom: 12, color: "#b45309" }}>جدول الأدوار غير موجود بعد — تُعرض الأدوار الافتراضية. شغّل ترحيل 002 لتفعيل التعديل.</div>}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <span className="muted" style={{ fontSize: 13 }}>الصلاحية العامة تسري داخل المشاريع المرئية للمستخدم فقط. مديرو التشغيل ومديرو المشاريع يحصلون تلقائياً على صلاحيات الإدارة داخل مشاريعهم.</span>
        {editable && roles.length > 0 && <button className="btn primary" style={{ marginInlineStart: "auto" }} onClick={() => setAdding(true)}>+ دور جديد</button>}
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="audit-table perm-matrix">
          <thead>
            <tr>
              <th>الصلاحية</th>
              {list.map((r) => (
                <th key={r.key} style={{ textAlign: "center" }}>
                  {r.name}
                  <div className="muted" style={{ fontSize: 11, fontWeight: 500 }}>{users.filter((u) => u.role === r.key).length} مستخدم</div>
                  {editable && r.id && !r.system && <button className="btn sm ghost icon" title="حذف الدور" onClick={() => remove(r)}><Icon name="trash" size={13} /></button>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => [
              <tr key={g.key} className="pm-group"><td colSpan={list.length + 1}>{g.ar}</td></tr>,
              ...g.items.map(([k, ar]) => (
                <tr key={k}>
                  <td>{ar}</td>
                  {list.map((r) => (
                    <td key={r.key} style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={(r.permissions || []).includes(k)} disabled={!editable || busy || !r.id}
                        onChange={() => toggle(r, k)} aria-label={`${r.name}: ${ar}`} />
                    </td>
                  ))}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      {adding && (
        <Modal title="دور جديد" onClose={() => setAdding(false)}>
          <NewRole roles={list} onDone={async () => { setAdding(false); await reloadAccess(); }} onCancel={() => setAdding(false)} />
        </Modal>
      )}
    </div>
  );
}

function NewRole({ roles, onDone, onCancel }) {
  const [f, setF] = useState({ name: "", key: "", description: "", copy: "member" });
  async function submit(e) {
    e.preventDefault();
    const key = (f.key || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!f.name.trim() || !key) return;
    if (roles.some((r) => r.key === key)) return alert("المعرّف مستخدم.");
    const base = roles.find((r) => r.key === f.copy);
    await rolesStore.create({ key, name: f.name.trim(), description: f.description, permissions: base?.permissions || [], system: false, order_index: roles.length });
    await onDone();
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>اسم الدور *</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <label className="field"><span>معرّف إنجليزي *</span><input dir="ltr" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder="finance_reviewer" required /></label>
        <label className="field full"><span>الوصف</span><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="field full"><span>انسخ الصلاحيات من</span>
          <select value={f.copy} onChange={(e) => setF({ ...f, copy: e.target.value })}>
            <option value="">— بلا صلاحيات —</option>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </label>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary">إنشاء</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

// ---------------- الوحدات ----------------
function Units() {
  const { units, users, projects, can, reloadAccess } = useRole();
  const editable = can("units.manage");
  const [editing, setEditing] = useState(null);
  const staff = users.filter((u) => u.role !== "client");

  async function del(u) {
    if (!confirm(`حذف الوحدة «${u.name}»؟ ستبقى مشاريعها بلا وحدة.`)) return;
    await unitsStore.remove(u.id);
    await reloadAccess();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <span className="muted" style={{ fontSize: 13 }}>مدير الوحدة يرى كل مشاريع وحدته ولا يطّلع على الوحدات الأخرى. اربط المشاريع بالوحدات من نموذج المشروع.</span>
        {editable && <button className="btn primary" style={{ marginInlineStart: "auto" }} onClick={() => setEditing({})}>+ وحدة جديدة</button>}
      </div>
      {units.length === 0 ? <div className="empty">لا توجد وحدات بعد.</div> : units.map((u) => (
        <div className="user-row" key={u.id}>
          <div className="ubody">
            <b>{u.name}</b>
            <small>
              المدير: {(u.managers || []).join("، ") || "—"} · المشاريع: {projects.filter((p) => p.unit_id === u.id).map((p) => p.name).join("، ") || "—"}
            </small>
          </div>
          {editable && (
            <div className="row-actions">
              <button className="btn sm ghost icon" onClick={() => setEditing(u)} title="تعديل"><Icon name="edit" size={15} /></button>
              <button className="btn sm danger icon" onClick={() => del(u)} title="حذف"><Icon name="trash" size={15} /></button>
            </div>
          )}
        </div>
      ))}
      {editing && (
        <Modal title={editing.id ? "تعديل وحدة" : "وحدة جديدة"} onClose={() => setEditing(null)}>
          <UnitForm initial={editing} staff={staff} onCancel={() => setEditing(null)} onSave={async (payload) => {
            if (editing.id) await unitsStore.update(editing.id, payload);
            else await unitsStore.create({ ...payload, order_index: units.length });
            setEditing(null);
            await reloadAccess();
          }} />
        </Modal>
      )}
    </div>
  );
}

function UnitForm({ initial, staff, onSave, onCancel }) {
  const [f, setF] = useState({ name: initial.name || "", description: initial.description || "", managers: initial.managers || [] });
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (f.name.trim()) await onSave({ ...f, name: f.name.trim() }); }}>
      <div className="form-grid">
        <label className="field full"><span>اسم الوحدة *</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <label className="field full"><span>الوصف</span><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>مدير/مديرو الوحدة</span>
          <ChipMulti options={staff} value={f.managers} onChange={(v) => setF({ ...f, managers: v })} empty="أضِف مستخدمين أولاً" />
        </div>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary">حفظ</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
