"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listPublishedPostPage } from "./api-client";
import { categories, isArticleCategory, shortCategoryLabels, type ArticleCategorySlug, type CategorySlug, type Post } from "./content";
import SiteHeader from "./site-header";
import SiteIcon from "./site-icon";

function mergePosts(current: Post[], incoming: Post[]) {
  const merged = new Map(current.map((post) => [post.id ?? post.slug, post]));
  incoming.forEach((post) => merged.set(post.id ?? post.slug, post));
  return [...merged.values()];
}

function Thumb({ post }: { post: Post }) {
  const category = categories[post.category as ArticleCategorySlug];
  const icon = post.category === "news" ? "news" : post.category === "learn" ? "book" : post.category === "use" ? "bolt" : "cube";
  return <div className={`thumb thumb-${category.tone} thumb-compact`} aria-hidden={post.thumbnailUrl ? undefined : true}>
    {post.thumbnailUrl && <img className="thumb-uploaded" src={post.thumbnailUrl} alt={`${post.title} 대표 이미지`} loading="lazy" />}
    <span className="thumb-orbit" /><span className="thumb-grid" /><span className="thumb-icon"><SiteIcon name={icon} size={20} /></span><span className="thumb-label">{category.label}</span>
  </div>;
}

function Meta({ post }: { post: Post }) { return <div className="story-meta"><span>{categories[post.category as ArticleCategorySlug].label}</span><span>{post.date}</span><span>{post.readTime}</span></div>; }

function renderSearchResultCard(post: Post) {
  if (post.category === "short") {
    return <article className="short-item short-search-item" key={post.id ?? post.slug}>
      <div className="short-meta"><span className="short-category-badge">{post.shortCategory ? shortCategoryLabels[post.shortCategory] : "짧게보기"}</span><time>{post.date}</time></div>
      <Link className="short-item-title" href={`/posts/${post.slug}`}><h3>{post.title}</h3></Link>
      <p className="short-body">{post.bodyMarkdown || post.summary}</p>
      {!!post.topic.length && <div className="topic-row short-topics">{post.topic.map((topic) => <span key={topic}>#{topic}</span>)}</div>}
      <div className="short-item-footer"><div className="list-stats"><span className="list-stat">♡ {post.likeCount ?? 0}</span><span className="list-stat">댓글 {post.commentCount ?? 0}</span></div>{post.externalUrl && <a href={post.externalUrl} target="_blank" rel="noopener noreferrer">원문 보기 →</a>}</div>
    </article>;
  }
  return <Link href={`/posts/${post.slug}`} className="latest-card" key={post.id ?? post.slug}>
    <Thumb post={post} />
    <div className="latest-copy"><Meta post={post} /><h3>{post.title}</h3><p>{post.summary}</p><div className="topic-row">{post.topic.map((topic) => <span key={topic}>#{topic}</span>)}</div><div className="list-stats"><span className="list-stat">♥ {post.likeCount ?? 0}</span><span className="list-stat">💬 {post.commentCount ?? 0}</span></div></div>
    {post.new && <b className="new-chip">NEW</b>}
  </Link>;
}

export default function CategoryList({ slug, fallback }: { slug: CategorySlug; fallback: Post[] }) {
  const [items, setItems] = useState(fallback);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const category = categories[slug];
  const icon = slug === "news" ? "news" : slug === "learn" ? "book" : slug === "use" ? "bolt" : "cube";

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Post[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchRetryKey, setSearchRetryKey] = useState(0);

  useEffect(() => { listPublishedPostPage({ category: slug }).then((data) => { setItems(data.items); setPage(data.page); setHasMore(data.hasMore); }).catch(() => {}); }, [slug]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await listPublishedPostPage({ category: slug, page: page + 1 });
      setItems((current) => [...current, ...data.items]); setPage(data.page); setHasMore(data.hasMore);
    } finally { setLoadingMore(false); }
  }

  useEffect(() => {
    if (!searchQuery) { setSearchResults([]); setSearchError(""); setSearchHasMore(false); return; }
    let activeReq = true;
    setSearchLoading(true); setSearchError(""); setSearchResults([]); setSearchPage(1); setSearchHasMore(false);
    listPublishedPostPage({ query: searchQuery, page: 1, pageSize: 20 })
      .then((data) => { if (activeReq) { setSearchResults(data.items); setSearchPage(data.page); setSearchHasMore(data.hasMore); } })
      .catch((reason) => { if (activeReq) setSearchError(reason instanceof Error ? reason.message : "검색을 수행하지 못했습니다."); })
      .finally(() => { if (activeReq) setSearchLoading(false); });
    return () => { activeReq = false; };
  }, [searchQuery, searchRetryKey]);

  async function loadMoreSearch() {
    if (searchLoadingMore || !searchHasMore) return;
    setSearchLoadingMore(true); setSearchError("");
    try {
      const data = await listPublishedPostPage({ query: searchQuery, page: searchPage + 1, pageSize: 20 });
      setSearchResults((current) => mergePosts(current, data.items)); setSearchPage(data.page); setSearchHasMore(data.hasMore);
    } catch (reason) { setSearchError(reason instanceof Error ? reason.message : "다음 검색 결과를 불러오지 못했습니다."); }
    finally { setSearchLoadingMore(false); }
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput(""); setSearchQuery("");
  }

  const searching = Boolean(searchQuery);
  const searchArticles = searchResults.filter((post) => isArticleCategory(post.category));
  const searchShorts = searchResults.filter((post) => post.category === "short");

  return (
    <div className="category-page">
      <SiteHeader />
      <main>
        <section className={`category-hero category-hero-${category.tone}`}><div className="category-hero-inner"><span className="category-hero-icon"><SiteIcon name={icon} size={32} /></span><span>{category.eyebrow}</span><h1>{category.label}</h1><p>{category.description}</p></div></section>
        <section className="category-list">
          <div className="category-list-heading"><div><strong>전체 글</strong><span>{items.length}개의 이야기</span></div><Link className="secondary-button" href={`/write?category=${slug}`}>이 카테고리 글쓰기</Link></div>
          <div className="category-list-grid">{items.map((post, index) => <Link href={`/posts/${post.slug}`} className="category-list-card" key={post.slug}><span className="list-number">{String(index + 1).padStart(2, "0")}</span><div><div className="story-meta"><span>{category.label}</span><span>{post.date}</span></div><h2>{post.title}</h2><p>{post.summary}</p><div className="topic-row">{post.topic.map((topic) => <span key={topic}>#{topic}</span>)}</div><div className="list-stats"><span className="list-stat">♥ {post.likeCount ?? 0}</span><span className="list-stat">💬 {post.commentCount ?? 0}</span></div></div><SiteIcon name="arrow" size={22} /></Link>)}</div>
          {!items.length && <div className="empty-state"><strong>아직 게시된 글이 없습니다.</strong><p>관리자가 글을 게시하면 이곳에 표시됩니다.</p></div>}
          {hasMore && <div className="more-link-wrap"><button type="button" className="secondary-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "불러오는 중…" : "글 더 보기"}</button></div>}
          <Link className="primary-button category-home" href="/">홈으로 돌아가기 <SiteIcon name="arrow" size={18} /></Link>
        </section>

        <section className="stories-section section-wrap search-section-wrap" id="category-search">
          <div className="section-heading stories-heading"><div><span className="section-kicker">SEARCH</span><h2>통합검색</h2></div><form className="search-box" onSubmit={submitSearch}><SiteIcon name="search" size={19} /><label htmlFor="category-search-input" className="sr-only">글 검색</label><input id="category-search-input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="제목·내용 검색, #태그 검색" maxLength={100} /><button type="submit">검색</button>{searching && <button type="button" onClick={clearSearch} className="search-clear-btn">지우기</button>}</form></div>

          {searching && (
            <div className="search-results-area">
              <div className="search-result-state">
                <span>‘{searchQuery}’ 검색 결과</span>
                {!searchLoading && !searchError && <small>{searchResults.length}건{searchHasMore ? "+" : ""}</small>}
              </div>
              {searchLoading ? <div className="empty-state"><strong>검색 중입니다.</strong><p>잠시만 기다려 주세요.</p></div>
              : searchError ? <div className="short-error" role="alert"><span>{searchError}</span><button type="button" onClick={() => setSearchRetryKey((k) => k + 1)}>다시 시도</button></div>
              : searchResults.length === 0 ? <div className="empty-state"><strong>검색 결과가 없습니다.</strong><p>다른 검색어를 입력해 보세요.</p></div>
              : <>
                {searchArticles.length > 0 && <div className="search-group"><h3 className="search-group-title">게시글</h3><div className="latest-grid">{searchArticles.map(renderSearchResultCard)}</div></div>}
                {searchShorts.length > 0 && <div className="search-group"><h3 className="search-group-title">짧게보기</h3><div className="short-list">{searchShorts.map(renderSearchResultCard)}</div></div>}
                {searchHasMore && <div className="more-link-wrap"><button type="button" className="secondary-button" onClick={loadMoreSearch} disabled={searchLoadingMore}>{searchLoadingMore ? "불러오는 중…" : "더보기"} <SiteIcon name="arrow" size={17} /></button></div>}
              </>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
