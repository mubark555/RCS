"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/components/RoleProvider";
import { useSettings } from "@/components/SettingsProvider";
import { BrandLogos } from "@/components/BrandMark";
import { appSettings } from "@/lib/store";
import { leavesApi, returnedLeaveOf, LEAVE_TYPES } from "@/lib/leaves";
import { mergeEvents, greetingFor, GREET_THEMES } from "@/lib/calendar-seed";

const seenKey = (id) => `sp_greet_seen_${id}`;
const wasSeen = (id) => { try { return !!window.localStorage.getItem(seenKey(id)); } catch { return false; } };
const markSeen = (id) => { try { window.localStorage.setItem(seenKey(id), "1"); } catch {} };

// نوافذ الترحيب عند دخول النظام:
// 1) «الحمد لله على السلامة» لمن عاد من إجازة معتمدة (مرة واحدة لكل إجازة)
// 2) تهنئة المناسبة (يوم التأسيس، اليوم الوطني، رمضان، العيدين…) مرة واحدة يومياً لكل مستخدم
export default function WelcomeGate() {
  const { viewer, ready } = useRole();
  const { settings } = useSettings();
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    if (!ready || !viewer?.name) return;
    let alive = true;
    (async () => {
      const items = [];
      try {
        const leaves = await leavesApi.list();
        const back = returnedLeaveOf(leaves, viewer.name);
        if (back) items.push({ kind: "back", leave: back });
      } catch {}
      try {
        const stored = await appSettings.get("calendar_events");
        const g = greetingFor(mergeEvents(stored));
        const id = g ? `${g.id}-${viewer.id}` : null;
        if (g && !wasSeen(id)) items.push({ kind: "occasion", greet: g, seenId: id });
      } catch {}
      if (alive) setQueue(items);
    })();
    return () => { alive = false; };
  }, [ready, viewer?.id, viewer?.name]);

  const cur = queue[0];
  if (!cur) return null;

  async function close() {
    if (cur.kind === "back") {
      try { await leavesApi.update(cur.leave.id, { welcomed_at: new Date().toISOString() }); } catch {}
    } else {
      markSeen(cur.seenId);
    }
    setQueue((q) => q.slice(1));
  }

  const first = (viewer.name || "").split(" ")[0];

  if (cur.kind === "back") {
    const tp = LEAVE_TYPES[cur.leave.type] || LEAVE_TYPES.other;
    const sick = cur.leave.type === "sick";
    return (
      <div className="wg-overlay" onMouseDown={close}>
        <div className="wg-card wg-back" onMouseDown={(e) => e.stopPropagation()}>
          <div className="wg-hero" style={{ background: sick ? "linear-gradient(135deg,#0d9488,#14b8a6)" : "linear-gradient(135deg,#e05a50,#f08a5d)" }}>
            <span className="wg-float a">✨</span><span className="wg-float b">💐</span><span className="wg-float c">✨</span>
            <span className="wg-big">{sick ? "🤍" : "👋"}</span>
          </div>
          <div className="wg-body">
            <h2>{sick ? "الحمد لله على السلامة" : "أهلاً بعودتك"} يا {first}</h2>
            <p>{sick ? "طهور إن شاء الله، وما تشوف شر. نورت النظام من جديد والفريق كله سعيد برجوعك." : `نتمنى إنك استمتعت بـ${tp.ar}. نورت النظام من جديد والفريق سعيد برجوعك.`}</p>
            <div className="wg-logos"><BrandLogos settings={settings} size={34} /></div>
            <button className="btn primary wg-btn" onClick={close}>يا هلا — نبدأ 💪</button>
          </div>
        </div>
      </div>
    );
  }

  const g = cur.greet;
  const th = GREET_THEMES[g.theme] || GREET_THEMES.global;
  return (
    <div className="wg-overlay" onMouseDown={close}>
      <div className="wg-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wg-hero" style={{ background: `linear-gradient(135deg, ${th.from}, ${th.to})` }}>
          <span className="wg-pattern" />
          <span className="wg-float a">✦</span><span className="wg-float b">✦</span><span className="wg-float c">✦</span>
          <span className="wg-big">{th.emoji}</span>
          <span className="wg-occ">{g.title}</span>
        </div>
        <div className="wg-body">
          <h2>{g.title} — {first}</h2>
          <p>{g.message}</p>
          <div className="wg-logos"><BrandLogos settings={settings} size={34} /><small>من فريق ڤيوليت وسيم برايم</small></div>
          <button className="btn primary wg-btn" style={{ background: th.from, borderColor: th.from }} onClick={close}>شكراً، وأنتم بخير</button>
        </div>
      </div>
    </div>
  );
}
