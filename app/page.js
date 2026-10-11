"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksStore, meetingsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Overview from "@/components/Overview";
import TaskCard, { isOverdue } from "@/components/TaskCard";
import TaskDetail from "@/components/TaskDetail";
import Modal from "@/components/Modal";
import TaskForm from "@/components/TaskForm";
import Icon from "@/components/Icon";
import { ATTENDANCE_TYPES, attendanceOf } from "@/lib/constants";
import { myAction, isWaitingOnOthers, isAssignee, stageOf } from "@/lib/workflow.mjs";
import { canSeeTask, canSeeMeeting } from "@/lib/permissions.mjs";

const PRI = { High: 0, Medium: 1, Low: 2 };
const dayKey = (d) => {
  const x = new Date(d);
  return isNaN(x) ? null : new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};
const byUrgency = (a, b) =>
  (a.due_date || "9999").localeCompare(b.due_date || "9999") || (PRI[a.priority] ?? 3) - (PRI[b.priority] ?? 3);

// الصفحة الرئيسية: العميل يرى متابعة مشروعه، وبقية المستخدمين يرون «مهامي»
export default function Home() {
  const { role, ready } = useRole();
  if (!ready) return <div className="empty">جاري التحميل…</div>;
  return role === "client" ? <Overview /> : <MyWork />;
}

function MyWork() {
  const { viewer, access, canAny } = useRole();
  const [tasks, setTasks] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showDone, setShowDone] = useState(false);

  async function reload() {
    const list = await tasksStore.list().catch(() => []);
    setTasks(list);
    setViewing((v) => (v ? list.find((x) => x.id === v.id) || null : null));
  }
  useEffect(() => {
    reload();
    meetingsStore.list().then(setMeetings).catch(() => setMeetings([]));
  }, []);

  // كل مهمة تظهر مرة واحدة في أعلى قسم ينطبق عليها
  const g = useMemo(() => {
    const out = { returned: [], overdue: [], approvals: [], today: [], upcoming: [], waiting: [], done: [] };
    if (!tasks || !viewer) return out;
    const today = dayKey(new Date());
    for (const t of tasks) {
      if (!canSeeTask(t, access, viewer)) continue;
      const a = myAction(t, viewer);
      if (a) {
        if (a.kind === "fix") out.returned.push(t);
        else if (isOverdue(t)) out.overdue.push(t);
        else if (["review", "approval", "final"].includes(a.kind)) out.approvals.push(t);
        else if (t.due_date && dayKey(t.due_date) === today) out.today.push(t);
        else out.upcoming.push(t);
      } else if (isWaitingOnOthers(t, viewer)) out.waiting.push(t);
      else if (isAssignee(t, viewer) && stageOf(t) === "closed") out.done.push(t);
    }
    for (const k of Object.keys(out)) out[k].sort(byUrgency);
    out.done.sort((a, b) => String(b.completed_at || b.due_date || "").localeCompare(String(a.completed_at || a.due_date || "")));
    return out;
  }, [tasks, viewer, access]);

  const myMeetings = useMemo(() => {
    const now = new Date().toISOString();
    return (meetings || [])
      .filter((m) => m.status !== "Cancelled" && m.start_at >= now && Array.isArray(m.attendees) && m.attendees.includes(viewer?.name) && canSeeMeeting(m, access, viewer))
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 5);
  }, [meetings, viewer]);

  if (!tasks) return <div className="empty">جاري التحميل…</div>;
  if (!viewer) return <div className="empty">لا يوجد مستخدم محدد.</div>;

  const needAction = g.returned.length + g.overdue.length + g.approvals.length + g.today.length;
  const SECTIONS = [
    { key: "returned", title: "أُعيدت إليك للتعديل", color: "#d97706" },
    { key: "overdue", title: "متأخرة عن موعدها", color: "#dc2626" },
    { key: "approvals", title: "بانتظار مراجعتك / موافقتك / اعتمادك", color: "#7c3aed" },
    { key: "today", title: "مستحقة اليوم", color: "#c88a2e" },
    { key: "upcoming", title: "مهامك القادمة وقيد التنفيذ", color: "#2563eb" },
    { key: "waiting", title: "سلّمتها وتنتظر الآخرين", color: "#64748b" },
  ];

  return (
    <div>
      <div className="dash-hero">
        <span className="hav">{viewer.name.slice(0, 1)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>مرحباً {viewer.name} 👋</h2>
          <p>
            {needAction ? <>لديك <b>{needAction} مهام</b> تتطلب إجراءً منك الآن</> : "لا توجد مهام تتطلب إجراءً منك الآن"}
            {g.upcoming.length ? <> و<b>{g.upcoming.length}</b> قيد التنفيذ</> : null}
          </p>
        </div>
        {canAny("task.create") && <button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" size={16} /> مهمة جديدة</button>}
      </div>

      <div className="mw-stats">
        {SECTIONS.slice(0, 4).map((s) => (
          <a key={s.key} href={`#mw-${s.key}`} className="mw-stat" style={{ "--c": s.color }}>
            <b>{g[s.key].length}</b><span>{s.title}</span>
          </a>
        ))}
      </div>

      {myMeetings.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-title" style={{ marginTop: 0 }}><Icon name="calendar" size={17} /> اجتماعاتك القادمة</div>
          {myMeetings.map((m) => {
            const at = ATTENDANCE_TYPES[attendanceOf(m, viewer.name)];
            return (
              <div className="mw-meet" key={m.id}>
                <span className="badge" style={{ background: `${at.color}1a`, color: at.color }}>{at.ar}</span>
                <b>{m.title}</b>
                <small>{new Date(m.start_at).toLocaleString("ar-SA-u-ca-gregory", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{m.project ? ` · ${m.project}` : ""}</small>
              </div>
            );
          })}
        </div>
      )}

      {SECTIONS.map((s) =>
        g[s.key].length === 0 ? null : (
          <div key={s.key} id={`mw-${s.key}`}>
            <div className="section-title"><span className="dot" style={{ background: s.color, width: 9, height: 9, borderRadius: 9 }} /> {s.title} <span className="hint">({g[s.key].length})</span></div>
            <div className="task-cards">
              {g[s.key].map((t) => <TaskCard key={t.id} task={t} onOpen={setViewing} onChanged={reload} />)}
            </div>
          </div>
        )
      )}

      {SECTIONS.every((s) => g[s.key].length === 0) && (
        <div className="empty"><div className="big">✓</div>لا توجد مهام مسندة إليك حالياً.</div>
      )}

      {g.done.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button className="arch-bar" onClick={() => setShowDone((v) => !v)}>
            <Icon name="check" size={17} />
            <span>إنجازاتك المكتملة</span>
            <span className="arch-count">{g.done.length}</span>
            <span style={{ marginInlineStart: "auto", transition: ".2s", transform: showDone ? "rotate(90deg)" : "none" }}>‹</span>
          </button>
          {showDone && <div className="task-cards" style={{ marginTop: 10 }}>{g.done.map((t) => <TaskCard key={t.id} task={t} onOpen={setViewing} />)}</div>}
        </div>
      )}

      {viewing && (
        <TaskDetail task={viewing} onClose={() => setViewing(null)} onChanged={reload}
          onUpdate={async (id, patch) => { await tasksStore.update(id, patch, viewing); await reload(); }}
          onEdit={(t) => { setViewing(null); setEditing(t); }}
          onDelete={async (t) => { if (!confirm(`حذف المهمة؟\n\n${t.task}`)) return; setViewing(null); await tasksStore.remove(t.id, t); await reload(); }} />
      )}
      {editing && (
        <Modal title={editing.id ? "تعديل المهمة" : "مهمة جديدة"} onClose={() => setEditing(null)}>
          <TaskForm initial={editing.id ? editing : null} onCancel={() => setEditing(null)}
            onSave={async (p) => { if (editing.id) await tasksStore.update(editing.id, p, editing); else await tasksStore.create(p); setEditing(null); await reload(); }} />
        </Modal>
      )}
    </div>
  );
}
