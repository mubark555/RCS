"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { tasksStore, meetingsStore } from "@/lib/store";
import Icon from "@/components/Icon";
import { useRole } from "@/components/RoleProvider";
import { PRIORITY_META, HEALTH_META } from "@/lib/constants";

const DAY = 86400000;
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export default function Dashboard() {
  const router = useRouter();
  const { viewer, clientProject, scopeProjects } = useRole();
  const [allTasks, setAllTasks] = useState(null);
  const [allMeetings, setAllMeetings] = useState([]);

  async function reload() {
    setAllTasks(await tasksStore.list().catch(() => []));
  }
  useEffect(() => {
    reload();
    meetingsStore.list().then(setAllMeetings).catch(() => setAllMeetings([]));
  }, []);

  const tasks = scopeProjects && allTasks ? allTasks.filter((t) => scopeProjects.includes(t.project)) : allTasks;
  const meetings = scopeProjects ? (allMeetings || []).filter((m) => scopeProjects.includes(m.project)) : allMeetings;

  const s = useMemo(() => {
    if (!tasks) return null;
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "Completed").length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    const delayed = tasks.filter((t) => t.health === "Delayed").length;
    const attentionN = tasks.filter((t) => t.health === "Delayed" || t.health === "At Risk").length;

    const today = startOfDay(new Date());
    const horizon = today + 14 * DAY;
    const deadlines = tasks
      .filter((t) => t.status !== "Completed" && t.due_date)
      .map((t) => ({ t, due: startOfDay(new Date(t.due_date)) }))
      .filter((x) => !isNaN(x.due) && x.due <= horizon)
      .sort((a, b) => a.due - b.due)
      .slice(0, 7)
      .map(({ t, due }) => {
        let st = due < today ? "متأخر" : due === today ? "اليوم" : "قادم";
        return { t, due, status: st };
      });
    const weekCount = tasks.filter((t) => {
      if (t.status === "Completed" || !t.due_date) return false;
      const d = startOfDay(new Date(t.due_date));
      return !isNaN(d) && d >= today && d <= today + 7 * DAY;
    }).length;

    const attention = tasks.filter((t) => t.health === "Delayed" || t.health === "At Risk").slice(0, 4);
    return { total, completed, pct, delayed, attentionN, deadlines, weekCount, attention };
  }, [tasks]);

  const nextMeetings = useMemo(() => {
    const now = new Date().toISOString();
    return (meetings || [])
      .filter((m) => m.status !== "Cancelled" && m.start_at >= now)
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 3);
  }, [meetings]);

  async function markDone(t) {
    await tasksStore.update(t.id, { status: "Completed" });
    await reload();
  }

  if (!s) return <div className="empty">جاري التحميل…</div>;

  const DL_COLORS = { "متأخر": ["#fdeceb", "#e0574e"], "اليوم": ["#fbf0de", "#c88a2e"], "قادم": ["#eaf6ef", "#3f9d6d"] };

  return (
    <div>
      {/* الهيرو */}
      <div className="dash-hero">
        <span className="hav">{(viewer?.name || "ف").slice(0, 1)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>مرحباً {viewer?.name || "بفريق ڤيوليت"} 👋</h2>
          <p>
            {clientProject ? `متابعة مشروع ${clientProject} — ` : "لديك "}
            <b>{s.weekCount} استحقاقات</b> تحتاج المتابعة و<b>{s.delayed} مهام متعثرة</b> هذا الأسبوع
          </p>
        </div>
        <button className="hero-btn" onClick={() => router.push("/tasks")}>عرض مهامي</button>
      </div>

      {/* المؤشرات */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-ic" style={{ background: "#eaf1fd", color: "#2e77e5" }}><Icon name="tasks" size={24} /></span>
          <div><div className="num">{s.total}</div><div className="lbl">إجمالي المهام</div></div>
        </div>
        <div className="kpi-card">
          <span className="ring" style={{ background: `conic-gradient(#3f9d6d ${s.pct}%, #ede7da 0)` }}>
            <span className="inner">{s.pct}%</span>
          </span>
          <div><div className="num">{s.pct}%</div><div className="lbl">نسبة الإنجاز</div></div>
        </div>
        <div className="kpi-card">
          <span className="kpi-ic" style={{ background: "#fdeceb", color: "#e0574e" }}><Icon name="alert" size={24} /></span>
          <div><div className="num">{s.attentionN}</div><div className="lbl">تحتاج انتباه</div></div>
        </div>
        <div className="kpi-card">
          <span className="kpi-ic" style={{ background: "#fbf0de", color: "#c88a2e" }}><Icon name="clock" size={24} /></span>
          <div><div className="num">{s.weekCount}</div><div className="lbl">استحقاقات الأسبوع</div></div>
        </div>
      </div>

      <div className="dash-cols">
        {/* استحقاقات ومحطات */}
        <div className="card" style={{ borderRadius: 24 }}>
          <div className="section-title" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <span>استحقاقات ومحطات</span>
            <Link href="/tasks" className="pill">عرض الكل</Link>
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 16, paddingInlineStart: 15 }}>هذا الأسبوع · {s.deadlines.length} بند</div>
          {s.deadlines.length === 0 ? <div className="empty" style={{ padding: "30px 0" }}>لا استحقاقات قريبة</div> :
            s.deadlines.map(({ t, due, status }) => {
              const [bg, c] = DL_COLORS[status];
              return (
                <div className="dl-item" key={t.id}>
                  <button className="dl-check" title="وضع علامة مكتمل" onClick={() => markDone(t)} />
                  <div className="dl-body" onClick={() => router.push("/tasks")} style={{ cursor: "pointer" }}>
                    <b>{t.task}</b>
                    <small>{t.project} · {fmtDay(due)}</small>
                  </div>
                  <span className="dl-pill" style={{ background: bg, color: c }}>{status}</span>
                </div>
              );
            })}
        </div>

        {/* العمود الجانبي */}
        <div className="dash-side">
          <div className="card" style={{ borderRadius: 24 }}>
            <div className="section-title" style={{ justifyContent: "space-between" }}>
              <span>مهام تحتاج انتباه</span>
              <Link href="/tasks" style={{ color: "var(--primary)", fontWeight: 700, fontSize: 13 }}>الكل</Link>
            </div>
            {s.attention.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا مهام متعثرة</div> :
              s.attention.map((t) => {
                const pm = PRIORITY_META[t.priority] || PRIORITY_META.High;
                const hm = HEALTH_META[t.health] || HEALTH_META["At Risk"];
                return (
                  <div className="att-box" key={t.id}>
                    <div className="top">
                      <span className="miniflag" style={{ background: `${pm.color}1e`, color: pm.color }}>{pm.ar}</span>
                      <span className="miniflag" style={{ background: `${hm.color}1e`, color: hm.color }}>{hm.ar}</span>
                    </div>
                    <div className="att-title">{t.task}</div>
                    <div className="att-sub">{t.project} · {t.assigned_to || "غير مُسند"}</div>
                  </div>
                );
              })}
          </div>

          <div className="card" style={{ borderRadius: 24 }}>
            <div className="section-title"><span>اجتماعات العملاء القادمة</span></div>
            {nextMeetings.length === 0 ? <div className="empty" style={{ padding: "24px 0" }}>لا اجتماعات قادمة</div> :
              nextMeetings.map((m) => {
                const d = new Date(m.start_at);
                return (
                  <div className="mtg-item" key={m.id}>
                    <div className="date-box"><span className="mo">{MONTHS[d.getMonth()]}</span><span className="dy">{d.getDate()}</span></div>
                    <div className="mbody">
                      <b>{m.title}</b>
                      <small>{d.toLocaleString("ar-SA", { weekday: "long", hour: "2-digit", minute: "2-digit" })}{m.location ? ` · ${m.location}` : ""}</small>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtDay(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
