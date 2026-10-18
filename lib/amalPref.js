"use client";

// تفعيل المساعدة الذكية «أمل» — قرار لكل موظف لنفسه، وغير مفعّلة افتراضياً
// يُحفظ لكل مستخدم (سحابياً عند توفره) حتى يبقى اختياره على أي جهاز.

import { useEffect, useState } from "react";
import { appSettings } from "./store";
import { useRole } from "@/components/RoleProvider";

const EVT = "amal:enabled";
const keyOf = (id) => `amal_enabled_${id}`;
const lsKey = (id) => `amal_on_${id}`;

function readCache(id) {
  try { return window.localStorage.getItem(lsKey(id)) === "1"; } catch { return false; }
}

export function setAmalEnabled(id, on) {
  if (!id) return;
  try { window.localStorage.setItem(lsKey(id), on ? "1" : "0"); } catch {}
  window.dispatchEvent(new CustomEvent(EVT, { detail: { id, on } }));
  appSettings.set(keyOf(id), !!on).catch(() => {});
}

// [مفعّلة؟, تغيير]
export function useAmalEnabled() {
  const { viewer } = useRole();
  const id = viewer?.id;
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!id) { setOn(false); return; }
    setOn(readCache(id));
    let live = true;
    appSettings.get(keyOf(id)).then((v) => {
      if (!live || typeof v !== "boolean") return;
      setOn(v);
      try { window.localStorage.setItem(lsKey(id), v ? "1" : "0"); } catch {}
    }).catch(() => {});
    const onEvt = (e) => { if (e.detail?.id === id) setOn(!!e.detail.on); };
    window.addEventListener(EVT, onEvt);
    return () => { live = false; window.removeEventListener(EVT, onEvt); };
  }, [id]);

  return [on, (v) => setAmalEnabled(id, v)];
}
