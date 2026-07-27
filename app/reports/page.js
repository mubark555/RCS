"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksStore, meetingsStore, kpisStore, invoicesStore, paymentsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Icon from "@/components/Icon";
import Donut from "@/components/Donut";
import Bar from "@/components/Bar";
import TrendLine from "@/components/TrendLine";
import { STATUS_META, HEALTH_META, CURRENCY, invoiceState } from "@/lib/constants";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const STATUS_COLORS = { "Not Started": "#64748b", "In Progress": "#2563eb", "On Hold": "#d97706", Completed: "#16a34a" };
function shortMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 ? 1 : 0) + "M";
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 ? 1 : 0) + "K";
  return `${v}`;
}
function money(n) { return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }

export default function ReportsPage() {
  const { canFinance, scopeProjects, ready } = useRole();
  const [tasks, setTasks] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    tasksStore.list().then(setTasks).catch(() => setTasks([]));
    meetingsStore.list().then(setMeetings).catch(() => setMeetings([]));
    kpisStore.list().then(setKpis).catch(() => setKpis([]));
    if (canFinance) {
      invoicesStore.list().then(setInvoices).catch(() => setInvoices([]));
      paymentsStore.list().then(setPayments).catch(() => setPayments([]));
    }
  }, [canFinance]);

  const scoped = useMemo(() => {
    if (!tasks) return null;
    const t = scopeProjects ? tasks.filter((x) => scopeProjects.includes(x.project)) : tasks;
    const m = scopeProjects ? (meetings || []).filter((x) => scopeProjects.includes(x.project)) : meetings;
    return { t, m };
  }, [tasks, meetings, scopeProjects]);

  const rep = useMemo(() => {
    if (!scoped) return null;
    const t = scoped.t;
    const total = t.length;
    const completed = t.filter((x) => x.status === "Completed").length;
    const pct = total ? Math.round((completed / total) * 100) : 0;

    const byStatus = {};
    t.forEach((x) => { const k = x.status || "Not Started"; byStatus[k] = (byStatus[k] || 0) + 1; });
    const statusSegs = Object.entries(byStatus).map(([k, v]) => ({ label: STATUS_META[k]?.ar || k, value: v, color: STATUS_COLORS[k] || "#94a3b8" }));

    const byProj = {};
    t.forEach((x) => { const k = x.project || "عام"; byProj[k] = (byProj[k] || 0) + 1; });
    const projBars = Object.entries(byProj).map(([label, value]) => ({ label, value }));

    const health = { "On Track": 0, "At Risk": 0, Delayed: 0, Completed: 0 };
    t.forEach((x) => { if (health[x.health] != null) health[x.health]++; });

    const now = new Date().toISOString();
    const upcoming = (scoped.m || []).filter((x) => x.status !== "Cancelled" && x.start_at >= now).length;
    const doneMtgs = (scoped.m || []).filter((x) => x.status === "Done").length;

    return { total, completed, pct, statusSegs, projBars, health, mtgTotal: (scoped.m || []).length, upcoming, doneMtgs };
  }, [scoped]);

  const kpiStat = useMemo(() => {
    if (!kpis?.length) return { overall: 0, count: 0, onTrack: 0 };
    const pcts = kpis.map((k) => (k.target ? Math.min(100, Math.round((k.current / k.target) * 100)) : 0));
    const overall = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
    const onTrack = pcts.filter((p) => p >= 60).length;
    return { overall, count: kpis.length, onTrack };
  }, [kpis]);

  const fin = useMemo(() => {
    if (!canFinance) return null;
    const paidBy = {};
    (payments || []).forEach((p) => { paidBy[p.invoice_id] = (paidBy[p.invoice_id] || 0) + (Number(p.amount) || 0); });
    const active = (invoices || []).filter((v) => v.status !== "ملغاة" && v.status !== "مسودة");
    const invoiced = active.reduce((s, v) => s + (Number(v.amount) || 0), 0);
    const collected = active.reduce((s, v) => s + Math.min(paidBy[v.id] || 0, Number(v.amount) || 0), 0);
    const outstanding = Math.max(0, invoiced - collected);
    const byMonth = {};
    active.forEach((v) => {
      if (!v.issue_date) return;
      const d = new Date(v.issue_date); if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      byMonth[key] = byMonth[key] || { ts: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), value: 0, label: MONTHS[d.getMonth()] };
      byMonth[key].value += Number(v.amount) || 0;
    });
    const monthPts = Object.values(byMonth).sort((a, b) => a.ts - b.ts).slice(-6).map((m) => ({ label: m.label, value: m.value }));
    return { invoiced, collected, outstanding, monthPts, rate: invoiced ? Math.round((collected / invoiced) * 100) : 0 };
  }, [canFinance, invoices, payments]);

  async function exportExcel() {
    if (!rep) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const summary = [
      { المؤشر: "إجمالي المهام", القيمة: rep.total },
      { المؤشر: "المهام المكتملة", القيمة: rep.completed },
      { المؤشر: "نسبة الإنجاز %", القيمة: rep.pct },
      { المؤشر: "متوسط تحقيق المستهدفات %", القيمة: kpiStat.overall },
      { المؤشر: "الاجتماعات القادمة", القيمة: rep.upcoming },
    ];
    if (fin) {
      summary.push({ المؤشر: `إجمالي المُفوتر (${CURRENCY})`, القيمة: fin.invoiced });
      summary.push({ المؤشر: `المُحصّل (${CURRENCY})`, القيمة: fin.collected });
      summary.push({ المؤشر: `المتبقّي (${CURRENCY})`, القيمة: fin.outstanding });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "الملخّص");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rep.projBars.map((p) => ({ المشروع: p.label, "عدد المهام": p.value }))), "المهام حسب المشروع");
    XLSX.writeFile(wb, "تقرير-سيم-برايم.xlsx");
  }

  if (!rep) return <div className="empty">جاري التحميل…</div>;

  return (
    <div className="reports-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div className="muted" style={{ fontSize: 13.5, fontWeight: 600 }}>ملخّص شامل لأداء المشاريع والمستهدفات{fin ? " والمالية" : ""}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={exportExcel}><Icon name="upload" size={16} /> تصدير Excel</button>
          <button className="btn ghost" onClick={() => window.print()}><Icon name="file" size={16} /> طباعة</button>
        </div>
      </div>

      {/* بطاقات عليا */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-ic" style={{ background: "#eaf1fd", color: "#2e77e5" }}><Icon name="tasks" size={24} /></span>
          <div><div className="num">{rep.total}</div><div className="lbl">إجمالي المهام</div></div>
        </div>
        <div className="kpi-card">
          <span className="ring" style={{ background: `conic-gradient(#3f9d6d ${rep.pct}%, #ede7da 0)` }}><span className="inner">{rep.pct}%</span></span>
          <div><div className="num">{rep.pct}%</div><div className="lbl">نسبة الإنجاز</div></div>
        </div>
        <div className="kpi-card">
          <span className="kpi-ic" style={{ background: "#f3eefe", color: "#7c5cf6" }}><Icon name="chart" size={24} /></span>
          <div><div className="num">{kpiStat.overall}%</div><div className="lbl">تحقيق المستهدفات ({kpiStat.count})</div></div>
        </div>
        <div className="kpi-card">
          <span className="kpi-ic" style={{ background: "#eafaf3", color: "#0d9488" }}><Icon name="calendar" size={24} /></span>
          <div><div className="num">{rep.upcoming}</div><div className="lbl">اجتماعات قادمة</div></div>
        </div>
      </div>

      {/* رسوم المهام */}
      <div className="fin-charts">
        <div className="card">
          <div className="section-title"><span>توزيع المهام حسب الحالة</span></div>
          <div style={{ display: "grid", placeItems: "center", padding: "8px 0" }}>
            <Donut size={180} thickness={24} centerTop={rep.total} centerBottom="مهمة" segments={rep.statusSegs} />
          </div>
          <div className="fin-legend">
            {rep.statusSegs.map((s) => <span key={s.label}><i style={{ background: s.color }} /> {s.label} ({s.value})</span>)}
          </div>
        </div>
        <div className="card">
          <div className="section-title"><span>المهام حسب المشروع</span></div>
          <Bar data={rep.projBars} barColor="#2563eb" />
        </div>
        <div className="card">
          <div className="section-title"><span>صحّة المشاريع</span></div>
          <div className="health-rows">
            {Object.entries(rep.health).map(([k, v]) => {
              const hm = HEALTH_META[k] || { ar: k, color: "#94a3b8" };
              const pctW = rep.total ? Math.round((v / rep.total) * 100) : 0;
              return (
                <div className="health-row" key={k}>
                  <span className="hl-lbl">{hm.ar}</span>
                  <div className="progress" style={{ height: 9, flex: 1 }}><span style={{ width: `${pctW}%`, background: hm.color }} /></div>
                  <span className="hl-v">{v}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* المالية (لأصحاب الصلاحية) */}
      {fin && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="section-title"><span>الملخّص المالي</span></div>
          <div className="fin-cards" style={{ marginBottom: 6 }}>
            <div className="fin-card"><span className="fin-ic" style={{ background: "#eaf1fd", color: "#2563eb" }}><Icon name="file" size={22} /></span><div><div className="v">{money(fin.invoiced)} <small>{CURRENCY}</small></div><div className="k">إجمالي المُفوتر</div></div></div>
            <div className="fin-card"><span className="fin-ic" style={{ background: "#eaf6ef", color: "#16a34a" }}><Icon name="check" size={22} /></span><div><div className="v" style={{ color: "#16a34a" }}>{money(fin.collected)} <small>{CURRENCY}</small></div><div className="k">المُحصّل ({fin.rate}%)</div></div></div>
            <div className="fin-card"><span className="fin-ic" style={{ background: "#fbf0de", color: "#c88a2e" }}><Icon name="clock" size={22} /></span><div><div className="v" style={{ color: "#c88a2e" }}>{money(fin.outstanding)} <small>{CURRENCY}</small></div><div className="k">المتبقّي للتحصيل</div></div></div>
          </div>
          <div style={{ paddingTop: 8 }}>
            <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>اتجاه الفوترة الشهري</div>
            <TrendLine points={fin.monthPts} fmt={shortMoney} color="#16a34a" />
          </div>
        </div>
      )}
    </div>
  );
}
