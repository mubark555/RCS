"use client";

import { useEffect, useMemo, useState } from "react";
import { kpisStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";

const CAT = { "مالي": "#16a34a", "نمو": "#2563eb", "تشغيلي": "#c88a2e", "تسويقي": "#7c5cf6", "رضا": "#e0574e" };
const CATS = ["مالي", "نمو", "تشغيلي", "تسويقي", "رضا"];
const PERIODS = { month: "هذا الشهر", quarter: "هذا الربع", year: "هذا العام" };

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
  const { canManage } = useRole();
  const [kpis, setKpis] = useState(null);
  const [period, setPeriod] = useState("quarter");
  const [editing, setEditing] = useState(null);

  async function reload() {
    setKpis(await kpisStore.list());
  }
  useEffect(() => { reload().catch(() => setKpis([])); }, []);

  const computed = useMemo(() => {
    if (!kpis) return null;
    const rows = kpis.map((k) => {
      const pct = k.target ? Math.min(999, Math.round((k.current / k.target) * 100)) : 0;
      return { ...k, pct, st: statusOf(pct) };
    });
    const total = rows.length;
    const behind = rows.filter((k) => k.pct < 60).length;
    const onTrack = total - behind;
    const overall = total ? Math.round(rows.reduce((s, k) => s + Math.min(100, k.pct), 0) / total) : 0;
    return { rows, total, behind, onTrack, overall };
  }, [kpis]);

  async function del(k) {
    if (!confirm(`حذف المؤشر؟\n\n${k.name}`)) return;
    await kpisStore.remove(k.id);
    await reload();
  }

  if (!computed) return <div className="empty">جاري التحميل…</div>;
  const { rows, total, behind, onTrack, overall } = computed;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div className="seg">
          {Object.keys(PERIODS).map((p) => (
            <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>
              {p === "month" ? "شهري" : p === "quarter" ? "ربعي" : "سنوي"}
            </button>
          ))}
        </div>
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
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2, color: "var(--ink)" }}>أداء {PERIODS[period]}</div>
          </div>
        </div>
        <div className="kpi-sum-stats">
          <div className="ks-box"><div className="k">إجمالي المؤشرات</div><div className="v">{total}</div></div>
          <div className="ks-box" style={{ background: "#eaf6ef" }}><div className="k" style={{ color: "#16a34a" }}>على المسار</div><div className="v" style={{ color: "#16a34a" }}>{onTrack}</div></div>
          <div className="ks-box" style={{ background: "#fdeceb" }}><div className="k" style={{ color: "#e0574e" }}>تحتاج تدخّل</div><div className="v" style={{ color: "#e0574e" }}>{behind}</div></div>
        </div>
      </div>

      {/* بطاقات المؤشرات */}
      <div className="kpi-cards">
        {rows.map((k) => {
          const c = CAT[k.category] || "#9c968b";
          const unit = k.unit ? ` ${k.unit}` : "";
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
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? "تعديل المؤشر" : "إضافة مؤشر / مستهدف جديد"} onClose={() => setEditing(null)}>
          <KpiForm
            initial={editing.id ? editing : null}
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

function KpiForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ name: "", category: "تسويقي", unit: "", current: "", target: "", ...(initial || {}) });
  const [err, setErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setErr(false); };

  async function submit(e) {
    e.preventDefault();
    const target = parseFloat(f.target);
    if (!f.name.trim() || !target || target <= 0) { setErr(true); return; }
    setSaving(true);
    try {
      await onSave({ name: f.name.trim(), category: f.category, unit: (f.unit || "").trim(), current: parseFloat(f.current) || 0, target });
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
        <label className="field"><span>القيمة الحالية</span><input type="number" value={f.current} onChange={set("current")} placeholder="0" /></label>
        <label className="field"><span>المستهدف *</span><input type="number" value={f.target} onChange={set("target")} placeholder="0" /></label>
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
