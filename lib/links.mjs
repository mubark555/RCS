// أدوات الروابط: تحويل الرابط لعنوان صالح، واكتشاف الروابط داخل النص (حتى بدون https://)

// رابط بالبروتوكول، أو www، أو نطاق متبوع بمسار (مثل meet.google.com/abc-defg-hij)
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"']*)/gi;
const TRAIL = /[.,;:!?)\]}،؛»"']+$/; // علامات الترقيم في نهاية الجملة ليست جزءاً من الرابط

// عنوان صالح للفتح: بدون بروتوكول يعتبره المتصفح صفحة داخل النظام، فنضيف https://
export function toHref(s) {
  const v = String(s || "").trim();
  if (!v) return "";
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(v)) return `https://${v}`;
  return "";
}

// أول رابط في النص (مثلاً حقل «المكان / رابط الاجتماع»)
export function firstUrl(text) {
  const m = String(text || "").match(URL_RE);
  return m ? toHref(m[0].replace(TRAIL, "")) : "";
}

// تقسيم النص لأجزاء عادية وروابط: [{ text }, { text, href }]
export function splitLinks(text) {
  const s = String(text || "");
  const out = [];
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    const raw = m[0].replace(TRAIL, "");
    const href = toHref(raw);
    if (!href) continue;
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: raw, href });
    last = m.index + raw.length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.length ? out : [{ text: s }];
}
