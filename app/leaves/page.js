"use client";

import { useMemo, useState } from "react";
import { useRole } from "@/components/RoleProvider";
import { useNotifications } from "@/components/NotificationsProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import {
  useLeaves, leavesApi, LEAVE_TYPES, LEAVE_STATUS, leaveDays, awayOn, upcomingLeaves, ymd,
} from "@/lib/leaves";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const fmt = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? s : `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const range = (l) => (l.start === l.end ? fmt(l.start) : `${fmt(l.start)} – ${fmt(l.end)}`);

export default function LeavesPage() {
  const { viewer, users, can, ability } = useRole();
  const { announce } = useNotifications();
  const { leaves, loaded, reload } = useLeaves();
  const [form, setForm] = useState(null);
  const [decide, setDecide] = useState(null); // { leave, approve }
  const [filter, setFilter] = useState("all");

  const canRequest = can("leaves", "edit");
  const canApprove = ability("approveLeaves");
  const me = viewer?.name || "";
  const today = ymd();

  const teamEmails = useMemo(() => (users || []).filter((u) => u.role !== "client" && u.status !== "suspended").map((u) => u.email).filter(Boolean), [users]);
  const approverEmails = useMemo(() => (users || []).filter((u) => u.role === "manager").map((u) => u.email).filter(Boolean), [users]);

  const away = awayOn(leaves, today);
  const upcoming = upcomingLeaves(leaves, 21);
  const pending = leaves.filter((l) => l.status === "pending");
  const mine = leaves.filter((l) => l.person === me);
  const shown = leaves
    .filter((l) => filter === "all" || l.status === filter)
    .sort((a, b) => String(b.start).localeCompare(String(a.start)));

  async function submit(f) {
    const self = f.person === me;
    const autoApprove = canApprove && !self; // تسجيل المدير نيابة عن شخص = معتمد مباشرة
    const rec = await leavesApi.create({
      person: f.person, type: f.type, start: f.start, end: f.end < f.start ? f.start : f.end, note: f.note || "",
      requested_by: me, ...(autoApprove ? { status: "approved", decided_by: me, decided_at: new Date().toISOString() } : {}),
    });
    setForm(null);
    await reload();
    const t = LEAVE_TYPES[rec.type]?.ar || "إجازة";
    if (autoApprove) {
      announce({ title: `${rec.person} في ${t} (${range(rec)})`, tone: "info", entity: "إجازة", action: "create", emailTo: teamEmails, emailBody: `للعلم: ${rec.person} في ${t} من ${rec.start} إلى ${rec.end}.${rec.note ? `\nملاحظة: ${rec.note}` : ""}`, path: "/leaves" });
    } else {
      announce({ title: `طلب ${t} جديد من ${rec.person}`, tone: "info", entity: "إجازة", action: "create", emailTo: approverEmails, emailBody: `قدّم ${rec.person} طلب ${t} من ${rec.start} إلى ${rec.end} (${leaveDays(rec)} يوم).${rec.note ? `\nالسبب: ${rec.note}` : ""}\n\nافتح قسم «الإجازات» للموافقة أو الرفض.`, path: "/leaves" });
    }
  }

  async function applyDecision(l, approve, note) {
    const upd = await leavesApi.update(l.id, { status: approve ? "approved" : "rejected", decided_by: me, decided_at: new Date().toISOString(), decision_note: note || "" });
    setDecide(null);
    await reload();
    const t = LEAVE_TYPES[l.type]?.ar || "إجازة";
    const requester = (users || []).find((u) => u.name === l.person)?.email;
    if (approve) {
      announce({
        title: `تمت الموافقة: ${l.person} في ${t} (${range(l)})`, tone: "success", entity: "إجازة", action: "approve",
        emailTo: [...teamEmails, requester].filter(Boolean),
        emailBody: `تمت الموافقة على ${t} لـ ${l.person} من ${l.start} إلى ${l.end}.\nنرجو مراعاة ذلك في توزيع المهام والمتابعة.${note ? `\nملاحظة: ${note}` : ""}`, path: "/leaves",
      });
    } else {
      announce({ title: `رُفض طلب ${t} لـ ${l.person}`, tone: "danger", entity: "إجازة", action: "revision", emailTo: requester ? [requester] : null, emailBody: `نعتذر، لم تتم الموافقة على طلب ${t} من ${l.start} إلى ${l.end}.${note ? `\nالسبب: ${note}` : ""}`, path: "/leaves" });
    }
    return upd;
  }

  async function cancel(l) {
    if (!confirm("إلغاء طلب الإجازة؟")) return;
    await leavesApi.update(l.id, { status: "cancelled" });
    await reload();
  }
  async function del(l) {
    if (!confirm("حذف السجل نهائياً؟")) return;
    await leavesApi.remove(l.id);
    await reload();
  }

  if (!loaded) return <div className="empty">جاري التحميل…</div>;

  return (
    <div className="lv">
      <div className="mtg-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", margin: 0 }}>الإجازات والغياب</h1>
            {pending.length > 0 && canApprove && <span className="cnt-pill">{pending.length} بانتظار الموافقة</span>}
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14.5, marginTop: 4 }}>طلبات الإجازة المرضية والأوف، والموافقة عليها، ومن غائب اليوم</p>
        </div>
        {canRequest && (
          <button className="btn primary" style={{ padding: "13px 22px", fontSize: 15, borderRadius: 14 }}
            onClick={() => setForm({ person: me, type: "sick", start: today, end: today, note: "" })}>
            + طلب إجازة
          </button>
        )}
      </div>

      <div className="lv-top">
        <div className="card lv-today">
          <div className="section-title"><span>غائبون اليوم</span><span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmt(today)}</span></div>
          {away.length === 0 ? (
            <div className="lv-allin"><Icon name="check" size={20} /> الفريق كامل اليوم</div>
          ) : (
            <div className="lv-people">
              {away.map((l) => {
                const tp = LEAVE_TYPES[l.type] || LEAVE_TYPES.other;
                return (
                  <div className="lv-person" key={l.id}>
                    <span className="av" style={{ background: tp.bg, color: tp.color }}>{tp.emoji}</span>
                    <div><b>{l.person}</b><small style={{ color: tp.color }}>{tp.ar} · يعود {fmt(nextDay(l.end))}</small></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="card lv-today">
          <div className="section-title"><span>إجازات قادمة</span><span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>خلال 3 أسابيع</span></div>
          {upcoming.length === 0 ? <div className="muted" style={{ fontSize: 13, padding: "10px 0" }}>لا إجازات قادمة</div> : (
            <div className="lv-people">
              {upcoming.map((l) => {
                const tp = LEAVE_TYPES[l.type] || LEAVE_TYPES.other;
                return (
                  <div className="lv-person" key={l.id}>
                    <span className="av" style={{ background: tp.bg, color: tp.color }}>{tp.emoji}</span>
                    <div><b>{l.person}</b><small>{tp.short} · {range(l)}</small></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {canApprove && pending.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-title"><span>بانتظار موافقتك ({pending.length})</span></div>
          <div className="lv-list">
            {pending.map((l) => (
              <LeaveRow key={l.id} l={l}>
                <button className="btn sm primary" onClick={() => setDecide({ leave: l, approve: true })}><Icon name="check" size={14} /> موافقة</button>
                <button className="btn sm danger" onClick={() => setDecide({ leave: l, approve: false })}>رفض</button>
              </LeaveRow>
            ))}
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-title"><span>طلباتي</span></div>
          <div className="lv-list">
            {mine.slice(0, 8).map((l) => (
              <LeaveRow key={l.id} l={l}>
                {l.status === "pending" && <button className="btn sm ghost" onClick={() => cancel(l)}>إلغاء الطلب</button>}
              </LeaveRow>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span>سجل الإجازات</span>
          <div className="seg sm">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>الكل</button>
            {Object.entries(LEAVE_STATUS).map(([k, v]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{v.ar}</button>)}
          </div>
        </div>
        {shown.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا سجلات.</div> : (
          <div className="lv-list">
            {shown.map((l) => (
              <LeaveRow key={l.id} l={l}>
                {canApprove && <button className="btn sm ghost icon" title="حذف" onClick={() => del(l)}><Icon name="trash" size={14} /></button>}
              </LeaveRow>
            ))}
          </div>
        )}
      </div>

      {form && (
        <Modal title="طلب إجازة" onClose={() => setForm(null)}>
          <LeaveForm initial={form} people={canApprove ? (users || []).filter((u) => u.role !== "client").map((u) => u.name) : [me]} onCancel={() => setForm(null)} onSave={submit} />
        </Modal>
      )}
      {decide && (
        <Modal title={decide.approve ? "الموافقة على الإجازة" : "رفض الإجازة"} onClose={() => setDecide(null)}>
          <DecisionForm d={decide} onCancel={() => setDecide(null)} onSave={(note) => applyDecision(decide.leave, decide.approve, note)} />
        </Modal>
      )}
    </div>
  );
}

function nextDay(s) {
  const d = new Date(s);
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

function LeaveRow({ l, children }) {
  const tp = LEAVE_TYPES[l.type] || LEAVE_TYPES.other;
  const st = LEAVE_STATUS[l.status] || LEAVE_STATUS.pending;
  return (
    <div className="lv-row">
      <span className="lv-ic" style={{ background: tp.bg, color: tp.color }}>{tp.emoji}</span>
      <div className="lv-body">
        <b>{l.person} <span style={{ color: tp.color, fontWeight: 700 }}>· {tp.ar}</span></b>
        <small>{range(l)} · {leaveDays(l)} {leaveDays(l) === 1 ? "يوم" : "أيام"}{l.note ? ` · ${l.note}` : ""}</small>
        {(l.decided_by || l.decision_note) && <small className="muted">{l.status === "approved" ? "وافق" : l.status === "rejected" ? "رفض" : "قرار"}: {l.decided_by || "—"}{l.decision_note ? ` — ${l.decision_note}` : ""}</small>}
      </div>
      <span className="lv-st" style={{ background: st.bg, color: st.color }}>{st.ar}</span>
      <div className="lv-acts">{children}</div>
    </div>
  );
}

function LeaveForm({ initial, people, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { await onSave(f); } finally { setBusy(false); }
  }
  const days = leaveDays({ start: f.start, end: f.end < f.start ? f.start : f.end });
  return (
    <form onSubmit={submit}>
      <div className="lv-types">
        {Object.entries(LEAVE_TYPES).map(([k, v]) => (
          <button type="button" key={k} className={f.type === k ? "on" : ""} style={f.type === k ? { borderColor: v.color, background: v.bg, color: v.color } : undefined} onClick={() => setF((s) => ({ ...s, type: k }))}>
            <span>{v.emoji}</span>{v.short}
          </button>
        ))}
      </div>
      <div className="form-grid">
        {people.length > 1 && (
          <label className="field full">
            <span>الموظف</span>
            <select value={f.person} onChange={set("person")}>{people.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
        )}
        <label className="field"><span>من</span><input type="date" value={f.start} onChange={set("start")} required /></label>
        <label className="field"><span>إلى</span><input type="date" value={f.end} min={f.start} onChange={set("end")} required /></label>
        <label className="field full"><span>السبب / ملاحظة (اختياري)</span><textarea rows={2} value={f.note} onChange={set("note")} placeholder="مثال: مراجعة طبية" /></label>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>المدة: <b>{days} {days === 1 ? "يوم" : "أيام"}</b> · يصل الطلب للمدير للموافقة، وبعدها يعرف الفريق تلقائياً.</div>
      <div className="modal-actions">
        <button className="btn primary" disabled={busy}>{busy ? "جاري الإرسال…" : "إرسال الطلب"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function DecisionForm({ d, onSave, onCancel }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const l = d.leave;
  const tp = LEAVE_TYPES[l.type] || LEAVE_TYPES.other;
  return (
    <div>
      <div className="lv-row" style={{ border: "1px solid var(--border)", borderRadius: 12 }}>
        <span className="lv-ic" style={{ background: tp.bg, color: tp.color }}>{tp.emoji}</span>
        <div className="lv-body"><b>{l.person} · {tp.ar}</b><small>{range(l)} · {leaveDays(l)} يوم{l.note ? ` · ${l.note}` : ""}</small></div>
      </div>
      <label className="field" style={{ marginTop: 12, display: "block" }}>
        <span>{d.approve ? "ملاحظة للفريق (اختياري)" : "سبب الرفض"}</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {d.approve && <div className="muted" style={{ fontSize: 12.5 }}>سيصل إشعار للفريق، ويظهر الموظف «في إجازة» في الفريق والرئيسية، وعند عودته يُستقبل بـ «الحمد لله على السلامة».</div>}
      <div className="modal-actions">
        <button className={`btn ${d.approve ? "primary" : "danger"}`} disabled={busy} onClick={async () => { setBusy(true); try { await onSave(note); } finally { setBusy(false); } }}>
          {d.approve ? "تأكيد الموافقة" : "تأكيد الرفض"}
        </button>
        <button className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}
