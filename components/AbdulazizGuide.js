"use client";

// «عبدالعزيز» — مرشد تعريفي يشرح أقسام النظام: زر عائم يفتح لوحة فيها شرح الصفحة الحالية
// وكل الأقسام اللي يملك المستخدم صلاحيتها. وأول زيارة لكل قسم يعرض فقاعة «أشرح لك؟».

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRole } from "@/components/RoleProvider";
import Icon from "@/components/Icon";
import { ABDULAZIZ_AVATAR, ABDULAZIZ_POSES, guideForPath, visibleGuides } from "@/lib/abdulaziz";
import { useAmalEnabled, readAmalPrefs } from "@/lib/amalPref";

const SEEN_KEY = "abdulaziz_seen";
const TIPS_KEY = "abdulaziz_tips_off";

function readSeen() {
  try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
}
function markSeen(key) {
  try { window.localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), key])])); } catch {}
}
function tipsOff() {
  try { return window.localStorage.getItem(TIPS_KEY) === "1"; } catch { return false; }
}

function Avatar({ size = 52 }) {
  return (
    <span className="az-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {ABDULAZIZ_AVATAR ? <img src={ABDULAZIZ_AVATAR} alt="عبدالعزيز" /> : "ع"}
    </span>
  );
}

// الشخصية كاملة بوضعية حسب الموقف (ترحيب، شرح، تفكير…)
function Figure({ pose = "idle", className = "" }) {
  return <img className={`az-fig ${className}`} src={ABDULAZIZ_POSES[pose] || ABDULAZIZ_POSES.idle} alt="" draggable={false} />;
}

function GuideBody({ g }) {
  return (
    <div className="az-guide">
      <p className="az-intro">{g.intro}</p>
      <div className="az-h">وش تقدر تسوي هنا</div>
      <ul>{g.features.map((f) => <li key={f}>{f}</li>)}</ul>
      {g.steps?.length > 0 && (<>
        <div className="az-h">كيف تبدأ</div>
        <ol>{g.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </>)}
    </div>
  );
}

// إذا كانت «أمل» مثبّتة أسفل اليسار نرفع عبدالعزيز فوقها حتى لا يتداخلان
function useAmalAtLeft() {
  const [amalOn] = useAmalEnabled();
  const [left, setLeft] = useState(false);
  useEffect(() => {
    const read = () => { const p = readAmalPrefs(); setLeft(p.place === "left" && !p.pos); };
    read();
    window.addEventListener("amal:prefs", read);
    return () => window.removeEventListener("amal:prefs", read);
  }, []);
  return amalOn && left;
}

export default function AbdulazizGuide() {
  const path = usePathname();
  const { can, ready } = useRole();
  const raised = useAmalAtLeft();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null); // مفتاح القسم المعروض في «كل الأقسام»
  const [tab, setTab] = useState("page"); // page | all
  const [bubble, setBubble] = useState(null);
  const [hover, setHover] = useState(false);

  const current = useMemo(() => (ready ? guideForPath(path, can) : null), [path, can, ready]);
  const all = useMemo(() => (ready ? visibleGuides(can) : []), [can, ready]);

  // أول زيارة للقسم: فقاعة تعريف قصيرة
  useEffect(() => {
    setBubble(null);
    if (!current || open || tipsOff() || readSeen().includes(current.key)) return;
    const t = setTimeout(() => setBubble(current), 1200);
    return () => clearTimeout(t);
  }, [current, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function show(t) {
    if (current) markSeen(current.key);
    setBubble(null);
    setTab(t || (current ? "page" : "all"));
    setSel(null);
    setOpen(true);
  }
  function dismissBubble() {
    if (bubble) markSeen(bubble.key);
    setBubble(null);
  }

  if (!ready) return null;
  const picked = sel && all.find((g) => g.key === sel);

  return (
    <>
      <div className={`az-dock${raised ? " is-raised" : ""}`}>
        {bubble && !open && (
          <div className="az-bubble">
            <button type="button" className="az-x" onClick={dismissBubble} aria-label="إغلاق"><Icon name="close" size={13} /></button>
            <b>أهلاً، أنا عبدالعزيز 👋</b>
            <span>هذا قسم «{bubble.ar}». تبي أشرح لك وش فيه وكيف تستخدمه؟</span>
            <div className="az-bubble-act">
              <button type="button" className="btn sm primary" onClick={() => show("page")}>اشرح لي</button>
              <button type="button" className="btn sm ghost" onClick={dismissBubble}>لاحقاً</button>
            </div>
          </div>
        )}
        <button type="button" className="az-fab" onClick={() => (open ? setOpen(false) : show())} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title="عبدالعزيز — شرح أقسام النظام" aria-label="عبدالعزيز — شرح أقسام النظام">
          <Figure pose={bubble ? "wave" : hover ? "thumbs" : "idle"} />
          <span className="az-fab-tag">عبدالعزيز</span>
        </button>
      </div>

      {open && (
        <div className="az-overlay" onMouseDown={() => setOpen(false)}>
          <aside className="az-panel" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="عبدالعزيز">
            <header className="az-head">
              <Avatar size={46} />
              <div>
                <b>عبدالعزيز</b>
                <small>مرشدك لأقسام النظام</small>
              </div>
              <button type="button" className="btn sm ghost icon" onClick={() => setOpen(false)} aria-label="إغلاق"><Icon name="close" size={16} /></button>
            </header>

            <div className="seg az-tabs">
              {current && <button type="button" className={tab === "page" ? "on" : ""} onClick={() => setTab("page")}>هذه الصفحة</button>}
              <button type="button" className={tab === "all" ? "on" : ""} onClick={() => { setTab("all"); setSel(null); }}>كل الأقسام ({all.length})</button>
            </div>

            <div className="az-scroll">
              {tab === "page" && current && (<>
                <Figure pose="explain" className="az-host" />
                <h3 className="az-title"><Icon name={current.ico} size={18} /> {current.ar}</h3>
                <GuideBody g={current} />
              </>)}

              {tab === "all" && !picked && (<>
                <Figure pose="present" className="az-host" />
                <p className="az-intro">اختر أي قسم وأشرح لك وش هو وكيف تستخدمه. تظهر هنا الأقسام المتاحة لك حسب صلاحياتك.</p>
                <div className="az-list">
                  {all.map((g) => (
                    <button type="button" key={g.key} className="az-item" onClick={() => setSel(g.key)}>
                      <span className="az-item-ic"><Icon name={g.ico} size={18} /></span>
                      <span className="az-item-t"><b>{g.ar}</b><small>{g.intro}</small></span>
                    </button>
                  ))}
                </div>
              </>)}

              {tab === "all" && picked && (<>
                <button type="button" className="btn sm ghost az-back" onClick={() => setSel(null)}><Icon name="arrow" size={14} /> كل الأقسام</button>
                <Figure pose="thumbs" className="az-host" />
                <h3 className="az-title"><Icon name={picked.ico} size={18} /> {picked.ar}</h3>
                <GuideBody g={picked} />
                {current?.key !== picked.key && (
                  <Link href={picked.href} className="btn primary az-go" onClick={() => setOpen(false)}>انتقل إلى {picked.ar}</Link>
                )}
              </>)}
            </div>

            <footer className="az-foot">
              <label>
                <input type="checkbox" defaultChecked={!tipsOff()} onChange={(e) => { try { window.localStorage.setItem(TIPS_KEY, e.target.checked ? "0" : "1"); } catch {} }} />
                <span>اعرض لي تعريفاً عند أول زيارة لكل قسم</span>
              </label>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
