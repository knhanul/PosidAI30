"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe, updateDisplayName, type AuthState } from "../../api-client";

export default function SetupNamePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    getMe()
      .then((data) => {
        setAuth(data);
        setDisplayName(data.requires_display_name ? params.get("suggested") ?? data.suggested_display_name ?? "" : data.user.display_name);
        if (!data.requires_display_name) router.replace("/");
      })
      .catch(() => router.replace("/"))
      .finally(() => setBusy(false));
  }, [params, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setBusy(true); setError("");
    try { const updated = await updateDisplayName(displayName, auth.csrf_token); setAuth(updated); router.replace("/"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "이름을 저장하지 못했습니다."); setBusy(false); }
  }

  if (busy && !auth) return <main className="load-state"><strong>이름 설정 화면을 준비하고 있습니다.</strong></main>;
  return <main className="admin-login-page"><section className="admin-login-card account-name-card"><Link href="/">← 홈으로</Link><span className="admin-kicker">WELCOME</span><h1>사용할 이름을 정해 주세요</h1><p>서비스에서 표시할 이름입니다.<br />카카오 닉네임을 그대로 사용하거나 원하는 이름으로 바꿀 수 있습니다.</p><form onSubmit={submit}><label><span>닉네임</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={20} autoFocus required /></label>{error && <div className="form-message error" role="alert">{error}</div>}<button className="admin-primary" disabled={busy}>{busy ? "저장 중…" : "이 이름으로 시작하기"}</button></form></section></main>;
}
