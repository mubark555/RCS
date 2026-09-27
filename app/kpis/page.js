"use client";

import { useEffect, useMemo, useState } from "react";
import { kpisStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import ChipMulti from "@/components/ChipMulti";
import { VISIBILITY_META, kpiAssignees, isPublicKpi } from "@/lib/constants";
import { kpiPct, kpiAchievement } from "@/lib/metrics";

const CAT = { "مالي": "#16a34a", "نمو": "#2563eb", "تشغيلي": "#c88a2e", "تسويقي": "#7c5cf6", "رضا": "#e0574e" };
const CATS = ["مالي", "نمو", "تشغيلي", "تسويقي", "رضا"];
// نوع فترة القياس لكل مؤشر
const PERIOD_TYPES = { month: "شهري", quarter: "ربع سنوي", year: "سنوي" };

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 ? 1 : 0) + "K";
  return `${n}`;
}
function statusOf(pct) {
  if (pct >= 85) return { label: "ممتاز", color: "#16a34a", bg: "#eaf6ef" };
  if (pct >= 60) return { label: "على المسار", color: "#c88a2e", bg: "#fbf0de" };
  return { label: "متأخر", color: "#e0574e", bg: "#fdeceb" };
}

export default function KpisPage() {
  const { canManage, projects, users } = useRole();
  const [kpis, setKpis] = useState(null);
  const [period, setPeriod] = useState(""); // "" = الكل
  const [fProject, setFProject] = useState("");
  const [editing, setEditing] = useState(null);

  async function reload() {
    setKpis(await kpisStore.list());
  }
  useEffect(() => { reload().catch(() => setKpis([])); }, []);

  const computed = useMemo(() => {
    if (!kpis) return null;
    const rows = kpis
      .filter((k) => !period || (k.period_type || "quarter") === period)
      .filter((k) => !fProject || (fProject === "_agency" ? !k.project : k.project === fProject))
      .map((k) => {
        const pct = kpiPct(k);
        return { ...k, pct, st: statusOf(pct) };
      });
    const total = rows.length;
    const behind = rows.filter((k) => k.pct < 60).length;
    const onTrack = total - behind;
    const overall = total ? Math.round(rows.reduce((s, k) => s + Math.min(100, k.pct), 0) / total) : 0;
    // نسبة التحقق لكل مشروع (كل المؤشرات المرتبطة به ضمن الفترة المختارة)
    const byProject = {};
    rows.forEach((k) => { const key = k.project || ""; (byProject[key] = byProject[key] || []).push(k); });
    const perProject = Object.entries(byProject)
      .map(([name, list]) => ({ name, label: name || "على مستوى الوكالة", pct: kpiAchievement(list), count: list.length }))
      .sort((a, b) => b.pct - a.pct);
    return { rows, total, behind, onTrack, overall, perProject };
  }, [kpis, period, fProject]);

  async function del(k) {
    if (!confirm(`حذف المؤشر؟\n\n${k.name}`)) return;
    await kpisStore.remove(k.id);
    await reload();
  }

  if (!computed) return <div className="empty">جاري التحميل…</div>;
  const { rows, total, behind, onTrack, overall, perProject } = computed;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div className="seg">
          <button className={period === "" ? "on" : ""} onClick={() => setPeriod("")}>الكل</button>
          {Object.entries(PERIOD_TYPES).map(([p, l]) => (
            <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>{l}</button>
          ))}
        </div>
        <select value={fProject} onChange={(e) => setFProject(e.target.value)} style={{ width: "auto" }}>
          <option value="">كل المشاريع</option>
          <option value="_agency">على مستوى الوكالة</option>
          {(projects || []).map((p) => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}
        </select>
        <div style={{ marginInlineStart: "auto" }} />
        {canManage && <button className="btn primary" onClick={() => setEditing({})}>+ مؤشر جديد</button>}
      </div>

      {/* بطاقة الملخص */}
      <div className="card kpi-summary">
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span className="kpi-ring" style={{ background: `conic-gradient(#16a34a ${overall * 3.6}deg, #ede7da 0)` }}>
            <span className="inner">{overall}%</span>
          </span>
          <div>
            <div className="muted" style={{ fontSize: 14 }}>متوسط تحقيق المستهدفات</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2, color: "var(--ink)" }}>{{ month: "المؤشرات الشهرية", quarter: "المؤشرات الربع سنوية", year: "المؤشرات السنوية" }[period] || "كل المؤشرات"}{fProject && fProject !== "_agency" ? ` — ${fProject}` : ""}</div>
          </div>
        </div>
        <div className="kpi-sum-stats">
          <div className="ks-box"><div className="k">إجمالي المؤشرات</div><div className="v">{total}</div></div>
          <div className="ks-box" style={{ background: "#eaf6ef" }}><div className="k" style={{ color: "#16a34a" }}>على المسار</div><div className="v" style={{ color: "#16a34a" }}>{onTrack}</div></div>
          <div className="ks-box" style={{ background: "#fdeceb" }}><div className="k" style={{ color: "#e0574e" }}>تحتاج تدخّل</div><div className="v" style={{ color: "#e0574e" }}>{behind}</div></div>
        </div>
      </div>

      {/* نسبة التحقق لكل مشروع */}
      {perProject.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title"><span>نسبة التحقق لكل مشروع</span></div>
          <div className="kp-proj">
            {perProject.map((p) => {
              const st = statusOf(p.pct);
              return (
                <div className="kp-proj-row" key={p.label} onClick={() => setFProject(p.name || "_agency")} title="عرض مؤشرات هذا المشروع">
                  <span className="kp-proj-name">{p.label} <small className="muted">({p.count})</small></span>
                  <div className="progress" style={{ height: 9, flex: 1 }}><span style={{ width: `${p.pct}%`, background: st.color }} /></div>
                  <b style={{ color: st.color, minWidth: 44, textAlign: "end" }}>{p.pct}%</b>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* بطاقات المؤشرات */}
      <div className="kpi-cards">
        {rows.map((k) => {
          const c = CAT[k.category] || "#9c968b";
          const unit = k.unit ? ` ${k.unit}` : "";
          const vis = VISIBILITY_META[isPublicKpi(k) ? "public" : "private"];
          const owners = kpiAssignees(k);
          return (
            <div className="kpi-item" key={k.id}>
              <div className="kpi-item-top">
                <span className="kpi-cat" style={{ background: `${c}1e`, color: c }}>{k.category}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="kpi-cat" style={{ background: k.st.bg, color: k.st.color }}>{k.st.label}</span>
                  {canManage && <button className="btn sm ghost icon" onClick={() => setEditing(k)} title="تعديل"><Icon name="edit" size={14} /></button>}
                  {canManage && <button className="btn sm danger icon" onClick={() => del(k)} title="حذف"><Icon name="trash" size={14} /></button>}
                </div>
              </div>
              <div className="kpi-name">{k.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 4px" }}>
                <span className="kpi-cat" style={{ background: vis.bg, color: vis.color }} title={vis.desc}>
                  {isPublicKpi(k) ? "◉" : "◍"} {vis.ar}
                </span>
                <span className="kpi-cat" style={{ background: "#eef2f7", color: "#475569" }}>
                  {k.project ? `📁 ${k.project}` : "على مستوى الوكالة"}
                </span>
                <span className="kpi-cat" style={{ background: "#f1ebfd", color: "#6d28d9" }}>
                  🗓 {PERIOD_TYPES[k.period_type || "quarter"]}{k.period ? ` · ${k.period}` : ""}
                </span>
              </div>
              <div className="kpi-val">
                <span className="cur">{fmt(k.current)}{unit}</span>
                <span className="tgt">من {fmt(k.target)}{unit}</span>
              </div>
              <div className="progress" style={{ height: 9, margin: "12px 0" }}>
                <span style={{ width: `${Math.min(100, k.pct)}%`, background: k.st.color }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>{k.pct}% من المستهدف</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: k.up ? "#16a34a" : "#e0574e" }}>
                  {k.up ? "▲" : "▼"} {k.trend || ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line, #ece6da)" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>المسؤولون:</span>
                {owners.length === 0
                  ? <span className="muted" style={{ fontSize: 12 }}>غير مُسند</span>
                  : owners.map((n) => <span key={n} className="pill" style={{ fontSize: 11.5, padding: "3px 9px" }}>{n}</span>)}
              </div>
              <div style={{ fontSize: 12, marginTop: 8, color: "var(--muted)" }}>
                <b style={{ fontWeight: 700 }}>مصدر القياس:</b> {k.source || "غير محدد"}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? "تعديل المؤشر" : "إضافة مؤشر / مستهدف جديد"} onClose={() => setEditing(null)}>
          <KpiForm
            initial={editing.id ? editing : null}
            projects={projects}
            users={users}
            onCancel={() => setEditing(null)}
            onSave={async (payload) => {
              if (editing.id) await kpisStore.update(editing.id, payload);
              else await kpisStore.create({ ...payload, up: true, trend: "مؤشر جديد" });
              setEditing(null);
              await reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function KpiForm({ initial, projects = [], users = [], onSave, onCancel }) {
  const [f, setF] = useState({
    name: "", category: "تسويقي", unit: "", current: "", target: "",
    project: "", visibility: "private", period_type: "quarter", period: "", source: "",
    ...(initial || {}),
    assignees: kpiAssignees(initial || {}),
  });
  const [err, setErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setErr(false); };
  const setArr = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const assigneeOptions = users.filter((u) => u.role === "member" || u.role === "manager");

  async function submit(e) {
    e.preventDefault();
    const target = parseFloat(f.target);
    if (!f.name.trim() || !target || target <= 0) { setErr(true); return; }
    setSaving(true);
    try {
      // حمولة نظيفة بأعمدة الجدول فقط (نتجنب الحقول المحسوبة مثل pct/st)
      await onSave({
        name: f.name.trim(),
        category: f.category,
        unit: (f.unit || "").trim(),
        current: parseFloat(f.current) || 0,
        target,
        project: f.project || "",
        visibility: f.visibility === "public" ? "public" : "private",
        assignees: Array.isArray(f.assignees) ? f.assignees : [],
        period_type: PERIOD_TYPES[f.period_type] ? f.period_type : "quarter",
        period: (f.period || "").trim(),
        source: (f.source || "").trim(),
      });
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit}>
      <label className="field full"><span>اسم المؤشر *</span><input value={f.name} onChange={set("name")} placeholder="مثال: عدد العملاء الجدد" /></label>
      <div className="form-grid">
        <label className="field"><span>التصنيف</span>
          <select value={f.category} onChange={set("category")}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <label className="field"><span>الوحدة</span><input value={f.unit} onChange={set("unit")} placeholder="ريال / % / عميل" /></label>
        <label className="field"><span>النتيجة الفعلية</span><input type="number" value={f.current} onChange={set("current")} placeholder="0" /></label>
        <label className="field"><span>المستهدف *</span><input type="number" value={f.target} onChange={set("target")} placeholder="0" /></label>

        <label className="field"><span>المشروع المرتبط</span>
          <select value={f.project} onChange={set("project")}>
            <option value="">عام — على مستوى الوكالة</option>
            {projects.map((p) => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span>الفترة</span>
          <select value={f.period_type} onChange={set("period_type")}>
            {Object.entries(PERIOD_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field"><span>تسمية الفترة</span><input value={f.period} onChange={set("period")} placeholder="مثال: الربع الثالث 2026" /></label>
        <label className="field full"><span>مصدر القياس</span><input value={f.source} onChange={set("source")} placeholder="مثال: Google Analytics / تقرير المبيعات / استبيان العملاء" /></label>
        <label className="field"><span>الرؤية</span>
          <select value={f.visibility} onChange={set("visibility")}>
            <option value="private">خاصة — داخلية لا تظهر للعملاء</option>
            <option value="public">عامة — تظهر للعملاء</option>
          </select>
        </label>
      </div>

      <div className="field full" style={{ marginTop: 4 }}>
        <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginBottom: 6, fontWeight: 700 }}>الموظفون المسؤولون عن المستهدف</span>
        <ChipMulti options={assigneeOptions} value={f.assignees} onChange={setArr("assignees")} empty="أضِف موظفين من قسم الفريق" />
      </div>

      {err && <div style={{ background: "#fdeceb", color: "#e0574e", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 11, marginBottom: 12 }}>الرجاء إدخال اسم المؤشر وقيمة مستهدفة صحيحة.</div>}
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "…" : editing_label(initial)}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
function editing_label(initial) { return initial ? "حفظ" : "إضافة المؤشر"; }
