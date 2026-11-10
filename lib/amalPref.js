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

// ================= تخصيص أمل (لكل موظف على جهازه) =================
// المفاتيح القديمة كما هي حتى لا تضيع تفضيلات من خصّصها من داخل أمل
export const AMAL_SIZES = { s: "صغيرة", m: "متوسطة", l: "كبيرة" };
export const AMAL_PLACES = { center: "وسط الشاشة", left: "أسفل اليسار", right: "أسفل اليمين" };
export const AMAL_VOICES = { auto: "تلقائي (الترحيب والإنجازات)", on: "كل الكلام", off: "صامتة" };

const flag = (k, d) => { try { const v = window.localStorage.getItem(`amal_${k}`); return v == null ? d : v === "1"; } catch { return d; } };
const str = (k, list, d) => { try { const v = window.localStorage.getItem(k); return v && v in list ? v : d; } catch { return d; } };

export function readAmalPrefs() {
  let pos = null;
  try { const p = JSON.parse(window.localStorage.getItem("amal_pos") || "null"); if (p && typeof p.x === "number") pos = p; } catch {}
  return {
    mini: flag("mini", false),
    tipsOff: flag("tips_off", false),
    greetOff: flag("greet_off", false),
    voice: str("amal_voice_mode", AMAL_VOICES, "auto"),
    size: str("amal_size", AMAL_SIZES, "m"),
    place: str("amal_place", AMAL_PLACES, "center"),
    pos,
  };
}

export function writeAmalPrefs(patch) {
  try {
    const ls = window.localStorage;
    if ("mini" in patch) ls.setItem("amal_mini", patch.mini ? "1" : "0");
    if ("tipsOff" in patch) ls.setItem("amal_tips_off", patch.tipsOff ? "1" : "0");
    if ("greetOff" in patch) ls.setItem("amal_greet_off", patch.greetOff ? "1" : "0");
    if ("voice" in patch) ls.setItem("amal_voice_mode", patch.voice);
    if ("size" in patch) ls.setItem("amal_size", patch.size);
    // اختيار مكان جديد يلغي المكان المسحوب يدوياً
    if ("place" in patch) { ls.setItem("amal_place", patch.place); ls.removeItem("amal_pos"); }
  } catch {}
  window.dispatchEvent(new CustomEvent("amal:prefs"));
}
