"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { onDataChange, notificationsStore, activityStore, appSettings } from "@/lib/store";
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

const ROLE_AR = { manager: "مدير", member: "عضو", client: "عميل" };

export const DEFAULT_NOTIFY = {
  emailEnabled: false,        // المفتاح الرئيسي لإشعارات البريد
  senderName: "",             // اسم المُرسِل الظاهر في البريد (فارغ = الافتراضي)
  recipientUsers: [],         // أسماء المستخدمين المستقبِلين (تُحلّ إلى إيميلاتهم)
  extraEmails: "",            // بريد إضافي خارجي (اختياري، يفصل بفاصلة)
  systemUrl: "",              // رابط النظام الظاهر في كل بريد (فارغ = رابط الموقع الحالي تلقائياً)
  sendToNewUser: true,        // إرسال إشعار «المستخدم» إلى بريد المستخدم نفسه (ترحيب)
  notifyAssignee: false,      // إرسال أيضاً للشخص المُسنَد (المهام)
  onCreateOnly: true,         // إرسال عند الإضافة فقط (لتجنّب الإزعاج)
  events: { person: true, project: true, task: true, kpi: true, meeting: true },
  // القالب الافتراضي — المتغيّرات: {الإجراء} {النوع} {الاسم} {الدور} {المسمى} {البريد} {المشروع}
  titleTemplate: "{الإجراء} {النوع}: {الاسم}",
  bodyTemplate: "{الإجراء} {النوع}: {الاسم}\nإشعار تلقائي من نظام سيم برايم لإدارة المشاريع.",
  // تخصيص رسالة لكل نوع حدث — لكل مفتاح { subject, body }.
  // الحقل الفارغ يرث القالب الافتراضي أعلاه.
  perEvent: {},
};

// استبدال المتغيّرات في القالب بقيم الحدث
export function renderTemplate(tpl, evt) {
  const phrase = ACTION_PHRASE[evt.action] || "تحديث";
  const rec = evt.record || {};
  return String(tpl || "")
    .split("{الإجراء}").join(phrase)
    .split("{النوع}").join(evt.entity || "")
    .split("{الاسم}").join(evt.label || "")
    .split("{الدور}").join(ROLE_AR[rec.role] || rec.role || "")
    .split("{المسمى}").join(rec.title || "")
    .split("{البريد}").join(rec.email || "")
    .split("{المشروع}").join(rec.project || (Array.isArray(rec.projects) ? rec.projects.join("، ") : "") || "")
    .replace(/:\s*(?=\n|$)/g, "")  // إزالة نقطتين معلّقتين عند غياب القيمة
    .replace(/[ \t]+/g, " ")
    .trim();
}

// رابط النظام: المضبوط في الإعدادات، وإلا رابط الموقع الحالي تلقائياً
export function systemUrlFrom(prefs) {
  const u = (prefs?.systemUrl || "").trim();
  if (u) return /^https?:\/\//i.test(u) ? u : `https://${u}`;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

// يبني بريد HTML موحّداً: العنوان + النص + زر «فتح النظام» في الأسفل
export function buildEmailHtml(subject, bodyText, appUrl) {
  const link = appUrl
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;text-align:center">
        <a href="${appUrl}" style="display:inline-block;background:#E36A62;color:#fff;text-decoration:none;padding:11px 28px;border-radius:10px;font-weight:700;font-size:14px">فتح النظام</a>
        <div style="margin-top:10px;font-size:12px;color:#9a9a9a"><a href="${appUrl}" style="color:#9a9a9a;text-decoration:none">${appUrl}</a></div>
      </div>`
    : "";
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#23201C;max-width:520px;margin:auto">
      <h2 style="color:#E36A62;margin:0 0 10px">${subject}</h2>
      <div style="color:#555;font-size:14px;line-height:1.9;white-space:pre-line">${bodyText}</div>
      ${link}
    </div>`;
}

// يختار قالب العنوان/النص لحدثٍ ما: تخصيص النوع إن وُجد، وإلا الافتراضي
export function pickTemplates(prefs, entityKey) {
  const pe = (prefs.perEvent || {})[entityKey] || {};
  return {
    subject: (pe.subject && pe.subject.trim()) ? pe.subject : prefs.titleTemplate,
    body: (pe.body && pe.body.trim()) ? pe.body : prefs.bodyTemplate,
  };
}

// ======= كتالوج الإشعارات المحدّدة (نوع × إجراء) =======
export const NOTIF_ACTIONS = ["create", "update", "delete"];

// لكل نوع: اسم عربي للحدث، ونصوص عناوين واضحة لكل إجراء
export const NOTIF_CATALOG = [
  { entityKey: "person",  entity: "مستخدم", group: "المستخدمون والعملاء",
    labels: { create: "إضافة مستخدم / عميل جديد", update: "تعديل بيانات مستخدم", delete: "حذف مستخدم" } },
  { entityKey: "project", entity: "مشروع", group: "المشاريع",
    labels: { create: "إضافة مشروع جديد", update: "تعديل مشروع", delete: "حذف مشروع" } },
  { entityKey: "task",    entity: "مهمة", group: "المهام",
    labels: { create: "إضافة مهمة جديدة", update: "تعديل مهمة", delete: "حذف مهمة" } },
  { entityKey: "kpi",     entity: "مستهدف", group: "المستهدفات",
    labels: { create: "إضافة مستهدف جديد", update: "تعديل مستهدف", delete: "حذف مستهدف" } },
  { entityKey: "meeting", entity: "اجتماع", group: "الاجتماعات",
    labels: { create: "إضافة اجتماع جديد", update: "تعديل اجتماع", delete: "حذف اجتماع" } },
];

export const notifKey = (entityKey, action) => `${entityKey}_${action}`;

// يرجّع حالة إشعار محدّد (تشغيل + عنوان + نص)، مع توافق خلفي للإعدادات القديمة
export function getNotif(prefs, entityKey, action) {
  const n = (prefs.notifs || {})[notifKey(entityKey, action)];
  if (n) {
    return {
      on: !!n.on,
      subject: (n.subject && n.subject.trim()) ? n.subject : prefs.titleTemplate,
      body: (n.body && n.body.trim()) ? n.body : prefs.bodyTemplate,
    };
  }
  // توافق مع الإعدادات القديمة (events + onCreateOnly + perEvent)
  const legacyOn = !!(prefs.events || {})[entityKey] && (action === "create" || !prefs.onCreateOnly);
  const pe = (prefs.perEvent || {})[entityKey] || {};
  return {
    on: legacyOn,
    subject: (pe.subject && pe.subject.trim()) ? pe.subject : prefs.titleTemplate,
    body: (pe.body && pe.body.trim()) ? pe.body : prefs.bodyTemplate,
  };
}

let _toastSeq = 0;

export function NotificationsProvider({ children }) {
  const { users, viewer } = useRole();
  const viewerRef = useRef(null);
  const [items, setItems] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [open, setOpen] = useState(false);
  const [notifyPrefs, setNotifyPrefs] = useState(DEFAULT_NOTIFY);
  const timers = useRef({});
  const prefsRef = useRef(DEFAULT_NOTIFY);
  const usersRef = useRef([]);

  useEffect(() => { prefsRef.current = notifyPrefs; }, [notifyPrefs]);
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { viewerRef.current = viewer; }, [viewer]);

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
    const key = ENTITY_EVENT[evt.entity];
    if (!key) return;
    const nx = getNotif(p, key, evt.action);
    if (!nx.on) return;

    const set = new Set();
    // إيميلات المستخدمين المختارين
    (p.recipientUsers || []).forEach((name) => {
      const u = usersRef.current.find((x) => x.name === name);
      if (u?.email) set.add(u.email.trim());
    });
    // بريد إضافي خارجي
    (p.extraEmails || "").split(/[,\s;]+/).forEach((e) => { if (e && e.includes("@")) set.add(e.trim()); });
    // بريد المستخدم نفسه (رسالة ترحيب تصل للمستخدم الجديد على بريده)
    if (p.sendToNewUser && evt.entity === "مستخدم" && evt.record?.email && String(evt.record.email).includes("@")) {
      set.add(String(evt.record.email).trim());
    }
    // الشخص المُسنَد
    if (p.notifyAssignee && evt.record) {
      const name = evt.record.assigned_to || evt.record.holder;
      const u = usersRef.current.find((x) => x.name === name);
      if (u?.email) set.add(u.email.trim());
    }
    const to = [...set];
    if (!to.length) return;

    // العنوان والنص حسب تخصيص هذا الإشعار (أو الافتراضي)
    const subject = renderTemplate(nx.subject, evt) || title;
    const bodyText = renderTemplate(nx.body, evt);
    const html = buildEmailHtml(subject, bodyText, systemUrlFrom(p));
    try {
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, html, fromName: (p.senderName || "").trim() || undefined }),
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
      // توثيق دائم في سجل الأنشطة مع اسم المنفِّذ
      try {
        activityStore.log({ actor: viewerRef.current?.name || "", action: evt.action, entity: evt.entity, label: evt.label });
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
