"use client";

import { useEffect, useMemo, useState } from "react";
import { usersStore, tasksStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { PROJECTS, projManagers, projClients, projMembers } from "@/lib/constants";

const ROLES = [
  { v: "manager", ar: "مدير" },
  { v: "member", ar: "عضو" },
  { v: "client", ar: "عميل" },
];
const roleAr = (r) => ROLES.find((x) => x.v === r)?.ar || r;
const ROLE_PLURAL = { manager: "المدراء", member: "الأعضاء", client: "العملاء" };
const ROLE_STYLE = {
  manager: { bg: "#fdeceb", color: "#e05a50" },
  member: { bg: "#eaf6ef", color: "#3f9d6d" },
  client: { bg: "#eaf1fd", color: "#2e77e5" },
};
const colorOf = (r) => (r === "manager" ? "#e05a50" : r === "client" ? "#2e77e5" : "#3f9d6d");
const PROJ_COLORS = ["#e05a50", "#3f8e7f", "#2563eb", "#7c3aed", "#d97706", "#0d9488", "#db2777"];
const projColor = (n) => {
  const s = String(n || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % PROJ_COLORS.length;
  return PROJ_COLORS[h];
};

// وصف عبء العمل حسب عدد المهام المفتوحة
function loadInfo(open) {
  if (open >= 6) return { ar: "مرتفع", color: "#dc2626", bg: "#fdecec" };
  if (open >= 3) return { ar: "متوسط", color: "#d97706", bg: "#fbf0de" };
  return { ar: "خفيف", color: "#16a34a", bg: "#e6f5ec" };
}
const pct = (open) => Math.max(6, Math.min(100, Math.round((open / 8) * 100)));

// صلاحيات كل دور (للعرض في بطاقة العضو)
function permsFor(role) {
  const m = role === "manager";
  const isMember = role === "member";
  return [
    { label: "عرض جميع المشاريع", ok: m },
    { label: "إدارة المهام", ok: m || isMember },
    { label: "إدارة الفريق", ok: m },
    { label: "الاعتماد والتوقيع", ok: m },
  ];
}

// جسر أسماء: المهام المستوردة تستخدم أسماء لاتينية بينما المستخدمون بالعربية
const NAME_ALIASES = {
  "عهود": ["ohood"],
  "لجين": ["lujain"],
  "وجد": ["wajd"],
  "أمل": ["amal"],
  "مبارك": ["mubarak", "mubrak"],
  "رائد": ["raed"],
  "أحمد": ["ahmad"],
  "عاصم": ["asem"],
  "سامي الشبيلي": ["sami"],
  "فاطمة": ["fatimah"],
};

// هل هذه المهمة مسندة لهذا المستخدم؟
function taskFor(t, name) {
  const a = (t.assigned_to || "").trim().toLowerCase();
  const n = (name || "").trim().toLowerCase();
  if (!a || !n) return false;
  if (a === n || a.includes(n) || n.includes(a)) return true;
  const aliases = NAME_ALIASES[name] || [];
  return aliases.some((tok) => a.includes(tok));
}

export default function TeamPage() {
  const { canManage, reloadUsers, projects } = useRole();
  const [users, setUsers] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  async function reload() {
    setUsers(await usersStore.list());
    reloadUsers();
  }
  useEffect(() => {
    reload().catch(() => setUsers([]));
    tasksStore.list().then(setTasks).catch(() => {});
  }, []);

  // إحصاءات لكل مستخدم
  const stat = useMemo(() => {
    const map = {};
    (users || []).forEach((u) => {
      const mine = tasks.filter((t) => taskFor(t, u.name));
      const open = mine.filter((t) => t.status !== "Completed").length;
      const done = mine.filter((t) => t.status === "Completed").length;
      const projs = (projects || [])
        .filter((p) => projManagers(p).includes(u.name) || projMembers(p).includes(u.name) || projClients(p).includes(u.name))
        .map((p) => p.name);
      map[u.id] = { open, done, projs, total: mine.length };
    });
    return map;
  }, [users, tasks, projects]);

  const totals = useMemo(() => {
    const list = users || [];
    const active = list.filter((u) => (stat[u.id]?.open || 0) > 0).length;
    const openTasks = tasks.filter((t) => t.status !== "Completed").length;
    const overloaded = list.filter((u) => (stat[u.id]?.open || 0) >= 6).length;
    return { total: list.length, active, openTasks, overloaded };
  }, [users, tasks, stat]);

  async function del(u) {
    if (!confirm(`حذف المستخدم؟\n\n${u.name}`)) return;
    await usersStore.remove(u.id);
    await reload();
  }

  if (!users) return <div className="empty">جاري التحميل…</div>;

  const s = q.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (filter !== "all" && u.role !== filter) return false;
    if (s && !`${u.name} ${u.title || ""}`.toLowerCase().includes(s)) return false;
    return true;
  });
  const grouped = ROLES.map((r) => ({ ...r, list: filtered.filter((u) => u.role === r.v) })).filter((g) => g.list.length);

  const STAT_CARDS = [
    { n: totals.total, l: "إجمالي الأعضاء", ic: "users", color: "#e05a50", bg: "#fdeceb" },
    { n: totals.active, l: "نشط الآن", ic: "check", color: "#3f9d6d", bg: "#eaf6ef" },
    { n: totals.openTasks, l: "مهام مفتوحة", ic: "tasks", color: "#2e77e5", bg: "#eaf1fd" },
    { n: totals.overloaded, l: "أعباء مرتفعة", ic: "alert", color: "#c88a2e", bg: "#fbf0de" },
  ];

  return (
    <div>
      <div className="mtg-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", margin: 0 }}>الفريق</h1>
            <span className="cnt-pill">{users.length} مستخدم</span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14.5, marginTop: 4 }}>المستخدمون وأدوارهم وصلاحياتهم وأعباء عملهم</p>
        </div>
        {canManage && (
          <button className="btn primary" onClick={() => setEditing({})} style={{ padding: "13px 22px", fontSize: 15, borderRadius: 14 }}>+ إضافة مستخدم</button>
        )}
      </div>

      <div className="tm-stats">
        {STAT_CARDS.map((c) => (
          <div className="tm-stat" key={c.l}>
            <div className="ic" style={{ background: c.bg, color: c.color }}><Icon name={c.ic} size={23} /></div>
            <div>
              <div className="num">{c.n}</div>
              <div className="lbl">{c.l}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="tm-toolbar">
        <div className="mtg-search" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
          <span style={{ color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={18} /></span>
          <input placeholder="ابحث بالاسم أو المسمّى…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tm-filters">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>الكل</button>
          {ROLES.map((r) => (
            <button key={r.v} className={filter === r.v ? "on" : ""} onClick={() => setFilter(r.v)}>{ROLE_PLURAL[r.v]}</button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="mtg-empty">لا يوجد أعضاء مطابقون.</div>
      ) : (
        <div className="tm-groups">
          {grouped.map((g) => (
            <div key={g.v}>
              <div className="mtg-sec"><span className="bar" /><h2>{ROLE_PLURAL[g.v]}</h2><span style={{ color: "var(--muted)", fontSize: 13 }}>({g.list.length})</span></div>
              <div className="tm-grid">
                {g.list.map((u) => {
                  const st = stat[u.id] || { open: 0, projs: [] };
                  const li = loadInfo(st.open);
                  const rs = ROLE_STYLE[u.role] || ROLE_STYLE.member;
                  return (
                    <div className="tm-card" key={u.id} onClick={() => setDetail(u)}>
                      <div className="top">
                        <div className="tm-av-wrap">
                          <div className="tm-av" style={{ background: colorOf(u.role) }}>{u.name.slice(0, 1)}</div>
                          <span className="tm-dot" style={{ background: st.open > 0 ? "#3f9d6d" : "#c9bfad" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="nm">{u.name}</div>
                          <div className="ti">{u.title || "—"}</div>
                        </div>
                        <span className="tm-role" style={{ background: rs.bg, color: rs.color }}>{roleAr(u.role)}</span>
                      </div>
                      {st.projs.length > 0 && (
                        <div className="tm-tags">
                          {st.projs.slice(0, 3).map((p) => (
                            <span className="tm-tag" key={p} style={{ background: `${projColor(p)}18`, color: projColor(p) }}>{p}</span>
                          ))}
                          {st.projs.length > 3 && <span className="tm-tag">+{st.projs.length - 3}</span>}
                        </div>
                      )}
                      <div className="tm-load">
                        <div className="tm-load-h">
                          <span className="k">عبء العمل · {st.open} مهام</span>
                          <span className="tm-load-lbl" style={{ background: li.bg, color: li.color }}>{li.ar}</span>
                        </div>
                        <div className="tm-bar"><span style={{ width: `${pct(st.open)}%`, background: li.color }} /></div>
                      </div>
                      <div className="tm-foot">
                        <span className="em">{u.email || "—"}</span>
                        {canManage && (
                          <div className="acts">
                            <button className="tm-ib" onClick={(e) => { e.stopPropagation(); setEditing(u); }} title="تعديل"><Icon name="edit" size={15} /></button>
                            <button className="tm-ib del" onClick={(e) => { e.stopPropagation(); del(u); }} title="حذف"><Icon name="trash" size={15} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <MemberDrawer
          u={detail}
          stat={stat[detail.id] || { open: 0, done: 0, projs: [] }}
          canManage={canManage}
          onClose={() => setDetail(null)}
          onEdit={() => { setDetail(null); setEditing(detail); }}
        />
      )}

      {editing && (
        <Modal title={editing.id ? "تعديل مستخدم" : "إضافة مستخدم"} onClose={() => setEditing(null)}>
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

function MemberDrawer({ u, stat, canManage, onClose, onEdit }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const li = loadInfo(stat.open);
  const perms = permsFor(u.role);
  const joined = u.created_at ? new Date(u.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "long" }) : "—";

  return (
    <div className="tm-drawer-wrap" onMouseDown={onClose}>
      <div className="tm-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tm-dhead">
          <button className="x" onClick={onClose}><Icon name="close" size={16} /></button>
          <div className="row">
            <div className="av">{u.name.slice(0, 1)}</div>
            <div>
              <div className="nm">{u.name}</div>
              <div className="ti">{u.title || "—"}</div>
              <span className="rl">{roleAr(u.role)}</span>
            </div>
          </div>
        </div>
        <div className="tm-dbody">
          <div className="tm-box">
            <div className="h">معلومات التواصل</div>
            <div className="tm-contact">
              <div className="li"><span className="ico"><Icon name="mail" size={17} /></span>{u.email || "—"}</div>
              {u.phone && <div className="li"><span className="ico"><Icon name="phone" size={17} /></span>{u.phone}</div>}
              <div className="li"><span className="ico"><Icon name="clock" size={17} /></span>انضم في {joined}</div>
            </div>
          </div>

          <div className="tm-mini">
            <div className="cell"><div className="n">{stat.open}</div><div className="l">مهام مفتوحة</div></div>
            <div className="cell"><div className="n" style={{ color: "#3f9d6d" }}>{stat.done}</div><div className="l">منجزة</div></div>
            <div className="cell"><div className="n">{stat.projs.length}</div><div className="l">مشاريع</div></div>
          </div>

          <div className="tm-box">
            <div className="tm-load-h" style={{ marginBottom: 10 }}>
              <span className="k" style={{ color: "var(--muted)", fontSize: 12.5, fontWeight: 700 }}>عبء العمل الحالي</span>
              <span className="tm-load-lbl" style={{ background: li.bg, color: li.color }}>{li.ar}</span>
            </div>
            <div className="tm-bar" style={{ height: 9 }}><span style={{ width: `${pct(stat.open)}%`, background: li.color }} /></div>
          </div>

          {stat.projs.length > 0 && (
            <div className="tm-box">
              <div className="h">المشاريع المسندة</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {stat.projs.map((p) => (
                  <span className="tm-tag" key={p} style={{ background: `${projColor(p)}18`, color: projColor(p) }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          <div className="tm-box">
            <div className="h">الصلاحيات</div>
            <div className="tm-perm">
              {perms.map((p) => (
                <div className="li" key={p.label}>
                  <span>{p.label}</span>
                  <span className={p.ok ? "yes" : "no"}>{p.ok ? "✓" : "—"}</span>
                </div>
              ))}
            </div>
          </div>

          {canManage && (
            <div className="tm-dactions">
              <button className="btn primary" style={{ flex: 1, justifyContent: "center", padding: 13, borderRadius: 13 }} onClick={onEdit}>تعديل البيانات</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ name: "", role: "member", title: "", project: "", email: "", phone: "", ...(initial || {}) });
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
          <input value={f.name} onChange={set("name")} placeholder="الاسم الكامل" required />
        </label>
        <label className="field">
          <span>المسمّى الوظيفي</span>
          <input value={f.title} onChange={set("title")} placeholder="مثال: مصمم جرافيك" />
        </label>
        <label className="field">
          <span>الدور</span>
          <select value={f.role} onChange={set("role")}>
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.ar}</option>)}
          </select>
        </label>
        <label className="field">
          <span>البريد الإلكتروني</span>
          <input value={f.email} onChange={set("email")} placeholder="name@violet.sa" />
        </label>
        <label className="field">
          <span>الجوال</span>
          <input value={f.phone} onChange={set("phone")} placeholder="05xxxxxxxx" />
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
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
