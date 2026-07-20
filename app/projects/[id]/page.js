"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { projectsStore, tasksStore, meetingsStore, filesStore, usersStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";
import TaskDetail from "@/components/TaskDetail";
import MinutesModal, { exportMinutes } from "@/components/MinutesModal";
import { STATUS_META, HEALTH_META, PRIORITY_META, projManagers, projClients, projMembers } from "@/lib/constants";

export default function ProjectPage() {
  const { id } = useParams();
  const { readOnly } = useRole();
  const [project, setProject] = useState(undefined);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [files, setFiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [viewingTask, setViewingTask] = useState(null);
  const [minutesOf, setMinutesOf] = useState(null);
  const [lnk, setLnk] = useState({ label: "", url: "" });
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const projs = await projectsStore.list().catch(() => []);
    const p = projs.find((x) => x.id === id) || null;
    setProject(p);
    if (!p) return;
    const [ts, ms, fs, us] = await Promise.all([
      tasksStore.list().catch(() => []),
      meetingsStore.list().catch(() => []),
      filesStore.list().catch(() => []),
      usersStore.list().catch(() => []),
    ]);
    setTasks(ts.filter((t) => t.project === p.name));
    setMeetings(ms.filter((m) => m.project === p.name));
    setFiles(fs.filter((f) => f.project === p.name));
    setUsers(us);
  }
  useEffect(() => {
    loadAll();
  }, [id]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Completed").length;
    const delayed = tasks.filter((t) => t.health === "Delayed" || t.health === "At Risk").length;
    return { total, done, delayed, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  async function addLink() {
    if (!lnk.url.trim()) return;
    setBusy(true);
    try {
      await filesStore.addLink({ name: lnk.label || lnk.url, url: lnk.url, project: project.name, category: "Google Drive" });
      setLnk({ label: "", url: "" });
      await loadAll();
    } finally { setBusy(false); }
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
            <span className="pill" style={{ background: `${project.color}22`, color: project.color, borderColor: "transparent" }}>{project.status || "نشط"}</span>
          </div>
          {project.description && <p className="pd-desc">{project.description}</p>}
          <div className="pd-chips">
            <div className="h-chip"><div className="n">{stats.total}</div><div className="l">إجمالي المهام</div></div>
            <div className="h-chip"><div className="n">{stats.pct}%</div><div className="l">نسبة الإنجاز</div></div>
            <div className="h-chip"><div className="n" style={{ color: "var(--primary)" }}>{stats.delayed}</div><div className="l">تحتاج انتباه</div></div>
            <div className="h-chip"><div className="n">{meetings.length}</div><div className="l">اجتماعات</div></div>
          </div>
        </div>
      </div>

      <div className="pd-grid">
        {/* العمود الرئيسي */}
        <div className="pd-col">
          <div className="card pd-card">
            <div className="section-title">المهام ({tasks.length})</div>
            {tasks.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا مهام.</div> : (
              <div className="table-wrap" style={{ boxShadow: "none" }}>
                {tasks.map((t) => (
                  <div className="mini-item" key={t.id} style={{ cursor: "pointer" }} onClick={() => setViewingTask(t)}>
                    <Badge map={PRIORITY_META} value={t.priority} />
                    <div className="mtxt"><b>{t.task}</b><small>{t.assigned_to || "غير مُسند"}{t.due_date ? ` · ${t.due_date}` : ""}</small></div>
                    <Badge map={STATUS_META} value={t.status} />
                    <Badge map={HEALTH_META} value={t.health} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card pd-card">
            <div className="section-title">أرشيف الروابط — Google Drive ({files.length})</div>
            {files.length === 0 ? <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>لا روابط بعد.</div> : files.map((f) => (
              <div className="file-line" key={f.id}>
                <span style={{ color: "var(--primary)", display: "inline-flex" }}><Icon name="link" size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  {f.category && <small className="muted">{f.category}</small>}
                </div>
                <button className="btn sm" onClick={() => openLink(f)}>فتح</button>
                {!readOnly && <button className="btn sm danger icon" onClick={() => delLink(f)}><Icon name="trash" size={14} /></button>}
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
            <div className="pc-row"><span>مكتملة</span><b>{stats.done} / {stats.total}</b></div>
            <div className="pc-row"><span>تحتاج انتباه</span><b>{stats.delayed}</b></div>
            <div className="pc-row"><span>الملفات/الروابط</span><b>{files.length}</b></div>
          </div>

          <div className="card pd-card">
            <div className="section-title">مدراء المشروع</div>
            {managers.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>—</div> :
              managers.map((n) => <Contact key={n} name={n} role="مدير مشروع" user={findU(n)} color="var(--primary)" />)}
          </div>

          <div className="card pd-card">
            <div className="section-title">حسابات العملاء</div>
            {clients.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>—</div> :
              clients.map((n) => <Contact key={n} name={n} role="عميل" user={findU(n)} color="#3a56c5" />)}
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
