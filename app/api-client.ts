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
export async function uploadNewPostInlineImage(file: File, csrf: string) { const body = new FormData(); body.append("file", file); return apiFetch<{ url: string }>("/api/inline-images", { method: "POST", headers: { "X-CSRF-Token": csrf }, body }); }
export async function uploadAttachments(id: string, files: File[], csrf: string) { const body = new FormData(); files.forEach((file) => body.append("files", file)); return apiFetch<ApiAttachment[]>(`/api/admin/posts/${id}/attachments`, { method: "POST", headers: { "X-CSRF-Token": csrf }, body }); }
export async function deleteAttachment(id: string, csrf: string) { return apiFetch<void>(`/api/admin/attachments/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } }); }
