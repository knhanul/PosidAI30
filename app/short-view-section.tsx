"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listPublishedPostPage } from "./api-client";
import { shortCategoryLabels, type Post } from "./content";

export default function ShortViewSection() {
  const [items, setItems] = useState<Post[]>([]);

  useEffect(() => {
    let active = true;
    listPublishedPostPage({ category: "short", homeOnly: true, pageSize: 5 })
      .then((data) => { if (active) setItems(data.items); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, []);

  if (!items.length) return null;
  return <section className="short-home-section section-wrap" aria-labelledby="short-home-title">
    <div className="short-home-heading"><div><span className="section-kicker">SHORT VIEW</span><h2 id="short-home-title">짧게보기</h2></div><Link href="/shorts">더보기 →</Link></div>
    <div className="short-home-list">{items.map((post) => <Link href={`/posts/${post.slug}`} className="short-home-row" key={post.id ?? post.slug}><span className="short-category-badge">{post.shortCategory ? shortCategoryLabels[post.shortCategory] : "짧게보기"}</span><strong>{post.title}</strong><time>{post.date}</time></Link>)}</div>
  </section>;
}
