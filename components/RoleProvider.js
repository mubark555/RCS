"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usersStore, projectsStore } from "@/lib/store";
import { projManagers, projClients, projMembers } from "@/lib/constants";

const RoleCtx = createContext(null);

export function RoleProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [viewerId, setViewerId] = useState(null);
  const [ready, setReady] = useState(false);

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
      const [list] = await Promise.all([reloadUsers(), reloadProjects()]);
      let saved = null;
      try {
        saved = window.localStorage.getItem("sp_viewer");
      } catch {}
      const exists = list.find((u) => u.id === saved);
      const def = exists ? saved : (list.find((u) => u.role === "manager") || list[0])?.id || null;
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

  const viewer = users.find((u) => u.id === viewerId) || null;
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
      value={{ users, projects, viewer, viewerId, setViewer, reloadUsers, reloadProjects, role, scopeProjects, clientProject, readOnly, canManage, ready }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  return useContext(RoleCtx) || {
    users: [], projects: [], viewer: null, role: "manager", scopeProjects: null, clientProject: null,
    readOnly: false, canManage: true, ready: false,
    setViewer: () => {}, reloadUsers: async () => [], reloadProjects: async () => [],
  };
}
