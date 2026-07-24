"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { useNotifications } from "@/components/NotificationsProvider";

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "الآن";
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`;
  return `قبل ${Math.floor(s / 86400)} يوم`;
}
const TONE = { create: "#16a34a", update: "#2563eb", delete: "#e0574e" };

const TITLES = {
  "/": { t: "الرئيسية", s: "لوحة القيادة — أهم ما يجب متابعته هذا الأسبوع" },
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
  const { items, unread, open, setOpen, markAllRead, clearAll } = useNotifications();
  const bellRef = useRef(null);

  // إغلاق القائمة عند الضغط خارجها
  useEffect(() => {
    function onDoc(e) {
      if (open && bellRef.current && !bellRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);

  function toggleBell() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markAllRead();
  }

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
      <div className="bell-wrap" ref={bellRef}>
        <div className="bell" title="الإشعارات" onClick={toggleBell}>
          <Icon name="bell" size={18} />
          {unread > 0 && <span className="cnt">{unread > 99 ? "99+" : unread}</span>}
        </div>

        {open && (
          <div className="notif-panel" dir="rtl">
            <div className="notif-head">
              <b>الإشعارات</b>
              {items.length > 0 && (
                <button className="notif-clear" onClick={clearAll}>مسح الكل</button>
              )}
            </div>
            <div className="notif-list">
              {items.length === 0 ? (
                <div className="notif-empty">لا إشعارات بعد.</div>
              ) : (
                items.map((n) => (
                  <div key={n.id} className={`notif-item ${n.read ? "" : "unread"}`}>
                    <span className="notif-dot" style={{ background: TONE[n.kind] || "#94a3b8" }} />
                    <div className="notif-body">
                      <div className="notif-title">{n.title}</div>
                      <div className="notif-time">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
