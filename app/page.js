"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { tasksStore, meetingsStore } from "@/lib/store";
import Donut from "@/components/Donut";
import Badge from "@/components/Badge";
import { STATUS_META, HEALTH_META, PRIORITY_META, PROJECTS } from "@/lib/constants";

const DAY = 86400000;

export default function Home() {
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
    const delayed = by((t) => t.health === "Delayed");
    const atRisk = by((t) => t.health === "At Risk");
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
      .slice(0, 6);

    return { total, completed, inProgress, delayed, atRisk, pct, byProject, statusSeg, attention };
  }, [tasks]);

  // "هذا الأسبوع": مهام مستحقة قريباً/متأخرة + اجتماعات قادمة
  const week = useMemo(() => {
    if (!tasks) return [];
    const now = Date.now();
    const horizon = now + 12 * DAY;
    const items = [];

    for (const t of tasks) {
      if (t.status === "Completed" || !t.due_date) continue;
      const due = new Date(t.due_date).getTime();
      if (isNaN(due) || due > horizon) continue;
      items.push({
        id: "t" + t.id,
        kind: "task",
        title: t.task,
        project: t.project,
        date: due,
        late: due < now - DAY / 2,
      });
    }
    for (const m of meetings || []) {
      const st = new Date(m.start_at).getTime();
      if (isNaN(st) || m.status === "Cancelled" || st < now - DAY || st > horizon) continue;
      items.push({ id: "m" + m.id, kind: "meeting", title: m.title, project: m.project, date: st, late: false });
    }
    return items.sort((a, b) => a.date - b.date).slice(0, 8);
  }, [tasks, meetings]);

  const nextMeetings = useMemo(() => {
    const now = new Date().toISOString();
    return (meetings || [])
      .filter((m) => m.status !== "Cancelled" && m.start_at >= now)
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 2);
  }, [meetings]);

  if (!s) return <div className="empty"><div className="big">⏳</div>جاري التحميل…</div>;

  return (
    <div>
      {/* الهيرو */}
      <div className="hero">
        <span className="h-av">ف</span>
        <div>
          <h2>مرحباً بفريق ڤيوليت 👋</h2>
          <p>لديك {week.length} استحقاق يحتاج المتابعة خلال هذا الأسبوع</p>
        </div>
        <div className="h-stats">
          <div className="h-chip"><div className="n">{s.total}</div><div className="l">إجمالي المهام</div></div>
          <div className="h-chip"><div className="n">{s.pct}%</div><div className="l">نسبة الإنجاز</div></div>
          <div className="h-chip"><div className="n" style={{ color: "#e05a50" }}>{s.delayed + s.atRisk}</div><div className="l">تحتاج انتباه</div></div>
        </div>
      </div>

      <div className="dash-2col">
        {/* هذا الأسبوع */}
        <div className="card">
          <div className="section-title" style={{ justifyContent: "space-between" }}>
            <span>🗓️ هذا الأسبوع <span className="hint">· استحقاقات ومحطات</span></span>
            <Link href="/tasks" className="pill">عرض الكل</Link>
          </div>
          {week.length === 0 ? (
            <div className="empty" style={{ padding: "30px 0" }}>لا استحقاقات قريبة 🎉</div>
          ) : (
            week.map((it) => <TimelineRow key={it.id} it={it} />)
          )}
        </div>

        {/* العمود الجانبي */}
        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="section-title" style={{ justifyContent: "space-between" }}>
              <span>📇 اجتماعات العملاء القادمة</span>
              <Link href="/meetings" className="pill">الجدول</Link>
            </div>
            {nextMeetings.length === 0 ? (
              <div className="empty" style={{ padding: "24px 0" }}>لا اجتماعات قادمة</div>
            ) : (
              nextMeetings.map((m) => <MeetingMini key={m.id} m={m} />)
            )}
          </div>

          <div className="card">
            <div className="section-title" style={{ justifyContent: "space-between" }}>
              <span>🚨 مهام تحتاج انتباه</span>
              <Link href="/tasks" className="pill">الكل</Link>
            </div>
            {s.attention.length === 0 ? (
              <div className="empty" style={{ padding: "24px 0" }}>لا مهام متعثرة 🎉</div>
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
        </div>
      </div>

      {/* التحليلات */}
      <div className="dash-2col">
        <div className="card">
          <div className="section-title">📊 التقدّم حسب المشروع</div>
          {s.byProject.map((p) => (
            <div key={p.project} style={{ marginBottom: 15 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 7 }}>
                <strong>{p.project}</strong>
                <span className="muted" style={{ fontWeight: 700 }}>{p.done}/{p.total} · {p.pct}%</span>
              </div>
              <div className="progress">
                <span style={{ width: `${p.pct}%`, background: "linear-gradient(90deg,#e05a50,#f0917a)" }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="section-title">🍩 توزيع الحالات</div>
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
    </div>
  );
}

function TimelineRow({ it }) {
  const meta =
    it.kind === "meeting"
      ? { ico: "🗓️", tint: "#3f8e7f", bg: "#e4f0ec", type: "اجتماع" }
      : { ico: "✓", tint: "#e05a50", bg: "#fcece9", type: "مهمة" };
  const d = new Date(it.date);
  const dateStr = d.toLocaleDateString("ar-SA", { month: "long", day: "numeric" });
  return (
    <div className="tl-item">
      <span className="tl-ico" style={{ background: meta.bg, color: meta.tint }}>{meta.ico}</span>
      <div className="tl-body">
        <b>{it.title}</b>
        <small>{it.project ? it.project + " · " : ""}{dateStr}</small>
      </div>
      {it.late ? (
        <span className="badge" style={{ background: "#fcece9", color: "#cf4940" }}>
          <span className="dot" style={{ background: "#cf4940" }} />متأخر
        </span>
      ) : (
        <span className="tl-type">{meta.type}</span>
      )}
    </div>
  );
}

function MeetingMini({ m }) {
  const d = new Date(m.start_at);
  const dateStr = d.toLocaleString("ar-SA", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span className="tl-ico" style={{ background: "#e4f0ec", color: "#3f8e7f" }}>🗓️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14, color: "var(--ink)", display: "block" }}>{m.title}</b>
          <small className="muted" style={{ fontSize: 12 }}>{dateStr}</small>
        </div>
      </div>
      {m.agenda && (
        <div className="note-box">
          <b>ماذا نعرض</b>
          {m.agenda}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "var(--primary)" }}>
        {m.project && <span>📁 {m.project}</span>}
        {m.location && <span>🔗 رابط الاجتماع</span>}
      </div>
    </div>
  );
}
