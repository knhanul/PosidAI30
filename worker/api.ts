export interface HostedEnv {
  DB: D1Database;
  BUCKET: R2Bucket;
}

type HostedUser = { email: string; displayName: string };
type SqlValue = string | number | null;

type PostRow = {
  id: string;
  slug: string;
  category: string;
  title: string;
  summary: string;
  body_markdown: string;
  content_format: "markdown" | "html";
  topics_json: string;
  key_points_json: string;
  status: "draft" | "published";
  is_featured: number;
  show_on_home: number;
  thumbnail_type: "preset" | "webdav";
  thumbnail_key: string | null;
  thumbnail_filename: string | null;
  thumbnail_content_type: string | null;
  service_status: string | null;
  service_audience: string | null;
  service_url: string | null;
  author_email: string;
  author_name: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
};

type AttachmentRow = {
  id: string;
  post_id: string;
  filename: string;
  storage_key: string;
  content_type: string;
  size: number;
  created_at: string;
};

const CATEGORIES = new Set(["news", "learn", "use", "together"]);
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
let schemaReady: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
    title TEXT NOT NULL, summary TEXT NOT NULL, body_markdown TEXT NOT NULL, content_format TEXT NOT NULL DEFAULT 'markdown',
    topics_json TEXT NOT NULL DEFAULT '[]', key_points_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft',
    is_featured INTEGER NOT NULL DEFAULT 0, show_on_home INTEGER NOT NULL DEFAULT 1, thumbnail_type TEXT NOT NULL DEFAULT 'preset',
    thumbnail_key TEXT, thumbnail_filename TEXT, thumbnail_content_type TEXT,
    service_status TEXT, service_audience TEXT, service_url TEXT,
    author_email TEXT NOT NULL, author_name TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, deleted_at TEXT
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_unique ON posts(slug)",
  "CREATE INDEX IF NOT EXISTS posts_status_idx ON posts(status)",
  "CREATE INDEX IF NOT EXISTS posts_category_idx ON posts(category)",
  "CREATE INDEX IF NOT EXISTS posts_updated_at_idx ON posts(updated_at)",
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL, filename TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL, size INTEGER NOT NULL,
    created_at TEXT NOT NULL, FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS attachments_post_id_idx ON attachments(post_id)",
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    email TEXT PRIMARY KEY, csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_email TEXT NOT NULL, action TEXT NOT NULL,
    target_type TEXT NOT NULL, target_id TEXT NOT NULL, detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at)",
];

async function ensureSchema(env: HostedEnv) {
  schemaReady ??= env.DB.batch(schemaStatements.map((sql) => env.DB.prepare(sql))).then(() => undefined).catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
  try { await env.DB.prepare("ALTER TABLE posts ADD COLUMN content_format TEXT NOT NULL DEFAULT 'markdown'").run(); } catch {}
  try { await env.DB.prepare("ALTER TABLE posts ADD COLUMN key_points_json TEXT NOT NULL DEFAULT '[]'").run(); } catch {}
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function error(detail: string, status = 400) {
  return json({ detail }, status);
}

function now() {
  return new Date().toISOString();
}

function authenticatedUser(request: Request): HostedUser | null {
  const email = request.headers.get("oai-authenticated-user-email")?.trim();
  if (!email) return null;
  let displayName = email;
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(encodedName); } catch { /* email fallback */ }
  }
  return { email, displayName };
}

function requireUser(request: Request): HostedUser | Response {
  return authenticatedUser(request) ?? error("관리자 권한으로 로그인해야 합니다.", 401);
}

async function issueAuth(request: Request, env: HostedEnv) {
  const user = requireUser(request);
  if (user instanceof Response) return user;
  await ensureSchema(env);
  const current = await env.DB.prepare("SELECT csrf_token, expires_at FROM auth_sessions WHERE email = ?").bind(user.email).first<{ csrf_token: string; expires_at: string }>();
  let token = current?.csrf_token;
  if (!token || !current || current.expires_at <= now()) {
    token = crypto.randomUUID() + crypto.randomUUID();
    const updatedAt = now();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(`INSERT INTO auth_sessions(email, csrf_token, expires_at, updated_at)
      VALUES(?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET csrf_token=excluded.csrf_token,
      expires_at=excluded.expires_at, updated_at=excluded.updated_at`).bind(user.email, token, expiresAt, updatedAt).run();
  }
  return json({ user: { id: 1, username: user.email, display_name: user.displayName }, csrf_token: token });
}

async function requireCsrf(request: Request, env: HostedEnv): Promise<HostedUser | Response> {
  const user = requireUser(request);
  if (user instanceof Response) return user;
  const supplied = request.headers.get("X-CSRF-Token");
  if (!supplied) return error("요청 검증값이 없습니다.", 403);
  const session = await env.DB.prepare("SELECT csrf_token, expires_at FROM auth_sessions WHERE email = ?").bind(user.email).first<{ csrf_token: string; expires_at: string }>();
  if (!session || session.expires_at <= now() || session.csrf_token !== supplied) return error("요청 검증값이 올바르지 않습니다.", 403);
  return user;
}

async function audit(env: HostedEnv, user: HostedUser, action: string, targetType: string, targetId: string, detail: Record<string, unknown> = {}) {
  try {
    await env.DB.prepare(`INSERT INTO audit_logs(user_email, action, target_type, target_id, detail_json, created_at)
      VALUES(?, ?, ?, ?, ?, ?)`).bind(user.email, action, targetType, targetId, JSON.stringify(detail), now()).run();
  } catch { /* primary action stays successful if logging fails */ }
}

const ALLOWED_HTML_TAGS = new Set(["p", "br", "h2", "h3", "strong", "em", "u", "s", "ul", "ol", "li", "blockquote", "a", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td", "pre", "code", "hr"]);

function sanitizeHtml(value: string) {
  return value.replace(/<[^>]*>/g, (tag) => {
    const match = tag.match(/^<\/?\s*([a-z0-9]+)/i);
    if (!match || !ALLOWED_HTML_TAGS.has(match[1].toLowerCase())) return "";
    if (/^<\s*\//.test(tag)) return `</${match[1].toLowerCase()}>`;
    if (match[1].toLowerCase() === "br" || match[1].toLowerCase() === "hr") return `<${match[1].toLowerCase()}>`;
    const attrs = [...tag.matchAll(/\s+(href|src|alt)=["']([^"']*)["']/gi)].filter((item) => !/^(href|src)$/i.test(item[1]) || /^(https?:\/\/|\/)/i.test(item[2])).map((item) => ` ${item[1].toLowerCase()}="${item[2].replace(/["<>]/g, "")}"`).join("");
    return `<${match[1].toLowerCase()}${attrs}>`;
  }).replace(/javascript:/gi, "");
}

function safeTopics(value: unknown) {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  for (const item of value) {
    const topic = String(item).trim().replace(/^#/, "").slice(0, 40);
    if (topic && !output.includes(topic)) output.push(topic);
    if (output.length === 10) break;
  }
  return output;
}

function parseKeyPoints(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String).slice(0, 3) : []; } catch { return []; }
}

function parseTopics(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function safeFilename(value: string) {
  const name = value.split(/[\\/]/).pop()?.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180);
  return name || "file";
}

function attachmentPayload(file: AttachmentRow) {
  return {
    id: file.id, filename: file.filename, content_type: file.content_type, size: file.size,
    download_url: `/api/attachments/${file.id}/download`,
  };
}

function postPayload(post: PostRow, files: AttachmentRow[], admin = false) {
  return {
    id: post.id, slug: post.slug, category: post.category, title: post.title, summary: post.summary,
    body_markdown: post.body_markdown, content_format: post.content_format, topics: parseTopics(post.topics_json), key_points: parseKeyPoints(post.key_points_json), status: post.status,
    is_featured: Boolean(post.is_featured && post.show_on_home), show_on_home: Boolean(post.show_on_home), thumbnail_type: post.thumbnail_type,
    thumbnail_url: post.thumbnail_key ? (admin ? `/api/admin/posts/${post.id}/thumbnail` : `/api/posts/${encodeURIComponent(post.slug)}/thumbnail`) : null,
    service_status: post.service_status, service_audience: post.service_audience, service_url: post.service_url,
    author_name: post.author_name, created_at: post.created_at, updated_at: post.updated_at,
    published_at: post.published_at, attachments: files.map(attachmentPayload),
  };
}

function groupAttachments(files: AttachmentRow[]) {
  const grouped = new Map<string, AttachmentRow[]>();
  for (const file of files) grouped.set(file.post_id, [...(grouped.get(file.post_id) ?? []), file]);
  return grouped;
}

async function listPosts(request: Request, env: HostedEnv, admin: boolean) {
  let sql = "SELECT * FROM posts WHERE deleted_at IS NULL";
  const bindings: SqlValue[] = [];
  const url = new URL(request.url);
  if (!admin) sql += " AND status = 'published'";
  if (!admin && url.searchParams.get("home") === "true") sql += " AND show_on_home = 1";
  const category = url.searchParams.get("category");
  if (category) {
    if (!CATEGORIES.has(category)) return error("지원하지 않는 카테고리입니다.");
    sql += " AND category = ?"; bindings.push(category);
  }
  const query = url.searchParams.get("q")?.trim().slice(0, 100);
  if (query) {
    sql += " AND (title LIKE ? OR summary LIKE ? OR body_markdown LIKE ?)";
    const pattern = `%${query}%`; bindings.push(pattern, pattern, pattern);
  }
  sql += admin ? " ORDER BY updated_at DESC LIMIT 500" : " ORDER BY is_featured DESC, COALESCE(published_at, created_at) DESC LIMIT 200";
  const postRows = await env.DB.prepare(sql).bind(...bindings).all<PostRow>();
  const fileSql = admin
    ? "SELECT a.* FROM attachments a JOIN posts p ON p.id=a.post_id WHERE p.deleted_at IS NULL ORDER BY a.created_at"
    : "SELECT a.* FROM attachments a JOIN posts p ON p.id=a.post_id WHERE p.deleted_at IS NULL AND p.status='published' ORDER BY a.created_at";
  const fileRows = await env.DB.prepare(fileSql).all<AttachmentRow>();
  const grouped = groupAttachments(fileRows.results);
  return json({ items: postRows.results.map((post: PostRow) => postPayload(post, grouped.get(post.id) ?? [], admin)) });
}

async function getPostBySlug(slug: string, env: HostedEnv) {
  const post = await env.DB.prepare("SELECT * FROM posts WHERE slug=? AND status='published' AND deleted_at IS NULL").bind(slug).first<PostRow>();
  if (!post) return error("글을 찾을 수 없습니다.", 404);
  const files = await env.DB.prepare("SELECT * FROM attachments WHERE post_id=? ORDER BY created_at").bind(post.id).all<AttachmentRow>();
  return json(postPayload(post, files.results));
}

type ValidPostInput = {
  slug: string | null; category: string; title: string; summary: string; bodyMarkdown: string; contentFormat: "markdown" | "html";
  topics: string[]; keyPoints: string[]; isFeatured: boolean; showOnHome: boolean; thumbnailType: "preset" | "webdav";
  serviceStatus: string | null; serviceAudience: string | null; serviceUrl: string | null;
};

async function readPostInput(request: Request): Promise<ValidPostInput | Response> {
  let raw: Record<string, unknown>;
  try { raw = await request.json() as Record<string, unknown>; } catch { return error("글 데이터 형식이 올바르지 않습니다."); }
  const rawSlug = raw.slug ? String(raw.slug).trim().toLowerCase().replace(/^-+|-+$/g, "") : "";
  const slug = rawSlug || null;
  const category = String(raw.category ?? "");
  const title = String(raw.title ?? "").trim();
  const summary = String(raw.summary ?? "").trim();
  const contentFormat = raw.content_format === "html" ? "html" : "markdown";
  const bodyMarkdown = String(raw.body_markdown ?? "").trim();
  const safeBody = contentFormat === "html" ? sanitizeHtml(bodyMarkdown) : bodyMarkdown;
  const thumbnailValue = String(raw.thumbnail_type ?? "preset");
  const keyPoints = Array.isArray(raw.key_points) ? raw.key_points.map((item) => String(item).trim().slice(0, 160)).filter(Boolean).slice(0, 3) : [];
  if (slug !== null && (slug.length > 140 || !/^[a-z0-9가-힣-]+$/.test(slug))) return error("글 주소는 한글·영문 소문자·숫자·하이픈만 사용할 수 있습니다.");
  if (!CATEGORIES.has(category)) return error("지원하지 않는 카테고리입니다.");
  if (!title || title.length > 180) return error("제목은 1~180자로 입력해 주세요.");
  if (!summary || summary.length > 400) return error("한 줄 소개는 1~400자로 입력해 주세요.");
  if (!safeBody || safeBody.length > 200_000) return error("본문을 입력해 주세요.");
  if (thumbnailValue !== "preset" && thumbnailValue !== "webdav") return error("대표 이미지 방식이 올바르지 않습니다.");
  const serviceUrl = raw.service_url ? String(raw.service_url).trim().slice(0, 2000) : null;
  if (serviceUrl) {
    try { const parsed = new URL(serviceUrl); if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error(); } catch { return error("서비스 주소는 http 또는 https 주소여야 합니다."); }
  }
  return {
    slug, category, title, summary, bodyMarkdown: safeBody, contentFormat, topics: safeTopics(raw.topics), keyPoints,
    isFeatured: Boolean(raw.is_featured) && Boolean(raw.show_on_home ?? true), showOnHome: Boolean(raw.show_on_home ?? true), thumbnailType: thumbnailValue,
    serviceStatus: raw.service_status ? String(raw.service_status).trim().slice(0, 30) : null,
    serviceAudience: raw.service_audience ? String(raw.service_audience).trim().slice(0, 300) : null,
    serviceUrl,
  };
}

async function loadAdminPost(id: string, env: HostedEnv) {
  return env.DB.prepare("SELECT * FROM posts WHERE id=? AND deleted_at IS NULL").bind(id).first<PostRow>();
}

async function loadPostPayload(id: string, env: HostedEnv) {
  const post = await loadAdminPost(id, env);
  if (!post) return null;
  const files = await env.DB.prepare("SELECT * FROM attachments WHERE post_id=? ORDER BY created_at").bind(id).all<AttachmentRow>();
  return postPayload(post, files.results, true);
}

async function createPost(request: Request, env: HostedEnv, user: HostedUser) {
  const input = await readPostInput(request);
  if (input instanceof Response) return input;
  const id = crypto.randomUUID();
  const timestamp = now();
  const publishedAt = timestamp;
  const slug = input.slug || `post-${timestamp.replace(/[-:TZ.]/g, "").slice(0, 14)}-${id.slice(0, 6)}`;
  try {
    await env.DB.prepare(`INSERT INTO posts(
      id,slug,category,title,summary,body_markdown,content_format,topics_json,key_points_json,status,is_featured,show_on_home,thumbnail_type,
      service_status,service_audience,service_url,author_email,author_name,created_at,updated_at,published_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, slug, input.category, input.title, input.summary, input.bodyMarkdown, input.contentFormat, JSON.stringify(input.topics), JSON.stringify(input.keyPoints),
      "published", input.isFeatured ? 1 : 0, input.showOnHome ? 1 : 0, input.thumbnailType, input.serviceStatus, input.serviceAudience,
      input.serviceUrl, user.email, user.displayName, timestamp, timestamp, publishedAt,
    ).run();
  } catch (caught) {
    if (String(caught).toLowerCase().includes("unique")) return error("같은 글 주소가 이미 사용 중입니다.", 409);
    throw caught;
  }
  if (input.isFeatured) await env.DB.prepare("UPDATE posts SET is_featured=0 WHERE id<>? AND deleted_at IS NULL").bind(id).run();
  await audit(env, user, "post.create", "post", id, { show_on_home: input.showOnHome });
  return json(await loadPostPayload(id, env), 201);
}

async function updatePost(request: Request, env: HostedEnv, user: HostedUser, id: string) {
  const existing = await loadAdminPost(id, env);
  if (!existing) return error("글을 찾을 수 없습니다.", 404);
  const input = await readPostInput(request);
  if (input instanceof Response) return input;
  const timestamp = now();
  const publishedAt = existing.published_at ?? timestamp;
  const slug = input.slug ?? existing.slug;
  try {
    await env.DB.prepare(`UPDATE posts SET slug=?,category=?,title=?,summary=?,body_markdown=?,content_format=?,topics_json=?,key_points_json=?,
      status=?,is_featured=?,show_on_home=?,thumbnail_type=?,service_status=?,service_audience=?,service_url=?,updated_at=?,published_at=? WHERE id=?`).bind(
      slug, input.category, input.title, input.summary, input.bodyMarkdown, input.contentFormat, JSON.stringify(input.topics), JSON.stringify(input.keyPoints),
      "published", input.isFeatured ? 1 : 0, input.showOnHome ? 1 : 0, input.thumbnailType, input.serviceStatus, input.serviceAudience,
      input.serviceUrl, timestamp, publishedAt, id,
    ).run();
  } catch (caught) {
    if (String(caught).toLowerCase().includes("unique")) return error("같은 글 주소가 이미 사용 중입니다.", 409);
    throw caught;
  }
  if (input.isFeatured) await env.DB.prepare("UPDATE posts SET is_featured=0 WHERE id<>? AND deleted_at IS NULL").bind(id).run();
  await audit(env, user, "post.update", "post", id, { show_on_home: input.showOnHome });
  return json(await loadPostPayload(id, env));
}

async function deletePost(env: HostedEnv, user: HostedUser, id: string) {
  const existing = await loadAdminPost(id, env);
  if (!existing) return error("글을 찾을 수 없습니다.", 404);
  await env.DB.prepare("UPDATE posts SET deleted_at=?, is_featured=0, updated_at=? WHERE id=?").bind(now(), now(), id).run();
  await audit(env, user, "post.soft_delete", "post", id);
  return new Response(null, { status: 204 });
}

async function r2Response(env: HostedEnv, key: string, contentType: string, filename?: string) {
  const object = await env.BUCKET.get(key);
  if (!object) return error("파일을 찾을 수 없습니다.", 404);
  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, max-age=300", ETag: object.httpEtag });
  if (filename) headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename(filename))}`);
  return new Response(object.body, { headers });
}

async function thumbnailBySlug(env: HostedEnv, slug: string) {
  const post = await env.DB.prepare("SELECT thumbnail_key, thumbnail_content_type FROM posts WHERE slug=? AND status='published' AND deleted_at IS NULL").bind(slug).first<{ thumbnail_key: string | null; thumbnail_content_type: string | null }>();
  if (!post?.thumbnail_key) return error("대표 이미지를 찾을 수 없습니다.", 404);
  return r2Response(env, post.thumbnail_key, post.thumbnail_content_type ?? "image/jpeg");
}

async function adminThumbnail(env: HostedEnv, id: string) {
  const post = await env.DB.prepare("SELECT thumbnail_key, thumbnail_content_type FROM posts WHERE id=? AND deleted_at IS NULL").bind(id).first<{ thumbnail_key: string | null; thumbnail_content_type: string | null }>();
  if (!post?.thumbnail_key) return error("대표 이미지를 찾을 수 없습니다.", 404);
  return r2Response(env, post.thumbnail_key, post.thumbnail_content_type ?? "image/jpeg");
}

async function uploadThumbnail(request: Request, env: HostedEnv, user: HostedUser, id: string) {
  const post = await loadAdminPost(id, env);
  if (!post) return error("글을 찾을 수 없습니다.", 404);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return error("대표 이미지 파일을 선택해 주세요.");
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return error("대표 이미지는 JPG, PNG, WebP만 사용할 수 있습니다.", 415);
  if (!file.size || file.size > MAX_THUMBNAIL_BYTES) return error("대표 이미지는 10MB를 초과할 수 없습니다.", 413);
  const filename = safeFilename(file.name || "thumbnail");
  const key = `posts/${id}/thumbnail/${crypto.randomUUID()}-${filename}`;
  await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  try {
    await env.DB.prepare(`UPDATE posts SET thumbnail_key=?, thumbnail_filename=?, thumbnail_content_type=?,
      thumbnail_type='webdav', updated_at=? WHERE id=?`).bind(key, filename, file.type, now(), id).run();
  } catch (caught) { await env.BUCKET.delete(key); throw caught; }
  if (post.thumbnail_key && post.thumbnail_key !== key) await env.BUCKET.delete(post.thumbnail_key);
  await audit(env, user, "thumbnail.upload", "post", id, { filename });
  return json(await loadPostPayload(id, env));
}

async function uploadAttachments(request: Request, env: HostedEnv, user: HostedUser, id: string) {
  const post = await loadAdminPost(id, env);
  if (!post) return error("글을 찾을 수 없습니다.", 404);
  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length || files.length > 10) return error("첨부파일은 한 번에 1~10개를 선택해 주세요.");
  for (const file of files) if (!file.size || file.size > MAX_ATTACHMENT_BYTES) return error(`${safeFilename(file.name)}은 100MB를 초과할 수 없습니다.`, 413);
  const created: AttachmentRow[] = [];
  try {
    for (const file of files) {
      const attachmentId = crypto.randomUUID();
      const filename = safeFilename(file.name);
      const key = `posts/${id}/attachments/${attachmentId}-${filename}`;
      await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
      created.push({ id: attachmentId, post_id: id, filename, storage_key: key, content_type: (file.type || "application/octet-stream").slice(0, 120), size: file.size, created_at: now() });
    }
    await env.DB.batch(created.map((file) => env.DB.prepare(`INSERT INTO attachments(id,post_id,filename,storage_key,content_type,size,created_at)
      VALUES(?,?,?,?,?,?,?)`).bind(file.id, file.post_id, file.filename, file.storage_key, file.content_type, file.size, file.created_at)));
  } catch (caught) {
    await Promise.all(created.map((file) => env.BUCKET.delete(file.storage_key)));
    throw caught;
  }
  await audit(env, user, "attachment.upload", "post", id, { files: created.map((file) => file.filename) });
  return json(created.map(attachmentPayload), 201);
}

async function downloadAttachment(env: HostedEnv, id: string) {
  const file = await env.DB.prepare(`SELECT a.* FROM attachments a JOIN posts p ON p.id=a.post_id
    WHERE a.id=? AND p.status='published' AND p.deleted_at IS NULL`).bind(id).first<AttachmentRow>();
  if (!file) return error("첨부파일을 찾을 수 없습니다.", 404);
  return r2Response(env, file.storage_key, file.content_type, file.filename);
}

async function deleteAttachment(env: HostedEnv, user: HostedUser, id: string) {
  const file = await env.DB.prepare("SELECT * FROM attachments WHERE id=?").bind(id).first<AttachmentRow>();
  if (!file) return error("첨부파일을 찾을 수 없습니다.", 404);
  await env.BUCKET.delete(file.storage_key);
  await env.DB.prepare("DELETE FROM attachments WHERE id=?").bind(id).run();
  await audit(env, user, "attachment.delete", "attachment", id, { filename: file.filename });
  return new Response(null, { status: 204 });
}

function match(pathname: string, expression: RegExp) {
  const result = pathname.match(expression);
  if (!result) return null;
  try { return decodeURIComponent(result[1]); } catch { return null; }
}

export async function handleHostedApi(request: Request, env: HostedEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  try {
    await ensureSchema(env);
    if (url.pathname === "/api/health" && request.method === "GET") return json({ status: "ok", service: "Posid AI담당관3.0 hosted API" });
    if (url.pathname === "/api/auth/me" && request.method === "GET") return issueAuth(request, env);
    if (url.pathname === "/api/auth/login" && request.method === "POST") return issueAuth(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const user = await requireCsrf(request, env); if (user instanceof Response) return user;
      await env.DB.prepare("DELETE FROM auth_sessions WHERE email=?").bind(user.email).run();
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/api/posts" && request.method === "GET") return listPosts(request, env, false);
    if (url.pathname === "/api/admin/posts" && request.method === "GET") {
      const user = requireUser(request); if (user instanceof Response) return user;
      return listPosts(request, env, true);
    }
    if (url.pathname === "/api/admin/posts" && request.method === "POST") {
      const user = await requireCsrf(request, env); if (user instanceof Response) return user;
      return createPost(request, env, user);
    }

    const publicThumbnailSlug = match(url.pathname, /^\/api\/posts\/([^/]+)\/thumbnail$/);
    if (publicThumbnailSlug && request.method === "GET") return thumbnailBySlug(env, publicThumbnailSlug);
    const publicSlug = match(url.pathname, /^\/api\/posts\/([^/]+)$/);
    if (publicSlug && request.method === "GET") return getPostBySlug(publicSlug, env);
    const publicAttachmentId = match(url.pathname, /^\/api\/attachments\/([^/]+)\/download$/);
    if (publicAttachmentId && request.method === "GET") return downloadAttachment(env, publicAttachmentId);

    const adminThumbnailId = match(url.pathname, /^\/api\/admin\/posts\/([^/]+)\/thumbnail$/);
    if (adminThumbnailId && request.method === "GET") {
      const user = requireUser(request); if (user instanceof Response) return user;
      return adminThumbnail(env, adminThumbnailId);
    }
    if (adminThumbnailId && request.method === "POST") {
      const user = await requireCsrf(request, env); if (user instanceof Response) return user;
      return uploadThumbnail(request, env, user, adminThumbnailId);
    }
    const attachmentPostId = match(url.pathname, /^\/api\/admin\/posts\/([^/]+)\/attachments$/);
    if (attachmentPostId && request.method === "POST") {
      const user = await requireCsrf(request, env); if (user instanceof Response) return user;
      return uploadAttachments(request, env, user, attachmentPostId);
    }
    const adminPostId = match(url.pathname, /^\/api\/admin\/posts\/([^/]+)$/);
    if (adminPostId && request.method === "PUT") {
      const user = await requireCsrf(request, env); if (user instanceof Response) return user;
      return updatePost(request, env, user, adminPostId);
    }
    if (adminPostId && request.method === "DELETE") {
      const user = await requireCsrf(request, env); if (user instanceof Response) return user;
      return deletePost(env, user, adminPostId);
    }
    const adminAttachmentId = match(url.pathname, /^\/api\/admin\/attachments\/([^/]+)$/);
    if (adminAttachmentId && request.method === "DELETE") {
      const user = await requireCsrf(request, env); if (user instanceof Response) return user;
      return deleteAttachment(env, user, adminAttachmentId);
    }
    return error("API 경로를 찾을 수 없습니다.", 404);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return error(`요청을 처리하지 못했습니다. ${message}`, 500);
  }
}
