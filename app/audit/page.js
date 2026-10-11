"use client";

import { useEffect, useMemo, useState } from "react";
import { eventsStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { ACTION_AR, STAGES } from "@/lib/workflow.mjs";

// سجل الإجراءات: من نفّذ ماذا ومتى (للإدارة)
export default function AuditPage() {
  const { canManage, ready } = useRole();
  const [events, setEvents] = useState(null);
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");

  useEffect(() => {
    eventsStore.recent(1000).then(setEvents).catch(() => setEvents([]));
  }, []);

  const actors = useMemo(() => [...new Set((events || []).map((e) => e.actor_name).filter(Boolean))].sort(), [events]);
  const list = useMemo(() => (events || []).filter((e) =>
    (!actor || e.actor_name === actor) &&
    (!action || e.action === action) &&
    (!q || `${e.task_title} ${e.note}`.toLowerCase().includes(q.toLowerCase()))
  ), [events, q, actor, action]);

  if (!ready || !events) return <div className="empty">جاري التحميل…</div>;
  if (!canManage) return <div className="empty">هذه الصفحة متاحة للإدارة فقط.</div>;

  return (
    <div>
      <div className="toolbar" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input placeholder="ابحث باسم المهمة أو الملاحظة…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <select value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">كل المستخدمين</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">كل الإجراءات</option>
          {Object.entries(ACTION_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {list.length === 0 ? <div className="empty">لا إجراءات مسجلة.</div> : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="audit-table">
            <thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>الإجراء</th><th>المهمة</th><th>المرحلة</th><th>الملاحظات</th></tr></thead>
            <tbody>
              {list.map((e, i) => (
                <tr key={e.id || i}>
                  <td style={{ whiteSpace: "nowrap" }}>{e.created_at ? new Date(e.created_at).toLocaleString("ar-SA-u-ca-gregory", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td>{e.actor_name || "غير معروف"}</td>
                  <td>{ACTION_AR[e.action] || e.action}</td>
                  <td>{e.task_title || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{e.to_stage && e.from_stage !== e.to_stage ? `${STAGES[e.from_stage]?.ar || "—"} ← ${STAGES[e.to_stage]?.ar || e.to_stage}` : "—"}</td>
                  <td>{e.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
