"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listPublishedPostPage } from "./api-client";
import { shortCategoryLabels, type Post, type ShortCategory } from "./content";
import SiteHeader from "./site-header";

const filters: Array<{ value: "all" | ShortCategory; label: string }> = [
  { value: "all", label: "전체" },
  ...Object.entries(shortCategoryLabels).map(([value, label]) => ({ value: value as ShortCategory, label })),
];

function mergePosts(current: Post[], incoming: Post[]) {
  const merged = new Map(current.map((post) => [post.id ?? post.slug, post]));
  incoming.forEach((post) => merged.set(post.id ?? post.slug, post));
  return [...merged.values()];
}

export default function ShortList() {
  const [items, setItems] = useState<Post[]>([]);
  const [filter, setFilter] = useState<"all" | ShortCategory>("all");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
    if (initialQuery) { setQueryInput(initialQuery); setQuery(initialQuery); }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setItems([]); setPage(1); setHasMore(false);
    listPublishedPostPage({ category: "short", shortCategory: filter === "all" ? undefined : filter, query: query || undefined, page: 1, pageSize: 20 })
      .then((data) => { if (active) { setItems(data.items); setPage(data.page); setHasMore(data.hasMore); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "짧게보기를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, query, retryKey]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true); setError("");
    try {
      const data = await listPublishedPostPage({ category: "short", shortCategory: filter === "all" ? undefined : filter, query: query || undefined, page: page + 1, pageSize: 20 });
      setItems((current) => mergePosts(current, data.items)); setPage(data.page); setHasMore(data.hasMore);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "다음 짧게보기를 불러오지 못했습니다."); }
    finally { setLoadingMore(false); }
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    setQuery(queryInput.trim());
  }

  const emptyTitle = query ? "검색 결과가 없습니다." : filter === "all" ? "아직 등록된 짧게보기가 없습니다." : "해당 분류의 이야기가 없습니다.";

  return <div className="short-page">
    <SiteHeader />
    <main>
      <section className="short-hero"><div className="short-shell"><span className="section-kicker">SHORT VIEW</span><h1>짧게보기</h1><p>AI에 대해 가볍게 읽을 수 있는 작은 이야기들을 모았습니다.</p></div></section>
      <section className="short-shell short-list-section">
        <div className="short-list-tools">
          <div className="short-filter" role="group" aria-label="짧게보기 분류">{filters.map((item) => <button type="button" key={item.value} className={filter === item.value ? "active" : ""} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
          <form className="short-search" onSubmit={search}><label htmlFor="short-search-input" className="sr-only">짧게보기 검색</label><input id="short-search-input" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="제목·내용·#태그 검색" maxLength={100} /><button type="submit">검색</button></form>
        </div>
        {query && <div className="short-search-state"><span>‘{query}’ 검색 결과</span><button type="button" onClick={() => { setQueryInput(""); setQuery(""); }}>검색 지우기</button></div>}
        {loading ? <div className="short-loading" role="status">짧게보기를 불러오고 있습니다.</div> : items.length ? <div className="short-list">{items.map((post) => <article className="short-item" key={post.id ?? post.slug}>
          <div className="short-meta"><span className="short-category-badge">{post.shortCategory ? shortCategoryLabels[post.shortCategory] : "짧게보기"}</span><time>{post.date}</time></div>
          <Link className="short-item-title" href={`/posts/${post.slug}`}><h2>{post.title}</h2></Link>
          <p className="short-body">{post.bodyMarkdown || post.summary}</p>
          {!!post.topic.length && <div className="topic-row short-topics">{post.topic.map((topic) => <button type="button" key={topic} onClick={() => { const value = `#${topic}`; setQueryInput(value); setQuery(value); }}>#{topic}</button>)}</div>}
          <div className="short-item-footer"><div className="list-stats"><span className="list-stat">♡ {post.likeCount ?? 0}</span><span className="list-stat">댓글 {post.commentCount ?? 0}</span></div>{post.externalUrl && <a href={post.externalUrl} target="_blank" rel="noopener noreferrer" aria-label={`${post.title} 원문 새 창에서 보기`}>원문 보기 →</a>}</div>
        </article>)}</div> : <div className="empty-state short-empty"><strong>{emptyTitle}</strong><p>{query ? "다른 검색어를 입력해 보세요." : "새로운 짧은 이야기가 등록되면 이곳에 표시됩니다."}</p></div>}
        {error && <div className="short-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetryKey((current) => current + 1)}>다시 시도</button></div>}
        {hasMore && <div className="more-link-wrap"><button type="button" className="secondary-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "불러오는 중…" : "더보기"}</button></div>}
        <Link className="short-write-link" href="/write?category=short">짧게보기 작성</Link>
      </section>
    </main>
  </div>;
}
