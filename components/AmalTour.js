"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const CARD_W = 360;
const GAP = 14;
const PAD = 8;

const pathKey = (p) => {
  const x = String(p || "/").split("?")[0];
  return x === "/" ? "/" : "/" + x.split("/").filter(Boolean)[0];
};

// أول عنصر ظاهر يطابق أحد المحددات (يدعم { sel, text } للبحث بالنص)
function findTarget(target) {
  if (!target) return null;
  for (const t of target) {
    const sel = typeof t === "string" ? t : t.sel;
    const txt = typeof t === "string" ? null : t.text;
    const els = Array.from(document.querySelectorAll(sel));
    for (const el of els) {
      if (txt && !el.textContent.includes(txt)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) return el;
    }
  }
  return null;
}

// جولة أمل: تنقّل بين الصفحات، تسلّط الضوء على كل جزء، وتشرحه في بطاقة
export default function AmalTour({ steps, face, full, onEnd, onStep }) {
  const router = useRouter();
  const path = usePathname();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [cardH, setCardH] = useState(240);
  const [searching, setSearching] = useState(true);
  const elRef = useRef(null);
  const cardRef = useRef(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  // الانتقال لصفحة الخطوة ثم انتظار العنصر
  useEffect(() => {
    if (!step) return;
    onStep?.(step, i);
    elRef.current = null;
    setRect(null);
    setSearching(true);
    if (pathKey(path) !== pathKey(step.path) || (step.path === "/" && path !== "/")) router.push(step.path);
    if (!step.target) { setSearching(false); return; }
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      const el = findTarget(step.target);
      if (el) {
        clearInterval(iv);
        elRef.current = el;
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        setTimeout(() => setSearching(false), 380);
      } else if (tries > 30) {
        clearInterval(iv);
        setSearching(false); // لم يُعثر عليه: نعرض البطاقة في المنتصف
      }
    }, 150);
    return () => clearInterval(iv);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // تتبّع موضع العنصر (تمرير/تغيير حجم)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = elRef.current;
      if (el && document.contains(el)) {
        const r = el.getBoundingClientRect();
        setRect((p) => (p && Math.abs(p.top - r.top) < 1 && Math.abs(p.left - r.left) < 1 && Math.abs(p.width - r.width) < 1 && Math.abs(p.height - r.height) < 1 ? p : { top: r.top, left: r.left, width: r.width, height: r.height }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [i, searching]);

  // لوحة المفاتيح: ← التالي، → السابق، Esc إنهاء
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onEnd(false);
      if (e.key === "ArrowLeft" || e.key === "Enter") next();
      if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function next() { if (last) onEnd(true); else setI((x) => Math.min(steps.length - 1, x + 1)); }
  function prev() { setI((x) => Math.max(0, x - 1)); }

  if (!step) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const w = Math.min(step?.hero ? 560 : CARD_W, vw - 24);
  const show = !searching && rect && step.target;

  // موضع البطاقة: تحت العنصر، ثم فوقه، ثم بجانبه، وإلا في المنتصف
  let style;
  if (show) {
    const hole = { top: rect.top - PAD, left: rect.left - PAD, bottom: rect.top + rect.height + PAD, right: rect.left + rect.width + PAD };
    const cx = Math.max(12, Math.min(vw - w - 12, rect.left + rect.width / 2 - w / 2));
    if (hole.bottom + GAP + cardH < vh - 8) style = { top: hole.bottom + GAP, left: cx };
    else if (hole.top - GAP - cardH > 8) style = { top: hole.top - GAP - cardH, left: cx };
    else if (hole.left - GAP - w > 8) style = { top: Math.max(12, Math.min(vh - cardH - 12, rect.top + rect.height / 2 - cardH / 2)), left: hole.left - GAP - w };
    else if (hole.right + GAP + w < vw - 8) style = { top: Math.max(12, Math.min(vh - cardH - 12, rect.top + rect.height / 2 - cardH / 2)), left: hole.right + GAP };
    else style = { top: Math.max(12, vh - cardH - 16), left: (vw - w) / 2 };
  } else {
    style = { top: Math.max(12, (vh - cardH) / 2), left: (vw - w) / 2 };
  }

  return (
    <div className="amal-tour" role="dialog" aria-label="جولة تعريفية بالنظام">
      {show ? (
        <div className="amal-spot" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      ) : (
        <div className="amal-dim" />
      )}
      <div className={`amal-tcard ${searching ? "is-wait" : ""} ${step.hero ? "is-hero" : ""}`} ref={cardRef} style={{ ...style, width: w }} key={step.id}>
        {step.hero && full && <img className="amal-thero" src={full} alt="أمل" />}
        <div className="amal-tcard-head">
          <img src={face} alt="" />
          <div>
            <small>جولة مع أمل <span className="amal-ai">AI</span></small>
            <b>{step.title}</b>
          </div>
          <span className="amal-tcount">{i + 1} / {steps.length}</span>
        </div>
        <div className="amal-tcard-txt">{searching && step.target ? "لحظة… أوديك للمكان 👀" : step.text}</div>
        <div className="amal-tprog"><span style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
        <div className="amal-tcard-acts">
          <button className="btn primary sm" type="button" onClick={next}>{last ? "إنهاء الجولة 🎉" : "التالي"}</button>
          {i > 0 && <button className="btn ghost sm" type="button" onClick={prev}>السابق</button>}
          {!last && <button className="amal-tskip" type="button" onClick={() => onEnd(false)}>إيقاف الجولة</button>}
        </div>
      </div>
    </div>
  );
}
