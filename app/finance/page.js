"use client";

import { useEffect, useMemo, useState } from "react";
import { invoicesStore, paymentsStore, kpisStore, filesStore } from "@/lib/store";
import { daysUntil, relDays } from "@/lib/metrics";
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
  const { canFinance, canFinanceEdit: canManage, projects, ready, scopeProjects, role } = useRole();
  const [allInvoices, setInvoices] = useState(null);
  const [files, setFiles] = useState([]);           // مرفقات الفواتير والسداد
  const [detail, setDetail] = useState(null);       // فاتورة معروضة بالتفصيل
  const [payments, setPayments] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [editing, setEditing] = useState(null);   // فاتورة قيد التحرير/الإضافة
  const [payFor, setPayFor] = useState(null);      // فاتورة يُسجّل لها دفعة

  async function reload() {
    const [inv, pay, fs] = await Promise.all([invoicesStore.list(), paymentsStore.list(), filesStore.list().catch(() => [])]);
    setInvoices(inv);
    setPayments(pay);
    setFiles(fs.filter((f) => /^(invoice|payment):/.test(f.ref || "")));
  }
  // ممثل سيم يرى فواتير مشاريعه فقط
  const invoices = useMemo(() => {
    if (!allInvoices) return null;
    if (role === "client") return allInvoices.filter((v) => v.project && (scopeProjects || []).includes(v.project));
    return allInvoices;
  }, [allInvoices, scopeProjects, role]);
  const filesOf = (ref) => files.filter((f) => f.ref === ref);
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

  // رفع مرفق مالي (فاتورة أو إيصال سداد) — مصنّف «مالية» ومخفي عن غير المخوّلين
  async function uploadAttachment(file, ref, project, note) {
    try {
      await filesStore.upload(file, { project: project || "", category: "مالية", note, ref });
    } catch (e) {
      alert(`تعذّر رفع المرفق: ${e?.message || ""}`);
    }
  }

  async function delInvoice(inv) {
    if (!confirm(`حذف الفاتورة ${inv.number}؟\nسيتم حذف مدفوعاتها المرتبطة أيضاً.`)) return;
    // احذف مدفوعاتها أولاً (في الوضع المحلي لا يوجد cascade)
    const related = (payments || []).filter((p) => p.invoice_id === inv.id);
    for (const p of related) {
      for (const f of filesOf(`payment:${p.id}`)) await filesStore.remove(f).catch(() => {});
      await paymentsStore.remove(p.id).catch(() => {});
    }
    for (const f of filesOf(`invoice:${inv.id}`)) await filesStore.remove(f).catch(() => {});
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
                <th>الاستحقاق</th><th>الحالة</th><th>المرفقات</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="empty" style={{ padding: 24 }}>لا فواتير بعد.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.number || "—"}</b>{r.note ? <div className="muted" style={{ fontSize: 11.5 }}>{r.note}</div> : null}</td>
                  <td>{r.project || "عام"}</td>
                  <td>{money(r.amount)} {r.currency || CURRENCY}</td>
                  <td style={{ color: "#16a34a", fontWeight: 700 }}>{money(r.paid)}</td>
                  <td style={{ color: r.outstanding ? "#c88a2e" : "#8a827a", fontWeight: 700 }}>{money(r.outstanding)}</td>
                  <td>
                    {r.due_date || "—"}
                    {r.outstanding > 0 && r.status !== "ملغاة" && r.status !== "مسودة" && r.due_date && (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: daysUntil(r.due_date) < 0 ? "#e0574e" : "#8a827a" }}>{relDays(daysUntil(r.due_date))}</div>
                    )}
                  </td>
                  <td><span className="pill" style={{ background: r.st.bg, color: r.st.color }}>{r.st.label}</span></td>
                  <td>
                    {(() => {
                      const n = filesOf(`invoice:${r.id}`).length + (payments || []).filter((p) => p.invoice_id === r.id).reduce((s, p) => s + filesOf(`payment:${p.id}`).length, 0);
                      return <span className="muted" style={{ fontSize: 12.5 }}>{n ? `📎 ${n}` : "—"}</span>;
                    })()}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                      <button className="btn sm ghost" onClick={() => setDetail(r)} title="التفاصيل والمرفقات">التفاصيل</button>
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
            onSave={async (payload, file) => {
              const rec = editing.id ? await invoicesStore.update(editing.id, payload) : await invoicesStore.create(payload);
              const id = editing.id || rec?.id;
              if (file && id) await uploadAttachment(file, `invoice:${id}`, payload.project, `فاتورة ${payload.number}`);
              setEditing(null);
              await reload();
            }}
          />
        </Modal>
      )}

      {detail && (
        <Modal wide title={`الفاتورة ${detail.number || ""}`} onClose={() => setDetail(null)}>
          <InvoiceDetail
            inv={(rows || []).find((r) => r.id === detail.id) || detail}
            payments={(payments || []).filter((p) => p.invoice_id === detail.id)}
            filesOf={filesOf}
            canEdit={canManage}
            onUpload={async (file, ref) => { await uploadAttachment(file, ref, detail.project, `فاتورة ${detail.number}`); await reload(); }}
            onRemoveFile={async (f) => { if (confirm(`حذف المرفق؟\n${f.name}`)) { await filesStore.remove(f); await reload(); } }}
            onRemovePayment={async (p) => {
              if (!confirm("حذف هذه الدفعة؟")) return;
              for (const f of filesOf(`payment:${p.id}`)) await filesStore.remove(f).catch(() => {});
              await paymentsStore.remove(p.id);
              await reload();
            }}
            onPay={() => { setPayFor((rows || []).find((r) => r.id === detail.id) || detail); setDetail(null); }}
            onClose={() => setDetail(null)}
          />
        </Modal>
      )}

      {payFor && (
        <Modal title={`تسجيل دفعة — ${payFor.number}`} onClose={() => setPayFor(null)}>
          <PaymentForm
            invoice={payFor}
            onCancel={() => setPayFor(null)}
            onSave={async (payload, file) => {
              const pay = await paymentsStore.create({ invoice_id: payFor.id, ...payload });
              if (file && pay?.id) await uploadAttachment(file, `payment:${pay.id}`, payFor.project, `سداد ${payFor.number}`);
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
  const [file, setFile] = useState(null);
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
      }, file);
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
      <label className="field full"><span>مرفق الفاتورة (PDF أو صورة — اختياري)</span><input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
      {err && <div style={{ background: "#fdeceb", color: "#e0574e", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 11, marginBottom: 12 }}>{err}</div>}
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "…" : (initial ? "حفظ" : "إضافة الفاتورة")}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function PaymentForm({ invoice, onSave, onCancel }) {
  const [file, setFile] = useState(null);
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
      await onSave({ amount, date: f.date || null, method: f.method, note: (f.note || "").trim() }, file);
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
      <label className="field full"><span>إيصال السداد (PDF أو صورة — اختياري)</span><input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
      {err && <div style={{ background: "#fdeceb", color: "#e0574e", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 11, marginBottom: 12 }}>{err}</div>}
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "…" : "تسجيل الدفعة"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

// تفاصيل الفاتورة: البيانات + مرفق الفاتورة + الدفعات وإيصالاتها
function InvoiceDetail({ inv, payments, filesOf, canEdit, onUpload, onRemoveFile, onRemovePayment, onPay, onClose }) {
  const [busy, setBusy] = useState("");
  async function pick(e, ref) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(ref);
    try { await onUpload(file, ref); } finally { setBusy(""); }
  }
  async function open(f) { window.open(await filesStore.getUrl(f), "_blank"); }
  const FileList = ({ refKey, empty }) => {
    const list = filesOf(refKey);
    return (
      <div>
        {list.length === 0 ? <span className="muted" style={{ fontSize: 12.5 }}>{empty}</span> : list.map((f) => (
          <div className="file-line" key={f.id}>
            <span style={{ color: "var(--primary)", display: "inline-flex" }}><Icon name="file" size={15} /></span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            <button className="btn sm" type="button" onClick={() => open(f)}>فتح</button>
            {canEdit && <button className="btn sm ghost icon" type="button" onClick={() => onRemoveFile(f)} title="حذف"><Icon name="close" size={13} /></button>}
          </div>
        ))}
        {canEdit && (
          <label className="btn sm" style={{ marginTop: 8, cursor: "pointer", display: "inline-flex" }}>
            <Icon name="upload" size={13} /> {busy === refKey ? "جاري الرفع…" : "رفع مرفق"}
            <input type="file" accept=".pdf,image/*" hidden onChange={(e) => pick(e, refKey)} disabled={!!busy} />
          </label>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="inv-sum">
        <div><small>المشروع</small><b>{inv.project || "عام"}</b></div>
        <div><small>قيمة الفاتورة</small><b>{money(inv.amount)} {inv.currency || CURRENCY}</b></div>
        <div><small>المدفوع</small><b style={{ color: "#16a34a" }}>{money(inv.paid)}</b></div>
        <div><small>المتبقّي</small><b style={{ color: inv.outstanding ? "#c88a2e" : undefined }}>{money(inv.outstanding)}</b></div>
        <div><small>تاريخ الاستحقاق</small><b>{inv.due_date || "—"}</b>{inv.outstanding > 0 && inv.due_date ? <span style={{ fontSize: 11.5, color: daysUntil(inv.due_date) < 0 ? "#e0574e" : "var(--muted)", fontWeight: 700 }}>{relDays(daysUntil(inv.due_date))}</span> : null}</div>
        <div><small>الحالة</small>{inv.st ? <span className="pill" style={{ background: inv.st.bg, color: inv.st.color, width: "fit-content" }}>{inv.st.label}</span> : <b>{inv.status}</b>}</div>
      </div>
      {inv.note && <div className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>{inv.note}</div>}

      <div className="d-section">مرفق الفاتورة</div>
      <FileList refKey={`invoice:${inv.id}`} empty="لا يوجد مرفق للفاتورة." />

      <div className="d-section" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>الدفعات وإيصالات السداد ({payments.length})</span>
        {canEdit && inv.outstanding > 0 && inv.status !== "ملغاة" && <button className="btn sm primary" type="button" style={{ marginInlineStart: "auto" }} onClick={onPay}>+ تسجيل دفعة</button>}
      </div>
      {payments.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>لا دفعات مسجّلة.</div> : payments.map((p) => (
        <div className="inv-pay" key={p.id}>
          <div className="inv-pay-h">
            <b style={{ color: "#16a34a" }}>{money(p.amount)} {inv.currency || CURRENCY}</b>
            <span className="muted" style={{ fontSize: 12.5 }}>{p.date || "—"} · {p.method || ""}{p.note ? ` · ${p.note}` : ""}</span>
            {canEdit && <button className="btn sm danger icon" type="button" style={{ marginInlineStart: "auto" }} onClick={() => onRemovePayment(p)} title="حذف الدفعة"><Icon name="trash" size={13} /></button>}
          </div>
          <FileList refKey={`payment:${p.id}`} empty="لا يوجد إيصال." />
        </div>
      ))}

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn ghost" onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}
