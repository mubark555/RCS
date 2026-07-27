"use client";

import { useEffect, useState } from "react";
import { activityStore } from "@/lib/store";
import Icon from "@/components/Icon";

const ACTION_META = {
  create: { verb: "أضاف", color: "#16a34a", ico: "plus" },
  update: { verb: "حدّث", color: "#2563eb", ico: "edit" },
  delete: { verb: "حذف", color: "#e0574e", ico: "trash" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "الآن";
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`;
  return `قبل ${Math.floor(s / 86400)} يوم`;
}

// سجلّ آخر الأنشطة داخل النظام. limit يحدّد العدد المعروض.
export default function ActivityFeed({ limit = 100, refreshKey }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    activityStore.list(limit).then((l) => { if (alive) setItems(l || []); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [limit, refreshKey]);

  if (!items) return <div className="empty" style={{ padding: "20px 0" }}>جاري التحميل…</div>;
  if (!items.length) return <div className="empty" style={{ padding: "24px 0" }}>لا أنشطة مسجّلة بعد.</div>;

  return (
    <div className="activity-feed">
      {items.map((a) => {
        const m = ACTION_META[a.action] || ACTION_META.update;
        return (
          <div className="act-item" key={a.id}>
            <span className="act-ic" style={{ background: `${m.color}1a`, color: m.color }}><Icon name={m.ico} size={14} /></span>
            <div className="act-body">
              <div className="act-txt">
                {a.actor ? <b>{a.actor}</b> : <b>مستخدم</b>} {m.verb} {a.entity}
                {a.label ? <> : <span className="act-label">{a.label}</span></> : null}
              </div>
              <div className="act-time">{timeAgo(a.created_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
