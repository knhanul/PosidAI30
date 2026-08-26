"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createComment, getCommunity, getMe, getPublishedPost, listComments, toggleBookmark, toggleLike, type AuthState, type Comment } from "./api-client";
import { categories, posts, type Post } from "./content";
import SiteIcon from "./site-icon";
import UserMenu from "./user-menu";

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function PostDetail({ slug, fallback }: { slug: string; fallback?: Post }) {
  const [post, setPost] = useState<Post | undefined>(fallback);
  const [error, setError] = useState(!fallback);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [community, setCommunity] = useState({ likes: 0, liked: false, bookmarked: false });
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");

  useEffect(() => {
    getMe().then(setAuth).catch(() => setAuth(null));
    getPublishedPost(slug).then((item) => { setPost(item); setError(false); getCommunity(slug).then(setCommunity).catch(() => {}); if (item.id) listComments(item.id).then(setComments).catch(() => {}); }).catch(() => setError(!fallback));
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

  if (!post) return <main className="load-state"><strong>{error ? "글을 찾을 수 없습니다." : "글을 불러오고 있습니다."}</strong><Link href="/">홈으로 돌아가기</Link></main>;
  const category = categories[post.category];
  const related = posts.filter((item) => item.category === post.category && item.slug !== post.slug).slice(0, 2);

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

        <article className="article-body">
          {post.thumbnailUrl && <img className="article-cover" src={post.thumbnailUrl} alt={`${post.title} 대표 이미지`} />}
          {post.service && <section className="service-guide" id="service-guide"><div><span>서비스 상태</span><strong>{post.service.status}</strong></div><div><span>추천 대상</span><strong>{post.service.audience}</strong></div><a href={post.service.actionHref} target={post.service.actionHref.startsWith("http") ? "_blank" : undefined} rel="noreferrer">서비스 써보기<SiteIcon name="arrow" size={17} /></a></section>}
          {post.contentFormat === "html" && post.bodyHtml ? <div className="article-rich-body" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} /> : post.body.map((block, index) => {
            if (block.type === "heading") return <h2 key={index}>{block.text}</h2>;
            if (block.type === "paragraph") return <p key={index}>{block.text}</p>;
            if (block.type === "steps") return <ol className="article-steps" key={index}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}><span>{itemIndex + 1}</span><p>{item}</p></li>)}</ol>;
            return <aside className="article-callout" key={index}><span>TIP</span><div><strong>{block.title}</strong><p>{block.text}</p></div></aside>;
          })}
          {!!post.attachments?.length && <section className="attachment-box"><h2>첨부파일</h2>{post.attachments.map((file) => <a href={file.downloadUrl} key={file.id}><span>{file.filename}<small>{formatBytes(file.size)}</small></span><b>다운로드</b></a>)}</section>}
          {!post.id && <aside className="sample-note"><strong>콘텐츠 안내</strong><p>이 글은 서비스 화면 구성을 위한 예시입니다. 운영 API가 연결되면 관리자가 게시한 글로 대체됩니다.</p></aside>}
        </article>

        <section className="community-box"><div className="community-actions"><button type="button" onClick={() => react("like")} disabled={!auth}>{community.liked ? "좋아요 취소" : "좋아요"} {community.likes}</button><button type="button" onClick={() => react("bookmark")} disabled={!auth}>{community.bookmarked ? "북마크 해제" : "북마크"}</button>{!auth && <a className="community-login-hint" href="/api/auth/kakao/login">카카오 로그인 후 이용할 수 있습니다.</a>}</div><h2>댓글</h2><div className="comment-list">{comments.map((item) => <article key={item.id}><strong>{item.author_name}</strong><p>{item.body}</p></article>)}</div>{auth && <form onSubmit={submitComment} className="comment-form"><textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="댓글을 남겨보세요." maxLength={2000} required /><button className="admin-primary">댓글 작성</button></form>}</section>

        <section className="related-section"><div className="related-inner">
          <div className="section-heading"><div><span className="section-kicker">RELATED</span><h2>이어 읽기</h2></div><Link href={`/category/${post.category}`}>{category.label} 모두 보기 <SiteIcon name="arrow" size={17} /></Link></div>
          <div className="related-grid">{related.map((item) => <Link href={`/posts/${item.slug}`} key={item.slug}><span>{category.label}</span><strong>{item.title}</strong><p>{item.summary}</p></Link>)}</div>
        </div></section>
      </main>
    </div>
  );
}
