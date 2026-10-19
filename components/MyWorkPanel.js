"use client";

import { useMemo, useState } from "react";
import { useRole } from "@/components/RoleProvider";
import { useProjectChains, templateFor, effectiveChain } from "@/lib/projectChain";
import { myBuckets, BUCKET_ACTION } from "@/lib/mywork.mjs";
import { STATUS_META, PRIORITY_META, isOverdue } from "@/lib/constants";
import Icon from "@/components/Icon";

// الأقسام بترتيب الأولوية: ما يتطلب إجراءً مباشراً أولاً
const BUCKETS = [
  { k: "returned", l: "أُعيدت إليك للتعديل", c: "#d97706" },
  { k: "decide", l: "بانتظار اعتمادك", c: "#7c3aed" },
  { k: "myStep", l: "دورك في سلسلة الاعتماد", c: "#0d9488" },
  { k: "overdue", l: "متأخرة عن موعدها", c: "#dc2626" },
  { k: "today", l: "مستحقة اليوم", c: "#c88a2e" },
  { k: "upcoming", l: "مهامك القادمة", c: "#2563eb" },
  { k: "waiting", l: "سلّمتها وتنتظر القرار", c: "#64748b" },
  { k: "done", l: "إنجازاتك المعتمدة", c: "#16a34a" },
];
const URGENT = ["returned", "decide", "myStep", "overdue", "today"];

const fmt = (d) => {
  if (!d) return "—";
  const x = new Date(d);
  return isNaN(x) ? d : x.toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "short" });
};

// «المطلوب مني الآن»: لوحة شخصية لكل مستخدم فوق التقرير الشامل
export default function MyWorkPanel({ tasks, onOpen, onDecide, onSubmit }) {
  const { viewer, perms, projects, canDeliver } = useRole();
  const { chains } = useProjectChains();
  const b = useMemo(() => myBuckets(tasks, viewer, perms.abilities, {
    currentStepOf: (t) => {
      const ch = effectiveChain(templateFor(chains, projects, t.project), t.chain);
      const st = ch.find((s) => s.status !== "done" && s.status !== "approved");
      return st && st.status !== "rejected" ? st : null;
    },
  }), [tasks, viewer, perms.abilities, chains, projects]);

  const firstUrgent = BUCKETS.find((x) => URGENT.includes(x.k) && b[x.k].length)?.k;
  const [tab, setTab] = useState(null);
  const [all, setAll] = useState(false);
  const active = tab || firstUrgent || BUCKETS.find((x) => b[x.k].length)?.k || "upcoming";
  const urgentCount = URGENT.reduce((n, k) => n + b[k].length, 0);
  if (!viewer) return null;
  const list = b[active] || [];
  const shown = all ? list : list.slice(0, 6);

  return (
    <section className="mw">
      <header className="mw-h">
        <h3><span className="bar" /> المطلوب منك الآن</h3>
        <span className="mw-sum">
          {urgentCount ? <><b>{urgentCount}</b> مهمة تتطلب إجراءً منك</> : "لا توجد مهام تتطلب إجراءً عاجلاً منك"}
        </span>
      </header>
      <div className="mw-tabs" role="tablist">
        {BUCKETS.filter((x) => b[x.k].length || x.k === active).map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={active === x.k} className={active === x.k ? "on" : ""}
            style={{ "--c": x.c }} onClick={() => { setTab(x.k); setAll(false); }}>
            {x.l} <span className="n">{b[x.k].length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? <div className="mw-empty">لا شيء هنا.</div> : (
        <div className="mw-list">
          {shown.map((t) => {
            const st = STATUS_META[t.status] || {};
            const pr = PRIORITY_META[t.priority] || {};
            const late = isOverdue(t);
            const waitingFor = t.holder || t.waiting_on || "";
            return (
              <div key={t.id} className="mw-row" onClick={() => onOpen(t)}>
                <span className="mw-dot" style={{ background: pr.color || "#94a3b8" }} title={`الأولوية: ${pr.ar || "—"}`} />
                <div className="mw-main">
                  <b>{t.task}</b>
                  <small>
                    {[t.project, t.activity].filter(Boolean).join(" · ")}
                    {t.assigned_to ? ` · المسؤول: ${t.assigned_to}` : ""}
                    {` · أُنشئت ${fmt(t.created_at)}`}
                  </small>
                  {active === "returned" && t.review_note && <div className="mw-note">ملاحظات المراجِع: {t.review_note}</div>}
                </div>
                <div className="mw-meta">
                  <span className="badge" style={{ background: `${st.color || "#94a3b8"}1f`, color: st.color }}>{st.ar || t.status}</span>
                  <span className={late ? "late" : ""}>{t.due_date ? `الاستحقاق ${fmt(t.due_date)}` : "بلا موعد"}</span>
                  {waitingFor && active !== "done" && <span>بانتظار: {waitingFor}</span>}
                </div>
                <div className="mw-act" onClick={(e) => e.stopPropagation()}>
                  <small>{BUCKET_ACTION[active]}</small>
                  {active === "decide" && (
                    <>
                      <button className="btn sm primary" onClick={() => onDecide(t, "approve")}><Icon name="check" size={14} /> اعتماد</button>
                      <button className="btn sm" style={{ color: "#b45309" }} onClick={() => onDecide(t, "revision")}>طلب تعديل</button>
                    </>
                  )}
                  {["returned", "overdue", "today", "upcoming"].includes(active) && canDeliver && (
                    <button className="btn sm primary" onClick={() => onSubmit(t)}>
                      {active === "returned" ? "إعادة التسليم" : "إرسال للمراجعة"}
                    </button>
                  )}
                  {active === "myStep" && <button className="btn sm primary" onClick={() => onOpen(t)}>فتح الخطوة</button>}
                </div>
              </div>
            );
          })}
          {list.length > shown.length && <button className="btn sm ghost mw-more" onClick={() => setAll(true)}>عرض الكل ({list.length})</button>}
        </div>
      )}
    </section>
  );
}
