"use client";

import { useEffect, useMemo, useState } from "react";
import { filesStore } from "@/lib/store";
import { useRole, useProjectNames } from "@/components/RoleProvider";
import { isFinanceFile } from "@/lib/constants";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";

const CATEGORIES = ["عقود", "تصاميم", "عروض", "تقارير", "فواتير", "محاضر", "تسجيلات", "أخرى"];

export default function ArchivePage() {
  const projectNames = useProjectNames();
  const { can, clientProject, canFinance, scopeProjects } = useRole();
  const readOnly = !can("archive", "edit");
  const [files, setFiles] = useState(null);
  const [fProject, setFProject] = useState("");
  const [fCat, setFCat] = useState("");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // 'link'
  const [busyId, setBusyId] = useState(null);

  async function reload() {
    setFiles(await filesStore.list());
  }
  useEffect(() => {
    reload().catch(() => setFiles([]));
  }, []);

  const filtered = useMemo(() => {
    if (!files) return [];
    return files.filter((f) => {
      // ملفات المشاريع خارج نطاق المستخدم لا تظهر (الملفات بلا مشروع للنطاق الكامل فقط)
      if (scopeProjects && !scopeProjects.includes(f.project)) return false;
      if (!canFinance && isFinanceFile(f)) return false;
      if (fProject && f.project !== fProject) return false;
      if (fCat && f.category !== fCat) return false;
      if (q && !`${f.name} ${f.note}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [files, fProject, fCat, q, scopeProjects, canFinance]);

  async function open(rec) {
    setBusyId(rec.id);
    try {
      const url = await filesStore.getUrl(rec);
      window.open(url, "_blank");
    } finally {
      setBusyId(null);
    }
  }

  async function del(rec) {
    if (!confirm(`حذف؟\n\n${rec.name}`)) return;
    setBusyId(rec.id);
    try {
      await filesStore.remove(rec);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  if (!files) return <div className="empty">جاري التحميل…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span className="pill" style={{ fontSize: 13, padding: "6px 12px" }}>{filtered.length} عنصر</span>
        <div style={{ marginInlineStart: "auto" }} />
        {!readOnly && (
          <button className="btn primary" onClick={() => setModal("link")}><Icon name="link" size={16} /> مشاركة ملف برابط</button>
        )}
      </div>

      <div className="toolbar">
        <input placeholder="بحث…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
        {!clientProject && (
          <select value={fProject} onChange={(e) => setFProject(e.target.value)}>
            <option value="">كل المشاريع</option>
            {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <select value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">كل التصنيفات</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">لا توجد عناصر بعد.</div>
      ) : (
        filtered.map((f) => (
          <div className="list-card" key={f.id}>
            <div className="ic" style={{ color: f.kind === "link" ? "var(--primary)" : "var(--text-2)" }}>
              <Icon name={f.kind === "link" ? "link" : "file"} size={22} />
            </div>
            <div className="body">
              <h4>{f.name}</h4>
              <div className="meta">
                {f.project && <span>{f.project}</span>}
                {f.category && <span>{f.category}</span>}
                {f.kind === "link" ? <span>رابط</span> : <span>{fmtSize(f.size)}</span>}
                {f.created_at && <span>{new Date(f.created_at).toLocaleDateString("ar-SA")}</span>}
              </div>
              {f.note && <div style={{ marginTop: 5, fontSize: 13 }}>{f.note}</div>}
            </div>
            <div className="row-actions">
              <button className="btn sm" disabled={busyId === f.id} onClick={() => open(f)}>فتح</button>
              {!readOnly && <button className="btn sm danger icon" disabled={busyId === f.id} onClick={() => del(f)} title="حذف"><Icon name="trash" size={15} /></button>}
            </div>
          </div>
        ))
      )}

      {modal === "link" && (
        <Modal title="مشاركة ملف برابط مباشر" onClose={() => setModal(null)}>
          <LinkForm onCancel={() => setModal(null)} onDone={async () => { setModal(null); await reload(); }} />
        </Modal>
      )}
    </div>
  );
}

function LinkForm({ onDone, onCancel }) {
  const projectNames = useProjectNames();
  const [f, setF] = useState({ name: "", url: "", project: "", category: CATEGORIES[0], note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.url.trim()) { setErr("أدخل الرابط"); return; }
    setBusy(true); setErr("");
    try {
      await filesStore.addLink(f);
      await onDone();
    } catch (e2) {
      setErr("خطأ: " + (e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="field"><span>الرابط *</span><input type="url" dir="ltr" value={f.url} onChange={set("url")} placeholder="https://… (Drive، OneDrive، Dropbox…)" /></label>
      <label className="field"><span>الاسم / الوصف</span><input value={f.name} onChange={set("name")} placeholder="مثال: محضر اجتماع 20 يوليو" /></label>
      <div className="form-grid">
        <label className="field"><span>المشروع</span>
          <select value={f.project} onChange={set("project")}>
            <option value="">—</option>
            {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field"><span>التصنيف</span>
          <select value={f.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      {err && <div style={{ color: "#cf4940", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "…" : "إضافة"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function iconFor(f) {
  if (f.kind === "link") {
    if (/تسجيل/.test(f.category || "")) return "🎥";
    if (/محاضر|محضر/.test(f.category || "")) return "📝";
    return "🔗";
  }
  const m = (f.mime || "").toLowerCase();
  const n = (f.name || "").toLowerCase();
  if (m.startsWith("image/")) return "🖼️";
  if (m.includes("pdf") || n.endsWith(".pdf")) return "📕";
  if (n.match(/\.(xlsx?|csv)$/)) return "📊";
  if (n.match(/\.(docx?|txt)$/)) return "📄";
  if (n.match(/\.(pptx?)$/)) return "📽️";
  if (n.match(/\.(zip|rar|7z)$/)) return "🗜️";
  return "📎";
}
function fmtSize(bytes) {
  if (!bytes) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
