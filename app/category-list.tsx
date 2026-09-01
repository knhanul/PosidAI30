"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listPublishedPosts } from "./api-client";
import { categories, type CategorySlug, type Post } from "./content";
import SiteHeader from "./site-header";
import SiteIcon from "./site-icon";

export default function CategoryList({ slug, fallback }: { slug: CategorySlug; fallback: Post[] }) {
  const [items, setItems] = useState(fallback);
  const category = categories[slug];
  const icon = slug === "news" ? "news" : slug === "learn" ? "book" : slug === "use" ? "bolt" : "cube";

  useEffect(() => { listPublishedPosts({ category: slug }).then((posts) => { if (posts.length) setItems(posts); }).catch(() => {}); }, [slug]);

  return (
    <div className="category-page">
      <SiteHeader />
      <main>
        <section className={`category-hero category-hero-${category.tone}`}><div className="category-hero-inner"><span className="category-hero-icon"><SiteIcon name={icon} size={32} /></span><span>{category.eyebrow}</span><h1>{category.label}</h1><p>{category.description}</p></div></section>
        <section className="category-list">
          <div className="category-list-heading"><div><strong>전체 글</strong><span>{items.length}개의 이야기</span></div><Link className="secondary-button" href={`/write?category=${slug}`}>이 카테고리 글쓰기</Link></div>
          <div className="category-list-grid">{items.map((post, index) => <Link href={`/posts/${post.slug}`} className="category-list-card" key={post.slug}><span className="list-number">{String(index + 1).padStart(2, "0")}</span><div><div className="story-meta"><span>{category.label}</span><span>{post.date}</span></div><h2>{post.title}</h2><p>{post.summary}</p><div className="topic-row">{post.topic.map((topic) => <span key={topic}>#{topic}</span>)}</div></div><SiteIcon name="arrow" size={22} /></Link>)}</div>
          {!items.length && <div className="empty-state"><strong>아직 게시된 글이 없습니다.</strong><p>관리자가 글을 게시하면 이곳에 표시됩니다.</p></div>}
          <Link className="primary-button category-home" href="/">홈으로 돌아가기 <SiteIcon name="arrow" size={18} /></Link>
        </section>
      </main>
    </div>
  );
}
