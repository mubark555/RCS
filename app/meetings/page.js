"use client";

import { useEffect, useMemo, useState } from "react";
import { meetingsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import MinutesModal, { exportMinutes } from "@/components/MinutesModal";
import LineList from "@/components/LineList";
import { PROJECTS, DATE_LOCALE } from "@/lib/constants";
import { RECURRENCE_OPTIONS, MAX_OCCURRENCES, generateOccurrences, describeRule } from "@/lib/recurrence";

const EMPTY = {
  title: "", project: "", start_at: "", duration: 30, location: "",
  attendees: [], links: [], agenda: "", minutes: "", action_items: [], status: "Scheduled",
  recurrence: "none", recurrence_end: null, series_id: null,
};

const DEFAULT_END = { endType: "count", count: 10, until: "" };

// الحقول المشتركة بين مواعيد السلسلة (لا تشمل المحضر والقرارات والحالة الخاصة بكل موعد)
const SHARED_FIELDS = ["title", "project", "duration", "location", "attendees", "agenda", "links"];

const newSeriesId = () => `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const LINK_TYPES = ["تسجيل", "مستند", "رابط"];

const STATUS_AR = {
  Scheduled: { ar: "مجدول", color: "#2563eb" },
  Done: { ar: "منتهي", color: "#16a34a" },
  Cancelled: { ar: "ملغى", color: "#dc2626" },
};

export default function MeetingsPage() {
  const { readOnly, scopeProjects, users } = useRole();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [minutesOf, setMinutesOf] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  async function reload() {
    setItems(await meetingsStore.list());
  }
  useEffect(() => {
    reload().catch(() => setItems([]));
  }, []);

  const scoped = useMemo(() => {
    if (!items) return [];
    return scopeProjects ? items.filter((m) => scopeProjects.includes(m.project)) : items;
  }, [items, scopeProjects]);

  const { upcoming, past } = useMemo(() => {
    const now = new Date().toISOString();
    const up = [], pa = [];
    for (const m of scoped) {
      if (m.status !== "Cancelled" && m.start_at >= now) up.push(m);
      else pa.push(m);
    }
    up.sort((a, b) => a.start_at.localeCompare(b.start_at));
    pa.sort((a, b) => b.start_at.localeCompare(a.start_at));
    return { upcoming: up, past: pa };
  }, [scoped]);

  // عدد المواعيد القادمة لكل سلسلة، وعرض أقرب موعد فقط افتراضياً
  const { upcomingShown, seriesLeft } = useMemo(() => {
    const left = {};
    for (const m of upcoming) if (m.series_id) left[m.series_id] = (left[m.series_id] || 0) + 1;
    if (showAllUpcoming) return { upcomingShown: upcoming, seriesLeft: left };
    const seen = new Set();
    const shown = upcoming.filter((m) => {
      if (!m.series_id) return true;
      if (seen.has(m.series_id)) return false;
      seen.add(m.series_id);
      return true;
    });
    return { upcomingShown: shown, seriesLeft: left };
  }, [upcoming, showAllUpcoming]);
  const hiddenCount = upcoming.length - upcomingShown.length;

  const seriesOf = (m) => (m.series_id ? (items || []).filter((x) => x.series_id === m.series_id) : [m]);

  async function saveMeeting(payload, { scope, rule }) {
    const orig = editing?.id ? editing : null;
    const freq = rule?.freq || "none";

    // إنشاء جديد، أو تحويل اجتماع منفرد إلى متكرر
    if (!orig || (!orig.series_id && freq !== "none")) {
      const dates = generateOccurrences(payload.start_at, rule);
      if (dates.length <= 1 && freq === "none") {
        const base = { ...payload, recurrence: "none", recurrence_end: null, series_id: null };
        if (orig) await meetingsStore.update(orig.id, base);
        else await meetingsStore.create(base);
        return;
      }
      const series_id = newSeriesId();
      const recurrence_end = { endType: rule.endType, count: Number(rule.count) || 0, until: rule.until || "" };
      const common = { ...payload, series_id, recurrence: freq, recurrence_end };
      const [first, ...rest] = dates;
      if (orig) await meetingsStore.update(orig.id, { ...common, start_at: first });
      else await meetingsStore.create({ ...common, start_at: first });
      // المواعيد التالية تبدأ بلا محضر ولا قرارات وبحالة "مجدول"
      await meetingsStore.createMany(rest.map((d) => ({ ...common, start_at: d, minutes: "", action_items: [], status: "Scheduled" })));
      return;
    }

    // تعديل اجتماع منفرد، أو موعد واحد فقط من سلسلة
    if (!orig.series_id || scope === "one") {
      await meetingsStore.update(orig.id, payload);
      return;
    }

    // تعديل هذا الموعد وما بعده في السلسلة: الحقول المشتركة + إزاحة الوقت بنفس الفارق
    const delta = new Date(payload.start_at) - new Date(orig.start_at);
    const shared = Object.fromEntries(SHARED_FIELDS.map((k) => [k, payload[k]]));
    const following = seriesOf(orig).filter((x) => x.id !== orig.id && x.start_at >= orig.start_at);
    await meetingsStore.update(orig.id, payload);
    for (const x of following) {
      const patch = { ...shared };
      if (delta) patch.start_at = new Date(new Date(x.start_at).getTime() + delta).toISOString();
      await meetingsStore.update(x.id, patch);
    }
  }

  async function deleteMeeting(m, scope) {
    let targets = [m];
    if (scope === "following") targets = seriesOf(m).filter((x) => x.start_at >= m.start_at);
    else if (scope === "all") targets = seriesOf(m);
    for (const x of targets) await meetingsStore.remove(x.id);
    setDeleting(null);
    await reload();
  }

  function askDelete(m) {
    if (m.series_id && seriesOf(m).length > 1) { setDeleting(m); return; }
    if (confirm(`حذف الاجتماع؟\n\n${m.title}`)) deleteMeeting(m, "one");
  }

  if (!items) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span className="pill" style={{ fontSize: 13, padding: "6px 12px" }}>{scoped.length} اجتماع</span>
        <div style={{ marginInlineStart: "auto" }} />
        {!readOnly && <button className="btn primary" onClick={() => setEditing({})}>+ اجتماع جديد</button>}
      </div>

      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        القادمة ({upcoming.length})
        {(hiddenCount > 0 || showAllUpcoming) && Object.keys(seriesLeft).length > 0 && (
          <button className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={() => setShowAllUpcoming((v) => !v)}>
            {showAllUpcoming ? "إظهار أقرب موعد لكل سلسلة فقط" : `عرض كل المواعيد المتكررة (+${hiddenCount})`}
          </button>
        )}
      </div>
      {upcoming.length === 0 ? (
        <div className="empty">لا توجد اجتماعات قادمة.</div>
      ) : (
        upcomingShown.map((m) => (
          <MeetingCard key={m.id} m={m} readOnly={readOnly} remaining={showAllUpcoming ? 0 : seriesLeft[m.series_id]}
            onEdit={() => setEditing(m)} onMinutes={() => setMinutesOf(m)} onDelete={() => askDelete(m)} />
        ))
      )}

      {past.length > 0 && (
        <>
          <div className="section-title">السابقة / المنتهية ({past.length})</div>
          {past.map((m) => <MeetingCard key={m.id} m={m} readOnly={readOnly} onEdit={() => setEditing(m)} onMinutes={() => setMinutesOf(m)} onDelete={() => askDelete(m)} dim />)}
        </>
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
            seriesCount={editing.id ? seriesOf(editing).length : 0}
            users={users}
            onCancel={() => setEditing(null)}
            onSave={async (payload, opts) => {
              await saveMeeting(payload, opts);
              setEditing(null);
              await reload();
            }}
          />
        </Modal>
      )}

      {deleting && (
        <Modal title="حذف اجتماع متكرر" onClose={() => setDeleting(null)}>
          <p style={{ marginTop: 0 }}>«{deleting.title}» جزء من سلسلة متكررة ({describeRule(deleting)}). ماذا تريد أن تحذف؟</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn" onClick={() => deleteMeeting(deleting, "one")}>هذا الموعد فقط</button>
            <button className="btn" onClick={() => deleteMeeting(deleting, "following")}>هذا الموعد وكل ما بعده</button>
            <button className="btn danger" onClick={() => deleteMeeting(deleting, "all")}>كل مواعيد السلسلة ({seriesOf(deleting).length})</button>
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setDeleting(null)}>إلغاء</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MeetingCard({ m, onEdit, onMinutes, onDelete, dim, readOnly, remaining }) {
  const st = STATUS_AR[m.status] || STATUS_AR.Scheduled;
  const dt = m.start_at ? new Date(m.start_at) : null;
  const dateStr = dt
    ? dt.toLocaleString(DATE_LOCALE, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const attendees = Array.isArray(m.attendees) ? m.attendees : (m.attendees ? String(m.attendees).split(",").map((x) => x.trim()) : []);
  const links = Array.isArray(m.links) ? m.links : [];

  const rule = describeRule(m);

  return (
    <div className="list-card" style={dim ? { opacity: 0.7 } : undefined}>
      <div className="ic" style={{ color: "var(--primary)" }}><Icon name="calendar" size={22} /></div>
      <div className="body">
        <h4>
          {m.title}
          <span className="badge" style={{ background: `${st.color}22`, color: st.color }}>{st.ar}</span>
          {rule && (
            <span className="badge" style={{ background: "#7c3aed1a", color: "#7c3aed" }} title="اجتماع متكرر">
              ↻ {rule}{remaining > 1 ? ` · ${remaining} مواعيد قادمة` : ""}
            </span>
          )}
        </h4>
        <div className="meta">
          <span>{dateStr}</span>
          <span>{m.duration} دقيقة</span>
          {m.project && <span>{m.project}</span>}
          {m.location && <span>{m.location}</span>}
        </div>
        {attendees.length > 0 && (
          <div className="meta" style={{ marginTop: 6 }}>الحضور: {attendees.join("، ")}</div>
        )}
        {m.agenda && <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-2)" }}>{m.agenda}</div>}
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button className="pill" onClick={onMinutes} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, color: m.minutes ? "var(--primary)" : "var(--text-2)", borderColor: m.minutes ? "#f3cfc9" : "var(--border)" }}>
            <Icon name="file" size={13} /> {m.minutes ? "عرض المحضر" : "المحضر"}
          </button>
          <button className="pill" onClick={() => exportMinutes(m)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="upload" size={13} /> تصدير
          </button>
          {links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer" className="pill" style={{ color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="link" size={13} /> {l.label || l.type || "رابط"}
            </a>
          ))}
        </div>
      </div>
      {!readOnly && (
        <div className="row-actions">
          <button className="btn sm ghost icon" onClick={onEdit} title="تعديل"><Icon name="edit" size={16} /></button>
          <button className="btn sm danger icon" onClick={onDelete} title="حذف"><Icon name="trash" size={16} /></button>
        </div>
      )}
    </div>
  );
}

function iconForLink(l) {
  const t = (l.type || l.label || "").toString();
  if (/تسجيل|record/i.test(t)) return "🎥";
  if (/محضر|minute/i.test(t)) return "📝";
  return "🔗";
}

function MeetingForm({ initial, seriesCount, users, onSave, onCancel }) {
  const [f, setF] = useState({
    ...EMPTY,
    ...(initial || {}),
    attendees: Array.isArray(initial?.attendees) ? initial.attendees : [],
    links: Array.isArray(initial?.links) ? initial.links : [],
  });
  const [saving, setSaving] = useState(false);
  const inSeries = !!initial?.series_id && seriesCount > 1;
  const [rule, setRule] = useState({ freq: inSeries ? initial.recurrence : "none", ...DEFAULT_END, ...(initial?.recurrence_end || {}) });
  const [scope, setScope] = useState("one");
  const preview = useMemo(
    () => (!inSeries && rule.freq !== "none" && f.start_at ? generateOccurrences(f.start_at, rule) : []),
    [inSeries, rule, f.start_at]
  );
  const setR = (k) => (e) => setRule((r) => ({ ...r, [k]: e.target.value }));
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const toggleAtt = (name) =>
    setF((s) => ({ ...s, attendees: s.attendees.includes(name) ? s.attendees.filter((x) => x !== name) : [...s.attendees, name] }));

  const addLink = () => setF((s) => ({ ...s, links: [...s.links, { type: "تسجيل", label: "", url: "" }] }));
  const setLink = (i, k, v) => setF((s) => ({ ...s, links: s.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const rmLink = (i) => setF((s) => ({ ...s, links: s.links.filter((_, j) => j !== i) }));

  const ai = Array.isArray(f.action_items) ? f.action_items : [];
  const addAI = () => setF((s) => ({ ...s, action_items: [...ai, { text: "", assignee: "", due: "" }] }));
  const setAI = (i, k, v) => setF((s) => ({ ...s, action_items: ai.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const rmAI = (i) => setF((s) => ({ ...s, action_items: ai.filter((_, j) => j !== i) }));

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.start_at) return;
    if (!inSeries && rule.freq !== "none" && rule.endType === "until" && !rule.until) {
      alert("حدد تاريخ انتهاء التكرار.");
      return;
    }
    setSaving(true);
    try {
      const { id, created_at, ...rest } = f;
      await onSave({
        ...rest,
        duration: Number(f.duration) || 30,
        links: f.links.filter((l) => l.url),
        action_items: ai.filter((a) => a.text && a.text.trim()),
      }, { scope, rule });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full"><span>عنوان الاجتماع *</span><input value={f.title} onChange={set("title")} required /></label>
        <label className="field">
          <span>المشروع</span>
          <select value={f.project} onChange={set("project")}>
            <option value="">—</option>
            {PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field"><span>الحالة</span>
          <select value={f.status} onChange={set("status")}>
            <option value="Scheduled">مجدول</option>
            <option value="Done">منتهي</option>
            <option value="Cancelled">ملغى</option>
          </select>
        </label>
        <label className="field"><span>التاريخ والوقت *</span>
          <input type="datetime-local" value={toLocalInput(f.start_at)} onChange={(e) => setF((s) => ({ ...s, start_at: fromLocalInput(e.target.value) }))} required />
        </label>
        <label className="field"><span>المدة (دقيقة)</span><input type="number" min={5} step={5} value={f.duration} onChange={set("duration")} /></label>

        {inSeries ? (
          <div className="field full" style={{ background: "#7c3aed0d", border: "1px solid #7c3aed33", borderRadius: 10, padding: 12 }}>
            <span style={{ display: "block", fontSize: 12.5, color: "#7c3aed", marginBottom: 8, fontWeight: 700 }}>
              ↻ اجتماع متكرر ({describeRule(initial)}) — {seriesCount} موعد في السلسلة
            </span>
            <div className="seg">
              <button type="button" className={scope === "one" ? "on" : ""} onClick={() => setScope("one")}>تطبيق على هذا الموعد فقط</button>
              <button type="button" className={scope === "following" ? "on" : ""} onClick={() => setScope("following")}>هذا الموعد وكل ما بعده</button>
            </div>
            {scope === "following" && (
              <small className="muted" style={{ display: "block", marginTop: 6 }}>
                يُطبَّق العنوان والمشروع والمدة والمكان والحضور وجدول الأعمال والروابط، ويُزاح وقت المواعيد التالية بنفس فارق التعديل. المحضر والقرارات والحالة تبقى خاصة بكل موعد.
              </small>
            )}
          </div>
        ) : (
          <>
            <label className="field"><span>التكرار</span>
              <select value={rule.freq} onChange={setR("freq")}>
                {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            {rule.freq !== "none" ? (
              <div className="field" style={{ marginBottom: 14 }}>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>ينتهي التكرار</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={rule.endType} onChange={setR("endType")} style={{ width: 110 }}>
                    <option value="count">بعد عدد</option>
                    <option value="until">في تاريخ</option>
                  </select>
                  {rule.endType === "count" ? (
                    <input type="number" min={2} max={MAX_OCCURRENCES} value={rule.count} onChange={setR("count")} title="عدد المواعيد" />
                  ) : (
                    <input type="date" value={rule.until} min={f.start_at ? toLocalInput(f.start_at).slice(0, 10) : undefined} onChange={setR("until")} />
                  )}
                </div>
              </div>
            ) : <div className="field" />}
            {preview.length > 0 && (
              <small className="muted full" style={{ gridColumn: "1 / -1", marginTop: -4 }}>
                سيتم إنشاء {preview.length} موعد: من {fmtShort(preview[0])} إلى {fmtShort(preview[preview.length - 1])}
                {preview.length >= MAX_OCCURRENCES ? ` (الحد الأقصى ${MAX_OCCURRENCES})` : ""}
              </small>
            )}
          </>
        )}
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
            القرارات والمهام الناتجة (Action Items — تتحول لمهام)
            <button type="button" className="btn sm ghost" style={{ marginInlineStart: "auto" }} onClick={addAI}>+ إضافة قرار</button>
          </span>
          {ai.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input placeholder="القرار / المهمة" value={a.text} onChange={(e) => setAI(i, "text", e.target.value)} style={{ flex: 2 }} />
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
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function fmtShort(iso) {
  return new Date(iso).toLocaleDateString(DATE_LOCALE, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
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
