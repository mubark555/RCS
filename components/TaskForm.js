"use client";

import { useMemo, useState } from "react";
import { useRole } from "@/components/RoleProvider";
import {
  PRIORITIES,
  HEALTHS,
  WAITING_ON,
  PROJECTS,
  ACTIVITIES,
  PRIORITY_META,
  HEALTH_META,
  metaOf,
  projManagers,
} from "@/lib/constants";
import { WORKFLOWS, STEPS, STAGES, DEFAULT_WORKFLOW, workflowOf, stageOf, findUserByName, isAssignee } from "@/lib/workflow.mjs";

const EMPTY = {
  activity: "",
  project: PROJECTS[0],
  task: "",
  priority: "High",
  assigned_to: "",
  assignee_id: "",
  due_date: "",
  waiting_on: "",
  blocker: "",
  notes: "",
  health: "On Track",
  workflow: "",
  reviewer_id: "",
  approver_id: "",
  final_approver_id: "",
};

// الحالة لا تُعدَّل من هنا — تتغير فقط عبر إجراءات سير العمل في تفاصيل المهمة
export default function TaskForm({ initial, onSave, onCancel }) {
  const { users, projects, viewer, canManage } = useRole();
  const staff = useMemo(() => users.filter((u) => u.role !== "client"), [users]);
  const projectNames = projects.length ? projects.map((p) => p.name) : PROJECTS;

  const [f, setF] = useState(() => {
    const base = { ...EMPTY, ...(initial || {}), due_date: initial?.due_date || "" };
    if (initial) base.workflow = workflowOf(initial);
    else applyProjectDefaults(base, base.project);
    for (const k of ["assignee_id", "reviewer_id", "approver_id", "final_approver_id"]) base[k] = base[k] || "";
    return base;
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function applyProjectDefaults(s, projectName) {
    const p = projects.find((x) => x.name === projectName);
    s.workflow = p?.default_workflow && WORKFLOWS[p.default_workflow] ? p.default_workflow : DEFAULT_WORKFLOW;
    const mgr = findUserByName(projManagers(p)[0], users);
    s.reviewer_id = mgr && mgr.id !== s.assignee_id ? mgr.id : "";
    return s;
  }

  // المنفذ لا يغيّر مسار اعتماد مهمته أو مراجعها بعد إنشائها
  const lockRouting = Boolean(initial?.id) && !canManage && isAssignee(initial, viewer);
  const steps = WORKFLOWS[f.workflow]?.steps || [];
  const legacyAssignee = !f.assignee_id && f.assigned_to;
  const assigneeUser = staff.find((u) => u.id === f.assignee_id);
  const selfRouted = !assigneeUser?.can_self_approve && steps.some((st) => f[STEPS[st].field] && f[STEPS[st].field] === f.assignee_id);

  async function submit(e) {
    e.preventDefault();
    if (!f.task.trim()) return;
    setSaving(true);
    const payload = { ...f, due_date: f.due_date || null };
    // الخطوات غير المستخدمة في المسار لا تحتفظ بأشخاص
    for (const [k, st] of Object.entries(STEPS)) if (!steps.includes(k)) payload[st.field] = "";
    if (lockRouting) {
      for (const k of ["workflow", "reviewer_id", "approver_id", "final_approver_id", "assignee_id", "assigned_to"]) delete payload[k];
    }
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  const userSelect = (field, label, hint) => (
    <label className="field">
      <span>{label}</span>
      <select value={f[field]} onChange={set(field)} disabled={lockRouting}>
        <option value="">{hint}</option>
        {staff.map((u) => <option key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ""}</option>)}
      </select>
    </label>
  );

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full">
          <span>المهمة *</span>
          <textarea rows={2} value={f.task} onChange={set("task")} required />
        </label>

        <label className="field full">
          <span>الوصف / المخرجات المطلوبة</span>
          <textarea rows={2} value={f.notes} onChange={set("notes")} />
        </label>

        <label className="field">
          <span>المشروع</span>
          <select value={f.project} onChange={(e) => {
            const v = e.target.value;
            setF((s) => (initial ? { ...s, project: v } : applyProjectDefaults({ ...s, project: v }, v)));
          }}>
            {!projectNames.includes(f.project) && f.project && <option value={f.project}>{f.project}</option>}
            {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        <label className="field">
          <span>النشاط</span>
          <input list="activities" value={f.activity} onChange={set("activity")} />
          <datalist id="activities">
            {ACTIVITIES.map((a) => <option key={a} value={a} />)}
          </datalist>
        </label>

        <label className="field">
          <span>المسؤول عن التنفيذ</span>
          <select value={legacyAssignee ? "__legacy" : f.assignee_id} disabled={lockRouting} onChange={(e) => {
            const u = staff.find((x) => x.id === e.target.value);
            setF((s) => ({ ...s, assignee_id: u?.id || "", assigned_to: u?.name || "" }));
          }}>
            <option value="">— غير محدد —</option>
            {legacyAssignee && <option value="__legacy">{f.assigned_to} (اسم قديم غير مربوط)</option>}
            {staff.map((u) => <option key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ""}</option>)}
          </select>
        </label>

        <label className="field">
          <span>الموعد النهائي</span>
          <input type="date" value={f.due_date || ""} onChange={set("due_date")} />
        </label>

        <SelectField label="الأولوية" value={f.priority} onChange={set("priority")} options={PRIORITIES} meta={PRIORITY_META} />
        <SelectField label="الصحة" value={f.health} onChange={set("health")} options={HEALTHS} meta={HEALTH_META} />

        <div className="field full wf-box">
          <span>مسار الاعتماد</span>
          <select value={f.workflow} onChange={set("workflow")} disabled={lockRouting}>
            {Object.entries(WORKFLOWS).map(([k, w]) => <option key={k} value={k}>{w.ar}</option>)}
          </select>
          {steps.length > 0 && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              {steps.map((st) => (
                <div key={st}>{userSelect(STEPS[st].field, STEPS[st].who, "— الإدارة (أي مدير) —")}</div>
              ))}
            </div>
          )}
          {selfRouted && <div className="wf-err">المنفذ لا يستطيع مراجعة أو اعتماد عمله إلا بصلاحية صريحة — اختر شخصاً آخر.</div>}
          {lockRouting && <div className="muted" style={{ fontSize: 12 }}>مسار الاعتماد يحدده المدير أو منشئ المهمة.</div>}
        </div>

        {initial?.id && (
          <div className="field full muted" style={{ fontSize: 12.5 }}>
            الحالة الحالية: <b>{STAGES[stageOf(initial)].ar}</b> — تتغير من إجراءات سير العمل في تفاصيل المهمة.
          </div>
        )}

        <label className="field">
          <span>بانتظار (جهة خارجية)</span>
          <input list="waiting" value={f.waiting_on} onChange={set("waiting_on")} />
          <datalist id="waiting">
            {WAITING_ON.map((w) => <option key={w} value={w} />)}
          </datalist>
        </label>

        <label className="field">
          <span>العائق / الخطر</span>
          <input value={f.blocker} onChange={set("blocker")} />
        </label>
      </div>

      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving || selfRouted}>
          {saving ? "جاري الحفظ…" : "حفظ"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          إلغاء
        </button>
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
          <option key={o} value={o}>
            {meta ? metaOf(meta, o).ar : o || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}
