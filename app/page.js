"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { tasksStore, meetingsStore } from "@/lib/store";
import Donut from "@/components/Donut";
import Badge from "@/components/Badge";
import {
  STATUS_META,
  HEALTH_META,
  PRIORITY_META,
  PROJECTS,
  metaOf,
} from "@/lib/constants";

export default function Dashboard() {
  const [tasks, setTasks] = useState(null);
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    tasksStore.list().then(setTasks).catch(() => setTasks([]));
    meetingsStore.list().then(setMeetings).catch(() => setMeetings([]));
  }, []);

  const s = useMemo(() => {
    if (!tasks) return null;
    const total = tasks.length;
    const by = (fn) => tasks.filter(fn).length;
    const completed = by((t) => t.status === "Completed");
    const inProgress = by((t) => t.status === "In Progress");
    const notStarted = by((t) => t.status === "Not Started");
    const onHold = by((t) => t.status === "On Hold");
    const delayed = by((t) => t.health === "Delayed");
    const atRisk = by((t) => t.health === "At Risk");
    const healthy = by((t) => t.health === "On Track");
    const pending = by((t) => t.approval_status === "Pending Review");
    const pct = total ? Math.round((completed / total) * 100) : 0;

    const byProject = PROJECTS.map((p) => {
      const items = tasks.filter((t) => t.project === p);
      const done = items.filter((t) => t.status === "Completed").length;
      return { project: p, total: items.length, done, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
    })
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total);

    const statusSeg = Object.keys(STATUS_META).map((k) => ({
      label: STATUS_META[k].ar,
      value: by((t) => t.status === k),
      color: STATUS_META[k].color,
    }));

    const attention = tasks
      .filter((t) => t.health === "Delayed" || t.health === "At Risk")
      .sort((a, b) => (a.health === "Delayed" ? -1 : 1))
      .slice(0, 6);

    return { total, completed, inProgress, notStarted, onHold, delayed, atRisk, healthy, pending, pct, byProject, statusSeg, attention };
  }, [tasks]);

  const upcoming = useMemo(() => {
    const now = new Date().toISOString();
    return (meetings || [])
      .filter((m) => m.status !== "Cancelled" && m.start_at >= now)
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 4);
  }, [meetings]);

  if (!s) return <div className="empty"><div className="big">⏳</div>جاري التحميل…</div>;

  return (
    <div>
      {/* بطاقات المؤشرات */}
      <div className="grid cards">
        <Kpi icon="📋" tint="#5b5bf1" num={s.total} label="إجمالي المهام" sub={`${s.byProject.length} مشاريع نشطة`} subColor="#8a93ab" />
        <Kpi icon="✅" tint="#16a34a" num={`${s.pct}%`} label="نسبة الإنجاز" progress={s.pct} progressColor="#16a34a" />
        <Kpi icon="⚡" tint="#2563eb" num={s.inProgress} label="قيد التنفيذ" sub={`${s.pending} بانتظار الاعتماد`} subColor="#2563eb" />
        <Kpi icon="⚠️" tint="#dc2626" num={s.delayed + s.atRisk} label="تحتاج انتباه" sub={`${s.delayed} متعثرة · ${s.atRisk} معرّضة`} subColor="#dc2626" />
      </div>

      <div className="dash-2col">
        {/* التقدم حسب المشروع */}
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 18px" }}>
            📊 التقدّم حسب المشروع
          </div>
          {s.byProject.map((p) => (
            <div key={p.project} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 7 }}>
                <strong>{p.project}</strong>
                <span className="muted" style={{ fontWeight: 700 }}>
                  {p.done}/{p.total} · {p.pct}%
                </span>
              </div>
              <div className="progress">
                <span style={{ width: `${p.pct}%`, background: "linear-gradient(90deg,#6366f1,#a855f7)" }} />
              </div>
            </div>
          ))}
        </div>

        {/* توزيع الحالات - دائري */}
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 12px" }}>
            🗂️ توزيع الحالات
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
            <Donut segments={s.statusSeg} centerTop={s.total} centerBottom="مهمة" />
            <div className="legend" style={{ minWidth: 150, flex: 1 }}>
              {s.statusSeg.map((seg) => (
                <div className="lrow" key={seg.label}>
                  <span className="ld" style={{ background: seg.color }} />
                  <span>{seg.label}</span>
                  <span className="ln">{seg.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-2col">
        {/* يحتاج انتباه */}
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 6px", justifyContent: "space-between" }}>
            <span>🚨 مهام تحتاج انتباه</span>
            <Link href="/tasks" className="pill">عرض الكل</Link>
          </div>
          {s.attention.length === 0 ? (
            <div className="empty" style={{ padding: "30px 0" }}>لا توجد مهام متعثرة 🎉</div>
          ) : (
            s.attention.map((t) => (
              <div className="mini-item" key={t.id}>
                <Badge map={HEALTH_META} value={t.health} />
                <div className="mtxt">
                  <b>{t.task}</b>
                  <small>{t.project} · {t.assigned_to || "غير مُسند"}</small>
                </div>
                <Badge map={PRIORITY_META} value={t.priority} />
              </div>
            ))
          )}
        </div>

        {/* الاجتماعات القادمة */}
        <div className="card">
          <div className="section-title" style={{ margin: "0 0 6px", justifyContent: "space-between" }}>
            <span>📅 الاجتماعات القادمة</span>
            <Link href="/meetings" className="pill">الجدول</Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="empty" style={{ padding: "30px 0" }}>لا اجتماعات قادمة</div>
          ) : (
            upcoming.map((m) => (
              <div className="mini-item" key={m.id}>
                <span className="list-card-ic" style={{ fontSize: 20 }}>🗓️</span>
                <div className="mtxt">
                  <b>{m.title}</b>
                  <small>
                    {new Date(m.start_at).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {m.project ? ` · ${m.project}` : ""}
                  </small>
                </div>
              </div>
            ))
          )}
          <Link href="/tasks" className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
            الانتقال إلى إدارة المهام ←
          </Link>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, tint, num, label, sub, subColor, progress, progressColor }) {
  return (
    <div className="card hover">
      <div className="kpi">
        <div className="kicon" style={{ background: `${tint}18`, color: tint }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div className="knum">{num}</div>
          <div className="klabel">{label}</div>
          {sub && <div className="ksub" style={{ color: subColor }}>{sub}</div>}
        </div>
      </div>
      {typeof progress === "number" && (
        <div className="progress">
          <span style={{ width: `${progress}%`, background: progressColor }} />
        </div>
      )}
    </div>
  );
}
