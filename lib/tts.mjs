// أصوات «أمل»: صوت عصبي (Neural) طبيعي بدل صوت Google Translate الآلي.
// الترتيب: Azure (إن ضُبط مفتاحه — رسمي وثابت) ← صوت Edge المجاني (نفس أصوات Azure) ← Google Translate.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import WebSocket from "ws";

// زارية: صوت نسائي سعودي طبيعي. بدائل: ar-AE-FatimaNeural، ar-KW-NouraNeural، ar-QA-AmalNeural
export const DEFAULT_VOICE = "ar-SA-ZariyahNeural";
const OUTPUT = "audio-24khz-48kbitrate-mono-mp3";

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

export function ssml(text, { voice = DEFAULT_VOICE, rate = "-4%", pitch = "+0Hz" } = {}) {
  const lang = voice.split("-").slice(0, 2).join("-");
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
}

// ================= Azure Speech (اختياري: AZURE_SPEECH_KEY + AZURE_SPEECH_REGION) =================
export async function azureTts(text, opts = {}) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("azure not configured");
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": OUTPUT,
      "User-Agent": "seem-prime",
    },
    body: ssml(text, opts),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`azure ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ================= Edge «القراءة بصوت عالٍ» (مجاني، بلا مفتاح) =================
const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM = "143.0.3650.75";
const MAJOR = CHROMIUM.split(".")[0];
const EDGE_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOKEN}`;
let clockSkew = 0; // ثوانٍ؛ تُصحَّح من تاريخ الخادم إذا رُفض الرمز بسبب فرق الساعة

export function secMsGec(nowSec = Date.now() / 1000 + clockSkew) {
  let ticks = Math.floor(nowSec) + 11644473600; // من بداية تقويم Windows
  ticks -= ticks % 300;                          // الرمز يتغيّر كل 5 دقائق
  return createHash("sha256").update(`${BigInt(ticks) * 10000000n}${TOKEN}`, "ascii").digest("hex").toUpperCase();
}

const stamp = () => new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
const reqId = () => randomUUID().replaceAll("-", "");

// يستخرج الصوت من رسالة ثنائية: [طول الترويسة 2 بايت][الترويسة][بيانات mp3]
export function audioFromFrame(buf) {
  if (buf.length < 2) return null;
  const hl = buf.readUInt16BE(0);
  if (hl + 2 > buf.length) return null;
  const head = buf.subarray(2, hl + 2).toString("utf-8");
  if (!/(^|\r\n)Path:\s*audio(\r\n|$)/.test(head)) return null;
  const data = buf.subarray(hl + 2);
  return data.length ? data : null;
}

export function edgeTts(text, opts = {}, { url = EDGE_URL, timeout = 12000, retried = false } = {}) {
  return new Promise((resolve, reject) => {
    const full = url === EDGE_URL ? `${url}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROMIUM}&ConnectionId=${reqId()}` : url;
    const ws = new WebSocket(full, {
      headers: {
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Safari/537.36 Edg/${MAJOR}.0.0.0`,
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        Cookie: `muid=${randomBytes(16).toString("hex").toUpperCase()};`,
      },
      handshakeTimeout: timeout,
    });
    const parts = [];
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch {}
      if (err) reject(err);
      else if (!parts.length) reject(new Error("edge: no audio"));
      else resolve(Buffer.concat(parts));
    };
    const timer = setTimeout(() => finish(new Error("edge: timeout")), timeout);

    // 403 غالباً بسبب فرق الساعة: نصحّحها من ترويسة Date ونعيد مرة واحدة
    ws.on("unexpected-response", (_req, res) => {
      const server = Date.parse(res.headers?.date || "");
      if (res.statusCode === 403 && !retried && !isNaN(server)) {
        clockSkew += server / 1000 - (Date.now() / 1000 + clockSkew);
        done = true;
        clearTimeout(timer);
        try { ws.terminate(); } catch {}
        edgeTts(text, opts, { url, timeout, retried: true }).then(resolve, reject);
        return;
      }
      finish(new Error(`edge: http ${res.statusCode}`));
    });
    ws.on("error", (e) => finish(e));
    ws.on("close", () => finish(parts.length ? null : new Error("edge: closed")));
    ws.on("open", () => {
      ws.send(`X-Timestamp:${stamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${OUTPUT}"}}}}\r\n`);
      ws.send(`X-RequestId:${reqId()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp()}Z\r\nPath:ssml\r\n\r\n${ssml(text, opts)}`);
    });
    ws.on("message", (msg, isBinary) => {
      if (isBinary) {
        const a = audioFromFrame(Buffer.from(msg));
        if (a) parts.push(a);
      } else if (/Path:\s*turn\.end/.test(msg.toString())) finish(null);
    });
  });
}

// ================= Google Translate (الاحتياطي القديم، حد 200 حرف لكل طلب) =================
export function splitText(text, max = 190) {
  const out = [];
  let cur = "";
  for (const p of String(text).split(/(?<=[.!؟?،,:\n])\s+/)) {
    if ((cur + " " + p).trim().length <= max) { cur = (cur + " " + p).trim(); continue; }
    if (cur) out.push(cur);
    let rest = p;
    while (rest.length > max) {
      const sp = rest.lastIndexOf(" ", max);
      const cut = sp > 40 ? sp : max;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).trim();
    }
    cur = rest;
  }
  if (cur) out.push(cur);
  return out;
}

export async function googleTts(text) {
  const bufs = [];
  for (const q of splitText(text)) {
    const r = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ar&ttsspeed=1&q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", Referer: "https://translate.google.com/" },
      cache: "no-store",
    });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("audio")) throw new Error(`google ${r.status}`);
    bufs.push(Buffer.from(await r.arrayBuffer())); // مقاطع mp3 تُدمج بالتتابع مباشرة
  }
  return Buffer.concat(bufs);
}

// يجرّب المزوّدات بالترتيب ويرجع أول صوت ينجح
export async function synthesize(text, opts = {}) {
  const providers = [["azure", azureTts], ["edge", edgeTts], ["google", googleTts]];
  let last;
  for (const [name, fn] of providers) {
    if (name === "azure" && !(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION)) continue;
    try { return { audio: await fn(text, opts), provider: name }; } catch (e) { last = e; }
  }
  throw last || new Error("tts unavailable");
}
