"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksStore, meetingsStore, filesStore, usersStore } from "@/lib/store";
import Badge from "@/components/Badge";
import { STATUS_META, HEALTH_META } from "@/lib/constants";

export default function ProjectDetail({ project, onClose }) {
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [files, setFiles] = useState([]);
  const [users, setUsers] = useState([]);

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

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Completed").length;
    const delayed = tasks.filter((t) => t.health === "Delayed").length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0, delayed };
  }, [tasks]);

  const manager = users.find((u) => u.name === project.manager);
  const client = users.find((u) => u.name === project.client);

  return (
    <div className="drawer-wrap" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="top">
            <span className="pill" style={{ background: `${project.color}22`, color: project.color, borderColor: "transparent" }}>
              {project.status || "نشط"}
            </span>
            <button className="x" onClick={onClose} title="إغلاق">✕</button>
          </div>
          <h3>{project.name}</h3>
          {project.description && <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>{project.description}</p>}
        </div>

        <div className="drawer-body">
          <div className="detail-grid">
            <div className="detail-field"><div className="k">إجمالي المهام</div><div className="v">{stats.total}</div></div>
            <div className="detail-field"><div className="k">نسبة الإنجاز</div><div className="v">{stats.pct}%</div></div>
          </div>
          <div className="progress" style={{ marginTop: 12 }}>
            <span style={{ width: `${stats.pct}%`, background: project.color }} />
          </div>

          {/* جهات التواصل */}
          <div className="d-section">جهات التواصل</div>
          <ContactRow role="مدير المشروع" user={manager} fallback={project.manager} color="#e05a50" />
          <ContactRow role="العميل" user={client} fallback={project.client} color="#3a56c5" />

          {/* المهام */}
          <div className="d-section">مهام المشروع ({tasks.length})</div>
          <div className="detail-block" style={{ padding: 8 }}>
            {tasks.length === 0 ? (
              <span className="muted">لا مهام.</span>
            ) : (
              tasks.slice(0, 12).map((t) => (
                <div className="mini-item" key={t.id}>
                  <div className="mtxt"><b>{t.task}</b><small>{t.assigned_to || "غير مُسند"}</small></div>
                  <Badge map={STATUS_META} value={t.status} />
                  <Badge map={HEALTH_META} value={t.health} />
                </div>
              ))
            )}
            {tasks.length > 12 && <div className="muted" style={{ padding: 8, fontSize: 12 }}>+ {tasks.length - 12} مهمة أخرى…</div>}
          </div>

          {/* الملفات والروابط */}
          <div className="d-section">الملفات والروابط ({files.length})</div>
          <div className="detail-block">
            {files.length === 0 ? (
              <span className="muted">لا ملفات مرتبطة.</span>
            ) : (
              files.map((f) => (
                <div className="file-line" key={f.id}>
                  <span>{f.kind === "link" ? "🔗" : "📎"}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{f.name}</span>
                  {f.category && <span className="pill">{f.category}</span>}
                </div>
              ))
            )}
          </div>

          {/* الاجتماعات */}
          <div className="d-section">اجتماعات المشروع ({meetings.length})</div>
          <div className="detail-block">
            {meetings.length === 0 ? (
              <span className="muted">لا اجتماعات.</span>
            ) : (
              meetings.map((m) => (
                <div className="file-line" key={m.id}>
                  <span>🗓️</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{m.title}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {m.start_at ? new Date(m.start_at).toLocaleDateString("ar-SA", { month: "short", day: "numeric" }) : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
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
