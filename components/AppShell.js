"use client";

// الهيكل العام: صفحة الدخول تُعرض وحدها بلا شريط جانبي
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Toaster from "@/components/Toaster";
import ReminderWatcher from "@/components/ReminderWatcher";

export default function AppShell({ children }) {
  const path = usePathname() || "";
  if (path.startsWith("/login")) {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }
  return (
    <>
      <div className="app">
        <Sidebar />
        <div className="main">
          <TopBar />
          <div className="content">{children}</div>
        </div>
      </div>
      <ReminderWatcher />
      <Toaster />
    </>
  );
}
