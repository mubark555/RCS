"use client";

import { useEffect, useMemo, useState } from "react";
import { meetingsStore } from "@/lib/store";
import { useRole, useProjectNames } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import MinutesModal, { exportMinutes } from "@/components/MinutesModal";
import LineList from "@/components/LineList";
import { useNotifications } from "@/components/NotificationsProvider";
import { minutesDocHtml } from "@/components/MinutesModal";
import { parseAttendees, presentOf, MEETING_STATUS, isLocked } from "@/lib/meetings";

const EMPTY = {
  title: "", project: "", start_at: "", duration: 30, location: "",
  attendees: [], links: [], agenda: "", minutes: "", action_items: [], status: "Scheduled",
};

const LINK_TYPES = ["تسجيل", "مستند", "رابط"];

const STATUS_AR = MEETING_STATUS;
const FILTERS = [
  { k: "upcoming", l: "القادمة" },
  { k: "toEnd", l: "تحتاج إنهاء" },
  { k: "Done", l: "بانتظار اعتماد المحضر" },
  { k: "Approved", l: "المحاضر المعتمدة" },
  { k: "all", l: "الكل" },
];

export default function MeetingsPage() {
  const { can, scopeProjects, users, viewer, ability } = useRole();
  const { sendEmail, announce } = useNotifications();
  const readOnly = !can("meetings", "edit");
  const [filter, setFilter] = useState("upcoming");
  const [ending, setEnding] = useState(null);     // اجتماع قيد الإنهاء (كتابة المحضر)
  const [approving, setApproving] = useState(null); // اعتماد المحضر وإرساله
  const canApproveMinutes = (m) => !readOnly && (ability("approveMinutes") || (m.created_by && m.created_by === viewer?.name));
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [minutesOf, setMinutesOf] = useState(null);
  const [q, setQ] = useState("");

  async function reload() {
    setItems(await meetingsStore.list());
  }
  useEffect(() => {
    reload().catch(() => setItems([]));
  }, []);

  const scoped = useMemo(() => {
    if (!items) return [];
    let arr = scopeProjects ? items.filter((m) => scopeProjects.includes(m.project)) : items;
    const s = q.trim().toLowerCase();
    if (s) {
      arr = arr.filter((m) =>
        [m.title, m.project, m.location, m.agenda,
         Array.isArray(m.attendees) ? m.attendees.join(" ") : m.attendees]
          .filter(Boolean).join(" ").toLowerCase().includes(s)
      );
    }
    return arr;
  }, [items, scopeProjects, q]);

  const groups = useMemo(() => {
    const now = new Date().toISOString();
    const g = { upcoming: [], toEnd: [], Done: [], Approved: [], all: [...scoped] };
    for (const m of scoped) {
      const st = m.status || "Scheduled";
      if (st === "Scheduled" && m.start_at >= now) g.upcoming.push(m);
      else if (st === "Scheduled") g.toEnd.push(m); // انقضى موعده ولم يُنهَ بعد
      else if (st === "Done") g.Done.push(m);
      else if (st === "Approved") g.Approved.push(m);
    }
    g.upcoming.sort((a, b) => a.start_at.localeCompare(b.start_at));
    ["toEnd", "Done", "Approved", "all"].forEach((k) => g[k].sort((a, b) => String(b.start_at).localeCompare(String(a.start_at))));
    return g;
  }, [scoped]);
  const shown = groups[filter] || [];

  async function approveAndSend(m, { send }) {
    const at = new Date().toISOString();
    const patch = { status: "Approved", approved_at: at, approved_by: viewer?.name || "" };
    let rec = { ...m, ...patch };
    await meetingsStore.update(m.id, patch, { action: "approve", entity: "" }); // الإعلان أدناه يغني عن إشعار مكرّر
    let result = null;
    if (send) {
      const people = presentOf(m);
      const to = people.map((n) => (users || []).find((u) => u.name === n)?.email).filter(Boolean);
      result = await sendEmail({ to, subject: `محضر اجتماع معتمد: ${m.title}`, html: minutesDocHtml(rec) });
      const mail = result.ok ? { emailed_at: new Date().toISOString(), emailed_count: result.count, email_error: "" } : { email_error: result.error || "فشل الإرسال" };
      await meetingsStore.update(m.id, mail, { action: "update", entity: "" });
      rec = { ...rec, ...mail };
    }
    announce({ title: `اعتُمد محضر «${m.title}»${result?.ok ? ` وأُرسل لـ ${result.count} من الحضور` : ""}`, tone: "success", entity: "اجتماع", action: "approve" });
    await reload();
    return result;
  }

  if (!items) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      <div className="mtg-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", margin: 0 }}>الاجتماعات</h1>
            <span className="cnt-pill">{scoped.length} اجتماع</span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14.5, marginTop: 4 }}>جدولة ومتابعة اجتماعات الفريق والعملاء</p>
        </div>
        {!readOnly && (
          <button className="btn primary" onClick={() => setEditing({})} style={{ padding: "13px 22px", fontSize: 15, borderRadius: 14 }}>+ اجتماع جديد</button>
        )}
      </div>

      <div className="mtg-search">
        <span style={{ color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={18} /></span>
        <input placeholder="ابحث في الاجتماعات…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mtg-filters">
        {FILTERS.map((f) => (
          <button key={f.k} className={filter === f.k ? "on" : ""} onClick={() => setFilter(f.k)}>
            {f.l} <b>{groups[f.k].length}</b>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="mtg-empty">{filter === "upcoming" ? "لا توجد اجتماعات قادمة." : filter === "Approved" ? "لا محاضر معتمدة بعد." : "لا يوجد."}</div>
      ) : (
        <div className="mtg-list">
          {shown.map((m) => (
            <MeetingCard key={m.id} m={m} readOnly={readOnly} canApprove={canApproveMinutes(m)}
              dim={m.status === "Cancelled"}
              onEdit={() => setEditing(m)} onMinutes={() => setMinutesOf(m)} onChange={reload}
              onEnd={() => setEnding(m)} onApprove={() => setApproving(m)} />
          ))}
        </div>
      )}

      {ending && (
        <Modal title="إنهاء الاجتماع وكتابة المحضر" wide onClose={() => setEnding(null)}>
          <MeetingForm initial={ending} users={users} mode="end"
            onCancel={() => setEnding(null)}
            onSave={async (payload) => {
              await meetingsStore.update(ending.id, { ...payload, status: "Done", ended_at: new Date().toISOString(), ended_by: viewer?.name || "" }, { action: "update", entity: "اجتماع" });
              setEnding(null);
              setFilter("Done");
              await reload();
            }} />
        </Modal>
      )}

      {approving && (
        <Modal title="اعتماد المحضر وإرساله" onClose={() => setApproving(null)}>
          <ApproveMinutes m={approving} users={users} onCancel={() => setApproving(null)}
            onConfirm={async (opts) => { const r = await approveAndSend(approving, opts); setFilter("Approved"); return r; }}
            onClose={() => setApproving(null)} />
        </Modal>
      )}

      {minutesOf && (
        <MinutesModal
          meeting={minutesOf}
          readOnly={readOnly}
          onClose={() => setMinutesOf(null)}
          onUpdated={reload}
          onEdit={(m) => { setMinutesOf(null); setEditing(m); }}
        />
      )}

      {editing && (
        <Modal title={editing.id ? "تعديل الاجتماع" : "اجتماع جديد"} onClose={() => setEditing(null)}>
          <MeetingForm
            initial={editing.id ? editing : null}
            users={users}
            onCancel={() => setEditing(null)}
            onSave={async (payload) => {
              if (editing.id) await meetingsStore.update(editing.id, payload);
              else await meetingsStore.create({ ...payload, created_by: viewer?.name || "" });
              setEditing(null);
              await reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function MeetingCard({ m, onEdit, onMinutes, onChange, onEnd, onApprove, canApprove, dim, readOnly }) {
  const st = STATUS_AR[m.status] || STATUS_AR.Scheduled;
  const locked = isLocked(m);
  const past = m.start_at && m.start_at < new Date().toISOString();
  const dt = m.start_at ? new Date(m.start_at) : null;
  const dateStr = dt
    ? dt.toLocaleString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const attendees = parseAttendees(m.attendees);
  const links = Array.isArray(m.links) ? m.links : [];
  const agendaPreview = (m.agenda || "").split("\n").filter(Boolean).join(" · ");
  const metaBits = [dateStr, `${m.duration} دقيقة`, m.project, m.location].filter(Boolean);

  async function del() {
    if (!confirm(`حذف الاجتماع؟\n\n${m.title}`)) return;
    await meetingsStore.remove(m.id);
    await onChange();
  }

  return (
    <div className={`mtg-card${dim ? " dim" : ""}`}>
      <div className="row">
        <div className="mtg-icon"><Icon name="calendar" size={26} /></div>
        <div className="mtg-body">
          <div className="t">
            <h3>{m.title}</h3>
            <span className="st" style={{ background: `${st.color}1e`, color: st.color }}>{st.short || st.ar}</span>
          </div>
          {m.status !== "Cancelled" && <Lifecycle m={m} />}
          <div className="mtg-meta">{metaBits.join(" · ")}</div>
          {attendees.length > 0 && (
            <div className="mtg-att"><b>الحضور:</b> {attendees.join("، ")}</div>
          )}
          {agendaPreview && <div className="mtg-agenda">{agendaPreview}</div>}
          <div className="mtg-actions">
            {!readOnly && (m.status || "Scheduled") === "Scheduled" && (
              <button className={`mtg-btn go${past ? " pulse" : ""}`} onClick={onEnd}>
                <Icon name="stop" size={14} /> إنهاء الاجتماع
              </button>
            )}
            {m.status === "Done" && canApprove && (
              <button className="mtg-btn go" onClick={onApprove}>
                <Icon name="shield" size={15} /> اعتماد وإرسال للحضور
              </button>
            )}
            <button className="mtg-btn pri" onClick={onMinutes}>
              <Icon name="file" size={15} /> {m.minutes ? "عرض المحضر" : "المحضر"}
            </button>
            <button className="mtg-btn neutral" onClick={() => exportMinutes(m)}>
              <Icon name="upload" size={15} /> تصدير
            </button>
            {links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" className="mtg-btn pri">
                <Icon name="link" size={15} /> {l.label || l.type || "رابط"}
              </a>
            ))}
          </div>
        </div>
        {!readOnly && !locked && (
          <div className="mtg-side">
            <button className="mtg-ib" onClick={onEdit} title="تعديل"><Icon name="edit" size={16} /></button>
            <button className="mtg-ib del" onClick={del} title="حذف"><Icon name="trash" size={16} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingForm({ initial, users, onSave, onCancel, mode }) {
  const projectNames = useProjectNames();
  const ending = mode === "end";
  const [f, setF] = useState(() => {
    const att = parseAttendees(initial?.attendees);
    return {
      ...EMPTY,
      ...(initial || {}),
      attendees: att,
      present: Array.isArray(initial?.present) && initial.present.length ? initial.present : att,
      links: Array.isArray(initial?.links) ? initial.links : [],
    };
  });
  const togglePresent = (name) =>
    setF((s) => ({ ...s, present: s.present.includes(name) ? s.present.filter((x) => x !== name) : [...s.present, name] }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const toggleAtt = (name) =>
    setF((s) => ({ ...s, attendees: s.attendees.includes(name) ? s.attendees.filter((x) => x !== name) : [...s.attendees, name] }));

  const addLink = () => setF((s) => ({ ...s, links: [...s.links, { type: "تسجيل", label: "", url: "" }] }));
  const setLink = (i, k, v) => setF((s) => ({ ...s, links: s.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const rmLink = (i) => setF((s) => ({ ...s, links: s.links.filter((_, j) => j !== i) }));

  const ai = Array.isArray(f.action_items) ? f.action_items : [];
  const addAI = (kind = "action") => setF((s) => ({ ...s, action_items: [...ai, { kind, text: "", assignee: "", due: "" }] }));
  const setAI = (i, k, v) => setF((s) => ({ ...s, action_items: ai.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const rmAI = (i) => setF((s) => ({ ...s, action_items: ai.filter((_, j) => j !== i) }));

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.start_at) return;
    setSaving(true);
    try {
      await onSave({
        ...f,
        duration: Number(f.duration) || 30,
        links: f.links.filter((l) => l.url),
        action_items: ai.filter((a) => a.text && a.text.trim()),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {ending && (
        <div className="mm-endhead">
          <b>{f.title}</b>
          <small>دوّن ما دار في الاجتماع: من حضر، أهم النقاط، القرارات، وإجراءات المتابعة. بعد الحفظ يصبح الاجتماع «منتهي» بانتظار اعتماد المحضر.</small>
        </div>
      )}
      <div className="form-grid">
        {ending && (
          <div className="field full">
            <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>من حضر فعلياً؟ (اضغط لإلغاء من لم يحضر)</span>
            <div className="attendee-picker">
              {[...new Set([...f.attendees, ...users.map((u) => u.name)])].map((n) => (
                <span key={n} className={`att-chip ${f.present.includes(n) ? "on" : ""}`} onClick={() => togglePresent(n)}>{n}</span>
              ))}
            </div>
          </div>
        )}
        {!ending && <>
        <label className="field full"><span>عنوان الاجتماع *</span><input value={f.title} onChange={set("title")} required /></label>
        <label className="field">
          <span>المشروع</span>
          <select value={f.project} onChange={set("project")}>
            <option value="">—</option>
            {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field"><span>الحالة</span>
          <select value={f.status} onChange={set("status")}>
            <option value="Scheduled">مجدول</option>
            {f.status === "Done" && <option value="Done">منتهي</option>}
            <option value="Cancelled">ملغى</option>
          </select>
        </label>
        <label className="field"><span>التاريخ والوقت *</span>
          <input type="datetime-local" value={toLocalInput(f.start_at)} onChange={(e) => setF((s) => ({ ...s, start_at: fromLocalInput(e.target.value) }))} required />
        </label>
        <label className="field"><span>المدة (دقيقة)</span><input type="number" min={5} step={5} value={f.duration} onChange={set("duration")} /></label>
        <label className="field full"><span>المكان / رابط الاجتماع</span><input value={f.location} onChange={set("location")} placeholder="Google Meet / Zoom / مكتب…" /></label>

        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>
            الحضور (اختر من المستخدمين)
          </span>
          <div className="attendee-picker">
            {users.length === 0 ? (
              <span className="muted" style={{ fontSize: 12.5 }}>لا مستخدمون بعد — أضِفهم من قسم الفريق.</span>
            ) : (
              users.map((u) => (
                <span key={u.id} className={`att-chip ${f.attendees.includes(u.name) ? "on" : ""}`} onClick={() => toggleAtt(u.name)}>
                  {u.name}
                </span>
              ))
            )}
          </div>
        </div>

        </>}
        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>جدول الأعمال</span>
          <LineList value={f.agenda} onChange={(v) => setF((s) => ({ ...s, agenda: v }))} placeholder="النقطة المطروحة للنقاش…" />
        </div>
        <div className="field full">
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>محضر الاجتماع (يُكتب هنا ويُصدَّر لاحقاً)</span>
          <LineList value={f.minutes} onChange={(v) => setF((s) => ({ ...s, minutes: v }))} placeholder="أهم النقاط والمخرجات…" />
        </div>

        <div className="field full">
          <span style={{ display: "flex", alignItems: "center", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>
            القرارات وإجراءات المتابعة
            <span style={{ marginInlineStart: "auto", display: "flex", gap: 6 }}>
              <button type="button" className="btn sm ghost" onClick={() => addAI("decision")}>+ قرار</button>
              <button type="button" className="btn sm ghost" onClick={() => addAI("action")}>+ إجراء متابعة</button>
            </span>
          </span>
          <p className="muted" style={{ fontSize: 11.5, margin: "0 0 8px" }}>القرار يُوثَّق في المحضر، وإجراء المتابعة يتحوّل إلى مهمة مرتبطة بالمحضر (بمسؤول وموعد).</p>
          {ai.map((a, i) => (
            <div key={i} className="ai-row">
              <div className="cs-toggle" style={{ flex: "none" }}>
                <button type="button" className={(a.kind || "action") === "decision" ? "on" : ""} onClick={() => setAI(i, "kind", "decision")}>قرار</button>
                <button type="button" className={(a.kind || "action") === "action" ? "on" : ""} onClick={() => setAI(i, "kind", "action")}>إجراء</button>
              </div>
              <input placeholder={(a.kind || "action") === "decision" ? "نص القرار" : "إجراء المتابعة"} value={a.text} onChange={(e) => setAI(i, "text", e.target.value)} style={{ flex: 2, minWidth: 160 }} />
              <select value={a.assignee} onChange={(e) => setAI(i, "assignee", e.target.value)} style={{ flex: 1, minWidth: 110 }}>
                <option value="">المسؤول…</option>
                {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
              <input type="date" value={a.due || ""} onChange={(e) => setAI(i, "due", e.target.value)} style={{ width: 150 }} />
              <button type="button" className="btn sm danger icon" onClick={() => rmAI(i)}><Icon name="close" size={14} /></button>
            </div>
          ))}
        </div>

        <div className="field full">
          <span style={{ display: "flex", alignItems: "center", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>
            المرفقات والروابط (اختيارية — تسجيل / مستند)
            <button type="button" className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={addLink}>+ إضافة رابط</button>
          </span>
          {f.links.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select value={l.type} onChange={(e) => setLink(i, "type", e.target.value)} style={{ width: 120 }}>
                {LINK_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <input placeholder="الوصف" value={l.label} onChange={(e) => setLink(i, "label", e.target.value)} />
              <input placeholder="https://…" value={l.url} onChange={(e) => setLink(i, "url", e.target.value)} />
              <button type="button" className="btn sm danger icon" onClick={() => rmLink(i)}><Icon name="close" size={14} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "جاري الحفظ…" : ending ? "إنهاء الاجتماع وحفظ المحضر" : "حفظ"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

// مراحل الاجتماع على البطاقة
function Lifecycle({ m }) {
  const step = MEETING_STATUS[m.status || "Scheduled"]?.step ?? 0;
  const steps = ["مجدول", "انتهى + المحضر", "اعتُمد وأُرسل"];
  return (
    <div className="mtg-life">
      {steps.map((l, i) => (
        <span key={l} className={i < step ? "done" : i === step ? "cur" : ""}>
          <i>{i < step ? "✓" : i + 1}</i>{l}
        </span>
      ))}
    </div>
  );
}

// نافذة اعتماد المحضر: من سيصله البريد + إرسال
function ApproveMinutes({ m, users, onConfirm, onCancel, onClose }) {
  const people = presentOf(m);
  const rows = people.map((n) => ({ n, email: (users || []).find((u) => u.name === n)?.email || "" }));
  const withEmail = rows.filter((r) => r.email).length;
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const minutesCount = String(m.minutes || "").split("\n").filter((x) => x.trim()).length;

  if (result) {
    return (
      <div style={{ textAlign: "center", padding: "6px 0" }}>
        <div className="mm-done" style={{ background: result.ok || !send ? "#e6f5ec" : "#fdf3e2", color: result.ok || !send ? "#16a34a" : "#b45309" }}>
          <Icon name={result.ok || !send ? "check" : "alert"} size={30} />
        </div>
        <h3 style={{ margin: "10px 0 4px" }}>تم اعتماد المحضر</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          {!send ? "حُفظ ضمن المحاضر المعتمدة بدون إرسال بريد." : result.ok ? `أُرسل بالبريد إلى ${result.count} من الحضور، وحُفظ ضمن المحاضر المعتمدة.` : `حُفظ ضمن المحاضر المعتمدة، لكن تعذّر إرسال البريد: ${result.error}`}
        </p>
        <div className="modal-actions" style={{ justifyContent: "center" }}><button className="btn primary" onClick={onClose}>تم</button></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mm-endhead">
        <b>{m.title}</b>
        <small>{minutesCount} نقطة في المحضر · {(m.action_items || []).length} قرار/إجراء · بعد الاعتماد يُقفل المحضر من التعديل.</small>
      </div>
      <div className="mm-recips">
        {rows.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>لا حضور مسجّل.</div> : rows.map((r) => (
          <div key={r.n} className="mm-recip">
            <span className="av">{r.n.slice(0, 1)}</span>
            <b>{r.n}</b>
            {r.email ? <small dir="ltr">{r.email}</small> : <small style={{ color: "#c88a2e" }}>لا يوجد بريد</small>}
          </div>
        ))}
      </div>
      <label className="hold-check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
        <span>إرسال المحضر المعتمد بالبريد لجميع الحضور ({withEmail})</span>
      </label>
      <div className="modal-actions">
        <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { const r = await onConfirm({ send: send && withEmail > 0 }); setResult(r || { ok: true, count: 0 }); if (!(send && withEmail > 0)) setSend(false); }
          finally { setBusy(false); }
        }}>
          <Icon name="shield" size={15} /> {busy ? "جاري الاعتماد…" : send && withEmail ? "اعتماد وإرسال" : "اعتماد"}
        </button>
        <button className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return "";
  return new Date(v).toISOString();
}
