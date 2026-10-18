"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tasksStore, appSettings, isCloud } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { useSettings, brandTitle } from "@/components/SettingsProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { driveSim } from "@/lib/driveSim";
import { driveReal, driveStatus, driveConnect, driveFinish, driveDisconnect } from "@/lib/driveClient";
import { drivePathFor, DRIVE_CATEGORIES, TASKS_FOLDER, FINANCE_CATEGORIES } from "@/lib/drivePaths";

const MAP_KEY = "drive_map"; // { [اسم المشروع]: معرّف مجلده في Drive }

function fmtSize(n) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
const fileIcon = (mime = "") => (mime.startsWith("image/") ? "🖼️" : mime.includes("pdf") ? "📕" : /sheet|excel|csv/.test(mime) ? "📊" : /word|document/.test(mime) ? "📄" : /presentation|powerpoint/.test(mime) ? "📽️" : mime.startsWith("video/") ? "🎬" : "📎");

// Google Drive: الرفع يروح تلقائياً لمجلد المشروع والتصنيف (أو مجلد المهمة).
// يعمل على Drive الحقيقي متى ما رُبط حساب Google (أو حساب خدمة)، وإلا كبيئة اختبار داخل المتصفح.
export default function DrivePage() {
  const { viewer, projects, scopeProjects, can, canFinance, taskVisible } = useRole();
  const { settings } = useSettings();
  const [status, setStatus] = useState(null); // حالة الربط من الخادم
  const canEdit = can("drive", "edit");
  const canMap = canEdit && can("settings", "edit");
  const [mode, setMode] = useState(null); // real | sim
  const rootName = (mode === "real" && status?.rootName) || brandTitle(settings) || "سيم برايم";
  const drive = mode === "real" ? driveReal : driveSim;
  const [map, setMap] = useState({});
  const [folder, setFolder] = useState("root");
  const [trail, setTrail] = useState([]);
  const [items, setItems] = useState(null);
  const [stats, setStats] = useState(null);
  const [modal, setModal] = useState(""); // upload | map | connect
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState(null);
  const hereRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    if (!isCloud) { setMode("sim"); return; }
    const st = await driveStatus();
    setStatus(st);
    setMode(st.ready ? "real" : "sim");
  }, []);

  useEffect(() => {
    appSettings.get(MAP_KEY).then((v) => setMap(v && typeof v === "object" ? v : {})).catch(() => {});
    // الرجوع من صفحة موافقة Google: إكمال الربط ثم تنظيف الرابط
    const qs = new URLSearchParams(window.location.search);
    const code = qs.get("code"), state = qs.get("state");
    if (code || qs.get("error")) window.history.replaceState(null, "", "/drive");
    (async () => {
      if (code && state && isCloud) {
        try {
          const r = await driveFinish(code, state);
          setFlash({ note: `تم ربط حساب Google (${r.account}) — المجلد الرئيسي: ${r.rootName}` });
        } catch (e) {
          setErr(e?.message || "تعذّر إكمال الربط.");
        }
      } else if (qs.get("error")) setErr("تم إلغاء الربط من صفحة Google.");
      await refreshStatus();
    })();
  }, [refreshStatus]);

  async function disconnect() {
    if (!confirm(`إلغاء ربط حساب Google${status?.account ? ` (${status.account})` : ""}؟\n\nالملفات تبقى في Drive كما هي، لكن النظام ما يقدر يوصل لها لين يُعاد الربط.`)) return;
    await run("disconnect", async () => { await driveDisconnect(); setFolder("root"); await refreshStatus(); });
  }

  const myProjects = useMemo(() => (projects || []).map((p) => p.name).filter((n) => !scopeProjects || scopeProjects.includes(n)), [projects, scopeProjects]);
  // المشروع المقابل لمجلد في الجذر: بالربط أولاً ثم بتطابق الاسم
  const projectOf = useCallback((f) => (f ? Object.keys(map).find((p) => map[p] === f.id) || f.name : ""), [map]);

  const load = useCallback(async (id = folder) => {
    if (!mode) return;
    setErr("");
    try {
      const r = await drive.folder(id);
      setItems(r.items);
      setTrail(r.trail);
      if (mode === "sim") setStats(await driveSim.stats());
    } catch (e) {
      setItems([]);
      setErr(e?.message || "تعذّر فتح المجلد.");
    }
  }, [folder, mode, drive]);
  useEffect(() => { load(); }, [load]);

  // النطاق: مجلدات المشاريع خارج نطاق الموظف لا تظهر، ومجلد الفواتير لمن له صلاحية المالية فقط
  const projectName = projectOf(trail[0]);
  const visibleItems = (items || []).filter((x) => {
    if (folder === "root") return x.kind === "file" ? !scopeProjects : !scopeProjects || myProjects.includes(projectOf(x));
    if (trail.length === 1 && x.kind === "folder" && FINANCE_CATEGORIES.includes(x.name)) return canFinance;
    return true;
  });
  const blocked = scopeProjects && projectName && !myProjects.includes(projectName);

  // مكان الرفع: مجلد المشروع المربوط إن وُجد، وإلا مجلد باسم المشروع داخل الجذر
  const target = (names) => (map[names[0]] ? { parent: map[names[0]], rest: names.slice(1) } : { parent: "root", rest: names });

  async function run(kind, fn) {
    setBusy(kind);
    setErr("");
    try { await fn(); } catch (e) { setErr(e?.message || "حدث خطأ."); } finally { setBusy(""); }
  }

  const prepare = () => run("prepare", async () => {
    for (const p of myProjects) {
      const base = map[p] || (await drive.ensurePath([p], viewer?.name, "root"));
      for (const c of DRIVE_CATEGORIES) await drive.ensurePath([c], viewer?.name, base);
      await drive.ensurePath([TASKS_FOLDER], viewer?.name, base);
    }
    await load();
  });

  const uploadHere = (list) => run("here", async () => {
    const files = Array.from(list || []);
    if (!files.length) return;
    for (const f of files) await drive.uploadTo(folder, f, viewer?.name);
    setFlash({ name: files.length > 1 ? `${files.length} ملفات` : files[0].name, path: [rootName, ...trail.map((t) => t.name)] });
    await load();
  });

  const del = (x) => {
    if (!confirm(`حذف ${x.kind === "folder" ? "المجلد وكل ما فيه" : "الملف"}؟\n\n${x.name}${mode === "real" ? "\n\n(ينتقل لسلة المحذوفات في Drive ويمكن استرجاعه)" : ""}`)) return;
    run("del", async () => { await drive.remove(x.id); await load(); });
  };

  async function reset() {
    if (!confirm("تفريغ بيئة الاختبار بالكامل؟ (يحذف كل المجلدات والملفات التجريبية من متصفحك)")) return;
    await driveSim.reset();
    setFolder("root");
    setFlash(null);
    await load("root");
  }

  if (!mode) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      {mode === "real" ? (
        <div className="drv-banner live">
          <Icon name="check" size={18} />
          <div>
            <b>مربوط بـ Google Drive{status?.account ? ` — ${status.account}` : ""}</b>
            <span>الملفات ترتفع لمجلد «{rootName}» في Drive مباشرة وتترتب تلقائياً: <b>المشروع ← التصنيف</b> أو <b>المشروع ← المهام ← اسم المهمة</b>. الحذف ينقلها لسلة المحذوفات في Drive.</span>
          </div>
          {status?.canConnect && <button className="btn sm ghost" style={{ marginInlineStart: "auto" }} disabled={busy === "disconnect"} onClick={disconnect}>إلغاء الربط</button>}
        </div>
      ) : (
        <div className="drv-banner">
          <Icon name="alert" size={18} />
          <div>
            <b>بيئة اختبار — محاكاة لـ Google Drive</b>
            <span>Drive الحقيقي غير مربوط بعد. الملفات هنا محفوظة في متصفحك فقط، ولا تُرفع لـ Drive ولا لقاعدة البيانات. الترتيب نفسه اللي بيطبّقه النظام بعد الربط: <b>المشروع ← التصنيف</b> أو <b>المشروع ← المهام ← اسم المهمة</b>.</span>
            {status?.admin && !status?.canConnect && <span>لربط Drive الحقيقي: أضف <code>GOOGLE_OAUTH_CLIENT_ID</code> و <code>GOOGLE_OAUTH_CLIENT_SECRET</code> في إعدادات Vercel (الخطوات في README).</span>}
          </div>
          {status?.canConnect && <button className="btn sm primary" style={{ marginInlineStart: "auto" }} onClick={() => setModal("connect")}><Icon name="link" size={14} /> ربط حساب Google</button>}
        </div>
      )}

      <div className="drv-bar">
        <div className="drv-crumbs">
          <button type="button" onClick={() => setFolder("root")} className={folder === "root" ? "on" : ""}>
            <Icon name="folder" size={15} /> {rootName}
          </button>
          {trail.map((t) => (
            <span key={t.id}>
              <i>‹</i>
              <button type="button" onClick={() => setFolder(t.id)} className={t.id === folder ? "on" : ""}>{t.name}</button>
            </span>
          ))}
        </div>
        <div style={{ marginInlineStart: "auto" }} />
        {stats && mode === "sim" && <span className="muted" style={{ fontSize: 12 }}>{stats.folders} مجلد · {stats.files} ملف · {fmtSize(stats.size)}</span>}
        {canEdit && mode === "sim" && <button className="btn sm ghost" onClick={reset}>تفريغ البيئة</button>}
        {canMap && <button className="btn sm" onClick={() => setModal("map")}><Icon name="link" size={14} /> ربط المشاريع بالمجلدات</button>}
        {canEdit && <button className="btn sm" disabled={busy === "prepare"} onClick={prepare}><Icon name="projects" size={14} /> {busy === "prepare" ? "جارٍ التجهيز…" : "تجهيز مجلدات المشاريع"}</button>}
        {canEdit && <button className="btn primary" onClick={() => setModal("upload")}><Icon name="upload" size={16} /> رفع ملف</button>}
      </div>

      {err && <div className="drv-err"><Icon name="alert" size={15} /> {err}</div>}
      {flash && (
        <div className="drv-flash">
          <Icon name="check" size={16} /> {flash.note ? flash.note : <>تم رفع <b>{flash.name}</b> إلى: <span className="drv-path">{flash.path.join(" / ")}</span></>}
          <button type="button" onClick={() => setFlash(null)} aria-label="إخفاء"><Icon name="close" size={13} /></button>
        </div>
      )}

      {blocked ? (
        <div className="empty">لا تملك صلاحية على مجلد هذا المشروع.</div>
      ) : items === null ? (
        <div className="empty">جاري التحميل…</div>
      ) : (
        <div className="card drv-box"
          onDragOver={(e) => { if (canEdit && folder !== "root") { e.preventDefault(); e.currentTarget.classList.add("drop"); } }}
          onDragLeave={(e) => e.currentTarget.classList.remove("drop")}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drop"); if (canEdit && folder !== "root") uploadHere(e.dataTransfer.files); }}>
          {visibleItems.length === 0 ? (
            <div className="empty" style={{ padding: "34px 0" }}>
              {folder === "root"
                ? <>لا مجلدات بعد. اضغط <b>«تجهيز مجلدات المشاريع»</b> أو ارفع ملفاً وبيتنشأ مجلده تلقائياً.</>
                : "المجلد فاضي — اسحب الملفات هنا أو استخدم «رفع هنا»."}
            </div>
          ) : (
            <>
              {visibleItems.some((x) => x.kind === "folder") && (
                <div className="drv-folders">
                  {visibleItems.filter((x) => x.kind === "folder").map((x) => (
                    <div key={x.id} className="drv-folder" onClick={() => setFolder(x.id)} role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") setFolder(x.id); }}>
                      <span className="ic"><Icon name="folder" size={20} /></span>
                      <b>{x.name}</b>
                      {folder === "root" && projectOf(x) !== x.name && <small className="muted">{projectOf(x)}</small>}
                      {canEdit && folder !== "root" && (
                        <button type="button" className="x" onClick={(e) => { e.stopPropagation(); del(x); }} title="حذف المجلد"><Icon name="trash" size={13} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {visibleItems.filter((x) => x.kind === "file").map((f) => (
                <div className="drv-file" key={f.id}>
                  <span className="emo">{fileIcon(f.mime)}</span>
                  <div className="body"><b>{f.name}</b><small>{fmtSize(f.size)}{f.created_at ? ` · ${new Date(f.created_at).toLocaleString("ar-SA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}{f.by ? ` · ${f.by}` : ""}</small></div>
                  <button className="btn sm" onClick={() => drive.open(f)}>فتح</button>
                  {canEdit && <button className="btn sm danger icon" onClick={() => del(f)} title="حذف"><Icon name="trash" size={14} /></button>}
                </div>
              ))}
            </>
          )}
          {canEdit && folder !== "root" && (
            <div className="drv-here">
              <input ref={hereRef} type="file" multiple hidden onChange={(e) => { uploadHere(e.target.files); e.target.value = ""; }} />
              <button className="btn sm ghost" disabled={busy === "here"} onClick={() => hereRef.current?.click()}><Icon name="upload" size={14} /> {busy === "here" ? "جارٍ الرفع…" : "رفع هنا"}</button>
              <span className="muted">أو اسحب الملفات وأفلتها داخل هذا المربع</span>
            </div>
          )}
        </div>
      )}

      {modal === "upload" && (
        <Modal title={`رفع ملف إلى Google Drive${mode === "sim" ? " (تجريبي)" : ""}`} onClose={() => setModal("")}>
          <UploadForm
            projects={myProjects} canFinance={canFinance} rootName={rootName} taskVisible={taskVisible}
            initialProject={projectName || ""} mappedName={(p) => (map[p] ? (items || []).find((x) => x.id === map[p])?.name || p : p)}
            onCancel={() => setModal("")}
            onUpload={async (files, names) => {
              const { parent, rest } = target(names);
              let dest = null;
              for (const f of files) dest = (await drive.upload(f, rest, viewer?.name, parent)).parent;
              setModal("");
              setFlash({ name: files.length > 1 ? `${files.length} ملفات` : files[0].name, path: [rootName, ...names] });
              setFolder(dest);
            }}
          />
        </Modal>
      )}

      {modal === "connect" && (
        <Modal title="ربط حساب Google Drive" onClose={() => setModal("")}>
          <ConnectForm redirectUri={status?.redirectUri} onCancel={() => setModal("")} />
        </Modal>
      )}

      {modal === "map" && (
        <Modal title="ربط المشاريع بمجلداتها في Drive" onClose={() => setModal("")}>
          <MapForm drive={drive} projects={(projects || []).map((p) => p.name)} map={map}
            onCancel={() => setModal("")}
            onSave={async (next) => { await appSettings.set(MAP_KEY, next); setMap(next); setModal(""); setFolder("root"); }} />
        </Modal>
      )}
    </div>
  );
}

function UploadForm({ projects, canFinance, rootName, taskVisible, initialProject, mappedName, onUpload, onCancel }) {
  const [project, setProject] = useState(projects.includes(initialProject) ? initialProject : projects[0] || "");
  const [mode, setMode] = useState("category"); // category | task
  const [category, setCategory] = useState(DRIVE_CATEGORIES[1]);
  const [task, setTask] = useState("");
  const [tasks, setTasks] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cats = DRIVE_CATEGORIES.filter((c) => canFinance || !FINANCE_CATEGORIES.includes(c));

  useEffect(() => { tasksStore.list().then(setTasks).catch(() => {}); }, []);
  const projTasks = tasks.filter((t) => t.project === project && taskVisible(t));
  useEffect(() => { setTask(""); }, [project]);

  const names = drivePathFor({ project, category: mode === "category" ? category : "", task: mode === "task" ? task : "" });
  const ready = project && files.length && (mode === "category" || task);

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (!ready) return;
      setSaving(true);
      setError("");
      try { await onUpload(files, names); } catch (x) { setError(x?.message || "تعذّر الرفع."); } finally { setSaving(false); }
    }}>
      <div className="form-grid">
        <label className="field"><span>المشروع</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field"><span>نوع الملف</span>
          <div className="seg" style={{ width: "fit-content" }}>
            <button type="button" className={mode === "category" ? "on" : ""} onClick={() => setMode("category")}>ملف مشروع</button>
            <button type="button" className={mode === "task" ? "on" : ""} onClick={() => setMode("task")}>ملف مهمة</button>
          </div>
        </label>
        {mode === "category" ? (
          <label className="field full"><span>التصنيف</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        ) : (
          <label className="field full"><span>المهمة</span>
            <select value={task} onChange={(e) => setTask(e.target.value)} required>
              <option value="">— اختر المهمة —</option>
              {projTasks.map((t) => <option key={t.id} value={t.task}>{t.task}</option>)}
            </select>
          </label>
        )}
        <label className="field full"><span>الملفات</span>
          <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </label>
      </div>
      <div className="drv-dest">
        <small>بيتحفظ تلقائياً في:</small>
        <span className="drv-path"><Icon name="folder" size={14} /> {[rootName, mappedName(names[0]), ...names.slice(1)].join(" / ")}</span>
      </div>
      {error && <div className="chat-error">{error}</div>}
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={!ready || saving}>{saving ? "جارٍ الرفع…" : "رفع"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

// ربط كل مشروع بمجلده الموجود في جذر Drive (يقترح المطابق بالاسم)
function MapForm({ drive, projects, map, onSave, onCancel }) {
  const [folders, setFolders] = useState(null);
  const [m, setM] = useState(map);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    drive.folder("root").then((r) => {
      const fs = r.items.filter((x) => x.kind === "folder");
      setFolders(fs);
      setM((cur) => {
        const next = { ...cur };
        projects.forEach((p) => { if (!next[p]) { const hit = fs.find((f) => f.name.trim().toLowerCase() === p.trim().toLowerCase()); if (hit) next[p] = hit.id; } });
        return next;
      });
    }).catch(() => setFolders([]));
  }, [drive, projects]);

  if (!folders) return <div className="empty">جاري تحميل المجلدات…</div>;
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        اختر لكل مشروع مجلده الموجود في Drive. المشروع اللي ما له مجلد، ينشئ له النظام مجلداً باسمه أول ما يُرفع له ملف.
      </p>
      <div className="drv-map">
        {projects.map((p) => (
          <label key={p} className="drv-map-row">
            <b>{p}</b>
            <select value={m[p] || ""} onChange={(e) => setM((s) => { const n = { ...s }; if (e.target.value) n[p] = e.target.value; else delete n[p]; return n; })}>
              <option value="">— مجلد جديد باسم المشروع —</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(m); } finally { setSaving(false); } }}>حفظ الربط</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}

// ربط حساب Google: رابط المجلد الرئيسي ثم موافقة Google بحساب صاحب المجلد
function ConnectForm({ redirectUri, onCancel }) {
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setError("");
      try { await driveConnect(folder); } catch (x) { setError(x?.message || "تعذّر بدء الربط."); setBusy(false); }
    }}>
      <ol className="drv-steps">
        <li>افتح المجلد الرئيسي في Google Drive (اللي فيه مجلدات المشاريع) وانسخ رابطه من شريط العنوان.</li>
        <li>الصقه هنا واضغط «متابعة إلى Google».</li>
        <li>سجّل دخولك <b>بحساب Google اللي يملك المجلد</b> ووافق على الصلاحية. الملفات بترتفع باسم هذا الحساب وعلى مساحته.</li>
      </ol>
      <label className="field full"><span>رابط المجلد الرئيسي</span>
        <input dir="ltr" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" required />
      </label>
      {redirectUri && <p className="muted" style={{ fontSize: 12 }}>رابط الرجوع المسجّل في Google Cloud لازم يكون: <code dir="ltr">{redirectUri}</code></p>}
      {error && <div className="chat-error">{error}</div>}
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={busy || !folder.trim()}>{busy ? "جارٍ التحويل…" : "متابعة إلى Google"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
