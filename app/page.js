"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { tasksStore, meetingsStore, projectsStore, invoicesStore, paymentsStore, kpisStore, appSettings } from "@/lib/store";
import Icon from "@/components/Icon";
import TaskDetail from "@/components/TaskDetail";
import ReviewDialog from "@/components/ReviewDialog";
import StatReport from "@/components/StatReport";
import { useRole } from "@/components/RoleProvider";
import { CURRENCY, projManagers, isPublicKpi, STATUS_META, isDone, taskProgress } from "@/lib/constants";
import {
  taskStats, projectHealth, upcomingTasks, overdueTasks, daysUntil, relDays,
  invoiceRows, receivables, money, kpiAchievement,
} from "@/lib/metrics";
import { leavesApi, awayOn, upcomingLeaves, LEAVE_TYPES } from "@/lib/leaves";
import { mergeEvents, EVENT_TYPES } from "@/lib/calendar-seed";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const HEALTH_ORDER = { late: 0, risk: 1, ok: 2, hold: 3, done: 4 };
const STATUS_COLORS = { "Not Started": "#94a3b8", "In Progress": "#2563eb", "Pending Review": "#7c3aed", "Revision Needed": "#d97706", Approved: "#16a34a" };
const pad = (n) => String(n).padStart(2, "0");

function hijriToday() {
  try { return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date()); } catch { return ""; }
}
function greetWord() {
  const h = new Date().getHours();
  return h < 12 ? "صباح الخير" : h < 17 ? "مساء الخير" : "مساء النور";
}

// الرئيسية = التقرير الشامل: كل المؤشرات في شاشة واحدة بدون نزول
export default function Dashboard() {
  const router = useRouter();
  const { viewer, role, clientProject, scopeProjects, canApprove, canDeliver, canFinance, can } = useRole();
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [report, setReport] = useState(null); // نافذة التقرير المصغّر
  const [tab, setTab] = useState("overdue");

  async function reload() {
    const [tasks, meetings, projects, kpis, leaves, cal] = await Promise.all([
      tasksStore.list().catch(() => []),
      meetingsStore.list().catch(() => []),
      projectsStore.list().catch(() => []),
      kpisStore.list().catch(() => []),
      leavesApi.list().catch(() => []),
      appSettings.get("calendar_events").catch(() => null),
    ]);
    let invoices = [], payments = [];
    if (canFinance) {
      [invoices, payments] = await Promise.all([invoicesStore.list().catch(() => []), paymentsStore.list().catch(() => [])]);
    }
    setData({ tasks, meetings, projects, kpis, invoices, payments, leaves, events: mergeEvents(cal) });
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [canFinance]);

  const inScope = (name) => !scopeProjects || scopeProjects.includes(name);

  const s = useMemo(() => {
    if (!data) return null;
    const tasks = data.tasks.filter((t) => inScope(t.project));
    const projects = data.projects.filter((p) => inScope(p.name));
    const kpis = data.kpis.filter((k) => k.project && inScope(k.project) && (role !== "client" || isPublicKpi(k)));
    const all = taskStats(tasks);

    const projRows = projects.map((p) => {
      const pt = tasks.filter((t) => t.project === p.name);
      const st = taskStats(pt);
      const next = upcomingTasks(pt, 60)[0] || null;
      return { p, st, health: projectHealth(st, p.status), next, owner: projManagers(p)[0] || "", kpi: kpiAchievement(kpis.filter((k) => k.project === p.name)) };
    }).sort((a, b) => HEALTH_ORDER[a.health.key] - HEALTH_ORDER[b.health.key]);
    const healthCount = projRows.reduce((m, r) => { m[r.health.key] = (m[r.health.key] || 0) + 1; return m; }, {});

    const inv = role === "client" ? data.invoices.filter((v) => v.project && inScope(v.project)) : data.invoices;
    const fin = canFinance ? receivables(invoiceRows(inv, data.payments)) : null;

    const now = new Date().toISOString();
    const meetings = data.meetings
      .filter((m) => inScope(m.project) || !m.project)
      .filter((m) => m.status !== "Cancelled" && m.start_at >= now)
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 3);

    // توزيع الحالات
    const statusDist = Object.keys(STATUS_COLORS).map((k) => ({ k, n: tasks.filter((t) => t.status === k).length }));

    // المناسبة القادمة من الروزنامة
    const today = new Date(); const y = today.getFullYear();
    const tk = `${y}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const occ = (data.events || []).flatMap((e) => {
      if (!e.date) return [];
      if (e.yearly) return [`${y}-${e.date.slice(5)}`, `${y + 1}-${e.date.slice(5)}`].map((d) => ({ ...e, day: d }));
      return [{ ...e, day: e.date }];
    }).filter((e) => e.day >= tk && e.type !== "internal").sort((a, b) => a.day.localeCompare(b.day)).slice(0, 3);

    // المعتمد آخر 7 أيام
    const week = Date.now() - 7 * 86400000;
    const doneWeek = tasks.filter((t) => isDone(t) && new Date(t.reviewed_at || t.completed_at || 0).getTime() >= week).length;

    return {
      tasks, projects, all, projRows, healthCount, fin, meetings, statusDist, occ, doneWeek,
      kpiAll: kpiAchievement(kpis),
      upcoming: upcomingTasks(tasks, 14),
      overdue: overdueTasks(tasks),
      pending: all.pendingReview.slice().sort((a, b) => String(a.ready_at || "").localeCompare(String(b.ready_at || ""))),
      revision: all.revision,
      onHold: all.onHold,
      away: awayOn(data.leaves),
      leavesSoon: upcomingLeaves(data.leaves, 7),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, scopeProjects, role, canFinance]);

  function quickAction(t) {
    if (t.status === "Pending Review") { if (canApprove) setDialog({ task: t, mode: "approve" }); else router.push("/approvals"); return; }
    if (canDeliver) setDialog({ task: t, mode: "submit" });
  }

  if (!s) return <div className="cc-loading"><span className="spin" /> جاري تحميل التقرير الشامل…</div>;
  const { all, projRows, healthCount, fin, upcoming, overdue, pending, meetings, statusDist, occ, away } = s;
  const now = new Date();
  const statTotal = statusDist.reduce((a, b) => a + b.n, 0) || 1;

  const TABS = [
    { k: "overdue", l: "المتأخرة", n: overdue.length, c: "#e0574e" },
    { k: "upcoming", l: "القادمة", n: upcoming.length, c: "#2563eb" },
    { k: "pending", l: "بانتظار سيم", n: pending.length, c: "#7c3aed" },
    { k: "hold", l: "المعلّقة", n: s.onHold.length + s.revision.length, c: "#c88a2e" },
  ];

  return (
    <div className="cc">
      {/* الشريط العلوي: الترحيب + الملخّص + التاريخ */}
      <div className="cc-hero">
        <span className="cc-av">{(viewer?.name || "س").slice(0, 1)}</span>
        <div className="cc-hello">
          <h2>{greetWord()}، {(viewer?.name || "").split(" ")[0]} 👋</h2>
          <p>
            {clientProject ? "متابعة مشاريعك مع ڤيوليت — " : ""}
            <b>{projRows.length} مشاريع</b>: <span style={{ color: "#16a34a" }}>{healthCount.ok || 0} على المسار</span> · <span style={{ color: "#c88a2e" }}>{healthCount.risk || 0} معرّضة للتعثر</span> · <span style={{ color: "#e0574e" }}>{healthCount.late || 0} متعثرة</span>
            {pending.length ? <> · <b style={{ color: "#7c3aed" }}>{pending.length} بانتظار اعتماد سيم</b></> : null}
          </p>
        </div>
        <div className="cc-date">
          <b>{WEEKDAYS[now.getDay()]} {now.getDate()} {MONTHS[now.getMonth()]}</b>
          <small>{hijriToday()}</small>
        </div>
        <div className="cc-hero-acts">
          {can("reports") && <button className="btn ghost" onClick={() => router.push("/reports")}><Icon name="file" size={15} /> التقارير المفصّلة</button>}
          <button className="btn primary" onClick={() => router.push(pending.length && canApprove ? "/approvals" : "/tasks")}>
            {pending.length && canApprove ? `مراجعة الاعتمادات (${pending.length})` : "عرض المهام"}
          </button>
        </div>
      </div>

      {/* المؤشرات — كل بطاقة تفتح تقريراً مصغّراً */}
      <div className={`cc-stats${fin ? " five" : ""}`}>
        <Stat onClick={() => setReport("progress")} tone="#16a34a"
          icon={<span className="cc-ring" style={{ background: `conic-gradient(#16a34a ${all.progress * 3.6}deg, #ede7da 0)` }}><span>{all.progress}%</span></span>}
          num={`${all.progress}%`} lbl="نسبة الإنجاز" sub={`${all.done} من ${all.total} معتمدة · +${s.doneWeek} هذا الأسبوع`} />
        <Stat onClick={() => setReport("upcoming")} tone="#2563eb" ico="calendar"
          num={upcoming.length} lbl="تسليمات خلال 14 يوماً" sub={upcoming[0] ? `الأقرب ${relDays(upcoming[0].days)}` : "لا تسليمات قريبة"} />
        <Stat onClick={() => setReport("overdue")} tone="#e0574e" ico="alert"
          num={overdue.length} lbl="أعمال متأخرة" sub={s.onHold.length ? `${s.onHold.length} معلّقة` : "لا مهام معلّقة"} />
        <Stat onClick={() => setReport("pending")} tone="#7c3aed" ico="check"
          num={pending.length} lbl="اعتمادات معلّقة" sub={s.revision.length ? `${s.revision.length} مطلوب تعديلها` : "بانتظار قرار سيم"} />
        {fin && (
          <Stat onClick={() => setReport("finance")} tone="#c88a2e" ico="briefcase"
            num={<>{money(fin.total)} <small>{CURRENCY}</small></>} lbl="المستحقات المالية"
            sub={fin.overdueTotal ? <span style={{ color: "#e0574e" }}>{money(fin.overdueTotal)} متأخرة</span> : fin.open[0] ? `الأقرب ${relDays(fin.open[0].days)}` : "لا مستحقات"} />
        )}
      </div>

      {/* الشبكة الرئيسية: تملأ بقية الشاشة */}
      <div className="cc-grid">
        {/* حالة المشاريع */}
        <section className="cc-card cc-projects">
          <header>
            <h3><span className="bar" />حالة المشاريع</h3>
            <div className="cc-health">
              {[["ok", "على المسار", "#16a34a"], ["risk", "معرّضة", "#c88a2e"], ["late", "متعثرة", "#e0574e"]].map(([k, l, c]) => (
                <span key={k}><i style={{ background: c }} />{l} <b>{healthCount[k] || 0}</b></span>
              ))}
            </div>
            <Link href="/projects" className="cc-more">الكل</Link>
          </header>
          <div className="cc-scroll">
            <div className="cc-ptable">
              <div className="cc-prow head"><span>المشروع</span><span>الحالة</span><span>الإنجاز</span><span>متأخرة</span><span>سيم</span><span>المستهدفات</span><span>التسليم القادم</span></div>
              {projRows.length === 0 ? <div className="cc-empty">لا مشاريع.</div> : projRows.map(({ p, st, health, next, owner, kpi }) => (
                <div className="cc-prow" key={p.id} onClick={() => router.push(`/projects/${p.id}`)}>
                  <span className="cc-pname"><i style={{ background: p.color || "var(--primary)" }} /><span><b>{p.name}</b><small>{owner ? `ڤيوليت: ${owner}` : `${st.total} مهمة`}</small></span></span>
                  <span><em className="cc-pill" style={{ background: health.bg, color: health.color }}>{health.label}</em></span>
                  <span className="cc-pprog"><span className="t"><i style={{ width: `${st.progress}%`, background: p.color || "var(--primary)" }} /></span><b>{st.progress}%</b></span>
                  <span className="num" style={{ color: st.overdue.length ? "#e0574e" : "var(--muted)" }}>{st.overdue.length}</span>
                  <span className="num" style={{ color: st.pendingReview.length ? "#7c3aed" : "var(--muted)" }}>{st.pendingReview.length}</span>
                  <span className="num">{kpi == null ? "—" : `${kpi}%`}</span>
                  <span className="cc-pnext">{next ? <><b>{next.t.deliverable || next.t.task}</b><small>{relDays(next.days)}</small></> : <small className="muted">—</small>}</span>
                </div>
              ))}
            </div>
          </div>
          {/* توزيع حالات المهام */}
          <footer className="cc-dist">
            <div className="cc-dist-bar">
              {statusDist.filter((x) => x.n).map((x) => <i key={x.k} title={`${STATUS_META[x.k]?.ar}: ${x.n}`} style={{ width: `${(x.n / statTotal) * 100}%`, background: STATUS_COLORS[x.k] }} />)}
            </div>
            <div className="cc-dist-leg">
              {statusDist.map((x) => <span key={x.k}><i style={{ background: STATUS_COLORS[x.k] }} />{STATUS_META[x.k]?.ar} <b>{x.n}</b></span>)}
            </div>
          </footer>
        </section>

        {/* قائمة المتابعة (تبويبات) */}
        <section className="cc-card cc-watch">
          <header>
            <h3><span className="bar" />قائمة المتابعة</h3>
          </header>
          <div className="cc-tabs">
            {TABS.map((t) => (
              <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)} style={tab === t.k ? { "--c": t.c } : undefined}>
                {t.l} <b style={{ color: t.c }}>{t.n}</b>
              </button>
            ))}
          </div>
          <div className="cc-scroll">
            {tab === "overdue" && (overdue.length === 0 ? <Empty t="لا أعمال متأخرة ✓" /> : overdue.map(({ t, days }) => (
              <div className="cc-item" key={t.id} onClick={() => setViewing(t)}>
                <span className="cc-dot" style={{ background: "#e0574e" }} />
                <div className="cc-ib">
                  <b>{t.task}</b>
                  <small>{t.project}{t.assigned_to ? ` · ${t.assigned_to}` : ""} · {t.blocker ? `السبب: ${t.blocker}` : "السبب غير محدد"}{t.waiting_on ? ` · على ${t.waiting_on}` : ""}</small>
                </div>
                <em className="cc-pill" style={{ background: "#fdeceb", color: "#e0574e" }}>{relDays(days)}</em>
              </div>
            )))}
            {tab === "upcoming" && (upcoming.length === 0 ? <Empty t="لا تسليمات خلال 14 يوماً" /> : upcoming.map(({ t, days }) => (
              <div className="cc-item" key={t.id}>
                <button className="cc-check" title={t.status === "Pending Review" ? "بانتظار مراجعة سيم" : "جاهز للتسليم — إرسال لمراجعة سيم"} onClick={() => quickAction(t)} style={t.status === "Pending Review" ? { borderColor: "#7c3aed", background: "#f1ebfd" } : undefined} />
                <div className="cc-ib" onClick={() => setViewing(t)}>
                  <b>{t.task}</b>
                  <small>{t.project}{t.deliverable ? ` · ${t.deliverable}` : ""}{t.assigned_to ? ` · ${t.assigned_to}` : ""} · {taskProgress(t)}%</small>
                </div>
                <em className="cc-pill" style={days <= 2 ? { background: "#fbf0de", color: "#c88a2e" } : { background: "#eaf1fd", color: "#2563eb" }}>{relDays(days)}</em>
              </div>
            )))}
            {tab === "pending" && (pending.length === 0 ? <Empty t="لا أعمال بانتظار المراجعة ✓" /> : pending.map((t) => {
              const wait = t.ready_at ? -daysUntil(t.ready_at.slice(0, 10)) : null;
              return (
                <div className="cc-item" key={t.id}>
                  <span className="cc-dot" style={{ background: "#7c3aed" }} />
                  <div className="cc-ib" onClick={() => setViewing(t)}>
                    <b>{t.task}</b>
                    <small>{t.project}{t.deliverable ? ` · ${t.deliverable}` : ""} · أرسلها {t.ready_by || t.assigned_to || "—"}</small>
                  </div>
                  {canApprove
                    ? <button className="btn sm primary" onClick={() => setDialog({ task: t, mode: "approve" })}>اعتماد</button>
                    : <em className="cc-pill" style={{ background: "#f1ebfd", color: "#7c3aed" }}>{wait == null ? "بانتظار" : wait === 0 ? "منذ اليوم" : `منذ ${wait} يوم`}</em>}
                </div>
              );
            }))}
            {tab === "hold" && (s.onHold.length + s.revision.length === 0 ? <Empty t="لا مهام معلّقة أو مطلوب تعديلها ✓" /> : [...s.revision, ...s.onHold.filter((t) => !s.revision.includes(t))].map((t) => (
              <div className="cc-item" key={t.id} onClick={() => setViewing(t)}>
                <span className="cc-dot" style={{ background: t.status === "Revision Needed" ? "#d97706" : "#c88a2e" }} />
                <div className="cc-ib">
                  <b>{t.task}</b>
                  <small>{t.project} · {t.status === "Revision Needed" ? `مطلوب تعديل${t.review_note ? `: ${t.review_note}` : ""}` : `معلّقة${t.blocker ? `: ${t.blocker}` : ""}`}</small>
                </div>
                <em className="cc-pill" style={{ background: "#fbf0de", color: "#c88a2e" }}>{t.status === "Revision Needed" ? "تعديل" : "معلّقة"}</em>
              </div>
            )))}
          </div>
        </section>

        {/* العمود الجانبي: الفريق اليوم + القادم + المالية */}
        <div className="cc-side">
          <section className="cc-card cc-mini">
            <header><h3><span className="bar" />الفريق اليوم</h3>{can("leaves") && <Link href="/leaves" className="cc-more">الإجازات</Link>}</header>
            {away.length === 0 ? (
              <div className="cc-allin"><Icon name="check" size={16} /> الفريق كامل اليوم</div>
            ) : (
              <div className="cc-away">
                {away.map((l) => {
                  const tp = LEAVE_TYPES[l.type] || LEAVE_TYPES.other;
                  return <span key={l.id} style={{ background: tp.bg, color: tp.color }} title={`${tp.ar} حتى ${l.end}`}>{tp.emoji} {l.person}</span>;
                })}
              </div>
            )}
            {s.leavesSoon.length > 0 && <small className="cc-soon">قريباً: {s.leavesSoon.map((l) => `${l.person} (${l.start.slice(5).replace("-", "/")})`).join("، ")}</small>}
          </section>

          <section className="cc-card cc-mini cc-grow">
            <header><h3><span className="bar" />القادم</h3><Link href="/meetings" className="cc-more">الاجتماعات</Link></header>
            <div className="cc-scroll">
              {meetings.length === 0 && occ.length === 0 && <Empty t="لا شيء قادم" />}
              {meetings.map((m) => {
                const d = new Date(m.start_at);
                return (
                  <div className="cc-next" key={m.id} onClick={() => router.push("/meetings")}>
                    <span className="cc-db" style={{ background: "#e0f2fe", color: "#0369a1" }}><b>{d.getDate()}</b><small>{MONTHS[d.getMonth()]}</small></span>
                    <div className="cc-ib"><b>{m.title}</b><small>اجتماع · {d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}{m.project ? ` · ${m.project}` : ""}</small></div>
                  </div>
                );
              })}
              {occ.map((e) => {
                const d = new Date(e.day); const c = EVENT_TYPES[e.type]?.color || "#64748b";
                const left = daysUntil(e.day);
                return (
                  <div className="cc-next" key={`${e.id}-${e.day}`} onClick={() => router.push("/calendar")}>
                    <span className="cc-db" style={{ background: `${c}18`, color: c }}><b>{d.getDate()}</b><small>{MONTHS[d.getMonth()]}</small></span>
                    <div className="cc-ib"><b>{e.title}</b><small>{EVENT_TYPES[e.type]?.ar} · {left === 0 ? "اليوم" : `بعد ${left} يوم`}</small></div>
                  </div>
                );
              })}
            </div>
          </section>

          {fin ? (
            <section className="cc-card cc-mini cc-fin" onClick={() => setReport("finance")}>
              <header><h3><span className="bar" />المالية</h3><span className="cc-more">تفاصيل</span></header>
              <div className="cc-fin-row">
                <div><small>متأخرة</small><b style={{ color: "#e0574e" }}>{money(fin.overdueTotal)}</b></div>
                <div><small>خلال 30 يوم</small><b style={{ color: "#c88a2e" }}>{money(fin.due30Total)}</b></div>
                <div><small>المتبقّي</small><b>{money(fin.total)}</b></div>
              </div>
            </section>
          ) : (
            <section className="cc-card cc-mini">
              <header><h3><span className="bar" />تحقق المستهدفات</h3></header>
              <div className="cc-kpi"><b>{s.kpiAll == null ? "—" : `${s.kpiAll}%`}</b><span className="t"><i style={{ width: `${s.kpiAll || 0}%` }} /></span></div>
            </section>
          )}
        </div>
      </div>

      {report && (
        <StatReport kind={report} onClose={() => setReport(null)}
          d={{ tasks: s.tasks, projects: s.projects, overdue, upcoming, pending, revision: s.revision, fin }}
          onOpenTask={(t) => setViewing(t)}
          onNavigate={(href) => { setReport(null); router.push(href); }} />
      )}
      {viewing && (
        <TaskDetail task={viewing} onClose={() => setViewing(null)}
          onUpdate={async (id, patch) => { await tasksStore.update(id, patch); await reload(); }}
          onChanged={reload}
          onEdit={() => { setViewing(null); router.push(`/tasks?q=${encodeURIComponent(viewing.task.slice(0, 30))}`); }}
          onDelete={async (t) => { if (confirm(`حذف المهمة؟\n\n${t.task}`)) { await tasksStore.remove(t.id); setViewing(null); await reload(); } }} />
      )}
      {dialog && <ReviewDialog task={dialog.task} mode={dialog.mode} onClose={() => setDialog(null)} onDone={reload} />}
    </div>
  );
}

function Stat({ icon, ico, tone, num, lbl, sub, onClick }) {
  return (
    <button type="button" className="cc-stat" onClick={onClick} style={{ "--tone": tone }} title="اضغط لعرض التقرير المصغّر">
      {icon || <span className="cc-sic" style={{ background: `${tone}17`, color: tone }}><Icon name={ico} size={21} /></span>}
      <span className="cc-sbody">
        <span className="num">{num}</span>
        <span className="lbl">{lbl}</span>
        {sub && <span className="sub">{sub}</span>}
      </span>
      <span className="cc-sgo"><Icon name="eye" size={14} /></span>
    </button>
  );
}

function Empty({ t }) {
  return <div className="cc-empty">{t}</div>;
}
