"use client";

import Link from "next/link";
import { categories, type CategorySlug } from "./content";
import UserMenu from "./user-menu";

const navItems: CategorySlug[] = ["news", "learn", "use", "together"];

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Posid AI담당관3.0 홈">
          <span className="brand-logo-wrap"><img src="/brand/posid-ci-02.jpg" alt="PoSID" /></span>
          <span className="brand-text">
            <span className="brand-unit">AX금융기획실</span>
            <span className="brand-name">AI담당관<b>3.0</b></span>
          </span>
        </Link>
        <nav className="post-nav" aria-label="주요 메뉴">
          {navItems.map((slug) => (
            <Link key={slug} href={`/category/${slug}`} className={slug === "together" ? "nav-together" : undefined}>
              {categories[slug].label}
            </Link>
          ))}
        </nav>
        <UserMenu />
      </div>
    </header>
  );
}
