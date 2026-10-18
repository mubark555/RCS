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
let n = 0, lastUploadInit = null, sawJwt = null, lastToken = null, revoked = null;
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  let body = ""; for await (const c of req) body += c;
  const json = (code, o, h = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...h }); res.end(JSON.stringify(o)); };
  if (u.pathname === "/token") {
    const f = new URLSearchParams(body);
    lastToken = Object.fromEntries(f);
    if (f.get("grant_type") === "authorization_code") return f.get("code") === "GOODCODE" ? json(200, { access_token: "TOK", refresh_token: "REFRESH-1", expires_in: 3600 }) : json(400, { error: "invalid_grant" });
    if (f.get("grant_type") === "refresh_token") return f.get("refresh_token") === "REFRESH-1" ? json(200, { access_token: "TOK", expires_in: 3600 }) : json(400, { error: "invalid_grant" });
    sawJwt = f.get("assertion");
    return json(200, { access_token: "TOK", expires_in: 3600 });
  }
  if (u.pathname === "/revoke") { revoked = new URLSearchParams(body).get("token"); res.writeHead(200); return res.end(); }
  if (u.pathname === "/drive/v3/about") return req.headers.authorization === "Bearer TOK" ? json(200, { user: { emailAddress: "owner@gmail.com", displayName: "Owner" } }) : json(401, {});
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

// ================= ربط حساب Google (OAuth) =================
const oauth = D.driveConfig({ GOOGLE_OAUTH_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "secret" });

test("ربط حساب Google: الإعداد غير جاهز قبل الربط وجاهز بعده", () => {
  assert.equal(oauth.mode, "oauth");
  assert.equal(D.driveReady(oauth), false);
  assert.equal(D.driveReady({ ...oauth, refreshToken: "x" }), false, "يحتاج مجلداً رئيسياً");
  assert.equal(D.driveReady({ ...oauth, refreshToken: "x", root: "ROOT" }), true);
  assert.equal(D.driveReady(cfg), true);
  assert.equal(D.driveConfig({ GOOGLE_OAUTH_CLIENT_ID: "x" }), null);
});

test("رابط موافقة Google يطلب رمز تحديث وصلاحية Drive", () => {
  const u = new URL(D.authUrl(oauth, { redirectUri: "https://app.example/drive", state: "S" }));
  const p = Object.fromEntries(u.searchParams);
  assert.equal(p.client_id, "cid.apps.googleusercontent.com");
  assert.equal(p.redirect_uri, "https://app.example/drive");
  assert.equal(p.access_type, "offline");
  assert.equal(p.prompt, "consent");
  assert.equal(p.scope, "https://www.googleapis.com/auth/drive");
  assert.equal(p.state, "S");
});

test("حالة الربط موقّعة: ترفض التلاعب والانتهاء", () => {
  const st = D.signState(oauth, { uid: "u1", root: "R", exp: Date.now() + 60000 });
  assert.equal(D.readState(oauth, st).uid, "u1");
  assert.equal(D.readState(oauth, st.replace(/.$/, (c) => (c === "A" ? "B" : "A"))), null);
  assert.equal(D.readState({ clientSecret: "other" }, st), null);
  assert.equal(D.readState(oauth, D.signState(oauth, { uid: "u1", exp: Date.now() - 1 })), null);
  assert.equal(D.readState(oauth, "garbage"), null);
});

test("رمز التحديث يُحفظ مشفّراً ولا يُفك بمفتاح آخر", () => {
  const enc = D.seal(oauth, "REFRESH-1");
  assert.ok(!enc.includes("REFRESH"));
  assert.equal(D.unseal(oauth, enc), "REFRESH-1");
  assert.throws(() => D.unseal({ clientSecret: "other" }, enc));
});

test("استخراج معرّف المجلد من رابط Drive", () => {
  assert.equal(D.folderIdFrom("https://drive.google.com/drive/folders/1AbCdEfGhIjK_lmn-OP?usp=sharing"), "1AbCdEfGhIjK_lmn-OP");
  assert.equal(D.folderIdFrom("https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjK"), "1AbCdEfGhIjK");
  assert.equal(D.folderIdFrom("1AbCdEfGhIjK_lmn"), "1AbCdEfGhIjK_lmn");
  assert.equal(D.folderIdFrom("https://example.com"), "");
});

test("إكمال الربط ثم العمل برمز التحديث، ورسالة واضحة لو أُلغي", async () => {
  const rt = await D.exchangeCode(oauth, { code: "GOODCODE", redirectUri: "https://app.example/drive" });
  assert.equal(rt, "REFRESH-1");
  assert.equal(lastToken.redirect_uri, "https://app.example/drive");
  await assert.rejects(D.exchangeCode(oauth, { code: "BAD", redirectUri: "x" }), /تعذّر إكمال الربط/);
  const linked = { ...oauth, refreshToken: rt, root: "ROOT" };
  assert.equal((await D.accountOf(linked)).emailAddress, "owner@gmail.com");
  assert.equal(lastToken.grant_type, "refresh_token");
  assert.equal((await D.folderInfo(linked, "P1")).name, "Homera (قديم)");
  assert.deepEqual((await D.listChildren(linked, "root")).map((x) => x.name), ["Homera (قديم)"]);
  await assert.rejects(D.accountOf({ ...linked, refreshToken: "REVOKED" }), /أعد الربط/);
  await D.revokeToken(rt);
  assert.equal(revoked, "REFRESH-1");
});
