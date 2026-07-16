"use client";

import { useState } from "react";
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
};

export default function TaskForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ ...EMPTY, ...(initial || {}), due_date: initial?.due_date || "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.task.trim()) return;
    setSaving(true);
    const payload = { ...f, due_date: f.due_date || null };
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full">
          <span>المهمة *</span>
          <textarea rows={2} value={f.task} onChange={set("task")} required />
        </label>

        <label className="field">
          <span>المشروع</span>
          <input list="projects" value={f.project} onChange={set("project")} />
          <datalist id="projects">
            {PROJECTS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span>النشاط</span>
          <input list="activities" value={f.activity} onChange={set("activity")} />
          <datalist id="activities">
            {ACTIVITIES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>

        <SelectField label="الأولوية" value={f.priority} onChange={set("priority")} options={PRIORITIES} meta={PRIORITY_META} />
        <SelectField label="الحالة" value={f.status} onChange={set("status")} options={STATUSES} meta={STATUS_META} />

        <label className="field">
          <span>المسؤول</span>
          <input value={f.assigned_to} onChange={set("assigned_to")} placeholder="مثال: Ohood (IT)" />
        </label>

        <label className="field">
          <span>تاريخ الاستحقاق</span>
          <input type="date" value={f.due_date || ""} onChange={set("due_date")} />
        </label>

        <label className="field">
          <span>بانتظار</span>
          <input list="waiting" value={f.waiting_on} onChange={set("waiting_on")} />
          <datalist id="waiting">
            {WAITING_ON.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
        </label>

        <SelectField label="الصحة" value={f.health} onChange={set("health")} options={HEALTHS} meta={HEALTH_META} />
        <SelectField label="حالة الاعتماد" value={f.approval_status} onChange={set("approval_status")} options={APPROVALS} meta={APPROVAL_META} />

        <label className="field full">
          <span>العائق / الخطر</span>
          <input value={f.blocker} onChange={set("blocker")} />
        </label>

        <label className="field full">
          <span>ملاحظات</span>
          <textarea rows={2} value={f.notes} onChange={set("notes")} />
        </label>
      </div>

      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>
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
