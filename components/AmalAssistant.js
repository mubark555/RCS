"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { useRole } from "@/components/RoleProvider";
import { tasksStore, meetingsStore, kpisStore, invoicesStore, paymentsStore, commentsStore, onDataChange } from "@/lib/store";
import { leavesApi } from "@/lib/leaves";
import { answer, suggestions, taskItem, AMAL_NAME, PRIORITY_OPTIONS } from "@/lib/amal";
import { welcome, pageTip, reactionFor, IDLE_TIPS, summarizeTask, timeGreeting, leaveGreeting } from "@/lib/amalLife";
import { tourFor, isNewEmployee } from "@/lib/amalTour";
import AmalTour from "@/components/AmalTour";

const STALE_MS = 60 * 1000;
const SLEEP_AFTER = 2 * 60 * 1000;   // تنام بعد دقيقتين بلا نشاط
const TIP_AFTER = 50 * 1000;         // تلميح خمول بعد 50 ثانية
const TIP_GAP = 5 * 60 * 1000;       // تلميح خمول واحد كل 5 دقائق كحد أقصى
const BUBBLE_MS = 9000;
const MOOD_MS = 3800;
const FACE = "/amal/amal-face.webp";
const FULL = "/amal/amal-full.webp";

// تخزين تفضيلات المستخدم محلياً (آمن عند تعطّل التخزين)
const pref = {
  get(k, d) { try { const v = window.localStorage.getItem(`amal_${k}`); return v == null ? d : v === "1"; } catch { return d; } },
  set(k, v) { try { window.localStorage.setItem(`amal_${k}`, v ? "1" : "0"); } catch {} },
};
// آخر مرة قيلت فيها نصيحة صفحة (حتى تتكلم في كل زيارة دون تكرار مزعج)
const TIP_REPEAT = 3 * 60 * 1000;
const recent = {
  is(k, ms) { try { const t = Number(window.sessionStorage.getItem(`amal_${k}`) || 0); return Date.now() - t < ms; } catch { return false; } },
  mark(k) { try { window.sessionStorage.setItem(`amal_${k}`, String(Date.now())); } catch {} },
};
const once = {
  has(k) { try { return window.sessionStorage.getItem(`amal_${k}`) === "1"; } catch { return false; } },
  mark(k) { try { window.sessionStorage.setItem(`amal_${k}`, "1"); } catch {} },
};

// ================= صوت أنثوي عربي =================
// أسماء أصوات نسائية معروفة في المتصفحات (Edge/Windows/macOS/Android) — الخليجي أولاً
const FEMALE_AR = ["zariyah", "noura", "fatima", "amany", "aysha", "laila", "layla", "salma", "hoda", "mouna", "amina", "rana", "sana", "iman", "reem", "mariam", "lana", "female", "امرأة", "أنثى"];
const MALE_AR = ["naayf", "hamed", "shakir", "fahed", "hamdan", "rami", "taim", "ali", "bassel", "moaz", "jamal", "hedi", "omar", "saleh", "ismael", "abdullah", "majed", "maged", "tarik", "tariq", "male"];
let _voice = null;
function pickVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const all = window.speechSynthesis.getVoices().filter((v) => /^ar/i.test(v.lang));
  if (!all.length) return null;
  const nm = (v) => String(v.name || "").toLowerCase();
  const score = (v) => {
    const n = nm(v);
    let sc = 0;
    if (FEMALE_AR.some((f) => n.includes(f))) sc += 10;
    if (MALE_AR.some((m) => new RegExp(`\\b${m}\\b`).test(n))) sc -= 20;
    if (/sa|ae|kw|qa|bh|om/i.test(v.lang.split("-")[1] || "")) sc += 3; // لهجة خليجية
    if (/natural|online|neural/i.test(n)) sc += 2;                     // أصوات أوضح
    if (/google/i.test(n)) sc += 1;
    return sc;
  };
  _voice = [...all].sort((a, b) => score(b) - score(a))[0];
  _voice._female = FEMALE_AR.some((f) => nm(_voice).includes(f)) || /google/i.test(nm(_voice));
  return _voice;
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  try { window.speechSynthesis.onvoiceschanged = () => { _voice = null; pickVoice(); }; } catch {}
}

// ================= الصوت النسائي من الإنترنت (/api/tts) =================
// يقسّم النص لمقاطع ≤ 180 حرف عند نهايات الجمل ويشغّلها بالتتابع
function chunkText(text, max = 180) {
  const parts = String(text).split(/(?<=[.!؟،,:\n])\s+/);
  const out = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length <= max) cur = (cur + " " + p).trim();
    else {
      if (cur) out.push(cur);
      let rest = p;
      while (rest.length > max) { const cut = rest.lastIndexOf(" ", max) > 40 ? rest.lastIndexOf(" ", max) : max; out.push(rest.slice(0, cut)); rest = rest.slice(cut).trim(); }
      cur = rest;
    }
  }
  if (cur) out.push(cur);
  return out;
}
let _onlineOk = true; // يتعطّل بعد فشل الخدمة، فنرجع لصوت الجهاز
let _audio = null;
function stopOnline() { try { if (_audio) { _audio.pause(); _audio.src = ""; } } catch {} _audio = null; }
// يرجع Promise: تنجح عند انتهاء النطق، وتُرفض بـ "blocked" (منع المتصفح قبل التفاعل) أو "failed"
function playOnline(text, { onStart } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = chunkText(text).slice(0, 6);
    let i = 0;
    stopOnline();
    const next = () => {
      if (i >= chunks.length) { _audio = null; resolve(); return; }
      const a = new Audio(`/api/tts?q=${encodeURIComponent(chunks[i++])}`);
      a.preload = "auto";
      _audio = a;
      a.onended = next;
      a.onerror = () => { if (_audio === a) { _audio = null; reject(new Error("failed")); } };
      a.play().then(() => { if (i === 1) onStart?.(); }).catch((e) => {
        if (_audio !== a) return;
        _audio = null;
        reject(new Error(e?.name === "NotAllowedError" ? "blocked" : "failed"));
      });
    };
    next();
  });
}

// انتظار إغلاق نوافذ الترحيب الأصلية في النظام (الحمد لله على السلامة / تهنئة المناسبات) قبل أن تتكلم أمل
function afterOverlays(fn, tries = 240) {
  if (typeof document === "undefined") return fn();
  if (!document.querySelector(".wg-overlay") || tries <= 0) return fn();
  setTimeout(() => afterOverlays(fn, tries - 1), 500);
}

// مزاج الرد في الشات بحسب محتواه
function moodOfReply(r) {
  if (r.mood) return r.mood;
  const t = String(r.text || "");
  if (/🎉|محققة/.test(t)) return "celebrate";
  if (/✅|👏|👌|💪/.test(t)) return "happy";
  if (/متأخرة|متعثر|عائق|ما عندك صلاحية/.test(t)) return "concerned";
  if (/ما فهمت/.test(t)) return "thinking";
  return "talk";
}
// نص صالح للنطق (بلا رموز تعبيرية وروابط)
const speakable = (s) => String(s || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").replace(/[•«»]/g, "").replace(/\n+/g, ". ").trim();

// «أمل»: شخصية حيّة في زاوية الشاشة + نافذة محادثة تجيب من بيانات النظام بحسب صلاحيات المستخدم
export default function AmalAssistant() {
  const { viewer, role, can, users, projects, scopeProjects, ready } = useRole();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mood, setMoodState] = useState("idle");
  const [bubble, setBubble] = useState(null); // { text, chips, key }
  const [mini, setMini] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState("auto"); // auto: اللحظات المهمة فقط | on: كل الكلام | off: صامتة
  const [sleeping, setSleeping] = useState(false);
  const [burst, setBurst] = useState(0);
  const [canSpeak, setCanSpeak] = useState(false);
  const [tour, setTour] = useState(null);       // { steps, key }
  const [tourStepId, setTourStepId] = useState(null);
  const [pos, setPos] = useState(null);         // موضع مخصص بعد السحب (null = وسط الشاشة)
  const drag = useRef(null);
  const tourActive = useRef(false);

  const data = useRef({ at: 0, scopeKey: "" });
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const charRef = useRef(null);
  const moodTimer = useRef(null);
  const bubbleTimer = useRef(null);
  const bubbleHover = useRef(false);
  const lastActive = useRef(Date.now());
  const lastTip = useRef(Date.now());
  const openRef = useRef(false);
  const voiceRef = useRef("auto");
  openRef.current = open;
  tourActive.current = !!tour;
  voiceRef.current = voice;

  const scopeKey = `${viewer?.id || ""}|${(scopeProjects || []).join(",")}`;

  // ---------- التفضيلات وقدرات المتصفح ----------
  useEffect(() => {
    setMini(pref.get("mini", false));
    setMuted(pref.get("muted", false));
    try { const v = window.localStorage.getItem("amal_voice_mode"); if (v === "on" || v === "off" || v === "auto") setVoice(v); } catch {}
    try { const p = JSON.parse(window.localStorage.getItem("amal_pos") || "null"); if (p && typeof p.x === "number") setPos(p); } catch {}
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  // ---------- البيانات ----------
  const inflight = useRef(null);
  const loadData = useCallback((force = false) => {
    const d = data.current;
    if (!force && d.scopeKey === scopeKey && Date.now() - d.at < STALE_MS) return Promise.resolve(d);
    if (inflight.current?.key === scopeKey) return inflight.current.p;
    const p = fetchData().finally(() => { inflight.current = null; });
    inflight.current = { key: scopeKey, p };
    return p;
  }, [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    const inScope = (p) => !scopeProjects || scopeProjects.includes(p);
    const [tasks, meetings, kpis, leaves, invoices, payments] = await Promise.all([
      can("tasks") ? tasksStore.list().catch(() => []) : [],
      can("meetings") ? meetingsStore.list().catch(() => []) : [],
      can("kpis") ? kpisStore.list().catch(() => []) : [],
      leavesApi.list().catch(() => []),
      can("finance") ? invoicesStore.list().catch(() => []) : [],
      can("finance") ? paymentsStore.list().catch(() => []) : [],
    ]);
    data.current = {
      at: Date.now(),
      scopeKey,
      tasks: tasks.filter((t) => inScope(t.project)),
      // اجتماع بلا مشروع: يظهر لغير العملاء فقط
      meetings: meetings.filter((m) => (m.project ? inScope(m.project) : role !== "client")),
      kpis: kpis.filter((k) => !k.project || inScope(k.project)),
      leaves: can("leaves") ? leaves : [],
      myLeaves: leaves.filter((l) => l.person === viewer?.name),
      invoices: invoices.filter((v) => !v.project || inScope(v.project)),
      payments,
    };
    return data.current;
  };

  const ctxOf = useCallback((d) => ({
    viewer, role, can, users, scopeProjects,
    projects: (projects || []).filter((p) => !scopeProjects || scopeProjects.includes(p.name)),
    ...d,
  }), [viewer, role, can, users, projects, scopeProjects]);

  // ---------- المزاج والفقاعة والصوت ----------
  const setMood = useCallback((m, hold = false) => {
    clearTimeout(moodTimer.current);
    setMoodState(m);
    if (m === "celebrate") setBurst((b) => b + 1);
    if (!hold && m !== "idle") moodTimer.current = setTimeout(() => setMoodState("idle"), MOOD_MS);
  }, []);

  // النطق بصوت أنثوي. المتصفحات تمنع الصوت قبل أول تفاعل من المستخدم،
  // فإن رُفض نؤجّله لأول نقرة/ضغطة زر (مثل ترحيب الدخول)
  const pendingSpeech = useRef(null);
  // important: الترحيب وإنجاز المهام والشكر والتحيات — تُنطق تلقائياً؛ والباقي فقط إذا فُعّل «كل الكلام»
  const speak = useCallback((s, { defer = false, important = false } = {}) => {
    const mode = voiceRef.current;
    if (mode === "off" || (mode === "auto" && !important)) return;
    if (typeof window === "undefined") return;
    const text = speakable(s);
    if (!text) return;
    // أولاً: الصوت النسائي من الإنترنت
    if (_onlineOk) {
      try { window.speechSynthesis?.cancel(); } catch {}
      if (defer) pendingSpeech.current = s;
      playOnline(text, { onStart: () => { pendingSpeech.current = null; setMood("talk", true); } })
        .then(() => setMood("idle"))
        .catch((e) => {
          if (e.message === "blocked") { if (defer) pendingSpeech.current = s; return; }
          _onlineOk = false; // الخدمة غير متاحة → صوت الجهاز
          speak(s, { defer, important });
        });
      return;
    }
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 450));
      const v = _voice || pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "ar-SA";
      // إذا ما توفر صوت نسائي في الجهاز نرفع طبقة الصوت ليقترب من صوت أنثوي
      u.pitch = v && v._female ? 1.05 : 1.35;
      u.rate = 0.98;
      u.onstart = () => { pendingSpeech.current = null; setMood("talk", true); };
      u.onend = () => setMood("idle");
      u.onerror = (e) => {
        if (defer && (e.error === "not-allowed" || e.error === "interrupted" || e.error === "canceled")) pendingSpeech.current = s;
      };
      if (defer) pendingSpeech.current = s; // يُمسح عند بدء النطق فعلاً
      window.speechSynthesis.speak(u);
    } catch {}
  }, [setMood]);

  // نطق المؤجَّل عند أول تفاعل
  useEffect(() => {
    const go = () => {
      const s = pendingSpeech.current;
      if (!s) return;
      pendingSpeech.current = null;
      setTimeout(() => speak(s, { important: true }), 30);
    };
    window.addEventListener("pointerdown", go, true);
    window.addEventListener("keydown", go, true);
    return () => { window.removeEventListener("pointerdown", go, true); window.removeEventListener("keydown", go, true); };
  }, [speak]);

  const say = useCallback((r, { force = false } = {}) => {
    if (!r || !r.text) return;
    if (r.mood) setMood(r.mood);
    if (openRef.current) return; // داخل الشات لا نعرض فقاعات
    if (muted && !force && !r.important) return;
    clearTimeout(bubbleTimer.current);
    setBubble({ text: r.text, chips: (r.chips || []).slice(0, 2), key: Date.now() });
    speak(r.speech || r.text, { defer: !!r.speech, important: !!r.important });
    const hide = () => {
      if (bubbleHover.current) { bubbleTimer.current = setTimeout(hide, 2500); return; }
      setBubble(null);
    };
    bubbleTimer.current = setTimeout(hide, BUBBLE_MS + Math.min(6000, r.text.length * 40));
  }, [muted, setMood, speak]);

  // تحميل البيانات مبكراً حتى تظهر النصائح فوراً
  useEffect(() => {
    if (ready && viewer) loadData().catch(() => {});
  }, [ready, viewer?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // بيانات جاهزة فوراً (المخزّنة إن وُجدت) مع تحديث في الخلفية
  const quickData = useCallback(async () => {
    const d = data.current;
    if (d.at && d.scopeKey === scopeKey) {
      if (Date.now() - d.at > STALE_MS) loadData().catch(() => {});
      return d;
    }
    return loadData();
  }, [loadData, scopeKey]);

  // ---------- الترحيب عند الدخول ----------
  useEffect(() => {
    if (!ready || !viewer) return;
    const t = setTimeout(async () => {
      const d = await quickData().catch(() => null);
      if (!d) return;
      const k = `welcome_${viewer.id}`;
      if (!once.has(k)) {
        once.mark(k);
        recent.mark(`tip_${path}`);
        // موظف جديد: تعرّفه على نفسها ثم تبدأ الجولة مباشرة
        if (!pref.get(`tour_${viewer.id}`, false) && isNewEmployee(viewer)) {
          afterOverlays(() => setTimeout(() => startTourRef.current("full"), 200));
          return;
        }
        // داخل في إجازته/أوفه، أو مريض، أو راجع من إجازة
        const first = role === "client" ? "" : String(viewer.name || "").split(" ")[0];
        const hello = `${timeGreeting()}${first ? ` يا ${first}` : ""}`;
        const leaveMsg = leaveGreeting(viewer, d.myLeaves);
        const greet = leaveMsg
          ? { ...leaveMsg, important: true, speech: `${hello}. ${leaveMsg.text}` }
          : { ...welcome(ctxOf(d)), important: true, speech: `${hello}. أنا أمل، مساعدتك الذكية في النظام. أتابع معك المهام والمشاريع والاجتماعات، وأجاوب على أسئلتك، وأقدر أنشئ لك مهام. اضغط عليّ متى ما احتجتني.` };
        afterOverlays(() => say(greet, { force: true }));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [ready, viewer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- نصيحة لكل صفحة (مرة واحدة في الجلسة) ----------
  useEffect(() => {
    if (!ready || !viewer) return;
    setBubble(null);
    const t = setTimeout(async () => {
      // الترحيب أولاً: لا نعرض نصيحة الصفحة قبل ما تقول أمل ترحيبها
      if (!once.has(`welcome_${viewer.id}`)) return;
      if (openRef.current || tourActive.current || recent.is(`tip_${path}`, TIP_REPEAT)) return;
      const d = await quickData().catch(() => null);
      if (!d) return;
      const tip = pageTip(path, ctxOf(d));
      recent.mark(`tip_${path}`);
      if (tip) { lastTip.current = Date.now(); say(tip); }
    }, 150);
    return () => clearTimeout(t);
  }, [path, ready, viewer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- ردود الفعل على أحداث النظام ----------
  useEffect(() => {
    if (!viewer) return;
    return onDataChange((evt) => {
      data.current.at = 0;
      const r = reactionFor(evt, viewer);
      if (r) { lastActive.current = Date.now(); setSleeping(false); say(r); }
    });
  }, [viewer, say]);

  // ---------- الخمول: تلميحات ثم نوم، والاستيقاظ عند العودة ----------
  useEffect(() => {
    if (!viewer) return;
    const wake = () => {
      const was = Date.now() - lastActive.current;
      lastActive.current = Date.now();
      setSleeping((s) => {
        if (s && was > SLEEP_AFTER) {
          setTimeout(() => say({ mood: "wave", text: `${timeGreeting()}! رجعت 😊 لو احتجت شي أنا هنا.` }), 50);
        }
        return false;
      });
    };
    const evs = ["mousemove", "keydown", "scroll", "touchstart", "click"];
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    const iv = setInterval(() => {
      const idle = Date.now() - lastActive.current;
      if (openRef.current) return;
      if (idle > SLEEP_AFTER) { setSleeping(true); setBubble(null); return; }
      if (idle > TIP_AFTER && Date.now() - lastTip.current > TIP_GAP) {
        lastTip.current = Date.now();
        const tip = IDLE_TIPS[Math.floor(Math.random() * IDLE_TIPS.length)];
        say({ mood: "idle", ...tip, chips: tip.chips.filter((c) => c !== "أنشئ مهمة" || can("tasks", "edit")) });
      }
    }, 10000);
    return () => { evs.forEach((e) => window.removeEventListener(e, wake)); clearInterval(iv); };
  }, [viewer, say, can]);

  // ---------- الالتفات نحو المؤشر ----------
  useEffect(() => {
    let raf = 0;
    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = charRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
        const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 3)) / (window.innerHeight / 2)));
        el.style.setProperty("--ry", `${(dx * 9).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${(-dy * 4).toFixed(2)}deg`);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, []);

  // ---------- طلب من أي مكان في النظام: window.dispatchEvent(new CustomEvent("amal:ask", { detail })) ----------
  useEffect(() => {
    const onAsk = async (e) => {
      const { text: q, task } = e.detail || {};
      setOpen(true);
      if (task) {
        const label = String(task.task || "").trim().slice(0, 50) || "المهمة";
        setMsgs((m) => [...(m.length ? m : []), { from: "me", text: `لخّصي لي «${label}»` }]);
        setBusy(true);
        setMood("thinking", true);
        const comments = await commentsStore.list(task.id).catch(() => []);
        const r = summarizeTask(task, comments);
        setTimeout(() => {
          setBusy(false);
          setMsgs((m) => [...m, { from: "amal", ...r, chips: ["وش ينتظر الاعتماد؟", "المهام المتأخرة"] }]);
          setMood(r.mood || "talk");
          speak(r.text);
        }, 450);
      } else if (q) {
        setTimeout(() => askRef.current(q), 60);
      }
    };
    window.addEventListener("amal:ask", onAsk);
    return () => window.removeEventListener("amal:ask", onAsk);
  }, [setMood, speak]);

  // ---------- الشات ----------
  useEffect(() => {
    if (!open || msgs.length) return;
    const first = role === "client" ? "" : (viewer?.name || "").split(" ")[0];
    setMsgs([{
      from: "amal",
      text: `${timeGreeting()}${first ? ` ${first}` : ""} 👋 أنا ${AMAL_NAME}، مساعدتك في النظام. أجاوبك من بيانات المهام والمشاريع والاجتماعات بحسب صلاحياتك. وش تحتاج؟`,
      chips: suggestions({ viewer, role, can }).slice(0, 6),
    }]);
    loadData().catch(() => {});
  }, [open, msgs.length, viewer, role, can, loadData]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  useEffect(() => {
    if (!open) return;
    setBubble(null);
    setSleeping(false);
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // تغيّر المستخدم (تبديل الحساب) → محادثة جديدة
  useEffect(() => { setMsgs([]); data.current = { at: 0, scopeKey: "" }; }, [viewer?.id]);

  function startTour(kind = "full") {
    const steps = kind === "page" ? tourFor(can, { path }) : tourFor(can);
    setOpen(false);
    setBubble(null);
    setSleeping(false);
    if (!steps.length) { say({ mood: "thinking", text: "ما عندي شرح مفصّل لهالصفحة للحين، بس تقدر تسألني عنها 😊" }, { force: true }); return; }
    const first = role === "client" ? "" : String(viewer?.name || "").split(" ")[0];
    const personal = steps.map((st) => ({ ...st, text: st.text.replace("{greet}", timeGreeting()).replace("{name}", first ? `يا ${first}` : "") }));
    setTour({ steps: personal, key: Date.now() });
  }
  function endTour(completed) {
    setTour(null);
    setTourStepId(null);
    if (viewer) pref.set(`tour_${viewer.id}`, true);
    say(completed
      ? { mood: "celebrate", important: true, text: "كفو! خلصت الجولة 🎉 صرت تعرف النظام. لو احتجت أي شي أنا هنا.", chips: ["وش علي اليوم؟", "ملخّص اليوم"] }
      : { mood: "idle", text: "تمام، وقفنا الجولة. تقدر ترجع لها بأي وقت: قل لي «سوي لي جولة»." }, { force: true });
  }
  function onChip(c) {
    setBubble(null);
    if (c === "لاحقاً") { if (viewer) pref.set(`tour_${viewer.id}`, true); say({ mood: "idle", text: "ولا يهمك، متى ما حبيت قل لي «سوي لي جولة» 😊" }, { force: true }); return; }
    if (c === "ابدأ الجولة") { startTour("full"); return; }
    ask(c);
  }
  const startTourRef = useRef(startTour);
  startTourRef.current = startTour;
  useEffect(() => {
    const onTour = (e) => startTourRef.current(e.detail?.kind || "full");
    window.addEventListener("amal:tour", onTour);
    return () => window.removeEventListener("amal:tour", onTour);
  }, []);

  // ---------- السحب لتغيير المكان (النقر بدون سحب يفتح الشات) ----------
  function onDragStart(e) {
    if (e.button != null && e.button !== 0) return;
    const dock = e.currentTarget.closest(".amal-dock");
    const r = dock.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onDragMove(e) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const x = Math.max(4, Math.min(window.innerWidth - 120, d.ox + dx));
    const y = Math.max(4, Math.min(window.innerHeight - 120, d.oy + dy));
    setPos({ x, y });
  }
  function onDragEnd() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      setPos((p) => { try { window.localStorage.setItem("amal_pos", JSON.stringify(p)); } catch {} return p; });
      return;
    }
    lastActive.current = Date.now(); setSleeping(false); setOpen(true);
  }
  function resetPos() {
    setPos(null);
    try { window.localStorage.removeItem("amal_pos"); } catch {}
  }

  async function ask(q) {
    const question = String(q || "").trim();
    if (!question || busy) return;
    setText("");
    setOpen(true);
    setMsgs((m) => [...m, { from: "me", text: question }]);
    setBusy(true);
    setMood("thinking", true);
    try {
      const d = await loadData();
      const reply = answer(question, ctxOf(d));
      // لحظة «تفكير» قصيرة تعطي إحساساً طبيعياً
      await new Promise((r) => setTimeout(r, 380 + Math.min(500, String(reply.text || "").length * 2)));
      setMsgs((m) => [...m, { from: "amal", ...reply }]);
      setMood(moodOfReply(reply));
      speak(reply.text);
      if (reply.action?.type === "tour") setTimeout(() => startTourRef.current("full"), 900);
      if (reply.action?.type === "pageTour") setTimeout(() => startTourRef.current("page"), 900);
    } catch {
      setMsgs((m) => [...m, { from: "amal", text: "صار خطأ وأنا أقرأ البيانات، جرّب مرة ثانية بعد شوي." }]);
      setMood("concerned");
    } finally {
      setBusy(false);
    }
  }
  const askRef = useRef(ask);
  askRef.current = ask;

  async function createTask(idx, draft) {
    const payload = {
      activity: "", deliverable: "", progress: 0, on_hold: false, waiting_on: "", blocker: "", approval_status: "",
      status: "Not Started", health: "On Track", chain: [],
      task: draft.task.trim(),
      project: draft.project || "",
      assigned_to: draft.assigned_to || "",
      holder: draft.assigned_to || "",
      due_date: draft.due_date || null,
      priority: draft.priority || "Medium",
      notes: `أُنشئت عبر المساعدة ${AMAL_NAME} بطلب من ${viewer?.name || "مستخدم"}`,
    };
    const rec = await tasksStore.create(payload);
    data.current.at = 0;
    setMood("celebrate");
    speak("تم إنشاء المهمة", { important: true });
    setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, action: { ...x.action, done: true } } : x)).concat({
      from: "amal",
      text: "تم إنشاء المهمة ✅",
      items: [taskItem(rec || payload)],
    }));
  }

  function cancelAction(idx) {
    setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, action: { ...x.action, cancelled: true } } : x)).concat({ from: "amal", text: "تمام، ألغيت الطلب." }));
  }


  function toggle(k) {
    if (k === "voice") {
      const next = { auto: "on", on: "off", off: "auto" }[voice] || "auto";
      setVoice(next);
      voiceRef.current = next;
      try { window.localStorage.setItem("amal_voice_mode", next); } catch {}
      if (next === "off") { try { window.speechSynthesis?.cancel(); } catch {} stopOnline(); }
      if (next === "on") speak("تمام، بتكلم معك في كل شي", { important: true });
      if (next === "auto") speak("بتكلم بس في الترحيب وإنجاز المهام", { important: true });
    }
    if (k === "muted") { const v = !muted; setMuted(v); pref.set("muted", v); if (v) setBubble(null); }
    if (k === "mini") { const v = !mini; setMini(v); pref.set("mini", v); setBubble(null); }
  }

  if (!ready || !viewer) return null;

  const liveMood = sleeping && !open ? "sleep" : busy ? "thinking" : mood;
  const status = busy ? "تفكّر…" : liveMood === "talk" ? "تتكلم…" : "متصلة الآن";

  return (
    <>
      {tour && <AmalTour key={tour.key} steps={tour.steps} face={FACE} full={FULL} onEnd={endTour} onStep={(st, idx) => { setTourStepId(st.id); setMood(st.mood || "talk"); speak(`${st.title}. ${st.text}`, { defer: idx === 0, important: st.id === "meet" }); }} />}
      {!open && (!tour || tourStepId === "amal") && (
        <div
          className={`amal-dock ${mini ? "is-mini" : ""} ${pos ? "is-placed" : "is-center"}`}
          style={pos ? { left: pos.x, top: pos.y } : undefined}
        >
          {bubble && (
            <div
              key={bubble.key}
              className="amal-say"
              onMouseEnter={() => { bubbleHover.current = true; }}
              onMouseLeave={() => { bubbleHover.current = false; }}
            >
              <button className="amal-say-x" type="button" onClick={() => setBubble(null)} aria-label="إخفاء"><Icon name="close" size={12} /></button>
              <div className="amal-say-txt">{bubble.text}</div>
              {bubble.chips?.length > 0 && (
                <div className="amal-chips">
                  {bubble.chips.map((c) => <button key={c} type="button" onClick={() => onChip(c)}>{c}</button>)}
                </div>
              )}
            </div>
          )}

          {mini ? (
            <button
              className={`amal-mini mood-${liveMood}`} type="button"
              onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={() => { drag.current = null; }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
              title={`اسأل ${AMAL_NAME} — اسحبها لتغيير مكانها`}
            >
              <img src={FACE} alt="" />
              <span className="amal-tag-name">{AMAL_NAME} <span className="amal-ai">AI</span></span>
              {liveMood === "sleep" && <span className="amal-z">z</span>}
            </button>
          ) : (
            <div className={`amal-char mood-${liveMood}`} ref={charRef}>
              <button className="amal-char-min" type="button" onClick={() => toggle("mini")} title="تصغير أمل">
                <Icon name="close" size={11} />
              </button>
              <button
                className="amal-char-btn" type="button"
                onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={() => { drag.current = null; }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
                title={`اسأل ${AMAL_NAME} — اسحبها لتغيير مكانها`} aria-label={`فتح المساعدة ${AMAL_NAME}`}
              >
                <span className="amal-shadow" />
                <img className="amal-body" src={FULL} alt={`${AMAL_NAME} — المساعدة الذكية`} draggable={false} />
                <span className="amal-tag-name">{AMAL_NAME} <span className="amal-ai">AI</span></span>
              </button>
              {liveMood === "sleep" && <span className="amal-zzz"><i>z</i><i>z</i><i>Z</i></span>}
              {liveMood === "thinking" && <span className="amal-think"><i /><i /><i /></span>}
              {liveMood === "listen" && <span className="amal-ring" />}
              {burst > 0 && liveMood === "celebrate" && <Confetti key={burst} />}
            </div>
          )}
        </div>
      )}

      {open && (
        <div className={`amal-panel mood-${liveMood}`} role="dialog" aria-label={`المساعدة ${AMAL_NAME}`}>
          <div className="amal-head">
            <span className="amal-face">
              <img src={FACE} alt="" />
              <span className="amal-dot" />
            </span>
            <div className="amal-who">
              <b>{AMAL_NAME} <span className="amal-ai">AI</span> <span className="amal-badge">مساعد</span></b>
              <small>{status}</small>
            </div>
            {canSpeak && (
              <button
                className={`amal-x amal-voice ${voice === "on" ? "on" : ""}`} type="button" onClick={() => toggle("voice")}
                title={{ auto: "الصوت: تلقائي (الترحيب وإنجاز المهام فقط) — اضغط لتشغيل كل الكلام", on: "الصوت: كل الكلام — اضغط لكتم الصوت", off: "الصوت: صامتة — اضغط للوضع التلقائي" }[voice]}
              >
                <Icon name={voice === "off" ? "mute" : "volume"} size={16} />
                {voice === "auto" && <span className="amal-vtag">A</span>}
              </button>
            )}
            <button className={`amal-x ${muted ? "" : "on"}`} type="button" onClick={() => toggle("muted")} title={muted ? "تشغيل نصائح أمل" : "إيقاف نصائح أمل"}>
              <Icon name="bulb" size={16} />
            </button>
            <button className="amal-x" type="button" onClick={() => { setMsgs([]); data.current.at = 0; }} title="محادثة جديدة">
              <Icon name="plus" size={16} />
            </button>
            <button className="amal-x" type="button" onClick={() => setOpen(false)} title="إغلاق">
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="amal-list" ref={listRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`amal-msg ${m.from}`}>
                {m.from === "amal" && <img className="amal-msg-av" src={FACE} alt="" />}
                <div className="amal-msg-body">
                  {m.text && <div className="amal-bubble">{m.text}</div>}
                  {m.items?.length > 0 && (
                    <div className="amal-items">
                      {m.items.map((it, j) => (
                        <Link key={j} href={it.href || "#"} className="amal-item" onClick={() => setOpen(false)}>
                          <div className="amal-item-main">
                            <b>{it.title}</b>
                            {it.sub && <small>{it.sub}</small>}
                          </div>
                          {it.badge && (
                            <span className="amal-tag" style={{ color: it.badge.color, background: `${it.badge.color}14` }}>{it.badge.text}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.footer && <div className="amal-foot">{m.footer}</div>}
                  {m.link && (
                    <Link className="amal-link" href={m.link.href} onClick={() => setOpen(false)}>
                      {m.link.text} <Icon name="arrow" size={13} style={{ transform: "scaleX(-1)" }} />
                    </Link>
                  )}
                  {m.action?.type === "createTask" && !m.action.done && !m.action.cancelled && (
                    <TaskDraftCard action={m.action} onCreate={(d) => createTask(i, d)} onCancel={() => cancelAction(i)} />
                  )}
                  {m.chips?.length > 0 && i === msgs.length - 1 && (
                    <div className="amal-chips">
                      {m.chips.map((c) => (
                        <button key={c} type="button" onClick={() => ask(c)}>{c}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="amal-msg amal">
                <img className="amal-msg-av" src={FACE} alt="" />
                <div className="amal-msg-body"><div className="amal-bubble amal-typing"><span /><span /><span /></div></div>
              </div>
            )}
          </div>

          <form className="amal-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`اسأل ${AMAL_NAME}… مثلاً: وش المتأخر في هوميرا؟`}
            />
            <button className="btn primary" type="submit" disabled={!text.trim() || busy} title="إرسال">
              <Icon name="send" size={16} />
            </button>
          </form>
          <div className="amal-panel-foot">
            <button type="button" onClick={() => startTour("full")}>🧭 جولة تعريفية بالنظام</button>
            <button type="button" onClick={() => startTour("page")}>اشرحي هالصفحة</button>
            <button type="button" onClick={() => toggle("mini")}>{mini ? "إظهار أمل كاملة" : "تصغير أمل"}</button>
            {pos && <button type="button" onClick={resetPos}>إرجاعها للوسط</button>}
          </div>
        </div>
      )}
    </>
  );
}

// قصاصات احتفال خفيفة
function Confetti() {
  const colors = ["#7c3aed", "#e05a50", "#16a34a", "#f59e0b", "#2563eb", "#db2777"];
  const bits = Array.from({ length: 22 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 22 + Math.random() * 0.4;
    const d = 60 + Math.random() * 70;
    return {
      x: Math.cos(a) * d, y: Math.sin(a) * d - 60, r: Math.random() * 540 - 270,
      c: colors[i % colors.length], delay: Math.random() * 0.12, w: 5 + Math.random() * 4,
    };
  });
  return (
    <span className="amal-confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{ "--x": `${b.x}px`, "--y": `${b.y}px`, "--r": `${b.r}deg`, background: b.c, animationDelay: `${b.delay}s`, width: b.w, height: b.w * 1.6 }} />
      ))}
    </span>
  );
}

function TaskDraftCard({ action, onCreate, onCancel }) {
  const [d, setD] = useState(action.draft);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setD((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!d.task.trim()) { setErr("اكتب عنوان المهمة"); return; }
    setSaving(true);
    setErr("");
    try {
      await onCreate(d);
    } catch (ex) {
      setErr(ex?.message || "تعذّر إنشاء المهمة");
      setSaving(false);
    }
  }

  return (
    <form className="amal-card" onSubmit={submit}>
      <label>عنوان المهمة
        <input value={d.task} onChange={set("task")} placeholder="مثلاً: تصميم بوست اليوم الوطني" autoFocus />
      </label>
      <div className="amal-row">
        <label>المشروع
          <select value={d.project} onChange={set("project")}>
            <option value="">— بدون —</option>
            {action.projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>المسؤول
          <select value={d.assigned_to} onChange={set("assigned_to")}>
            <option value="">— غير محدد —</option>
            {action.users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>
      <div className="amal-row">
        <label>الاستحقاق
          <input type="date" value={d.due_date} onChange={set("due_date")} />
        </label>
        <label>الأولوية
          <select value={d.priority} onChange={set("priority")}>
            {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
      {err && <div className="amal-err">{err}</div>}
      <div className="amal-actions">
        <button className="btn primary sm" type="submit" disabled={saving}>{saving ? "جارٍ الإنشاء…" : "إنشاء"}</button>
        <button className="btn ghost sm" type="button" onClick={onCancel} disabled={saving}>إلغاء</button>
      </div>
    </form>
  );
}
