"use client";

import { useEffect, useState } from "react";
import { usersStore, tasksStore } from "@/lib/store";
import { findUserByName, normName } from "@/lib/workflow.mjs";
import { useRole } from "@/components/RoleProvider";
import Guard from "@/components/Guard";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { PROJECTS } from "@/lib/constants";

import { DEFAULT_ROLES } from "@/lib/permissions.mjs";

const colorOf = (r) => (r === "manager" ? "#e05a50" : r === "client" ? "#3a56c5" : r === "member" ? "#3f8e7f" : "#7c3aed");

export default function TeamPage() {
  return <Guard perm={"page.team"}><Team /></Guard>;
}

function Team() {
  const { can, roles, reloadUsers, authRequired } = useRole();
  const canManage = can("users.manage");
  const ROLES = (roles.length ? roles : DEFAULT_ROLES).map((r) => ({ v: r.key, ar: r.name }));
  const roleAr = (r) => ROLES.find((x) => x.v === r)?.ar || r;
  const [users, setUsers] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [editing, setEditing] = useState(null);

  async function reload() {
    setUsers(await usersStore.list());
    reloadUsers();
  }
  useEffect(() => {
    reload().catch(() => setUsers([]));
    tasksStore.list().then(setTasks).catch(() => setTasks([]));
  }, []);

  async function del(u) {
    if (!confirm(`حذف المستخدم؟\n\n${u.name}`)) return;
    await usersStore.remove(u.id);
    await reload();
  }

  if (!users) return <div className="empty">جاري التحميل…</div>;

  const known = new Set(ROLES.map((r) => r.v));
  const grouped = [...ROLES, { v: "__other", ar: "بدور غير معرّف" }].map((r) => ({
    ...r, list: users.filter((u) => (r.v === "__other" ? !known.has(u.role) : u.role === r.v)),
  }));

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
              {g.ar}
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
                    {Array.isArray(u.aliases) && u.aliases.length ? ` · أسماء بديلة: ${u.aliases.join("، ")}` : ""}
                  </small>
                </div>
                {authRequired && <span className="pill" style={{ color: u.auth_id ? "#16a34a" : "#94a3b8" }}>{u.auth_id ? "حساب دخول مرتبط" : "بلا حساب دخول"}</span>}
                {u.can_self_approve && <span className="pill" style={{ color: "#d97706" }}>يعتمد عمله بنفسه</span>}
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

      {canManage && <NameMatcher users={users} tasks={tasks} onLinked={reload} />}

      {editing && (
        <Modal title={editing.id ? "تعديل مستخدم" : "مستخدم جديد"} onClose={() => setEditing(null)}>
          <UserForm
            roles={ROLES}
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

function UserForm({ initial, roles: ROLES, onSave, onCancel }) {
  const [f, setF] = useState({
    name: "", role: "member", title: "", project: "", email: "", can_self_approve: false, ...(initial || {}),
    aliasesText: Array.isArray(initial?.aliases) ? initial.aliases.join("، ") : "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      const { aliasesText, ...rest } = f;
      const aliases = aliasesText.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);
      await onSave({ ...rest, aliases, email: (f.email || "").trim(), project: f.role === "client" ? f.project : "" });
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
          <span>البريد الإلكتروني (يُستخدم لربط حساب الدخول)</span>
          <input type="email" dir="ltr" value={f.email} onChange={set("email")} placeholder="name@company.com" />
        </label>
        <label className="field full">
          <span>أسماء بديلة (كما تظهر في المهام القديمة، مفصولة بفاصلة)</span>
          <input value={f.aliasesText} onChange={set("aliasesText")} placeholder="مثال: Ohood، Ohood (IT)" />
        </label>
        <label className="field full" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={Boolean(f.can_self_approve)} onChange={(e) => setF((s) => ({ ...s, can_self_approve: e.target.checked }))} />
          <span style={{ margin: 0 }}>يسمح له بمراجعة/اعتماد المهام المسندة إليه (صلاحية استثنائية)</span>
        </label>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

// مطابقة أسماء المسؤولين النصية القديمة في المهام مع مستخدمي النظام (عبر الأسماء البديلة)
function NameMatcher({ users, tasks, onLinked }) {
  const [pick, setPick] = useState({});
  const [busy, setBusy] = useState(false);
  const staff = users.filter((u) => u.role !== "client");

  const unmatched = {};
  for (const t of tasks) {
    const n = (t.assigned_to || "").trim();
    if (!n || t.assignee_id || findUserByName(n, users)) continue;
    const k = normName(n) || n;
    (unmatched[k] = unmatched[k] || { label: n, count: 0 }).count++;
  }
  const rows = Object.values(unmatched).sort((a, b) => b.count - a.count);
  if (!rows.length) return null;

  async function link(label) {
    const u = staff.find((x) => x.id === pick[label]);
    if (!u) return;
    setBusy(true);
    try {
      const aliases = [...new Set([...(Array.isArray(u.aliases) ? u.aliases : []), label])];
      await usersStore.update(u.id, { aliases });
      await onLinked();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 22 }}>
      <div className="section-title" style={{ marginTop: 0 }}>مطابقة أسماء المهام القديمة <span className="hint">({rows.length})</span></div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        هذه أسماء مسؤولين مكتوبة نصاً في المهام ولا تطابق أي مستخدم، فلن تظهر مهامها في «مهامي» لأحد.
        اختر المستخدم المقابل لكل اسم ليُضاف كاسم بديل له.
      </p>
      {rows.map((r) => (
        <div className="user-row" key={r.label}>
          <div className="ubody"><b>{r.label}</b><small>{r.count} مهمة</small></div>
          <select value={pick[r.label] || ""} onChange={(e) => setPick((s) => ({ ...s, [r.label]: e.target.value }))}>
            <option value="">— اختر المستخدم —</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className="btn sm primary" disabled={busy || !pick[r.label]} onClick={() => link(r.label)}>ربط</button>
        </div>
      ))}
    </div>
  );
}
