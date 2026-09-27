"use client";

import { useState } from "react";
import ActivityFeed, { ACTIVITY_GROUPS } from "@/components/ActivityFeed";

export default function ActivityPage() {
  const [group, setGroup] = useState("");
  return (
    <div>
      <div className="card" style={{ borderRadius: 22 }}>
        <div className="section-title"><span>سجل الأنشطة</span></div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 12, paddingInlineStart: 2 }}>
          توثيق دائم للإضافات والتعديلات والاعتمادات وتحديثات السداد — اسم المستخدم والتاريخ.
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
          <span className={`att-chip ${group === "" ? "on" : ""}`} onClick={() => setGroup("")}>الكل</span>
          {Object.entries(ACTIVITY_GROUPS).map(([k, g]) => (
            <span key={k} className={`att-chip ${group === k ? "on" : ""}`} onClick={() => setGroup(k)}>{g.ar}</span>
          ))}
        </div>
        <ActivityFeed limit={300} group={group} />
      </div>
    </div>
  );
}
