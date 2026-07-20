"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tasksStore, meetingsStore, filesStore, usersStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";
import MinutesModal, { exportMinutes } from "@/components/MinutesModal";
import { STATUS_META, HEALTH_META, projManagers, projClients, projMembers } from "@/lib/constants";

export default function ProjectDetail({ project, onClose }) {
  const { readOnly } = useRole();
  const [minutesOf, setMinutesOf] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [files, setFiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [busyFile, setBusyFile] = useState(false);
  const [lnk, setLnk] = useState({ label: "", url: "" });

  async function reloadFiles() {
    const a = await filesStore.list().catch(() => []);
    setFiles(a.filter((f) => f.project === project.name));
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const P = project.name;
    tasksStore.list().then((a) => setTasks(a.filter((t) => t.project === P))).catch(() => {});
    meetingsStore.list().then((a) => setMeetings(a.filter((m) => m.project === P))).catch(() => {});
    filesStore.list().then((a) => setFiles(a.filter((f) => f.project === P))).catch(() => {});
    usersStore.list().then(setUsers).catch(() => {});
    return () => window.removeEventListener("keydown", onKey);
  }, [project, onClose]);

  async function addLink() {
    if (!lnk.url.trim()) return;
    setBusyFile(true);
    try {
      await filesStore.addLink({ name: lnk.label || lnk.url, url: lnk.url, project: project.name, category: "Google Drive" });
      setLnk({ label: "", url: "" });
      await reloadFiles();
    } finally {
      setBusyFile(false);
    }
  }

  async function openFile(f) {
    const url = await filesStore.getUrl(f);
    window.open(url, "_blank");
  }

  async function delFile(f) {
    if (!confirm(`حذف الرابط؟\n\n${f.name}`)) return;
    await filesStore.remove(f);
    await reloadFiles();
  }

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Completed").length;
    const delayed = tasks.filter((t) => t.health === "Delayed").length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0, delayed };
  }, [tasks]);

  const managers = projManagers(project);
  const clients = projClients(project);
  const members = projMembers(project);
  const findU = (name) => users.find((u) => u.name === name);

  return (
    <div className="drawer-wrap" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="top">
            <span className="pill" style={{ background: `${project.color}22`, color: project.color, borderColor: "transparent" }}>
              {project.status || "نشط"}
            </span>
            <button className="x" onClick={onClose} title="إغلاق"><Icon name="close" size={16} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="pc-badge" style={{ background: project.color || "#e05a50", width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 20, overflow: "hidden", flexShrink: 0 }}>
              {project.logo ? <img src={project.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : project.name.slice(0, 1)}
            </span>
            <div>
              <h3 style={{ margin: 0 }}>{project.name}</h3>
              {project.description && <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{project.description}</p>}
            </div>
          </div>
        </div>

        <div className="drawer-body">
          <div className="detail-grid">
            <div className="detail-field"><div className="k">إجمالي المهام</div><div className="v">{stats.total}</div></div>
            <div className="detail-field"><div className="k">نسبة الإنجاز</div><div className="v">{stats.pct}%</div></div>
          </div>
          <div className="progress" style={{ marginTop: 12 }}>
            <span style={{ width: `${stats.pct}%`, background: project.color }} />
          </div>

          <div className="d-section">مدراء المشروع ({managers.length})</div>
          {managers.length === 0 ? <div className="detail-block"><span className="muted">لا مدراء.</span></div> :
            managers.map((n) => <ContactRow key={n} role="مدير مشروع" user={findU(n)} fallback={n} color="#e05a50" />)}

          <div className="d-section">حسابات العملاء ({clients.length})</div>
          {clients.length === 0 ? <div className="detail-block"><span className="muted">لا عملاء.</span></div> :
            clients.map((n) => <ContactRow key={n} role="عميل" user={findU(n)} fallback={n} color="#3a56c5" />)}

          <div className="d-section">الموظفون المصرّح لهم ({members.length})</div>
          <div className="detail-block">
            {members.length === 0 ? <span className="muted">لا موظفين مُسندين.</span> : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {members.map((n) => <span key={n} className="pill">{n}</span>)}
              </div>
            )}
          </div>

          <div className="d-section">مهام المشروع ({tasks.length})</div>
          <div className="detail-block" style={{ padding: 8 }}>
            {tasks.length === 0 ? <span className="muted">لا مهام.</span> : tasks.slice(0, 15).map((t) => (
              <div className="mini-item" key={t.id}>
                <div className="mtxt"><b>{t.task}</b><small>{t.assigned_to || "غير مُسند"}</small></div>
                <Badge map={STATUS_META} value={t.status} />
                <Badge map={HEALTH_META} value={t.health} />
              </div>
            ))}
            {tasks.length > 15 && <div className="muted" style={{ padding: 8, fontSize: 12 }}>+ {tasks.length - 15} مهمة أخرى…</div>}
          </div>

          <div className="d-section">أرشيف المشروع — روابط Google Drive ({files.length})</div>
          <div className="detail-block">
            {files.length === 0 ? <span className="muted">لا روابط بعد — أضِف روابط ملفات المشروع (Google Drive).</span> : files.map((f) => (
              <div className="file-line" key={f.id}>
                <span style={{ color: "var(--primary)", display: "inline-flex" }}><Icon name="link" size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  {f.category && <small className="muted">{f.category}</small>}
                </div>
                <button className="btn sm" onClick={() => openFile(f)}>فتح</button>
                {!readOnly && <button className="btn sm danger icon" onClick={() => delFile(f)}><Icon name="trash" size={14} /></button>}
              </div>
            ))}
            {!readOnly && (
              <div className="inline-form" style={{ marginTop: 10 }}>
                <input placeholder="الوصف (مثال: عرض تقديمي)" value={lnk.label} onChange={(e) => setLnk({ ...lnk, label: e.target.value })} />
                <input placeholder="رابط Google Drive…" value={lnk.url} onChange={(e) => setLnk({ ...lnk, url: e.target.value })} />
                <button className="btn primary" type="button" onClick={addLink} disabled={busyFile || !lnk.url.trim()}>إضافة</button>
              </div>
            )}
          </div>

          <div className="d-section">محاضر الاجتماعات ({meetings.length})</div>
          <div className="detail-block">
            {meetings.length === 0 ? <span className="muted">لا اجتماعات لهذا المشروع.</span> : meetings.map((m) => (
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
      </div>

      {minutesOf && (
        <MinutesModal meeting={minutesOf} readOnly={readOnly} onClose={() => setMinutesOf(null)} onUpdated={reloadFiles} onEdit={() => setMinutesOf(null)} />
      )}
    </div>
  );
}

function ContactRow({ role, user, fallback, color }) {
  const name = user?.name || fallback || "—";
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
