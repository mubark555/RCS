"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { ChainPath } from "@/components/ProjectChainEditor";
import { useProjectChains, templateFor } from "@/lib/projectChain";
import {
  PRIORITIES,
  HEALTHS,
  WAITING_ON,
  PROJECTS,
  ACTIVITIES,
  STATUS_META,
  PRIORITY_META,
  HEALTH_META,
  normalizeChain,
  metaOf,
  taskProgress,
} from "@/lib/constants";

// الحالات القابلة للاختيار يدوياً؛ الإرسال للمراجعة والاعتماد يتمّان عبر أزرار دورة العمل
const EDITABLE_STATUSES = ["Not Started", "In Progress"];

const EMPTY = {
  activity: "",
  project: "",
  deliverable: "",
  progress: 0,
  on_hold: false,
  resolve_date: "",
  task: "",
  priority: "High",
  status: "Not Started",
  assigned_to: "",
  due_date: "",
  waiting_on: "",
  blocker: "",
  notes: "",
  health: "On Track",
  chain: [],
};

export default function TaskForm({ initial, users = [], projects = [], defaultProject = "", onSave, onCancel }) {
  const projectNames = useMemo(() => {
    const names = projects.map((p) => p.name).filter(Boolean);
    return names.length ? names : PROJECTS;
  }, [projects]);
  const [f, setF] = useState(() => ({
    ...EMPTY,
    project: defaultProject || projectNames[0] || "",
    ...(initial || {}),
    due_date: initial?.due_date || "",
    resolve_date: initial?.resolve_date || "",
    progress: initial?.progress ?? 0,
    on_hold: !!initial?.on_hold,
    chain: normalizeChain(initial?.chain),
  }));
  const deliverables = useMemo(() => {
    const p = projects.find((x) => x.name === f.project);
    return Array.isArray(p?.deliverables) ? p.deliverables : [];
  }, [projects, f.project]);
  const statusOptions = EDITABLE_STATUSES.includes(f.status) ? EDITABLE_STATUSES : [...EDITABLE_STATUSES, f.status];
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const userNames = useMemo(() => {
    const names = users.map((u) => u.name).filter(Boolean);
    return names.length ? names : ["سيم برايم", "IT TEAM", "CONTENT"];
  }, [users]);

  // سلسلة الاعتماد تأتي من المشروع (إلزامية) — لا تُعدَّل من المهمة
  const { chains } = useProjectChains();
  const projectChain = templateFor(chains, projects, f.project);
  const projectId = projects.find((x) => x.name === f.project)?.id;

  async function submit(e) {
    e.preventDefault();
    if (!f.task.trim()) return;
    setSaving(true);
    // نحتفظ بحالة خطوات السلسلة كما هي (تُحدَّث من تفاصيل المهمة)
    const chain = normalizeChain(f.chain);
    const { _chainOn, ...rest } = f;
    const progress = Math.max(0, Math.min(100, Number(f.progress) || 0));
    const payload = { ...rest, due_date: f.due_date || null, resolve_date: f.resolve_date || null, progress, deliverable: (f.deliverable || "").trim(), chain };
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
            <span>المشروع *</span>
            <select value={f.project} onChange={set("project")} required>
              {!projectNames.includes(f.project) && <option value={f.project}>{f.project || "— اختر —"}</option>}
              {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="field">
            <span>المخرج / التسليم</span>
            <input list="deliverables" value={f.deliverable} onChange={set("deliverable")} placeholder="مثال: الهوية البصرية" />
            <datalist id="deliverables">{deliverables.map((d) => <option key={d} value={d} />)}</datalist>
          </label>
        </div>

        <div className="tf-grid2">
          <label className="field">
            <span>المسؤول</span>
            <input list="assignees" value={f.assigned_to} onChange={set("assigned_to")} placeholder="اختر من الفريق" />
            <datalist id="assignees">{userNames.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
          <label className="field">
            <span>تاريخ الاستحقاق</span>
            <input type="date" value={f.due_date || ""} onChange={set("due_date")} />
          </label>
        </div>

        <div className="tf-grid2">
          <SelectField label="الأولوية" value={f.priority} onChange={set("priority")} options={PRIORITIES} meta={PRIORITY_META} />
          <SelectField label="الحالة" value={f.status} onChange={set("status")} options={statusOptions} meta={STATUS_META} />
        </div>
        <p className="muted" style={{ fontSize: 11.5, margin: "-4px 0 10px" }}>
          الإرسال لمراجعة سيم والاعتماد وطلب التعديل تتم من أزرار «دورة العمل» داخل المهمة.
        </p>

        <div className="tf-grid2">
          <label className="field">
            <span>نسبة الإنجاز: <b>{Number(f.progress) > 0 ? `${Number(f.progress)}%` : `تلقائية حسب الحالة (${taskProgress({ ...f, progress: 0 })}%)`}</b></span>
            <input type="range" min="0" max="100" step="5" value={Number(f.progress) || 0} onChange={set("progress")} style={{ padding: 0 }} />
          </label>
          <label className="field">
            <span>النشاط</span>
            <input list="activities" value={f.activity} onChange={set("activity")} placeholder="مثال: التصميم" />
            <datalist id="activities">{ACTIVITIES.map((a) => <option key={a} value={a} />)}</datalist>
          </label>
        </div>

        {/* التعليق / التأخير */}
        <div className="hold-box">
          <label className="hold-check">
            <input type="checkbox" checked={!!f.on_hold} onChange={(e) => setF((s) => ({ ...s, on_hold: e.target.checked }))} />
            <span>المهمة معلّقة</span>
            <small className="muted">— أو متأخرة: وضّح السبب والجهة وموعد المعالجة</small>
          </label>
          <label className="field full">
            <span>سبب التعليق / التأخير</span>
            <input value={f.blocker} onChange={set("blocker")} placeholder="مثال: بانتظار تزويدنا بالمحتوى" />
          </label>
          <div className="tf-grid2">
            <label className="field">
              <span>الجهة المطلوب منها الإجراء</span>
              <input list="waiting" value={f.waiting_on} onChange={set("waiting_on")} placeholder="سيم برايم / ڤيوليت / …" />
              <datalist id="waiting">{WAITING_ON.map((w) => <option key={w} value={w} />)}</datalist>
            </label>
            <label className="field">
              <span>موعد المعالجة</span>
              <input type="date" value={f.resolve_date || ""} onChange={set("resolve_date")} />
            </label>
          </div>
          <SelectField label="الصحة" value={f.health} onChange={set("health")} options={HEALTHS} meta={HEALTH_META} />
        </div>

        <label className="field full">
          <span>ملاحظات</span>
          <textarea rows={2} value={f.notes} onChange={set("notes")} />
        </label>

        {/* ============ سلسلة الاعتماد (من المشروع) ============ */}
        <div className="chain-box">
          <div className="chain-top">
            <div>
              <div className="chain-title">
                <span className="ic"><Icon name="link" size={16} /></span>
                سلسلة الاعتماد — من إعدادات المشروع
              </div>
              <p>
                {projectChain.length
                  ? <>كل مهام <b>{f.project}</b> تمرّ بنفس المسار بالترتيب. لتعديله افتح صفحة المشروع ← «سلسلة الاعتمادات».</>
                  : <>لم تُحدَّد سلسلة اعتماد لمشروع <b>{f.project || "—"}</b> بعد. حدّدها من صفحة المشروع لتنطبق على كل مهامه.</>}
              </p>
            </div>
            {projectId && <a className="btn sm ghost" href={`/projects/${projectId}#chain`} target="_blank" rel="noreferrer">صفحة المشروع</a>}
          </div>
          {projectChain.length > 0 && <div className="chain-path" style={{ marginTop: 10 }}><ChainPath steps={projectChain} /></div>}
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
