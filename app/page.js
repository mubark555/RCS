"use client";

import { useState } from "react";
import { readNames } from "@/lib/excel";
import { generateCombined, generateSplitZip } from "@/lib/pptx";

function FileDrop({ label, hint, accept, file, onFile }) {
  return (
    <div className="field">
      <label className="title">{label}</label>
      <label className={"drop" + (file ? " filled" : "")}>
        <input
          type="file"
          accept={accept}
          onChange={(e) => onFile(e.target.files?.[0] || null)}
        />
        {file ? (
          <>
            <div className="name">📎 {file.name}</div>
            <div className="sub">اضغط للتغيير</div>
          </>
        ) : (
          <>
            <div className="name">اضغط لاختيار الملف</div>
            <div className="sub">{hint}</div>
          </>
        )}
      </label>
    </div>
  );
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [pptxFile, setPptxFile] = useState(null);
  const [excelFile, setExcelFile] = useState(null);
  const [placeholder, setPlaceholder] = useState("{{name}}");
  const [column, setColumn] = useState("");
  const [sheet, setSheet] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState("combined"); // combined | split
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // {type, text}

  const canRun = pptxFile && excelFile && !busy;

  async function run() {
    if (!canRun) return;
    setBusy(true);
    setStatus({ type: "info", text: "جارٍ المعالجة…" });
    try {
      const excelBuf = await excelFile.arrayBuffer();
      const names = readNames(excelBuf, {
        column: column || undefined,
        sheet: sheet || undefined,
        hasHeader,
      });

      if (names.length === 0) {
        setStatus({
          type: "error",
          text: "لم يتم العثور على أي أسماء في ملف Excel. تأكّد من العمود وخيار «الصف الأول عنوان».",
        });
        setBusy(false);
        return;
      }

      const pptxBuf = await pptxFile.arrayBuffer();
      const ph = placeholder || "{{name}}";

      if (mode === "combined") {
        const blob = await generateCombined(pptxBuf, names, ph, 1);
        download(blob, "result.pptx");
        setStatus({
          type: "success",
          text: `تم إنشاء ملف واحد فيه ${names.length} شريحة (شريحة لكل اسم) وبدأ التنزيل: result.pptx`,
        });
      } else {
        const blob = await generateSplitZip(pptxBuf, names, ph, 1);
        download(blob, "certificates.zip");
        setStatus({
          type: "success",
          text: `تم إنشاء ${names.length} ملف مستقل داخل certificates.zip وبدأ التنزيل.`,
        });
      }
    } catch (err) {
      console.error(err);
      setStatus({
        type: "error",
        text:
          "حدث خطأ أثناء المعالجة: " +
          (err?.message || "تأكّد أن ملف القالب صالح ويحتوي المكان المحجوز."),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="header">
        <h1>📊 إدراج الأسماء في PowerPoint</h1>
        <p>
          ارفع قالب PowerPoint فيه المكان المحجوز <code>{"{{name}}"}</code>{" "}
          وملف Excel فيه الأسماء، وسننشئ لك ملفًا فيه شريحة لكل اسم. كل المعالجة
          تتم داخل متصفحك — لا تُرفع ملفاتك لأي خادم.
        </p>
      </div>

      <div className="card">
        <FileDrop
          label="١) قالب PowerPoint"
          hint="ملف .pptx فيه مربّع نص مكتوب فيه {{name}}"
          accept=".pptx"
          file={pptxFile}
          onFile={setPptxFile}
        />
        <FileDrop
          label="٢) ملف Excel للأسماء"
          hint="ملف .xlsx فيه عمود فيه الأسماء"
          accept=".xlsx,.xls"
          file={excelFile}
          onFile={setExcelFile}
        />
      </div>

      <div className="card">
        <div className="field">
          <label className="title">النص المحجوز داخل القالب</label>
          <input
            type="text"
            value={placeholder}
            onChange={(e) => setPlaceholder(e.target.value)}
            placeholder="{{name}}"
          />
          <div className="hint">
            المكان الذي سيُستبدل بالاسم داخل الشريحة. الافتراضي <code>{"{{name}}"}</code>.
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label className="title">عمود الأسماء (اختياري)</label>
            <input
              type="text"
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              placeholder="مثال: A أو 1"
            />
            <div className="hint">اتركه فارغًا لاستخدام أول عمود.</div>
          </div>
          <div className="field">
            <label className="title">اسم الورقة (اختياري)</label>
            <input
              type="text"
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
              placeholder="أول ورقة"
            />
            <div className="hint">اتركه فارغًا لاستخدام أول ورقة.</div>
          </div>
        </div>

        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
            />
            الصف الأول عنوان للعمود (تجاهله)
          </label>
        </div>
      </div>

      <div className="card">
        <label className="title">طريقة الإخراج</label>
        <div className="modes">
          <div
            className={"mode" + (mode === "combined" ? " active" : "")}
            onClick={() => setMode("combined")}
          >
            <div className="m-title">ملف واحد</div>
            <div className="m-sub">ملف PowerPoint فيه شريحة لكل اسم</div>
          </div>
          <div
            className={"mode" + (mode === "split" ? " active" : "")}
            onClick={() => setMode("split")}
          >
            <div className="m-title">ملف لكل اسم</div>
            <div className="m-sub">ملف مضغوط (zip) فيه ملف مستقل لكل اسم</div>
          </div>
        </div>
      </div>

      <button className="primary" disabled={!canRun} onClick={run}>
        {busy ? "جارٍ المعالجة…" : "توليد الملف"}
      </button>

      {status && <div className={"status " + status.type}>{status.text}</div>}

      <div className="footer">
        كل المعالجة داخل المتصفح · جاهز للنشر على Vercel
      </div>
    </main>
  );
}
