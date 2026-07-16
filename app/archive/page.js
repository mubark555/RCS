"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filesStore, isCloud } from "@/lib/store";
import Modal from "@/components/Modal";
import { PROJECTS } from "@/lib/constants";

const CATEGORIES = ["عقود", "تصاميم", "عروض", "تقارير", "فواتير", "أخرى"];

export default function ArchivePage() {
  const [files, setFiles] = useState(null);
  const [fProject, setFProject] = useState("");
  const [fCat, setFCat] = useState("");
  const [q, setQ] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
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
      if (fProject && f.project !== fProject) return false;
      if (fCat && f.category !== fCat) return false;
      if (q && !`${f.name} ${f.note}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [files, fProject, fCat, q]);

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
    if (!confirm(`حذف الملف؟\n\n${rec.name}`)) return;
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
      <div className="section-title" style={{ marginTop: 10, justifyContent: "space-between" }}>
        <span>🗄️ أرشيف الملفات ({filtered.length})</span>
        <button className="btn primary" onClick={() => setUploadOpen(true)}>
          ⬆ رفع ملف
        </button>
      </div>

      {!isCloud && (
        <div className="card" style={{ borderColor: "#7c5b17", background: "rgba(251,191,36,0.06)", marginBottom: 14, fontSize: 13 }}>
          ملاحظة: أنت في الوضع المحلي التجريبي — تُحفظ الملفات داخل متصفحك فقط
          (يُنصح بأحجام صغيرة). عند ربط Supabase تُرفع الملفات للتخزين السحابي وتُشارك مع الفريق.
        </div>
      )}

      <div className="toolbar">
        <input placeholder="🔍 بحث…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
        <select value={fProject} onChange={(e) => setFProject(e.target.value)}>
          <option value="">كل المشاريع</option>
          {PROJECTS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">كل التصنيفات</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">لا توجد ملفات. ابدأ برفع أول ملف ⬆</div>
      ) : (
        filtered.map((f) => (
          <div className="list-card" key={f.id}>
            <div className="ic">{iconFor(f)}</div>
            <div className="body">
              <h4>{f.name}</h4>
              <div className="meta">
                {f.project && <span>📁 {f.project}</span>}
                {f.category && <span>🏷️ {f.category}</span>}
                <span>{fmtSize(f.size)}</span>
                {f.created_at && <span>{new Date(f.created_at).toLocaleDateString("ar-SA")}</span>}
              </div>
              {f.note && <div style={{ marginTop: 5, fontSize: 13 }}>{f.note}</div>}
            </div>
            <div className="row-actions">
              <button className="btn sm" disabled={busyId === f.id} onClick={() => open(f)}>فتح</button>
              <button className="btn sm danger" disabled={busyId === f.id} onClick={() => del(f)}>🗑</button>
            </div>
          </div>
        ))
      )}

      {uploadOpen && (
        <Modal title="رفع ملف جديد" onClose={() => setUploadOpen(false)}>
          <UploadForm
            categories={CATEGORIES}
            onCancel={() => setUploadOpen(false)}
            onDone={async () => {
              setUploadOpen(false);
              await reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function UploadForm({ categories, onDone, onCancel }) {
  const fileRef = useRef(null);
  const [meta, setMeta] = useState({ project: "", category: categories[0], note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("اختر ملفاً أولاً");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await filesStore.upload(file, meta);
      await onDone();
    } catch (e2) {
      setErr("تعذّر الرفع: " + (e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>الملف *</span>
        <input type="file" ref={fileRef} />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>المشروع</span>
          <select value={meta.project} onChange={(e) => setMeta({ ...meta, project: e.target.value })}>
            <option value="">—</option>
            {PROJECTS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>التصنيف</span>
          <select value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>ملاحظة</span>
        <input value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} />
      </label>
      {err && <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "جاري الرفع…" : "رفع"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function iconFor(f) {
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
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
