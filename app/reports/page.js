"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksStore, meetingsStore, kpisStore, invoicesStore, paymentsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { useSettings, brandTitle } from "@/components/SettingsProvider";
import Icon from "@/components/Icon";
import { STATUS_META, CURRENCY, isDone, taskProgress, isPublicKpi } from "@/lib/constants";
import { taskStats, kpiAchievement, invoiceRows, money, daysUntil } from "@/lib/metrics";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const QUARTERS = ["الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"];
const TYPES = { week: "أسبوعي", month: "شهري", quarter: "ربع سنوي" };
const DAY = 86400000;

// حدود الفترة: offset = 0 الحالية، -1 السابقة…
function periodOf(type, offset) {
  const now = new Date();
  let start, end, label;
  if (type === "week") {
    // الأسبوع يبدأ الأحد
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + offset * 7);
    start = s;
    end = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    label = `الأسبوع ${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  } else if (type === "month") {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    label = `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  } else {
    const q = Math.floor(now.getMonth() / 3) + offset;
    start = new Date(now.getFullYear(), q * 3, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
    label = `${QUARTERS[Math.floor(start.getMonth() / 3)]} ${start.getFullYear()}`;
  }
  const s0 = start.getTime();
  const e0 = end.getTime() + DAY - 1; // نهاية اليوم الأخير
  return { start: s0, end: e0, label, current: offset === 0 };
}
const inRange = (iso, p) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && t >= p.start && t <= p.end;
};
const fmtD = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const lateBy = (t) => { const n = daysUntil(t.due_date); return n == null ? "" : `${-n} يوم`; };

export default function ReportsPage() {
  const { canFinance, scopeProjects, projects, role } = useRole();
  const { settings } = useSettings();
  const [type, setType] = useState("week");
  const [offset, setOffset] = useState(0);
  const [fProject, setFProject] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const [tasks, meetings, kpis] = await Promise.all([
        tasksStore.list().catch(() => []), meetingsStore.list().catch(() => []), kpisStore.list().catch(() => []),
      ]);
      let invoices = [], payments = [];
      if (canFinance) [invoices, payments] = await Promise.all([invoicesStore.list().catch(() => []), paymentsStore.list().catch(() => [])]);
      setData({ tasks, meetings, kpis, invoices, payments });
    })();
  }, [canFinance]);

  const period = useMemo(() => periodOf(type, offset), [type, offset]);
  const projectNames = scopeProjects || (projects || []).map((p) => p.name);
  const inScope = (name) => (!scopeProjects || scopeProjects.includes(name)) && (!fProject || name === fProject);

  const r = useMemo(() => {
    if (!data) return null;
    const p = period;
    const tasks = data.tasks.filter((t) => inScope(t.project));
    const doneAt = (t) => t.reviewed_at || t.completed_at;

    // المنجز: ما اعتمدته سيم خلال الفترة
    const done = tasks.filter((t) => isDone(t) && inRange(doneAt(t), p)).sort((a, b) => String(doneAt(a)).localeCompare(String(doneAt(b))));
    // الجاري: غير المعتمد حالياً (مرتّب حسب الاستحقاق)
    const ongoing = tasks.filter((t) => !isDone(t) && t.status !== "Not Started")
      .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
    // المتأخر: استحقاقه قبل نهاية الفترة (أو اليوم) ولم يُعتمد
    const cutoff = Math.min(p.end, Date.now());
    const late = tasks.filter((t) => !isDone(t) && t.due_date && new Date(t.due_date).getTime() + DAY - 1 < cutoff)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    // أسباب التعثر: تجميع حسب الجهة المطلوب منها الإجراء
    const byParty = {};
    [...late, ...tasks.filter((t) => t.on_hold && !isDone(t) && !late.includes(t))].forEach((t) => {
      const k = (t.waiting_on || "غير محدد").trim() || "غير محدد";
      byParty[k] = (byParty[k] || 0) + 1;
    });
    const parties = Object.entries(byParty).sort((a, b) => b[1] - a[1]);

    // القرارات المطلوبة
    const pendingApproval = tasks.filter((t) => t.status === "Pending Review");
    const waitingSeem = tasks.filter((t) => !isDone(t) && t.status !== "Pending Review" && /سيم/.test(t.waiting_on || "") && (t.on_hold || late.includes(t) || t.blocker));
    // قرارات الاعتماد المتخذة خلال الفترة
    const decisions = [];
    tasks.forEach((t) => (Array.isArray(t.reviews) ? t.reviews : []).forEach((rv) => {
      if (rv.decision !== "submitted" && inRange(rv.at, p)) decisions.push({ ...rv, t });
    }));
    // قرارات الاجتماعات خلال الفترة
    const mtgs = data.meetings.filter((m) => (!m.project || inScope(m.project)) && inRange(m.start_at, p) && m.status !== "Cancelled");
    const mtgDecisions = [];
    mtgs.forEach((m) => (Array.isArray(m.action_items) ? m.action_items : []).forEach((a) => {
      if (a.text) mtgDecisions.push({ ...a, meeting: m });
    }));

    // حسب المشروع
    const perProject = projectNames.filter((n) => !fProject || n === fProject).map((name) => {
      const pt = tasks.filter((t) => t.project === name);
      const st = taskStats(pt);
      return {
        name, progress: st.progress,
        done: done.filter((t) => t.project === name).length,
        late: late.filter((t) => t.project === name).length,
        pending: st.pendingReview.length, total: st.total,
      };
    }).filter((x) => x.total);

    const kpis = data.kpis.filter((k) => k.project && inScope(k.project) && (role !== "client" || isPublicKpi(k)));
    const kpiPct = kpiAchievement(kpis);

    let fin = null;
    if (canFinance) {
      const inv = role === "client" ? data.invoices.filter((v) => v.project && inScope(v.project)) : data.invoices.filter((v) => !fProject || v.project === fProject);
      const rows = invoiceRows(inv, data.payments).filter((x) => x.status !== "ملغاة" && x.status !== "مسودة");
      const ids = new Set(rows.map((x) => x.id));
      fin = {
        invoiced: rows.filter((x) => inRange(x.issue_date, p)).reduce((s, x) => s + x.amount, 0),
        collected: data.payments.filter((x) => ids.has(x.invoice_id) && inRange(x.date, p)).reduce((s, x) => s + (Number(x.amount) || 0), 0),
        outstanding: rows.reduce((s, x) => s + x.outstanding, 0),
        overdue: rows.filter((x) => x.outstanding > 0 && x.days != null && x.days < 0).reduce((s, x) => s + x.outstanding, 0),
      };
    }

    return { done, ongoing, late, parties, pendingApproval, waitingSeem, decisions, mtgs, mtgDecisions, perProject, kpiPct, fin, overall: taskStats(tasks) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, period, fProject, scopeProjects, role, canFinance]);

  async function exportExcel() {
    if (!r) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "—": "لا بيانات" }]), name);
    const summary = [
      { البند: "الفترة", القيمة: period.label },
      { البند: "المشروع", القيمة: fProject || "كل المشاريع" },
      { البند: "المنجز (معتمد خلال الفترة)", القيمة: r.done.length },
      { البند: "الجاري", القيمة: r.ongoing.length },
      { البند: "المتأخر", القيمة: r.late.length },
      { البند: "بانتظار اعتماد سيم", القيمة: r.pendingApproval.length },
      { البند: "نسبة الإنجاز الكلية %", القيمة: r.overall.progress },
      { البند: "تحقق المستهدفات %", القيمة: r.kpiPct ?? "—" },
    ];
    if (r.fin) {
      summary.push({ البند: `المُفوتر خلال الفترة (${CURRENCY})`, القيمة: r.fin.invoiced });
      summary.push({ البند: `المُحصّل خلال الفترة (${CURRENCY})`, القيمة: r.fin.collected });
      summary.push({ البند: `إجمالي المتبقّي (${CURRENCY})`, القيمة: r.fin.outstanding });
    }
    add("الملخّص", summary);
    add("المنجز", r.done.map((t) => ({ المهمة: t.task, المشروع: t.project, المخرج: t.deliverable || "", المعتمِد: t.reviewed_by || "", "تاريخ الاعتماد": fmtD(t.reviewed_at || t.completed_at) })));
    add("الجاري", r.ongoing.map((t) => ({ المهمة: t.task, المشروع: t.project, الحالة: STATUS_META[t.status]?.ar || t.status, المسؤول: t.assigned_to || "", "الإنجاز %": taskProgress(t), الاستحقاق: t.due_date || "" })));
    add("المتأخر وأسباب التعثر", r.late.map((t) => ({ المهمة: t.task, المشروع: t.project, الاستحقاق: t.due_date, "متأخرة": lateBy(t), السبب: t.blocker || "", "الإجراء مطلوب من": t.waiting_on || "", "موعد المعالجة": t.resolve_date || "" })));
    add("القرارات المطلوبة", [
      ...r.pendingApproval.map((t) => ({ النوع: "اعتماد تسليم", البند: t.task, المشروع: t.project, "مطلوب من": "سيم برايم" })),
      ...r.waitingSeem.map((t) => ({ النوع: "إجراء معلّق", البند: t.task, المشروع: t.project, "مطلوب من": t.waiting_on, السبب: t.blocker || "" })),
    ]);
    add("حسب المشروع", r.perProject.map((x) => ({ المشروع: x.name, "الإنجاز %": x.progress, "معتمد خلال الفترة": x.done, المتأخر: x.late, "بانتظار سيم": x.pending })));
    XLSX.writeFile(wb, `تقرير-${TYPES[type]}-${period.label}.xlsx`);
  }

  if (!r) return <div className="empty">جاري التحميل…</div>;

  return (
    <div className="rep">
      {/* أدوات التحكم (لا تُطبع) */}
      <div className="rep-controls no-print">
        <div className="seg">
          {Object.entries(TYPES).map(([k, l]) => (
            <button key={k} className={type === k ? "on" : ""} onClick={() => { setType(k); setOffset(0); }}>{l}</button>
          ))}
        </div>
        <div className="rep-nav">
          <button className="btn sm icon" onClick={() => setOffset((o) => o - 1)} title="الفترة السابقة">›</button>
          <b>{period.label}</b>
          <button className="btn sm icon" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} title="الفترة التالية">‹</button>
          {offset !== 0 && <button className="btn sm ghost" onClick={() => setOffset(0)}>الحالية</button>}
        </div>
        <select value={fProject} onChange={(e) => setFProject(e.target.value)} style={{ width: "auto" }}>
          <option value="">كل المشاريع</option>
          {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={exportExcel}><Icon name="upload" size={16} /> تصدير Excel</button>
          <button className="btn primary" onClick={() => window.print()}><Icon name="file" size={16} /> طباعة / PDF</button>
        </div>
      </div>

      {/* الورقة القابلة للطباعة */}
      <div className="rep-sheet">
        <div className="rep-head">
          <div>
            <div className="rep-brand">{brandTitle(settings)}</div>
            <div className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>{settings.tagline}</div>
          </div>
          <div style={{ textAlign: "end" }}>
            <h1>التقرير ال{TYPES[type] === "ربع سنوي" ? "ربع سنوي" : TYPES[type]}</h1>
            <div className="muted" style={{ fontSize: 13 }}>{period.label}{fProject ? ` · ${fProject}` : ""} · أُعدّ في {fmtD(new Date().toISOString())}</div>
          </div>
        </div>

        <div className="rep-stats">
          <Stat n={r.done.length} l="المنجز (معتمد)" c="#16a34a" />
          <Stat n={r.ongoing.length} l="الجاري" c="#2563eb" />
          <Stat n={r.late.length} l="المتأخر" c="#e0574e" />
          <Stat n={r.pendingApproval.length} l="بانتظار اعتماد سيم" c="#7c3aed" />
          <Stat n={`${r.overall.progress}%`} l="نسبة الإنجاز الكلية" />
          <Stat n={r.kpiPct == null ? "—" : `${r.kpiPct}%`} l="تحقق المستهدفات" />
        </div>

        {/* 1) المنجز */}
        <Section title={`المنجز خلال الفترة (${r.done.length})`}>
          {r.done.length === 0 ? <Empty t="لم يُعتمد أي عمل خلال هذه الفترة." /> : (
            <table className="rep-tbl">
              <thead><tr><th>العمل</th><th>المشروع</th><th>المخرج</th><th>المعتمِد</th><th>التاريخ</th></tr></thead>
              <tbody>{r.done.map((t) => <tr key={t.id}><td>{t.task}</td><td>{t.project}</td><td>{t.deliverable || "—"}</td><td>{t.reviewed_by || "—"}</td><td>{fmtD(t.reviewed_at || t.completed_at)}</td></tr>)}</tbody>
            </table>
          )}
        </Section>

        {/* 2) الجاري */}
        <Section title={`الجاري (${r.ongoing.length})`}>
          {r.ongoing.length === 0 ? <Empty t="لا أعمال جارية." /> : (
            <table className="rep-tbl">
              <thead><tr><th>العمل</th><th>المشروع</th><th>الحالة</th><th>المسؤول</th><th>الإنجاز</th><th>الاستحقاق</th></tr></thead>
              <tbody>{r.ongoing.slice(0, 40).map((t) => (
                <tr key={t.id}>
                  <td>{t.task}</td><td>{t.project}</td>
                  <td><span style={{ color: STATUS_META[t.status]?.color, fontWeight: 700 }}>{STATUS_META[t.status]?.ar || t.status}</span></td>
                  <td>{t.assigned_to || "—"}</td><td>{taskProgress(t)}%</td><td>{t.due_date || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {r.ongoing.length > 40 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>+{r.ongoing.length - 40} أخرى (كاملة في ملف Excel)</div>}
        </Section>

        {/* 3) المتأخر وأسباب التعثر */}
        <Section title={`المتأخر وأسباب التعثر (${r.late.length})`}>
          {r.parties.length > 0 && (
            <div className="rep-parties">
              <span className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>الإجراء مطلوب من:</span>
              {r.parties.map(([k, v]) => <span key={k} className="pill">{k} <b>{v}</b></span>)}
            </div>
          )}
          {r.late.length === 0 ? <Empty t="لا أعمال متأخرة ✓" /> : (
            <table className="rep-tbl">
              <thead><tr><th>العمل</th><th>المشروع</th><th>متأخرة</th><th>السبب</th><th>مطلوب من</th><th>موعد المعالجة</th></tr></thead>
              <tbody>{r.late.map((t) => (
                <tr key={t.id}>
                  <td>{t.task}</td><td>{t.project}</td><td style={{ color: "#e0574e", fontWeight: 700, whiteSpace: "nowrap" }}>{lateBy(t)}</td>
                  <td>{t.blocker || <span className="muted">غير محدد</span>}</td><td>{t.waiting_on || "—"}</td><td>{t.resolve_date || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Section>

        {/* 4) القرارات المطلوبة */}
        <Section title={`القرارات المطلوبة (${r.pendingApproval.length + r.waitingSeem.length})`}>
          {r.pendingApproval.length + r.waitingSeem.length === 0 ? <Empty t="لا قرارات معلّقة." /> : (
            <table className="rep-tbl">
              <thead><tr><th>المطلوب</th><th>العمل</th><th>المشروع</th><th>مطلوب من</th><th>منذ / السبب</th></tr></thead>
              <tbody>
                {r.pendingApproval.map((t) => <tr key={t.id}><td><b style={{ color: "#7c3aed" }}>اعتماد تسليم</b></td><td>{t.task}</td><td>{t.project}</td><td>سيم برايم</td><td>{t.ready_at ? `منذ ${fmtD(t.ready_at)}` : "—"}</td></tr>)}
                {r.waitingSeem.map((t) => <tr key={t.id}><td><b style={{ color: "#c88a2e" }}>إجراء لإكمال العمل</b></td><td>{t.task}</td><td>{t.project}</td><td>{t.waiting_on}</td><td>{t.blocker || "—"}</td></tr>)}
              </tbody>
            </table>
          )}
        </Section>

        {/* 5) القرارات المتخذة */}
        {(r.decisions.length > 0 || r.mtgDecisions.length > 0) && (
          <Section title="القرارات المتخذة خلال الفترة">
            <table className="rep-tbl">
              <thead><tr><th>القرار</th><th>المصدر</th><th>المسؤول / بواسطة</th><th>التاريخ</th></tr></thead>
              <tbody>
                {r.decisions.map((d, i) => <tr key={`d${i}`}><td>{d.decision === "approved" ? "اعتماد" : "طلب تعديل"}: {d.t.task}{d.note ? ` — ${d.note}` : ""}</td><td>{d.t.project}</td><td>{d.by || "—"}</td><td>{fmtD(d.at)}</td></tr>)}
                {r.mtgDecisions.map((a, i) => <tr key={`m${i}`}><td>{a.kind === "decision" ? "قرار" : "إجراء"}: {a.text}</td><td>اجتماع: {a.meeting.title}</td><td>{a.assignee || "—"}</td><td>{a.due ? fmtD(a.due) : fmtD(a.meeting.start_at)}</td></tr>)}
              </tbody>
            </table>
          </Section>
        )}

        {/* 6) حسب المشروع */}
        <Section title="ملخّص المشاريع">
          <table className="rep-tbl">
            <thead><tr><th>المشروع</th><th>الإنجاز</th><th>معتمد خلال الفترة</th><th>متأخر</th><th>بانتظار سيم</th></tr></thead>
            <tbody>{r.perProject.map((x) => (
              <tr key={x.name}><td><b>{x.name}</b></td><td>{x.progress}%</td><td>{x.done}</td><td style={{ color: x.late ? "#e0574e" : undefined }}>{x.late}</td><td>{x.pending}</td></tr>
            ))}</tbody>
          </table>
        </Section>

        {r.fin && (
          <Section title="المالية">
            <div className="rep-stats" style={{ marginBottom: 0 }}>
              <Stat n={money(r.fin.invoiced)} l={`المُفوتر خلال الفترة (${CURRENCY})`} />
              <Stat n={money(r.fin.collected)} l={`المُحصّل خلال الفترة (${CURRENCY})`} c="#16a34a" />
              <Stat n={money(r.fin.outstanding)} l={`إجمالي المتبقّي (${CURRENCY})`} c="#c88a2e" />
              <Stat n={money(r.fin.overdue)} l={`متأخر السداد (${CURRENCY})`} c="#e0574e" />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Stat({ n, l, c }) {
  return <div className="rep-stat"><b style={{ color: c }}>{n}</b><small>{l}</small></div>;
}
function Section({ title, children }) {
  return <section className="rep-sec"><h2>{title}</h2>{children}</section>;
}
function Empty({ t }) {
  return <div className="muted" style={{ fontSize: 13, padding: "6px 0" }}>{t}</div>;
}
