"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { CHAIN_TYPE_META, CHAIN_ACTIONS } from "@/lib/constants";
import { saveProjectChain } from "@/lib/projectChain";

const AV_COLORS = ["#e05a50", "#3f8e7f", "#2563eb", "#7c3aed", "#d97706", "#0d9488", "#db2777"];
const colorFor = (name) => {
  const s = String(name || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % AV_COLORS.length;
  return AV_COLORS[h];
};

// مسار السلسلة (عرض فقط)
export function ChainPath({ steps, compact }) {
  if (!steps?.length) return null;
  return (
    <div className={`cp-nodes${compact ? " compact" : ""}`}>
      {steps.map((st, i) => {
        const tm = CHAIN_TYPE_META[st.type] || CHAIN_TYPE_META.work;
        return (
          <div className="cp-node-wrap" key={i}>
            {i > 0 && <span className="cp-arrow">←</span>}
            <div className="cp-node">
              <div className="cp-av" style={{ background: colorFor(st.person) }}>{(st.person || "؟").slice(0, 1)}</div>
              <div className="cp-name">{st.person || "—"}</div>
              <span className="cp-tag" style={{ background: tm.soft, color: tm.color }}>{st.action || tm.ar}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// محرّر سلسلة اعتماد المشروع — تُطبَّق إلزامياً على كل مهام المشروع
export default function ProjectChainEditor({ project, steps: initial, people, onSaved, onCancel }) {
  const names = people?.length ? people : ["سيم برايم"];
  const [steps, setSteps] = useState(() => (initial || []).map((s) => ({ ...s })));
  const [saving, setSaving] = useState(false);

  const add = (type) => setSteps((l) => [...l, { person: names[0], type, action: CHAIN_ACTIONS[type][0] }]);
  const upd = (i, patch) => setSteps((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const rm = (i) => setSteps((l) => l.filter((_, j) => j !== i));
  const move = (i, d) => setSteps((l) => {
    const j = i + d;
    if (j < 0 || j >= l.length) return l;
    const c = [...l];
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });

  async function save() {
    setSaving(true);
    try {
      await saveProjectChain(project.id, steps);
      onSaved?.();
    } finally { setSaving(false); }
  }

  return (
    <div className="pc-editor">
      <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
        حدّد مسار الاعتماد مرة واحدة لمشروع <b>{project.name}</b>، وكل مهمة في المشروع (الحالية والجديدة) تمرّ بنفس الخطوات بالترتيب.
        <b style={{ color: CHAIN_TYPE_META.work.color }}> عمل</b> = مشارك في التنفيذ ·
        <b style={{ color: CHAIN_TYPE_META.approve.color }}> اعتماد</b> = مراجعة/توقيع.
      </p>

      <div className="chain-steps">
        {steps.length === 0 && <div className="pc-empty"><Icon name="link" size={18} /> لا توجد خطوات — المهام في هذا المشروع بلا سلسلة اعتماد.</div>}
        {steps.map((st, i) => (
          <div className="chain-step" key={i}>
            <div className="cs-row">
              <span className="cs-order">{i + 1}</span>
              <select value={st.person} onChange={(e) => upd(i, { person: e.target.value })}>
                {!names.includes(st.person) && <option value={st.person}>{st.person}</option>}
                {names.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <button type="button" className="cs-mv" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="cs-mv" onClick={() => move(i, 1)} disabled={i === steps.length - 1}>↓</button>
              <button type="button" className="cs-rm" onClick={() => rm(i)}>×</button>
            </div>
            <div className="cs-row2">
              <div className="cs-toggle">
                <button type="button" className={st.type === "work" ? "on" : ""} onClick={() => upd(i, { type: "work", action: CHAIN_ACTIONS.work[0] })}>عمل</button>
                <button type="button" className={st.type === "approve" ? "on" : ""} onClick={() => upd(i, { type: "approve", action: CHAIN_ACTIONS.approve[0] })}>اعتماد</button>
              </div>
              <select value={st.action} onChange={(e) => upd(i, { action: e.target.value })}>
                {(CHAIN_ACTIONS[st.type] || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="chain-add" style={{ flex: 1 }} onClick={() => add("work")}>+ خطوة عمل</button>
          <button type="button" className="chain-add" style={{ flex: 1 }} onClick={() => add("approve")}>+ خطوة اعتماد</button>
        </div>
        {steps.length > 0 && (
          <div className="chain-path">
            <div className="cp-label">مسار كل مهمة في المشروع</div>
            <ChainPath steps={steps} />
          </div>
        )}
      </div>

      <div className="modal-actions">
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ السلسلة"}</button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>إلغاء</button>}
      </div>
    </div>
  );
}
