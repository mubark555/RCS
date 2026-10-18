"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tasksStore } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";
import { useSettings, brandTitle } from "@/components/SettingsProvider";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { driveSim } from "@/lib/driveSim";
import { drivePathFor, DRIVE_CATEGORIES, TASKS_FOLDER, FINANCE_CATEGORIES } from "@/lib/drivePaths";

function fmtSize(n) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
const fileIcon = (mime = "") => (mime.startsWith("image/") ? "🖼️" : mime.includes("pdf") ? "📕" : /sheet|excel|csv/.test(mime) ? "📊" : /word|document/.test(mime) ? "📄" : /presentation|powerpoint/.test(mime) ? "📽️" : mime.startsWith("video/") ? "🎬" : "📎");

// Google Drive — بيئة اختبار: الرفع يروح تلقائياً لمجلد المشروع والتصنيف (أو مجلد المهمة)
export default function DrivePage() {
  const { viewer, projects, scopeProjects, can, canFinance, taskVisible } = useRole();
  const { settings } = useSettings();
  const rootName = brandTitle(settings) || "سيم برايم";
  const canEdit = can("drive", "edit");
  const [folder, setFolder] = useState(driveSim.ROOT);
  const [trail, setTrail] = useState([]);
  const [items, setItems] = useState(null);
  const [stats, setStats] = useState(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState(null); // آخر ملف مرفوع ومساره
  const hereRef = useRef(null);

  const myProjects = useMemo(() => (projects || []).map((p) => p.name).filter((n) => !scopeProjects || scopeProjects.includes(n)), [projects, scopeProjects]);

  const load = useCallback(async (id = folder) => {
    const [kids, tr, st] = await Promise.all([driveSim.children(id), driveSim.trail(id), driveSim.stats()]);
    setItems(kids);
    setTrail(tr);
    setStats(st);
  }, [folder]);
  useEffect(() => { load().catch(() => setItems([])); }, [load]);

  // النطاق: مجلدات المشاريع خارج نطاق الموظف لا تظهر، ومجلد الفواتير لمن له صلاحية المالية فقط
  const projectName = trail[0]?.name;
  const visibleItems = (items || []).filter((x) => {
    if (folder === driveSim.ROOT) return x.kind === "file" || myProjects.includes(x.name);
    if (trail.length === 1 && x.kind === "folder" && FINANCE_CATEGORIES.includes(x.name)) return canFinance;
    return true;
  });
  const blocked = projectName && !myProjects.includes(projectName);

  async function prepare() {
    setBusy("prepare");
    try {
      for (const p of myProjects) {
        for (const c of DRIVE_CATEGORIES) await driveSim.ensurePath([p, c], viewer?.name);
        await driveSim.ensurePath([p, TASKS_FOLDER], viewer?.name);
      }
      await load();
    } finally { setBusy(""); }
  }

  async function uploadHere(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    setBusy("here");
    try {
      const names = trail.map((t) => t.name);
      for (const f of files) await driveSim.upload(f, names, viewer?.name);
      setFlash({ name: files.length > 1 ? `${files.length} ملفات` : files[0].name, path: [rootName, ...names] });
      await load();
    } finally { setBusy(""); }
  }

  async function open(f) {
    const rec = await driveSim.get(f.id);
    if (!rec?.blob) return;
    const url = URL.createObjectURL(rec.blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function del(x) {
    if (!confirm(`حذف ${x.kind === "folder" ? "المجلد وكل ما فيه" : "الملف"}؟\n\n${x.name}`)) return;
    await driveSim.remove(x.id);
    await load();
  }

  async function reset() {
    if (!confirm("تفريغ بيئة الاختبار بالكامل؟ (يحذف كل المجلدات والملفات التجريبية من متصفحك)")) return;
    await driveSim.reset();
    setFolder(driveSim.ROOT);
    setFlash(null);
    await load(driveSim.ROOT);
  }

  return (
    <div>
      <div className="drv-banner">
        <Icon name="alert" size={18} />
        <div>
          <b>بيئة اختبار — محاكاة لـ Google Drive</b>
          <span>الملفات هنا محفوظة في متصفحك فقط، ولا تُرفع لـ Drive الحقيقي ولا لقاعدة البيانات. الترتيب نفسه اللي بيطبّقه النظام بعد الربط الحقيقي: <b>المشروع ← التصنيف</b> أو <b>المشروع ← المهام ← اسم المهمة</b>.</span>
        </div>
      </div>

      <div className="drv-bar">
        <div className="drv-crumbs">
          <button type="button" onClick={() => setFolder(driveSim.ROOT)} className={folder === driveSim.ROOT ? "on" : ""}>
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
        {stats && <span className="muted" style={{ fontSize: 12 }}>{stats.folders} مجلد · {stats.files} ملف · {fmtSize(stats.size)}</span>}
        {canEdit && <button className="btn sm ghost" onClick={reset}>تفريغ البيئة</button>}
        {canEdit && <button className="btn sm" disabled={busy === "prepare"} onClick={prepare}><Icon name="projects" size={14} /> {busy === "prepare" ? "جارٍ التجهيز…" : "تجهيز مجلدات المشاريع"}</button>}
        {canEdit && <button className="btn primary" onClick={() => setModal(true)}><Icon name="upload" size={16} /> رفع ملف</button>}
      </div>

      {flash && (
        <div className="drv-flash">
          <Icon name="check" size={16} /> تم رفع <b>{flash.name}</b> إلى: <span className="drv-path">{flash.path.join(" / ")}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="إخفاء"><Icon name="close" size={13} /></button>
        </div>
      )}

      {blocked ? (
        <div className="empty">لا تملك صلاحية على مجلد هذا المشروع.</div>
      ) : items === null ? (
        <div className="empty">جاري التحميل…</div>
      ) : (
        <div className="card drv-box"
          onDragOver={(e) => { if (canEdit && folder !== driveSim.ROOT) { e.preventDefault(); e.currentTarget.classList.add("drop"); } }}
          onDragLeave={(e) => e.currentTarget.classList.remove("drop")}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drop"); if (canEdit && folder !== driveSim.ROOT) uploadHere(e.dataTransfer.files); }}>
          {visibleItems.length === 0 ? (
            <div className="empty" style={{ padding: "34px 0" }}>
              {folder === driveSim.ROOT
                ? <>لا مجلدات بعد. اضغط <b>«تجهيز مجلدات المشاريع»</b> أو ارفع ملفاً وبيتنشأ مجلده تلقائياً.</>
                : "المجلد فاضي — اسحب الملفات هنا أو استخدم «رفع هنا»."}
            </div>
          ) : (
            <>
              {visibleItems.some((x) => x.kind === "folder") && (
                <div className="drv-folders">
                  {visibleItems.filter((x) => x.kind === "folder").map((x) => (
                    <div key={x.id} className="drv-folder" onDoubleClick={() => setFolder(x.id)} onClick={() => setFolder(x.id)} role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") setFolder(x.id); }}>
                      <span className="ic"><Icon name="folder" size={20} /></span>
                      <b>{x.name}</b>
                      {canEdit && folder !== driveSim.ROOT && (
                        <button type="button" className="x" onClick={(e) => { e.stopPropagation(); del(x); }} title="حذف المجلد"><Icon name="trash" size={13} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {visibleItems.filter((x) => x.kind === "file").map((f) => (
                <div className="drv-file" key={f.id}>
                  <span className="emo">{fileIcon(f.mime)}</span>
                  <div className="body"><b>{f.name}</b><small>{fmtSize(f.size)} · {new Date(f.created_at).toLocaleString("ar-SA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{f.by ? ` · ${f.by}` : ""}</small></div>
                  <button className="btn sm" onClick={() => open(f)}>فتح</button>
                  {canEdit && <button className="btn sm danger icon" onClick={() => del(f)} title="حذف"><Icon name="trash" size={14} /></button>}
                </div>
              ))}
            </>
          )}
          {canEdit && folder !== driveSim.ROOT && (
            <div className="drv-here">
              <input ref={hereRef} type="file" multiple hidden onChange={(e) => { uploadHere(e.target.files); e.target.value = ""; }} />
              <button className="btn sm ghost" disabled={busy === "here"} onClick={() => hereRef.current?.click()}><Icon name="upload" size={14} /> {busy === "here" ? "جارٍ الرفع…" : "رفع هنا"}</button>
              <span className="muted">أو اسحب الملفات وأفلتها داخل هذا المربع</span>
            </div>
          )}
        </div>
      )}

      {modal && (
        <Modal title="رفع ملف إلى Google Drive (تجريبي)" onClose={() => setModal(false)}>
          <UploadForm
            projects={myProjects} canFinance={canFinance} rootName={rootName} taskVisible={taskVisible}
            initialProject={projectName || ""}
            onCancel={() => setModal(false)}
            onUpload={async (files, names) => {
              let parent = null;
              for (const f of files) parent = (await driveSim.upload(f, names, viewer?.name)).parent;
              setModal(false);
              setFlash({ name: files.length > 1 ? `${files.length} ملفات` : files[0].name, path: [rootName, ...names] });
              setFolder(parent);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function UploadForm({ projects, canFinance, rootName, taskVisible, initialProject, onUpload, onCancel }) {
  const [project, setProject] = useState(projects.includes(initialProject) ? initialProject : projects[0] || "");
  const [mode, setMode] = useState("category"); // category | task
  const [category, setCategory] = useState(DRIVE_CATEGORIES[1]);
  const [task, setTask] = useState("");
  const [tasks, setTasks] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const cats = DRIVE_CATEGORIES.filter((c) => canFinance || !FINANCE_CATEGORIES.includes(c));

  useEffect(() => { tasksStore.list().then(setTasks).catch(() => {}); }, []);
  const projTasks = tasks.filter((t) => t.project === project && taskVisible(t));
  useEffect(() => { setTask(""); }, [project]);

  const names = drivePathFor({ project, category: mode === "category" ? category : "", task: mode === "task" ? task : "" });
  const ready = project && files.length && (mode === "category" || task);

  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!ready) return; setSaving(true); try { await onUpload(files, names); } finally { setSaving(false); } }}>
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
        <span className="drv-path"><Icon name="folder" size={14} /> {[rootName, ...names].join(" / ")}</span>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={!ready || saving}>{saving ? "جارٍ الرفع…" : "رفع"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
