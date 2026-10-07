// نطق عربي بصوت نسائي لأمل: يجلب الصوت من خدمة النطق في Google Translate (بلا مفتاح)
// عبر الخادم، حتى يعمل الصوت النسائي على أي جهاز/متصفح حتى لو ما فيه صوت عربي نسائي.
// خدمة غير رسمية: إذا فشلت يرجع العميل لصوت الجهاز تلقائياً.
export const dynamic = "force-dynamic";

const MAX = 200; // حد الخدمة لكل مقطع

export async function GET(req) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q || q.length > MAX) return new Response("bad text", { status: 400 });
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ar&ttsspeed=1&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", Referer: "https://translate.google.com/" },
      cache: "no-store",
    });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.includes("audio")) return new Response("tts unavailable", { status: 502 });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": "audio/mpeg",
        // نفس الجملة (مثل «صباح الخير يا خالد») تُخزَّن مؤقتاً لتسريع النطق وتقليل الطلبات
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return new Response("tts error", { status: 502 });
  }
}
