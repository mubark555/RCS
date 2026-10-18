// اختبار اتصال Google Drive (lib/googleDrive.mjs) مقابل خادم محلي يحاكي Google API
import { test, after } from "node:test";
import http from "node:http";
import crypto from "node:crypto";
import assert from "node:assert/strict";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const FOLDER = "application/vnd.google-apps.folder";
const files = new Map([
  ["ROOT", { id: "ROOT", name: "root", parents: [] }],
  ["P1", { id: "P1", name: "Homera (قديم)", mimeType: FOLDER, parents: ["ROOT"] }],
  ["OUT", { id: "OUT", name: "خارج", mimeType: FOLDER, parents: ["ELSE"] }],
  ["ELSE", { id: "ELSE", name: "else", mimeType: FOLDER, parents: [] }],
]);
let n = 0, lastUploadInit = null, sawJwt = null;
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  let body = ""; for await (const c of req) body += c;
  const json = (code, o, h = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...h }); res.end(JSON.stringify(o)); };
  if (u.pathname === "/token") { sawJwt = new URLSearchParams(body).get("assertion"); return json(200, { access_token: "TOK", expires_in: 3600 }); }
  if (req.headers.authorization !== "Bearer TOK") return json(401, { error: { message: "no auth" } });
  assert.equal(u.searchParams.get("supportsAllDrives"), "true");
  if (u.pathname === "/drive/v3/files" && req.method === "GET") {
    const q = u.searchParams.get("q");
    const parent = q.match(/'([^']+)' in parents/)[1];
    const nm = q.match(/name='((?:\\'|[^'])*)'/);
    let list = [...files.values()].filter((f) => f.parents.includes(parent) && !f.trashed);
    if (nm) list = list.filter((f) => f.name === nm[1].replace(/\\'/g, "'") && f.mimeType === FOLDER);
    return json(200, { files: list });
  }
  if (u.pathname === "/drive/v3/files" && req.method === "POST") {
    const b = JSON.parse(body); const id = `F${++n}`; files.set(id, { id, ...b }); return json(200, { id });
  }
  const m = u.pathname.match(/^\/drive\/v3\/files\/(.+)$/);
  if (m && req.method === "GET") { const f = files.get(decodeURIComponent(m[1])); return f ? json(200, f) : json(404, { error: { message: "not found" } }); }
  if (m && req.method === "PATCH") { const f = files.get(decodeURIComponent(m[1])); Object.assign(f, JSON.parse(body)); return json(200, { id: f.id }); }
  if (u.pathname === "/upload/drive/v3/files") {
    lastUploadInit = { query: Object.fromEntries(u.searchParams), headers: req.headers, body: JSON.parse(body) };
    res.writeHead(200, { Location: "https://upload.example/session/123" }); return res.end();
  }
  json(404, { error: { message: "?" } });
});
await new Promise((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;
process.env.GOOGLE_API_BASE = base;
process.env.GOOGLE_TOKEN_URL = `${base}/token`;
const D = await import("../lib/googleDrive.mjs");
after(() => srv.close());
const sa = JSON.stringify({ client_email: "sa@proj.iam.gserviceaccount.com", private_key: pem });
const cfg = D.driveConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: Buffer.from(sa).toString("base64"), GOOGLE_DRIVE_ROOT_ID: "ROOT" });
let a, t;

test("قراءة مفتاح حساب الخدمة: JSON أو Base64 أو بريد + مفتاح", async () => {
  assert.ok(D.driveConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: sa, GOOGLE_DRIVE_ROOT_ID: "ROOT" }));
  assert.equal(cfg.email, "sa@proj.iam.gserviceaccount.com");
  assert.ok(D.driveConfig({ GOOGLE_SA_EMAIL: "a@b", GOOGLE_SA_PRIVATE_KEY: pem.replace(/\n/g, "\\n"), GOOGLE_DRIVE_ROOT_ID: "ROOT" }).key.includes("\n"));
  assert.equal(D.driveConfig({ GOOGLE_SA_EMAIL: "a@b" }), null);
});

test("عرض المجلد الرئيسي وتوقيع رمز الدخول (JWT) صحيح", async () => {
  const root = await D.listChildren(cfg, "root");
  assert.deepEqual(root.map((x) => [x.name, x.kind, x.parent]), [["Homera (قديم)", "folder", "root"]]);
  // JWT verifies with public key
  const [h, c, s] = sawJwt.split(".");
  assert.ok(crypto.createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")));
  const claim = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claim.iss, cfg.email); assert.equal(claim.scope, "https://www.googleapis.com/auth/drive");
});

test("إنشاء المجلدات الناقصة واستخدام الموجود (حتى مع علامة ')", async () => {
  a = await D.ensurePath(cfg, "P1", ["تصاميم"]);
  const b = await D.ensurePath(cfg, "P1", ["تصاميم"]);
  assert.equal(a, b, "reuses existing folder");
  t = await D.ensurePath(cfg, "P1", ["المهام", "Bob's task"]);
  assert.equal(files.get(t).name, "Bob's task");
  assert.equal(await D.ensurePath(cfg, "P1", ["المهام", "Bob's task"]), t);
  assert.deepEqual((await D.trailOf(cfg, t)).map((x) => x.name), ["Homera (قديم)", "المهام", "Bob's task"]);
});

test("رفض أي عنصر خارج المجلد الرئيسي", async () => {
  await assert.rejects(D.trailOf(cfg, "OUT"), /خارج المجلد الرئيسي/);
  await assert.rejects(D.ensurePath(cfg, "OUT", ["x"]), /خارج/);
  await assert.rejects(D.startUpload(cfg, { parent: "OUT", name: "a.pdf" }), /خارج/);
  await assert.rejects(D.trash(cfg, "OUT"), /خارج/);
});

test("جلسة الرفع المباشر لـ Google", async () => {
  const url = await D.startUpload(cfg, { parent: a, name: "logo.png", mime: "image/png", size: 123, origin: "https://app.example" });
  assert.equal(url, "https://upload.example/session/123");
  assert.equal(lastUploadInit.query.uploadType, "resumable");
  assert.deepEqual(lastUploadInit.body, { name: "logo.png", parents: [a] });
  assert.equal(lastUploadInit.headers["x-upload-content-type"], "image/png");
  assert.equal(lastUploadInit.headers["x-upload-content-length"], "123");
  assert.equal(lastUploadInit.headers.origin, "https://app.example");
  // upload to root
  await D.startUpload(cfg, { parent: "root", name: "r.txt" });
  assert.deepEqual(lastUploadInit.body.parents, ["ROOT"]);
});

test("الحذف ينقل لسلة المحذوفات", async () => {
  await D.trash(cfg, t);
  assert.equal(files.get(t).trashed, true);
  assert.equal((await D.listChildren(cfg, files.get(t).parents[0])).length, 0);
});
