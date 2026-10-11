"use client";

import { useState } from "react";
import { tasksStore } from "@/lib/store";
import { availableActions } from "@/lib/workflow.mjs";
import { useRole } from "@/components/RoleProvider";

// أزرار إجراءات سير العمل المتاحة للمستخدم الحالي حسب صلاحيته ومرحلة المهمة
export default function WorkflowActions({ task, onDone, compact }) {
  const { viewer } = useRole();
  const [pending, setPending] = useState(null); // إجراء ينتظر ملاحظة
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const actions = availableActions(task, viewer);
  if (!actions.length) return null;

  async function run(a, n = "") {
    setBusy(true);
    setErr("");
    try {
      await tasksStore.transition(task, a.action, n);
      setPending(null);
      setNote("");
      onDone && (await onDone());
    } catch (e) {
      setErr(e.message || "تعذّر تنفيذ الإجراء");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wf-actions" onClick={(e) => e.stopPropagation()}>
      {!pending && (
        <div className="wf-btns">
          {actions.map((a) => (
            <button key={a.action} type="button" disabled={busy}
              className={`btn ${compact ? "sm" : ""} ${a.tone || ""}`}
              onClick={() => (a.needsNote ? setPending(a) : run(a))}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      {pending && (
        <div className="wf-note">
          <textarea rows={2} autoFocus placeholder={pending.notePrompt} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="wf-btns">
            <button type="button" className={`btn sm ${pending.tone === "danger" ? "danger" : "primary"}`} disabled={busy || !note.trim()} onClick={() => run(pending, note)}>
              {pending.label}
            </button>
            <button type="button" className="btn sm ghost" onClick={() => { setPending(null); setNote(""); }}>إلغاء</button>
          </div>
        </div>
      )}
      {err && <div className="wf-err">{err}</div>}
    </div>
  );
}
