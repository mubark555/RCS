"use client";

import Overview from "@/components/Overview";
import { useRole } from "@/components/RoleProvider";

export default function OverviewPage() {
  const { canManage, ready } = useRole();
  if (!ready) return <div className="empty">جاري التحميل…</div>;
  if (!canManage) return <div className="empty">هذه الصفحة متاحة للإدارة فقط.</div>;
  return <Overview />;
}
