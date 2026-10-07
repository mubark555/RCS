"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useRole } from "@/components/RoleProvider";
import { tasksStore, meetingsStore, kpisStore, invoicesStore, paymentsStore } from "@/lib/store";
import { leavesApi } from "@/lib/leaves";
import { answer, suggestions, taskItem, AMAL_NAME, PRIORITY_OPTIONS } from "@/lib/amal";

const STALE_MS = 60 * 1000;

// «أمل»: زر عائم يفتح نافذة محادثة تجيب من بيانات النظام بحسب صلاحيات المستخدم
export default function AmalAssistant() {
  const { viewer, role, can, users, projects, scopeProjects, ready } = useRole();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const data = useRef({ at: 0, scopeKey: "" });
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const scopeKey = `${viewer?.id || ""}|${(scopeProjects || []).join(",")}`;

  const loadData = useCallback(async (force = false) => {
    const d = data.current;
    if (!force && d.scopeKey === scopeKey && Date.now() - d.at < STALE_MS) return d;
    const inScope = (p) => !scopeProjects || scopeProjects.includes(p);
    const [tasks, meetings, kpis, leaves, invoices, payments] = await Promise.all([
      can("tasks") ? tasksStore.list().catch(() => []) : [],
      can("meetings") ? meetingsStore.list().catch(() => []) : [],
      can("kpis") ? kpisStore.list().catch(() => []) : [],
      can("leaves") ? leavesApi.list().catch(() => []) : [],
      can("finance") ? invoicesStore.list().catch(() => []) : [],
      can("finance") ? paymentsStore.list().catch(() => []) : [],
    ]);
    data.current = {
      at: Date.now(),
      scopeKey,
      tasks: tasks.filter((t) => inScope(t.project)),
      // اجتماع بلا مشروع: يظهر لغير العملاء فقط
      meetings: meetings.filter((m) => (m.project ? inScope(m.project) : role !== "client")),
      kpis: kpis.filter((k) => !k.project || inScope(k.project)),
      leaves,
      invoices: invoices.filter((v) => !v.project || inScope(v.project)),
      payments,
    };
    return data.current;
  }, [can, scopeProjects, scopeKey, role]);

  const ctxOf = useCallback((d) => ({
    viewer, role, can, users, scopeProjects,
    projects: (projects || []).filter((p) => !scopeProjects || scopeProjects.includes(p.name)),
    ...d,
  }), [viewer, role, can, users, projects, scopeProjects]);

  // أول فتح: تحية + اقتراحات
  useEffect(() => {
    if (!open || msgs.length) return;
    const first = role === "client" ? "" : (viewer?.name || "").split(" ")[0];
    setMsgs([{
      from: "amal",
      text: `هلا${first ? ` ${first}` : ""} 👋 أنا ${AMAL_NAME}، مساعدتك في النظام. أجاوبك من بيانات المهام والمشاريع والاجتماعات بحسب صلاحياتك. وش تحتاج؟`,
      chips: suggestions({ viewer, role, can }).slice(0, 6),
    }]);
    loadData().catch(() => {});
  }, [open, msgs.length, viewer, role, can, loadData]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // تغيّر المستخدم (تبديل الحساب) → محادثة جديدة
  useEffect(() => { setMsgs([]); data.current = { at: 0, scopeKey: "" }; }, [viewer?.id]);

  async function ask(q) {
    const question = String(q || "").trim();
    if (!question || busy) return;
    setText("");
    setMsgs((m) => [...m, { from: "me", text: question }]);
    setBusy(true);
    try {
      const d = await loadData();
      const reply = answer(question, ctxOf(d));
      setMsgs((m) => [...m, { from: "amal", ...reply }]);
    } catch {
      setMsgs((m) => [...m, { from: "amal", text: "صار خطأ وأنا أقرأ البيانات، جرّب مرة ثانية بعد شوي." }]);
    } finally {
      setBusy(false);
    }
  }

  async function createTask(idx, draft) {
    const payload = {
      activity: "", deliverable: "", progress: 0, on_hold: false, waiting_on: "", blocker: "", approval_status: "",
      status: "Not Started", health: "On Track", chain: [],
      task: draft.task.trim(),
      project: draft.project || "",
      assigned_to: draft.assigned_to || "",
      holder: draft.assigned_to || "",
      due_date: draft.due_date || null,
      priority: draft.priority || "Medium",
      notes: `أُنشئت عبر المساعدة ${AMAL_NAME} بطلب من ${viewer?.name || "مستخدم"}`,
    };
    const rec = await tasksStore.create(payload);
    data.current.at = 0; // أعد تحميل البيانات في السؤال القادم
    setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, action: { ...x.action, done: true } } : x)).concat({
      from: "amal",
      text: "تم إنشاء المهمة ✅",
      items: [taskItem(rec || payload)],
    }));
  }

  function cancelAction(idx) {
    setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, action: { ...x.action, cancelled: true } } : x)).concat({ from: "amal", text: "تمام، ألغيت الطلب." }));
  }

  if (!ready || !viewer) return null;

  return (
    <>
      {!open && (
        <button className="amal-fab" type="button" onClick={() => setOpen(true)} title={`اسأل ${AMAL_NAME}`} aria-label={`فتح المساعدة ${AMAL_NAME}`}>
          <span className="amal-av lg">أ</span>
          <span className="amal-fab-txt">اسأل {AMAL_NAME}</span>
        </button>
      )}
      {open && (
        <div className="amal-panel" role="dialog" aria-label={`المساعدة ${AMAL_NAME}`}>
          <div className="amal-head">
            <span className="amal-av">أ</span>
            <div className="amal-who">
              <b>{AMAL_NAME} <span className="amal-badge">مساعد</span></b>
              <small>تجاوب من بيانات النظام</small>
            </div>
            <button className="amal-x" type="button" onClick={() => { setMsgs([]); data.current.at = 0; }} title="محادثة جديدة">
              <Icon name="plus" size={16} />
            </button>
            <button className="amal-x" type="button" onClick={() => setOpen(false)} title="إغلاق">
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="amal-list" ref={listRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`amal-msg ${m.from}`}>
                {m.text && <div className="amal-bubble">{m.text}</div>}
                {m.items?.length > 0 && (
                  <div className="amal-items">
                    {m.items.map((it, j) => (
                      <Link key={j} href={it.href || "#"} className="amal-item" onClick={() => setOpen(false)}>
                        <div className="amal-item-main">
                          <b>{it.title}</b>
                          {it.sub && <small>{it.sub}</small>}
                        </div>
                        {it.badge && (
                          <span className="amal-tag" style={{ color: it.badge.color, background: `${it.badge.color}14` }}>{it.badge.text}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
                {m.footer && <div className="amal-foot">{m.footer}</div>}
                {m.link && (
                  <Link className="amal-link" href={m.link.href} onClick={() => setOpen(false)}>
                    {m.link.text} <Icon name="arrow" size={13} style={{ transform: "scaleX(-1)" }} />
                  </Link>
                )}
                {m.action?.type === "createTask" && !m.action.done && !m.action.cancelled && (
                  <TaskDraftCard action={m.action} onCreate={(d) => createTask(i, d)} onCancel={() => cancelAction(i)} />
                )}
                {m.chips?.length > 0 && i === msgs.length - 1 && (
                  <div className="amal-chips">
                    {m.chips.map((c) => (
                      <button key={c} type="button" onClick={() => ask(c)}>{c}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="amal-msg amal"><div className="amal-bubble amal-typing"><span /><span /><span /></div></div>}
          </div>

          <form className="amal-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`اسأل ${AMAL_NAME}… مثلاً: وش المتأخر في هوميرا؟`}
            />
            <button className="btn primary" type="submit" disabled={!text.trim() || busy} title="إرسال">
              <Icon name="send" size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function TaskDraftCard({ action, onCreate, onCancel }) {
  const [d, setD] = useState(action.draft);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setD((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!d.task.trim()) { setErr("اكتب عنوان المهمة"); return; }
    setSaving(true);
    setErr("");
    try {
      await onCreate(d);
    } catch (ex) {
      setErr(ex?.message || "تعذّر إنشاء المهمة");
      setSaving(false);
    }
  }

  return (
    <form className="amal-card" onSubmit={submit}>
      <label>عنوان المهمة
        <input value={d.task} onChange={set("task")} placeholder="مثلاً: تصميم بوست اليوم الوطني" autoFocus />
      </label>
      <div className="amal-row">
        <label>المشروع
          <select value={d.project} onChange={set("project")}>
            <option value="">— بدون —</option>
            {action.projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>المسؤول
          <select value={d.assigned_to} onChange={set("assigned_to")}>
            <option value="">— غير محدد —</option>
            {action.users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>
      <div className="amal-row">
        <label>الاستحقاق
          <input type="date" value={d.due_date} onChange={set("due_date")} />
        </label>
        <label>الأولوية
          <select value={d.priority} onChange={set("priority")}>
            {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
      {err && <div className="amal-err">{err}</div>}
      <div className="amal-actions">
        <button className="btn primary sm" type="submit" disabled={saving}>{saving ? "جارٍ الإنشاء…" : "إنشاء"}</button>
        <button className="btn ghost sm" type="button" onClick={onCancel} disabled={saving}>إلغاء</button>
      </div>
    </form>
  );
}
