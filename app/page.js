"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { tasksStore } from "@/lib/store";
import {
  STATUS_META,
  HEALTH_META,
  PROJECTS,
  metaOf,
} from "@/lib/constants";

export default function Dashboard() {
  const [tasks, setTasks] = useState(null);

  useEffect(() => {
    tasksStore.list().then(setTasks).catch(() => setTasks([]));
  }, []);

  const stats = useMemo(() => {
    if (!tasks) return null;
    const total = tasks.length;
    const by = (fn) => tasks.filter(fn).length;
    const completed = by((t) => t.status === "Completed");
    const inProgress = by((t) => t.status === "In Progress");
    const delayed = by((t) => t.health === "Delayed");
    const atRisk = by((t) => t.health === "At Risk");
    const healthy = by((t) => t.health === "On Track");
    const pendingApproval = by((t) => t.approval_status === "Pending Review");
    const completionPct = total ? Math.round((completed / total) * 100) : 0;

    const byProject = PROJECTS.map((p) => {
      const items = tasks.filter((t) => t.project === p);
      const done = items.filter((t) => t.status === "Completed").length;
      return {
        project: p,
        total: items.length,
        done,
        pct: items.length ? Math.round((done / items.length) * 100) : 0,
      };
    }).filter((x) => x.total > 0);

    const statusBreak = Object.keys(STATUS_META).map((s) => ({
      key: s,
      n: by((t) => t.status === s),
    }));

    return {
      total,
      completed,
      inProgress,
      delayed,
      atRisk,
      healthy,
      pendingApproval,
      completionPct,
      byProject,
      statusBreak,
    };
  }, [tasks]);

  if (!stats) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      <div className="section-title" style={{ marginTop: 10 }}>
        👋 نظرة عامة على المشاريع
      </div>

      <div className="grid cards">
        <StatCard label="إجمالي المهام" num={stats.total} color="#8b5cf6" />
        <StatCard
          label="نسبة الإنجاز"
          num={`${stats.completionPct}%`}
          color="#22c55e"
          pct={stats.completionPct}
        />
        <StatCard label="مهام قيد التنفيذ" num={stats.inProgress} color="#3b82f6" />
        <StatCard label="بانتظار الاعتماد" num={stats.pendingApproval} color="#06b6d4" />
      </div>

      <div className="section-title">🩺 صحة المهام</div>
      <div className="grid cards">
        <StatCard label="المهام السليمة" num={stats.healthy} color="#22c55e" />
        <StatCard label="المعرّضة للتعثر" num={stats.atRisk} color="#f59e0b" />
        <StatCard label="المهام المتعثرة" num={stats.delayed} color="#ef4444" />
        <StatCard label="المكتملة" num={stats.completed} color="#14b8a6" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr", marginTop: 24 }}>
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 14px" }}>
            📊 التقدّم حسب المشروع
          </div>
          {stats.byProject.map((p) => (
            <div key={p.project} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
                <strong>{p.project}</strong>
                <span className="muted">
                  {p.done}/{p.total} ({p.pct}%)
                </span>
              </div>
              <div className="bar" style={{ height: 8, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${p.pct}%`,
                    background: "linear-gradient(90deg,#6366f1,#22d3ee)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="section-title" style={{ margin: "0 0 14px" }}>
            🗂️ توزيع الحالات
          </div>
          {stats.statusBreak.map((s) => {
            const m = metaOf(STATUS_META, s.key);
            const pct = stats.total ? Math.round((s.n / stats.total) * 100) : 0;
            return (
              <div key={s.key} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                  <span>{m.ar}</span>
                  <span className="muted">{s.n}</span>
                </div>
                <div className="bar" style={{ height: 7, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${pct}%`, background: m.color }} />
                </div>
              </div>
            );
          })}
          <Link href="/tasks" className="btn primary" style={{ marginTop: 10, width: "100%", justifyContent: "center" }}>
            إدارة المهام ←
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, num, color, pct }) {
  return (
    <div className="card stat">
      <div className="num" style={{ color }}>
        {num}
      </div>
      <div className="label">{label}</div>
      {typeof pct === "number" && (
        <div className="bar">
          <span style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
    </div>
  );
}
