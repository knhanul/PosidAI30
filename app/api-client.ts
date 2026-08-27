import type { CategorySlug, ContentBlock, Post } from "./content";

export type ApiAttachment = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  download_url: string;
};

export type ApiPost = {
  id: string;
  slug: string;
  category: CategorySlug;
  title: string;
  summary: string;
  body_markdown: string;
  content_format: "markdown" | "html";
  topics: string[];
  key_points: string[];
  status: "draft" | "published";
  is_featured: boolean;
  thumbnail_type: "preset" | "webdav";
  thumbnail_url: string | null;
  service_status: string | null;
  service_audience: string | null;
  service_url: string | null;
  author_name: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  show_on_home: boolean;
  attachments: ApiAttachment[];
  owned_by_current_user: boolean;
};

export type AdminUser = { id: number; username: string; display_name: string; display_name_confirmed: boolean; role: "admin" | "user" };
export type AuthState = { user: AdminUser; csrf_token: string; requires_display_name: boolean; suggested_display_name: string | null; kakao: { connected: boolean; nickname: string | null; connected_at: string | null } };

export type PostPayload = {
  category: CategorySlug;
  title: string;
  summary: string;
  body_markdown: string;
  content_format: "markdown" | "html";
  topics: string[];
  key_points: string[];
  is_featured: boolean;
  show_on_home: boolean;
  thumbnail_type: "preset" | "webdav";
  service_status: string | null;
  service_audience: string | null;
  service_url: string | null;
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { Accept: "application/json", ...init.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = Array.isArray(body?.detail)
      ? body.detail.map((item) => typeof item === "object" && item !== null && "msg" in item ? String(item.msg) : String(item)).join("; ")
      : typeof body?.detail === "string" ? body.detail : null;
    throw new Error(detail ?? `요청을 처리하지 못했습니다. (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function markdownToBlocks(markdown: string): ContentBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ContentBlock[] = [];
  let paragraph: string[] = [];
  let steps: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
    paragraph = [];
  };
  const flushSteps = () => {
    if (steps.length) blocks.push({ type: "steps", items: steps });
    steps = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushSteps(); continue; }
    if (line.startsWith("## ")) { flushParagraph(); flushSteps(); blocks.push({ type: "heading", text: line.slice(3).trim() }); continue; }
    const step = line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
    if (step) { flushParagraph(); steps.push(step[1]); continue; }
    if (line.startsWith("> TIP:")) {
      flushParagraph(); flushSteps();
      const [title, ...text] = line.slice(6).split("|");
      blocks.push({ type: "callout", title: title.trim() || "참고", text: text.join("|").trim() || title.trim() });
      continue;
    }
    flushSteps(); paragraph.push(line);
  }
  flushParagraph(); flushSteps();
  return blocks.length ? blocks : [{ type: "paragraph", text: "본문이 아직 작성되지 않았습니다." }];
}

export function toPublicPost(post: ApiPost): Post {
  const publishedDate = post.published_at ?? post.created_at;
  const age = Date.now() - new Date(publishedDate).getTime();
  return {
    id: post.id, slug: post.slug, category: post.category, title: post.title, summary: post.summary,
    topic: post.topics, keyPoints: post.key_points, date: new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(publishedDate)).replace(/\. /g, ".").replace(/\.$/, ""),
    readTime: `${Math.max(1, Math.ceil(post.body_markdown.replace(/<[^>]*>/g, " ").length / 700))}분`, author: post.author_name,
    featured: post.is_featured, new: age >= 0 && age <= 7 * 24 * 60 * 60 * 1000, status: post.status, showOnHome: post.show_on_home, ownedByCurrentUser: post.owned_by_current_user,
    thumbnailUrl: post.thumbnail_url, bodyMarkdown: post.body_markdown, contentFormat: post.content_format, bodyHtml: post.content_format === "html" ? post.body_markdown : undefined, body: markdownToBlocks(post.body_markdown),
    attachments: post.attachments.map((file) => ({ id: file.id, filename: file.filename, size: file.size, downloadUrl: file.download_url })),
    service: post.category === "together" ? { status: post.service_status === "사용 가능" ? "사용 가능" : "준비 중", audience: post.service_audience ?? "모든 구성원", actionLabel: "서비스 써보기", actionHref: post.service_url ?? "#service-guide" } : undefined,
  };
}

export async function listPublishedPosts(params: { category?: string; query?: string; homeOnly?: boolean } = {}) {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.query) query.set("q", params.query);
  if (params.homeOnly) query.set("home", "true");
  const data = await apiFetch<{ items: ApiPost[] }>(`/api/posts${query.size ? `?${query}` : ""}`);
  return data.items.map(toPublicPost);
}

export async function getPublishedPost(slug: string) { return toPublicPost(await apiFetch<ApiPost>(`/api/posts/${encodeURIComponent(slug)}`)); }
export async function login(username: string, password: string) { return apiFetch<AuthState>("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }); }
export async function unlinkKakao(csrf: string) { return apiFetch<void>("/api/auth/kakao/link", { method: "DELETE", headers: { "X-CSRF-Token": csrf } }); }
export async function getMe() { return apiFetch<AuthState>("/api/auth/me"); }
export async function updateDisplayName(displayName: string, csrf: string) { return apiFetch<AuthState>("/api/auth/display-name", { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ display_name: displayName }) }); }
export async function logout(csrf: string) { return apiFetch<void>("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": csrf } }); }
export async function listAdminPosts() { return (await apiFetch<{ items: ApiPost[] }>("/api/admin/posts")).items; }
export async function createPost(payload: PostPayload, csrf: string) { return apiFetch<ApiPost>("/api/admin/posts", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payload) }); }
export async function createPublicPost(payload: PostPayload, csrf: string) { return apiFetch<ApiPost>("/api/posts", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payload) }); }
export async function getUserPostForEdit(id: string) { return apiFetch<ApiPost>(`/api/posts/${id}/edit`); }
export async function updatePublicPost(id: string, payload: PostPayload, csrf: string) { return apiFetch<ApiPost>(`/api/posts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payload) }); }
export async function getCommunity(slug: string) { return apiFetch<{ likes: number; liked: boolean; bookmarked: boolean }>(`/api/posts/${encodeURIComponent(slug)}/community`); }
export async function toggleLike(id: string, csrf: string, liked: boolean) { return apiFetch<{ liked: boolean }>(`/api/posts/${id}/like`, { method: liked ? "DELETE" : "POST", headers: { "X-CSRF-Token": csrf } }); }
export async function toggleBookmark(id: string, csrf: string, bookmarked: boolean) { return apiFetch<{ bookmarked: boolean }>(`/api/posts/${id}/bookmark`, { method: bookmarked ? "DELETE" : "POST", headers: { "X-CSRF-Token": csrf } }); }
export type Comment = { id: string; body: string; author_name: string; created_at: string };
export async function listComments(id: string) { return (await apiFetch<{ items: Comment[] }>(`/api/posts/${id}/comments`)).items; }
export async function createComment(id: string, body: string, csrf: string) { return apiFetch<Comment>(`/api/posts/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ body }) }); }
export async function updatePost(id: string, payload: PostPayload, csrf: string) { return apiFetch<ApiPost>(`/api/admin/posts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payload) }); }
export async function deletePost(id: string, csrf: string) { return apiFetch<void>(`/api/admin/posts/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } }); }
export async function uploadThumbnail(id: string, file: File, csrf: string) { const body = new FormData(); body.append("file", file); return apiFetch<ApiPost>(`/api/admin/posts/${id}/thumbnail`, { method: "POST", headers: { "X-CSRF-Token": csrf }, body }); }
export async function uploadInlineImage(id: string, file: File, csrf: string) { const body = new FormData(); body.append("file", file); return apiFetch<{ url: string }>(`/api/posts/${id}/inline-images`, { method: "POST", headers: { "X-CSRF-Token": csrf }, body }); }
export async function uploadPublicThumbnail(id: string, file: File, csrf: string) { const body = new FormData(); body.append("file", file); return apiFetch<ApiPost>(`/api/posts/${id}/thumbnail`, { method: "POST", headers: { "X-CSRF-Token": csrf }, body }); }
export async function uploadNewPostInlineImage(file: File, csrf: string) { const body = new FormData(); body.append("file", file); return apiFetch<{ url: string }>("/api/inline-images", { method: "POST", headers: { "X-CSRF-Token": csrf }, body }); }
export async function uploadAttachments(id: string, files: File[], csrf: string) { const body = new FormData(); files.forEach((file) => body.append("files", file)); return apiFetch<ApiAttachment[]>(`/api/admin/posts/${id}/attachments`, { method: "POST", headers: { "X-CSRF-Token": csrf }, body }); }
export async function deleteAttachment(id: string, csrf: string) { return apiFetch<void>(`/api/admin/attachments/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } }); }

export type AiProjectFile = { id: string; kind: string; category: string | null; folder: string | null; title: string; description: string; filename: string; content_type: string; size: number; sha256: string; is_primary: boolean; download_count: number; download_url: string; deleted_at: string | null; created_at: string };
export type AiProjectRelease = { id: string; version: string; title: string; notes: string; release_date: string | null; is_latest: boolean; is_prerelease: boolean; download_count: number; created_at: string; files: AiProjectFile[] };
export type AiProjectResource = AiProjectFile;
export type AiProjectLink = { id?: string; label: string; url: string; link_type?: string; type?: string; position?: number };
export type AiProjectVisibility = "public" | "private" | "unlisted";
export type AiProject = {
  id: string; slug: string; owner_id: number; name: string; summary: string; description: string; website_url: string | null;
  project_type: string; visibility: AiProjectVisibility; categories: string[]; platforms: string[];
  icon_url: string | null; readme_markdown?: string; readme_html?: string; readme_download_url: string | null;
  created_at: string; updated_at: string; view_count: number; download_count: number; latest_release: AiProjectRelease | null;
  links?: AiProjectLink[]; resource_category_counts: Record<string, number>; resource_folders: string[];
  releases?: AiProjectRelease[]; resources?: AiProjectResource[];
  owned_by_current_user: boolean; is_admin: boolean; can_manage: boolean;
};
export type AiProjectListResponse = { items: AiProject[]; page: number; page_size: number; total: number; total_pages: number; types: string[]; platforms: string[]; can_create: boolean };
export type AiProjectPayload = { name: string; summary: string; description: string; website_url: string | null; project_type: string; visibility: AiProjectVisibility; categories: string[]; platforms: string[]; links: AiProjectLink[]; readme_markdown: string };
export type AiProjectFolderEntry = { name: string; path: string; is_dir: boolean; size: number | null; content_type: string | null };
export type UploadOptions = { onProgress?: (percent: number) => void; signal?: AbortSignal };

function xhrMultipart<T>(path: string, body: FormData, csrf: string, options: UploadOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path); xhr.withCredentials = true; xhr.setRequestHeader("Accept", "application/json"); xhr.setRequestHeader("X-CSRF-Token", csrf);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) options.onProgress?.(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error("네트워크 오류로 업로드하지 못했습니다."));
    xhr.onabort = () => reject(new DOMException("업로드가 취소되었습니다.", "AbortError"));
    xhr.onload = () => { let payload: (T & { detail?: unknown }) | undefined; try { payload = xhr.responseText ? JSON.parse(xhr.responseText) as T & { detail?: unknown } : undefined; } catch { payload = undefined; } if (xhr.status >= 200 && xhr.status < 300) { options.onProgress?.(100); resolve(payload as T); return; } const detail = payload?.detail; reject(new Error(typeof detail === "string" ? detail : `업로드를 처리하지 못했습니다. (${xhr.status})`)); };
    const abort = () => xhr.abort(); options.signal?.addEventListener("abort", abort, { once: true }); xhr.onloadend = () => options.signal?.removeEventListener("abort", abort); xhr.send(body);
  });
}

export async function listAiProjects(params: { q?: string; type?: string; platform?: string; sort?: string; page?: number; pageSize?: number } = {}) { const query = new URLSearchParams(); if (params.q) query.set("q", params.q); if (params.type) query.set("type", params.type); if (params.platform) query.set("platform", params.platform); if (params.sort) query.set("sort", params.sort); if (params.page) query.set("page", String(params.page)); if (params.pageSize) query.set("page_size", String(params.pageSize)); return apiFetch<AiProjectListResponse>(`/api/ai-projects${query.size ? `?${query}` : ""}`); }
export async function getAiProject(slug: string) { return apiFetch<AiProject>(`/api/ai-projects/${encodeURIComponent(slug)}`); }
export async function createAiProject(payload: AiProjectPayload, csrf: string) { return apiFetch<AiProject>("/api/ai-projects", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payload) }); }
export async function updateAiProject(slug: string, payload: AiProjectPayload, csrf: string) { return apiFetch<AiProject>(`/api/ai-projects/${encodeURIComponent(slug)}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payload) }); }
export async function deleteAiProject(slug: string, csrf: string) { return apiFetch<void>(`/api/ai-projects/${encodeURIComponent(slug)}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } }); }
export async function uploadAiProjectIcon(slug: string, file: File, csrf: string) { const body = new FormData(); body.append("file", file); return apiFetch<AiProject>(`/api/ai-projects/${encodeURIComponent(slug)}/icon`, { method: "POST", headers: { "X-CSRF-Token": csrf }, body }); }
export async function updateAiProjectReadme(slug: string, markdown: string, csrf: string) { return apiFetch<AiProject>(`/api/ai-projects/${encodeURIComponent(slug)}/readme`, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ markdown }) }); }
export async function createAiProjectRelease(slug: string, values: { version: string; title: string; release_date: string; notes: string; is_latest: boolean; is_prerelease: boolean; primary_file_index: number; files: File[] }, csrf: string, options?: UploadOptions) { const body = new FormData(); body.append("version", values.version); body.append("title", values.title); if (values.release_date) body.append("release_date", values.release_date); body.append("notes", values.notes); body.append("is_latest", String(values.is_latest)); body.append("is_prerelease", String(values.is_prerelease)); body.append("primary_file_index", String(values.primary_file_index)); values.files.forEach((file) => body.append("files", file)); return xhrMultipart<AiProjectRelease>(`/api/ai-projects/${encodeURIComponent(slug)}/releases`, body, csrf, options); }
export async function uploadAiProjectResources(slug: string, values: { category: string; title: string; description: string; folder: string; files: File[] }, csrf: string, options?: UploadOptions) { const body = new FormData(); body.append("category", values.category); body.append("title", values.title); body.append("description", values.description); body.append("folder", values.folder); values.files.forEach((file) => body.append("files", file)); return xhrMultipart<AiProjectResource[]>(`/api/ai-projects/${encodeURIComponent(slug)}/resources`, body, csrf, options); }
export async function deleteAiProjectRelease(slug: string, releaseId: string, csrf: string) { return apiFetch<void>(`/api/ai-projects/${encodeURIComponent(slug)}/releases/${encodeURIComponent(releaseId)}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } }); }
export async function deleteAiProjectResource(slug: string, resourceId: string, csrf: string) { return apiFetch<void>(`/api/ai-projects/${encodeURIComponent(slug)}/resources/${encodeURIComponent(resourceId)}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } }); }
export async function updateAiProjectResource(slug: string, resourceId: string, payload: { title?: string; description?: string; category?: string; folder?: string; filename?: string }, csrf: string) { return apiFetch<AiProjectResource>(`/api/ai-projects/${encodeURIComponent(slug)}/resources/${encodeURIComponent(resourceId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payload) }); }
export async function createAiProjectFolder(slug: string, path: string, csrf: string) { return apiFetch<{ path: string }>(`/api/ai-projects/${encodeURIComponent(slug)}/folders`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ path }) }); }
export async function listAiProjectFolder(slug: string, path = "") { const query = new URLSearchParams(); if (path) query.set("path", path); return apiFetch<AiProjectFolderEntry[]>(`/api/ai-projects/${encodeURIComponent(slug)}/folders${query.size ? `?${query}` : ""}`); }
export async function moveAiProjectFolder(slug: string, source: string, destination: string, csrf: string) { return apiFetch<{ path: string }>(`/api/ai-projects/${encodeURIComponent(slug)}/folders/move`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ source, destination }) }); }
export async function listAiProjectTrash(slug: string) { return apiFetch<{ items: AiProjectResource[] }>(`/api/ai-projects/${encodeURIComponent(slug)}/trash`); }
export async function restoreAiProjectResource(slug: string, resourceId: string, csrf: string) { return apiFetch<AiProjectResource>(`/api/ai-projects/${encodeURIComponent(slug)}/trash/${encodeURIComponent(resourceId)}/restore`, { method: "POST", headers: { "X-CSRF-Token": csrf } }); }
