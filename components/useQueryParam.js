"use client";

import { useEffect, useState } from "react";

// قراءة معامل من الرابط (?task=…) دون useSearchParams، مع التحديث عند التنقل داخل نفس الصفحة
export const NAV_EVENT = "violet:navigate";
export default function useQueryParam(name) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    const read = () => setValue(new URLSearchParams(window.location.search).get(name));
    read();
    window.addEventListener(NAV_EVENT, read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener(NAV_EVENT, read);
      window.removeEventListener("popstate", read);
    };
  }, [name]);
  return value;
}

// إزالة المعامل من الرابط بعد استخدامه
export function clearQueryParam(name) {
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState(null, "", url.pathname + (url.search || ""));
}
