"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usersStore } from "@/lib/store";

const RoleCtx = createContext(null);

export function RoleProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [viewerId, setViewerId] = useState(null);
  const [ready, setReady] = useState(false);

  const reloadUsers = useCallback(async () => {
    const list = await usersStore.list().catch(() => []);
    setUsers(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      const list = await reloadUsers();
      let saved = null;
      try {
        saved = window.localStorage.getItem("sp_viewer");
      } catch {}
      const exists = list.find((u) => u.id === saved);
      const def = exists ? saved : (list.find((u) => u.role === "manager") || list[0])?.id || null;
      setViewerId(def);
      setReady(true);
    })();
  }, [reloadUsers]);

  const setViewer = useCallback((id) => {
    setViewerId(id);
    try {
      window.localStorage.setItem("sp_viewer", id);
    } catch {}
  }, []);

  const viewer = users.find((u) => u.id === viewerId) || null;
  const role = viewer?.role || "manager";
  const clientProject = role === "client" ? viewer?.project || null : null;
  const readOnly = role === "client";
  const canManage = role === "manager";

  return (
    <RoleCtx.Provider
      value={{ users, viewer, viewerId, setViewer, reloadUsers, role, clientProject, readOnly, canManage, ready }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  return useContext(RoleCtx) || {
    users: [], viewer: null, role: "manager", clientProject: null,
    readOnly: false, canManage: true, ready: false,
    setViewer: () => {}, reloadUsers: async () => [],
  };
}
