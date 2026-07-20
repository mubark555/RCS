"use client";

import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/Badge";
import { filesStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { STATUS_META, PRIORITY_META, HEALTH_META, APPROVAL_META } from "@/lib/constants";

export default function TaskDetail({ task, onClose, onEdit, onDelete, onUpdate }) {
  const { users, readOnly } = useRole();
  const [files, setFiles] = useState([]);
  const [t, setT] = useState(task);
  const [handTo, setHandTo] = useState("");
  const [handNote, setHandNote] = useState("");

  useEffect(() => setT(task), [task]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    filesStore.list().then((all) => setFiles(all.filter((f) => f.project === task.project))).catch(() => {});
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  const val = (v) => (v && String(v).trim() ? v : "—");
  const handoffs = useMemo(() => (Array.isArray(t.handoffs) ? t.handoffs : []), [t]);
  const holder = t.holder || t.waiting_on || t.assigned_to || "—";

  async function doHandoff() {
    if (!handTo) return;
    const entry = { from: holder, to: handTo, note: handNote, at: new Date().toISOString() };
    const nextHandoffs = [...handoffs, entry];
    const patch = { holder: handTo, handoffs: nextHandoffs };
    setT((s) => ({ ...s, ...patch }));
    setHandTo("");
    setHandNote("");
    if (onUpdate) await onUpdate(t.id, patch);
  }

  return (
    <div className="drawer-wrap" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="top">
            <span className="pill">{t.project || "بدون مشروع"}</span>
            {t.activity && <span className="pill">{t.activity}</span>}
            <button className="x" onClick={onClose} title="إغلاق">✕</button>
          </div>
          <h3>{t.task}</h3>
          <div className="drawer-badges">
            <Badge map={PRIORITY_META} value={t.priority} />
            <Badge map={STATUS_META} value={t.status} />
            <Badge map={HEALTH_META} value={t.health} />
            {t.approval_status && <Badge map={APPROVAL_META} value={t.approval_status} />}
          </div>
        </div>

        <div className="drawer-body">
          {/* عالقة عند مَن */}
          <div className="d-section">سير عمل المهمة</div>
          <div className="holder-box">📍 حالياً عند: {holder}</div>

          {handoffs.length > 0 && (
            <div className="flow" style={{ marginTop: 12 }}>
              {handoffs.map((h, i) => (
                <div className="flow-item" key={i}>
                  <span className="flow-dot">{i + 1}</span>
                  <div className="flow-body">
                    <b>{h.from} ← {h.to}</b>
                    <small>
                      {h.at ? new Date(h.at).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                      {h.note ? ` · ${h.note}` : ""}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!readOnly && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <select value={handTo} onChange={(e) => setHandTo(e.target.value)} style={{ flex: 1, minWidth: 130 }}>
                <option value="">تحويل إلى…</option>
                {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                {["VULET", "SEEM", "IT TEAM", "CONTENT"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <input placeholder="ملاحظة التحويل (اختياري)" value={handNote} onChange={(e) => setHandNote(e.target.value)} style={{ flex: 1, minWidth: 130 }} />
              <button className="btn primary" type="button" onClick={doHandoff} disabled={!handTo}>تحويل ←</button>
            </div>
          )}

          <div className="d-section">التفاصيل الأساسية</div>
          <div className="detail-grid">
            <Field k="المسؤول" v={val(t.assigned_to)} />
            <Field k="تاريخ الاستحقاق" v={val(t.due_date)} />
            <Field k="بانتظار" v={val(t.waiting_on)} />
            <Field k="النشاط" v={val(t.activity)} />
          </div>

          {t.blocker && String(t.blocker).trim() && (
            <>
              <div className="d-section">العائق / الخطر</div>
              <div className="detail-block warn">⚠ {t.blocker}</div>
            </>
          )}

          {t.notes && String(t.notes).trim() && (
            <>
              <div className="d-section">ملاحظات</div>
              <div className="detail-block">{t.notes}</div>
            </>
          )}

          <div className="d-section">ملفات المشروع المرتبطة ({files.length})</div>
          <div className="detail-block">
            {files.length === 0 ? (
              <span className="muted">لا توجد ملفات مرتبطة بمشروع {t.project}.</span>
            ) : (
              files.map((f) => (
                <div className="file-line" key={f.id}>
                  <span>{f.kind === "link" ? "🔗" : "📎"}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{f.name}</span>
                  {f.category && <span className="pill">{f.category}</span>}
                </div>
              ))
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="drawer-foot">
            <button className="btn primary" onClick={() => onEdit(t)}>✎ تعديل المهمة</button>
            <button className="btn danger" onClick={() => onDelete(t)}>🗑 حذف</button>
            <button className="btn ghost" style={{ marginInlineStart: "auto" }} onClick={onClose}>إغلاق</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ k, v }) {
  return (
    <div className="detail-field">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
