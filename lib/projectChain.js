"use client";

// سلسلة الاعتمادات على مستوى المشروع:
// تُعرَّف الخطوات (الشخص + نوع الخطوة + الإجراء) مرة واحدة لكل مشروع، وكل مهمة في المشروع تتبعها إلزامياً.
// المهمة تحفظ فقط حالة كل خطوة (منجزة/معتمدة/مرفوضة) في عمودها chain.
// تُحفظ القوالب في app_settings بالمفتاح "project_chains" على شكل { [projectId]: [steps] }.

import { useCallback, useEffect, useState } from "react";
import { appSettings } from "./store";
import { normalizeChain } from "./constants";

const KEY = "project_chains";
let _cache = null;
const _subs = new Set();

export async function loadProjectChains(force = false) {
  if (_cache && !force) return _cache;
  const v = await appSettings.get(KEY).catch(() => null);
  _cache = v && typeof v === "object" ? v : {};
  return _cache;
}

export async function saveProjectChain(projectId, steps) {
  const cur = { ...(await loadProjectChains(true)) };
  const clean = (steps || []).filter((s) => s && s.person).map((s) => ({ person: s.person, type: s.type === "approve" ? "approve" : "work", action: s.action || "" }));
  if (clean.length) cur[projectId] = clean; else delete cur[projectId];
  _cache = cur;
  await appSettings.set(KEY, cur);
  _subs.forEach((fn) => { try { fn(cur); } catch {} });
  return cur;
}

// قالب سلسلة مشروع حسب اسمه
export function templateFor(chains, projects, projectName) {
  const p = (projects || []).find((x) => x.name === projectName);
  return (p && chains && Array.isArray(chains[p.id]) && chains[p.id]) || [];
}

// السلسلة الفعلية للمهمة = قالب المشروع + حالة كل خطوة من المهمة
// (تُطابق الحالة بالترتيب والشخص؛ أي تغيير في القالب يعيد الخطوة المتغيّرة إلى «بالانتظار»)
export function effectiveChain(template, taskChain) {
  const tc = normalizeChain(taskChain);
  return (template || []).map((st, i) => {
    const prev = tc[i];
    const same = prev && prev.person === st.person && (prev.type || "work") === st.type;
    return {
      person: st.person, type: st.type, action: st.action,
      status: same ? prev.status || "pending" : "pending",
      at: same ? prev.at || null : null,
      note: same ? prev.note || "" : "",
      by: same ? prev.by || "" : "",
    };
  });
}

// خطاف: قوالب كل المشاريع (تتحدّث فوراً عند الحفظ)
export function useProjectChains() {
  const [chains, setChains] = useState(_cache || {});
  const reload = useCallback(async () => { setChains(await loadProjectChains(true)); }, []);
  useEffect(() => {
    loadProjectChains().then(setChains);
    _subs.add(setChains);
    return () => { _subs.delete(setChains); };
  }, []);
  return { chains, reload };
}
