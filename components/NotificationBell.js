"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { notificationsStore, tasksStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { NOTIFY_KINDS, dueAlerts, wants } from "@/lib/notify.mjs";
import { canSeeTask } from "@/lib/permissions.mjs";
import { NAV_EVENT } from "@/components/useQueryParam";
import Icon from "@/components/Icon";
import Modal from "@/components/Modal";

function ago(iso) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  if (m < 1440) return `قبل ${Math.round(m / 60)} س`;
  return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "short" });
}

export default function NotificationBell() {
  const router = useRouter();
  const path = usePathname();
  const { viewer, access, reloadUsers } = useRole();
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState([]);
  const [derived, setDerived] = useState([]);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    if (!viewer) return;
    const [list, tasks] = await Promise.all([
      notificationsStore.mine(viewer.id).catch(() => []),
      tasksStore.list().catch(() => []),
    ]);
    setStored(list);
    setDerived(dueAlerts(tasks.filter((t) => canSeeTask(t, access, viewer)), viewer));
  }, [viewer, access]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load, path]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = stored.filter((n) => !n.read_at);
  const count = unread.length + derived.length;

  async function go(n) {
    setOpen(false);
    if (!n.derived && !n.read_at) {
      await notificationsStore.markRead([n.id]).catch(() => {});
      setStored((s) => s.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (n.link) {
      router.push(n.link);
      setTimeout(() => window.dispatchEvent(new Event(NAV_EVENT)), 50);
    }
  }

  async function readAll() {
    await notificationsStore.markRead(unread.map((n) => n.id)).catch(() => {});
    await load();
  }

  const items = [...derived, ...stored];
  return (
    <div className="bell-wrap" ref={ref}>
      <button type="button" className="bell" title="الإشعارات" aria-label={`الإشعارات (${count})`} onClick={() => setOpen((v) => !v)}>
        <Icon name="bell" size={18} />
        {count > 0 && <span className="cnt">{count}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <b>الإشعارات</b>
            {unread.length > 0 && <button className="btn sm ghost" onClick={readAll}>تعليم الكل كمقروء</button>}
            <button className="btn sm ghost icon" title="تفضيلات الإشعارات" onClick={() => { setOpen(false); setPrefsOpen(true); }}><Icon name="settings" size={15} /></button>
          </div>
          {items.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا إشعارات.</div> : (
            <div className="notif-list">
              {items.map((n) => (
                <button type="button" key={n.id} className={`notif-item ${n.derived || !n.read_at ? "unread" : ""} k-${n.kind}`} onClick={() => go(n)}>
                  <span className="notif-kind">{NOTIFY_KINDS[n.kind]?.ar || n.kind}</span>
                  <b>{n.title}</b>
                  {n.body && <small>{n.body}</small>}
                  {!n.derived && <small className="muted">{ago(n.created_at)}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {prefsOpen && viewer && (
        <Modal title="تفضيلات الإشعارات" onClose={() => setPrefsOpen(false)}>
          <Prefs user={viewer} onCancel={() => setPrefsOpen(false)} onSave={async (prefs) => {
            await notificationsStore.savePrefs(viewer, prefs);
            await reloadUsers();
            setPrefsOpen(false);
            await load();
          }} />
        </Modal>
      )}
    </div>
  );
}

function Prefs({ user, onSave, onCancel }) {
  const [p, setP] = useState(() => Object.fromEntries(Object.keys(NOTIFY_KINDS).map((k) => [k, wants(user, k)])));
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave(p); } finally { setBusy(false); } }}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>اختر ما يصلك من إشعارات داخل النظام. إيقاف الإشعار لا يُخفي المهمة من «مهامي».</p>
      <div className="prefs-list">
        {Object.entries(NOTIFY_KINDS).map(([k, v]) => (
          <label key={k} className="prefs-row">
            <input type="checkbox" checked={p[k]} onChange={(e) => setP((s) => ({ ...s, [k]: e.target.checked }))} />
            <span>{v.ar}</span>
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={busy}>حفظ</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
