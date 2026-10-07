"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { usersStore, projectsStore, appSettings } from "@/lib/store";
import { useAuth } from "@/components/AuthProvider";
import { projManagers, projClients, projMembers, userProjects, PROJECTS } from "@/lib/constants";
import { resolvePerms, atLeast } from "@/lib/permissions";

const RoleCtx = createContext(null);

export function RoleProvider({ children }) {
  const { isCloud, authed, authEmail } = useAuth();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [viewerId, setViewerId] = useState(null);
  const [ready, setReady] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  // قائمة الحسابات المخوّلة بقسم المالية (معرّفات مستخدمين) — يعيّنها مالك النظام
  const [financeUsers, setFinanceUsers] = useState([]);   // اطلاع
  const [financeEditors, setFinanceEditors] = useState([]); // اطلاع وتعديل
  // مصفوفة الصلاحيات المخصّصة لكل مستخدم (تتجاوز افتراضيات الدور)
  const [permOverrides, setPermOverrides] = useState({});
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
    if (matched && matched.status === "suspended") {
      // حساب موقوف من قسم الفريق → لا دخول
      setNoAccess(true);
      setViewerId(null);
      return;
    }
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

  // تحميل قائمة صلاحية المالية (مشتركة سحابياً عبر app_settings)
  useEffect(() => {
    appSettings.get("finance_access").then((v) => {
      setFinanceUsers(Array.isArray(v?.users) ? v.users : []);
      setFinanceEditors(Array.isArray(v?.editors) ? v.editors : []);
    }).catch(() => {});
    appSettings.get("permissions").then((v) => {
      setPermOverrides(v && typeof v === "object" ? v : {});
    }).catch(() => {});
  }, [authEmail, ready]);

  // حفظ تخصيص صلاحيات مستخدم واحد (null = الرجوع لافتراضي الدور)
  const savePermissions = useCallback(async (userId, value) => {
    const cur = (await appSettings.get("permissions").catch(() => null)) || {};
    const next = { ...cur };
    if (value) next[userId] = value; else delete next[userId];
    setPermOverrides(next);
    await appSettings.set("permissions", next);
    // توافق: صلاحية المالية القديمة لم تعد مصدر الحقيقة لهذا المستخدم
    return next;
  }, []);

  // users: صلاحية اطلاع فقط — editors: اطلاع وتعديل (مستقلة عن صلاحية إدارة المشاريع)
  const saveFinanceUsers = useCallback(async (ids, editors = []) => {
    const view = Array.isArray(ids) ? ids : [];
    const edit = Array.isArray(editors) ? editors : [];
    setFinanceUsers(view);
    setFinanceEditors(edit);
    try { await appSettings.set("finance_access", { users: view, editors: edit }); } catch {}
  }, []);

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

  // الصلاحيات الفعلية (افتراضي الدور + تخصيص الشخص)
  const legacyFinance = { users: financeUsers, editors: financeEditors };
  const perms = resolvePerms(viewer || { role }, permOverrides, legacyFinance);
  const permsOf = useCallback((u) => resolvePerms(u, permOverrides, legacyFinance), [permOverrides, financeUsers, financeEditors]); // eslint-disable-line react-hooks/exhaustive-deps
  const can = (section, need = "view") => atLeast(perms.sections[section] || "none", need);
  const ability = (k) => !!perms.abilities[k];

  const readOnly = !can("tasks", "edit");
  const canManage = role === "manager";
  const canFinanceEdit = can("finance", "edit");
  const canFinance = can("finance", "view");
  // الاعتماد لسيم (العميل) والمدير نيابةً عنها؛ التسليم لفريق ڤيوليت — قابلة للتخصيص لكل شخص
  const canApprove = ability("approve");
  const canDeliver = ability("deliver");
  const canManagePerms = ability("permissions");

  return (
    <RoleCtx.Provider
      value={{ users, projects, viewer, viewerId, setViewer, reloadUsers, reloadProjects, role, scopeProjects, clientProject, readOnly, canManage, canFinance, canFinanceEdit, canApprove, canDeliver, financeUsers, financeEditors, saveFinanceUsers, ready, allowSwitch, noAccess, perms, permsOf, can, ability, permOverrides, savePermissions, canManagePerms }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  return useContext(RoleCtx) || {
    users: [], projects: [], viewer: null, role: "manager", scopeProjects: null, clientProject: null,
    readOnly: false, canManage: true, canFinance: true, canFinanceEdit: true, canApprove: true, canDeliver: true, financeUsers: [], financeEditors: [], ready: false, allowSwitch: true, noAccess: false,
    perms: { sections: {}, abilities: {} }, permsOf: () => ({ sections: {}, abilities: {} }), can: () => true, ability: () => true, permOverrides: {}, savePermissions: async () => {}, canManagePerms: true,
    setViewer: () => {}, reloadUsers: async () => [], reloadProjects: async () => [], saveFinanceUsers: async () => {},
  };
}

// أسماء المشاريع المتاحة للمستخدم الحالي — من قاعدة البيانات (مصدر واحد)
export function useProjectNames() {
  const { projects, scopeProjects } = useRole();
  if (scopeProjects) return scopeProjects;
  const names = (projects || []).map((p) => p.name).filter(Boolean);
  return names.length ? names : PROJECTS;
}
