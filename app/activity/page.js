"use client";

import ActivityFeed from "@/components/ActivityFeed";

export default function ActivityPage() {
  return (
    <div>
      <div className="card" style={{ borderRadius: 22 }}>
        <div className="section-title"><span>سجل آخر الأنشطة</span></div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10, paddingInlineStart: 2 }}>
          توثيق دائم لكل الإضافات والتعديلات والحذف داخل النظام — من نفّذها ومتى.
        </div>
        <ActivityFeed limit={150} />
      </div>
    </div>
  );
}
