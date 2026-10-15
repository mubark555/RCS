// نطق عربي بصوت نسائي طبيعي لأمل عبر الخادم، حتى يعمل على أي جهاز/متصفح.
// المزوّدات بالترتيب: Azure (إن ضُبط) ← صوت Edge العصبي المجاني ← Google Translate (lib/tts.mjs).
// إذا فشلت كلها يرجع العميل لصوت الجهاز تلقائياً.
import { synthesize, DEFAULT_VOICE } from "@/lib/tts.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 1000;

export async function GET(req) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q || q.length > MAX) return new Response("bad text", { status: 400 });
  try {
    const { audio, provider } = await synthesize(q, { voice: process.env.TTS_VOICE || DEFAULT_VOICE });
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-TTS-Provider": provider,
        // نفس الجملة (مثل «صباح الخير يا خالد») تُخزَّن مؤقتاً لتسريع النطق وتقليل الطلبات
        // (صوت Google الاحتياطي لا يُخزَّن طويلاً حتى يرجع الصوت الطبيعي أول ما تتوفر خدمته)
        "Cache-Control": provider === "google" ? "public, max-age=600" : "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return new Response("tts unavailable", { status: 502 });
  }
}
