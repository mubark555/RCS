"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";

// محرّر أسطر: كل سطر صف مستقل، Enter يضيف صفاً جديداً، Backspace على سطر فارغ يحذفه.
// القيمة نص واحد مفصول بأسطر (\n) للحفاظ على التوافق مع التصدير والعرض.
export default function LineList({ value, onChange, placeholder }) {
  const lines = useMemo(() => {
    const a = (value || "").split("\n");
    return a.length ? a : [""];
  }, [value]);
  const refs = useRef([]);
  const [focusIdx, setFocusIdx] = useState(-1);

  useEffect(() => {
    if (focusIdx >= 0 && refs.current[focusIdx]) {
      refs.current[focusIdx].focus();
      setFocusIdx(-1);
    }
  });

  const commit = (arr) => onChange(arr.join("\n"));

  const setLine = (i, v) => {
    const a = [...lines];
    a[i] = v;
    commit(a);
  };
  const onKey = (i, e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const a = [...lines];
      a.splice(i + 1, 0, "");
      commit(a);
      setFocusIdx(i + 1);
    } else if (e.key === "Backspace" && lines[i] === "" && lines.length > 1) {
      e.preventDefault();
      const a = [...lines];
      a.splice(i, 1);
      commit(a);
      setFocusIdx(Math.max(0, i - 1));
    }
  };
  const removeLine = (i) => {
    const a = lines.filter((_, j) => j !== i);
    commit(a.length ? a : [""]);
  };

  return (
    <div className="line-list">
      {lines.map((ln, i) => (
        <div className="line-row" key={i}>
          <span className="line-dot" />
          <input
            ref={(el) => (refs.current[i] = el)}
            value={ln}
            onChange={(e) => setLine(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            placeholder={i === 0 ? placeholder : "…"}
          />
          {lines.length > 1 && (
            <button type="button" className="line-x" onClick={() => removeLine(i)} tabIndex={-1} title="حذف السطر">
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
      ))}
      <div className="line-hint">اضغط Enter لإضافة سطر جديد</div>
    </div>
  );
}
