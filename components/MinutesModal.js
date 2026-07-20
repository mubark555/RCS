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

export function exportMinutes(m) {
  const attendees = Array.isArray(m.attendees) ? m.attendees : (m.attendees ? String(m.attendees).split(",") : []);
  const links = Array.isArray(m.links) ? m.links : [];
  const items = Array.isArray(m.action_items) ? m.action_items : [];
  const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const nl = (s) => esc(s).replace(/\n/g, "<br>");

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>محضر اجتماع - ${esc(m.title)}</title>
<style>
  @page { margin: 22mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI","Noto Sans Arabic",Tahoma,sans-serif; color: #23222b; line-height: 1.9; margin: 0; }
  .hd { display:flex; align-items:center; justify-content:space-between; border-bottom: 3px solid #e05a50; padding-bottom: 14px; margin-bottom: 22px; }
  .brand { font-size: 22px; font-weight: 800; color: #e05a50; }
  .brand small { display:block; font-size: 11px; letter-spacing: 3px; color:#888; font-weight:600; }
  .doc-t { text-align:left; font-size: 13px; color:#666; }
  h1 { font-size: 21px; margin: 0 0 4px; }
  .info { width:100%; border-collapse: collapse; margin: 14px 0 24px; font-size: 14px; }
  .info td { padding: 8px 10px; border: 1px solid #eee; }
  .info td.k { background:#faf6f0; font-weight:700; width: 130px; color:#555; }
  h2 { font-size: 15px; color:#e05a50; border-bottom:1px solid #f0e6dc; padding-bottom:6px; margin: 26px 0 12px; }
  .box { font-size: 14px; white-space: pre-wrap; }
  table.ai { width:100%; border-collapse:collapse; font-size:13.5px; }
  table.ai th, table.ai td { border:1px solid #eee; padding:8px 10px; text-align:right; }
  table.ai th { background:#faf6f0; color:#555; }
  ul { margin: 6px 0; padding-inline-start: 22px; }
  .att a { color:#c0453c; }
  .foot { margin-top: 40px; border-top:1px solid #eee; padding-top: 10px; font-size: 11px; color:#999; text-align:center; }
</style></head><body>
  <div class="hd">
    <div class="brand">ڤيوليت<small>DIGITAL MARKETING</small></div>
    <div class="doc-t">محضر اجتماع رسمي<br>${esc(new Date().toLocaleDateString("ar-SA"))}</div>
  </div>
  <h1>${esc(m.title)}</h1>
  <table class="info">
    <tr><td class="k">التاريخ والوقت</td><td>${esc(fmtDate(m.start_at))}</td></tr>
    <tr><td class="k">المدة</td><td>${esc(m.duration || 30)} دقيقة</td></tr>
    <tr><td class="k">المشروع</td><td>${esc(m.project || "—")}</td></tr>
    <tr><td class="k">المكان / الرابط</td><td>${esc(m.location || "—")}</td></tr>
    <tr><td class="k">الحالة</td><td>${esc(STATUS_AR[m.status] || m.status || "—")}</td></tr>
    <tr><td class="k">الحضور</td><td>${attendees.length ? esc(attendees.join("، ")) : "—"}</td></tr>
  </table>
  <h2>جدول الأعمال</h2>
  <div class="box">${m.agenda ? nl(m.agenda) : "<span style='color:#aaa'>لا يوجد</span>"}</div>
  <h2>محضر الاجتماع</h2>
  <div class="box">${m.minutes ? nl(m.minutes) : "<span style='color:#aaa'>لم يُدوّن بعد</span>"}</div>
  ${items.length ? `<h2>القرارات والمهام الناتجة</h2><table class="ai"><tr><th>القرار / المهمة</th><th>المسؤول</th><th>الاستحقاق</th></tr>${items.map((a) => `<tr><td>${esc(a.text)}</td><td>${esc(a.assignee || "—")}</td><td>${esc(a.due || "—")}</td></tr>`).join("")}</table>` : ""}
  ${links.length ? `<h2>المرفقات والروابط</h2><ul class="att">${links.map((l) => `<li>${esc(l.type || "رابط")}: <a href="${esc(l.url)}">${esc(l.label || l.url)}</a></li>`).join("")}</ul>` : ""}
  <div class="foot">وثيقة مُصدّرة من نظام إدارة مشاريع ڤيوليت — سيم برايم</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("فضلاً اسمح بالنوافذ المنبثقة لتصدير المحضر."); return; }
  w.document.write(html);
  w.document.close();
}

export default function MinutesModal({ meeting, onClose, onEdit, onUpdated, readOnly }) {
  const [m, setM] = useState(meeting);
  const [busy, setBusy] = useState(false);
  const attendees = Array.isArray(m.attendees) ? m.attendees : [];
  const links = Array.isArray(m.links) ? m.links : [];
  const items = Array.isArray(m.action_items) ? m.action_items : [];

  async function convert(idx) {
    const it = items[idx];
    if (!it || it.taskId || !it.text?.trim()) return;
    setBusy(true);
    try {
      const task = await tasksStore.create({
        activity: "قرار اجتماع",
        project: m.project || "",
        task: it.text,
        priority: "Medium",
        status: "Not Started",
        assigned_to: it.assignee || "",
        due_date: it.due || null,
        waiting_on: "",
        blocker: "",
        approval_status: "",
        notes: `مهمة ناتجة عن اجتماع: ${m.title}`,
        health: "On Track",
        holder: it.assignee || "",
      });
      const nextItems = items.map((x, i) => (i === idx ? { ...x, taskId: task.id } : x));
      await meetingsStore.update(m.id, { action_items: nextItems });
      setM((s) => ({ ...s, action_items: nextItems }));
      onUpdated && onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function convertAll() {
    setBusy(true);
    try {
      let nextItems = [...items];
      for (let i = 0; i < nextItems.length; i++) {
        const it = nextItems[i];
        if (it.taskId || !it.text?.trim()) continue;
        const task = await tasksStore.create({
          activity: "قرار اجتماع", project: m.project || "", task: it.text,
          priority: "Medium", status: "Not Started", assigned_to: it.assignee || "",
          due_date: it.due || null, waiting_on: "", blocker: "", approval_status: "",
          notes: `مهمة ناتجة عن اجتماع: ${m.title}`, health: "On Track", holder: it.assignee || "",
        });
        nextItems[i] = { ...it, taskId: task.id };
      }
      await meetingsStore.update(m.id, { action_items: nextItems });
      setM((s) => ({ ...s, action_items: nextItems }));
      onUpdated && onUpdated();
    } finally {
      setBusy(false);
    }
  }

  const pending = items.filter((x) => !x.taskId && x.text?.trim()).length;

  return (
    <Modal title="محضر الاجتماع" onClose={onClose}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>{m.title}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{fmtDate(m.start_at)} · {m.duration} دقيقة{m.project ? ` · ${m.project}` : ""}</div>
      </div>

      {attendees.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13 }}><b>الحضور: </b>{attendees.join("، ")}</div>
      )}

      <div className="d-section">جدول الأعمال</div>
      <div className="detail-block" style={{ whiteSpace: "pre-wrap" }}>
        {m.agenda ? m.agenda : <span className="muted">لا يوجد</span>}
      </div>

      <div className="d-section">محضر الاجتماع</div>
      <div className="detail-block" style={{ whiteSpace: "pre-wrap" }}>
        {m.minutes ? m.minutes : <span className="muted">لم يُدوّن المحضر بعد — اضغط «تعديل» لكتابته.</span>}
      </div>

      {/* القرارات / المهام الناتجة */}
      <div className="d-section" style={{ display: "flex", alignItems: "center" }}>
        القرارات والمهام الناتجة ({items.length})
        {!readOnly && pending > 0 && (
          <button className="btn sm primary" style={{ marginInlineStart: "auto" }} onClick={convertAll} disabled={busy}>
            تحويل الكل إلى مهام ({pending})
          </button>
        )}
      </div>
      <div className="detail-block">
        {items.length === 0 ? (
          <span className="muted">لا قرارات — أضِفها من «تعديل» ثم حوّلها إلى مهام.</span>
        ) : (
          items.map((it, i) => (
            <div className="file-line" key={i}>
              <span style={{ color: it.taskId ? "#16a34a" : "var(--primary)", display: "inline-flex" }}>
                <Icon name={it.taskId ? "check" : "tasks"} size={15} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{it.text}</div>
                <small className="muted">{it.assignee || "غير مُسند"}{it.due ? ` · ${it.due}` : ""}</small>
              </div>
              {it.taskId ? (
                <span className="pill" style={{ color: "#16a34a", borderColor: "#bfe6cd" }}>مهمة مُنشأة</span>
              ) : !readOnly ? (
                <button className="btn sm" onClick={() => convert(i)} disabled={busy}>إنشاء مهمة</button>
              ) : null}
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
        <button className="btn primary" onClick={() => exportMinutes(m)}><Icon name="upload" size={16} /> تصدير المحضر (PDF)</button>
        {!readOnly && <button className="btn" onClick={() => onEdit(m)}><Icon name="edit" size={16} /> تعديل / كتابة المحضر</button>}
        <button className="btn ghost" style={{ marginInlineStart: "auto" }} onClick={onClose}>إغلاق</button>
      </div>
    </Modal>
  );
}
