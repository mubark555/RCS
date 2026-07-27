"use client";

import { useEffect, useMemo, useState } from "react";
import { invoicesStore, paymentsStore, kpisStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import Donut from "@/components/Donut";
import Bar from "@/components/Bar";
import TrendLine from "@/components/TrendLine";
import {
  FINANCE_PROVIDER, FINANCE_PAYER, CURRENCY, INVOICE_STATUSES, PAYMENT_METHODS, invoiceState,
} from "@/lib/constants";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function shortMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 ? 1 : 0) + "M";
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 ? 1 : 0) + "K";
  return `${v}`;
}

export default function FinancePage() {
  const { canFinance, canManage, projects, ready } = useRole();
  const [invoices, setInvoices] = useState(null);
  const [payments, setPayments] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [editing, setEditing] = useState(null);   // فاتورة قيد التحرير/الإضافة
  const [payFor, setPayFor] = useState(null);      // فاتورة يُسجّل لها دفعة

  async function reload() {
    const [inv, pay] = await Promise.all([invoicesStore.list(), paymentsStore.list()]);
    setInvoices(inv);
    setPayments(pay);
  }
  useEffect(() => {
    reload().catch(() => { setInvoices([]); setPayments([]); });
    kpisStore.list().then(setKpis).catch(() => setKpis([]));
  }, []);

  const paidByInv = useMemo(() => {
    const m = {};
    (payments || []).forEach((p) => { m[p.invoice_id] = (m[p.invoice_id] || 0) + (Number(p.amount) || 0); });
    return m;
  }, [payments]);

  const rows = useMemo(() => {
    if (!invoices) return null;
    return invoices.map((inv) => {
      const paid = paidByInv[inv.id] || 0;
      const st = invoiceState(inv, paid);
      const amount = Number(inv.amount) || 0;
      const outstanding = Math.max(0, amount - paid);
      return { ...inv, paid, st, amount, outstanding };
    });
  }, [invoices, paidByInv]);

  const totals = useMemo(() => {
    if (!rows) return null;
    const active = rows.filter((r) => r.status !== "ملغاة" && r.status !== "مسودة");
    const invoiced = active.reduce((s, r) => s + r.amount, 0);
    const collected = active.reduce((s, r) => s + Math.min(r.paid, r.amount), 0);
    const outstanding = Math.max(0, invoiced - collected);
    const overdue = active.filter((r) => r.st.key === "overdue");
    const overdueAmount = overdue.reduce((s, r) => s + r.outstanding, 0);
    const rate = invoiced ? Math.round((collected / invoiced) * 100) : 0;

    // حسب المشروع
    const byProj = {};
    active.forEach((r) => { const k = r.project || "عام"; byProj[k] = (byProj[k] || 0) + r.amount; });
    const projBars = Object.entries(byProj).map(([label, value]) => ({ label, value }));

    // الفوترة الشهرية (آخر 6 أشهر ظهرت)
    const byMonth = {};
    active.forEach((r) => {
      if (!r.issue_date) return;
      const d = new Date(r.issue_date);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      byMonth[key] = (byMonth[key] || { ts: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), value: 0, label: MONTHS[d.getMonth()] });
      byMonth[key].value += r.amount;
    });
    const monthPts = Object.values(byMonth).sort((a, b) => a.ts - b.ts).slice(-6).map((m) => ({ label: m.label, value: m.value }));

    return { invoiced, collected, outstanding, overdueAmount, overdueCount: overdue.length, rate, projBars, monthPts, count: active.length };
  }, [rows]);

  async function delInvoice(inv) {
    if (!confirm(`حذف الفاتورة ${inv.number}؟\nسيتم حذف مدفوعاتها المرتبطة أيضاً.`)) return;
    // احذف مدفوعاتها أولاً (في الوضع المحلي لا يوجد cascade)
    const related = (payments || []).filter((p) => p.invoice_id === inv.id);
    for (const p of related) { await paymentsStore.remove(p.id).catch(() => {}); }
    await invoicesStore.remove(inv.id);
    await reload();
  }

  async function exportExcel() {
    if (!rows) return;
    const XLSX = await import("xlsx");
    const data = rows.map((r) => ({
      "رقم الفاتورة": r.number, "المُصدِر": r.provider || FINANCE_PROVIDER, "الجهة الدافعة": r.payer || FINANCE_PAYER,
      "المشروع": r.project || "عام", "المبلغ": r.amount, "المدفوع": r.paid, "المتبقّي": r.outstanding,
      "العملة": r.currency || CURRENCY, "تاريخ الإصدار": r.issue_date || "", "الاستحقاق": r.due_date || "",
      "الحالة": r.st.label, "ملاحظات": r.note || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الفواتير");
    XLSX.writeFile(wb, "فواتير-سيم-برايم.xlsx");
  }

  if (ready && !canFinance) {
    return (
      <div className="empty" style={{ padding: "60px 0", textAlign: "center" }}>
        <div style={{ display: "inline-flex", marginBottom: 12, color: "var(--muted)" }}><Icon name="alert" size={34} /></div>
        <div style={{ fontWeight: 800, fontSize: 17, color: "var(--ink)" }}>قسم المالية مقيّد</div>
        <p className="muted" style={{ maxWidth: 380, margin: "8px auto 0" }}>
          هذا القسم متاح للحسابات المخوّلة فقط. تواصل مع مالك النظام لمنحك الصلاحية من «تخصيص النظام».
        </p>
      </div>
    );
  }

  if (!totals || !rows) return <div className="empty">جاري التحميل…</div>;

  return (
    <div className="fin-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div className="muted" style={{ fontSize: 13.5, fontWeight: 600 }}>
          المقابل المالي: <b style={{ color: "var(--ink)" }}>{FINANCE_PROVIDER}</b> تُصدر الفواتير و<b style={{ color: "var(--ink)" }}>{FINANCE_PAYER}</b> تسدّد
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={exportExcel} title="تصدير Excel"><Icon name="upload" size={16} /> تصدير Excel</button>
          <button className="btn ghost" onClick={() => window.print()} title="طباعة / PDF"><Icon name="file" size={16} /> طباعة</button>
          {canManage && <button className="btn primary" onClick={() => setEditing({})}>+ فاتورة جديدة</button>}
        </div>
      </div>

      {/* بطاقات الملخّص */}
      <div className="fin-cards">
        <div className="fin-card">
          <span className="fin-ic" style={{ background: "#eaf1fd", color: "#2563eb" }}><Icon name="file" size={22} /></span>
          <div><div className="v">{money(totals.invoiced)} <small>{CURRENCY}</small></div><div className="k">إجمالي المُفوتر ({totals.count})</div></div>
        </div>
        <div className="fin-card">
          <span className="fin-ic" style={{ background: "#eaf6ef", color: "#16a34a" }}><Icon name="check" size={22} /></span>
          <div><div className="v" style={{ color: "#16a34a" }}>{money(totals.collected)} <small>{CURRENCY}</small></div><div className="k">المُحصّل ({totals.rate}%)</div></div>
        </div>
        <div className="fin-card">
          <span className="fin-ic" style={{ background: "#fbf0de", color: "#c88a2e" }}><Icon name="clock" size={22} /></span>
          <div><div className="v" style={{ color: "#c88a2e" }}>{money(totals.outstanding)} <small>{CURRENCY}</small></div><div className="k">المتبقّي للتحصيل</div></div>
        </div>
        <div className="fin-card">
          <span className="fin-ic" style={{ background: "#fdeceb", color: "#e0574e" }}><Icon name="alert" size={22} /></span>
          <div><div className="v" style={{ color: "#e0574e" }}>{money(totals.overdueAmount)} <small>{CURRENCY}</small></div><div className="k">متأخرة ({totals.overdueCount})</div></div>
        </div>
      </div>

      {/* الرسوم البيانية */}
      <div className="fin-charts">
        <div className="card">
          <div className="section-title"><span>نسبة التحصيل</span></div>
          <div style={{ display: "grid", placeItems: "center", padding: "8px 0" }}>
            <Donut
              size={180} thickness={24}
              centerTop={`${totals.rate}%`} centerBottom="محصّل"
              segments={[
                { label: "محصّل", value: totals.collected, color: "#16a34a" },
                { label: "متأخر", value: totals.overdueAmount, color: "#e0574e" },
                { label: "متبقٍّ", value: Math.max(0, totals.outstanding - totals.overdueAmount), color: "#2563eb" },
              ]}
            />
          </div>
          <div className="fin-legend">
            <span><i style={{ background: "#16a34a" }} /> محصّل</span>
            <span><i style={{ background: "#2563eb" }} /> متبقٍّ</span>
            <span><i style={{ background: "#e0574e" }} /> متأخر</span>
          </div>
        </div>
        <div className="card">
          <div className="section-title"><span>الفوترة حسب المشروع</span></div>
          <Bar data={totals.projBars} fmt={shortMoney} barColor="#e05a50" />
        </div>
        <div className="card">
          <div className="section-title"><span>اتجاه الفوترة الشهري</span></div>
          <TrendLine points={totals.monthPts} fmt={shortMoney} color="#7c5cf6" />
        </div>
      </div>

      {/* جدول الفواتير */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-title"><span>الفواتير</span></div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl fin-tbl">
            <thead>
              <tr>
                <th>الفاتورة</th><th>المشروع</th><th>المبلغ</th><th>المدفوع</th><th>المتبقّي</th>
                <th>الاستحقاق</th><th>الحالة</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="empty" style={{ padding: 24 }}>لا فواتير بعد.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.number || "—"}</b>{r.note ? <div className="muted" style={{ fontSize: 11.5 }}>{r.note}</div> : null}</td>
                  <td>{r.project || "عام"}</td>
                  <td>{money(r.amount)} {r.currency || CURRENCY}</td>
                  <td style={{ color: "#16a34a", fontWeight: 700 }}>{money(r.paid)}</td>
                  <td style={{ color: r.outstanding ? "#c88a2e" : "#8a827a", fontWeight: 700 }}>{money(r.outstanding)}</td>
                  <td>{r.due_date || "—"}</td>
                  <td><span className="pill" style={{ background: r.st.bg, color: r.st.color }}>{r.st.label}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                      {canManage && r.st.key !== "paid" && r.status !== "ملغاة" && (
                        <button className="btn sm ghost" onClick={() => setPayFor(r)} title="تسجيل دفعة">+ دفعة</button>
                      )}
                      {canManage && <button className="btn sm ghost icon" onClick={() => setEditing(r)} title="تعديل"><Icon name="edit" size={14} /></button>}
                      {canManage && <button className="btn sm danger icon" onClick={() => delInvoice(r)} title="حذف"><Icon name="trash" size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? "تعديل الفاتورة" : "فاتورة جديدة"} onClose={() => setEditing(null)}>
          <InvoiceForm
            initial={editing.id ? editing : null}
            projects={projects}
            kpis={kpis}
            onCancel={() => setEditing(null)}
            onSave={async (payload) => {
              if (editing.id) await invoicesStore.update(editing.id, payload);
              else await invoicesStore.create(payload);
              setEditing(null);
              await reload();
            }}
          />
        </Modal>
      )}

      {payFor && (
        <Modal title={`تسجيل دفعة — ${payFor.number}`} onClose={() => setPayFor(null)}>
          <PaymentForm
            invoice={payFor}
            onCancel={() => setPayFor(null)}
            onSave={async (payload) => {
              await paymentsStore.create({ invoice_id: payFor.id, ...payload });
              // إذا اكتمل السداد، علّم الفاتورة كمدفوعة تلقائياً
              const newPaid = (paidByInv[payFor.id] || 0) + (Number(payload.amount) || 0);
              if (newPaid >= (Number(payFor.amount) || 0) && payFor.status !== "مدفوعة") {
                await invoicesStore.update(payFor.id, { status: "مدفوعة" });
              }
              setPayFor(null);
              await reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function InvoiceForm({ initial, projects = [], kpis = [], onSave, onCancel }) {
  const [f, setF] = useState({
    number: "", project: "", amount: "", currency: CURRENCY,
    issue_date: "", due_date: "", status: "مسودة", kpi_id: "", note: "",
    ...(initial || {}),
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setErr(""); };

  async function submit(e) {
    e.preventDefault();
    const amount = parseFloat(f.amount);
    if (!f.number.trim()) { setErr("أدخل رقم الفاتورة."); return; }
    if (!amount || amount <= 0) { setErr("أدخل مبلغاً صحيحاً."); return; }
    setSaving(true);
    try {
      await onSave({
        number: f.number.trim(),
        provider: FINANCE_PROVIDER,
        payer: FINANCE_PAYER,
        project: f.project || "",
        kpi_id: f.kpi_id || "",
        amount,
        currency: (f.currency || CURRENCY).trim(),
        issue_date: f.issue_date || null,
        due_date: f.due_date || null,
        status: INVOICE_STATUSES.includes(f.status) ? f.status : "مسودة",
        note: (f.note || "").trim(),
      });
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>رقم الفاتورة *</span><input value={f.number} onChange={set("number")} placeholder="INV-2026-001" dir="ltr" /></label>
        <label className="field"><span>المبلغ * ({CURRENCY})</span><input type="number" value={f.amount} onChange={set("amount")} placeholder="0" /></label>
        <label className="field"><span>المشروع</span>
          <select value={f.project} onChange={set("project")}>
            <option value="">عام — على مستوى الوكالة</option>
            {projects.map((p) => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span>مؤشر الأداء المرتبط</span>
          <select value={f.kpi_id} onChange={set("kpi_id")}>
            <option value="">بدون ربط</option>
            {kpis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </label>
        <label className="field"><span>تاريخ الإصدار</span><input type="date" value={f.issue_date || ""} onChange={set("issue_date")} /></label>
        <label className="field"><span>تاريخ الاستحقاق</span><input type="date" value={f.due_date || ""} onChange={set("due_date")} /></label>
        <label className="field"><span>الحالة</span>
          <select value={f.status} onChange={set("status")}>
            {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="field full"><span>ملاحظات / وصف الخدمة</span><input value={f.note} onChange={set("note")} placeholder="وصف مختصر للمقابل المُفوتر" /></label>
      {err && <div style={{ background: "#fdeceb", color: "#e0574e", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 11, marginBottom: 12 }}>{err}</div>}
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "…" : (initial ? "حفظ" : "إضافة الفاتورة")}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function PaymentForm({ invoice, onSave, onCancel }) {
  const [f, setF] = useState({ amount: "", date: "", method: PAYMENT_METHODS[0], note: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setErr(""); };

  async function submit(e) {
    e.preventDefault();
    const amount = parseFloat(f.amount);
    if (!amount || amount <= 0) { setErr("أدخل مبلغ الدفعة."); return; }
    setSaving(true);
    try {
      await onSave({ amount, date: f.date || null, method: f.method, note: (f.note || "").trim() });
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        مبلغ الفاتورة: <b style={{ color: "var(--ink)" }}>{money(invoice.amount)} {invoice.currency || CURRENCY}</b>
        {invoice.outstanding != null && <> · المتبقّي: <b style={{ color: "#c88a2e" }}>{money(invoice.outstanding)}</b></>}
      </div>
      <div className="form-grid">
        <label className="field"><span>مبلغ الدفعة * ({CURRENCY})</span><input type="number" value={f.amount} onChange={set("amount")} placeholder="0" autoFocus /></label>
        <label className="field"><span>تاريخ الدفعة</span><input type="date" value={f.date || ""} onChange={set("date")} /></label>
        <label className="field"><span>طريقة الدفع</span>
          <select value={f.method} onChange={set("method")}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </label>
      </div>
      <label className="field full"><span>ملاحظة</span><input value={f.note} onChange={set("note")} placeholder="مثال: دفعة أولى / سداد كامل" /></label>
      {err && <div style={{ background: "#fdeceb", color: "#e0574e", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 11, marginBottom: 12 }}>{err}</div>}
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "…" : "تسجيل الدفعة"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
