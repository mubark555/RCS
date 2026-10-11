"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { usersStore, projectsStore, rolesStore, unitsStore, setActor, setNotifyContext, linkMyAccount } from "@/lib/store";
import { buildAccess } from "@/lib/permissions.mjs";
import { supabase, authRequired } from "@/lib/supabase";

const RoleCtx = createContext(null);

export function RoleProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [roles, setRoles] = useState([]);
  const [units, setUnits] = useState([]);
  const [viewerId, setViewerId] = useState(null);
  const [ready, setReady] = useState(false);
  // undefined = جاري التحقق، null = لا جلسة
  const [session, setSession] = useState(authRequired ? undefined : null);

  useEffect(() => {
    if (!authRequired) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

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

  // قبل تشغيل ترحيل 002 لا توجد الجداول: تُستخدم الأدوار الافتراضية
  const reloadAccess = useCallback(async () => {
    const [r, u] = await Promise.all([rolesStore.list().catch(() => []), unitsStore.list().catch(() => [])]);
    setRoles(r);
    setUnits(u);
  }, []);

  const sessionUid = session?.user?.id || null;
  useEffect(() => {
    if (authRequired && !session) {
      setReady(false);
      return;
    }
    (async () => {
      let [list] = await Promise.all([reloadUsers(), reloadProjects(), reloadAccess()]);
      if (authRequired) {
        // الهوية من حساب الدخول: بالمعرّف، ثم بالبريد عند أول دخول (ويُربط تلقائياً)
        const uid = session.user.id;
        const email = (session.user.email || "").toLowerCase();
        let me = list.find((u) => u.auth_id === uid);
        if (!me && email) {
          const linked = await linkMyAccount().catch(() => null);
          if (linked) {
            list = await reloadUsers();
            me = list.find((u) => u.id === linked.id);
          }
        }
        setViewerId(me?.id || null);
        setReady(true);
        return;
      }
      let saved = null;
      try {
        saved = window.localStorage.getItem("sp_viewer");
      } catch {}
      const exists = list.find((u) => u.id === saved);
      const def = exists ? saved : (list.find((u) => u.role === "manager") || list[0])?.id || null;
      setViewerId(def);
      setReady(true);
    })();
  }, [reloadUsers, reloadProjects, reloadAccess, sessionUid]); // eslint-disable-line react-hooks/exhaustive-deps

  const setViewer = useCallback((id) => {
    if (authRequired) return; // مع تسجيل الدخول لا يمكن تبديل المستخدم
    setViewerId(id);
    try {
      window.localStorage.setItem("sp_viewer", id);
    } catch {}
  }, []);

  const baseViewer = users.find((u) => u.id === viewerId) || null;
  // الصلاحيات الفعلية: الدور العام + الدور في كل مشروع + الوحدات التي يديرها
  const access = useMemo(() => buildAccess(baseViewer, { roles, projects, units }), [baseViewer, roles, projects, units]);
  const viewer = useMemo(() => (baseViewer ? { ...baseViewer, access } : null), [baseViewer, access]);
  useEffect(() => setActor(viewer), [viewer]);
  // لمعرفة من يُبلَّغ (مثلاً كل من يحق له المراجعة في مشروع المهمة)
  useEffect(() => {
    setNotifyContext({ users, withAccess: (u) => ({ ...u, access: buildAccess(u, { roles, projects, units }) }) });
  }, [users, roles, projects, units]);

  const signOut = useCallback(async () => {
    if (authRequired) await supabase.auth.signOut();
  }, []);

  const role = viewer?.role || "member";
  const can = access.can;
  const canAny = access.canAny;
  const scopeProjects = access.visibleProjects; // null = كل المشاريع
  const clientProject = role === "client" ? (scopeProjects && scopeProjects[0]) || viewer?.project || null : null;
  const readOnly = !canAny("task.create") && !canAny("task.edit");
  const canManage = can("users.manage");

  return (
    <RoleCtx.Provider
      value={{ users, projects, roles, units, viewer, viewerId, setViewer, reloadUsers, reloadProjects, reloadAccess, role, access, can, canAny, scopeProjects, clientProject, readOnly, canManage, ready, authRequired, session, signOut }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  return useContext(RoleCtx) || {
    users: [], projects: [], roles: [], units: [], viewer: null, role: "member", scopeProjects: [], clientProject: null,
    access: buildAccess(null), can: () => false, canAny: () => false,
    readOnly: true, canManage: false, ready: false, authRequired: false, session: null, signOut: async () => {},
    setViewer: () => {}, reloadUsers: async () => [], reloadProjects: async () => [], reloadAccess: async () => {},
  };
}
