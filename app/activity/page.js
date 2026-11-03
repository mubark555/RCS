"use client";

// سجل النشاط: متابعة دخول وخروج الموظفين وكل ما قاموا به (يومياً + نظرة عامة على الفترات السابقة)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRole } from "@/components/RoleProvider";
import Icon from "@/components/Icon";
import { ENTITIES, listActivity, listSessions, sessionEnd } from "@/lib/activity";

const LOC = "ar-SA-u-ca-gregory";
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" });
const fmtDay = (d) => d.toLocaleDateString(LOC, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtFull = (iso) => new Date(iso).toLocaleString(LOC, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} س ${m % 60} د` : `${h} س`;
}
function ago(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "الآن";
  const m = Math.round(s / 60);
  if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.round(h / 24)} يوم`;
}

const VERB = {
  create: { ar: "أضاف", icon: "plus", color: "#16a34a" },
  update: { ar: "عدّل", icon: "edit", color: "#2563eb" },
  status: { ar: "غيّر حالة", icon: "check", color: "#d97706" },
  delete: { ar: "حذف", icon: "trash", color: "#dc2626" },
  upload: { ar: "رفع", icon: "upload", color: "#0d9488" },
  link: { ar: "أضاف رابط", icon: "link", color: "#0d9488" },
  login: { ar: "سجّل دخوله إلى النظام", icon: "arrow", color: "#7c3aed" },
  logout: { ar: "سجّل خروجه من النظام", icon: "arrow", color: "#64748b" },
  idle: { ar: "انتهت جلسته (آخر ظهور)", icon: "clock", color: "#94a3b8" },
};

const CATS = [
  { k: "all", ar: "الكل" },
  { k: "task", ar: "المهام" },
  { k: "meeting", ar: "الاجتماعات" },
  { k: "project", ar: "المشاريع" },
  { k: "session", ar: "الدخول والخروج" },
  { k: "file", ar: "الملفات" },
  { k: "user", ar: "الفريق" },
  { k: "kpi", ar: "المؤشرات" },
];

const RANGES = [7, 30, 90];

export default function ActivityPage() {
  const { canManage, users } = useRole();
  const [mode, setMode] = useState("day");
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [range, setRange] = useState(7);
  const [who, setWho] = useState("");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);

  const { from, to } = useMemo(() => {
    if (mode === "day") { const f = parseDay(day); return { from: f, to: addDays(f, 1) }; }
    const t = addDays(parseDay(dayKey(new Date())), 1);
    return { from: addDays(t, -range), to: t };
  }, [mode, day, range]);

  useEffect(() => {
    let off = false;
    setData(null);
    Promise.all([listActivity({ from, to }), listSessions({ from, to })])
      .then(([acts, sessions]) => !off && setData({ acts, sessions }))
      .catch(() => !off && setData({ acts: [], sessions: [] }));
    return () => { off = true; };
  }, [from, to, tick]);

  // تحديث حيّ كل دقيقة + عند تسجيل نشاط جديد
  useEffect(() => {
    const iv = setInterval(() => setTick((x) => x + 1), 60_000);
    const on = () => setTick((x) => x + 1);
    window.addEventListener("sp-activity", on);
    return () => { clearInterval(iv); window.removeEventListener("sp-activity", on); };
  }, []);

  const staff = useMemo(() => users.filter((u) => u.role !== "client"), [users]);

  if (!canManage) return <div className="empty">هذا القسم متاح للمدير فقط.</div>;

  return (
    <div>
      <div className="act-toolbar">
        <div className="seg">
          <button className={mode === "day" ? "on" : ""} onClick={() => setMode("day")}>يومي</button>
          <button className={mode === "overview" ? "on" : ""} onClick={() => setMode("overview")}>نظرة عامة</button>
        </div>

        {mode === "day" ? (
          <div className="day-nav">
            <button className="btn sm ghost icon" title="اليوم السابق" onClick={() => setDay(dayKey(addDays(parseDay(day), -1)))}>›</button>
            <input type="date" value={day} max={dayKey(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <button className="btn sm ghost icon" title="اليوم التالي" disabled={day >= dayKey(new Date())} onClick={() => setDay(dayKey(addDays(parseDay(day), 1)))}>‹</button>
            {day !== dayKey(new Date()) && <button className="btn sm" onClick={() => setDay(dayKey(new Date()))}>اليوم</button>}
          </div>
        ) : (
          <div className="seg">
            {RANGES.map((r) => <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>آخر {r} يوم</button>)}
          </div>
        )}

        <select className="act-select" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">كل الموظفين</option>
          {staff.map((u) => <option key={u.id} value={u.name}>{u.name}{u.title ? ` — ${u.title}` : ""}</option>)}
        </select>
      </div>

      <div className="act-heading">
        {mode === "day" ? fmtDay(parseDay(day)) : `من ${from.toLocaleDateString(LOC, { day: "numeric", month: "long" })} إلى ${addDays(to, -1).toLocaleDateString(LOC, { day: "numeric", month: "long", year: "numeric" })}`}
        {who && <span className="pill" style={{ marginInlineStart: 10 }}>{who} <button className="link-btn" onClick={() => setWho("")}>✕</button></span>}
      </div>

      {!data ? (
        <div className="empty">جاري التحميل…</div>
      ) : mode === "day" ? (
        <DayView data={data} from={from} to={to} who={who} setWho={setWho} cat={cat} setCat={setCat} q={q} setQ={setQ} staff={staff} />
      ) : (
        <Overview data={data} from={from} to={to} range={range} who={who} setWho={setWho} staff={staff}
          openDay={(k) => { setDay(k); setMode("day"); }} />
      )}
    </div>
  );
}

// ======================= الحسابات =======================
// مدة الجلسة داخل نافذة زمنية
function clipDur(s, from, to, now) {
  const st = Math.max(new Date(s.started_at).getTime(), from.getTime());
  const en = Math.min(new Date(sessionEnd(s, now).at).getTime(), to.getTime());
  return Math.max(0, en - st);
}

function perEmployee(acts, sessions, from, to) {
  const now = Date.now();
  const map = new Map();
  const get = (name) => {
    if (!map.has(name)) map.set(name, { name, first: null, last: null, dur: 0, sessions: 0, actions: 0, tasks: new Set(), online: false, days: new Set(), lastSeen: null });
    return map.get(name);
  };
  for (const s of sessions) {
    const e = get(s.user_name);
    const end = sessionEnd(s, now);
    const d = clipDur(s, from, to, now);
    if (d <= 0 && !end.active) continue;
    e.sessions += 1;
    e.dur += d;
    if (!e.first || s.started_at < e.first) e.first = s.started_at;
    if (!e.last || end.at > e.last.at) e.last = end;
    if (end.active) e.online = true;
    e.days.add(dayKey(new Date(Math.max(new Date(s.started_at).getTime(), from.getTime()))));
    if (!e.lastSeen || s.last_seen_at > e.lastSeen) e.lastSeen = s.last_seen_at;
  }
  for (const a of acts) {
    const e = get(a.user_name);
    if (a.entity !== "session") e.actions += 1;
    if (a.entity === "task" && a.action !== "delete") e.tasks.add(a.entity_id || a.title);
    e.days.add(dayKey(new Date(a.at)));
    if (!e.lastSeen || a.at > e.lastSeen) e.lastSeen = a.at;
  }
  return Array.from(map.values()).sort((a, b) => b.actions + b.dur / 6e5 - (a.actions + a.dur / 6e5));
}

// يضيف أحداث "انتهاء الجلسة" للجلسات التي لم يُسجَّل لها خروج صريح
function withIdleEvents(acts, sessions, from, to) {
  const now = Date.now();
  const extra = [];
  for (const s of sessions) {
    const end = sessionEnd(s, now);
    if (end.explicit || end.active) continue;
    if (end.at < from.toISOString() || end.at >= to.toISOString()) continue;
    extra.push({ id: `idle-${s.id}`, at: end.at, user_name: s.user_name, action: "idle", entity: "session", title: "", details: { started: s.started_at } });
  }
  return [...acts, ...extra].sort((a, b) => b.at.localeCompare(a.at));
}

// ======================= العرض اليومي =======================
function DayView({ data, from, to, who, setWho, cat, setCat, q, setQ, staff }) {
  const acts = useMemo(() => withIdleEvents(data.acts, data.sessions, from, to), [data, from, to]);
  const rows = useMemo(() => perEmployee(data.acts, data.sessions, from, to), [data, from, to]);
  const mine = (x) => !who || x.user_name === who;

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return acts.filter((a) => mine(a) && (cat === "all" || a.entity === cat) && (!t || `${a.title} ${a.project} ${a.user_name}`.toLowerCase().includes(t)));
  }, [acts, who, cat, q]); // eslint-disable-line

  const catCount = useMemo(() => {
    const c = {};
    for (const a of acts) if (mine(a)) { c[a.entity] = (c[a.entity] || 0) + 1; c.all = (c.all || 0) + 1; }
    return c;
  }, [acts, who]); // eslint-disable-line

  // المهام التي عُدّلت
  const tasks = useMemo(() => {
    const m = new Map();
    for (const a of data.acts) {
      if (a.entity !== "task" || !mine(a)) continue;
      const k = a.entity_id || a.title;
      const e = m.get(k) || { title: a.title, project: a.project, count: 0, by: new Set(), last: a, actions: new Set() };
      e.count += 1;
      e.by.add(a.user_name);
      e.actions.add(a.action);
      if (a.at > e.last.at) e.last = a;
      m.set(k, e);
    }
    return Array.from(m.values()).sort((a, b) => b.last.at.localeCompare(a.last.at));
  }, [data, who]); // eslint-disable-line

  const shown = who ? rows.filter((r) => r.name === who) : rows;
  const active = shown.filter((r) => r.sessions > 0 || r.actions > 0);
  const totalDur = shown.reduce((s, r) => s + r.dur, 0);
  const totalActs = shown.reduce((s, r) => s + r.actions, 0);
  const online = shown.filter((r) => r.online).length;
  const absent = who ? [] : staff.filter((u) => !rows.some((r) => r.name === u.name && (r.sessions || r.actions)));
  const userSessions = who ? data.sessions.filter((s) => s.user_name === who) : [];

  return (
    <>
      <div className="kpi-grid">
        <Stat icon="users" color="#7c3aed" num={who ? (active.length ? "حاضر" : "غائب") : `${active.length}/${staff.length}`} label={who ? "حالة الحضور" : "الموظفون النشطون"} sub={online ? `${online} متصل الآن` : ""} />
        <Stat icon="clock" color="#e05a50" num={fmtDur(totalDur)} label="إجمالي وقت الاستخدام" />
        <Stat icon="edit" color="#2563eb" num={totalActs} label="إجمالي العمليات" />
        <Stat icon="tasks" color="#16a34a" num={tasks.length} label="مهام تم العمل عليها" />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title">الحضور والانصراف</div>
        {shown.length === 0 && absent.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>لا يوجد نشاط في هذا اليوم.</div>
        ) : (
          <div className="table-wrap">
            <table className="act-table">
              <thead><tr><th>الموظف</th><th>أول دخول</th><th>آخر خروج</th><th>مدة الاستخدام</th><th>الجلسات</th><th>العمليات</th><th>المهام</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.name} onClick={() => setWho(who === r.name ? "" : r.name)} className={who === r.name ? "on" : ""}>
                    <td><span className="uname"><span className={`odot ${r.online ? "on" : ""}`} />{r.name}</span></td>
                    <td>{r.first ? fmtTime(r.first) : "—"}</td>
                    <td>{r.online ? <span style={{ color: "#16a34a", fontWeight: 700 }}>متصل الآن</span> : r.last ? <>{fmtTime(r.last.at)}{!r.last.explicit && <small className="muted"> (آخر ظهور)</small>}</> : "—"}</td>
                    <td><b>{fmtDur(r.dur)}</b></td>
                    <td>{r.sessions}</td>
                    <td>{r.actions}</td>
                    <td>{r.tasks.size}</td>
                  </tr>
                ))}
                {absent.map((u) => (
                  <tr key={u.id} className="absent" onClick={() => setWho(u.name)}>
                    <td><span className="uname"><span className="odot" />{u.name}</span></td>
                    <td colSpan={6} className="muted">لم يسجّل دخولاً في هذا اليوم</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {who && userSessions.length > 0 && (
          <div className="ses-list">
            {userSessions.slice().sort((a, b) => a.started_at.localeCompare(b.started_at)).map((s) => {
              const e = sessionEnd(s);
              return (
                <span key={s.id} className="ses-chip">
                  <Icon name="clock" size={13} /> {fmtTime(s.started_at)} ← {e.active ? "الآن" : fmtTime(e.at)} · {fmtDur(new Date(e.at) - new Date(s.started_at))}
                  {s.device && <small className="muted"> · {s.device}</small>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="dash-2col" style={{ marginTop: 0 }}>
        <div className="card">
          <div className="section-title">سجل الأنشطة</div>
          <p className="muted" style={{ fontSize: 12.5, margin: "-4px 0 12px" }}>توثيق دائم للدخول والخروج والإضافات والتعديلات — اسم المستخدم والتاريخ والتفاصيل.</p>
          <div className="act-chips">
            {CATS.map((c) => (
              <button key={c.k} className={`act-chip ${cat === c.k ? "on" : ""}`} onClick={() => setCat(c.k)}>
                {c.ar}{catCount[c.k] ? <span className="n">{catCount[c.k]}</span> : null}
              </button>
            ))}
          </div>
          <input className="act-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في السجل (مهمة، مشروع، موظف)…" />
          {filtered.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>لا توجد أنشطة مطابقة.</div>
          ) : (
            <Timeline items={filtered} />
          )}
        </div>

        <div className="card">
          <div className="section-title">المهام التي تم العمل عليها <span className="hint">({tasks.length})</span></div>
          {tasks.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>لم تُعدَّل أي مهمة.</div>
          ) : (
            tasks.map((t, i) => (
              <Link key={i} href={`/tasks?q=${encodeURIComponent(t.title)}`} className="task-touch">
                <div className="tt-title">{t.title}</div>
                <div className="tt-meta">
                  {t.project && <span className="pill">{t.project}</span>}
                  <span>{t.count} {t.count === 1 ? "عملية" : "عمليات"}</span>
                  <span>·</span>
                  <span>{Array.from(t.by).join("، ")}</span>
                  <span>·</span>
                  <span>آخرها {fmtTime(t.last.at)}</span>
                </div>
                {t.last.action === "status" && t.last.details?.changes?.[0] && (
                  <div className="tt-meta" style={{ color: "#d97706" }}>الحالة: من «{t.last.details.changes[0].from}» إلى «{t.last.details.changes[0].to}»</div>
                )}
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ icon, color, num, label, sub }) {
  return (
    <div className="kpi-card">
      <span className="kpi-ic" style={{ background: `${color}18`, color }}><Icon name={icon} size={24} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="num">{num}</div>
        <div className="lbl">{label}</div>
        {sub && <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 700, marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ======================= الخط الزمني =======================
function Timeline({ items, limit = 150 }) {
  const [n, setN] = useState(limit);
  const [open, setOpen] = useState(null);
  return (
    <div className="timeline">
      {items.slice(0, n).map((a) => {
        const v = VERB[a.action] || VERB.update;
        const ent = ENTITIES[a.entity];
        const changes = a.details?.changes || [];
        const isSes = a.entity === "session";
        const isOpen = open === a.id;
        return (
          <div key={a.id} className="tl-row">
            <span className="tl-ic" style={{ background: `${v.color}16`, color: v.color }}>
              <Icon name={v.icon} size={15} style={a.action === "logout" ? { transform: "scaleX(-1)" } : undefined} />
            </span>
            <div className="tl-body">
              <div className="tl-text">
                <b>{a.user_name}</b>{" "}
                {isSes ? v.ar : <>{v.ar} {a.action === "upload" ? "ملفاً" : a.action === "link" ? "" : ent?.ar}: <span className="tl-title">{a.title || "—"}</span></>}
                {a.action === "status" && changes[0] && <span className="tl-status"> — من «{changes[0].from}» إلى «<b>{changes[0].to}</b>»</span>}
                {a.action === "idle" && a.details?.started && <span className="muted"> — منذ {fmtTime(a.details.started)}</span>}
              </div>
              <div className="tl-meta">
                {ago(a.at)} · {fmtFull(a.at)}
                {a.project && !isSes && <> · {a.project}</>}
                {a.details?.device && <> · {a.details.device}</>}
                {a.action === "update" && changes.length > 0 && (
                  <button className="link-btn" style={{ marginInlineStart: 8 }} onClick={() => setOpen(isOpen ? null : a.id)}>
                    {isOpen ? "إخفاء التفاصيل" : `${changes.length} ${changes.length === 1 ? "تغيير" : "تغييرات"}: ${changes.slice(0, 3).map((c) => c.label).join("، ")}${changes.length > 3 ? "…" : ""}`}
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="tl-changes">
                  {changes.map((c, i) => (
                    <div key={i} className="tl-ch">
                      <span className="k">{c.label}</span>
                      <span className="from">{c.from}</span>
                      <span className="arr">←</span>
                      <span className="to">{c.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {items.length > n && (
        <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setN((x) => x + 150)}>عرض المزيد ({items.length - n})</button>
      )}
    </div>
  );
}

// ======================= النظرة العامة =======================
function Overview({ data, from, to, range, who, setWho, staff, openDay }) {
  const acts = who ? data.acts.filter((a) => a.user_name === who) : data.acts;
  const sessions = who ? data.sessions.filter((s) => s.user_name === who) : data.sessions;
  const rows = useMemo(() => perEmployee(acts, sessions, from, to), [acts, sessions, from, to]);

  // يومياً: العمليات + ساعات الاستخدام + عدد الحاضرين
  const days = useMemo(() => {
    const out = [];
    const now = Date.now();
    for (let d = new Date(from); d < to; d = addDays(d, 1)) {
      const k = dayKey(d);
      const nx = addDays(d, 1);
      const da = acts.filter((a) => a.entity !== "session" && dayKey(new Date(a.at)) === k);
      const people = new Set();
      let dur = 0;
      for (const s of sessions) {
        const c = clipDur(s, d, nx, now);
        if (c > 0) { dur += c; people.add(s.user_name); }
      }
      da.forEach((a) => people.add(a.user_name));
      out.push({ k, d, count: da.length, dur, people: people.size });
    }
    return out;
  }, [acts, sessions, from, to]);

  const max = Math.max(1, ...days.map((d) => d.count));
  const totalActs = acts.filter((a) => a.entity !== "session").length;
  const totalDur = rows.reduce((s, r) => s + r.dur, 0);
  const activeDays = days.filter((d) => d.count || d.dur).length;
  const top = rows.find((r) => r.actions > 0);

  const byEntity = {};
  for (const a of acts) if (a.entity !== "session") byEntity[a.entity] = (byEntity[a.entity] || 0) + 1;
  const byAction = {};
  for (const a of acts) if (a.entity !== "session") byAction[a.action] = (byAction[a.action] || 0) + 1;

  return (
    <>
      <div className="kpi-grid">
        <Stat icon="edit" color="#2563eb" num={totalActs} label={`إجمالي العمليات (${range} يوم)`} />
        <Stat icon="clock" color="#e05a50" num={fmtDur(totalDur)} label="إجمالي وقت الاستخدام" sub={activeDays ? `متوسط ${fmtDur(totalDur / activeDays)} / يوم نشط` : ""} />
        <Stat icon="calendar" color="#0d9488" num={`${activeDays}/${range}`} label="أيام فيها نشاط" />
        <Stat icon="flag" color="#7c3aed" num={who ? rows[0]?.tasks.size || 0 : top?.name || "—"} label={who ? "مهام عمل عليها" : "الأكثر نشاطاً"} sub={!who && top ? `${top.actions} عملية` : ""} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title">النشاط اليومي <span className="hint">(اضغط على أي يوم لعرض تفاصيله)</span></div>
        <div className={`act-bars ${range > 30 ? "dense" : ""}`}>
          {days.map((d) => (
            <button key={d.k} className="bar-col" onClick={() => openDay(d.k)}
              title={`${fmtDay(d.d)}\n${d.count} عملية · ${fmtDur(d.dur)} استخدام · ${d.people} موظف`}>
              <span className="bar-val">{d.count || ""}</span>
              <span className="bar" style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.35 }} />
              <span className="bar-lbl">{range <= 30 ? d.d.toLocaleDateString(LOC, { day: "numeric", month: range <= 7 ? "short" : undefined }) : d.d.getDate() === 1 || d.k === days[0].k ? d.d.toLocaleDateString(LOC, { month: "short" }) : ""}</span>
            </button>
          ))}
        </div>
        <div className="act-breakdown">
          {Object.entries(byEntity).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
            <span key={k} className="pill" style={{ color: ENTITIES[k]?.color }}>{ENTITIES[k]?.plural || k}: <b>{n}</b></span>
          ))}
          {Object.entries(byAction).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
            <span key={k} className="pill">{(VERB[k] || {}).ar || k}: <b>{n}</b></span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title">ملخص الموظفين <span className="hint">(اضغط على موظف للفلترة)</span></div>
        <div className="table-wrap">
          <table className="act-table">
            <thead><tr><th>الموظف</th><th>أيام الحضور</th><th>إجمالي الاستخدام</th><th>المتوسط اليومي</th><th>العمليات</th><th>المهام</th><th>آخر ظهور</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} onClick={() => setWho(who === r.name ? "" : r.name)} className={who === r.name ? "on" : ""}>
                  <td><span className="uname"><span className={`odot ${r.online ? "on" : ""}`} />{r.name}</span></td>
                  <td>{r.days.size}</td>
                  <td><b>{fmtDur(r.dur)}</b></td>
                  <td>{r.days.size ? fmtDur(r.dur / r.days.size) : "—"}</td>
                  <td>
                    <span className="mini-bar"><span style={{ width: `${Math.min(100, (r.actions / Math.max(1, rows[0]?.actions || 1)) * 100)}%` }} /></span>
                    {r.actions}
                  </td>
                  <td>{r.tasks.size}</td>
                  <td>{r.lastSeen ? `${ago(r.lastSeen)}` : "—"}</td>
                </tr>
              ))}
              {!who && staff.filter((u) => !rows.some((r) => r.name === u.name)).map((u) => (
                <tr key={u.id} className="absent" onClick={() => setWho(u.name)}>
                  <td><span className="uname"><span className="odot" />{u.name}</span></td>
                  <td colSpan={6} className="muted">لا يوجد نشاط في هذه الفترة</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
