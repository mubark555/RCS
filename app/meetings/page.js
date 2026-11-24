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
import { toHref, firstUrl } from "@/lib/links.mjs";
import { REMINDER_OPTIONS, DEFAULT_MEETING_MAIL, detectMeetingMail, diffMeeting, meetingRecipients, meetingReminders, reminderLabel, MEETING_MAIL_KINDS } from "@/lib/meetingMail.mjs";
import { parseAttendees, presentOf, MEETING_STATUS, isLocked, ATTENDANCE_TYPES, DEFAULT_ATTENDANCE, attendanceOf, organizerOf } from "@/lib/meetings";
import { isMe } from "@/lib/mywork.mjs";
import { DATE_LOCALE } from "@/lib/constants";
import { RECURRENCE_OPTIONS, MAX_OCCURRENCES, generateOccurrences, describeRule } from "@/lib/recurrence";

const EMPTY = {
  title: "", objective: "", organizer: "", project: "", start_at: "", duration: 30, location: "",
  attendees: [], attendance: {}, links: [], agenda: "", minutes: "", action_items: [], status: "Scheduled",
  recurrence: "none", recurrence_end: null, series_id: null,
};

const DEFAULT_END = { endType: "count", count: 10, until: "" };

// الحقول المشتركة بين مواعيد السلسلة (لا تشمل المحضر والقرارات والحالة الخاصة بكل موعد)
const SHARED_FIELDS = ["title", "objective", "organizer", "project", "duration", "location", "attendees", "attendance", "agenda", "links", "notify_attendees", "reminders"];
// حقول خاصة بكل موعد لا تُنسخ للمواعيد الجديدة في السلسلة
const PER_OCCURRENCE = ["id", "created_at", "minutes", "action_items", "present", "status", "ended_at", "ended_by", "approved_at", "approved_by", "emailed_at", "emailed_count", "email_error", "mail_log", "reminders_sent"];
const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

const newSeriesId = () => `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

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
  const { sendEmail, announce, sendMeetingMail, notifyPrefs } = useNotifications();
  const mailPrefs = { ...DEFAULT_MEETING_MAIL, ...(notifyPrefs?.meetingMail || {}) };
  const mailOn = Boolean(notifyPrefs?.emailEnabled);
  const readOnly = !can("meetings", "edit");
  const [filter, setFilter] = useState("upcoming");
  const [ending, setEnding] = useState(null);     // اجتماع قيد الإنهاء (كتابة المحضر)
  const [approving, setApproving] = useState(null); // اعتماد المحضر وإرساله
  const canApproveMinutes = (m) => !readOnly && (ability("approveMinutes") || isMe(organizerOf(m), viewer));
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [minutesOf, setMinutesOf] = useState(null);
  const [q, setQ] = useState("");
  const [deleting, setDeleting] = useState(null);       // حذف موعد من سلسلة متكررة
  const [showAllSeries, setShowAllSeries] = useState(false);

  async function reload() {
    setItems(await meetingsStore.list());
  }
  useEffect(() => {
    reload().catch(() => setItems([]));
  }, []);

  const scoped = useMemo(() => {
    if (!items) return [];
    // ضمن مشاريع المستخدم، أو هو مدعو/منظّم الاجتماع
    const involved = (m) => Boolean(viewer) && (parseAttendees(m.attendees).some((n) => isMe(n, viewer)) || isMe(organizerOf(m), viewer));
    let arr = scopeProjects ? items.filter((m) => scopeProjects.includes(m.project) || involved(m)) : items;
    const s = q.trim().toLowerCase();
    if (s) {
      arr = arr.filter((m) =>
        [m.title, m.project, m.location, m.agenda,
         Array.isArray(m.attendees) ? m.attendees.join(" ") : m.attendees]
          .filter(Boolean).join(" ").toLowerCase().includes(s)
      );
    }
    return arr;
  }, [items, scopeProjects, q, viewer]);

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
  // في «القادمة»: أقرب موعد فقط لكل سلسلة متكررة، مع خيار عرض الكل
  const seriesLeft = useMemo(() => {
    const left = {};
    for (const m of groups.upcoming) if (m.series_id) left[m.series_id] = (left[m.series_id] || 0) + 1;
    return left;
  }, [groups]);
  const shown = useMemo(() => {
    const list = groups[filter] || [];
    if (filter !== "upcoming" || showAllSeries) return list;
    const seen = new Set();
    return list.filter((m) => {
      if (!m.series_id) return true;
      if (seen.has(m.series_id)) return false;
      seen.add(m.series_id);
      return true;
    });
  }, [groups, filter, showAllSeries]);
  const hiddenCount = filter === "upcoming" ? groups.upcoming.length - shown.length : 0;

  const seriesOf = (m) => (m?.series_id ? (items || []).filter((x) => x.series_id === m.series_id) : m ? [m] : []);

  // حفظ اجتماع: منفرد، أو إنشاء سلسلة متكررة، أو تعديل موعد/هذا وما بعده
  async function saveMeeting(payload, opts = {}) {
    const prev = editing?.id ? editing : null;
    const rule = opts.rule || { freq: "none" };
    const freq = rule.freq || "none";
    const scope = opts.scope || "one";
    const mail = async (kind, rec, before) => {
      if (opts.sendMail === false || !kind || !rec?.id) return;
      await sendMeetingMail(kind, rec, { changes: kind === "update" ? diffMeeting(before, rec) : undefined });
    };

    // إنشاء سلسلة جديدة، أو تحويل اجتماع منفرد إلى متكرر
    if (freq !== "none" && !(prev && prev.series_id && seriesOf(prev).length > 1)) {
      const dates = generateOccurrences(payload.start_at, rule);
      const series_id = newSeriesId();
      const recurrence_end = { endType: rule.endType, count: Number(rule.count) || 0, until: rule.until || "" };
      const common = { ...payload, series_id, recurrence: freq, recurrence_end };
      if (!prev) {
        common.created_by = viewer?.name || "";
        common.organizer = payload.organizer || viewer?.name || "";
      }
      const [first, ...rest] = dates;
      let saved;
      if (prev) saved = await meetingsStore.update(prev.id, { ...common, start_at: first, reminders_sent: [] });
      else saved = await meetingsStore.create({ ...common, start_at: first });
      // المواعيد التالية تبدأ بلا محضر ولا قرارات وبحالة «مجدول»
      const base = omit(common, PER_OCCURRENCE);
      await meetingsStore.createMany(rest.map((d) => ({ ...base, start_at: d, minutes: "", action_items: [], present: [], status: "Scheduled" })));
      // دعوة البريد للموعد الأول فقط (حتى لا يُغرق الحضور برسائل بعدد المواعيد)
      const rec = { ...(prev || {}), ...common, start_at: first, ...(saved || {}) };
      await mail(detectMeetingMail(prev, rec), rec, prev);
      return;
    }

    // اجتماع منفرد جديد
    if (!prev) {
      const saved = await meetingsStore.create({ ...payload, recurrence: "none", series_id: null, created_by: viewer?.name || "", organizer: payload.organizer || viewer?.name || "" });
      const rec = { ...payload, ...(saved || {}) };
      await mail(detectMeetingMail(null, rec), rec, null);
      return;
    }

    // تعديل اجتماع منفرد، أو موعد واحد فقط من سلسلة
    const timeChanged = new Date(prev.start_at || 0).getTime() !== new Date(payload.start_at || 0).getTime();
    const saved = await meetingsStore.update(prev.id, timeChanged ? { ...payload, reminders_sent: [] } : payload);
    const rec = { ...prev, ...payload, ...(saved || {}) };
    await mail(detectMeetingMail(prev, rec), rec, prev);

    // هذا الموعد وما بعده: الحقول المشتركة + إزاحة الوقت بنفس الفارق (المواعيد المعتمدة لا تُلمس)
    if (prev.series_id && scope === "following") {
      const delta = new Date(payload.start_at) - new Date(prev.start_at);
      const shared = Object.fromEntries(SHARED_FIELDS.filter((k) => k in payload).map((k) => [k, payload[k]]));
      const following = seriesOf(prev).filter((x) => x.id !== prev.id && x.start_at >= prev.start_at && !isLocked(x) && (x.status || "Scheduled") === "Scheduled");
      for (const x of following) {
        const patch = { ...shared };
        if (delta) { patch.start_at = new Date(new Date(x.start_at).getTime() + delta).toISOString(); patch.reminders_sent = []; }
        await meetingsStore.update(x.id, patch, { action: "update", entity: "" });
      }
    }
  }

  // حذف: موعد واحد، أو هذا وما بعده، أو السلسلة كاملة (المحاضر المعتمدة تبقى)
  async function deleteMeeting(m, scope = "one") {
    let targets = [m];
    if (scope === "following") targets = seriesOf(m).filter((x) => x.start_at >= m.start_at);
    else if (scope === "all") targets = seriesOf(m);
    targets = targets.filter((x) => x.id === m.id || !isLocked(x));
    const now = new Date().toISOString();
    const notifiable = targets.filter((x) => (x.status || "Scheduled") === "Scheduled" && x.start_at > now && x.notify_attendees !== false && Array.isArray(x.mail_log) && x.mail_log.length);
    if (notifiable.length && mailOn && mailPrefs.cancel && confirm("إرسال إشعار إلغاء بالبريد للحضور قبل الحذف؟")) {
      for (const x of notifiable) await sendMeetingMail("cancel", { ...x, status: "Cancelled" });
    }
    for (const x of targets) await meetingsStore.remove(x.id);
    setDeleting(null);
    await reload();
  }

  async function askDelete(m) {
    if (m.series_id && seriesOf(m).length > 1) { setDeleting(m); return; }
    if (!confirm(`حذف الاجتماع؟\n\n${m.title}`)) return;
    // حذف اجتماع قادم → إشعار الحضور بالإلغاء (يحذفه من تقويمهم)
    const upcoming = (m.status || "Scheduled") === "Scheduled" && m.start_at > new Date().toISOString();
    if (upcoming && mailOn && mailPrefs.cancel && m.notify_attendees !== false && confirm("إرسال إشعار إلغاء بالبريد للحضور قبل الحذف؟")) {
      await sendMeetingMail("cancel", { ...m, status: "Cancelled" });
    }
    await meetingsStore.remove(m.id);
    await reload();
  }

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
    announce({ title: `اعتُمد محضر «${m.title}»${result?.ok ? ` وأُرسل لـ ${result.count} من الحضور` : ""}`, tone: "success", entity: "اجتماع", action: "approve", people: [...presentOf(m), organizerOf(m)], audience: "none" });
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

      {filter === "upcoming" && Object.keys(seriesLeft).length > 0 && (hiddenCount > 0 || showAllSeries) && (
        <div style={{ display: "flex", justifyContent: "flex-end", margin: "-4px 0 10px" }}>
          <button className="btn sm ghost" onClick={() => setShowAllSeries((v) => !v)}>
            {showAllSeries ? "إظهار أقرب موعد لكل سلسلة فقط" : `عرض كل المواعيد المتكررة (+${hiddenCount})`}
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="mtg-empty">{filter === "upcoming" ? "لا توجد اجتماعات قادمة." : filter === "Approved" ? "لا محاضر معتمدة بعد." : "لا يوجد."}</div>
      ) : (
        <div className="mtg-list">
          {shown.map((m) => (
            <MeetingCard key={m.id} m={m} readOnly={readOnly} canApprove={canApproveMinutes(m)}
              dim={m.status === "Cancelled"}
              remaining={filter === "upcoming" && !showAllSeries ? seriesLeft[m.series_id] : 0}
              onEdit={() => setEditing(m)} onMinutes={() => setMinutesOf(m)}
              onEnd={() => setEnding(m)} onApprove={() => setApproving(m)}
              onDelete={() => askDelete(m)}
              onRemind={async () => { await sendMeetingMail("reminder", m, { force: true, offset: 0 }); await reload(); }}
              mailOn={mailOn} />
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
            seriesCount={editing.id ? seriesOf(editing).length : 0}
            users={users}
            mailPrefs={mailPrefs}
            mailOn={mailOn}
            onCancel={() => setEditing(null)}
            onSave={async (payload, opts = {}) => {
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
          <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>المواعيد ذات المحاضر المعتمدة لا تُحذف ضمن السلسلة.</p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setDeleting(null)}>إلغاء</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MeetingCard({ m, onEdit, onMinutes, onEnd, onApprove, canApprove, dim, readOnly, onDelete, onRemind, mailOn, remaining }) {
  const [reminding, setReminding] = useState(false);
  const st = STATUS_AR[m.status] || STATUS_AR.Scheduled;
  const locked = isLocked(m);
  const past = m.start_at && m.start_at < new Date().toISOString();
  const dt = m.start_at ? new Date(m.start_at) : null;
  const dateStr = dt
    ? dt.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const attendees = parseAttendees(m.attendees);
  const links = Array.isArray(m.links) ? m.links : [];
  const agendaPreview = (m.agenda || "").split("\n").filter(Boolean).join(" · ");
  // رابط الاجتماع: من حقل «المكان / رابط الاجتماع» (حتى لو كُتب بدون https://)
  const joinUrl = firstUrl(m.location);
  const metaBits = [dateStr, `${m.duration} دقيقة`, m.project, joinUrl ? "" : m.location].filter(Boolean);

  const rule = describeRule(m);

  return (
    <div className={`mtg-card${dim ? " dim" : ""}`}>
      <div className="row">
        <div className="mtg-icon"><Icon name="calendar" size={26} /></div>
        <div className="mtg-body">
          <div className="t">
            <h3>{m.title}</h3>
            <span className="st" style={{ background: `${st.color}1e`, color: st.color }}>{st.short || st.ar}</span>
            {rule && (
              <span className="st" style={{ background: "#7c3aed1a", color: "#7c3aed" }} title="اجتماع متكرر">
                ↻ {rule}{remaining > 1 ? ` · ${remaining} مواعيد قادمة` : ""}
              </span>
            )}
          </div>
          {m.status !== "Cancelled" && <Lifecycle m={m} />}
          <div className="mtg-meta">
            {metaBits.join(" · ")}
            {joinUrl && <> · <a href={joinUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="mtg-link">{m.location}</a></>}
          </div>
          {(organizerOf(m) || m.objective) && (
            <div className="mtg-meta">
              {organizerOf(m) && <>المنظّم: <b>{organizerOf(m)}</b></>}
              {organizerOf(m) && m.objective ? " · " : ""}
              {m.objective && <>الهدف: {m.objective}</>}
            </div>
          )}
          {attendees.length > 0 && (
            <div className="mtg-att">
              <b>الحضور:</b>{" "}
              {Object.keys(ATTENDANCE_TYPES).flatMap((k) => attendees.filter((a) => attendanceOf(m, a) === k).map((a) => (
                <span key={a} className="att-pill" title={ATTENDANCE_TYPES[k].desc}
                  style={{ color: ATTENDANCE_TYPES[k].color, borderColor: `${ATTENDANCE_TYPES[k].color}55`, fontWeight: k === "mandatory" ? 800 : 600 }}>
                  {a} · {ATTENDANCE_TYPES[k].ar}
                </span>
              )))}
            </div>
          )}
          {agendaPreview && <div className="mtg-agenda">{agendaPreview}</div>}
          <div className="mtg-actions">
            {joinUrl && (m.status || "Scheduled") === "Scheduled" && (
              <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="mtg-btn join">
                <Icon name="link" size={15} /> دخول الاجتماع
              </a>
            )}
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
            {!readOnly && mailOn && (m.status || "Scheduled") === "Scheduled" && !past && m.notify_attendees !== false && (
              <button className="mtg-btn neutral" disabled={reminding} onClick={async () => { setReminding(true); try { await onRemind(); } finally { setReminding(false); } }}>
                <Icon name="bell" size={15} /> {reminding ? "جاري الإرسال…" : "تذكير الحضور الآن"}
              </button>
            )}
            {links.map((l, i) => (
              <a key={i} href={toHref(l.url) || l.url} target="_blank" rel="noopener noreferrer" className="mtg-btn pri">
                <Icon name="link" size={15} /> {l.label || l.type || "رابط"}
              </a>
            ))}
          </div>
          <MailStrip m={m} mailOn={mailOn} />
        </div>
        {!readOnly && !locked && (
          <div className="mtg-side">
            <button className="mtg-ib" onClick={onEdit} title="تعديل"><Icon name="edit" size={16} /></button>
            <button className="mtg-ib del" onClick={onDelete} title="حذف"><Icon name="trash" size={16} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

// شريط بريد الحضور: التذكيرات المجدولة + آخر ما أُرسل
function MailStrip({ m, mailOn }) {
  const log = Array.isArray(m.mail_log) ? m.mail_log : [];
  const scheduled = (m.status || "Scheduled") === "Scheduled";
  if (!mailOn && !log.length) return null;
  if (m.notify_attendees === false) return <div className="mm-mail muted"><Icon name="mail" size={13} /> بريد الحضور متوقف لهذا الاجتماع</div>;
  const sent = new Set((m.reminders_sent || []).map(Number));
  const rem = meetingReminders(m);
  const last = log[0];
  return (
    <div className="mm-mail">
      <Icon name="mail" size={13} />
      {scheduled && mailOn && rem.slice().sort((a, b) => b - a).map((r) => (
        <span key={r} className={`mm-rem ${sent.has(Number(r)) ? "done" : ""}`}>{sent.has(Number(r)) ? "✓ " : ""}{reminderLabel(r)}</span>
      ))}
      {last && (
        <span className="muted" title={last.error || ""}>
          آخر بريد: {MEETING_MAIL_KINDS[last.kind]?.ar || last.kind}{last.label ? ` (${last.label})` : ""} · {new Date(last.at).toLocaleString("ar-SA-u-ca-gregory", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          {last.error ? <b style={{ color: "#dc2626" }}> — تعذّر: {last.error}</b> : ` — ${last.to} مستلم`}
        </span>
      )}
    </div>
  );
}

// إعدادات بريد الحضور داخل نموذج الاجتماع
function MeetingMailBox({ f, setF, users, mailPrefs, mailOn, sendMail, setSendMail, isEdit }) {
  const on = f.notify_attendees !== false;
  const reminders = Array.isArray(f.reminders) ? f.reminders : mailPrefs.defaultReminders || [];
  const toggleRem = (min) => setF((s) => {
    const cur = Array.isArray(s.reminders) ? s.reminders : mailPrefs.defaultReminders || [];
    return { ...s, reminders: cur.includes(min) ? cur.filter((x) => x !== min) : [...cur, min].sort((a, b) => b - a) };
  });
  const { recipients, missing } = meetingRecipients(f, users);
  return (
    <div className="field full mm-box">
      <label className="mm-head">
        <input type="checkbox" checked={on} onChange={(e) => setF((s) => ({ ...s, notify_attendees: e.target.checked }))} />
        <span><Icon name="mail" size={15} /> بريد للحضور (دعوة مع مرفق تقويم، وتحديثات، وتذكير قبل الموعد)</span>
      </label>
      {!mailOn && <div className="mm-warn">إشعارات البريد متوقفة من «الإعدادات ← إشعارات البريد» — ستُحفظ الخيارات وتعمل عند التفعيل.</div>}
      {on && (
        <>
          <div className="mm-label">التذكير قبل الاجتماع</div>
          <div className="attendee-picker">
            {REMINDER_OPTIONS.map((o) => (
              <span key={o.min} className={`att-chip ${reminders.includes(o.min) ? "on" : ""}`} onClick={() => toggleRem(o.min)}>{o.ar}</span>
            ))}
          </div>
          <div className="mm-recip">
            <b>يصل البريد إلى ({recipients.length}):</b> {recipients.length ? recipients.map((r) => r.name).join("، ") : <span className="muted">لا أحد لديه بريد بعد</span>}
            {missing.length > 0 && <div style={{ color: "#d97706" }}>بلا بريد (لن يصلهم): {missing.join("، ")} — أضِف بريدهم من قسم الفريق.</div>}
          </div>
          {mailOn && (
            <label className="mm-check">
              <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} />
              {isEdit ? "إرسال بريد للحضور بالتغييرات عند الحفظ (تحديث / إلغاء)" : "إرسال الدعوة بالبريد للحضور فور الحفظ"}
            </label>
          )}
        </>
      )}
    </div>
  );
}

function MeetingForm({ initial, users, onSave, onCancel, mode, seriesCount = 0, mailPrefs = DEFAULT_MEETING_MAIL, mailOn = false }) {
  const projectNames = useProjectNames();
  const ending = mode === "end";
  const [f, setF] = useState(() => {
    const att = parseAttendees(initial?.attendees);
    return {
      ...EMPTY,
      ...(initial || {}),
      attendees: att,
      attendance: initial?.attendance && typeof initial.attendance === "object" && !Array.isArray(initial.attendance) ? initial.attendance : {},
      organizer: initial?.organizer || initial?.created_by || "",
      present: Array.isArray(initial?.present) && initial.present.length ? initial.present : att,
      links: Array.isArray(initial?.links) ? initial.links : [],
    };
  });
  const togglePresent = (name) =>
    setF((s) => ({ ...s, present: s.present.includes(name) ? s.present.filter((x) => x !== name) : [...s.present, name] }));
  const [saving, setSaving] = useState(false);
  const [sendMail, setSendMail] = useState(true);
  // التكرار
  const inSeries = Boolean(initial?.series_id) && seriesCount > 1;
  const [rule, setRule] = useState(() => ({ freq: "none", ...DEFAULT_END, ...(initial?.recurrence_end || {}) }));
  const [scope, setScope] = useState("one");
  const preview = useMemo(
    () => (!ending && !inSeries && rule.freq !== "none" && f.start_at ? generateOccurrences(f.start_at, rule) : []),
    [ending, inSeries, rule, f.start_at]
  );
  const setR = (k) => (e) => setRule((r) => ({ ...r, [k]: e.target.value }));
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const toggleAtt = (name) =>
    setF((s) => ({ ...s, attendees: s.attendees.includes(name) ? s.attendees.filter((x) => x !== name) : [...s.attendees, name] }));
  const setAttType = (name, type) => setF((s) => ({ ...s, attendance: { ...s.attendance, [name]: type } }));

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
    if (!ending && !inSeries && rule.freq !== "none" && rule.endType === "until" && !rule.until) {
      alert("حدد تاريخ انتهاء التكرار.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...f,
        duration: Number(f.duration) || 30,
        links: f.links.filter((l) => l.url),
        action_items: ai.filter((a) => a.text && a.text.trim()),
        // التصنيف للمدعوين فقط (الافتراضي: أساسي)
        attendance: Object.fromEntries(f.attendees.map((a) => [a, ATTENDANCE_TYPES[f.attendance?.[a]] ? f.attendance[a] : DEFAULT_ATTENDANCE])),
        ...(ending ? {} : {
          notify_attendees: f.notify_attendees !== false,
          reminders: Array.isArray(f.reminders) ? f.reminders : mailPrefs.defaultReminders || [],
        }),
      }, { sendMail: f.notify_attendees !== false && sendMail, rule: ending || inSeries ? { freq: "none" } : rule, scope });
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
        <label className="field full"><span>هدف الاجتماع</span><input value={f.objective || ""} onChange={set("objective")} placeholder="ما الذي يجب أن يحققه الاجتماع؟" /></label>
        <label className="field"><span>المنظّم</span>
          <select value={f.organizer || ""} onChange={set("organizer")}>
            <option value="">—</option>
            {users.filter((u) => u.role !== "client" || u.name === f.organizer).map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </label>
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

        {inSeries ? (
          <div className="field full" style={{ background: "#7c3aed0d", border: "1px solid #7c3aed33", borderRadius: 10, padding: 12 }}>
            <span style={{ display: "block", fontSize: 12.5, color: "#7c3aed", marginBottom: 8, fontWeight: 700 }}>
              ↻ اجتماع متكرر ({describeRule(initial)}) — {seriesCount} موعد في السلسلة
            </span>
            <div className="seg">
              <button type="button" className={scope === "one" ? "on" : ""} onClick={() => setScope("one")}>هذا الموعد فقط</button>
              <button type="button" className={scope === "following" ? "on" : ""} onClick={() => setScope("following")}>هذا الموعد وكل ما بعده</button>
            </div>
            {scope === "following" && (
              <small className="muted" style={{ display: "block", marginTop: 6 }}>
                يُطبَّق العنوان والهدف والمنظّم والمشروع والمدة والمكان والحضور وجدول الأعمال والروابط وإعدادات البريد، ويُزاح وقت المواعيد التالية بنفس فارق التعديل. المحضر والقرارات والحالة تبقى خاصة بكل موعد.
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
              <div className="field">
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
              <small className="muted" style={{ gridColumn: "1 / -1", marginTop: -4 }}>
                سيتم إنشاء {preview.length} موعد: من {fmtShort(preview[0])} إلى {fmtShort(preview[preview.length - 1])}
                {preview.length >= MAX_OCCURRENCES ? ` (الحد الأقصى ${MAX_OCCURRENCES})` : ""}
                {mailOn && f.notify_attendees !== false ? " · تُرسل الدعوة بالبريد للموعد الأول فقط، والتذكيرات تصل قبل كل موعد." : ""}
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
          {f.attendees.length > 0 && (
            <div className="att-types">
              <small className="muted">تصنيف الحضور لكل مدعو:</small>
              {f.attendees.map((a) => {
                const cur = ATTENDANCE_TYPES[f.attendance?.[a]] ? f.attendance[a] : DEFAULT_ATTENDANCE;
                return (
                  <div className="att-type-row" key={a}>
                    <b>{a}</b>
                    <div className="seg">
                      {Object.entries(ATTENDANCE_TYPES).map(([k, t]) => (
                        <button type="button" key={k} className={cur === k ? "on" : ""} title={t.desc} onClick={() => setAttType(a, k)}>{t.ar}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <MeetingMailBox f={f} setF={setF} users={users} mailPrefs={mailPrefs} mailOn={mailOn} sendMail={sendMail} setSendMail={setSendMail} isEdit={Boolean(initial)} />
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
