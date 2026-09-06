"use client";

import Link from "next/link";
import UserMenu from "./user-menu";

const navItems = [
  { label: "AI 소식", href: "/category/news" },
  { label: "배워보기", href: "/category/learn" },
  { label: "써보기", href: "/category/use" },
  { label: "짧게보기", href: "/shorts" },
  { label: "함께 만든 AI", href: "/category/together", className: "nav-together" },
];

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Posid AI담당관3.0 홈">
          <span className="brand-logo-wrap"><img src="/brand/posid-ci-02.jpg" alt="PoSID" /></span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-text">
            <span className="brand-unit">AX금융기획실</span>
            <span className="brand-name">AI담당관<b>3.0</b></span>
          </span>
        </Link>
        <nav className="post-nav" aria-label="주요 메뉴">
          {navItems.map((item) => <Link key={item.href} href={item.href} className={item.className}>{item.label}</Link>)}
        </nav>
        <UserMenu />
      </div>
    </header>
  );
}
