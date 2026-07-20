"use client";

import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";
import { filesStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { STATUS_META, PRIORITY_META, HEALTH_META, APPROVAL_META } from "@/lib/constants";

const LINK_TYPES = ["مستند", "تسجيل", "رابط", "مرجع"];

export default function TaskDetail({ task, onClose, onEdit, onDelete, onUpdate }) {
  const { users, readOnly } = useRole();
  const [files, setFiles] = useState([]);
  const [t, setT] = useState(task);
  const [handTo, setHandTo] = useState("");
  const [handNote, setHandNote] = useState("");
  const [newLink, setNewLink] = useState({ type: "مستند", label: "", url: "" });

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
  const links = useMemo(() => (Array.isArray(t.links) ? t.links : []), [t]);
  const holder = t.holder || t.waiting_on || t.assigned_to || "—";

  async function persist(patch) {
    setT((s) => ({ ...s, ...patch }));
    if (onUpdate) await onUpdate(t.id, patch);
  }

  async function doHandoff() {
    if (!handTo) return;
    const entry = { from: holder, to: handTo, note: handNote, at: new Date().toISOString() };
    await persist({ holder: handTo, handoffs: [...handoffs, entry] });
    setHandTo("");
    setHandNote("");
  }

  async function addLink() {
    if (!newLink.url.trim()) return;
    await persist({ links: [...links, { ...newLink, label: newLink.label || newLink.url }] });
    setNewLink({ type: "مستند", label: "", url: "" });
  }

  async function removeLink(i) {
    await persist({ links: links.filter((_, j) => j !== i) });
  }

  return (
    <div className="drawer-wrap" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="top">
            <span className="pill">{t.project || "بدون مشروع"}</span>
            {t.activity && <span className="pill">{t.activity}</span>}
            <button className="x" onClick={onClose} title="إغلاق"><Icon name="close" size={16} /></button>
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
          <div className="d-section"><span className="st-ic"><Icon name="arrow" size={15} /></span>سير عمل المهمة</div>
          <div className="holder-box">
            <Icon name="pin" size={17} />
            <span>حالياً عند: <b>{holder}</b></span>
          </div>

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
            <div className="inline-form">
              <select value={handTo} onChange={(e) => setHandTo(e.target.value)}>
                <option value="">تحويل إلى…</option>
                {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                {["VULET", "SEEM", "IT TEAM", "CONTENT"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <input placeholder="ملاحظة (اختياري)" value={handNote} onChange={(e) => setHandNote(e.target.value)} />
              <button className="btn primary" type="button" onClick={doHandoff} disabled={!handTo}>تحويل</button>
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
              <div className="d-section"><span className="st-ic"><Icon name="alert" size={15} /></span>العائق / الخطر</div>
              <div className="detail-block warn">{t.blocker}</div>
            </>
          )}

          {t.notes && String(t.notes).trim() && (
            <>
              <div className="d-section">ملاحظات</div>
              <div className="detail-block">{t.notes}</div>
            </>
          )}

          {/* الروابط والمرفقات داخل المهمة */}
          <div className="d-section"><span className="st-ic"><Icon name="link" size={15} /></span>الروابط والمرفقات ({links.length})</div>
          <div className="detail-block">
            {links.length === 0 ? (
              <span className="muted">لا روابط بعد.</span>
            ) : (
              links.map((l, i) => (
                <div className="file-line" key={i}>
                  <span style={{ color: "var(--primary)", display: "inline-flex" }}><Icon name="link" size={15} /></span>
                  <a href={l.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, color: "var(--primary)", fontWeight: 600 }}>
                    {l.label || l.url}
                  </a>
                  <span className="pill">{l.type}</span>
                  {!readOnly && (
                    <button className="btn sm ghost" type="button" onClick={() => removeLink(i)} title="حذف">
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
            {!readOnly && (
              <div className="inline-form" style={{ marginTop: 10 }}>
                <select value={newLink.type} onChange={(e) => setNewLink({ ...newLink, type: e.target.value })} style={{ width: 110 }}>
                  {LINK_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                <input placeholder="الوصف" value={newLink.label} onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} />
                <input placeholder="https://…" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} />
                <button className="btn primary" type="button" onClick={addLink} disabled={!newLink.url.trim()}>إضافة</button>
              </div>
            )}
          </div>

          <div className="d-section"><span className="st-ic"><Icon name="file" size={15} /></span>ملفات المشروع ({files.length})</div>
          <div className="detail-block">
            {files.length === 0 ? (
              <span className="muted">لا ملفات مرتبطة بمشروع {t.project}.</span>
            ) : (
              files.map((f) => (
                <div className="file-line" key={f.id}>
                  <span style={{ color: "var(--muted)", display: "inline-flex" }}><Icon name={f.kind === "link" ? "link" : "file"} size={15} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>{f.name}</span>
                  {f.category && <span className="pill">{f.category}</span>}
                </div>
              ))
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="drawer-foot">
            <button className="btn primary" onClick={() => onEdit(t)}><Icon name="edit" size={16} /> تعديل</button>
            <button className="btn danger" onClick={() => onDelete(t)}><Icon name="trash" size={16} /> حذف</button>
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
