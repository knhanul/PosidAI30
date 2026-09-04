"use client";

import { useEffect, useState } from "react";
import { getMe, logout, type AuthState } from "./api-client";

type UserMenuProps = {
  variant?: "header" | "inline";
  onAuthChange?: (auth: AuthState | null) => void;
};

export default function UserMenu({ variant = "header", onAuthChange }: UserMenuProps) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getMe()
      .then((data) => { if (active) { setAuth(data); onAuthChange?.(data); } })
      .catch(() => { if (active) { setAuth(null); onAuthChange?.(null); } })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [onAuthChange]);

  async function signOut() {
    if (!auth || busy) return;
    setBusy(true);
    try { await logout(auth.csrf_token); } finally {
      setAuth(null); onAuthChange?.(null); setBusy(false);
      if (typeof window !== "undefined") window.location.assign("/");
    }
  }

  if (!loaded) {
    return <span className="user-menu user-menu-placeholder" aria-hidden="true" />;
  }

  if (!auth) {
    return (
      <div className={`user-menu user-menu-${variant}`}>
        <a className="kakao-login-link" href="/api/auth/kakao/login">
          <span className="kakao-mark" aria-hidden="true">K</span>
          <span>카카오 로그인</span>
        </a>
      </div>
    );
  }

  return (
    <details className={`user-menu user-menu-${variant} user-menu-details`}>
      <summary className="user-name" title={auth.user.display_name}>{auth.user.display_name}<span aria-hidden="true">⌄</span></summary>
      <div className="user-menu-panel">
        {auth.requires_display_name && <a href="/account/setup-name">이름 설정</a>}
        <a href="/account">내 정보</a>
        <a href="/account/bookmarks">내 북마크</a>
        {auth.kakao.connected && <a href="/api/auth/kakao/login?prompt=login">다른 카카오 계정으로 로그인</a>}
        <button type="button" onClick={signOut} disabled={busy}>{busy ? "로그아웃 중…" : "로그아웃"}</button>
      </div>
    </details>
  );
}
