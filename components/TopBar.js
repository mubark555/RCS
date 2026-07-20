"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { tasksStore } from "@/lib/store";

const TITLES = {
  "/": { t: "الرئيسية", s: "لوحة القيادة — أهم ما يجب متابعته هذا الأسبوع" },
  "/tasks": { t: "المهام", s: "متابعة وتحديث مهام جميع المشاريع" },
  "/meetings": { t: "الاجتماعات", s: "جدولة ومتابعة اجتماعات الفريق والعملاء" },
  "/archive": { t: "الأرشيف", s: "رفع الملفات والوثائق والاطلاع عليها" },
};

export default function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const key = path === "/" ? "/" : "/" + path.split("/")[1];
  const meta = TITLES[key] || TITLES["/"];

  const [q, setQ] = useState("");
  const [alerts, setAlerts] = useState(0);

  useEffect(() => {
    tasksStore
      .list()
      .then((ts) =>
        setAlerts(ts.filter((t) => t.health === "Delayed" || t.health === "At Risk").length)
      )
      .catch(() => {});
  }, [path]);

  function submit(e) {
    e.preventDefault();
    router.push(`/tasks?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="topbar">
      <div>
        <div className="pg-title">{meta.t}</div>
        <div className="pg-sub">{meta.s}</div>
      </div>
      <div className="spacer" />
      <form className="search" onSubmit={submit}>
        <span>🔍</span>
        <input
          placeholder="ابحث عن مهمة أو مشروع أو ملف…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      <div
        className="bell"
        title="مهام تحتاج انتباه"
        onClick={() => router.push("/tasks")}
      >
        🔔
        {alerts > 0 && <span className="cnt">{alerts}</span>}
      </div>
    </div>
  );
}
