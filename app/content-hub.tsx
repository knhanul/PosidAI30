"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { categories, type CategorySlug, type Post } from "./content";
import { listPublishedPosts } from "./api-client";
import SiteIcon from "./site-icon";
import UserMenu from "./user-menu";

const categoryNav: CategorySlug[] = ["news", "learn", "use", "together"];
const nav: Array<"all" | CategorySlug> = ["all", ...categoryNav];
const labels: Record<string, string> = { all: "전체" };

function readingTime(post: Post) { return post.readTime; }

function Thumb({ post, compact = false }: { post: Post; compact?: boolean }) {
  const category = categories[post.category];
  const icon = post.category === "news" ? "news" : post.category === "learn" ? "book" : post.category === "use" ? "bolt" : "cube";
  return <div className={`thumb thumb-${category.tone} ${compact ? "thumb-compact" : ""}`} aria-hidden={post.thumbnailUrl ? undefined : true}>
    {post.thumbnailUrl && <img className="thumb-uploaded" src={post.thumbnailUrl} alt={`${post.title} 대표 이미지`} loading={compact ? "lazy" : undefined} />}
    <span className="thumb-orbit" /><span className="thumb-grid" /><span className="thumb-icon"><SiteIcon name={icon} size={compact ? 20 : 30} /></span><span className="thumb-label">{category.label}</span>
  </div>;
}

function Meta({ post }: { post: Post }) { return <div className="story-meta"><span>{categories[post.category].label}</span><span>{post.date}</span><span>{readingTime(post)}</span></div>; }

export default function ContentHub() {
  const [livePosts, setLivePosts] = useState<Post[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<"all" | CategorySlug>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => { listPublishedPosts({ homeOnly: true }).then(setLivePosts).catch(() => setLivePosts([])).finally(() => setLoading(false)); }, []);

  const homePosts = useMemo(() => {
    const unique = new Map<string, Post>();
    livePosts.filter((post) => post.id && post.showOnHome !== false).forEach((post) => unique.set(post.id!, post));
    return [...unique.values()];
  }, [livePosts]);
  const featured = homePosts.find((post) => post.featured) ?? homePosts[0];
  const used = new Set([featured?.id]);
  const filteredLatest = homePosts.filter((post) => (active === "all" || post.category === active) && (!query.trim() || [post.title, post.summary, post.author, ...post.topic].join(" ").toLowerCase().includes(query.trim().toLowerCase())));
  const services = homePosts.filter((post) => post.category === "together" && !used.has(post.id));

  return <div className="site-shell">
    <header className="site-header"><div className="header-inner"><Link className="brand" href="/" aria-label="Posid AI담당관3.0 홈"><span className="brand-logo-wrap"><img src="/brand/posid-ci-02.jpg" alt="PoSID" /></span><span className="brand-divider" /><span className="brand-service">AI담당관 <b>3.0</b></span></Link><nav className="desktop-nav" aria-label="주요 메뉴">{categoryNav.map((slug) => <Link key={slug} href={`/category/${slug}`}>{categories[slug].label}</Link>)}</nav><a className="header-search-link" href="#stories"><SiteIcon name="search" size={19} /><span>글 찾기</span></a><Link className="header-write-link" href="/write">글쓰기</Link><UserMenu /></div><nav className="mobile-nav" aria-label="주요 메뉴">{categoryNav.map((slug) => <Link key={slug} href={`/category/${slug}`}>{categories[slug].label}</Link>)}</nav></header>
    <main>
      <section className="home-feature section-wrap">
        {featured ? <div className="feature-content"><div className="feature-copy"><div className="feature-label"><span>{categories[featured.category].label}</span>{featured.new && <b>NEW</b>}</div><h1>{featured.title}</h1><p>{featured.summary}</p>{featured.keyPoints?.length ? <ul className="feature-points">{featured.keyPoints.slice(0, 3).map((point) => <li key={point}>{point}</li>)}</ul> : null}<Meta post={featured} /><Link className="primary-button" href={`/posts/${featured.slug}`}>내용 살펴보기 <SiteIcon name="arrow" size={19} /></Link></div><Link className="feature-image" href={`/posts/${featured.slug}`} aria-label={`${featured.title} 읽기`}><Thumb post={featured} /></Link></div> : <div className="empty-state home-empty"><strong>{loading ? "게시글을 불러오는 중입니다." : "홈에 표시할 게시글이 없습니다."}</strong><p>{loading ? "잠시만 기다려 주세요." : "관리자 화면에서 글을 저장하고 ‘홈에 표시’를 선택해 주세요."}</p></div>}
      </section>

      <section className="stories-section section-wrap" id="stories"><div className="section-heading stories-heading"><div><span className="section-kicker">LATEST POSTS</span><h2>방금 올라온 이야기</h2></div><label className="search-box"><SiteIcon name="search" size={19} /><span className="sr-only">글 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·요약·토픽으로 찾기" /></label></div><div className="filter-row" role="group" aria-label="카테고리 필터">{nav.map((slug) => <button key={slug} className={active === slug ? "active" : ""} onClick={() => setActive(slug)}>{slug === "all" ? labels.all : categories[slug].label}</button>)}</div>{filteredLatest.length ? <div className="latest-grid">{filteredLatest.slice(0, 8).map((post) => <Link href={`/posts/${post.slug}`} className="latest-card" key={post.id ?? post.slug}><Thumb post={post} /><div className="latest-copy"><Meta post={post} /><h3>{post.title}</h3><p>{post.summary}</p><div className="topic-row">{post.topic.map((topic) => <span key={topic}>#{topic}</span>)}</div></div>{post.new && <b className="new-chip">NEW</b>}</Link>)}</div> : loading ? <div className="empty-state"><strong>게시글을 불러오는 중입니다.</strong><p>잠시만 기다려 주세요.</p></div> : <div className="empty-state"><strong>{query ? "검색 결과가 없습니다." : "표시할 게시글이 없습니다."}</strong><p>다른 카테고리를 선택하거나 관리자에게 홈 노출을 요청해 주세요.</p></div>}<div className="more-link-wrap"><Link className="secondary-button" href={active === "all" ? "/category/news" : `/category/${active}`}>더보기 <SiteIcon name="arrow" size={17} /></Link></div></section>

      {services.length > 0 && <section className="service-section"><div className="section-wrap service-inner"><div className="service-intro"><span className="section-kicker light">TOGETHER</span><h2>함께 만든 AI</h2><p>구성원이 직접 만든 서비스의 문제와 활용 방법을 게시글에서 확인하세요.</p></div><div className="service-list">{services.slice(0, 4).map((post) => <article className="service-card" key={post.id ?? post.slug}><Thumb post={post} compact /><div><span>{post.service?.status ?? "함께 만든 서비스"}</span><strong>{post.title}</strong><p>{post.summary}</p><small>만든 사람 또는 팀 · {post.author}</small><div className="service-links">{post.service?.actionHref && post.service.actionHref !== "#service-guide" && <a href={post.service.actionHref} target={post.service.actionHref.startsWith("http") ? "_blank" : undefined} rel="noreferrer">서비스 써보기</a>}<Link href={`/posts/${post.slug}`}>자세히 보기</Link></div></div></article>)}</div></div></section>}
    </main>
  </div>;
}
