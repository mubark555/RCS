"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Icon from "@/components/Icon";
import TaskDetail from "@/components/TaskDetail";
import ReviewDialog from "@/components/ReviewDialog";
import { REVIEW_META, isOverdue } from "@/lib/constants";
import { allReviews } from "@/lib/workflow";

const fmt = (iso, withTime) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("ar-SA", withTime ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "short", day: "numeric" });
};
const daysSince = (iso) => {
  if (!iso) return null;
  const n = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return isNaN(n) ? null : n;
};

export default function ApprovalsPage() {
  const { scopeProjects, projects, canApprove, canDeliver } = useRole();
  const [tasks, setTasks] = useState(null);
  const [tab, setTab] = useState("pending"); // pending | revision | log
  const [fProject, setFProject] = useState("");
  const [dialog, setDialog] = useState(null); // { task, mode }
  const [viewing, setViewing] = useState(null);

  async function reload() {
    setTasks(await tasksStore.list().catch(() => []));
  }
  useEffect(() => { reload(); }, []);

  const scoped = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => (!scopeProjects || scopeProjects.includes(t.project)) && (!fProject || t.project === fProject));
  }, [tasks, scopeProjects, fProject]);

  const pending = useMemo(() => scoped.filter((t) => t.status === "Pending Review")
    .sort((a, b) => String(a.ready_at || "").localeCompare(String(b.ready_at || ""))), [scoped]);
  const revision = useMemo(() => scoped.filter((t) => t.status === "Revision Needed"), [scoped]);
  const log = useMemo(() => allReviews(scoped).filter((r) => r.decision !== "submitted"), [scoped]);
  const approvedMonth = useMemo(() => {
    const now = new Date();
    return log.filter((r) => r.decision === "approved" && r.at && new Date(r.at).getMonth() === now.getMonth() && new Date(r.at).getFullYear() === now.getFullYear()).length;
  }, [log]);

  const projectNames = (scopeProjects || (projects || []).map((p) => p.name));
  const projectColor = Object.fromEntries((projects || []).map((p) => [p.name, p.color]));

  if (!tasks) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      {/* ملخّص */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => setTab("pending")}>
          <span className="kpi-ic" style={{ background: "#f1ebfd", color: "#7c3aed" }}><Icon name="clock" size={24} /></span>
          <div><div className="num">{pending.length}</div><div className="lbl">بانتظار مراجعة سيم</div></div>
        </div>
        <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => setTab("revision")}>
          <span className="kpi-ic" style={{ background: "#fbf0de", color: "#d97706" }}><Icon name="alert" size={24} /></span>
          <div><div className="num">{revision.length}</div><div className="lbl">مطلوب تعديل (عند ڤيوليت)</div></div>
        </div>
        <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => setTab("log")}>
          <span className="kpi-ic" style={{ background: "#eaf6ef", color: "#16a34a" }}><Icon name="check" size={24} /></span>
          <div><div className="num">{approvedMonth}</div><div className="lbl">اعتمادات هذا الشهر</div></div>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 18, gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg">
          <button className={tab === "pending" ? "on" : ""} onClick={() => setTab("pending")}>بانتظار المراجعة ({pending.length})</button>
          <button className={tab === "revision" ? "on" : ""} onClick={() => setTab("revision")}>مطلوب تعديل ({revision.length})</button>
          <button className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>سجل القرارات</button>
        </div>
        <select value={fProject} onChange={(e) => setFProject(e.target.value)} style={{ marginInlineStart: "auto" }}>
          <option value="">كل المشاريع</option>
          {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* ===== بانتظار المراجعة ===== */}
      {tab === "pending" && (
        pending.length === 0 ? <div className="empty">لا توجد أعمال بانتظار المراجعة ✓</div> : (
          <div className="rv-list">
            {pending.map((t) => {
              const wait = daysSince(t.ready_at);
              return (
                <div className="card rv-card" key={t.id}>
                  <span className="rv-bar" style={{ background: projectColor[t.project] || "var(--primary)" }} />
                  <div className="rv-main" onClick={() => setViewing(t)}>
                    <div className="rv-top">
                      <span className="pill">{t.project}</span>
                      {t.deliverable && <span className="pill" style={{ color: "#7c3aed" }}>{t.deliverable}</span>}
                      {wait != null && <span className={`rv-wait ${wait >= 3 ? "late" : ""}`}>بانتظار منذ {wait === 0 ? "اليوم" : `${wait} يوم`}</span>}
                    </div>
                    <b className="rv-title">{t.task}</b>
                    <small className="muted">
                      أرسلها {t.ready_by || t.assigned_to || "—"} · {fmt(t.ready_at, true)}
                      {t.due_date ? ` · الاستحقاق ${fmt(t.due_date)}` : ""}
                      {Array.isArray(t.links) && t.links.length ? ` · ${t.links.length} مرفق` : ""}
                    </small>
                    {lastNote(t, "submitted") && <div className="rv-note">«{lastNote(t, "submitted")}»</div>}
                  </div>
                  {canApprove ? (
                    <div className="rv-actions">
                      <button className="btn primary" onClick={() => setDialog({ task: t, mode: "approve" })}><Icon name="check" size={16} /> اعتماد</button>
                      <button className="btn" style={{ color: "#b45309" }} onClick={() => setDialog({ task: t, mode: "revision" })}>طلب تعديل</button>
                    </div>
                  ) : (
                    <div className="rv-actions"><span className="pill" style={{ color: "#7c3aed" }}>بانتظار قرار سيم</span></div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ===== مطلوب تعديل ===== */}
      {tab === "revision" && (
        revision.length === 0 ? <div className="empty">لا توجد طلبات تعديل مفتوحة.</div> : (
          <div className="rv-list">
            {revision.map((t) => (
              <div className="card rv-card" key={t.id}>
                <span className="rv-bar" style={{ background: "#d97706" }} />
                <div className="rv-main" onClick={() => setViewing(t)}>
                  <div className="rv-top">
                    <span className="pill">{t.project}</span>
                    {t.deliverable && <span className="pill" style={{ color: "#7c3aed" }}>{t.deliverable}</span>}
                    {isOverdue(t) && <span className="rv-wait late">متأخرة</span>}
                  </div>
                  <b className="rv-title">{t.task}</b>
                  <small className="muted">المسؤول: {t.assigned_to || "—"} · طلب التعديل: {t.reviewed_by || "—"} · {fmt(t.reviewed_at, true)}</small>
                  {t.review_note && <div className="rv-note warn">{t.review_note}</div>}
                </div>
                {canDeliver && (
                  <div className="rv-actions">
                    <button className="btn primary" onClick={() => setDialog({ task: t, mode: "submit" })}>تم التعديل — إعادة الإرسال</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* ===== سجل القرارات ===== */}
      {tab === "log" && (
        log.length === 0 ? <div className="empty">لا قرارات مسجّلة بعد.</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>التاريخ</th><th>العمل / التسليم</th><th>المشروع</th><th>القرار</th><th>المعتمِد</th><th>الملاحظات</th></tr>
              </thead>
              <tbody>
                {log.map((r) => {
                  const m = REVIEW_META[r.decision] || REVIEW_META.approved;
                  return (
                    <tr key={r.key} style={{ cursor: "pointer" }} onClick={() => setViewing(r.task)}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmt(r.at, true)}</td>
                      <td><b>{r.task.task}</b>{r.task.deliverable ? <div className="muted" style={{ fontSize: 12 }}>{r.task.deliverable}</div> : null}</td>
                      <td>{r.task.project}</td>
                      <td><span className="badge" style={{ background: m.bg, color: m.color }}><span className="dot" style={{ background: m.color }} />{m.ar}</span></td>
                      <td>{r.by || "—"}</td>
                      <td style={{ maxWidth: 320 }}>{r.note || <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {viewing && (
        <TaskDetail task={viewing} onClose={() => setViewing(null)}
          onUpdate={async (id, patch) => { await tasksStore.update(id, patch); await reload(); }}
          onChanged={reload}
          onEdit={() => setViewing(null)}
          onDelete={async (t) => { if (confirm(`حذف المهمة؟\n\n${t.task}`)) { await tasksStore.remove(t.id); setViewing(null); await reload(); } }} />
      )}
      {dialog && <ReviewDialog task={dialog.task} mode={dialog.mode} onClose={() => setDialog(null)} onDone={reload} />}
    </div>
  );
}

function lastNote(t, decision) {
  const r = (Array.isArray(t.reviews) ? t.reviews : []).filter((x) => x.decision === decision).pop();
  return r?.note || "";
}
