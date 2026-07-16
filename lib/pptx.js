// معالجة ملفات PowerPoint داخل المتصفح بالكامل.
// ملف .pptx هو في الحقيقة ملف مضغوط (zip) يحوي ملفات XML. نفتحه عبر JSZip،
// ننسخ شريحة القالب لكل اسم، نستبدل المكان المحجوز {{name}}، ثم نعيد ضغطه.

import JSZip from "jszip";

const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};

const SLIDE_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const SLIDE_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";

function parseXml(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function serializeXml(doc) {
  return new XMLSerializer().serializeToString(doc);
}

// استبدال المكان المحجوز مع الحفاظ على تنسيق النص.
// PowerPoint قد يقسّم النص إلى عدة <a:t>، لذا نجمع نص الفقرة كاملًا، نستبدل،
// ثم نضع الناتج في أول <a:t> ونفرّغ الباقي.
function replacePlaceholder(doc, placeholder, value) {
  const paragraphs = doc.getElementsByTagNameNS(NS.a, "p");
  for (const para of Array.from(paragraphs)) {
    const texts = Array.from(para.getElementsByTagNameNS(NS.a, "t"));
    if (texts.length === 0) continue;
    const full = texts.map((t) => t.textContent || "").join("");
    if (!full.includes(placeholder)) continue;
    const replaced = full.split(placeholder).join(value);
    texts[0].textContent = replaced;
    for (let i = 1; i < texts.length; i++) texts[i].textContent = "";
  }
}

// إيجاد مسار ملف شريحة انطلاقًا من هدف العلاقة (قد يكون نسبيًا).
function resolveSlidePath(target) {
  const clean = target.replace(/^\//, "").replace(/^\.\.\//, "");
  return clean.startsWith("ppt/") ? clean : "ppt/" + clean;
}

/**
 * يولّد عرض PowerPoint فيه شريحة لكل اسم بناءً على شريحة قالب.
 * @param {ArrayBuffer} templateBuffer محتوى ملف القالب
 * @param {string[]} names قائمة الأسماء
 * @param {string} placeholder النص المحجوز (مثل {{name}})
 * @param {number} slideNumber رقم شريحة القالب (يبدأ من 1)
 * @returns {Promise<Blob>} ملف pptx الناتج
 */
export async function generateCombined(
  templateBuffer,
  names,
  placeholder = "{{name}}",
  slideNumber = 1
) {
  const zip = await JSZip.loadAsync(templateBuffer);

  const presDoc = parseXml(await zip.file("ppt/presentation.xml").async("string"));
  const relsDoc = parseXml(
    await zip.file("ppt/_rels/presentation.xml.rels").async("string")
  );
  const ctDoc = parseXml(await zip.file("[Content_Types].xml").async("string"));

  const sldIdLst = presDoc.getElementsByTagNameNS(NS.p, "sldIdLst")[0];
  const sldIds = Array.from(sldIdLst.getElementsByTagNameNS(NS.p, "sldId"));
  if (sldIds.length === 0) throw new Error("القالب لا يحتوي على أي شريحة.");

  const relElements = Array.from(
    relsDoc.getElementsByTagNameNS(NS.rel, "Relationship")
  );
  const targetById = {};
  relElements.forEach((rel) => {
    targetById[rel.getAttribute("Id")] = rel.getAttribute("Target");
  });

  const tplIndex = Math.min(Math.max(slideNumber - 1, 0), sldIds.length - 1);
  const tplSldId = sldIds[tplIndex];
  const tplRId =
    tplSldId.getAttributeNS(NS.r, "id") || tplSldId.getAttribute("r:id");
  const tplSlidePath = resolveSlidePath(targetById[tplRId]);
  const tplFileName = tplSlidePath.split("/").pop(); // slideN.xml
  const tplRelsPath = "ppt/slides/_rels/" + tplFileName + ".rels";

  const tplSlideXml = await zip.file(tplSlidePath).async("string");
  const tplRelsFile = zip.file(tplRelsPath);
  const tplRelsXml = tplRelsFile ? await tplRelsFile.async("string") : null;

  // أعلى رقم شريحة / أعلى rId / أعلى معرّف sldId لتفادي التعارض
  let maxSlideNum = 0;
  Object.keys(zip.files).forEach((f) => {
    const m = f.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (m) maxSlideNum = Math.max(maxSlideNum, parseInt(m[1], 10));
  });
  let maxRId = 0;
  relElements.forEach((rel) => {
    const m = (rel.getAttribute("Id") || "").match(/rId(\d+)/);
    if (m) maxRId = Math.max(maxRId, parseInt(m[1], 10));
  });
  let maxId = 255;
  sldIds.forEach((s) => {
    const v = parseInt(s.getAttribute("id") || "0", 10);
    if (v > maxId) maxId = v;
  });

  names.forEach((name, i) => {
    const num = maxSlideNum + 1 + i;
    const fileName = `slide${num}.xml`;
    const slidePath = `ppt/slides/${fileName}`;

    const slideDoc = parseXml(tplSlideXml);
    replacePlaceholder(slideDoc, placeholder, name);
    zip.file(slidePath, serializeXml(slideDoc));

    if (tplRelsXml) {
      zip.file(`ppt/slides/_rels/${fileName}.rels`, tplRelsXml);
    }

    const override = ctDoc.createElementNS(NS.ct, "Override");
    override.setAttribute("PartName", `/${slidePath}`);
    override.setAttribute("ContentType", SLIDE_CONTENT_TYPE);
    ctDoc.documentElement.appendChild(override);

    const newRId = `rId${maxRId + 1 + i}`;
    const rel = relsDoc.createElementNS(NS.rel, "Relationship");
    rel.setAttribute("Id", newRId);
    rel.setAttribute("Type", SLIDE_REL_TYPE);
    rel.setAttribute("Target", `slides/${fileName}`);
    relsDoc.documentElement.appendChild(rel);

    const sldId = presDoc.createElementNS(NS.p, "p:sldId");
    sldId.setAttribute("id", String(maxId + 1 + i));
    sldId.setAttributeNS(NS.r, "r:id", newRId);
    sldIdLst.appendChild(sldId);
  });

  // إزالة شريحة القالب الأصلية من العرض (الملف + العلاقة + نوع المحتوى + الفهرس)
  sldIdLst.removeChild(tplSldId);
  const tplRelEl = relElements.find((r) => r.getAttribute("Id") === tplRId);
  if (tplRelEl) relsDoc.documentElement.removeChild(tplRelEl);
  Array.from(ctDoc.getElementsByTagNameNS(NS.ct, "Override")).forEach((o) => {
    if (o.getAttribute("PartName") === `/${tplSlidePath}`) {
      ctDoc.documentElement.removeChild(o);
    }
  });
  zip.remove(tplSlidePath);
  if (tplRelsFile) zip.remove(tplRelsPath);

  zip.file("ppt/presentation.xml", serializeXml(presDoc));
  zip.file("ppt/_rels/presentation.xml.rels", serializeXml(relsDoc));
  zip.file("[Content_Types].xml", serializeXml(ctDoc));

  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

/**
 * يولّد ملف pptx مستقل لكل اسم، ويعيدها مضغوطة في ملف zip واحد.
 * @returns {Promise<Blob>} ملف zip يحوي ملفًا لكل اسم
 */
export async function generateSplitZip(
  templateBuffer,
  names,
  placeholder = "{{name}}",
  slideNumber = 1
) {
  const out = new JSZip();
  const used = {};
  for (const name of names) {
    const blob = await generateCombined(
      templateBuffer,
      [name],
      placeholder,
      slideNumber
    );
    const fileData = await blob.arrayBuffer();
    let safe =
      name.replace(/[^\p{L}\p{N} _-]/gu, "_").trim() || "name";
    // تفادي تكرار الأسماء المتطابقة
    if (used[safe]) {
      used[safe] += 1;
      safe = `${safe} (${used[safe]})`;
    } else {
      used[safe] = 1;
    }
    out.file(`${safe}.pptx`, fileData);
  }
  return out.generateAsync({ type: "blob", mimeType: "application/zip" });
}
