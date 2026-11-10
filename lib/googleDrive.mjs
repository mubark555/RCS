// اتصال الخادم بـ Google Drive — بدون مكتبات إضافية. طريقتان (المتغيّرات في بيئة Vercel، لا تُكشف للمتصفح):
//
// 1) ربط حساب Google (Gmail عادي): GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET
//    صاحب الحساب يضغط «ربط حساب Google» مرة وحدة، ورمز التحديث يُحفظ مشفّراً في app_settings
//    (أو يوضع مباشرة في GOOGLE_OAUTH_REFRESH_TOKEN). المجلد الرئيسي يُختار عند الربط.
// 2) حساب خدمة (يحتاج Shared Drive في Google Workspace):
//    GOOGLE_SERVICE_ACCOUNT_JSON (أو GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY) + GOOGLE_DRIVE_ROOT_ID
//
// كل العمليات محصورة داخل المجلد الرئيسي.

import crypto from "node:crypto";

const API = process.env.GOOGLE_API_BASE || "https://www.googleapis.com";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const AUTH_URL = process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/drive";
export const FOLDER_MIME = "application/vnd.google-apps.folder";
const FIELDS = "id,name,mimeType,size,modifiedTime,webViewLink,iconLink,parents,lastModifyingUser(displayName)";

export function driveConfig(env = process.env) {
  let email = env.GOOGLE_SA_EMAIL;
  let key = env.GOOGLE_SA_PRIVATE_KEY;
  const raw = (env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (raw) {
    try {
      const j = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
      email = j.client_email;
      key = j.private_key;
    } catch {}
  }
  if (key) key = key.replace(/\\n/g, "\n");
  const root = (env.GOOGLE_DRIVE_ROOT_ID || "").trim();
  if (email && key) return { mode: "sa", email, key, root };
  const clientId = (env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = (env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) return { mode: "oauth", clientId, clientSecret, root, refreshToken: (env.GOOGLE_OAUTH_REFRESH_TOKEN || "").trim() };
  return null;
}

// جاهز للعمل: مجلد رئيسي + (حساب خدمة أو حساب Google مربوط)
export const driveReady = (cfg) => Boolean(cfg && cfg.root && (cfg.mode === "sa" || cfg.refreshToken));

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function signJwt(cfg, now = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: cfg.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claim}`).sign(cfg.key);
  return `${head}.${claim}.${b64url(sig)}`;
}

async function tokenRequest(params) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return { r, j: await r.json().catch(() => ({})) };
}

let _token = null; // { who, value, exp }
async function accessToken(cfg) {
  const who = cfg.mode === "sa" ? cfg.email : crypto.createHash("sha256").update(cfg.refreshToken || "").digest("hex");
  if (_token && _token.who === who && _token.exp > Date.now() + 60000) return _token.value;
  const { r, j } = cfg.mode === "sa"
    ? await tokenRequest({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(cfg) })
    : await tokenRequest({ grant_type: "refresh_token", refresh_token: cfg.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  if (!r.ok || !j.access_token) {
    if (cfg.mode === "oauth" && j.error === "invalid_grant") throw Object.assign(new Error("انتهى ربط حساب Google أو أُلغي — أعد الربط من صفحة Google Drive."), { status: 401 });
    throw new Error(`تعذّر الدخول لـ Google: ${j.error_description || j.error || r.status}`);
  }
  _token = { who, value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return _token.value;
}

// ================= ربط حساب Google (OAuth) =================
export function authUrl(cfg, { redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // حتى يرجع رمز التحديث كل مرة
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

export async function exchangeCode(cfg, { code, redirectUri }) {
  const { r, j } = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  if (!r.ok) throw Object.assign(new Error(`تعذّر إكمال الربط: ${j.error_description || j.error || r.status}`), { status: 400 });
  if (!j.refresh_token) throw Object.assign(new Error("Google ما أرجع رمز التحديث — أعد المحاولة من زر «ربط حساب Google»."), { status: 400 });
  return j.refresh_token;
}

export async function revokeToken(token) {
  await fetch(`${TOKEN_URL.replace(/\/token$/, "")}/revoke`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }).catch(() => {});
}

// تشفير رمز التحديث قبل حفظه (المفتاح مشتق من سرّ الخادم فقط)
const sealKey = (cfg) => crypto.createHash("sha256").update(process.env.DRIVE_TOKEN_KEY || cfg.clientSecret).digest();
export function seal(cfg, text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", sealKey(cfg), iv);
  const ct = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
export function unseal(cfg, b64) {
  const buf = Buffer.from(String(b64), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", sealKey(cfg), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

// حالة الربط (state) موقّعة حتى لا يُكمل الربط إلا من بدأه
const hmac = (cfg, s) => crypto.createHmac("sha256", cfg.clientSecret).update(s).digest("base64url");
export function signState(cfg, obj) {
  const body = b64url(JSON.stringify(obj));
  return `${body}.${hmac(cfg, body)}`;
}
export function readState(cfg, state, now = Date.now()) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const want = hmac(cfg, body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const o = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return o.exp && o.exp > now ? o : null;
  } catch {
    return null;
  }
}

// معرّف المجلد من رابط Drive أو المعرّف نفسه
export function folderIdFrom(input) {
  const s = String(input || "").trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/^([\w-]{10,})$/);
  return m ? m[1] : "";
}

export async function accountOf(cfg) {
  const j = await g(cfg, "/drive/v3/about", { query: { fields: "user(emailAddress,displayName)" } });
  return j.user || {};
}

export async function folderInfo(cfg, id) {
  const f = await g(cfg, `/drive/v3/files/${encodeURIComponent(id)}`, { query: { fields: "id,name,mimeType,trashed" } });
  if (f.mimeType !== FOLDER_MIME || f.trashed) throw Object.assign(new Error("الرابط ليس لمجلد في Drive."), { status: 400 });
  return f;
}

async function g(cfg, path, { method = "GET", query = {}, body, headers = {}, raw = false } = {}) {
  const qs = new URLSearchParams({ supportsAllDrives: "true", ...query });
  const r = await fetch(`${API}${path}?${qs}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(cfg)}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return r;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `Google Drive: ${r.status}`), { status: r.status });
  return j;
}

// تنسيق عنصر Drive بنفس شكل بيئة الاختبار
export function toItem(f, root) {
  const folder = f.mimeType === FOLDER_MIME;
  return {
    id: f.id,
    kind: folder ? "folder" : "file",
    name: f.name,
    mime: folder ? "" : f.mimeType || "",
    size: f.size ? Number(f.size) : 0,
    created_at: f.modifiedTime || "",
    by: f.lastModifyingUser?.displayName || "",
    link: f.webViewLink || "",
    parent: (f.parents || [])[0] === root ? "root" : (f.parents || [])[0] || "",
  };
}

const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const realId = (cfg, id) => (!id || id === "root" ? cfg.root : id);

export async function listChildren(cfg, id) {
  const parent = realId(cfg, id);
  const out = [];
  let pageToken;
  do {
    const j = await g(cfg, "/drive/v3/files", {
      query: {
        q: `'${q(parent)}' in parents and trashed=false`,
        fields: `nextPageToken,files(${FIELDS})`,
        pageSize: "1000",
        orderBy: "folder,name",
        includeItemsFromAllDrives: "true",
        corpora: "allDrives",
        ...(pageToken ? { pageToken } : {}),
      },
    });
    out.push(...(j.files || []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out.map((f) => toItem(f, cfg.root));
}

// المسار من المجلد الرئيسي حتى العنصر [{id, name}] — ويرفض أي عنصر خارج المجلد الرئيسي
const _inRoot = new Map(); // id → trail (ذاكرة مؤقتة داخل نفس الخادم)
export async function trailOf(cfg, id) {
  if (!id || id === "root" || id === cfg.root) return [];
  const ck = `${cfg.root}:${id}`;
  if (_inRoot.has(ck)) return _inRoot.get(ck);
  const chain = [];
  let cur = id;
  for (let i = 0; i < 25; i++) {
    const f = await g(cfg, `/drive/v3/files/${encodeURIComponent(cur)}`, { query: { fields: "id,name,parents,trashed" } });
    if (f.trashed) break;
    chain.unshift({ id: f.id, name: f.name });
    const p = (f.parents || [])[0];
    if (!p) break;
    if (p === cfg.root) {
      _inRoot.set(ck, chain);
      return chain;
    }
    cur = p;
  }
  throw Object.assign(new Error("العنصر خارج المجلد الرئيسي للنظام."), { status: 403 });
}

// يرجع معرّف المجلد الأخير، وينشئ أي مجلد ناقص (يستخدم الموجود بنفس الاسم)
export async function ensurePath(cfg, parentId, names) {
  let parent = realId(cfg, parentId);
  if (parent !== cfg.root) await trailOf(cfg, parent);
  for (const name of names || []) {
    const found = await g(cfg, "/drive/v3/files", {
      query: {
        q: `'${q(parent)}' in parents and name='${q(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`,
        fields: "files(id)",
        includeItemsFromAllDrives: "true",
        corpora: "allDrives",
      },
    });
    parent = found.files?.[0]?.id || (await g(cfg, "/drive/v3/files", { method: "POST", query: { fields: "id" }, body: { name, mimeType: FOLDER_MIME, parents: [parent] } })).id;
  }
  return parent === cfg.root ? "root" : parent;
}

// جلسة رفع قابلة للاستئناف: المتصفح يرفع الملف لـ Google مباشرة (بدون حد حجم Vercel)
export async function startUpload(cfg, { parent, name, mime, size, origin }) {
  const folder = realId(cfg, parent);
  if (folder !== cfg.root) await trailOf(cfg, folder);
  const r = await g(cfg, "/upload/drive/v3/files", {
    method: "POST",
    raw: true,
    query: { uploadType: "resumable", fields: FIELDS },
    body: { name, parents: [folder] },
    headers: {
      "X-Upload-Content-Type": mime || "application/octet-stream",
      ...(size ? { "X-Upload-Content-Length": String(size) } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
  });
  const url = r.headers.get("location");
  if (!r.ok || !url) {
    const j = await r.json().catch(() => ({}));
    throw Object.assign(new Error(j?.error?.message || `تعذّر بدء الرفع (${r.status})`), { status: r.status });
  }
  return url;
}

// الحذف = نقل لسلة المحذوفات في Drive (قابل للاسترجاع)
export async function trash(cfg, id) {
  await trailOf(cfg, id);
  _inRoot.delete(`${cfg.root}:${id}`);
  await g(cfg, `/drive/v3/files/${encodeURIComponent(id)}`, { method: "PATCH", query: { fields: "id" }, body: { trashed: true } });
}
