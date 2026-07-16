"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const TITLES = {
  "/": { t: "لوحة المؤشرات", s: "نظرة عامة على أداء المشاريع والمهام" },
  "/tasks": { t: "إدارة المهام", s: "متابعة وتحديث مهام جميع المشاريع" },
  "/meetings": { t: "الاجتماعات", s: "جدولة ومتابعة اجتماعات الفريق" },
  "/archive": { t: "الأرشيف", s: "رفع الملفات والوثائق والاطلاع عليها" },
};

export default function TopBar() {
  const path = usePathname();
  const key = path === "/" ? "/" : "/" + path.split("/")[1];
  const meta = TITLES[key] || TITLES["/"];

  // التاريخ يُحسب على العميل فقط لتجنّب اختلاف الترميز مع الخادم (hydration)
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("ar-SA", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    );
  }, []);

  return (
    <div className="topbar">
      <div>
        <div className="pg-title">{meta.t}</div>
        <div className="pg-sub">{meta.s}</div>
      </div>
      <div className="spacer" />
      {today && <span className="date-chip">📆 {today}</span>}
      <span className="avatar">SP</span>
    </div>
  );
}
