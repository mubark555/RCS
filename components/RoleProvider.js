"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { usersStore, projectsStore, appSettings } from "@/lib/store";
import { useAuth } from "@/components/AuthProvider";
import { projManagers, projClients, projMembers, userProjects, PROJECTS } from "@/lib/constants";
import { resolvePerms, atLeast } from "@/lib/permissions";
import { isMe, decisionBlock, teamOf } from "@/lib/mywork.mjs";

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

  // الصلاحيات الفعلية (افتراضي الدور + تخصيص الشخص)
  const legacyFinance = { users: financeUsers, editors: financeEditors };
  const perms = resolvePerms(viewer || { role }, permOverrides, legacyFinance);
  const permsOf = useCallback((u) => resolvePerms(u, permOverrides, legacyFinance), [permOverrides, financeUsers, financeEditors]); // eslint-disable-line react-hooks/exhaustive-deps
  const can = (section, need = "view") => atLeast(perms.sections[section] || "none", need);
  const ability = (k) => !!perms.abilities[k];

  // فريق المستخدم: من يتبعونه مباشرة أو عبر سلسلة «المسؤول المباشر»
  const team = viewer ? teamOf(viewer, users) : [];

  // المشاريع المرئية للمستخدم الحالي (null = كل المشاريع)
  // النطاق «ما يخصّه فقط»: المشاريع التي هو مدير/عضو/عميل فيها + المشاريع المُسندة في سجلّه
  let scopeProjects = null;
  if (viewer && perms.scope !== "all") {
    const fromProjects = projects
      .filter((p) => projClients(p).includes(viewer.name) || projMembers(p).includes(viewer.name) || projManagers(p).includes(viewer.name))
      .map((p) => p.name);
    scopeProjects = [...new Set([...fromProjects, ...userProjects(viewer)])];
  }

  const clientProject = role === "client" ? (scopeProjects && scopeProjects[0]) || viewer?.project || null : null;

  const readOnly = !can("tasks", "edit");
  const canManage = role === "manager";
  const canFinanceEdit = can("finance", "edit");
  const canFinance = can("finance", "view");
  // الاعتماد لسيم (العميل) والمدير نيابةً عنها؛ التسليم لفريق ڤيوليت — قابلة للتخصيص لكل شخص
  const canApprove = ability("approve");
  const canDeliver = ability("deliver");
  const canManagePerms = ability("permissions");

  // المهمة مرئية: ضمن مشاريعه، أو هو طرف فيها (المسؤول، الحائز، المُسلِّم، صاحب خطوة في السلسلة)
  const isInvolved = (t) => Boolean(viewer) && (
    isMe(t?.assigned_to, viewer) || isMe(t?.holder, viewer) || isMe(t?.ready_by, viewer)
    || (Array.isArray(t?.chain) && t.chain.some((st) => isMe(st?.person, viewer))));
  // مدير الوحدة يرى أيضاً مهام من يتبعونه
  const isTeamTask = (t) => team.some((u) => isMe(t?.assigned_to, u) || isMe(t?.holder, u) || isMe(t?.ready_by, u));
  const taskVisible = (t) => !scopeProjects || scopeProjects.includes(t?.project) || isInvolved(t) || isTeamTask(t);
  // سبب منع قرار الاعتماد على مهمة (null = مسموح)
  const decisionBlockFor = (t) => decisionBlock(t, viewer, perms.abilities);

  return (
    <RoleCtx.Provider
      value={{ users, projects, viewer, viewerId, setViewer, reloadUsers, reloadProjects, role, scopeProjects, clientProject, team, readOnly, canManage, canFinance, canFinanceEdit, canApprove, canDeliver, financeUsers, financeEditors, saveFinanceUsers, ready, allowSwitch, noAccess, perms, permsOf, can, ability, permOverrides, savePermissions, canManagePerms, taskVisible, isInvolved, decisionBlockFor }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  return useContext(RoleCtx) || {
    users: [], projects: [], viewer: null, role: "manager", scopeProjects: null, clientProject: null, team: [],
    readOnly: false, canManage: true, canFinance: true, canFinanceEdit: true, canApprove: true, canDeliver: true, financeUsers: [], financeEditors: [], ready: false, allowSwitch: true, noAccess: false,
    perms: { sections: {}, abilities: {} }, permsOf: () => ({ sections: {}, abilities: {} }), can: () => true, ability: () => true, permOverrides: {}, savePermissions: async () => {}, canManagePerms: true,
    taskVisible: () => true, isInvolved: () => false, decisionBlockFor: () => null,
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
