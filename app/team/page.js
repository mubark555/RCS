"use client";

import { useEffect, useState } from "react";
import { usersStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { PROJECTS } from "@/lib/constants";

const ROLES = [
  { v: "manager", ar: "مدير" },
  { v: "member", ar: "عضو" },
  { v: "client", ar: "عميل" },
];
const roleAr = (r) => ROLES.find((x) => x.v === r)?.ar || r;
const ROLE_PLURAL = { manager: "المدراء", member: "الأعضاء", client: "العملاء" };
const colorOf = (r) => (r === "manager" ? "#e05a50" : r === "client" ? "#3a56c5" : "#3f8e7f");

export default function TeamPage() {
  const { canManage, reloadUsers } = useRole();
  const [users, setUsers] = useState(null);
  const [editing, setEditing] = useState(null);

  async function reload() {
    setUsers(await usersStore.list());
    reloadUsers();
  }
  useEffect(() => {
    reload().catch(() => setUsers([]));
  }, []);

  async function del(u) {
    if (!confirm(`حذف المستخدم؟\n\n${u.name}`)) return;
    await usersStore.remove(u.id);
    await reload();
  }

  if (!users) return <div className="empty">جاري التحميل…</div>;

  const grouped = ROLES.map((r) => ({ ...r, list: users.filter((u) => u.role === r.v) }));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span className="pill" style={{ fontSize: 13, padding: "6px 12px" }}>{users.length} مستخدم</span>
        <div style={{ marginInlineStart: "auto" }} />
        {canManage && (
          <button className="btn primary" onClick={() => setEditing({})}>+ إضافة مستخدم</button>
        )}
      </div>

      {grouped.map((g) =>
        g.list.length === 0 ? null : (
          <div key={g.v}>
            <div className="section-title">
              {ROLE_PLURAL[g.v] || roleAr(g.v)}
              <span className="hint">({g.list.length})</span>
            </div>
            {g.list.map((u) => (
              <div className="user-row" key={u.id}>
                <span className="uav" style={{ background: colorOf(u.role) }}>{u.name.slice(0, 1)}</span>
                <div className="ubody">
                  <b>{u.name}</b>
                  <small>
                    {u.title || "—"}
                    {u.project ? ` · ${u.project}` : ""}
                    {u.email ? ` · ${u.email}` : ""}
                  </small>
                </div>
                <span className={`role-tag role-${u.role}`}>{roleAr(u.role)}</span>
                {canManage && (
                  <div className="row-actions">
                    <button className="btn sm ghost icon" onClick={() => setEditing(u)} title="تعديل"><Icon name="edit" size={15} /></button>
                    <button className="btn sm danger icon" onClick={() => del(u)} title="حذف"><Icon name="trash" size={15} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {editing && (
        <Modal title={editing.id ? "تعديل مستخدم" : "مستخدم جديد"} onClose={() => setEditing(null)}>
          <UserForm
            initial={editing.id ? editing : null}
            onCancel={() => setEditing(null)}
            onSave={async (payload) => {
              if (editing.id) await usersStore.update(editing.id, payload);
              else await usersStore.create(payload);
              setEditing(null);
              await reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function UserForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ name: "", role: "member", title: "", project: "", email: "", ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...f, project: f.role === "client" ? f.project : "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full">
          <span>الاسم *</span>
          <input value={f.name} onChange={set("name")} required />
        </label>
        <label className="field">
          <span>الدور</span>
          <select value={f.role} onChange={set("role")}>
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.ar}</option>)}
          </select>
        </label>
        <label className="field">
          <span>المسمى الوظيفي</span>
          <input value={f.title} onChange={set("title")} placeholder="مثال: مدير مشروع" />
        </label>
        {f.role === "client" && (
          <label className="field full">
            <span>المشروع المرتبط (يرى العميل هذا المشروع فقط)</span>
            <select value={f.project} onChange={set("project")}>
              <option value="">— اختر مشروعاً —</option>
              {PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        <label className="field full">
          <span>البريد / وسيلة التواصل</span>
          <input value={f.email} onChange={set("email")} placeholder="اختياري" />
        </label>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
