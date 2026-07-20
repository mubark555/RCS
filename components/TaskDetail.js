"use client";

import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";
import { filesStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { STATUS_META, PRIORITY_META, HEALTH_META, APPROVAL_META, CHAIN_TYPE_META, normalizeChain, chainHolder, chainProgress } from "@/lib/constants";

const LINK_TYPES = ["مستند", "تسجيل", "رابط", "مرجع"];

const AV_COLORS = ["#e05a50", "#3f8e7f", "#2563eb", "#7c3aed", "#d97706", "#0d9488", "#db2777"];
const colorFor = (name) => {
  const s = String(name || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % AV_COLORS.length;
  return AV_COLORS[h];
};

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
  const chain = useMemo(() => normalizeChain(t.chain), [t]);
  const prog = chainProgress(chain);
  const activeIdx = chain.findIndex((s) => s.status !== "done" && s.status !== "approved" && s.status !== "rejected");
  const holder = chainHolder(chain) || t.holder || t.waiting_on || t.assigned_to || "—";

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

  // تنفيذ إجراء على خطوة السلسلة (إنجاز عمل / اعتماد / رفض)
  async function actStep(i, decision) {
    const next = chain.map((s, j) => (j === i ? { ...s, status: decision, at: new Date().toISOString() } : s));
    const patch = { chain: next };
    const p = chainProgress(next);
    if (p && p.complete) {
      patch.approval_status = "Approved";
    } else if (decision === "rejected") {
      patch.approval_status = "Rejected";
      patch.health = "At Risk";
    }
    await persist(patch);
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
            {prog && (
              <span className="pill" style={{ marginInlineStart: "auto", color: prog.rejected ? "#dc2626" : prog.complete ? "#16a34a" : "var(--primary)", borderColor: "transparent", background: prog.rejected ? "#fdecec" : prog.complete ? "#e6f5ec" : "var(--primary-soft)" }}>
                {prog.rejected ? "متوقفة (رفض)" : `${prog.done}/${prog.total} مكتملة`}
              </span>
            )}
          </div>

          {chain.length > 0 ? (
            <div className="chain-view">
              {chain.map((s, i) => {
                const tm = CHAIN_TYPE_META[s.type] || CHAIN_TYPE_META.work;
                const isActive = i === activeIdx;
                const done = s.status === "done" || s.status === "approved";
                const rejected = s.status === "rejected";
                return (
                  <div className={`cv-step ${isActive ? "active" : ""} ${done ? "done" : ""} ${rejected ? "rej" : ""}`} key={i}>
                    <div className="cv-node">
                      <span className="cv-av" style={{ background: done ? "#16a34a" : rejected ? "#dc2626" : colorFor(s.person) }}>
                        {done ? "✓" : rejected ? "×" : i + 1}
                      </span>
                      {i < chain.length - 1 && <span className="cv-line" />}
                    </div>
                    <div className="cv-body">
                      <div className="cv-h">
                        <b>{s.person}</b>
                        <span className="cv-tag" style={{ background: tm.soft, color: tm.color }}>{tm.ar}</span>
                        {s.action && <span className="cv-act">{s.action}</span>}
                        {done && <span className="cv-st ok">{s.status === "approved" ? "معتمدة" : "منجزة"}</span>}
                        {rejected && <span className="cv-st no">مرفوضة</span>}
                        {isActive && !done && !rejected && <span className="cv-st cur">الدور الحالي</span>}
                      </div>
                      {s.at && (done || rejected) && (
                        <small className="cv-time">{new Date(s.at).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
                      )}
                      {!readOnly && isActive && !done && !rejected && (
                        <div className="cv-actions">
                          {s.type === "approve" ? (
                            <>
                              <button className="btn sm primary" type="button" onClick={() => actStep(i, "approved")}>اعتماد</button>
                              <button className="btn sm danger" type="button" onClick={() => actStep(i, "rejected")}>رفض</button>
                            </>
                          ) : (
                            <button className="btn sm primary" type="button" onClick={() => actStep(i, "done")}>تم الإنجاز</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
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
            </>
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
