"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { onDataChange, notificationsStore } from "@/lib/store";

const NotifCtx = createContext(null);

const ACTION_AR = {
  create: { verb: "إضافة", tone: "success" },
  update: { verb: "تحديث", tone: "info" },
  delete: { verb: "حذف", tone: "danger" },
};

function buildTitle({ entity, action, label }) {
  const a = ACTION_AR[action] || ACTION_AR.update;
  const suffix = label ? `: ${label}` : "";
  const verbPast = action === "create" ? "تمت إضافة" : action === "delete" ? "تم حذف" : "تم تحديث";
  return `${verbPast} ${entity}${suffix}`;
}

let _toastSeq = 0;

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [open, setOpen] = useState(false);
  const timers = useRef({});

  const reload = useCallback(async () => {
    const list = await notificationsStore.list().catch(() => []);
    // الأحدث أولاً
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    setItems(list.slice(0, 50));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const pushToast = useCallback((message, tone = "info") => {
    const id = ++_toastSeq;
    setToasts((t) => [...t, { id, message, tone }]);
    timers.current[id] = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
      delete timers.current[id];
    }, 3800);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id]; }
  }, []);

  // الاستماع لكل تغييرات البيانات عبر النظام
  useEffect(() => {
    const off = onDataChange(async (evt) => {
      const tone = (ACTION_AR[evt.action] || {}).tone || "info";
      const title = buildTitle(evt);
      pushToast(title, tone);
      try {
        const rec = await notificationsStore.create({
          kind: evt.action, entity: evt.entity, title, body: "", read: false,
        });
        if (rec) setItems((prev) => [rec, ...prev].slice(0, 50));
      } catch {}
    });
    return off;
  }, [pushToast]);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = useCallback(async () => {
    const un = items.filter((n) => !n.read);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    for (const n of un) { notificationsStore.update(n.id, { read: true }).catch(() => {}); }
  }, [items]);

  const clearAll = useCallback(async () => {
    const cur = items;
    setItems([]);
    for (const n of cur) { notificationsStore.remove(n.id).catch(() => {}); }
  }, [items]);

  const value = { items, unread, open, setOpen, reload, markAllRead, clearAll, pushToast };

  return (
    <NotifCtx.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </NotifCtx.Provider>
  );
}

export function useNotifications() {
  return useContext(NotifCtx) || {
    items: [], unread: 0, open: false, setOpen: () => {}, reload: async () => {},
    markAllRead: async () => {}, clearAll: async () => {}, pushToast: () => {},
  };
}

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toast-stack" dir="rtl">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`} onClick={() => onDismiss(t.id)}>
          <span className="toast-dot" />
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
