"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMe, listMyBookmarks, type AuthState } from "../../api-client";
import { categories, type Post } from "../../content";
import SiteHeader from "../../site-header";
import SiteIcon from "../../site-icon";

export default function MyBookmarksPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [items, setItems] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    getMe()
      .then(async (data) => {
        setAuth(data);
        if (data.requires_display_name) {
          setLoading(false);
          return;
        }
        try {
          const result = await listMyBookmarks();
          setItems(result.items); setPage(result.page); setHasMore(result.hasMore);
        } catch { /* 북마크가 없거나 오류 시 빈 목록 */ }
        finally { setLoading(false); }
      })
      .catch(() => { setNeedLogin(true); setLoading(false); });
  }, []);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await listMyBookmarks({ page: page + 1 });
      setItems((current) => [...current, ...data.items]); setPage(data.page); setHasMore(data.hasMore);
    } finally { setLoadingMore(false); }
  }

  if (loading) return <main className="load-state"><strong>북마크를 불러오고 있습니다.</strong></main>;
  if (needLogin) return <main className="load-state"><strong>로그인이 필요합니다.</strong><Link href="/">홈으로 돌아가기</Link></main>;

  return (
    <div className="category-page">
      <SiteHeader />
      <main>
        <section className="category-hero category-hero-orange">
          <div className="category-hero-inner">
            <span className="category-hero-icon"><SiteIcon name="bookmark" size={32} /></span>
            <span>MY LIBRARY</span>
            <h1>내 북마크</h1>
            <p>{auth?.user.display_name}님이 저장한 글을 모아볼 수 있습니다.</p>
          </div>
        </section>
        <section className="category-list">
          <div className="category-list-heading">
            <div><strong>저장한 글</strong><span>{items.length}개</span></div>
            <Link className="secondary-button" href="/account">내 정보로 돌아가기</Link>
          </div>
          <div className="category-list-grid">
            {items.map((post, index) => {
              const category = categories[post.category];
              return (
                <Link href={`/posts/${post.slug}`} className="category-list-card" key={post.slug}>
                  <span className="list-number">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="story-meta"><span>{category.label}</span><span>{post.date}</span></div>
                    <h2>{post.title}</h2>
                    <p>{post.summary}</p>
                    <div className="topic-row">{post.topic.map((topic) => <span key={topic}>#{topic}</span>)}</div>
                    <div className="list-stats">
                      <span className="list-stat">♥ {post.likeCount ?? 0}</span>
                      <span className="list-stat">💬 {post.commentCount ?? 0}</span>
                    </div>
                  </div>
                  <SiteIcon name="arrow" size={22} />
                </Link>
              );
            })}
          </div>
          {!items.length && (
            <div className="empty-state">
              <strong>저장한 북마크가 없습니다.</strong>
              <p>게시글을 읽을 때 ‘북마크’ 버튼을 누르면 이곳에 모여 보입니다.</p>
              <Link className="primary-button" href="/">글 둘러보기 <SiteIcon name="arrow" size={18} /></Link>
            </div>
          )}
          {hasMore && (
            <div className="more-link-wrap">
              <button type="button" className="secondary-button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "불러오는 중…" : "글 더 보기"}
              </button>
            </div>
          )}
          <Link className="primary-button category-home" href="/">홈으로 돌아가기 <SiteIcon name="arrow" size={18} /></Link>
        </section>
      </main>
    </div>
  );
}
