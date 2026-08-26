"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "../../api-client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") return "";
    const reason = new URLSearchParams(window.location.search).get("kakao_error");
    const messages: Record<string, string> = { not_linked: "이 서비스에 연결된 관리자 계정이 아닙니다. 기존 관리자 계정으로 로그인한 후 카카오 계정을 연결해 주세요.", kakao_unavailable: "카카오 로그인을 사용할 수 없습니다.", kakao_failed: "카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.", invalid_state: "카카오 로그인 요청이 만료되었거나 올바르지 않습니다.", cancelled: "카카오 로그인을 취소했습니다.", login_required: "계정 연결 전 기존 관리자 계정으로 로그인해 주세요.", already_linked: "이미 다른 관리자 계정에 연결된 카카오 계정입니다." };
    return reason ? messages[reason] ?? "카카오 로그인을 완료하지 못했습니다." : "";
  });
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await login(username, password); router.push("/admin"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "로그인할 수 없습니다."); }
    finally { setBusy(false); }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <Link className="admin-login-brand" href="/"><img src="/brand/posid-ci-02.jpg" alt="PoSID" /><span>AI담당관 <b>3.0</b></span></Link>
        <span className="admin-kicker">CONTENT MANAGER</span><h1>관리자 로그인</h1><p>글과 서비스를 등록하고 관리합니다.</p>
        <a className="admin-primary kakao-login-button" href="/api/auth/kakao/login">카카오로 로그인</a>
        <a className="alternate-kakao-login" href="/api/auth/kakao/login?prompt=login">다른 카카오 계정으로 로그인</a>
        <div className="login-divider"><span>또는</span></div>
        <p>기존 관리자 로그인</p>
        <form onSubmit={submit}>
          <label><span>아이디</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          <label><span>비밀번호</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {message && <div className="form-message error" role="alert">{message}</div>}
          <button className="admin-primary" disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
        </form>
        <Link className="admin-back" href="/">← 사이트로 돌아가기</Link>
      </section>
    </main>
  );
}
