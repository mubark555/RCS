"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const node = (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
  // يُعرض في body حتى لا يتأثر بعناصر تُنشئ سياق تموضع (مثل backdrop-filter في الشريط العلوي)
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
