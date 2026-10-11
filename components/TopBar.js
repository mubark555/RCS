"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { tasksStore } from "@/lib/store";
import Icon from "@/components/Icon";
import { useRole } from "@/components/RoleProvider";
import { myAction } from "@/lib/workflow.mjs";

const TITLES = {
  "/": { t: "مهامي", s: "ما المطلوب منك الآن — مرتّب حسب الأولوية" },
  "/overview": { t: "لوحة القيادة", s: "أهم ما يجب متابعته هذا الأسبوع" },
  "/audit": { t: "سجل الإجراءات", s: "من نفّذ كل إجراء ومتى" },
  "/settings": { t: "تخصيص النظام", s: "هوية النظام وألوانه" },
  "/tasks": { t: "المهام", s: "متابعة وتحديث مهام جميع المشاريع" },
  "/projects": { t: "المشاريع", s: "إدارة المشاريع وفريق العمل والعملاء" },
  "/kpis": { t: "الأداء والمستهدفات", s: "متابعة مؤشرات الأداء الرئيسية ومقارنتها بالمستهدفات" },
  "/meetings": { t: "الاجتماعات", s: "جدولة ومتابعة اجتماعات الفريق والعملاء" },
  "/archive": { t: "الأرشيف", s: "ملفات ووثائق المشاريع" },
  "/team": { t: "الفريق", s: "المستخدمون وأدوارهم وصلاحياتهم" },
};

export default function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const key = path === "/" ? "/" : "/" + path.split("/")[1];
  const meta = TITLES[key] || TITLES["/"];

  const [q, setQ] = useState("");
  const [alerts, setAlerts] = useState(0);
  const { viewer } = useRole();

  // الجرس: عدد المهام التي تنتظر إجراءً من المستخدم الحالي
  useEffect(() => {
    if (!viewer) return;
    tasksStore
      .list()
      .then((ts) => setAlerts(ts.filter((t) => myAction(t, viewer)).length))
      .catch(() => {});
  }, [path, viewer]);

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
        <span style={{ color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={17} /></span>
        <input
          placeholder="ابحث عن مهمة أو مشروع أو ملف…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      <div
        className="bell"
        title="مهام تنتظر إجراءً منك"
        onClick={() => router.push("/")}
      >
        <Icon name="bell" size={18} />
        {alerts > 0 && <span className="cnt">{alerts}</span>}
      </div>
    </div>
  );
}
