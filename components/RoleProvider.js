"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usersStore, projectsStore, isCloud } from "@/lib/store";
import { projManagers, projClients, projMembers } from "@/lib/constants";
import { setActor, ensureSession, heartbeat, endSessionOnUnloadLocal, endSession, HEARTBEAT_MS } from "@/lib/activity";

const RoleCtx = createContext(null);

export function RoleProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [viewerId, setViewerId] = useState(null);
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState({ enabled: false, user: null, checked: false });

  const reloadUsers = useCallback(async () => {
    const list = await usersStore.list().catch(() => []);
    setUsers(list);
    return list;
  }, []);

  const reloadProjects = useCallback(async () => {
    const list = await projectsStore.list().catch(() => []);
    setProjects(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      // صفحة الدخول لا تحتاج بيانات (والواجهات المحمية سترفض قبل الدخول)
      if (window.location.pathname.startsWith("/login")) {
        if (!isCloud) await reloadUsers();
        setReady(true);
        return;
      }
      const [list, , me] = await Promise.all([
        reloadUsers(),
        reloadProjects(),
        fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ enabled: false, user: null })),
      ]);
      setAuth({ enabled: Boolean(me.enabled), user: me.user || null, checked: true });
      if (me.enabled && !me.user && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
        return;
      }
      let saved = null;
      try {
        saved = window.localStorage.getItem("sp_viewer");
      } catch {}
      const exists = list.find((u) => u.id === saved);
      let def = exists ? saved : (list.find((u) => u.role === "manager") || list[0])?.id || null;
      if (me.user) {
        // بعد الدخول: الافتراضي هو حساب المستخدم نفسه (يمكن للمدير المعاينة كغيره)
        const mine = list.find((u) => String(u.id) === String(me.user.id)) ||
          list.find((u) => u.email && u.email.toLowerCase() === String(me.user.email || "").toLowerCase());
        const mineId = mine ? mine.id : me.user.id;
        def = exists && me.user.role === "manager" ? saved : mineId;
      }
      setViewerId(def);
      setReady(true);
    })();
  }, [reloadUsers, reloadProjects]);

  const setViewer = useCallback((id) => {
    setViewerId(id);
    try {
      window.localStorage.setItem("sp_viewer", id);
    } catch {}
  }, []);

  // المستخدم الحقيقي (المسجّل دخوله بالرمز) — وإلا المختار يدوياً (الوضع التجريبي بلا دخول)
  const authUser = auth.user;
  const realUser = authUser
    ? users.find((u) => String(u.id) === String(authUser.id)) ||
      users.find((u) => u.email && u.email.toLowerCase() === String(authUser.email || "").toLowerCase()) ||
      { id: authUser.id, name: authUser.name, role: authUser.role, email: authUser.email, title: "" }
    : null;
  const canPreview = !auth.enabled || realUser?.role === "manager";
  let viewer = users.find((u) => u.id === viewerId) || null;
  if (realUser && (!canPreview || !viewer)) viewer = realUser;
  if (realUser && realUser.role !== "manager") viewer = realUser;
  const actorUser = realUser || viewer; // من يُسجَّل باسمه النشاط

  const logout = useCallback(async () => {
    await endSession("logout").catch(() => {});
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    try { window.localStorage.removeItem("sp_viewer"); } catch {}
    window.location.href = "/login";
  }, []);

  // تتبّع الدخول/الخروج: جلسة لكل مستخدم + نبض دوري أثناء استخدام النظام
  useEffect(() => {
    setActor(actorUser);
    if (!ready || !actorUser) return;
    if (window.location.pathname.startsWith("/login")) return;
    const viewer = actorUser;
    ensureSession(viewer).catch(() => {});
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      ensureSession(viewer).catch(() => {}); // تستأنف أو تبدأ جلسة جديدة بعد الخمول
    };
    const iv = setInterval(beat, HEARTBEAT_MS);
    const onVis = () => document.visibilityState === "visible" && beat();
    const onAct = () => heartbeat().catch(() => {});
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", endSessionOnUnloadLocal);
    window.addEventListener("click", onAct, { passive: true });
    window.addEventListener("keydown", onAct, { passive: true });
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", endSessionOnUnloadLocal);
      window.removeEventListener("click", onAct);
      window.removeEventListener("keydown", onAct);
    };
  }, [ready, actorUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const role = viewer?.role || "manager";

  // المشاريع المرئية للمستخدم الحالي (null = كل المشاريع)
  let scopeProjects = null;
  if (viewer) {
    if (role === "client") {
      const mine = projects.filter((p) => projClients(p).includes(viewer.name)).map((p) => p.name);
      scopeProjects = mine.length ? mine : (viewer.project ? [viewer.project] : []);
    } else if (role === "member") {
      const mine = projects
        .filter((p) => projMembers(p).includes(viewer.name) || projManagers(p).includes(viewer.name))
        .map((p) => p.name);
      scopeProjects = mine.length ? mine : null; // غير مُسند لأي مشروع → يرى الكل (توافقية)
    }
  }

  const clientProject = role === "client" ? (scopeProjects && scopeProjects[0]) || viewer?.project || null : null;
  const readOnly = role === "client";
  const canManage = role === "manager";

  return (
    <RoleCtx.Provider
      value={{ users, projects, viewer, viewerId: viewer?.id || viewerId, setViewer, auth, realUser, canPreview, logout, reloadUsers, reloadProjects, role, scopeProjects, clientProject, readOnly, canManage, ready }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  return useContext(RoleCtx) || {
    users: [], projects: [], viewer: null, role: "manager", scopeProjects: null, clientProject: null,
    readOnly: false, canManage: true, ready: false, auth: { enabled: false, user: null }, realUser: null, canPreview: true, logout: async () => {},
    setViewer: () => {}, reloadUsers: async () => [], reloadProjects: async () => [],
  };
}
