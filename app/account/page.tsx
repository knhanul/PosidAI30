"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMe, updateDisplayName, type AuthState } from "../api-client";

export default function AccountPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => { getMe().then((data) => { setAuth(data); setDisplayName(data.user.display_name); }).catch(() => {}).finally(() => setBusy(false)); }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setBusy(true); setError(""); setMessage("");
    try { const updated = await updateDisplayName(displayName, auth.csrf_token); setAuth(updated); setDisplayName(updated.user.display_name); setEditing(false); setMessage("닉네임을 변경했습니다."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "닉네임을 변경하지 못했습니다."); }
    finally { setBusy(false); }
  }

  if (busy && !auth) return <main className="load-state"><strong>내 정보를 불러오고 있습니다.</strong></main>;
  if (!auth) return <main className="load-state"><strong>로그인이 필요합니다.</strong><Link href="/">홈으로 돌아가기</Link></main>;
  return <main className="admin-login-page"><section className="admin-login-card account-card"><Link href="/">← 홈으로</Link><span className="admin-kicker">ACCOUNT</span><h1>내 정보</h1><div className="account-detail"><span>현재 닉네임</span><strong>{auth.user.display_name}</strong></div>{editing ? <form onSubmit={save}><label><span>새 닉네임</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={20} autoFocus required /></label><div className="account-form-actions"><button className="admin-primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button><button type="button" className="admin-secondary" onClick={() => { setEditing(false); setDisplayName(auth.user.display_name); }}>취소</button></div></form> : <button className="admin-primary" onClick={() => { setEditing(true); setMessage(""); }}>닉네임 변경</button>}{message && <div className="form-message success">{message}</div>}{error && <div className="form-message error" role="alert">{error}</div>}<div className="account-links"><Link href="/account/bookmarks">내 북마크</Link>{auth.kakao.connected && <a href="/api/auth/kakao/login?prompt=login">다른 카카오 계정으로 로그인</a>}{auth.user.role === "admin" && <Link href="/admin">관리자 화면</Link>}</div></section></main>;
}
