"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listPublishedPosts } from "./api-client";
import { categories, type CategorySlug, type Post } from "./content";
import SiteIcon from "./site-icon";
import UserMenu from "./user-menu";

export default function CategoryList({ slug, fallback }: { slug: CategorySlug; fallback: Post[] }) {
  const [items, setItems] = useState(fallback);
  const [needLogin, setNeedLogin] = useState(false);
  const category = categories[slug];
  const icon = slug === "news" ? "news" : slug === "learn" ? "book" : slug === "use" ? "bolt" : "cube";

  useEffect(() => { listPublishedPosts({ category: slug }).then((posts) => { if (posts.length) setItems(posts); setNeedLogin(false); }).catch(() => { setNeedLogin(true); }); }, [slug]);

  return (
    <div className="category-page">
      <header className="simple-header"><div className="header-inner">
        <Link className="brand" href="/" aria-label="Posid AI담당관3.0 홈"><span className="brand-logo-wrap"><img src="/brand/posid-ci-02.jpg" alt="PoSID" /></span><span className="brand-divider" /><span className="brand-service">AI담당관 <b>3.0</b></span></Link>
        <div className="simple-actions"><Link className="header-write-link" href={`/write?category=${slug}`}>이 카테고리 글쓰기</Link><UserMenu /><Link className="back-link" href="/">홈으로 <SiteIcon name="arrow" size={17} /></Link></div>
      </div></header>
      <main>
        <section className={`category-hero category-hero-${category.tone}`}><div className="category-hero-inner"><span className="category-hero-icon"><SiteIcon name={icon} size={32} /></span><span>{category.eyebrow}</span><h1>{category.label}</h1><p>{category.description}</p></div></section>
        <section className="category-list">
          {needLogin ? <div className="empty-state"><strong>로그인이 필요합니다.</strong><p>글을 읽으려면 카카오 계정으로 로그인해 주세요.</p><a className="primary-button" href="/api/auth/kakao/login">카카오로 로그인하기</a></div> : <>
          <div className="category-list-heading"><div><strong>전체 글</strong><span>{items.length}개의 이야기</span></div><Link className="secondary-button" href={`/write?category=${slug}`}>이 카테고리 글쓰기</Link></div>
          <div className="category-list-grid">{items.map((post, index) => <Link href={`/posts/${post.slug}`} className="category-list-card" key={post.slug}><span className="list-number">{String(index + 1).padStart(2, "0")}</span><div><div className="story-meta"><span>{category.label}</span><span>{post.date}</span></div><h2>{post.title}</h2><p>{post.summary}</p><div className="topic-row">{post.topic.map((topic) => <span key={topic}>#{topic}</span>)}</div></div><SiteIcon name="arrow" size={22} /></Link>)}</div>
          {!items.length && <div className="empty-state"><strong>아직 게시된 글이 없습니다.</strong><p>관리자가 글을 게시하면 이곳에 표시됩니다.</p></div>}
          <Link className="primary-button category-home" href="/">홈으로 돌아가기 <SiteIcon name="arrow" size={18} /></Link>
          </>}
        </section>
      </main>
    </div>
  );
}
