"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { tasksStore, meetingsStore, projectsStore, invoicesStore, paymentsStore, kpisStore } from "@/lib/store";
import Icon from "@/components/Icon";
import ActivityFeed from "@/components/ActivityFeed";
import TaskDetail from "@/components/TaskDetail";
import ReviewDialog from "@/components/ReviewDialog";
import { useRole } from "@/components/RoleProvider";
import { CURRENCY, projManagers, isPublicKpi } from "@/lib/constants";
import {
  taskStats, projectHealth, upcomingTasks, overdueTasks, daysUntil, relDays,
  invoiceRows, receivables, money, kpiAchievement,
} from "@/lib/metrics";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

// الرئيسية = ملخّص تنفيذي: حالة المشاريع، الإنجاز، التسليمات القادمة، المتأخر، الاعتمادات المعلّقة، والمستحقات المالية
export default function Dashboard() {
  const router = useRouter();
  const { viewer, role, clientProject, scopeProjects, canApprove, canDeliver, canFinance } = useRole();
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [viewing, setViewing] = useState(null);

  async function reload() {
    const [tasks, meetings, projects, kpis] = await Promise.all([
      tasksStore.list().catch(() => []),
      meetingsStore.list().catch(() => []),
      projectsStore.list().catch(() => []),
      kpisStore.list().catch(() => []),
    ]);
    let invoices = [], payments = [];
    if (canFinance) {
      [invoices, payments] = await Promise.all([invoicesStore.list().catch(() => []), paymentsStore.list().catch(() => [])]);
    }
    setData({ tasks, meetings, projects, kpis, invoices, payments });
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
      return {
        p, st, health: projectHealth(st, p.status), next,
        owner: projManagers(p)[0] || "",
        kpi: kpiAchievement(kpis.filter((k) => k.project === p.name)),
      };
    }).sort((a, b) => ({ late: 0, risk: 1, ok: 2, hold: 3, done: 4 }[a.health.key] - { late: 0, risk: 1, ok: 2, hold: 3, done: 4 }[b.health.key]));

    const healthCount = projRows.reduce((m, r) => { m[r.health.key] = (m[r.health.key] || 0) + 1; return m; }, {});

    // المالية: الفواتير ضمن النطاق (ممثل سيم يرى فواتير مشاريعه فقط)
    const inv = role === "client" ? data.invoices.filter((v) => v.project && inScope(v.project)) : data.invoices;
    const fin = canFinance ? receivables(invoiceRows(inv, data.payments)) : null;

    const now = new Date().toISOString();
    const meetings = data.meetings
      .filter((m) => inScope(m.project) || !m.project)
      .filter((m) => m.status !== "Cancelled" && m.start_at >= now)
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 3);

    return {
      all, projRows, healthCount, fin, meetings,
      upcoming: upcomingTasks(tasks, 14),
      overdue: overdueTasks(tasks),
      pending: all.pendingReview.slice().sort((a, b) => String(a.ready_at || "").localeCompare(String(b.ready_at || ""))),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, scopeProjects, role, canFinance]);

  // زر الإنجاز السريع يتبع دورة العمل: ڤيوليت تُرسل للمراجعة، وسيم تعتمد
  function quickAction(t) {
    if (t.status === "Pending Review") { if (canApprove) setDialog({ task: t, mode: "approve" }); else router.push("/approvals"); return; }
    if (canDeliver) setDialog({ task: t, mode: "submit" });
  }

  if (!s) return <div className="empty">جاري التحميل…</div>;
  const { all, projRows, healthCount, fin, upcoming, overdue, pending, meetings } = s;

  return (
    <div className="exec">
      {/* الترحيب + جملة الملخّص */}
      <div className="dash-hero exec-hero">
        <span className="hav">{(viewer?.name || "س").slice(0, 1)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>مرحباً {viewer?.name || ""} 👋</h2>
          <p>
            {clientProject ? `متابعة مشاريعك مع ڤيوليت — ` : ""}
            <b>{projRows.length} مشاريع</b>: {healthCount.ok || 0} على المسار، {healthCount.risk || 0} معرّضة للتعثر، {healthCount.late || 0} متعثرة
            {pending.length ? <> · <b>{pending.length} بانتظار اعتماد سيم</b></> : null}
          </p>
        </div>
        <button className="hero-btn" onClick={() => router.push(pending.length && canApprove ? "/approvals" : "/tasks")}>
          {pending.length && canApprove ? "مراجعة الاعتمادات" : "عرض المهام"}
        </button>
      </div>

      {/* المؤشرات التنفيذية */}
      <div className="exec-stats">
        <StatCard onClick={() => router.push("/projects")}
          icon={<span className="ring" style={{ background: `conic-gradient(#16a34a ${all.progress}%, #ede7da 0)` }}><span className="inner">{all.progress}%</span></span>}
          num={`${all.progress}%`} lbl="نسبة الإنجاز" sub={`${all.done} من ${all.total} معتمدة`} />
        <StatCard onClick={() => router.push("/tasks")} tone={["#eaf1fd", "#2563eb"]} ico="calendar"
          num={upcoming.length} lbl="تسليمات خلال 14 يوماً" sub={upcoming[0] ? `الأقرب ${relDays(upcoming[0].days)}` : "لا تسليمات قريبة"} />
        <StatCard onClick={() => router.push("/tasks")} tone={["#fdeceb", "#e0574e"]} ico="alert"
          num={overdue.length} lbl="أعمال متأخرة" sub={all.onHold.length ? `${all.onHold.length} معلّقة` : "لا مهام معلّقة"} />
        <StatCard onClick={() => router.push("/approvals")} tone={["#f1ebfd", "#7c3aed"]} ico="check"
          num={pending.length} lbl="اعتمادات معلّقة" sub={all.revision.length ? `${all.revision.length} مطلوب تعديلها` : "بانتظار قرار سيم"} />
        {fin && (
          <StatCard onClick={() => router.push("/finance")} tone={["#fbf0de", "#c88a2e"]} ico="briefcase"
            num={<>{money(fin.total)} <small>{CURRENCY}</small></>} lbl="المستحقات المالية"
            sub={fin.overdueTotal ? <span style={{ color: "#e0574e" }}>{money(fin.overdueTotal)} متأخرة</span> : fin.open[0] ? `الأقرب ${relDays(fin.open[0].days)}` : "لا مستحقات"} />
        )}
      </div>

      {/* حالة المشاريع */}
      <div className="card exec-card">
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>حالة المشاريع</span>
          <Link href="/projects" className="pill">كل المشاريع</Link>
        </div>
        {projRows.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا مشاريع.</div> : (
          <div className="ps-table">
            <div className="ps-row ps-head">
              <span>المشروع</span><span>الحالة</span><span>الإنجاز</span><span>متأخرة</span><span>بانتظار سيم</span><span>المستهدفات</span><span>التسليم القادم</span>
            </div>
            {projRows.map(({ p, st, health, next, owner, kpi }) => (
              <div className="ps-row" key={p.id} onClick={() => router.push(`/projects/${p.id}`)}>
                <span className="ps-name">
                  <i style={{ background: p.color || "var(--primary)" }} />
                  <span><b>{p.name}</b><small>{owner ? `ڤيوليت: ${owner}` : "—"}</small></span>
                </span>
                <span><span className="pill" style={{ background: health.bg, color: health.color, borderColor: "transparent", fontSize: 11.5 }}>{health.label}</span></span>
                <span className="ps-prog">
                  <span className="progress" style={{ height: 7, flex: 1 }}><span style={{ width: `${st.progress}%`, background: p.color || "var(--primary)" }} /></span>
                  <b>{st.progress}%</b>
                </span>
                <span data-l="متأخرة" style={{ color: st.overdue.length ? "#e0574e" : "var(--muted)", fontWeight: 800 }}>{st.overdue.length}</span>
                <span data-l="بانتظار سيم" style={{ color: st.pendingReview.length ? "#7c3aed" : "var(--muted)", fontWeight: 800 }}>{st.pendingReview.length}</span>
                <span data-l="المستهدفات" style={{ fontWeight: 800 }}>{kpi == null ? "—" : `${kpi}%`}</span>
                <span className="ps-next">{next ? <><b>{next.t.deliverable || next.t.task}</b><small>{relDays(next.days)}</small></> : <small className="muted">—</small>}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="exec-2col">
        {/* التسليمات القادمة */}
        <div className="card exec-card">
          <div className="section-title" style={{ justifyContent: "space-between" }}>
            <span>التسليمات القادمة</span>
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>خلال 14 يوماً · {upcoming.length}</span>
          </div>
          {upcoming.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا تسليمات قريبة</div> :
            upcoming.slice(0, 7).map(({ t, days }) => (
              <div className="dl-item" key={t.id}>
                <button className="dl-check" title={t.status === "Pending Review" ? "بانتظار مراجعة سيم" : "جاهز للتسليم — إرسال لمراجعة سيم"} onClick={() => quickAction(t)} style={t.status === "Pending Review" ? { borderColor: "#7c3aed", background: "#f1ebfd" } : undefined} />
                <div className="dl-body" onClick={() => setViewing(t)} style={{ cursor: "pointer" }}>
                  <b>{t.task}</b>
                  <small>{t.project}{t.deliverable ? ` · ${t.deliverable}` : ""}{t.assigned_to ? ` · ${t.assigned_to}` : ""}</small>
                </div>
                <span className="dl-pill" style={days <= 2 ? { background: "#fbf0de", color: "#c88a2e" } : { background: "#eaf6ef", color: "#3f9d6d" }}>{relDays(days)}</span>
              </div>
            ))}
        </div>

        {/* الأعمال المتأخرة */}
        <div className="card exec-card">
          <div className="section-title" style={{ justifyContent: "space-between" }}>
            <span>الأعمال المتأخرة</span>
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{overdue.length}</span>
          </div>
          {overdue.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا أعمال متأخرة ✓</div> :
            overdue.slice(0, 6).map(({ t, days }) => (
              <div className="late-item" key={t.id} onClick={() => setViewing(t)}>
                <div className="late-top">
                  <b>{t.task}</b>
                  <span className="dl-pill" style={{ background: "#fdeceb", color: "#e0574e" }}>{relDays(days)}</span>
                </div>
                <small className="muted">{t.project}{t.assigned_to ? ` · ${t.assigned_to}` : ""}</small>
                <div className="late-why">
                  <span><i>السبب</i>{t.blocker || "غير محدد"}</span>
                  <span><i>الإجراء مطلوب من</i>{t.waiting_on || "—"}</span>
                  <span><i>موعد المعالجة</i>{t.resolve_date || "—"}</span>
                </div>
              </div>
            ))}
          {overdue.length > 6 && <Link href="/tasks" className="pill" style={{ display: "inline-block", marginTop: 6 }}>+{overdue.length - 6} أخرى</Link>}
        </div>
      </div>

      <div className="exec-2col">
        {/* الاعتمادات المعلّقة */}
        <div className="card exec-card">
          <div className="section-title" style={{ justifyContent: "space-between" }}>
            <span>الاعتمادات المعلّقة</span>
            <Link href="/approvals" className="pill">قسم الاعتمادات</Link>
          </div>
          {pending.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا أعمال بانتظار المراجعة ✓</div> :
            pending.slice(0, 5).map((t) => {
              const wait = t.ready_at ? -daysUntil(t.ready_at.slice(0, 10)) : null;
              return (
                <div className="dl-item" key={t.id}>
                  <span className="dl-dot" style={{ background: "#7c3aed" }} />
                  <div className="dl-body" onClick={() => setViewing(t)} style={{ cursor: "pointer" }}>
                    <b>{t.task}</b>
                    <small>{t.project}{t.deliverable ? ` · ${t.deliverable}` : ""} · أرسلها {t.ready_by || t.assigned_to || "—"}</small>
                  </div>
                  {canApprove
                    ? <button className="btn sm primary" onClick={() => setDialog({ task: t, mode: "approve" })}>اعتماد</button>
                    : <span className="dl-pill" style={{ background: "#f1ebfd", color: "#7c3aed" }}>{wait == null ? "بانتظار" : wait === 0 ? "منذ اليوم" : `منذ ${wait} يوم`}</span>}
                </div>
              );
            })}
        </div>

        {/* المستحقات المالية — لمن يملك صلاحية المالية فقط */}
        {fin ? (
          <div className="card exec-card">
            <div className="section-title" style={{ justifyContent: "space-between" }}>
              <span>المستحقات المالية</span>
              <Link href="/finance" className="pill">المالية</Link>
            </div>
            <div className="fin-mini">
              <div><small>متأخرة السداد</small><b style={{ color: "#e0574e" }}>{money(fin.overdueTotal)}</b></div>
              <div><small>تستحق خلال 30 يوماً</small><b style={{ color: "#c88a2e" }}>{money(fin.due30Total)}</b></div>
              <div><small>إجمالي المتبقّي</small><b>{money(fin.total)}</b></div>
            </div>
            {fin.open.length === 0 ? <div className="empty" style={{ padding: "18px 0" }}>لا مستحقات مفتوحة ✓</div> :
              fin.open.slice(0, 5).map((r) => (
                <div className="dl-item" key={r.id} onClick={() => router.push("/finance")} style={{ cursor: "pointer" }}>
                  <span className="dl-dot" style={{ background: r.days != null && r.days < 0 ? "#e0574e" : "#c88a2e" }} />
                  <div className="dl-body">
                    <b>{r.number || "فاتورة"} · {money(r.outstanding)} {r.currency || CURRENCY}</b>
                    <small>{r.project || "عام"}{r.paid ? ` · مدفوع ${money(r.paid)}` : ""}{r.due_date ? ` · ${r.due_date}` : ""}</small>
                  </div>
                  <span className="dl-pill" style={r.days != null && r.days < 0 ? { background: "#fdeceb", color: "#e0574e" } : { background: "#fbf0de", color: "#c88a2e" }}>{relDays(r.days)}</span>
                </div>
              ))}
          </div>
        ) : (
          <MeetingsCard meetings={meetings} />
        )}
      </div>

      <div className="exec-2col">
        {fin && <MeetingsCard meetings={meetings} />}
        {role !== "client" && (
          <div className="card exec-card">
            <div className="section-title" style={{ justifyContent: "space-between" }}>
              <span>آخر الأنشطة</span>
              <Link href="/activity" style={{ color: "var(--primary)", fontWeight: 700, fontSize: 13 }}>الكل</Link>
            </div>
            <ActivityFeed limit={6} />
          </div>
        )}
      </div>

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

function StatCard({ icon, ico, tone, num, lbl, sub, onClick }) {
  return (
    <div className="kpi-card exec-stat" onClick={onClick}>
      {icon || <span className="kpi-ic" style={{ background: tone[0], color: tone[1] }}><Icon name={ico} size={22} /></span>}
      <div style={{ minWidth: 0 }}>
        <div className="num">{num}</div>
        <div className="lbl">{lbl}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}

function MeetingsCard({ meetings }) {
  return (
    <div className="card exec-card">
      <div className="section-title" style={{ justifyContent: "space-between" }}>
        <span>الاجتماعات القادمة</span>
        <Link href="/meetings" className="pill">الاجتماعات</Link>
      </div>
      {meetings.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا اجتماعات قادمة</div> :
        meetings.map((m) => {
          const d = new Date(m.start_at);
          return (
            <div className="mtg-item" key={m.id}>
              <div className="date-box"><span className="mo">{MONTHS[d.getMonth()]}</span><span className="dy">{d.getDate()}</span></div>
              <div className="mbody">
                <b>{m.title}</b>
                <small>{m.project ? `${m.project} · ` : ""}{d.toLocaleString("ar-SA", { weekday: "long", hour: "2-digit", minute: "2-digit" })}</small>
              </div>
            </div>
          );
        })}
    </div>
  );
}
