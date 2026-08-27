"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { createAiProject, listAiProjects, type AiProject, type AiProjectListResponse, type AuthState } from "../api-client";
import SiteIcon from "../site-icon";
import UserMenu from "../user-menu";

export const PROJECT_TYPES = ["Windows 프로그램", "웹서비스", "모바일 앱", "자동화 도구", "AI 활용 사례", "문서·콘텐츠", "기타"];
export const PROJECT_PLATFORMS = ["Windows", "Web", "Android", "iOS", "Linux", "macOS", "기타"];
export const RESOURCE_CATEGORIES = ["도움말", "보고서", "샘플", "문서", "기타", "프롬프트", "이미지", "영상"];
const emptyResult: AiProjectListResponse = { items: [], page: 1, page_size: 12, total: 0, total_pages: 0, types: [], platforms: [], can_create: false };
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value)) : "-";
const formatSize = (size = 0) => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;

export default function TogetherProjectList() {
  const [data, setData] = useState(emptyResult);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [platform, setPlatform] = useState("");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    listAiProjects({ q: search, type, platform, sort, page, pageSize: 12 })
      .then(setData).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [search, type, platform, sort, page]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  function submitSearch(event: FormEvent) { event.preventDefault(); setPage(1); setSearch(query.trim()); }
  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!auth) return;
    const form = new FormData(event.currentTarget); setCreating(true); setCreateError("");
    try {
      const project = await createAiProject({
        name: String(form.get("name")), summary: String(form.get("summary")), description: String(form.get("description")),
        website_url: String(form.get("website_url")).trim() || null, project_type: String(form.get("project_type")),
        visibility: String(form.get("visibility")) as "public" | "private" | "unlisted",
        categories: String(form.get("categories")).split(",").map((item) => item.trim()).filter(Boolean),
        platforms: form.getAll("platforms").map(String), links: [], readme_markdown: "",
      }, auth.csrf_token);
      window.location.assign(`/together-ai/${project.slug}`);
    } catch (reason) { setCreateError(reason instanceof Error ? reason.message : "프로젝트를 만들지 못했습니다."); setCreating(false); }
  }

  return <div className="together-projects">
    <header className="simple-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="Posid AI담당관3.0 홈"><span className="brand-logo-wrap"><img src="/brand/posid-ci-02.jpg" alt="PoSID" /></span><span className="brand-divider" /><span className="brand-service">AI담당관 <b>3.0</b></span></Link>
      <div className="simple-actions"><UserMenu onAuthChange={setAuth} /><Link className="back-link" href="/">홈으로 <SiteIcon name="arrow" size={17} /></Link></div>
    </div></header>
    <main>
      <section className="together-list-hero"><div className="together-shell"><div><span className="section-kicker">TOGETHER AI</span><h1>함께 만든 AI</h1><p>AI와 함께 만든 프로그램과 업무 산출물을 보관하고 공유합니다.</p></div>{auth && data.can_create && <button className="together-primary" type="button" onClick={() => (document.getElementById("new-project-dialog") as HTMLDialogElement)?.showModal()}>+ 새 프로젝트</button>}</div></section>
      <section className="together-shell together-list-body">
        <form className="together-filters" onSubmit={submitSearch}><label className="together-search"><SiteIcon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="프로젝트 이름이나 설명 검색" aria-label="프로젝트 검색" /></label><select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="유형"><option value="">모든 유형</option>{Array.from(new Set([...PROJECT_TYPES, ...data.types])).map((item) => <option key={item}>{item}</option>)}</select><select value={platform} onChange={(e) => { setPlatform(e.target.value); setPage(1); }} aria-label="플랫폼"><option value="">모든 플랫폼</option>{PROJECT_PLATFORMS.map((item) => <option key={item}>{item}</option>)}</select><select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="정렬"><option value="latest">최근 업데이트순</option><option value="newest">등록순</option><option value="downloads">다운로드순</option><option value="views">조회순</option><option value="name">이름순</option></select><button type="submit">검색</button></form>
        {!loading && !error && <div className="together-result-count"><strong>{data.total}</strong>개의 프로젝트</div>}
        {loading ? <Status title="프로젝트를 불러오는 중입니다." detail="잠시만 기다려 주세요." busy /> : error ? <Status title="프로젝트를 불러오지 못했습니다." detail={error} action={load} /> : data.items.length ? <div className="project-card-grid">{data.items.map((project) => <ProjectCard key={project.id} project={project} />)}</div> : <Status title={search || type || platform ? "조건에 맞는 프로젝트가 없습니다." : "아직 등록된 프로젝트가 없습니다."} detail={search || type || platform ? "검색어나 필터를 바꿔 다시 찾아보세요." : "AI와 함께 만든 프로그램이나 자료를 프로젝트로 등록해 보세요."} />}
        {!loading && !error && data.total_pages > 1 && <nav className="together-pagination" aria-label="페이지 이동"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>이전</button><span>{page} / {data.total_pages}</span><button disabled={page >= data.total_pages} onClick={() => setPage((value) => value + 1)}>다음</button></nav>}
      </section>
    </main>
    <dialog id="new-project-dialog" className="together-dialog project-create-dialog"><form method="dialog" className="dialog-close"><button aria-label="닫기">×</button></form><div><span className="section-kicker">NEW PROJECT</span><h2>새 프로젝트</h2><form onSubmit={submitProject} className="together-form"><label>프로젝트 이름<input name="name" required maxLength={180} /></label><label>한 줄 설명<textarea name="summary" maxLength={500} rows={2} /></label><label>상세 설명<textarea name="description" rows={4} /></label><div className="form-grid"><label>프로젝트 유형<select name="project_type" required defaultValue="Windows 프로그램">{PROJECT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label>공개 범위<select name="visibility" defaultValue="public"><option value="public">공개</option><option value="unlisted">링크 공개</option><option value="private">비공개</option></select></label></div><label>지원 플랫폼<div className="choice-grid">{PROJECT_PLATFORMS.map((item) => <label key={item}><input type="checkbox" name="platforms" value={item} />{item}</label>)}</div></label><label>카테고리<input name="categories" placeholder="쉼표로 구분" /></label><label>웹사이트<input name="website_url" type="url" placeholder="https://" /></label>{createError && <p className="form-error">{createError}</p>}<button className="together-primary" disabled={creating}>{creating ? "만드는 중…" : "프로젝트 만들기"}</button></form></div></dialog>
  </div>;
}

function ProjectCard({ project }: { project: AiProject }) {
  const primary = project.latest_release?.files.find((file) => file.is_primary);
  const latestHref = `/api/ai-projects/${encodeURIComponent(project.slug)}/download/latest`;
  return <article className="project-card"><Link href={`/together-ai/${project.slug}`} className="project-card-main"><div className="project-icon">{project.icon_url ? <img src={project.icon_url} alt="" /> : <SiteIcon name="cube" size={28} />}</div><div className="project-tags"><span>{project.project_type}</span>{project.platforms.slice(0, 2).map((item) => <span key={item}>{item}</span>)}</div><h2>{project.name}</h2><p>{project.summary}</p></Link><div className="project-latest"><div><small>최신 버전</small><strong>{project.latest_release?.version ?? "릴리스 준비 중"}</strong><span>{formatDate(project.latest_release?.release_date)}{primary ? ` · ${formatSize(primary.size)}` : ""}</span></div>{primary ? <a className="together-primary small" href={latestHref} download>최신 다운로드</a> : <span className="together-disabled" title="최신 릴리스에 기본 파일이 없습니다.">다운로드 없음</span>}</div><div className="project-stats"><span>조회 {project.view_count.toLocaleString()}</span><span>다운로드 {project.download_count.toLocaleString()}</span></div></article>;
}
function Status({ title, detail, action, busy }: { title: string; detail: string; action?: () => void; busy?: boolean }) { return <div className="together-status" aria-live="polite">{busy && <span className="loading-dot" />}<strong>{title}</strong><p>{detail}</p>{action && <button onClick={action}>다시 시도</button>}</div>; }
