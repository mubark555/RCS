"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { tasksStore, meetingsStore } from "@/lib/store";

const STATUS_AR = { Scheduled: "مجدول", Done: "منتهي", Cancelled: "ملغى" };

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-SA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const toLines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);

// تصدير المحضر كمستند احترافي قابل للطباعة/الحفظ PDF (عبر iframe مخفي)
export function exportMinutes(m) {
  const attendees = Array.isArray(m.attendees) ? m.attendees : (m.attendees ? String(m.attendees).split(",") : []);
  const links = Array.isArray(m.links) ? m.links : [];
  const items = Array.isArray(m.action_items) ? m.action_items : [];
  const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const bullets = (s) => {
    const ls = toLines(s);
    return ls.length ? `<ul>${ls.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="empty">—</p>`;
  };

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>محضر اجتماع - ${esc(m.title)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI","Noto Sans Arabic","Tajawal",Tahoma,sans-serif; color: #2b2a32; line-height: 1.85; margin: 0; font-size: 13.5px; }
  .sheet { max-width: 780px; margin: 0 auto; }
  header { display:flex; align-items:flex-end; justify-content:space-between; border-bottom: 2.5px solid #e05a50; padding-bottom: 12px; }
  .brand { font-size: 24px; font-weight: 800; color: #e05a50; letter-spacing: -.5px; }
  .brand small { display:block; font-size: 10px; letter-spacing: 4px; color:#9a948c; font-weight:700; margin-top:2px; }
  .doc-tag { text-align:left; font-size: 12px; color:#8a8078; }
  .doc-tag b { color:#2b2a32; font-size: 13px; }
  h1 { font-size: 20px; margin: 20px 0 4px; }
  .sub { color:#8a8078; font-size: 12.5px; margin-bottom: 18px; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin: 0 0 8px; }
  .kv { display:flex; gap:8px; padding: 7px 0; border-bottom: 1px dashed #eee; font-size: 13px; }
  .kv .k { color:#8a8078; min-width: 92px; font-weight:700; }
  h2 { font-size: 14px; color:#e05a50; margin: 24px 0 8px; display:flex; align-items:center; gap:8px; page-break-after: avoid; }
  h2::before { content:""; width:4px; height:15px; background:#e05a50; border-radius:2px; display:inline-block; }
  section { page-break-inside: avoid; }
  ul { margin: 4px 0; padding-inline-start: 20px; }
  li { margin-bottom: 4px; }
  p.empty { color:#bbb; margin:4px 0; }
  table { width:100%; border-collapse:collapse; font-size:13px; margin-top:4px; }
  th, td { border:1px solid #ececec; padding:8px 10px; text-align:right; }
  th { background:#faf6f0; color:#6a6058; font-weight:700; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { background:#f4efe8; border:1px solid #ece5da; border-radius:20px; padding:3px 11px; font-size:12px; }
  .att a { color:#c0453c; }
  footer { margin-top: 34px; border-top:1px solid #eee; padding-top: 12px; font-size: 10.5px; color:#a49c94; display:flex; justify-content:space-between; }
  .sign { margin-top: 30px; display:flex; gap: 40px; }
  .sign div { flex:1; border-top:1px solid #ccc; padding-top:6px; font-size:11px; color:#8a8078; text-align:center; }
</style></head><body><div class="sheet">
  <header>
    <div class="brand">ڤيوليت<small>DIGITAL MARKETING</small></div>
    <div class="doc-tag"><b>محضر اجتماع رسمي</b><br>${esc(new Date().toLocaleDateString("ar-SA"))}</div>
  </header>

  <h1>${esc(m.title)}</h1>
  <div class="sub">${esc(fmtDate(m.start_at))}</div>

  <div class="grid">
    <div class="kv"><span class="k">المدة</span><span>${esc(m.duration || 30)} دقيقة</span></div>
    <div class="kv"><span class="k">المشروع</span><span>${esc(m.project || "—")}</span></div>
    <div class="kv"><span class="k">المكان</span><span>${esc(m.location || "—")}</span></div>
    <div class="kv"><span class="k">الحالة</span><span>${esc(STATUS_AR[m.status] || m.status || "—")}</span></div>
  </div>
  ${attendees.length ? `<section><h2>الحضور</h2><div class="chips">${attendees.map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</div></section>` : ""}

  <section><h2>جدول الأعمال</h2>${bullets(m.agenda)}</section>
  <section><h2>محضر الاجتماع</h2>${bullets(m.minutes)}</section>
  ${items.length ? `<section><h2>القرارات والمهام الناتجة</h2><table><tr><th>القرار / المهمة</th><th style="width:120px">المسؤول</th><th style="width:110px">الاستحقاق</th></tr>${items.map((a) => `<tr><td>${esc(a.text)}</td><td>${esc(a.assignee || "—")}</td><td>${esc(a.due || "—")}</td></tr>`).join("")}</table></section>` : ""}
  ${links.length ? `<section><h2>المرفقات والروابط</h2><ul class="att">${links.map((l) => `<li>${esc(l.type || "رابط")}: <a href="${esc(l.url)}">${esc(l.label || l.url)}</a></li>`).join("")}</ul></section>` : ""}

  <div class="sign">
    <div>توقيع مدير المشروع</div>
    <div>توقيع العميل</div>
  </div>
  <footer><span>ڤيوليت — نظام إدارة مشاريع سيم برايم</span><span>${esc(m.title)}</span></footer>
</div></body></html>`;

  // طباعة عبر iframe مخفي (بلا نافذة about:blank)
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "-99999px";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const done = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {}
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1500);
  };
  setTimeout(done, 350);
}

export default function MinutesModal({ meeting, onClose, onEdit, onUpdated, readOnly }) {
  const [m, setM] = useState(meeting);
  const [busy, setBusy] = useState(false);
  const attendees = Array.isArray(m.attendees) ? m.attendees : [];
  const links = Array.isArray(m.links) ? m.links : [];
  const items = Array.isArray(m.action_items) ? m.action_items : [];
  const agenda = toLines(m.agenda);
  const minutes = toLines(m.minutes);

  async function mkTask(it) {
    return tasksStore.create({
      activity: "قرار اجتماع", project: m.project || "", task: it.text,
      priority: "Medium", status: "Not Started", assigned_to: it.assignee || "",
      due_date: it.due || null, waiting_on: "", blocker: "", approval_status: "",
      notes: `مهمة ناتجة عن اجتماع: ${m.title}`, health: "On Track", holder: it.assignee || "",
    });
  }

  async function convert(idx) {
    const it = items[idx];
    if (!it || it.taskId || !it.text?.trim()) return;
    setBusy(true);
    try {
      const task = await mkTask(it);
      const next = items.map((x, i) => (i === idx ? { ...x, taskId: task.id } : x));
      await meetingsStore.update(m.id, { action_items: next });
      setM((s) => ({ ...s, action_items: next }));
      onUpdated && onUpdated();
    } finally { setBusy(false); }
  }

  async function convertAll() {
    setBusy(true);
    try {
      const next = [...items];
      for (let i = 0; i < next.length; i++) {
        if (next[i].taskId || !next[i].text?.trim()) continue;
        const task = await mkTask(next[i]);
        next[i] = { ...next[i], taskId: task.id };
      }
      await meetingsStore.update(m.id, { action_items: next });
      setM((s) => ({ ...s, action_items: next }));
      onUpdated && onUpdated();
    } finally { setBusy(false); }
  }

  const pending = items.filter((x) => !x.taskId && x.text?.trim()).length;

  return (
    <Modal title="محضر الاجتماع" onClose={onClose}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>{m.title}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{fmtDate(m.start_at)} · {m.duration} دقيقة{m.project ? ` · ${m.project}` : ""}</div>
      </div>

      {attendees.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {attendees.map((a) => <span key={a} className="pill">{a}</span>)}
        </div>
      )}

      <div className="d-section">جدول الأعمال</div>
      <div className="detail-block">
        {agenda.length ? <ul className="mlist">{agenda.map((l, i) => <li key={i}>{l}</li>)}</ul> : <span className="muted">لا يوجد</span>}
      </div>

      <div className="d-section">محضر الاجتماع</div>
      <div className="detail-block">
        {minutes.length ? <ul className="mlist">{minutes.map((l, i) => <li key={i}>{l}</li>)}</ul> : <span className="muted">لم يُدوّن بعد — اضغط «تعديل».</span>}
      </div>

      <div className="d-section" style={{ display: "flex", alignItems: "center" }}>
        القرارات والمهام الناتجة ({items.length})
        {!readOnly && pending > 0 && (
          <button className="btn sm primary" style={{ marginInlineStart: "auto" }} onClick={convertAll} disabled={busy}>تحويل الكل إلى مهام ({pending})</button>
        )}
      </div>
      <div className="detail-block">
        {items.length === 0 ? (
          <span className="muted">لا قرارات — أضِفها من «تعديل».</span>
        ) : (
          items.map((it, i) => (
            <div className="file-line" key={i}>
              <span style={{ color: it.taskId ? "#16a34a" : "var(--primary)", display: "inline-flex" }}><Icon name={it.taskId ? "check" : "tasks"} size={15} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{it.text}</div>
                <small className="muted">{it.assignee || "غير مُسند"}{it.due ? ` · ${it.due}` : ""}</small>
              </div>
              {it.taskId ? <span className="pill" style={{ color: "#16a34a", borderColor: "#bfe6cd" }}>مهمة مُنشأة</span>
                : !readOnly ? <button className="btn sm" onClick={() => convert(i)} disabled={busy}>إنشاء مهمة</button> : null}
            </div>
          ))
        )}
      </div>

      {links.length > 0 && (
        <>
          <div className="d-section">المرفقات والروابط</div>
          <div className="detail-block">
            {links.map((l, i) => (
              <div className="file-line" key={i}>
                <span style={{ color: "var(--primary)", display: "inline-flex" }}><Icon name="link" size={15} /></span>
                <a href={l.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, color: "var(--primary)", fontWeight: 600 }}>{l.label || l.url}</a>
                <span className="pill">{l.type}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="modal-actions" style={{ marginTop: 18 }}>
        <button className="btn primary" onClick={() => exportMinutes(m)}><Icon name="upload" size={16} /> تصدير / طباعة PDF</button>
        {!readOnly && <button className="btn" onClick={() => onEdit(m)}><Icon name="edit" size={16} /> تعديل / كتابة المحضر</button>}
        <button className="btn ghost" style={{ marginInlineStart: "auto" }} onClick={onClose}>إغلاق</button>
      </div>
    </Modal>
  );
}
