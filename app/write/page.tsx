"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createPublicPost, getMe, getUserPostForEdit, updatePublicPost, uploadInlineImage, uploadNewPostInlineImage, type AuthState, type PostPayload } from "../api-client";
import { categories, type CategorySlug } from "../content";
import RichTextEditor from "../rich-text-editor";

const emptyBody = "<p></p>";

export default function WritePage() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit");
  const requestedCategory = params.get("category");
  const initialCategory = requestedCategory && Object.prototype.hasOwnProperty.call(categories, requestedCategory) ? requestedCategory as CategorySlug : "news";
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [form, setForm] = useState({ category: initialCategory, title: "", summary: "", body: emptyBody });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    let active = true;
    getMe().then(async (data) => {
      if (data.requires_display_name) { router.replace("/account/setup-name"); return; }
      if (!active) return;
      setAuth(data);
      if (!editId) setForm((current) => ({ ...current, category: initialCategory }));
      if (editId) {
        try {
          const post = await getUserPostForEdit(editId);
          if (active) setForm({ category: post.category, title: post.title, summary: post.summary, body: post.content_format === "html" ? post.body_markdown : `<p>${post.body_markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "</p><p>")}</p>` });
        } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "글을 불러오지 못했습니다."); }
      }
    }).catch(() => { if (active) router.replace("/?login=required"); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [editId, initialCategory, router]);

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!auth) return;
    if (!form.title.trim() || !form.summary.trim() || form.body === emptyBody) { setError("제목, 홈 요약, 본문을 입력해 주세요."); return; }
    if (imageUploading) { setError("이미지 업로드가 끝난 후 저장해 주세요."); return; }
    if (/src=["'](?:data:image|blob:)/i.test(form.body)) { setError("본문 이미지 업로드가 완료되지 않았습니다. 이미지를 다시 삽입해 주세요."); return; }
    setBusy(true); setError(""); setMessage("");
    const payload: PostPayload = { category: form.category, title: form.title, summary: form.summary, body_markdown: form.body, content_format: "html", topics: [], key_points: [], is_featured: false, show_on_home: true, thumbnail_type: "preset", service_status: null, service_audience: null, service_url: null };
    try { const saved = editId ? await updatePublicPost(editId, payload, auth.csrf_token) : await createPublicPost(payload, auth.csrf_token); setMessage(editId ? "글을 수정했습니다." : "글을 저장했습니다."); router.push(`/posts/${saved.slug}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "글을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  if (busy && !auth) return <main className="load-state"><strong>작성 화면을 준비하고 있습니다.</strong></main>;
  if (!auth) return <main className="admin-login-page"><section className="admin-login-card write-card"><Link href="/">← 홈으로</Link><span className="admin-kicker">COMMUNITY</span><h1>새 글 작성</h1><p>글을 작성하려면 먼저 로그인해 주세요.</p><a className="admin-primary kakao-login-button" href="/api/auth/kakao/login">카카오로 로그인</a></section></main>;
  return <main className="write-page"><div className="write-layout"><form className="write-card write-form" onSubmit={submit}><div className="write-head"><div><Link href="/">← 홈으로</Link><span className="admin-kicker">COMMUNITY</span><h1>{editId ? "글 수정" : "새 글 작성"}</h1></div><button className="admin-primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button></div><label><span>카테고리</span><select value={form.category} onChange={(event) => update("category", event.target.value as CategorySlug)}>{Object.entries(categories).map(([key, category]) => <option value={key} key={key}>{category.label}</option>)}</select></label><label><span>제목 *</span><input value={form.title} onChange={(event) => update("title", event.target.value)} required maxLength={180} placeholder="게시글 제목을 입력해 주세요." /></label><label><span>홈 요약 *</span><textarea value={form.summary} onChange={(event) => update("summary", event.target.value)} required maxLength={220} rows={3} placeholder="이 글을 읽으면 무엇을 얻을 수 있는지 작성해 주세요." /><small>{form.summary.length}/220자 · 권장 80~160자</small></label><label><span>본문 *</span><RichTextEditor value={form.body} onChange={(value) => update("body", value)} onUpload={async (file) => editId ? (await uploadInlineImage(editId, file, auth.csrf_token)).url : (await uploadNewPostInlineImage(file, auth.csrf_token)).url} onUploadingChange={setImageUploading} disabled={busy} /><small>첫 글 작성부터 사진 버튼, 드래그 앤 드롭, Ctrl+V, 스마트폰 카메라·사진 보관함으로 이미지를 추가할 수 있습니다.</small></label>{message && <div className="form-message success">{message}</div>}{error && <div className="form-message error">{error}</div>}<button className="admin-primary write-submit" disabled={busy}>{busy ? "저장 중…" : editId ? "수정 내용 저장" : "게시글 저장"}</button></form><aside className="write-preview"><span className="admin-kicker">HOME PREVIEW</span><h2>홈 화면 미리보기</h2><article><strong>{form.title || "제목을 입력해 주세요"}</strong><p>{form.summary || "홈 요약이 여기에 표시됩니다."}</p><small>{categories[form.category].label} · 예상 읽기 시간은 본문 기준으로 계산됩니다.</small></article></aside></div></main>;
}
