"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { chatStore, tasksStore, appSettings, onDataChange } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { GENERAL, parseChannel, taskChatState } from "@/lib/chat";

// متابعة المحادثات غير المقروءة لكل موظف: آخر قراءة لكل قناة تُحفظ له (سحابياً عند توفره)
const Ctx = createContext(null);
const WINDOW_DAYS = 30; // نحسب غير المقروء من رسائل آخر 30 يوماً
const FIRST_DAYS = 7;   // أول دخول: رسائل آخر أسبوع تظهر كغير مقروءة (حتى لا تفوته رسائل قبل دخوله)
const readKey = (id) => `chat_read_${id}`;

export function ChatProvider({ children }) {
  const { viewer, projects, scopeProjects, can, taskVisible, ready } = useRole();
  const [msgs, setMsgs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [reads, setReads] = useState(null); // { _since, [channel]: iso }
  const saveTimer = useRef(null);
  const loadTimer = useRef(null);
  const viewerId = viewer?.id;
  const canChat = ready && !!viewer && can("chat", "view");

  const load = useCallback(() => {
    clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => {
      const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
      chatStore.recent(since).then(setMsgs).catch(() => {});
    }, 400);
  }, []);
  const loadTasks = useCallback(() => { tasksStore.list().then(setTasks).catch(() => {}); }, []);

  useEffect(() => {
    if (!canChat) return;
    load();
    loadTasks();
    const off = chatStore.subscribeAll(load);
    const offData = onDataChange(loadTasks);
    return () => { off(); offData(); };
  }, [canChat, load, loadTasks]);

  // آخر قراءة لكل قناة؛ أول مرة: ما قبل أسبوع يُعتبر مقروءاً حتى لا تنهال عليه الرسائل القديمة
  useEffect(() => {
    if (!viewerId) { setReads(null); return; }
    let live = true;
    appSettings.get(readKey(viewerId)).then((v) => {
      if (!live) return;
      if (v && typeof v === "object" && v._since) setReads(v);
      else {
        const init = { _since: new Date(Date.now() - FIRST_DAYS * 86400000).toISOString() };
        setReads(init);
        appSettings.set(readKey(viewerId), init).catch(() => {});
      }
    }).catch(() => live && setReads({ _since: new Date(Date.now() - FIRST_DAYS * 86400000).toISOString() }));
    return () => { live = false; };
  }, [viewerId]);

  const tasksById = useMemo(() => Object.fromEntries(tasks.map((t) => [String(t.id), t])), [tasks]);
  const projectIds = useMemo(() => new Set((projects || []).filter((p) => !scopeProjects || scopeProjects.includes(p.name)).map((p) => String(p.id))), [projects, scopeProjects]);

  // هل القناة ضمن نطاق الموظف؟ (شات المهمة المقفل لا يُحسب في غير المقروء)
  const visible = useCallback((channel, { forUnread = false } = {}) => {
    const c = parseChannel(channel);
    if (c.kind === "general") return true;
    if (c.kind === "project") return projectIds.has(c.id);
    if (c.kind === "task") {
      const t = tasksById[c.id];
      if (!t || !taskVisible(t)) return false;
      return !forUnread || !taskChatState(t).closed;
    }
    return false;
  }, [projectIds, tasksById, taskVisible]);

  const stats = useMemo(() => {
    const out = {};
    const me = viewer?.name;
    for (const m of msgs) {
      const s = (out[m.channel] = out[m.channel] || { last: "", unread: 0 });
      if (m.created_at > s.last) s.last = m.created_at;
      const seen = reads?.[m.channel] || reads?._since;
      if (reads && m.author !== me && m.created_at > seen) s.unread += 1;
    }
    return out;
  }, [msgs, reads, viewer?.name]);

  const unread = useCallback((channel) => (canChat && visible(channel, { forUnread: true }) ? stats[channel]?.unread || 0 : 0), [canChat, stats, visible]);
  const unreadTotal = useMemo(() => (canChat ? Object.keys(stats).reduce((n, ch) => n + unread(ch), 0) : 0), [canChat, stats, unread]);

  const markRead = useCallback((channel) => {
    if (!viewerId) return;
    setReads((prev) => {
      if (!prev) return prev;
      const at = new Date().toISOString();
      const next = { ...prev, [channel]: at };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => appSettings.set(readKey(viewerId), next).catch(() => {}), 1200);
      return next;
    });
  }, [viewerId]);

  // قنوات المهام التي فيها نقاش (للقائمة في صفحة المحادثات)
  const taskThreads = useMemo(() => Object.entries(stats)
    .filter(([ch]) => ch.startsWith("task:") && visible(ch))
    .map(([ch, s]) => ({ channel: ch, task: tasksById[ch.slice(5)], last: s.last, unread: unread(ch) }))
    .sort((a, b) => b.last.localeCompare(a.last)), [stats, visible, tasksById, unread]);

  const value = { canChat, unread, unreadTotal, markRead, lastAt: (ch) => stats[ch]?.last || "", taskThreads, tasksById, visible, reload: load, GENERAL };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat() {
  return useContext(Ctx) || { canChat: false, unread: () => 0, unreadTotal: 0, markRead: () => {}, lastAt: () => "", taskThreads: [], tasksById: {}, visible: () => false, reload: () => {} };
}
