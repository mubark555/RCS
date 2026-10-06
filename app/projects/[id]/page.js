"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { projectsStore, tasksStore, meetingsStore, filesStore, usersStore, kpisStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";
import TaskDetail from "@/components/TaskDetail";
import MinutesModal, { exportMinutes } from "@/components/MinutesModal";
import { STATUS_META, HEALTH_META, PRIORITY_META, VISIBILITY_META, projManagers, projClients, projMembers, kpiAssignees, isPublicKpi, isDone, isFinanceFile, isOverdue, taskProgress } from "@/lib/constants";
import { taskStats, projectHealth, kpiAchievement, kpiPct } from "@/lib/metrics";

export default function ProjectPage() {
  const { id } = useParams();
  const { role, can } = useRole();
  const canManage = can("projects", "edit");
  const readOnly = !canManage;
  const [newDeliv, setNewDeliv] = useState("");
  const [scopeEdit, setScopeEdit] = useState(null); // نص نطاق العمل أثناء التحرير
  const [uploading, setUploading] = useState(false);
  const [project, setProject] = useState(undefined);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [files, setFiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [viewingTask, setViewingTask] = useState(null);
  const [minutesOf, setMinutesOf] = useState(null);
  const [lnk, setLnk] = useState({ label: "", url: "" });
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const projs = await projectsStore.list().catch(() => []);
    const p = projs.find((x) => x.id === id) || null;
    setProject(p);
    if (!p) return;
    const [ts, ms, fs, us, ks] = await Promise.all([
      tasksStore.list().catch(() => []),
      meetingsStore.list().catch(() => []),
      filesStore.list().catch(() => []),
      usersStore.list().catch(() => []),
      kpisStore.list().catch(() => []),
    ]);
    setTasks(ts.filter((t) => t.project === p.name));
    setMeetings(ms.filter((m) => m.project === p.name));
    setFiles(fs.filter((f) => f.project === p.name && !isFinanceFile(f)));
    setUsers(us);
    // مستهدفات هذا المشروع — العميل يرى العامة فقط، الفريق يرى الكل
    const mine = ks.filter((k) => k.project === p.name);
    setKpis(role === "client" ? mine.filter(isPublicKpi) : mine);
  }
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);

  const stats = useMemo(() => {
    const st = taskStats(tasks);
    return { ...st, pct: st.progress, delayed: st.overdue.length };
  }, [tasks]);
  const kpiPctAll = useMemo(() => kpiAchievement(kpis), [kpis]);

  async function addLink() {
    if (!lnk.url.trim()) return;
    setBusy(true);
    try {
      await filesStore.addLink({ name: lnk.label || lnk.url, url: lnk.url, project: project.name, category: "Google Drive" });
      setLnk({ label: "", url: "" });
      await loadAll();
    } finally { setBusy(false); }
  }
  const deliverables = Array.isArray(project?.deliverables) ? project.deliverables : [];
  async function saveDeliverables(list) {
    await projectsStore.update(project.id, { deliverables: list });
    await loadAll();
  }
  async function addDeliverable() {
    const d = newDeliv.trim();
    if (!d || deliverables.includes(d)) return;
    setNewDeliv("");
    await saveDeliverables([...deliverables, d]);
  }
  async function removeDeliverable(d) {
    if (!confirm(`إزالة المخرج «${d}» من القائمة؟\n(لن تُحذف المهام المرتبطة به)`)) return;
    await saveDeliverables(deliverables.filter((x) => x !== d));
  }

  async function saveScope() {
    await projectsStore.update(project.id, { scope: scopeEdit || "" });
    setScopeEdit(null);
    await loadAll();
  }
  async function uploadFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await filesStore.upload(file, { project: project.name, category: "ملف مشروع", note: "" });
      await loadAll();
    } catch (err) {
      alert(`تعذّر رفع الملف: ${err?.message || ""}`);
    } finally { setUploading(false); }
  }

  async function openLink(f) { window.open(await filesStore.getUrl(f), "_blank"); }
  async function delLink(f) { if (confirm(`حذف الرابط؟\n${f.name}`)) { await filesStore.remove(f); await loadAll(); } }

  if (project === undefined) return <div className="empty">جاري التحميل…</div>;
  if (project === null) return (
    <div className="empty"><div style={{ marginBottom: 12 }}>المشروع غير موجود.</div><Link href="/projects" className="btn">→ العودة للمشاريع</Link></div>
  );

  const managers = projManagers(project);
  const clients = projClients(project);
  const members = projMembers(project);
  const findU = (n) => users.find((u) => u.name === n);

  return (
    <div className="pd">
      <Link href="/projects" className="pd-back"><Icon name="arrow" size={16} /> العودة إلى المشاريع</Link>

      {/* بطاقة الرأس */}
      <div className="pd-header">
        <span className="pd-logo" style={{ background: project.color || "var(--primary)" }}>
          {project.logo ? <img src={project.logo} alt="" /> : project.name.slice(0, 1)}
        </span>
        <div className="pd-head-main">
          <div className="pd-title-row">
            <h1>{project.name}</h1>
            {(() => { const h = projectHealth(stats, project.status); return <span className="pill" style={{ background: h.bg, color: h.color, borderColor: "transparent" }}>{h.label}</span>; })()}
          </div>
          {project.description && <p className="pd-desc">{project.description}</p>}
          <div className="pd-chips">
            <div className="h-chip"><div className="n">{stats.pct}%</div><div className="l">نسبة الإنجاز</div></div>
            <div className="h-chip"><div className="n">{stats.done}/{stats.total}</div><div className="l">مهام معتمدة</div></div>
            <div className="h-chip"><div className="n" style={{ color: "#7c3aed" }}>{stats.pendingReview.length}</div><div className="l">بانتظار سيم</div></div>
            <div className="h-chip"><div className="n" style={{ color: "#e0574e" }}>{stats.overdue.length}</div><div className="l">متأخرة</div></div>
            <div className="h-chip"><div className="n" style={{ color: "#16a34a" }}>{kpiPctAll == null ? "—" : `${kpiPctAll}%`}</div><div className="l">تحقق المستهدفات</div></div>
          </div>
        </div>
      </div>

      <div className="pd-grid">
        {/* العمود الرئيسي */}
        <div className="pd-col">
          {/* نطاق العمل */}
          <div className="card pd-card">
            <div className="section-title" style={{ display: "flex", alignItems: "center" }}>
              <span>نطاق العمل</span>
              {canManage && scopeEdit == null && <button className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={() => setScopeEdit(project.scope || "")}><Icon name="edit" size={13} /> تعديل</button>}
            </div>
            {scopeEdit != null ? (
              <>
                <textarea rows={6} value={scopeEdit} onChange={(e) => setScopeEdit(e.target.value)} placeholder="بند في كل سطر" style={{ width: "100%" }} autoFocus />
                <div className="modal-actions" style={{ marginTop: 10 }}>
                  <button className="btn primary" onClick={saveScope}>حفظ</button>
                  <button className="btn ghost" onClick={() => setScopeEdit(null)}>إلغاء</button>
                </div>
              </>
            ) : (project.scope || "").trim() ? (
              <ul className="scope-list">
                {project.scope.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => <li key={i}>{l.replace(/^[-•*]\s*/, "")}</li>)}
              </ul>
            ) : <div className="muted" style={{ fontSize: 13 }}>لم يُحدَّد نطاق العمل بعد.</div>}
          </div>

          {/* المخرجات: كل مهمة ترتبط بمخرج محدد */}
          <div className="card pd-card">
            <div className="section-title">المخرجات ({deliverables.length})</div>
            {deliverables.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>لا مخرجات محددة بعد. أضِفها هنا أو من نموذج المهمة.</div>
            ) : deliverables.map((d) => {
              const items = tasks.filter((t) => t.deliverable === d);
              const done = items.filter((t) => isDone(t)).length;
              const pct = items.length ? Math.round((done / items.length) * 100) : 0;
              const waiting = items.filter((t) => t.status === "Pending Review").length;
              return (
                <div key={d} className="deliv-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <b>{d}</b>
                      <small className="muted">{done}/{items.length} معتمدة</small>
                      {waiting > 0 && <span className="pill" style={{ fontSize: 11, color: "#7c3aed" }}>{waiting} بانتظار سيم</span>}
                    </div>
                    <div className="progress" style={{ height: 6, marginTop: 6 }}><span style={{ width: `${pct}%`, background: pct === 100 ? "#16a34a" : project.color || "var(--primary)" }} /></div>
                  </div>
                  {canManage && <button className="btn sm ghost icon" title="إزالة" onClick={() => removeDeliverable(d)}><Icon name="close" size={14} /></button>}
                </div>
              );
            })}
            {canManage && (
              <div className="inline-form" style={{ marginTop: 10 }}>
                <input placeholder="مخرج جديد (مثال: الهوية البصرية)" value={newDeliv} onChange={(e) => setNewDeliv(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDeliverable(); } }} />
                <button className="btn primary" type="button" onClick={addDeliverable} disabled={!newDeliv.trim()}>إضافة</button>
              </div>
            )}
          </div>

          <div className="card pd-card">
            <div className="section-title">المهام ({tasks.length})</div>
            {tasks.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا مهام.</div> : (
              <div className="table-wrap" style={{ boxShadow: "none" }}>
                {tasks.map((t) => (
                  <div className="mini-item" key={t.id} style={{ cursor: "pointer" }} onClick={() => setViewingTask(t)}>
                    <Badge map={PRIORITY_META} value={t.priority} />
                    <div className="mtxt"><b>{t.task}</b><small>{t.deliverable ? `◆ ${t.deliverable} · ` : ""}{t.assigned_to || "غير مُسند"}{t.due_date ? ` · ${t.due_date}` : ""} · {taskProgress(t)}%{isOverdue(t) ? " · ⚠ متأخرة" : ""}{t.on_hold ? " · ⏸ معلّقة" : ""}</small></div>
                    <Badge map={STATUS_META} value={t.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card pd-card">
            <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>المستهدفات ({kpis.length})</span>
              {role === "client" && kpis.length > 0 && (
                <span className="pill" style={{ fontSize: 11, background: "#eaf6ef", color: "#16a34a" }}>المستهدفات العامة</span>
              )}
            </div>
            {kpis.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                {role === "client" ? "لا توجد مستهدفات عامة لهذا المشروع." : "لا مستهدفات مرتبطة بهذا المشروع بعد."}
              </div>
            ) : kpis.map((k) => {
              const pct = kpiPct(k);
              const barPct = Math.min(100, pct);
              const barColor = pct >= 85 ? "#16a34a" : pct >= 60 ? "#c88a2e" : "#e0574e";
              const vis = VISIBILITY_META[isPublicKpi(k) ? "public" : "private"];
              const owners = kpiAssignees(k);
              const unit = k.unit ? ` ${k.unit}` : "";
              return (
                <div key={k.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line, #ece6da)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 14 }}>{k.name}</b>
                    {role !== "client" && (
                      <span className="pill" style={{ fontSize: 11, background: vis.bg, color: vis.color }} title={vis.desc}>
                        {isPublicKpi(k) ? "◉" : "◍"} {vis.ar}
                      </span>
                    )}
                    <span style={{ marginInlineStart: "auto", fontSize: 13, fontWeight: 800, color: barColor }}>{pct}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--muted)", margin: "6px 0" }}>
                    <span>{k.category}{k.period ? ` · ${k.period}` : ""}{k.source ? ` · المصدر: ${k.source}` : ""}</span>
                    <span><b style={{ color: "var(--ink)" }}>{k.current}{unit}</b> من {k.target}{unit}</span>
                  </div>
                  <div className="progress" style={{ height: 8 }}><span style={{ width: `${barPct}%`, background: barColor }} /></div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>المسؤولون:</span>
                    {owners.length === 0
                      ? <span className="muted" style={{ fontSize: 12 }}>غير مُسند</span>
                      : owners.map((n) => <span key={n} className="pill" style={{ fontSize: 11.5, padding: "3px 9px" }}>{n}</span>)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card pd-card">
            <div className="section-title" style={{ display: "flex", alignItems: "center" }}>
              <span>الملفات والروابط ({files.length})</span>
              {!readOnly && (
                <label className="btn sm" style={{ marginInlineStart: "auto", cursor: "pointer" }}>
                  <Icon name="upload" size={13} /> {uploading ? "جاري الرفع…" : "رفع ملف"}
                  <input type="file" hidden onChange={uploadFile} disabled={uploading} />
                </label>
              )}
            </div>
            {files.length === 0 ? <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>لا روابط بعد.</div> : files.map((f) => (
              <div className="file-line" key={f.id}>
                <span style={{ color: "var(--primary)", display: "inline-flex" }}><Icon name={f.kind === "link" ? "link" : "file"} size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  {f.category && <small className="muted">{f.category}</small>}
                </div>
                <button className="btn sm" onClick={() => openLink(f)}>فتح</button>
                {canManage && <button className="btn sm danger icon" onClick={() => delLink(f)}><Icon name="trash" size={14} /></button>}
              </div>
            ))}
            {!readOnly && (
              <div className="inline-form" style={{ marginTop: 12 }}>
                <input placeholder="الوصف (مثال: عرض تقديمي)" value={lnk.label} onChange={(e) => setLnk({ ...lnk, label: e.target.value })} />
                <input placeholder="رابط Google Drive…" value={lnk.url} onChange={(e) => setLnk({ ...lnk, url: e.target.value })} />
                <button className="btn primary" type="button" onClick={addLink} disabled={busy || !lnk.url.trim()}>إضافة</button>
              </div>
            )}
          </div>

          <div className="card pd-card">
            <div className="section-title">محاضر الاجتماعات ({meetings.length})</div>
            {meetings.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>لا اجتماعات.</div> : meetings.map((m) => (
              <div className="file-line" key={m.id}>
                <span style={{ color: "var(--primary)", display: "inline-flex" }}><Icon name="calendar" size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{m.title}</div>
                  <small className="muted">{m.start_at ? new Date(m.start_at).toLocaleDateString("ar-SA", { month: "long", day: "numeric" }) : ""}{m.minutes ? " · يحوي محضراً" : ""}</small>
                </div>
                <button className="btn sm" onClick={() => setMinutesOf(m)}>المحضر</button>
                <button className="btn sm ghost icon" title="تصدير" onClick={() => exportMinutes(m)}><Icon name="upload" size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* العمود الجانبي */}
        <div className="pd-col">
          <div className="card pd-card">
            <div className="section-title">نظرة عامة</div>
            <div className="progress" style={{ marginBottom: 14 }}><span style={{ width: `${stats.pct}%`, background: project.color || "var(--primary)" }} /></div>
            <div className="pc-row"><span>معتمدة</span><b>{stats.done} / {stats.total}</b></div>
            <div className="pc-row"><span>قيد التنفيذ</span><b>{stats.open - stats.pendingReview.length}</b></div>
            <div className="pc-row"><span>بانتظار مراجعة سيم</span><b>{stats.pendingReview.length}</b></div>
            <div className="pc-row"><span>متأخرة</span><b style={{ color: stats.overdue.length ? "#e0574e" : undefined }}>{stats.overdue.length}</b></div>
            <div className="pc-row"><span>الملفات/الروابط</span><b>{files.length}</b></div>
            <div className="pc-row"><span>الاجتماعات</span><b>{meetings.length}</b></div>
          </div>

          <div className="card pd-card">
            <div className="section-title">المسؤول من ڤيوليت</div>
            {managers.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>لم يُحدَّد — من «تعديل المشروع»</div> :
              managers.map((n) => <Contact key={n} name={n} role="ڤيوليت" user={findU(n)} color="#6d4aa8" />)}
          </div>

          <div className="card pd-card">
            <div className="section-title">ممثل سيم</div>
            {clients.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>لم يُحدَّد — من «تعديل المشروع»</div> :
              clients.map((n) => <Contact key={n} name={n} role="سيم برايم" user={findU(n)} color="var(--primary)" />)}
          </div>

          <div className="card pd-card">
            <div className="section-title">الموظفون المصرّح لهم ({members.length})</div>
            {members.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>—</div> : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{members.map((n) => <span key={n} className="pill">{n}</span>)}</div>
            )}
          </div>
        </div>
      </div>

      {viewingTask && (
        <TaskDetail
          task={viewingTask}
          onClose={() => setViewingTask(null)}
          onUpdate={async (tid, patch) => { await tasksStore.update(tid, patch); await loadAll(); }}
          onChanged={loadAll}
          onEdit={() => setViewingTask(null)}
          onDelete={async (t) => { await tasksStore.remove(t.id); setViewingTask(null); await loadAll(); }}
        />
      )}
      {minutesOf && <MinutesModal meeting={minutesOf} readOnly={readOnly} onClose={() => setMinutesOf(null)} onUpdated={loadAll} onEdit={() => setMinutesOf(null)} />}
    </div>
  );
}

function Contact({ name, role, user, color }) {
  return (
    <div className="user-row" style={{ marginBottom: 8 }}>
      <span className="uav" style={{ background: color }}>{name.slice(0, 1)}</span>
      <div className="ubody">
        <b>{name}</b>
        <small>{role}{user?.title ? ` · ${user.title}` : ""}{user?.email ? ` · ${user.email}` : ""}</small>
      </div>
    </div>
  );
}
