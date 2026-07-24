"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import {
  PRIORITIES,
  STATUSES,
  HEALTHS,
  APPROVALS,
  WAITING_ON,
  PROJECTS,
  ACTIVITIES,
  STATUS_META,
  PRIORITY_META,
  HEALTH_META,
  APPROVAL_META,
  CHAIN_TYPE_META,
  CHAIN_ACTIONS,
  normalizeChain,
  metaOf,
} from "@/lib/constants";

const EMPTY = {
  activity: "",
  project: PROJECTS[0],
  task: "",
  priority: "High",
  status: "Not Started",
  assigned_to: "",
  due_date: "",
  waiting_on: "",
  blocker: "",
  approval_status: "",
  notes: "",
  health: "On Track",
  chain: [],
};

const AV_COLORS = ["#e05a50", "#3f8e7f", "#2563eb", "#7c3aed", "#d97706", "#0d9488", "#db2777"];
const colorFor = (name) => {
  const s = String(name || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % AV_COLORS.length;
  return AV_COLORS[h];
};

export default function TaskForm({ initial, users = [], onSave, onCancel }) {
  const [f, setF] = useState({
    ...EMPTY,
    ...(initial || {}),
    due_date: initial?.due_date || "",
    chain: normalizeChain(initial?.chain),
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const userNames = useMemo(() => {
    const names = users.map((u) => u.name).filter(Boolean);
    return names.length ? names : ["VULET", "SEEM", "IT TEAM", "CONTENT"];
  }, [users]);

  const chainOn = f.chain.length > 0 || f._chainOn;

  // ---- عمليات السلسلة ----
  function toggleChain() {
    setF((s) => {
      if (s.chain.length > 0 || s._chainOn) return { ...s, chain: [], _chainOn: false };
      const first = { person: userNames[0] || "", type: "work", action: CHAIN_ACTIONS.work[0], status: "pending" };
      return { ...s, _chainOn: true, chain: [first] };
    });
  }
  const addStep = () =>
    setF((s) => ({
      ...s,
      _chainOn: true,
      chain: [...s.chain, { person: userNames[0] || "", type: "approve", action: CHAIN_ACTIONS.approve[0], status: "pending" }],
    }));
  const updStep = (i, patch) => setF((s) => ({ ...s, chain: s.chain.map((st, j) => (j === i ? { ...st, ...patch } : st)) }));
  const setType = (i, type) => updStep(i, { type, action: CHAIN_ACTIONS[type][0] });
  const rmStep = (i) => setF((s) => ({ ...s, chain: s.chain.filter((_, j) => j !== i) }));
  const move = (i, dir) =>
    setF((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.chain.length) return s;
      const c = [...s.chain];
      [c[i], c[j]] = [c[j], c[i]];
      return { ...s, chain: c };
    });

  async function submit(e) {
    e.preventDefault();
    if (!f.task.trim()) return;
    setSaving(true);
    const chain = normalizeChain(f.chain).map((st) => ({
      person: st.person,
      type: st.type === "approve" ? "approve" : "work",
      action: st.action || "",
      status: st.status || "pending",
      at: st.at || null,
      note: st.note || "",
    }));
    const { _chainOn, ...rest } = f;
    const payload = { ...rest, due_date: f.due_date || null, chain };
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="tf">
      <div className="tf-body">
        <label className="field full">
          <span>المهمة *</span>
          <textarea rows={2} value={f.task} onChange={set("task")} placeholder="اكتب وصف المهمة…" required />
        </label>

        <div className="tf-grid2">
          <label className="field">
            <span>المشروع</span>
            <input list="projects" value={f.project} onChange={set("project")} />
            <datalist id="projects">{PROJECTS.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <label className="field">
            <span>النشاط</span>
            <input list="activities" value={f.activity} onChange={set("activity")} placeholder="مثال: التصميم" />
            <datalist id="activities">{ACTIVITIES.map((a) => <option key={a} value={a} />)}</datalist>
          </label>
        </div>

        <div className="tf-grid2">
          <SelectField label="الأولوية" value={f.priority} onChange={set("priority")} options={PRIORITIES} meta={PRIORITY_META} />
          <SelectField label="الحالة" value={f.status} onChange={set("status")} options={STATUSES} meta={STATUS_META} />
        </div>

        <div className="tf-grid2">
          <label className="field">
            <span>المسؤول</span>
            <input value={f.assigned_to} onChange={set("assigned_to")} placeholder="مثال: عهود (IT)" />
          </label>
          <label className="field">
            <span>تاريخ الاستحقاق</span>
            <input type="date" value={f.due_date || ""} onChange={set("due_date")} />
          </label>
        </div>

        <div className="tf-grid2">
          <label className="field">
            <span>بانتظار</span>
            <input list="waiting" value={f.waiting_on} onChange={set("waiting_on")} placeholder="على من تعتمد المهمة؟" />
            <datalist id="waiting">{WAITING_ON.map((w) => <option key={w} value={w} />)}</datalist>
          </label>
          <SelectField label="الصحة" value={f.health} onChange={set("health")} options={HEALTHS} meta={HEALTH_META} />
        </div>

        <div className="tf-grid2">
          <SelectField label="حالة الاعتماد" value={f.approval_status} onChange={set("approval_status")} options={APPROVALS} meta={APPROVAL_META} />
          <label className="field">
            <span>العائق / الخطر</span>
            <input value={f.blocker} onChange={set("blocker")} />
          </label>
        </div>

        <label className="field full">
          <span>ملاحظات</span>
          <textarea rows={2} value={f.notes} onChange={set("notes")} />
        </label>

        {/* ============ سلسلة تمرير المهمة (Workflow) ============ */}
        <div className="chain-box">
          <div className="chain-top">
            <div>
              <div className="chain-title">
                <span className="ic"><Icon name="link" size={16} /></span>
                سلسلة تمرير المهمة (Workflow)
              </div>
              <p>
                بعد إنجاز المسؤول، تنتقل المهمة حسب الدور:{" "}
                <b style={{ color: CHAIN_TYPE_META.work.color }}>عمل</b> (مشارك في التنفيذ) أو{" "}
                <b style={{ color: CHAIN_TYPE_META.approve.color }}>اعتماد</b> (مراجعة/توقيع)، بالترتيب بينهم.
              </p>
            </div>
            <button type="button" className={`chain-switch ${chainOn ? "on" : ""}`} onClick={toggleChain} aria-label="تفعيل السلسلة">
              <span className="knob" />
            </button>
          </div>

          {chainOn && (
            <div className="chain-steps">
              {f.chain.map((st, i) => {
                const tm = CHAIN_TYPE_META[st.type] || CHAIN_TYPE_META.work;
                return (
                  <div className="chain-step" key={i}>
                    <div className="cs-row">
                      <span className="cs-order">{i + 1}</span>
                      <select value={st.person} onChange={(e) => updStep(i, { person: e.target.value })}>
                        {userNames.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <button type="button" className="cs-mv" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                      <button type="button" className="cs-mv" onClick={() => move(i, 1)} disabled={i === f.chain.length - 1}>↓</button>
                      <button type="button" className="cs-rm" onClick={() => rmStep(i)}>×</button>
                    </div>
                    <div className="cs-row2">
                      <div className="cs-toggle">
                        <button type="button" className={st.type === "work" ? "on" : ""} onClick={() => setType(i, "work")}>عمل</button>
                        <button type="button" className={st.type === "approve" ? "on" : ""} onClick={() => setType(i, "approve")}>اعتماد</button>
                      </div>
                      <select value={st.action} onChange={(e) => updStep(i, { action: e.target.value })}>
                        {(CHAIN_ACTIONS[st.type] || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
              <button type="button" className="chain-add" onClick={addStep}>+ إضافة خطوة</button>

              {f.chain.length > 0 && (
                <div className="chain-path">
                  <div className="cp-label">مسار المهمة</div>
                  <div className="cp-nodes">
                    {f.chain.map((st, i) => {
                      const tm = CHAIN_TYPE_META[st.type] || CHAIN_TYPE_META.work;
                      return (
                        <div className="cp-node-wrap" key={i}>
                          {i > 0 && <span className="cp-arrow">←</span>}
                          <div className="cp-node">
                            <div className="cp-av" style={{ background: colorFor(st.person) }}>{(st.person || "؟").slice(0, 1)}</div>
                            <div className="cp-name">{st.person || "—"}</div>
                            <span className="cp-tag" style={{ background: tm.soft, color: tm.color }}>{tm.ar}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ المهمة"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function SelectField({ label, value, onChange, options, meta }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={onChange}>
        {options.map((o) => (
          <option key={o} value={o}>{meta ? metaOf(meta, o).ar : o || "—"}</option>
        ))}
      </select>
    </label>
  );
}
