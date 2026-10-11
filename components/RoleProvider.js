"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usersStore, projectsStore, setActor } from "@/lib/store";
import { supabase, authRequired } from "@/lib/supabase";
import { projManagers, projClients, projMembers } from "@/lib/constants";

const RoleCtx = createContext(null);

export function RoleProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
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

  const sessionUid = session?.user?.id || null;
  useEffect(() => {
    if (authRequired && !session) {
      setReady(false);
      return;
    }
    (async () => {
      const [list] = await Promise.all([reloadUsers(), reloadProjects()]);
      if (authRequired) {
        // الهوية من حساب الدخول: بالمعرّف، ثم بالبريد عند أول دخول (ويُربط تلقائياً)
        const uid = session.user.id;
        const email = (session.user.email || "").toLowerCase();
        let me = list.find((u) => u.auth_id === uid);
        if (!me && email) {
          me = list.find((u) => !u.auth_id && (u.email || "").trim().toLowerCase() === email);
          if (me) await usersStore.update(me.id, { auth_id: uid }).catch(() => {});
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
  }, [reloadUsers, reloadProjects, sessionUid]); // eslint-disable-line react-hooks/exhaustive-deps

  const setViewer = useCallback((id) => {
    if (authRequired) return; // مع تسجيل الدخول لا يمكن تبديل المستخدم
    setViewerId(id);
    try {
      window.localStorage.setItem("sp_viewer", id);
    } catch {}
  }, []);

  const viewer = users.find((u) => u.id === viewerId) || null;
  useEffect(() => setActor(viewer), [viewer]);

  const signOut = useCallback(async () => {
    if (authRequired) await supabase.auth.signOut();
  }, []);
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
      value={{ users, projects, viewer, viewerId, setViewer, reloadUsers, reloadProjects, role, scopeProjects, clientProject, readOnly, canManage, ready, authRequired, session, signOut }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  return useContext(RoleCtx) || {
    users: [], projects: [], viewer: null, role: "manager", scopeProjects: null, clientProject: null,
    readOnly: false, canManage: true, ready: false, authRequired: false, session: null, signOut: async () => {},
    setViewer: () => {}, reloadUsers: async () => [], reloadProjects: async () => [],
  };
}
