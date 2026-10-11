"use client";

import { useMemo, useState } from "react";
import { useRole } from "@/components/RoleProvider";
import { managementReport, toCSV } from "@/lib/reports.mjs";
import { buildAccess } from "@/lib/permissions.mjs";
import { ATTENDANCE_TYPES } from "@/lib/attendance.mjs";
import { STAGES, stageOf } from "@/lib/workflow.mjs";
import TaskDetail from "@/components/TaskDetail";
import { tasksStore } from "@/lib/store";

const PROJECT_STATUS = {
  late: { ar: "متأخر", color: "#dc2626", icon: "!" },
  blocked: { ar: "يواجه عوائق", color: "#b45309", icon: "‖" },
  ok: { ar: "على المسار", color: "#16a34a", icon: "✓" },
};
const pctText = (v) => (v === null || v === undefined ? "—" : `${v}%`);

// أسماء ملفات لاتينية: بعض المتصفحات تُسقط الأسماء العربية؛ المحتوى نفسه عربي
const today = () => new Date().toISOString().slice(0, 10);
function download(name, csv) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  document.body.appendChild(a); // بعض المتصفحات تتجاهل اسم الملف لرابط غير مُلحق بالصفحة
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// لوحة الإدارة: تُحسب من نطاق المستخدم فقط (المهام والاجتماعات المرئية له)
export default function ManagementPanel({ tasks, meetings, onChanged }) {
  const { users, roles, projects, units, can } = useRole();
  const [viewing, setViewing] = useState(null);
  const r = useMemo(() => managementReport({
    tasks, meetings, users,
    withAccess: (u) => ({ ...u, access: buildAccess(u, { roles, projects, units }) }),
  }), [tasks, meetings, users, roles, projects, units]);
  // الموظفون: من لديه مهام في النطاق أو ينتظره قرار — لا يُعرض من لا علاقة له بالنطاق
  const employees = r.employees.filter((e) => e.open || e.awaiting || e.closed30 || e.measured);
  const maxOpen = Math.max(1, ...employees.map((e) => e.open));
  const canExport = can("report.export");

  const T = r.totals;
  const tiles = [
    { label: "مهام مفتوحة", value: T.open, c: "var(--ink)" },
    { label: "متأخرة عن موعدها", value: T.overdue, c: "#dc2626" },
    { label: "بانتظار المراجعة", value: T.inReview, c: STAGES.in_review.color },
    { label: "بانتظار الموافقة / الاعتماد", value: T.pendingApproval, c: STAGES.pending_approval.color },
    { label: "متوقفة", value: T.onHold, c: STAGES.on_hold.color },
    { label: `الالتزام بالمواعيد (${T.measured} مهمة مقيسة)`, value: pctText(T.rate), c: "#0d9488" },
  ];

  return (
    <div className="mgmt">
      <div className="section-title" style={{ marginTop: 26 }}>متابعة الإدارة <span className="hint">(ضمن نطاق صلاحياتك)</span></div>
      <div className="mw-stats">
        {tiles.map((t) => (
          <div key={t.label} className="mw-stat" style={{ "--c": t.c }}><b>{t.value}</b><span>{t.label}</span></div>
        ))}
      </div>

      <div className="mgmt-grid">
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>المهام المتوقفة وأسباب توقفها <span className="hint">({r.stopped.length})</span></div>
          {r.stopped.length === 0 ? <div className="muted">لا مهام متوقفة أو معرقلة.</div> : r.stopped.slice(0, 12).map(({ task: t, reason, hold }) => (
            <button type="button" className="mgmt-row" key={t.id} onClick={() => setViewing(t)}>
              <span className="badge" style={{ background: hold ? "#fdf0dd" : "#fdeceb", color: hold ? "#b45309" : "#dc2626" }}>{hold ? "متوقفة" : "عائق"}</span>
              <span className="mgmt-main"><b>{t.task}</b><small>{t.project} · {t.assigned_to || "—"}</small></span>
              <span className="mgmt-reason">{reason}</span>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>الاجتماعات القادمة وتصنيف الحضور</div>
          {r.upcoming.length === 0 ? <div className="muted">لا اجتماعات قادمة.</div> : r.upcoming.map(({ meeting: m, byType }) => (
            <div className="mgmt-meet" key={m.id}>
              <b>{m.title}</b>
              <small>{new Date(m.start_at).toLocaleString("ar-SA-u-ca-gregory", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{m.project ? ` · ${m.project}` : ""}</small>
              <div className="mgmt-att">
                {Object.entries(ATTENDANCE_TYPES).map(([k, at]) => byType[k].length ? (
                  <span key={k} className="pill" title={byType[k].join("، ")} style={{ color: at.color, borderColor: `${at.color}55` }}>{at.ar}: {byType[k].length}</span>
                ) : null)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0, overflowX: "auto" }}>
        <div className="mgmt-head">
          <b>توزيع المهام على الموظفين</b>
          {canExport && <button className="btn sm" onClick={() => download(`violet-employees-${today()}.csv`, toCSV(employees, [
            { label: "الموظف", get: (e) => e.name }, { label: "مفتوحة", get: (e) => e.open }, { label: "متأخرة", get: (e) => e.overdue },
            { label: "سلّمها وتنتظر غيره", get: (e) => e.waitingOthers }, { label: "تنتظر قراره", get: (e) => e.awaiting },
            { label: "أنجزها آخر 30 يوماً", get: (e) => e.closed30 }, { label: "الالتزام بالمواعيد %", get: (e) => e.rate ?? "" },
          ]))}>تصدير CSV</button>}
        </div>
        <table className="audit-table">
          <thead><tr><th>الموظف</th><th>المهام المفتوحة</th><th>متأخرة</th><th>سلّمها وتنتظر غيره</th><th>تنتظر قراره</th><th>أنجزها (30 يوماً)</th><th>الالتزام بالمواعيد</th></tr></thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.key}>
                <td><b>{e.name}</b></td>
                <td>
                  <div className="load" title={`${e.open} مهمة مفتوحة`}>
                    <span className="load-track"><span className="load-bar" style={{ width: `${(e.open / maxOpen) * 100}%` }} /></span>
                    <span className="load-num">{e.open}</span>
                  </div>
                </td>
                <td style={{ color: e.overdue ? "#dc2626" : undefined, fontWeight: e.overdue ? 800 : 400 }}>{e.overdue || "—"}</td>
                <td>{e.waitingOthers || "—"}</td>
                <td>{e.awaiting || "—"}</td>
                <td>{e.closed30 || "—"}</td>
                <td title={e.measured ? `${e.onTime} من ${e.measured}` : "لا مهام مقيسة"}>{pctText(e.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0, overflowX: "auto" }}>
        <div className="mgmt-head">
          <b>المشاريع: الإنجاز والعوائق</b>
          {canExport && <button className="btn sm" onClick={() => download(`violet-projects-${today()}.csv`, toCSV(r.projects, [
            { label: "المشروع", get: (p) => p.name }, { label: "الحالة", get: (p) => PROJECT_STATUS[p.status].ar },
            { label: "إجمالي المهام", get: (p) => p.total }, { label: "مفتوحة", get: (p) => p.open }, { label: "متأخرة", get: (p) => p.overdue },
            { label: "متوقفة", get: (p) => p.onHold }, { label: "نسبة الإنجاز %", get: (p) => p.pct }, { label: "الالتزام بالمواعيد %", get: (p) => p.rate ?? "" },
          ]))}>تصدير CSV</button>}
        </div>
        <table className="audit-table">
          <thead><tr><th>المشروع</th><th>الحالة</th><th>الإنجاز</th><th>مفتوحة</th><th>متأخرة</th><th>متوقفة / عوائق</th><th>الالتزام بالمواعيد</th></tr></thead>
          <tbody>
            {r.projects.map((p) => {
              const st = PROJECT_STATUS[p.status];
              return (
                <tr key={p.name}>
                  <td><b>{p.name}</b></td>
                  <td><span className="badge" style={{ background: `${st.color}1a`, color: st.color }}>{st.icon} {st.ar}</span></td>
                  <td>
                    <div className="load" title={`${p.closed} من ${p.total} مكتملة`}>
                      <span className="load-track"><span className="load-bar done" style={{ width: `${p.pct}%` }} /></span>
                      <span className="load-num">{p.pct}%</span>
                    </div>
                  </td>
                  <td>{p.open}</td>
                  <td style={{ color: p.overdue ? "#dc2626" : undefined, fontWeight: p.overdue ? 800 : 400 }}>{p.overdue || "—"}</td>
                  <td>{p.onHold || p.blocked ? `${p.onHold} / ${p.blocked}` : "—"}</td>
                  <td>{pctText(p.rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewing && (
        <TaskDetail task={viewing} onClose={() => setViewing(null)} onChanged={onChanged}
          onUpdate={async (id, patch, prev) => { await tasksStore.update(id, patch, prev); onChanged && (await onChanged()); }}
          onEdit={() => setViewing(null)}
          onDelete={async (t) => { if (!confirm(`حذف المهمة؟\n\n${t.task}`)) return; setViewing(null); await tasksStore.remove(t.id, t); onChanged && (await onChanged()); }} />
      )}
    </div>
  );
}
