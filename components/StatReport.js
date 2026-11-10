"use client";

import { useEffect, useMemo } from "react";
import Icon from "@/components/Icon";
import { STATUS_META, CURRENCY, isDone, taskProgress } from "@/lib/constants";
import { taskStats, money, relDays, daysUntil } from "@/lib/metrics";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const fmtD = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? s : `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

// تجميع وعدّ (مرتّب تنازلياً)
function groupCount(list, keyFn) {
  const m = {};
  list.forEach((x) => { const k = (keyFn(x) || "غير محدد").toString().trim() || "غير محدد"; m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

const META = {
  progress: { title: "تقرير الإنجاز", ico: "chart", color: "#16a34a", bg: "#eaf6ef" },
  upcoming: { title: "التسليمات خلال 14 يوماً", ico: "calendar", color: "#2563eb", bg: "#eaf1fd" },
  overdue: { title: "تقرير الأعمال المتأخرة", ico: "alert", color: "#e0574e", bg: "#fdeceb" },
  pending: { title: "تقرير الاعتمادات المعلّقة", ico: "check", color: "#7c3aed", bg: "#f1ebfd" },
  finance: { title: "تقرير المستحقات المالية", ico: "briefcase", color: "#c88a2e", bg: "#fbf0de" },
};

// نافذة تقرير مصغّر لكل بطاقة مؤشر في الرئيسية
// kind: progress | upcoming | overdue | pending | finance
export default function StatReport({ kind, d, onClose, onOpenTask, onNavigate }) {
  const m = META[kind];
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = useMemo(() => build(kind, d), [kind, d]);

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const rows = body.rows.length ? body.rows : [{ "—": "لا بيانات" }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "التفاصيل");
    XLSX.writeFile(wb, `${m.title}.xlsx`);
  }

  return (
    <div className="overlay sr-overlay" onMouseDown={onClose}>
      <div className="sr" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sr-head" style={{ "--c": m.color, "--b": m.bg }}>
          <span className="sr-ic"><Icon name={m.ico} size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{m.title}</h3>
            <small>{body.subtitle}</small>
          </div>
          <button className="btn sm ghost" onClick={exportExcel} title="تصدير Excel"><Icon name="upload" size={14} /> Excel</button>
          {body.link && <button className="btn sm" onClick={() => onNavigate(body.link.href)}>{body.link.label} <Icon name="arrow" size={13} style={{ transform: "scaleX(-1)" }} /></button>}
          <button className="sr-x" onClick={onClose} title="إغلاق"><Icon name="close" size={16} /></button>
        </div>

        <div className="sr-chips">
          {body.chips.map((c) => (
            <div className="sr-chip" key={c.l}>
              <b style={{ color: c.c }}>{c.n}</b>
              <small>{c.l}</small>
            </div>
          ))}
        </div>

        <div className="sr-body">
          {body.breakdowns.length > 0 && (
            <div className="sr-breaks">
              {body.breakdowns.map((b) => (
                <div className="sr-break" key={b.title}>
                  <div className="sr-bt">{b.title}</div>
                  {b.items.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>—</div> : b.items.slice(0, 6).map(([k, v]) => {
                    const max = b.items[0][1] || 1;
                    return (
                      <div className="sr-bar" key={k}>
                        <span className="k" title={k}>{k}</span>
                        <span className="t"><i style={{ width: `${Math.max(6, (v / max) * 100)}%`, background: b.color || m.color }} /></span>
                        <b>{b.fmt ? b.fmt(v) : v}</b>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div className="sr-list">
            <div className="sr-lt">{body.listTitle} <span>({body.list.length})</span></div>
            {body.list.length === 0 ? (
              <div className="sr-empty"><Icon name="check" size={20} /> {body.empty}</div>
            ) : body.list.map((it) => (
              <div className={`sr-item${it.task || it.href ? " click" : ""}`} key={it.key} onClick={it.task ? () => onOpenTask(it.task) : it.href ? () => onNavigate(it.href) : undefined}>
                <span className="sr-dot" style={{ background: it.dot || m.color }} />
                <div className="sr-main">
                  <b>{it.title}</b>
                  <small>{it.sub}</small>
                  {it.extra && <div className="sr-extra">{it.extra.map((e) => <span key={e.k}><i>{e.k}</i>{e.v}</span>)}</div>}
                </div>
                {it.badge && <span className="sr-badge" style={{ background: it.badge.bg, color: it.badge.c }}>{it.badge.t}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function build(kind, d) {
  const { tasks = [], overdue = [], upcoming = [], pending = [], revision = [], fin, projects = [] } = d || {};
  const out = { chips: [], breakdowns: [], list: [], rows: [], listTitle: "", empty: "", subtitle: "", link: null };

  if (kind === "progress") {
    const st = taskStats(tasks);
    const byStatus = groupCount(tasks, (t) => STATUS_META[t.status]?.ar || t.status);
    const perProject = projects.map((p) => {
      const pt = tasks.filter((t) => t.project === p.name);
      const s = taskStats(pt);
      return { p, s };
    }).filter((x) => x.s.total).sort((a, b) => a.s.progress - b.s.progress);
    const week = Date.now() - 7 * 86400000;
    const recent = tasks.filter((t) => isDone(t) && new Date(t.reviewed_at || t.completed_at || 0).getTime() >= week);
    out.subtitle = `${st.done} مهمة معتمدة من أصل ${st.total} — المتوسط المرجّح لنسب الإنجاز`;
    out.chips = [
      { n: `${st.progress}%`, l: "نسبة الإنجاز الكلية", c: "#16a34a" },
      { n: st.done, l: "معتمدة", c: "#16a34a" },
      { n: st.total - st.done, l: "مفتوحة", c: "#2563eb" },
      { n: recent.length, l: "اعتُمدت آخر 7 أيام", c: "#0d9488" },
      { n: st.pendingReview.length, l: "بانتظار سيم", c: "#7c3aed" },
    ];
    out.breakdowns = [
      { title: "توزيع المهام حسب الحالة", items: byStatus, color: "#2563eb" },
      { title: "الإنجاز حسب المشروع (الأقل أولاً)", items: perProject.map((x) => [x.p.name, x.s.progress]), fmt: (v) => `${v}%`, color: "#16a34a" },
    ];
    out.listTitle = "المشاريع";
    out.list = perProject.map(({ p, s }) => ({
      key: p.id, title: p.name, href: `/projects/${p.id}`, dot: p.color,
      sub: `${s.done}/${s.total} معتمدة · ${s.overdue.length} متأخرة · ${s.pendingReview.length} بانتظار سيم`,
      badge: { t: `${s.progress}%`, bg: "#eaf6ef", c: "#16a34a" },
    }));
    out.rows = perProject.map(({ p, s }) => ({ المشروع: p.name, "الإنجاز %": s.progress, المعتمدة: s.done, الإجمالي: s.total, المتأخرة: s.overdue.length, "بانتظار سيم": s.pendingReview.length }));
    out.empty = "لا مهام بعد";
    out.link = { href: "/projects", label: "المشاريع" };
  }

  if (kind === "upcoming") {
    const list = upcoming;
    const today = list.filter((x) => x.days === 0).length;
    const in3 = list.filter((x) => x.days <= 3).length;
    const lowProg = list.filter((x) => taskProgress(x.t) < 50).length;
    out.subtitle = "الأعمال غير المعتمدة التي يحلّ موعدها خلال الأسبوعين القادمين";
    out.chips = [
      { n: list.length, l: "تسليم قادم", c: "#2563eb" },
      { n: today, l: "اليوم", c: "#e0574e" },
      { n: in3, l: "خلال 3 أيام", c: "#c88a2e" },
      { n: lowProg, l: "إنجازها أقل من 50%", c: "#e0574e" },
      { n: list.filter((x) => x.t.status === "Pending Review").length, l: "سُلّمت وبانتظار سيم", c: "#7c3aed" },
    ];
    out.breakdowns = [
      { title: "حسب المشروع", items: groupCount(list, (x) => x.t.project), color: "#2563eb" },
      { title: "حسب المسؤول", items: groupCount(list, (x) => x.t.assigned_to), color: "#0d9488" },
    ];
    out.listTitle = "التسليمات حسب الأقرب";
    out.list = list.map(({ t, days }) => ({
      key: t.id, task: t, title: t.task,
      sub: `${t.project}${t.deliverable ? ` · ${t.deliverable}` : ""}${t.assigned_to ? ` · ${t.assigned_to}` : ""} · ${STATUS_META[t.status]?.ar || t.status} · ${taskProgress(t)}%`,
      dot: days <= 2 ? "#c88a2e" : "#2563eb",
      badge: { t: relDays(days), bg: days <= 2 ? "#fbf0de" : "#eaf1fd", c: days <= 2 ? "#c88a2e" : "#2563eb" },
    }));
    out.rows = list.map(({ t, days }) => ({ المهمة: t.task, المشروع: t.project, المخرج: t.deliverable || "", المسؤول: t.assigned_to || "", الحالة: STATUS_META[t.status]?.ar || t.status, "الإنجاز %": taskProgress(t), الاستحقاق: t.due_date, المتبقي: relDays(days) }));
    out.empty = "لا تسليمات خلال 14 يوماً";
    out.link = { href: "/tasks", label: "المهام" };
  }

  if (kind === "overdue") {
    const list = overdue;
    const lateDays = list.map((x) => -x.days);
    const avg = lateDays.length ? Math.round(lateDays.reduce((s, n) => s + n, 0) / lateDays.length) : 0;
    const max = lateDays.length ? Math.max(...lateDays) : 0;
    const noReason = list.filter((x) => !(x.t.blocker || "").trim()).length;
    const onSeem = list.filter((x) => /سيم/.test(x.t.waiting_on || "")).length;
    out.subtitle = "الأعمال التي تجاوزت تاريخ استحقاقها ولم تُعتمد بعد — مع الأسباب والجهة المطلوب منها الإجراء";
    out.chips = [
      { n: list.length, l: "عمل متأخر", c: "#e0574e" },
      { n: `${avg} يوم`, l: "متوسط التأخير", c: "#c88a2e" },
      { n: `${max} يوم`, l: "أطول تأخير", c: "#e0574e" },
      { n: onSeem, l: "الإجراء على سيم", c: "#7c3aed" },
      { n: noReason, l: "بلا سبب موثّق", c: "#64748b" },
    ];
    const bucket = (n) => (n <= 7 ? "حتى أسبوع" : n <= 30 ? "1–4 أسابيع" : n <= 90 ? "1–3 أشهر" : "أكثر من 3 أشهر");
    out.breakdowns = [
      { title: "الإجراء مطلوب من", items: groupCount(list, (x) => x.t.waiting_on), color: "#7c3aed" },
      { title: "حسب المشروع", items: groupCount(list, (x) => x.t.project), color: "#e0574e" },
      { title: "حسب المسؤول", items: groupCount(list, (x) => x.t.assigned_to), color: "#c88a2e" },
      { title: "مدة التأخير", items: groupCount(list, (x) => bucket(-x.days)), color: "#64748b" },
    ];
    out.listTitle = "الأعمال المتأخرة (الأقدم أولاً)";
    out.list = list.map(({ t, days }) => ({
      key: t.id, task: t, title: t.task,
      sub: `${t.project}${t.deliverable ? ` · ${t.deliverable}` : ""}${t.assigned_to ? ` · ${t.assigned_to}` : ""} · ${STATUS_META[t.status]?.ar || t.status} · ${taskProgress(t)}%`,
      dot: "#e0574e",
      extra: [
        { k: "السبب", v: t.blocker || "غير محدد" },
        { k: "مطلوب من", v: t.waiting_on || "—" },
        { k: "الاستحقاق", v: fmtD(t.due_date) },
        { k: "موعد المعالجة", v: t.resolve_date ? fmtD(t.resolve_date) : "—" },
      ],
      badge: { t: relDays(days), bg: "#fdeceb", c: "#e0574e" },
    }));
    out.rows = list.map(({ t, days }) => ({ المهمة: t.task, المشروع: t.project, المخرج: t.deliverable || "", المسؤول: t.assigned_to || "", الاستحقاق: t.due_date, "أيام التأخير": -days, السبب: t.blocker || "", "مطلوب من": t.waiting_on || "", "موعد المعالجة": t.resolve_date || "", "الإنجاز %": taskProgress(t), معلّقة: t.on_hold ? "نعم" : "" }));
    out.empty = "لا أعمال متأخرة";
    out.link = { href: "/tasks", label: "المهام" };
  }

  if (kind === "pending") {
    const waits = pending.map((t) => (t.ready_at ? -daysUntil(t.ready_at.slice(0, 10)) : 0));
    const avg = waits.length ? Math.round(waits.reduce((s, n) => s + n, 0) / waits.length) : 0;
    out.subtitle = "تسليمات أرسلها فريق ڤيوليت وتنتظر قرار سيم (اعتماد أو طلب تعديل)";
    out.chips = [
      { n: pending.length, l: "بانتظار قرار سيم", c: "#7c3aed" },
      { n: `${avg} يوم`, l: "متوسط الانتظار", c: "#c88a2e" },
      { n: waits.filter((n) => n > 3).length, l: "تنتظر أكثر من 3 أيام", c: "#e0574e" },
      { n: revision.length, l: "مطلوب تعديلها", c: "#d97706" },
    ];
    out.breakdowns = [
      { title: "حسب المشروع", items: groupCount(pending, (t) => t.project), color: "#7c3aed" },
      { title: "أرسلها", items: groupCount(pending, (t) => t.ready_by || t.assigned_to), color: "#0d9488" },
    ];
    out.listTitle = "بانتظار الاعتماد (الأقدم أولاً)";
    out.list = [
      ...pending.map((t, i) => ({
        key: t.id, task: t, title: t.task,
        sub: `${t.project}${t.deliverable ? ` · ${t.deliverable}` : ""} · أرسلها ${t.ready_by || t.assigned_to || "—"}${t.ready_at ? ` في ${fmtD(t.ready_at)}` : ""}`,
        dot: "#7c3aed",
        badge: { t: waits[i] === 0 ? "منذ اليوم" : `منذ ${waits[i]} يوم`, bg: "#f1ebfd", c: "#7c3aed" },
      })),
      ...revision.map((t) => ({
        key: `r-${t.id}`, task: t, title: t.task,
        sub: `${t.project} · مطلوب تعديل${t.review_note ? `: ${t.review_note}` : ""}`,
        dot: "#d97706", badge: { t: "مطلوب تعديل", bg: "#fbf0de", c: "#d97706" },
      })),
    ];
    out.rows = [
      ...pending.map((t, i) => ({ النوع: "بانتظار الاعتماد", المهمة: t.task, المشروع: t.project, المخرج: t.deliverable || "", أرسلها: t.ready_by || "", "تاريخ الإرسال": t.ready_at ? t.ready_at.slice(0, 10) : "", "أيام الانتظار": waits[i] })),
      ...revision.map((t) => ({ النوع: "مطلوب تعديل", المهمة: t.task, المشروع: t.project, الملاحظة: t.review_note || "" })),
    ];
    out.empty = "لا أعمال بانتظار المراجعة";
    out.link = { href: "/approvals", label: "قسم الاعتمادات" };
  }

  if (kind === "finance" && fin) {
    out.subtitle = "فواتير ڤيوليت المُرسلة لسيم برايم وغير المسدّدة بالكامل";
    out.chips = [
      { n: `${money(fin.total)} ${CURRENCY}`, l: "إجمالي المتبقّي", c: "#c88a2e" },
      { n: `${money(fin.overdueTotal)} ${CURRENCY}`, l: `متأخرة (${fin.overdue.length})`, c: "#e0574e" },
      { n: `${money(fin.due30Total)} ${CURRENCY}`, l: `تستحق خلال 30 يوماً (${fin.due30.length})`, c: "#2563eb" },
      { n: fin.open.length, l: "فاتورة مفتوحة", c: "#64748b" },
    ];
    const byProj = {};
    fin.open.forEach((r) => { const k = r.project || "عام"; byProj[k] = (byProj[k] || 0) + r.outstanding; });
    out.breakdowns = [
      { title: "المتبقّي حسب المشروع", items: Object.entries(byProj).sort((a, b) => b[1] - a[1]), fmt: (v) => money(v), color: "#c88a2e" },
    ];
    out.listTitle = "الفواتير المفتوحة (الأقرب استحقاقاً)";
    out.list = fin.open.map((r) => ({
      key: r.id, href: "/finance", title: `${r.number || "فاتورة"} · ${money(r.outstanding)} ${r.currency || CURRENCY}`,
      sub: `${r.project || "عام"} · المبلغ ${money(r.amount)}${r.paid ? ` · مدفوع ${money(r.paid)}` : ""} · الاستحقاق ${fmtD(r.due_date)}`,
      dot: r.days != null && r.days < 0 ? "#e0574e" : "#c88a2e",
      badge: { t: relDays(r.days), bg: r.days != null && r.days < 0 ? "#fdeceb" : "#fbf0de", c: r.days != null && r.days < 0 ? "#e0574e" : "#c88a2e" },
    }));
    out.rows = fin.open.map((r) => ({ الفاتورة: r.number, المشروع: r.project || "", المبلغ: r.amount, المدفوع: r.paid, المتبقي: r.outstanding, الاستحقاق: r.due_date || "", الحالة: r.st?.label || "" }));
    out.empty = "لا مستحقات مفتوحة";
    out.link = { href: "/finance", label: "المالية" };
  }
  return out;
}
