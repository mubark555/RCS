import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import { ssml, secMsGec, audioFromFrame, edgeTts, splitText } from "../lib/tts.mjs";

const frame = (path, data) => {
  const head = Buffer.from(`X-RequestId:x\r\nContent-Type:audio/mpeg\r\nPath:${path}\r\n`);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(head.length);
  return Buffer.concat([len, head, Buffer.from(data)]);
};

test("SSML بصوت زارية مع تهريب الرموز", () => {
  const s = ssml("أهلاً <خالد> & 'سارة'");
  assert.match(s, /xml:lang='ar-SA'/);
  assert.match(s, /name='ar-SA-ZariyahNeural'/);
  assert.match(s, /&lt;خالد&gt; &amp; &apos;سارة&apos;/);
});

test("رمز Sec-MS-GEC ثابت داخل نافذة الخمس دقائق", () => {
  const t = 1_760_000_000;
  const base = t - ((t + 11644473600) % 300);
  assert.match(secMsGec(t), /^[0-9A-F]{64}$/);
  assert.equal(secMsGec(base), secMsGec(base + 299));
  assert.notEqual(secMsGec(base), secMsGec(base + 300));
});

test("استخراج الصوت من الإطار الثنائي", () => {
  assert.deepEqual(audioFromFrame(frame("audio", "MP3")), Buffer.from("MP3"));
  assert.equal(audioFromFrame(frame("audio.metadata", "x")), null);
  assert.equal(audioFromFrame(frame("audio", "")), null);
  assert.equal(audioFromFrame(Buffer.from([0])), null);
});

test("تقسيم النص لحد Google", () => {
  const long = "جملة قصيرة. ".repeat(40);
  const parts = splitText(long);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 190));
  assert.equal(parts.join(" ").replace(/\s+/g, " "), long.trim());
});

test("edgeTts: يرسل الإعداد ثم SSML ويجمع الصوت حتى turn.end", async () => {
  const wss = new WebSocketServer({ port: 0 });
  const got = [];
  wss.on("connection", (ws) => ws.on("message", (m) => {
    got.push(m.toString());
    if (got.length === 2) {
      ws.send("Path:turn.start\r\n\r\n{}");
      ws.send(frame("audio", "AB"), { binary: true });
      ws.send(frame("audio", "CD"), { binary: true });
      ws.send("X-RequestId:x\r\nPath:turn.end\r\n\r\n{}");
    }
  }));
  await new Promise((r) => wss.on("listening", r));
  try {
    const audio = await edgeTts("صباح الخير", {}, { url: `ws://127.0.0.1:${wss.address().port}` });
    assert.equal(audio.toString(), "ABCD");
    assert.match(got[0], /Path:speech\.config/);
    assert.match(got[1], /Path:ssml[\s\S]*صباح الخير/);
  } finally {
    wss.close();
  }
});

test("edgeTts: يفشل إذا انقطع الاتصال بلا صوت", async () => {
  const wss = new WebSocketServer({ port: 0 });
  wss.on("connection", (ws) => ws.close());
  await new Promise((r) => wss.on("listening", r));
  try {
    await assert.rejects(edgeTts("مرحبا", {}, { url: `ws://127.0.0.1:${wss.address().port}` }));
  } finally {
    wss.close();
  }
});
