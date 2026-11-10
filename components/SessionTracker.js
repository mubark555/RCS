"use client";

// يتتبّع جلسة المستخدم الحالي في الخلفية: دخول عند فتح النظام، ونبض أثناء الاستخدام
import { useEffect } from "react";
import { useRole } from "@/components/RoleProvider";
import { useAuth } from "@/components/AuthProvider";
import { ensureSession, heartbeat, HEARTBEAT_MS } from "@/lib/sessions";

export default function SessionTracker() {
  const { viewer } = useRole();
  const { authEmail } = useAuth();
  const user = viewer ? { id: viewer.id, name: viewer.name, email: authEmail || viewer.email || "" } : null;
  const key = user ? `${user.id}|${user.email}` : "";

  useEffect(() => {
    if (!user) return;
    ensureSession(user).catch(() => {});
    const beat = () => document.visibilityState === "visible" && ensureSession(user).catch(() => {});
    const iv = setInterval(beat, HEARTBEAT_MS);
    const onAct = () => heartbeat().catch(() => {});
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("click", onAct, { passive: true });
    window.addEventListener("keydown", onAct, { passive: true });
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", beat);
      window.removeEventListener("click", onAct);
      window.removeEventListener("keydown", onAct);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
