"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createComment, getCommunity, getMe, getPublicConfig, getPublishedPost, listComments, listPublishedPosts, toggleBookmark, toggleLike, type AuthState, type Comment } from "./api-client";
import { categories, type Post } from "./content";
import SiteIcon from "./site-icon";
import UserMenu from "./user-menu";

type KakaoLink = { mobileWebUrl: string; webUrl: string };
type KakaoSdk = {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Share: { sendDefault: (options: { objectType: "feed"; content: { title: string; description: string; imageUrl: string; link: KakaoLink }; buttons: Array<{ title: string; link: KakaoLink }> }) => void };
};

declare global {
  interface Window { Kakao?: KakaoSdk }
}

let kakaoSdkPromise: Promise<KakaoSdk> | null = null;

function loadKakaoSdk() {
  if (window.Kakao) return Promise.resolve(window.Kakao);
  if (kakaoSdkPromise) return kakaoSdkPromise;
  kakaoSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.2/kakao.min.js";
    script.integrity = "sha384-zt/G7/KfaRQ9dT/QIkS0ujMtzouJqzuSJcXVQu50x0rl/+mD1dc70AeOejVbMD9E";
    script.crossOrigin = "anonymous";
    script.onload = () => window.Kakao ? resolve(window.Kakao) : reject(new Error("카카오 SDK를 불러오지 못했습니다."));
    script.onerror = () => reject(new Error("카카오 SDK를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return kakaoSdkPromise;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function PostDetail({ slug, fallback }: { slug: string; fallback?: Post }) {
  const [post, setPost] = useState<Post | undefined>(fallback);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [community, setCommunity] = useState({ likes: 0, liked: false, bookmarked: false });
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [kakaoKey, setKakaoKey] = useState("");
  const [sharing, setSharing] = useState(false);
  const [related, setRelated] = useState<Post[]>([]);

  useEffect(() => {
    getMe().then(setAuth).catch(() => setAuth(null));
    getPublicConfig().then((config) => setKakaoKey(config.kakao_javascript_key)).catch(() => {});
    getPublishedPost(slug).then((item) => { setPost(item); setError(false); setLoading(false); getCommunity(slug).then(setCommunity).catch(() => {}); if (item.id) listComments(item.id).then(setComments).catch(() => {}); listPublishedPosts({ category: item.category }).then((data) => setRelated(data.filter((p) => p.slug !== item.slug).slice(0, 2))).catch(() => setRelated([])); }).catch((err: Error & { status?: number }) => { if (err?.status === 401) { setNeedLogin(true); setError(false); } else { setError(true); } setLoading(false); });
  }, [fallback, slug]);

  async function react(kind: "like" | "bookmark") {
    if (!auth || !post?.id) return;
    const current = kind === "like" ? community.liked : community.bookmarked;
    if (kind === "like") await toggleLike(post.id, auth.csrf_token, current); else await toggleBookmark(post.id, auth.csrf_token, current);
    setCommunity((state) => kind === "like" ? { ...state, liked: !current, likes: state.likes + (current ? -1 : 1) } : { ...state, bookmarked: !current });
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault(); if (!auth || !post?.id || !commentBody.trim()) return;
    const created = await createComment(post.id, commentBody, auth.csrf_token); setComments((items) => [...items, created]); setCommentBody("");
  }

  async function shareToKakao() {
    if (!post || !kakaoKey || sharing) return;
    setSharing(true);
    try {
      const kakao = await loadKakaoSdk();
      if (!kakao.isInitialized()) kakao.init(kakaoKey);
      const shareUrl = window.location.href.split("#")[0];
      const link = { mobileWebUrl: shareUrl, webUrl: shareUrl };
      const imageUrl = new URL(post.thumbnailUrl || "/og.png", window.location.origin).href;
      kakao.Share.sendDefault({ objectType: "feed", content: { title: post.title.slice(0, 200), description: post.summary.slice(0, 200), imageUrl, link }, buttons: [{ title: "게시물 보기", link }] });
    } catch (shareError) {
      window.alert(shareError instanceof Error ? shareError.message : "카카오톡 공유를 시작하지 못했습니다.");
    } finally {
      setSharing(false);
    }
  }

  if (!post) return <main className="load-state"><strong>{needLogin ? "로그인이 필요합니다." : loading ? "글을 불러오고 있습니다." : error ? "글을 찾을 수 없습니다." : "글을 불러오고 있습니다."}</strong>{needLogin ? <a className="primary-button" href="/api/auth/kakao/login">카카오로 로그인하기</a> : <Link href="/">홈으로 돌아가기</Link>}</main>;
  const category = categories[post.category];

  return (
    <div className="article-page">
      <header className="simple-header"><div className="header-inner">
        <Link className="brand" href="/" aria-label="Posid AI담당관3.0 홈"><span className="brand-logo-wrap"><img src="/brand/posid-ci-02.jpg" alt="PoSID" /></span><span className="brand-divider" /><span className="brand-service">AI담당관 <b>3.0</b></span></Link>
        <div className="simple-actions"><Link className="header-write-link" href="/write">글쓰기</Link><UserMenu /><Link className="back-link" href="/">홈으로 <SiteIcon name="arrow" size={17} /></Link></div>
      </div></header>

      <main>
        <div className="article-hero"><div className="article-hero-inner">
          <nav className="breadcrumb" aria-label="현재 위치"><Link href="/">홈</Link><span>/</span><Link href={`/category/${post.category}`}>{category.label}</Link></nav>
          <span className={`article-category category-text-${category.tone}`}>{category.label}</span>
          <h1>{post.title}</h1><p>{post.summary}</p>
          <div className="article-meta"><span>{post.author}</span><i /><span>{post.date}</span><i /><span>읽는 시간 {post.readTime}</span></div>
          {post.ownedByCurrentUser && post.id && <Link className="article-edit-link" href={`/write?edit=${post.id}`}>내 글 수정</Link>}
          <div className="topic-row article-topics">{post.topic.map((topic) => <span key={topic}>#{topic}</span>)}</div>
        </div></div>

        <article className={`article-body ${post.contentDensity === "compact" ? "density-compact" : "density-normal"}`}>
          {post.thumbnailUrl && <img className="article-cover" src={post.thumbnailUrl} alt={`${post.title} 대표 이미지`} />}
          {post.service && <section className="service-guide" id="service-guide"><div><span>서비스 상태</span><strong>{post.service.status}</strong></div><div><span>추천 대상</span><strong>{post.service.audience}</strong></div><a href={post.service.actionHref} target={post.service.actionHref.startsWith("http") ? "_blank" : undefined} rel="noreferrer">서비스 써보기<SiteIcon name="arrow" size={17} /></a></section>}
          {post.contentFormat === "html" && post.bodyHtml ? <div className={`article-rich-body ${post.contentDensity === "compact" ? "density-compact" : "density-normal"}`} dangerouslySetInnerHTML={{ __html: post.bodyHtml }} /> : post.body.map((block, index) => {
            if (block.type === "heading") return <h2 key={index}>{block.text}</h2>;
            if (block.type === "paragraph") return <p key={index}>{block.text}</p>;
            if (block.type === "steps") return <ol className="article-steps" key={index}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}><span>{itemIndex + 1}</span><p>{item}</p></li>)}</ol>;
            return <aside className="article-callout" key={index}><span>TIP</span><div><strong>{block.title}</strong><p>{block.text}</p></div></aside>;
          })}
          {!!post.attachments?.length && <section className="attachment-box"><h2>첨부파일</h2>{post.attachments.map((file) => <a href={file.downloadUrl} key={file.id}><span>{file.filename}<small>{formatBytes(file.size)}</small></span><b>다운로드</b></a>)}</section>}
          {!post.id && <aside className="sample-note"><strong>콘텐츠 안내</strong><p>이 글은 서비스 화면 구성을 위한 예시입니다. 운영 API가 연결되면 관리자가 게시한 글로 대체됩니다.</p></aside>}
        </article>

        <section className="community-box"><div className="community-actions"><button type="button" onClick={() => react("like")} disabled={!auth}>{community.liked ? "좋아요 취소" : "좋아요"} {community.likes}</button><button type="button" onClick={() => react("bookmark")} disabled={!auth}>{community.bookmarked ? "북마크 해제" : "북마크"}</button><button className="kakao-share-button" type="button" onClick={shareToKakao} disabled={!kakaoKey || sharing} title={!kakaoKey ? "카카오 JavaScript 키 설정이 필요합니다." : undefined}>{sharing ? "공유 준비 중" : "카카오톡 공유"}</button>{!auth && <a className="community-login-hint" href="/api/auth/kakao/login">카카오 로그인 후 이용할 수 있습니다.</a>}</div><h2>댓글</h2><div className="comment-list">{comments.map((item) => <article key={item.id}><strong>{item.author_name}</strong><p>{item.body}</p></article>)}</div>{auth && <form onSubmit={submitComment} className="comment-form"><textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="댓글을 남겨보세요." maxLength={2000} required /><button className="admin-primary">댓글 작성</button></form>}</section>

        {related.length > 0 && <section className="related-section"><div className="related-inner">
          <div className="section-heading"><div><span className="section-kicker">RELATED</span><h2>이어 읽기</h2></div><Link href={`/category/${post.category}`}>{category.label} 모두 보기 <SiteIcon name="arrow" size={17} /></Link></div>
          <div className="related-grid">{related.map((item) => <Link href={`/posts/${item.slug}`} key={item.slug}><span>{category.label}</span><strong>{item.title}</strong><p>{item.summary}</p></Link>)}</div>
        </div></section>}
      </main>
    </div>
  );
}
