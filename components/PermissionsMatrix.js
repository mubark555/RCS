"use client";

import { useMemo, useState } from "react";
import { useRole } from "@/components/RoleProvider";
import Icon from "@/components/Icon";
import { SECTIONS, ABILITIES, LEVELS, ROLE_DEFAULTS, resolvePerms } from "@/lib/permissions";

const ROLE_AR = { manager: "مدير", member: "عضو", client: "عميل" };
const LVL_STYLE = {
  none: { bg: "#f3efe7", color: "#9a917f" },
  view: { bg: "#eaf1fd", color: "#2563eb" },
  edit: { bg: "#eaf6ef", color: "#16a34a" },
};

// يبني التخصيص (الفرق فقط عن افتراضي الدور) — حتى يبقى تغيير الدور مؤثراً على ما لم يُخصَّص
function diffFromRole(role, perms) {
  const base = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.member;
  const sections = {};
  const abilities = {};
  Object.entries(perms.sections).forEach(([k, v]) => { if (base.sections[k] !== v) sections[k] = v; });
  Object.entries(perms.abilities).forEach(([k, v]) => { if (!!base.abilities[k] !== !!v) abilities[k] = v; });
  if (!Object.keys(sections).length && !Object.keys(abilities).length) return null;
  return { sections, abilities };
}

// محرّر صلاحيات شخص واحد (كل الأقسام + الصلاحيات الخاصة)
export function PermissionsEditor({ user, onDone }) {
  const { users, permsOf, savePermissions, canManagePerms } = useRole();
  const [p, setP] = useState(() => permsOf(user));
  const [saving, setSaving] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const isManager = user.role === "manager";

  const setSec = (k, v) => setP((s) => ({ ...s, sections: { ...s.sections, [k]: v } }));
  const setAb = (k, v) => setP((s) => ({ ...s, abilities: { ...s.abilities, [k]: v } }));

  function applyCopy(id) {
    setCopyFrom(id);
    const src = users.find((u) => u.id === id);
    if (src) setP(permsOf(src));
  }
  function resetRole() {
    setP(resolvePerms({ role: user.role }, null, null));
  }
  async function save() {
    setSaving(true);
    try {
      await savePermissions(user.id, diffFromRole(user.role, p));
      onDone?.();
    } finally { setSaving(false); }
  }

  return (
    <div className="pm-editor">
      <div className="pm-who">
        <span className="pm-av">{user.name.slice(0, 1)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{user.name}</b>
          <small>{user.title || "—"} · الدور: {ROLE_AR[user.role] || user.role}</small>
        </div>
        {canManagePerms && (
          <div className="pm-tools">
            <select value={copyFrom} onChange={(e) => applyCopy(e.target.value)}>
              <option value="">نسخ صلاحيات من…</option>
              {users.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button type="button" className="btn sm ghost" onClick={resetRole}>افتراضي الدور</button>
          </div>
        )}
      </div>

      <div className="pm-h">صلاحيات الأقسام</div>
      <div className="pm-secs">
        {SECTIONS.map((s) => {
          const lvl = p.sections[s.key] || "none";
          return (
            <div className="pm-sec" key={s.key}>
              <span className="pm-sec-n"><Icon name={s.ico} size={16} /> {s.ar}</span>
              <div className="seg sm">
                {LEVELS.filter((l) => !(s.viewOnly && l.key === "edit")).map((l) => (
                  <button key={l.key} type="button" disabled={!canManagePerms} className={lvl === l.key ? "on" : ""}
                    style={lvl === l.key ? { background: LVL_STYLE[l.key].bg, color: LVL_STYLE[l.key].color } : undefined}
                    onClick={() => setSec(s.key, l.key)}>{l.ar}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pm-h">صلاحيات خاصة</div>
      <div className="pm-abs">
        {ABILITIES.map((a) => (
          <label className="pm-ab" key={a.key}>
            <span>
              <b>{a.ar}</b>
              <small>{a.desc}</small>
            </span>
            <span className={`switch ${p.abilities[a.key] ? "on" : ""}`}>
              <input type="checkbox" disabled={!canManagePerms} checked={!!p.abilities[a.key]} onChange={(e) => setAb(a.key, e.target.checked)} />
              <i />
            </span>
          </label>
        ))}
      </div>

      {isManager && (
        <div className="pm-note"><Icon name="info" size={15} /> تخفيض صلاحيات المدير ممكن، لكن احرص أن يبقى شخص واحد على الأقل يملك «إدارة الصلاحيات».</div>
      )}

      {canManagePerms && (
        <div className="modal-actions">
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ الصلاحيات"}</button>
          <button className="btn ghost" onClick={onDone}>إلغاء</button>
        </div>
      )}
    </div>
  );
}

// مصفوفة كل الأشخاص × الأقسام (للاطلاع السريع والتعديل المباشر)
// sections: لتقييد الأعمدة (مثلاً ["finance"] داخل قسم المالية)
export default function PermissionsMatrix({ sections: only, onEditUser }) {
  const { users, permsOf, savePermissions, canManagePerms } = useRole();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const cols = useMemo(() => SECTIONS.filter((s) => !only || only.includes(s.key)), [only]);
  const list = users.filter((u) => !q.trim() || `${u.name} ${u.title || ""}`.includes(q.trim()));

  async function setCell(u, key, lvl) {
    if (!canManagePerms) return;
    setBusy(`${u.id}:${key}`);
    try {
      const cur = permsOf(u);
      const next = { ...cur, sections: { ...cur.sections, [key]: lvl } };
      await savePermissions(u.id, diffFromRole(u.role, next));
    } finally { setBusy(null); }
  }

  const single = cols.length === 1;

  return (
    <div className="pm-wrap">
      <div className="pm-bar">
        <div className="mtg-search" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <span style={{ color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={17} /></span>
          <input placeholder="ابحث عن شخص…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="pm-legend">
          {LEVELS.map((l) => <span key={l.key} style={{ background: LVL_STYLE[l.key].bg, color: LVL_STYLE[l.key].color }}>{l.ar}: {l.desc}</span>)}
        </div>
      </div>

      {single ? (
        <div className="fa-list">
          {list.map((u) => {
            const lvl = permsOf(u).sections[cols[0].key] || "none";
            return (
              <div className="fa-row" key={u.id}>
                <div>
                  <b>{u.name}</b> <span className="muted" style={{ fontSize: 12 }}>· {ROLE_AR[u.role]}{u.title ? ` · ${u.title}` : ""}</span>
                </div>
                <div className="seg sm">
                  {LEVELS.map((l) => (
                    <button key={l.key} type="button" disabled={!canManagePerms || busy === `${u.id}:${cols[0].key}`} className={lvl === l.key ? "on" : ""}
                      style={lvl === l.key ? { background: LVL_STYLE[l.key].bg, color: LVL_STYLE[l.key].color } : undefined}
                      onClick={() => setCell(u, cols[0].key, l.key)}>{l.ar}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pm-scroll">
          <table className="pm-table">
            <thead>
              <tr>
                <th className="pm-sticky">الشخص</th>
                {cols.map((c) => <th key={c.key}><span className="pm-colh"><Icon name={c.ico} size={14} />{c.ar}</span></th>)}
                <th>خاص</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const pr = permsOf(u);
                return (
                  <tr key={u.id}>
                    <td className="pm-sticky">
                      <button type="button" className="pm-person" onClick={() => onEditUser?.(u)}>
                        <span className="pm-av sm">{u.name.slice(0, 1)}</span>
                        <span><b>{u.name}</b><small>{ROLE_AR[u.role]}</small></span>
                      </button>
                    </td>
                    {cols.map((c) => {
                      const lvl = pr.sections[c.key] || "none";
                      const order = c.viewOnly ? ["none", "view"] : ["none", "view", "edit"];
                      const nextLvl = order[(order.indexOf(lvl) + 1) % order.length];
                      return (
                        <td key={c.key}>
                          <button type="button" className="pm-cell" disabled={!canManagePerms || busy === `${u.id}:${c.key}`}
                            title={canManagePerms ? "اضغط للتبديل" : ""}
                            style={{ background: LVL_STYLE[lvl].bg, color: LVL_STYLE[lvl].color }}
                            onClick={() => setCell(u, c.key, nextLvl)}>
                            {LEVELS.find((l) => l.key === lvl)?.ar}
                          </button>
                        </td>
                      );
                    })}
                    <td>
                      <span className="pm-abcount" title={ABILITIES.filter((a) => pr.abilities[a.key]).map((a) => a.ar).join("\n")}>
                        {ABILITIES.filter((a) => pr.abilities[a.key]).length}/{ABILITIES.length}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!canManagePerms && <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>للاطلاع فقط — تعديل الصلاحيات لمن يملك صلاحية «إدارة الصلاحيات».</div>}
    </div>
  );
}
