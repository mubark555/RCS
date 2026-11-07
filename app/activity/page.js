"use client";

// سجل الأنشطة: من دخل ومتى خرج، وماذا فعل — يومياً لكل موظف، مع نظرة عامة على الفترات السابقة
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useRole } from "@/components/RoleProvider";
import { activityStore, onDataChange } from "@/lib/store";
import { listSessions } from "@/lib/sessions";
import { summarize, sessionEvents, sessionEnd, clipDuration, dayKey } from "@/lib/activityCore.mjs";

const LOC = "ar-SA-u-ca-gregory";
const FINANCE_ENTITIES = ["فاتورة", "دفعة"];
const parseDay = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" });
const fmtDay = (d) => d.toLocaleDateString(LOC, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtFull = (iso) => new Date(iso).toLocaleString(LOC, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

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

const ACTION_META = {
  create: { verb: "أضاف", color: "#16a34a", ico: "plus" },
  update: { verb: "حدّث", color: "#2563eb", ico: "edit" },
  delete: { verb: "حذف", color: "#e0574e", ico: "trash" },
  approve: { verb: "اعتمد", color: "#16a34a", ico: "check" },
  revision: { verb: "طلب تعديل على", color: "#d97706", ico: "alert" },
  submit: { verb: "أرسل للمراجعة", color: "#7c3aed", ico: "arrow" },
  login: { verb: "سجّل دخوله إلى النظام", color: "#7c3aed", ico: "arrow" },
  logout: { verb: "سجّل خروجه من النظام", color: "#64748b", ico: "arrow" },
  idle: { verb: "انتهت جلسته (آخر ظهور)", color: "#94a3b8", ico: "clock" },
};

// مجموعات التصفية (نفس تصنيفات السجل السابقة + الدخول والخروج)
const GROUPS = [
  { k: "", ar: "الكل", test: () => true },
  { k: "session", ar: "الدخول والخروج", test: (a) => a.entity === "جلسة" },
  { k: "tasks", ar: "المهام", test: (a) => a.entity === "مهمة" || a.entity === "تسليم" },
  { k: "approvals", ar: "الاعتمادات", test: (a) => ["approve", "revision", "submit"].includes(a.action) },
  { k: "meetings", ar: "الاجتماعات", test: (a) => a.entity === "اجتماع" },
  { k: "projects", ar: "المشاريع", test: (a) => a.entity === "مشروع" },
  { k: "finance", ar: "المالية والسداد", test: (a) => FINANCE_ENTITIES.includes(a.entity), finance: true },
];

const RANGES = [7, 30, 90];

export default function ActivityPage() {
  const { users, canFinance } = useRole();
  const [mode, setMode] = useState("day");
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [range, setRange] = useState(7);
  const [who, setWho] = useState("");
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);

  const { from, to } = useMemo(() => {
    if (mode === "day") { const f = parseDay(day); return { from: f, to: addDays(f, 1) }; }
    const t = addDays(parseDay(dayKey(new Date())), 1);
    return { from: addDays(t, -range), to: t };
  }, [mode, day, range]);

  useEffect(() => {
    let alive = true;
    Promise.all([activityStore.listRange({ from, to }).catch(() => []), listSessions({ from, to }).catch(() => [])])
      .then(([acts, sessions]) => {
        if (!alive) return;
        // سجلات المالية تظهر فقط لمن يملك صلاحية المالية
        setData({ acts: acts.filter((a) => canFinance || !FINANCE_ENTITIES.includes(a.entity)), sessions });
      });
    return () => { alive = false; };
  }, [from, to, tick, canFinance]);

  // عند تغيير اليوم/الفترة نعرض «جاري التحميل» (والتحديث الحيّ لا يمسح الشاشة)
  useEffect(() => { setData(null); }, [from, to]);

  // تحديث حيّ: كل دقيقة، وعند أي تعديل في النظام
  useEffect(() => {
    const iv = setInterval(() => setTick((x) => x + 1), 60_000);
    const off = onDataChange(() => setTimeout(() => setTick((x) => x + 1), 1500));
    return () => { clearInterval(iv); off(); };
  }, []);

  const staff = useMemo(() => (users || []).filter((u) => u.status !== "suspended"), [users]);
  const today = dayKey(new Date());

  return (
    <div>
      <div className="ax-toolbar">
        <div className="seg">
          <button className={mode === "day" ? "on" : ""} onClick={() => setMode("day")}>يومي</button>
          <button className={mode === "overview" ? "on" : ""} onClick={() => setMode("overview")}>نظرة عامة</button>
        </div>

        {mode === "day" ? (
          <div className="ax-daynav">
            <button className="btn sm ghost" title="اليوم السابق" onClick={() => setDay(dayKey(addDays(parseDay(day), -1)))}>›</button>
            <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <button className="btn sm ghost" title="اليوم التالي" disabled={day >= today} onClick={() => setDay(dayKey(addDays(parseDay(day), 1)))}>‹</button>
            {day !== today && <button className="btn sm" onClick={() => setDay(today)}>اليوم</button>}
          </div>
        ) : (
          <div className="seg">
            {RANGES.map((r) => <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>آخر {r} يوم</button>)}
          </div>
        )}

        <select className="ax-select" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">كل الموظفين</option>
          {staff.map((u) => <option key={u.id} value={u.name}>{u.name}{u.title ? ` — ${u.title}` : ""}</option>)}
        </select>
      </div>

      <div className="ax-heading">
        {mode === "day"
          ? fmtDay(parseDay(day))
          : `من ${from.toLocaleDateString(LOC, { day: "numeric", month: "long" })} إلى ${addDays(to, -1).toLocaleDateString(LOC, { day: "numeric", month: "long", year: "numeric" })}`}
        {who && <span className="pill">{who} <button className="ax-link" onClick={() => setWho("")} aria-label="إلغاء الفلتر">✕</button></span>}
      </div>

      {!data ? (
        <div className="empty">جاري التحميل…</div>
      ) : mode === "day" ? (
        <DayView data={data} from={from} to={to} who={who} setWho={setWho} group={group} setGroup={setGroup} q={q} setQ={setQ} staff={staff} canFinance={canFinance} />
      ) : (
        <Overview data={data} from={from} to={to} range={range} who={who} setWho={setWho} staff={staff} openDay={(k) => { setDay(k); setMode("day"); }} />
      )}
    </div>
  );
}

// ======================= العرض اليومي =======================
function DayView({ data, from, to, who, setWho, group, setGroup, q, setQ, staff, canFinance }) {
  const timeline = useMemo(
    () => [...data.acts, ...sessionEvents(data.sessions, from, to)].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [data, from, to]
  );
  const rows = useMemo(() => summarize(data.acts, data.sessions, from, to), [data, from, to]);
  const mine = (a) => !who || a.actor === who;
  const groups = GROUPS.filter((g) => !g.finance || canFinance);

  const filtered = useMemo(() => {
    const g = GROUPS.find((x) => x.k === group) || GROUPS[0];
    const t = q.trim().toLowerCase();
    return timeline.filter((a) => mine(a) && g.test(a) && (!t || `${a.label} ${a.project || ""} ${a.actor} ${a.entity}`.toLowerCase().includes(t)));
  }, [timeline, who, group, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = {};
    for (const a of timeline) if (mine(a)) for (const g of GROUPS) if (g.test(a)) c[g.k] = (c[g.k] || 0) + 1;
    return c;
  }, [timeline, who]); // eslint-disable-line react-hooks/exhaustive-deps

  // المهام التي تم العمل عليها في هذا اليوم
  const tasks = useMemo(() => {
    const m = new Map();
    for (const a of data.acts) {
      if ((a.entity !== "مهمة" && a.entity !== "تسليم") || !mine(a)) continue;
      const k = a.entity_id || a.label;
      const e = m.get(k) || { title: a.label, project: a.project, count: 0, by: new Set(), last: a };
      e.count += 1;
      e.by.add(a.actor);
      if (a.created_at > e.last.created_at) e.last = a;
      m.set(k, e);
    }
    return Array.from(m.values()).sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [data, who]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = who ? rows.filter((r) => r.name === who) : rows;
  const present = shown.filter((r) => r.sessions > 0 || r.actions > 0);
  const totalDur = shown.reduce((s, r) => s + r.dur, 0);
  const totalActs = shown.reduce((s, r) => s + r.actions, 0);
  const online = shown.filter((r) => r.online).length;
  const absent = who ? [] : staff.filter((u) => u.role !== "client" && !rows.some((r) => r.name === u.name && (r.sessions || r.actions)));
  const userSessions = who ? data.sessions.filter((s) => s.user_name === who) : [];

  return (
    <>
      <div className="kpi-grid">
        <Stat icon="users" color="#7c3aed" num={who ? (present.length ? "حاضر" : "غائب") : `${present.length}`} label={who ? "حالة الحضور" : "موظفون نشطون"} sub={online ? `${online} متصل الآن` : ""} />
        <Stat icon="clock" color="#e05a50" num={fmtDur(totalDur)} label="وقت الاستخدام" />
        <Stat icon="edit" color="#2563eb" num={totalActs} label="العمليات" />
        <Stat icon="tasks" color="#16a34a" num={tasks.length} label="مهام تم العمل عليها" />
      </div>

      <div className="card" style={{ marginBottom: 18, borderRadius: 22 }}>
        <div className="section-title"><span>الحضور والانصراف</span></div>
        {shown.length === 0 && absent.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>لا يوجد نشاط في هذا اليوم.</div>
        ) : (
          <div className="table-wrap">
            <table className="ax-table">
              <thead><tr><th>الموظف</th><th>أول دخول</th><th>آخر خروج</th><th>مدة الاستخدام</th><th>الجلسات</th><th>العمليات</th><th>المهام</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.name} onClick={() => setWho(who === r.name ? "" : r.name)} className={who === r.name ? "on" : ""}>
                    <td><span className="ax-uname"><span className={`ax-dot ${r.online ? "on" : ""}`} />{r.name}</span></td>
                    <td>{r.first ? fmtTime(r.first) : "—"}</td>
                    <td>{r.online ? <span className="ax-online">متصل الآن</span> : r.last ? <>{fmtTime(r.last.at)}{!r.last.explicit && <small className="muted"> (آخر ظهور)</small>}</> : "—"}</td>
                    <td><b>{fmtDur(r.dur)}</b></td>
                    <td>{r.sessions}</td>
                    <td>{r.actions}</td>
                    <td>{r.tasks.size}</td>
                  </tr>
                ))}
                {absent.map((u) => (
                  <tr key={u.id} className="absent" onClick={() => setWho(u.name)}>
                    <td><span className="ax-uname"><span className="ax-dot" />{u.name}</span></td>
                    <td colSpan={6} className="muted">لم يسجّل دخولاً في هذا اليوم</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {who && userSessions.length > 0 && (
          <div className="ax-sessions">
            {userSessions.slice().sort((a, b) => a.started_at.localeCompare(b.started_at)).map((s) => {
              const e = sessionEnd(s);
              return (
                <span key={s.id} className="ax-ses">
                  <Icon name="clock" size={13} /> {fmtTime(s.started_at)} ← {e.active ? "الآن" : fmtTime(e.at)} · {fmtDur(new Date(e.at) - new Date(s.started_at))}
                  {s.device && <small className="muted"> · {s.device}</small>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="ax-2col">
        <div className="card" style={{ borderRadius: 22 }}>
          <div className="section-title"><span>سجل الأنشطة</span></div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12, paddingInlineStart: 2 }}>
            توثيق دائم للدخول والخروج والإضافات والتعديلات والاعتمادات — اسم المستخدم والتاريخ وتفاصيل التغيير.
          </div>
          <div className="ax-chips">
            {groups.map((g) => (
              <span key={g.k} className={`att-chip ${group === g.k ? "on" : ""}`} onClick={() => setGroup(g.k)}>
                {g.ar}{counts[g.k] ? <span className="ax-n">{counts[g.k]}</span> : null}
              </span>
            ))}
          </div>
          <input className="ax-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في السجل (مهمة، مشروع، موظف)…" />
          {filtered.length === 0 ? <div className="empty" style={{ padding: 24 }}>لا توجد أنشطة مطابقة.</div> : <Timeline items={filtered} />}
        </div>

        <div className="card" style={{ borderRadius: 22 }}>
          <div className="section-title"><span>المهام التي تم العمل عليها ({tasks.length})</span></div>
          {tasks.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>لم تُعدَّل أي مهمة.</div>
          ) : (
            tasks.map((t, i) => {
              const st = (t.last.details?.changes || []).find((c) => c.field === "status");
              return (
                <Link key={i} href={`/tasks?q=${encodeURIComponent(t.title || "")}`} className="ax-task">
                  <div className="ax-task-title">{t.title || "—"}</div>
                  <div className="ax-task-meta">
                    {t.project && <span className="pill">{t.project}</span>}
                    <span>{t.count} {t.count === 1 ? "عملية" : "عمليات"}</span>
                    <span>·</span>
                    <span>{Array.from(t.by).join("، ")}</span>
                    <span>·</span>
                    <span>آخرها {fmtTime(t.last.created_at)}</span>
                  </div>
                  {st && <div className="ax-task-meta" style={{ color: "#d97706" }}>الحالة: من «{st.from}» إلى «{st.to}»</div>}
                </Link>
              );
            })
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
        {sub && <div className="ax-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ======================= الخط الزمني =======================
function Timeline({ items }) {
  const [n, setN] = useState(150);
  const [open, setOpen] = useState(null);
  return (
    <div>
      {items.slice(0, n).map((a) => {
        const m = ACTION_META[a.action] || ACTION_META.update;
        const changes = a.details?.changes || [];
        const isSes = a.entity === "جلسة";
        const isOpen = open === a.id;
        const st = changes.length === 1 && changes[0].field === "status" ? changes[0] : null;
        return (
          <div key={a.id} className="ax-row">
            <span className="ax-ic" style={{ background: `${m.color}1a`, color: m.color }}>
              <Icon name={m.ico} size={14} style={a.action === "logout" ? { transform: "scaleX(-1)" } : undefined} />
            </span>
            <div className="ax-body">
              <div className="ax-txt">
                <b>{a.actor || "مستخدم"}</b>{" "}
                {isSes ? m.verb : <>{m.verb} {a.entity}{a.label ? <> : <span className="ax-label">{a.label}</span></> : null}</>}
                {st && <span className="ax-st"> — من «{st.from}» إلى «<b>{st.to}</b>»</span>}
                {a.action === "idle" && a.details?.started && <span className="muted"> — منذ {fmtTime(a.details.started)}</span>}
              </div>
              <div className="ax-time">
                {ago(a.created_at)} · {fmtFull(a.created_at)}
                {a.project && !isSes ? <> · {a.project}</> : null}
                {a.details?.device ? <> · {a.details.device}</> : null}
                {changes.length > 0 && !st && (
                  <button className="ax-link" onClick={() => setOpen(isOpen ? null : a.id)}>
                    {isOpen ? "إخفاء التفاصيل" : `${changes.length} ${changes.length === 1 ? "تغيير" : "تغييرات"}: ${changes.slice(0, 3).map((c) => c.label).join("، ")}${changes.length > 3 ? "…" : ""}`}
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="ax-changes">
                  {changes.map((c, i) => (
                    <div key={i} className="ax-ch">
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
      {items.length > n && <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setN((x) => x + 150)}>عرض المزيد ({items.length - n})</button>}
    </div>
  );
}

// ======================= النظرة العامة =======================
function Overview({ data, from, to, range, who, setWho, staff, openDay }) {
  const acts = useMemo(() => (who ? data.acts.filter((a) => a.actor === who) : data.acts), [data, who]);
  const sessions = useMemo(() => (who ? data.sessions.filter((s) => s.user_name === who) : data.sessions), [data, who]);
  const rows = useMemo(() => summarize(acts, sessions, from, to), [acts, sessions, from, to]);

  const days = useMemo(() => {
    const out = [];
    const now = Date.now();
    for (let d = new Date(from); d < to; d = addDays(d, 1)) {
      const k = dayKey(d);
      const nx = addDays(d, 1);
      const count = acts.filter((a) => dayKey(new Date(a.created_at)) === k).length;
      const people = new Set();
      let dur = 0;
      for (const s of sessions) {
        const c = clipDuration(s, d, nx, now);
        if (c > 0) { dur += c; people.add(s.user_name); }
      }
      acts.forEach((a) => dayKey(new Date(a.created_at)) === k && people.add(a.actor));
      out.push({ k, d, count, dur, people: people.size });
    }
    return out;
  }, [acts, sessions, from, to]);

  const max = Math.max(1, ...days.map((d) => d.count));
  const totalDur = rows.reduce((s, r) => s + r.dur, 0);
  const activeDays = days.filter((d) => d.count || d.dur).length;
  const top = rows.find((r) => r.actions > 0);
  const byEntity = {};
  for (const a of acts) byEntity[a.entity || "—"] = (byEntity[a.entity || "—"] || 0) + 1;

  return (
    <>
      <div className="kpi-grid">
        <Stat icon="edit" color="#2563eb" num={acts.length} label={`العمليات (${range} يوم)`} />
        <Stat icon="clock" color="#e05a50" num={fmtDur(totalDur)} label="وقت الاستخدام" sub={activeDays ? `متوسط ${fmtDur(totalDur / activeDays)} / يوم نشط` : ""} />
        <Stat icon="calendar" color="#0d9488" num={`${activeDays}/${range}`} label="أيام فيها نشاط" />
        <Stat icon="flag" color="#7c3aed" num={who ? rows[0]?.tasks.size || 0 : top?.name || "—"} label={who ? "مهام عمل عليها" : "الأكثر نشاطاً"} sub={!who && top ? `${top.actions} عملية` : ""} />
      </div>

      <div className="card" style={{ marginBottom: 18, borderRadius: 22 }}>
        <div className="section-title"><span>النشاط اليومي</span></div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>اضغط على أي يوم لعرض تفاصيله.</div>
        <div className={`ax-bars ${range > 30 ? "dense" : ""}`}>
          {days.map((d) => (
            <button key={d.k} className="ax-bar-col" onClick={() => openDay(d.k)} title={`${fmtDay(d.d)}\n${d.count} عملية · ${fmtDur(d.dur)} استخدام · ${d.people} موظف`}>
              <span className="ax-bar-val">{d.count || ""}</span>
              <span className="ax-bar" style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.35 }} />
              <span className="ax-bar-lbl">
                {range <= 30 ? d.d.toLocaleDateString(LOC, { day: "numeric", month: range <= 7 ? "short" : undefined }) : d.d.getDate() === 1 || d.k === days[0].k ? d.d.toLocaleDateString(LOC, { month: "short" }) : ""}
              </span>
            </button>
          ))}
        </div>
        {Object.keys(byEntity).length > 0 && (
          <div className="ax-breakdown">
            {Object.entries(byEntity).sort((a, b) => b[1] - a[1]).map(([k, n]) => <span key={k} className="pill">{k}: <b>{n}</b></span>)}
          </div>
        )}
      </div>

      <div className="card" style={{ borderRadius: 22 }}>
        <div className="section-title"><span>ملخص الموظفين</span></div>
        <div className="table-wrap">
          <table className="ax-table">
            <thead><tr><th>الموظف</th><th>أيام الحضور</th><th>إجمالي الاستخدام</th><th>المتوسط اليومي</th><th>العمليات</th><th>المهام</th><th>آخر ظهور</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} onClick={() => setWho(who === r.name ? "" : r.name)} className={who === r.name ? "on" : ""}>
                  <td><span className="ax-uname"><span className={`ax-dot ${r.online ? "on" : ""}`} />{r.name}</span></td>
                  <td>{r.days.size}</td>
                  <td><b>{fmtDur(r.dur)}</b></td>
                  <td>{r.days.size ? fmtDur(r.dur / r.days.size) : "—"}</td>
                  <td><span className="ax-mini"><span style={{ width: `${Math.min(100, (r.actions / Math.max(1, rows[0]?.actions || 1)) * 100)}%` }} /></span>{r.actions}</td>
                  <td>{r.tasks.size}</td>
                  <td>{r.lastSeen ? ago(r.lastSeen) : "—"}</td>
                </tr>
              ))}
              {!who && staff.filter((u) => u.role !== "client" && !rows.some((r) => r.name === u.name)).map((u) => (
                <tr key={u.id} className="absent" onClick={() => setWho(u.name)}>
                  <td><span className="ax-uname"><span className="ax-dot" />{u.name}</span></td>
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
