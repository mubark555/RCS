"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRole } from "@/components/RoleProvider";
import { submitForReview, approveTask, requestRevision } from "@/lib/workflow";

const MODES = {
  submit: {
    title: "إرسال لمراجعة سيم",
    desc: "التسليم جاهز من ڤيوليت. ستنتقل المهمة إلى «بانتظار مراجعة سيم».",
    label: "ملاحظة للمراجِع (اختياري)",
    btn: "إرسال للمراجعة",
    cls: "primary",
  },
  approve: {
    title: "اعتماد التسليم",
    desc: "سيُسجَّل الاعتماد باسمك وتاريخ اليوم، وتنتقل المهمة إلى «معتمدة».",
    label: "ملاحظات الاعتماد (اختياري)",
    btn: "اعتماد",
    cls: "primary",
  },
  revision: {
    title: "طلب تعديل",
    desc: "ستعود المهمة إلى المسؤول من ڤيوليت مع ملاحظاتك.",
    label: "المطلوب تعديله *",
    btn: "إرسال طلب التعديل",
    cls: "danger",
  },
};

// نافذة اتخاذ قرار على تسليم: إرسال للمراجعة / اعتماد / طلب تعديل
export default function ReviewDialog({ task, mode, onClose, onDone }) {
  const { viewer, role } = useRole();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const m = MODES[mode];
  if (!m || typeof document === "undefined") return null;
  const actor = viewer?.name || "";
  const onBehalf = mode !== "submit" && role === "manager";

  async function go(e) {
    e.preventDefault();
    if (mode === "revision" && !note.trim()) { setErr("اكتب المطلوب تعديله حتى يعرف المسؤول ما يجب عمله."); return; }
    setBusy(true);
    setErr("");
    try {
      const who = onBehalf ? `${actor} (نيابةً عن سيم)` : actor;
      if (mode === "submit") await submitForReview(task, actor, note.trim());
      else if (mode === "approve") await approveTask(task, who, note.trim());
      else await requestRevision(task, who, note.trim());
      onDone && (await onDone());
      onClose();
    } catch (e2) {
      setErr(e2?.message || "تعذّر الحفظ، حاول مجدداً.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="overlay" style={{ zIndex: 80 }} onMouseDown={onClose}>
        <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
          <h3>{m.title}</h3>
          <form onSubmit={go}>
            <div className="rv-task">
              <b>{task.task}</b>
              <small>{[task.project, task.deliverable, task.assigned_to].filter(Boolean).join(" · ")}</small>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 12px" }}>{m.desc}</p>
            {onBehalf && (
              <div className="rv-behalf">أنت مدير النظام — سيُسجَّل القرار باسمك <b>نيابةً عن سيم</b>.</div>
            )}
            <label className="field full">
              <span>{m.label}</span>
              <textarea rows={3} value={note} onChange={(e) => { setNote(e.target.value); setErr(""); }} autoFocus />
            </label>
            {err && <div className="rv-err">{err}</div>}
            <div className="modal-actions">
              <button type="submit" className={`btn ${m.cls}`} disabled={busy}>{busy ? "جاري الحفظ…" : m.btn}</button>
              <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
