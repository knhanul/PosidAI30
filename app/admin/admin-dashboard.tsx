"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  createPost, deleteAttachment, deletePost, getMe, listAdminPosts, logout, setFeatured, unsetFeatured, updatePost,
  uploadAttachments, uploadThumbnail, uploadInlineImage, uploadNewPostInlineImage, unlinkKakao, type AdminUser, type ApiPost, type PostPayload,
} from "../api-client";
import { categories, type CategorySlug } from "../content";
import RichTextEditor from "../rich-text-editor";

type EditorState = PostPayload & { id?: string };
const emptyEditor: EditorState = {
  category: "news", title: "", summary: "", body_markdown: "", content_format: "html", content_density: "normal", topics: [], key_points: [],
  is_featured: false, show_on_home: true, thumbnail_type: "preset", service_status: null, service_audience: null, service_url: null,
};

function fromApi(post: ApiPost): EditorState {
  return {
    id: post.id, category: post.category, title: post.title, summary: post.summary,
    body_markdown: post.content_format === "html" ? (post.body_markdown ?? "") : `<p>${(post.body_markdown ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "</p><p>")}</p>`, content_format: post.content_format, content_density: post.content_density === "compact" ? "compact" : "normal", topics: post.topics, key_points: post.key_points, is_featured: post.is_featured, show_on_home: post.show_on_home,
    thumbnail_type: post.thumbnail_type, service_status: post.service_status, service_audience: post.service_audience, service_url: post.service_url,
  };
}

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [csrf, setCsrf] = useState("");
  const [kakaoConnected, setKakaoConnected] = useState(false);
  const [kakaoConnectedAt, setKakaoConnectedAt] = useState<string | null>(null);
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [topicInput, setTopicInput] = useState("");
  const [keyPointInput, setKeyPointInput] = useState<string[]>(["", "", ""]);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [busy, setBusy] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedPost = editor?.id ? posts.find((post) => post.id === editor.id) : undefined;

  const reload = useCallback(async () => { setPosts(await listAdminPosts()); }, []);

  useEffect(() => {
    getMe().then(async (auth) => { setUser(auth.user); setCsrf(auth.csrf_token); setKakaoConnected(auth.kakao.connected); setKakaoConnectedAt(auth.kakao.connected_at); await reload(); }).catch(() => router.replace("/admin/login")).finally(() => setBusy(false));
  }, [reload, router]);

  function startNew() { setEditor({ ...emptyEditor }); setTopicInput(""); setKeyPointInput(["", "", ""]); setThumbnail(null); setAttachments([]); setMessage(""); setError(""); }
  function startEdit(post: ApiPost) { setEditor(fromApi(post)); setTopicInput(post.topics.join(", ")); setKeyPointInput([...post.key_points, "", "", ""].slice(0, 3)); setThumbnail(null); setAttachments([]); setMessage(""); setError(""); }

  function update<K extends keyof EditorState>(key: K, value: EditorState[K]) { setEditor((current) => current ? { ...current, [key]: value } : current); }

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editor) return;
    if (imageUploading) { setError("이미지 업로드가 끝난 후 저장해 주세요."); return; }
    if (/src=["'](?:data:image|blob:)/i.test(editor.body_markdown)) { setError("본문 이미지 업로드가 완료되지 않았습니다. 이미지를 다시 삽입해 주세요."); return; }
    setBusy(true); setMessage(""); setError("");
    try {
      const payload: PostPayload = { ...editor, content_format: "html", topics: topicInput.split(",").map((item) => item.trim().replace(/^#/, "")).filter(Boolean).slice(0, 10), key_points: keyPointInput.map((item) => item.trim()).filter(Boolean).slice(0, 3), is_featured: editor.is_featured && editor.show_on_home };
      let saved = editor.id ? await updatePost(editor.id, payload, csrf) : await createPost(payload, csrf);
      if (thumbnail) saved = await uploadThumbnail(saved.id, thumbnail, csrf);
      if (attachments.length) await uploadAttachments(saved.id, attachments, csrf);
      await reload(); setEditor(fromApi(saved)); setTopicInput(saved.topics.join(", ")); setKeyPointInput([...saved.key_points, "", "", ""].slice(0, 3)); setThumbnail(null); setAttachments([]); setMessage("글을 저장했습니다.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function remove(post: ApiPost) {
    if (!confirm(`‘${post.title}’ 글을 삭제하시겠습니까? 삭제된 글은 공개되지 않습니다.`)) return;
    setBusy(true); setError("");
    try { await deletePost(post.id, csrf); await reload(); if (editor?.id === post.id) setEditor(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function toggleFeatured(post: ApiPost) {
    setBusy(true); setError("");
    try {
      if (post.is_featured) { await unsetFeatured(post.id, csrf); }
      else { await setFeatured(post.id, csrf); }
      await reload();
      setMessage(post.is_featured ? "대문 글을 해제했습니다." : "대문 글로 지정했습니다.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "대문 설정을 변경하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function removeAttachment(id: string) {
    if (!confirm("첨부파일 원본도 WebDAV에서 삭제됩니다. 계속하시겠습니까?")) return;
    setBusy(true);
    try { await deleteAttachment(id, csrf); await reload(); setMessage("첨부파일을 삭제했습니다."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "첨부파일을 삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function unlinkKakaoAccount() {
    if (!confirm("연결된 카카오 계정을 해제하시겠습니까?")) return;
    setBusy(true); setError("");
    try { await unlinkKakao(csrf); setKakaoConnected(false); setKakaoConnectedAt(null); setMessage("카카오 계정 연결을 해제했습니다."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "카카오 계정을 해제하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function signOut() { try { await logout(csrf); } finally { router.replace("/"); } }

  if (busy && !user) return <main className="load-state"><strong>관리 화면을 준비하고 있습니다.</strong></main>;

  return (
    <div className="admin-shell">
      <header className="admin-header"><Link href="/" className="admin-logo"><img src="/brand/posid-ci-02.jpg" alt="PoSID" /><span>AI담당관 <b>3.0</b></span></Link><div><span>{user?.display_name}</span><Link href="/">사이트 보기</Link><button onClick={signOut}>로그아웃</button></div></header>
      <div className="admin-layout">
        <aside className="admin-sidebar"><span className="admin-kicker">CONTENT MANAGER</span><h1>콘텐츠 관리</h1><button className="admin-primary" onClick={startNew}>＋ 새 글 작성</button><nav><button className={!editor ? "active" : ""} onClick={() => setEditor(null)}>전체 글 <b>{posts.length}</b></button></nav><section className="admin-account-link"><h2>카카오 계정</h2>{kakaoConnected ? <><p>카카오 계정이 연결되어 있습니다.</p>{kakaoConnectedAt && <small>연결 일시: {new Date(kakaoConnectedAt).toLocaleString("ko-KR")}</small>}<button type="button" className="admin-secondary" onClick={unlinkKakaoAccount} disabled={busy}>연결 해제</button></> : <><p>연결된 카카오 계정이 없습니다.</p><a className="admin-secondary" href="/api/auth/kakao/login?intent=link">카카오 계정 연결</a></>}</section></aside>
        <main className="admin-main">
          {error && <div className="admin-alert error" role="alert">{error}<button onClick={() => setError("")}>닫기</button></div>}
          {message && <div className="admin-alert success">{message}<button onClick={() => setMessage("")}>닫기</button></div>}
          {!editor ? (
            <section className="admin-list-panel"><div className="admin-panel-title"><div><span>POSTS</span><h2>전체 글</h2></div><button className="admin-primary" onClick={startNew}>새 글 작성</button></div>
              <div className="admin-post-table"><div className="admin-table-head"><span>글</span><span>홈 노출</span><span>조회</span><span>수정일</span><span>관리</span></div>{posts.map((post) => <article key={post.id}><div><span>{categories[post.category].label}</span><strong>{post.title}</strong><small>/{post.slug}</small></div><b className={`status-chip ${post.show_on_home ? "published" : "draft"}`}>{post.is_featured ? "대문 글" : post.show_on_home ? "홈 표시" : "홈 미표시"}</b><span className="view-count-cell">{(post.view_count ?? 0).toLocaleString("ko-KR")}</span><time>{new Date(post.updated_at).toLocaleDateString("ko-KR")}</time><div><button onClick={() => startEdit(post)}>수정</button><button className={post.is_featured ? "danger" : ""} disabled={busy} onClick={() => toggleFeatured(post)}>{post.is_featured ? "대문 해제" : "대문 지정"}</button><button className="danger" onClick={() => remove(post)}>삭제</button></div></article>)}</div>
              {!posts.length && <div className="empty-state"><strong>작성된 글이 없습니다.</strong><p>새 글 작성 버튼으로 첫 글을 등록해 보세요.</p></div>}
            </section>
          ) : (
            <form className="admin-editor" onSubmit={save}>
              <div className="admin-editor-head"><div><button type="button" onClick={() => setEditor(null)}>← {editor.id ? "목록으로" : "취소"}</button><span>{editor.id ? "EDIT POST" : "NEW POST"}</span><h2>{editor.id ? "글 수정" : "새 글 작성"}</h2></div><div><button className="admin-primary" disabled={busy}>{busy ? "저장 중…" : editor.id ? "수정 내용 저장" : "저장"}</button>{editor.id && <button type="button" className="admin-secondary danger" onClick={() => selectedPost && remove(selectedPost)}>삭제</button>}</div></div>
              <div className="editor-grid"><section className="editor-main-fields">
                <label><span>제목 *</span><input value={editor.title} onChange={(event) => update("title", event.target.value)} required maxLength={180} /></label>
                <label><span>홈 요약 *</span><textarea value={editor.summary} onChange={(event) => update("summary", event.target.value)} required maxLength={220} rows={3} /><small>{editor.summary.length}/220자 · 권장 80~160자</small></label>
                <section className="home-points-editor"><h3>홈 노출 핵심 포인트</h3>{keyPointInput.map((point, index) => <input key={index} value={point} maxLength={160} placeholder={`핵심 포인트 ${index + 1}`} onChange={(event) => setKeyPointInput((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />)}<small>선택 입력 · 최대 3개</small></section>
                <label><span>본문 *</span><RichTextEditor value={editor.body_markdown} onChange={(value) => update("body_markdown", value)} onUpload={async (file) => editor.id ? (await uploadInlineImage(editor.id, file, csrf)).url : (await uploadNewPostInlineImage(file, csrf)).url} onUploadingChange={setImageUploading} disabled={busy} /><small>문서처럼 작성하면 허용된 HTML로 저장됩니다. 첫 글 작성부터 사진을 추가할 수 있습니다.</small></label>
                <section className="body-display-options"><h3>본문 표시</h3><label className="radio-label"><input type="radio" name="content-density" checked={(editor.content_density ?? "normal") === "normal"} onChange={() => update("content_density", "normal")} /><span>일반 글</span></label><label className="radio-label"><input type="radio" name="content-density" checked={editor.content_density === "compact"} onChange={() => update("content_density", "compact")} /><span>프롬프트·자료형</span></label><small>JSON, 명령어, AI 프롬프트 등 줄 단위 자료에 적합합니다.</small></section>
                <section className="upload-panel"><div><span>첨부파일</span><p>PDF, 문서, 이미지 등 파일을 여러 개 선택할 수 있습니다.</p></div><input type="file" multiple onChange={(event) => setAttachments(Array.from(event.target.files ?? []))} />
                  {!!selectedPost?.attachments?.length && <div className="saved-files">{selectedPost.attachments.map((file) => <div key={file.id}><span>{file.filename}</span><button type="button" onClick={() => removeAttachment(file.id)}>삭제</button></div>)}</div>}
                </section>
              </section>
              <aside className="editor-side-fields">
                <section><h3>게시 설정</h3><label className="check-label"><input type="checkbox" checked={editor.show_on_home} onChange={(event) => { const checked = event.target.checked; update("show_on_home", checked); if (!checked) update("is_featured", false); }} /><span>홈에 표시</span></label><small>해제해도 글은 카테고리와 검색 결과에서 계속 볼 수 있습니다.</small><label className="check-label"><input type="checkbox" checked={editor.is_featured} disabled={!editor.show_on_home} onChange={(event) => update("is_featured", event.target.checked)} /><span>대표 글로 표시</span></label><small>홈에 표시된 글 중 하나를 첫 화면의 큰 글로 보여줍니다.</small></section>
                <section><h3>분류</h3><label><span>카테고리</span><select value={editor.category} onChange={(event) => update("category", event.target.value as CategorySlug)}>{Object.entries(categories).map(([key, category]) => <option value={key} key={key}>{category.label}</option>)}</select></label><label><span>해시태그</span><input value={topicInput} onChange={(event) => setTopicInput(event.target.value)} placeholder="AI/보안/모델, 업무자동화" /><small>쉼표로 구분합니다. /로 계층을 표현합니다 (예: AI/보안/모델).</small></label></section>
                <section><h3>대표 이미지</h3><label className="radio-label"><input type="radio" name="thumbnail" checked={editor.thumbnail_type === "preset"} onChange={() => update("thumbnail_type", "preset")} /><span>카테고리 기본 이미지</span></label><label className="radio-label"><input type="radio" name="thumbnail" checked={editor.thumbnail_type === "webdav"} onChange={() => update("thumbnail_type", "webdav")} /><span>직접 업로드</span></label>{editor.thumbnail_type === "webdav" && <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={(event) => setThumbnail(event.target.files?.[0] ?? null)} />}{selectedPost?.thumbnail_url && <img className="admin-thumbnail" src={selectedPost.thumbnail_url} alt="현재 대표 이미지" />}<div className="home-card-preview"><span>홈 카드 미리보기</span><strong>{editor.title || "제목을 입력해 주세요"}</strong><p>{editor.summary || "요약이 홈 화면에 표시됩니다."}</p></div></section>
                {editor.category === "together" && <section><h3>서비스 정보</h3><label><span>상태</span><select value={editor.service_status ?? "준비 중"} onChange={(event) => update("service_status", event.target.value)}><option>준비 중</option><option>사용 가능</option></select></label><label><span>추천 대상</span><input value={editor.service_audience ?? ""} onChange={(event) => update("service_audience", event.target.value || null)} /></label><label><span>서비스 주소</span><input type="url" value={editor.service_url ?? ""} onChange={(event) => update("service_url", event.target.value || null)} placeholder="https://" /></label></section>}
              </aside></div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
