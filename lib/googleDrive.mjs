// اتصال الخادم بـ Google Drive عبر حساب خدمة (Service Account) — بدون مكتبات إضافية.
// المتغيّرات في بيئة Vercel (لا تُكشف للمتصفح):
//   GOOGLE_SERVICE_ACCOUNT_JSON  ملف مفتاح حساب الخدمة كاملاً (JSON كما هو أو Base64)
//     أو بدلاً منه: GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY
//   GOOGLE_DRIVE_ROOT_ID         معرّف المجلد الرئيسي (كل العمليات محصورة داخله)

import crypto from "node:crypto";

const API = process.env.GOOGLE_API_BASE || "https://www.googleapis.com";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
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
  return email && key && root ? { email, key, root } : null;
}

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function signJwt(cfg, now = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: cfg.email, scope: "https://www.googleapis.com/auth/drive", aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claim}`).sign(cfg.key);
  return `${head}.${claim}.${b64url(sig)}`;
}

let _token = null; // { value, exp }
async function accessToken(cfg) {
  if (_token && _token.exp > Date.now() + 60000) return _token.value;
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(cfg) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`تعذّر الدخول لحساب الخدمة: ${j.error_description || j.error || r.status}`);
  _token = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return _token.value;
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
  if (_inRoot.has(id)) return _inRoot.get(id);
  const chain = [];
  let cur = id;
  for (let i = 0; i < 25; i++) {
    const f = await g(cfg, `/drive/v3/files/${encodeURIComponent(cur)}`, { query: { fields: "id,name,parents,trashed" } });
    if (f.trashed) break;
    chain.unshift({ id: f.id, name: f.name });
    const p = (f.parents || [])[0];
    if (!p) break;
    if (p === cfg.root) {
      _inRoot.set(id, chain);
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
  _inRoot.delete(id);
  await g(cfg, `/drive/v3/files/${encodeURIComponent(id)}`, { method: "PATCH", query: { fields: "id" }, body: { trashed: true } });
}
