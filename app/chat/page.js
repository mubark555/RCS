"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { tasksStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { useChat } from "@/components/ChatProvider";
import ChatBox from "@/components/ChatBox";
import TaskChat from "@/components/TaskChat";
import TaskDetail from "@/components/TaskDetail";
import Icon from "@/components/Icon";
import { GENERAL, projectChannel, parseChannel, taskChatState } from "@/lib/chat";

function ago(iso) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.round(h / 24)} يوم`;
}

// المحادثات: الشات العام لسيم وڤيوليت والفريق، شات كل مشروع، وشات متابعة كل مهمة
export default function ChatPage() {
  const router = useRouter();
  const { projects, scopeProjects } = useRole();
  const chat = useChat();
  const [channel, setChannel] = useState(null);
  const [q, setQ] = useState("");
  const [viewingTask, setViewingTask] = useState(null);
  const [showList, setShowList] = useState(false); // للجوال: القائمة أو المحادثة

  useEffect(() => {
    let c = GENERAL;
    try { c = new URLSearchParams(window.location.search).get("c") || GENERAL; } catch {}
    setChannel(c);
  }, []);

  function open(c) {
    setChannel(c);
    setShowList(false);
    router.replace(c === GENERAL ? "/chat" : `/chat?c=${encodeURIComponent(c)}`, { scroll: false });
  }

  const s = q.trim();
  const myProjects = useMemo(() => (projects || [])
    .filter((p) => !scopeProjects || scopeProjects.includes(p.name))
    .filter((p) => !s || p.name.includes(s))
    .map((p) => ({ p, ch: projectChannel(p.id) }))
    .sort((a, b) => (chat.unread(b.ch) - chat.unread(a.ch)) || chat.lastAt(b.ch).localeCompare(chat.lastAt(a.ch))),
  [projects, scopeProjects, s, chat]);
  const threads = chat.taskThreads.filter((x) => x.task && (!s || `${x.task.task} ${x.task.project}`.includes(s)));

  if (!channel) return <div className="empty">جاري التحميل…</div>;

  const c = parseChannel(channel);
  const project = c.kind === "project" ? (projects || []).find((p) => String(p.id) === c.id) : null;
  const task = c.kind === "task" ? chat.tasksById[c.id] : null;
  const allowed = chat.visible(channel);

  return (
    <div className={`chp${showList ? " show-list" : ""}`}>
      <aside className="chp-side">
        <div className="chp-search">
          <Icon name="search" size={15} />
          <input placeholder="ابحث في المحادثات…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="chp-group">عام</div>
        <Item on={channel === GENERAL} onClick={() => open(GENERAL)} icon={<span className="chp-ic" style={{ background: "var(--ink)" }}><Icon name="users" size={15} /></span>}
          title="الشات العام" sub="سيم وڤيوليت والفريق كامل" unread={chat.unread(GENERAL)} last={chat.lastAt(GENERAL)} />

        <div className="chp-group">المشاريع</div>
        {myProjects.length === 0 && <div className="chp-none">لا مشاريع.</div>}
        {myProjects.map(({ p, ch }) => (
          <Item key={p.id} on={channel === ch} onClick={() => open(ch)}
            icon={<span className="chp-ic" style={{ background: p.color || "var(--primary)" }}>{p.logo ? <img src={p.logo} alt="" /> : p.name.slice(0, 1)}</span>}
            title={p.name} sub="شات المشروع" unread={chat.unread(ch)} last={chat.lastAt(ch)} />
        ))}

        <div className="chp-group">متابعة المهام</div>
        {threads.length === 0 && <div className="chp-none">شات أي مهمة يبدأ من تفاصيلها.</div>}
        {threads.map((x) => {
          const closed = taskChatState(x.task).closed;
          return (
            <Item key={x.channel} on={channel === x.channel} onClick={() => open(x.channel)}
              icon={<span className="chp-ic task"><Icon name={closed ? "lock" : "tasks"} size={14} /></span>}
              title={x.task.task} sub={`${x.task.project || "بدون مشروع"}${closed ? " · مقفل" : ""}`} unread={x.unread} last={x.last} />
          );
        })}
      </aside>

      <section className="chp-main">
        {!allowed ? (
          <div className="empty" style={{ margin: "auto" }}>
            {c.kind === "task" && !task ? "جاري تحميل المهمة…" : "لا تملك صلاحية على هذه المحادثة."}
          </div>
        ) : (
          <>
            <div className="chp-head">
              <button className="btn sm ghost icon chp-back" onClick={() => setShowList(true)} title="رجوع للقائمة"><Icon name="arrow" size={15} /></button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>{c.kind === "general" ? "الشات العام" : project ? `شات مشروع ${project.name}` : task?.task}</b>
                <small>{c.kind === "general" ? "للتواصل العام بين سيم وڤيوليت والفريق كامل" : project ? "كل ما يخص المشروع — اكتب @ للإشارة لشخص ويوصله بريد" : `${task?.project || ""} · ${task?.assigned_to || "غير مُسند"}`}</small>
              </div>
              {project && <Link className="btn sm" href={`/projects/${project.id}`}><Icon name="projects" size={14} /> صفحة المشروع</Link>}
              {task && <button className="btn sm" onClick={() => setViewingTask(task)}><Icon name="eye" size={14} /> فتح المهمة</button>}
            </div>
            {task ? (
              <TaskChat key={channel} task={task} tall />
            ) : (
              <ChatBox key={channel} channel={channel} tall
                label={project ? `شات مشروع ${project.name}` : "الشات العام"}
                link={`/chat${channel === GENERAL ? "" : `?c=${encodeURIComponent(channel)}`}`}
                emptyText={project ? "لا رسائل بعد في شات المشروع." : "لا رسائل بعد — ابدأ المحادثة مع الفريق."} />
            )}
          </>
        )}
      </section>

      {viewingTask && (
        <TaskDetail
          task={viewingTask}
          onClose={() => setViewingTask(null)}
          onUpdate={async (tid, patch) => { await tasksStore.update(tid, patch); setViewingTask((t) => (t ? { ...t, ...patch } : t)); }}
        />
      )}
    </div>
  );
}

function Item({ on, onClick, icon, title, sub, unread, last }) {
  return (
    <button type="button" className={`chp-item${on ? " on" : ""}${unread ? " unread" : ""}`} onClick={onClick}>
      {icon}
      <span className="chp-txt"><b>{title}</b><small>{sub}</small></span>
      <span className="chp-end">
        {last && <small>{ago(last)}</small>}
        {unread > 0 && <span className="chp-badge">{unread > 99 ? "99+" : unread}</span>}
      </span>
    </button>
  );
}
