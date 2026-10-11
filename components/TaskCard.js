"use client";

import Badge from "@/components/Badge";
import Icon from "@/components/Icon";
import WorkflowActions from "@/components/WorkflowActions";
import { useRole } from "@/components/RoleProvider";
import { PRIORITY_META } from "@/lib/constants";
import { STAGES, WORKFLOWS, stageOf, workflowOf, waitingOn, myAction } from "@/lib/workflow.mjs";

const fmt = (d) => {
  if (!d) return "—";
  const x = new Date(d);
  return isNaN(x) ? d : x.toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" });
};

export function isOverdue(t) {
  if (!t.due_date || stageOf(t) === "closed") return false;
  const d = new Date(t.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !isNaN(d) && d < today;
}

// بطاقة مهمة بكل ما يحتاجه المستخدم لاتخاذ الإجراء
export default function TaskCard({ task: t, onOpen, onChanged }) {
  const { users, viewer } = useRole();
  const stage = STAGES[stageOf(t)];
  const wait = waitingOn(t, users);
  const mine = myAction(t, viewer);
  const assignee = users.find((u) => u.id === t.assignee_id)?.name || t.assigned_to || "غير محدد";
  const overdue = isOverdue(t);

  return (
    <div className={`task-card ${overdue ? "overdue" : ""}`} onClick={() => onOpen && onOpen(t)}>
      <div className="tc-top">
        <span className="badge" style={{ background: `${stage.color}1f`, color: stage.color }}>{stage.ar}</span>
        <Badge map={PRIORITY_META} value={t.priority} />
        {overdue && <span className="badge" style={{ background: "#fdeceb", color: "#dc2626" }}>متأخرة</span>}
        <span className="tc-proj">{t.project || "بدون مشروع"}{t.activity ? ` · ${t.activity}` : ""}</span>
      </div>
      <div className="tc-title">{t.task}</div>
      {t.notes && <div className="tc-desc">{t.notes}</div>}
      {stageOf(t) === "changes_requested" && t.review_note && (
        <div className="tc-note"><Icon name="alert" size={14} /> ملاحظات المراجع: {t.review_note}</div>
      )}
      {stageOf(t) === "on_hold" && t.hold_reason && (
        <div className="tc-note"><Icon name="alert" size={14} /> سبب التوقف: {t.hold_reason}</div>
      )}
      <div className="tc-meta">
        <span><small>المنفذ</small>{assignee}</span>
        <span><small>أُنشئت</small>{fmt(t.created_at)}</span>
        <span className={overdue ? "red" : ""}><small>الموعد النهائي</small>{fmt(t.due_date)}</span>
        <span><small>المسار</small>{WORKFLOWS[workflowOf(t)].ar}</span>
        {wait && <span><small>بانتظار</small>{wait.who} — {wait.what}</span>}
      </div>
      {mine && (
        <div className="tc-foot">
          <span className="tc-need">المطلوب منك: <b>{mine.label}</b></span>
          <WorkflowActions task={t} compact onDone={onChanged} />
        </div>
      )}
    </div>
  );
}
