"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { onDataChange, notificationsStore, appSettings } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";

const NotifCtx = createContext(null);

const ACTION_AR = {
  create: { verb: "إضافة", tone: "success" },
  update: { verb: "تحديث", tone: "info" },
  delete: { verb: "حذف", tone: "danger" },
};

// ربط اسم الكيان بمفتاح الحدث في الإعدادات
const ENTITY_EVENT = { "مستخدم": "person", "مشروع": "project", "مهمة": "task", "مستهدف": "kpi", "اجتماع": "meeting" };
const ACTION_PHRASE = { create: "تمت إضافة", update: "تم تحديث", delete: "تم حذف" };

export const DEFAULT_NOTIFY = {
  emailEnabled: false,        // المفتاح الرئيسي لإشعارات البريد
  recipientUsers: [],         // أسماء المستخدمين المستقبِلين (تُحلّ إلى إيميلاتهم)
  extraEmails: "",            // بريد إضافي خارجي (اختياري، يفصل بفاصلة)
  notifyAssignee: false,      // إرسال أيضاً للشخص المُسنَد (المهام)
  onCreateOnly: true,         // إرسال عند الإضافة فقط (لتجنّب الإزعاج)
  events: { person: true, project: true, task: true, kpi: true, meeting: true },
  // قوالب النصوص — المتغيّرات المتاحة: {الإجراء} {النوع} {الاسم}
  titleTemplate: "{الإجراء} {النوع}: {الاسم}",
  bodyTemplate: "{الإجراء} {النوع}: {الاسم}\nإشعار تلقائي من نظام ڤيوليت لإدارة المشاريع.",
};

// استبدال المتغيّرات في القالب بقيم الحدث
export function renderTemplate(tpl, evt) {
  const phrase = ACTION_PHRASE[evt.action] || "تحديث";
  return String(tpl || "")
    .split("{الإجراء}").join(phrase)
    .split("{النوع}").join(evt.entity || "")
    .split("{الاسم}").join(evt.label || "")
    .replace(/:\s*(?=\n|$)/g, "")  // إزالة نقطتين معلّقتين عند غياب الاسم
    .replace(/[ \t]+/g, " ")
    .trim();
}

let _toastSeq = 0;

export function NotificationsProvider({ children }) {
  const { users } = useRole();
  const [items, setItems] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [open, setOpen] = useState(false);
  const [notifyPrefs, setNotifyPrefs] = useState(DEFAULT_NOTIFY);
  const timers = useRef({});
  const prefsRef = useRef(DEFAULT_NOTIFY);
  const usersRef = useRef([]);

  useEffect(() => { prefsRef.current = notifyPrefs; }, [notifyPrefs]);
  useEffect(() => { usersRef.current = users; }, [users]);

  const reload = useCallback(async () => {
    const list = await notificationsStore.list().catch(() => []);
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    setItems(list.slice(0, 50));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // تحميل إعدادات إشعارات البريد (مع ترحيل الحقل القديم recipients)
  useEffect(() => {
    appSettings.get("notify").then((p) => {
      if (!p) return;
      const migrated = { ...DEFAULT_NOTIFY, ...p, events: { ...DEFAULT_NOTIFY.events, ...(p.events || {}) } };
      if (p.recipients && !p.extraEmails) migrated.extraEmails = p.recipients;
      if (!Array.isArray(migrated.recipientUsers)) migrated.recipientUsers = [];
      setNotifyPrefs(migrated);
    }).catch(() => {});
  }, []);

  const saveNotifyPrefs = useCallback(async (patch) => {
    setNotifyPrefs((prev) => {
      const next = { ...prev, ...patch, events: { ...prev.events, ...(patch.events || {}) } };
      appSettings.set("notify", next).catch(() => {});
      return next;
    });
  }, []);

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

  // إرسال بريد الحدث حسب الإعدادات
  const maybeSendEmail = useCallback(async (evt, title) => {
    const p = prefsRef.current;
    if (!p.emailEnabled) return;
    if (p.onCreateOnly && evt.action !== "create") return;
    const key = ENTITY_EVENT[evt.entity];
    if (!key || !p.events[key]) return;

    const set = new Set();
    // إيميلات المستخدمين المختارين
    (p.recipientUsers || []).forEach((name) => {
      const u = usersRef.current.find((x) => x.name === name);
      if (u?.email) set.add(u.email.trim());
    });
    // بريد إضافي خارجي
    (p.extraEmails || "").split(/[,\s;]+/).forEach((e) => { if (e && e.includes("@")) set.add(e.trim()); });
    // الشخص المُسنَد
    if (p.notifyAssignee && evt.record) {
      const name = evt.record.assigned_to || evt.record.holder;
      const u = usersRef.current.find((x) => x.name === name);
      if (u?.email) set.add(u.email.trim());
    }
    const to = [...set];
    if (!to.length) return;

    const bodyText = renderTemplate(p.bodyTemplate, evt);
    const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#23201C">
      <h2 style="color:#E36A62;margin:0 0 10px">${title}</h2>
      <div style="color:#555;font-size:14px;line-height:1.9;white-space:pre-line">${bodyText}</div>
    </div>`;
    try {
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: title, html }),
      });
    } catch {}
  }, []);

  // الاستماع لكل تغييرات البيانات
  useEffect(() => {
    const off = onDataChange(async (evt) => {
      const tone = (ACTION_AR[evt.action] || {}).tone || "info";
      const title = renderTemplate(prefsRef.current.titleTemplate, evt) || `${ACTION_PHRASE[evt.action] || ""} ${evt.entity}`;
      pushToast(title, tone);
      try {
        const rec = await notificationsStore.create({ kind: evt.action, entity: evt.entity, title, body: "", read: false });
        if (rec) setItems((prev) => [rec, ...prev].slice(0, 50));
      } catch {}
      maybeSendEmail(evt, title);
    });
    return off;
  }, [pushToast, maybeSendEmail]);

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

  const value = { items, unread, open, setOpen, reload, markAllRead, clearAll, pushToast, notifyPrefs, saveNotifyPrefs };

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
    notifyPrefs: DEFAULT_NOTIFY, saveNotifyPrefs: async () => {},
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
