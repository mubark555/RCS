"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { usersStore, projectsStore } from "@/lib/store";
import { useAuth } from "@/components/AuthProvider";
import { projManagers, projClients, projMembers, userProjects } from "@/lib/constants";

const RoleCtx = createContext(null);

export function RoleProvider({ children }) {
  const { isCloud, authed, authEmail } = useAuth();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [viewerId, setViewerId] = useState(null);
  const [ready, setReady] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  const boundRef = useRef(false);

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

  // ربط الهوية المسجّلة (سحابياً) بسجلّ المستخدم عبر البريد الإلكتروني
  const resolveCloudViewer = useCallback(async (list) => {
    const email = (authEmail || "").trim().toLowerCase();
    const matched = list.find((u) => (u.email || "").trim().toLowerCase() === email && email);
    if (matched) {
      setNoAccess(false);
      setViewerId(matched.id);
      return;
    }
    // تمهيد الأدمن الأول: إذا لم يُربط أي بريد بعد، اربط أول مدير بهذا الحساب
    const anyEmail = list.some((u) => (u.email || "").trim());
    if (!anyEmail && email && !boundRef.current) {
      const admin = list.find((u) => u.role === "manager") || list[0];
      if (admin) {
        boundRef.current = true;
        try { await usersStore.update(admin.id, { email }); } catch {}
        const fresh = await reloadUsers();
        const nowMatched = fresh.find((u) => u.id === admin.id);
        setNoAccess(false);
        setViewerId(nowMatched ? nowMatched.id : admin.id);
        return;
      }
    }
    // مسجّل الدخول لكن بريده غير مضاف كمستخدم → لا صلاحية
    setNoAccess(true);
    setViewerId(null);
  }, [authEmail, reloadUsers]);

  useEffect(() => {
    (async () => {
      setReady(false);
      const [list] = await Promise.all([reloadUsers(), reloadProjects()]);
      if (isCloud) {
        if (authed) await resolveCloudViewer(list);
      } else {
        let saved = null;
        try { saved = window.localStorage.getItem("sp_viewer"); } catch {}
        const exists = list.find((u) => u.id === saved);
        const def = exists ? saved : (list.find((u) => u.role === "manager") || list[0])?.id || null;
        setViewerId(def);
      }
      setReady(true);
    })();
  }, [reloadUsers, reloadProjects, isCloud, authed, authEmail, resolveCloudViewer]);

  // في الوضع السحابي: منع التبديل اليدوي إلا للمدير (لأغراض الدعم)
  const allowSwitch = !isCloud;

  const setViewer = useCallback((id) => {
    setViewerId(id);
    try {
      window.localStorage.setItem("sp_viewer", id);
    } catch {}
  }, []);

  const viewer = users.find((u) => u.id === viewerId) || null;
  // في السحابة، المستخدم غير المعروف ليس مديراً افتراضياً
  const role = viewer?.role || (isCloud ? "client" : "manager");

  // المشاريع المرئية للمستخدم الحالي (null = كل المشاريع)
  let scopeProjects = null;
  if (viewer) {
    if (role === "client") {
      // مشاريع العميل = ما هو مُدرَج فيها كعميل + المشاريع المُسندة في سجلّه (تدعم التعدد)
      const fromProjects = projects.filter((p) => projClients(p).includes(viewer.name)).map((p) => p.name);
      const fromUser = userProjects(viewer);
      scopeProjects = [...new Set([...fromProjects, ...fromUser])];
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
      value={{ users, projects, viewer, viewerId, setViewer, reloadUsers, reloadProjects, role, scopeProjects, clientProject, readOnly, canManage, ready, allowSwitch, noAccess }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  return useContext(RoleCtx) || {
    users: [], projects: [], viewer: null, role: "manager", scopeProjects: null, clientProject: null,
    readOnly: false, canManage: true, ready: false, allowSwitch: true, noAccess: false,
    setViewer: () => {}, reloadUsers: async () => [], reloadProjects: async () => [],
  };
}
