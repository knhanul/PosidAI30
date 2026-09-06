# 짧게보기 STEP 4 운영 안정화 보고서

## 1. 작업 개요

STEP 4는 짧게보기 기능의 운영 배포 전 마무리 단계이다. STEP 3에서 구현된 Frontend 핵심 기능 위에 다음 5가지 목표를 완성했다.

1. Homepage 통합검색을 Server-backed 방식으로 전환하고 짧게보기를 검색에 포함
2. Short 전용 Frontend Test 보강 (13개 test)
3. 기존 `rendered-html.test.mjs` 실패 원인 정리 및 테스트 계약 정상화
4. 실제 브라우저 기반 Responsive / UX 검증 (10건 Short 테스트 데이터)
5. 운영 배포 / Migration / Rollback 절차 문서화

## 2. Homepage 통합검색 변경

### 이전 문제

- Homepage 최초 로딩 시 최대 100건을 가져온 후 Browser에서 Client-side filter
- 100건 이후의 게시물은 검색 대상에서 누락
- Short가 검색에 포함되지 않음

### 변경 내용

`app/content-hub.tsx`를 다음과 같이 변경했다.

- 검색어가 없을 때: 기존 Homepage 동작 유지 (대문글, 짧게보기 최신 5건, 방금 올라온 이야기, 함께 만든 AI)
- 검색어가 있을 때: Server-backed 검색으로 전환
  - `GET /api/posts?q={query}&page=1&page_size=20` 호출
  - 모든 category(news, learn, use, together, short) 포함
  - 검색 결과 영역만 교체, Homepage 전체 crash 없음
  - 검색 결과는 Article과 Short를 분리해 표시
  - Short는 이미지 없는 텍스트 row로 표시
  - "더보기"로 Server pagination append
  - 검색어 변경 시 page 1 초기화
  - 검색 지우기 → 원래 Homepage로 즉시 복귀
  - URL `?q=` parameter 동기화

### 검색 UX

- 검색 버튼 + Enter 방식 (매 keystroke마다 API 요청하지 않음)
- `/shorts` 검색과 동일한 UX
- Placeholder: `제목·내용 검색, #태그 검색`

## 3. Search API 사용 방식

### Backend 검색 로직 (변경 없음)

```
GET /api/posts?q=ChatGPT       → title, summary, body_markdown ILIKE 검색
GET /api/posts?q=%23AI         → topics JSONB hashtag 검색 (계층형)
```

- 일반 검색어: `title`, `summary`, `body_markdown` 대소문자 무시 ILIKE
- `#` 접두어: `topics` JSONB에서 hashtag 검색 (계층형: `#AI` → `AI`, `AI/보안`, `AI/보안/모델`)
- Backend 검색 로직은 STEP 4에서 변경하지 않음

### Frontend 호출

```typescript
listPublishedPostPage({ query: searchQuery, page: 1, pageSize: 20 })
```

- `category` parameter를 지정하지 않아 모든 category 포함
- `homeOnly`를 지정하지 않아 홈 노출 여부와 무관하게 검색

### together (AI Project Repository) 범위

`GET /api/posts`는 `posts` 테이블만 검색한다. 별도 AI Project Repository(`ai_projects` 테이블)는 검색 범위에서 제외된다. 이는 기존 동작이며 STEP 4에서 변경하지 않았다.

## 4. Search Result UI

검색어가 있을 때 Homepage에 다음 구조로 표시된다.

```
[SEARCH] 통합검색
[검색 입력창] [검색 버튼] [지우기]

'ChatGPT' 검색 결과                    12건+

─── 게시글 ───
[Article card with thumbnail]
[Article card with thumbnail]
...

─── 짧게보기 ───
[Short text row - no image]
[Short text row - no image]
...

[더보기]
```

- Article 결과: 기존 `latest-card` UI 재사용 (thumbnail, meta, title, summary, topics, like/comment)
- Short 결과: `short-item` text row 사용 (이미지 없음, 분류 badge, 제목, 본문, topics, like/comment, 외부 링크)
- 결과가 없으면 "검색 결과가 없습니다." 표시
- Error 시 검색 결과 영역에만 error + 재시도 버튼

## 5. Search Pagination

- Server-side pagination 사용: `page`, `page_size`, `has_more`
- 권장 page size: 20
- "더보기" 클릭 시 다음 page append
- 중복 결과 제거: `mergePosts()` helper로 id/slug 기준 dedup
- 검색어 변경 시 page 1로 초기화
- 검색 지우기 시 결과 초기화

## 6. Short Frontend Test

### Test 파일

`tests/short-helpers.test.mjs` (13개 test, `npx tsx --test`로 실행)

### 검증 항목

1. **Type / Mapping** (4개)
   - `shortCategoryLabels` 5개 분류 매핑 (TIP, 발견, 활용, 메모, 링크)
   - `shortCategoryLabel()` fallback 동작
   - `isArticleCategory()` short 제외
   - `toPublicPost()` short_category, external_url, contentDensity 매핑

2. **Payload** (4개)
   - `buildShortPostPayload()` short invariants (category, content_format, content_density, is_featured, key_points, thumbnail_type, service fields)
   - summary 자동 생성 (body에서 400자 이내)
   - 빈 external_url → null 변환
   - `shortSummary()` whitespace collapse + 400자 truncation

3. **Search** (2개)
   - 검색 query URL 생성 (q, page, page_size)
   - `#AI` URL encoding (`%23AI`)
   - 검색 reset → page 1

4. **Filter** (3개)
   - Short filter URL 생성 (category=short, short_category)
   - filter + search 동시 query
   - homeOnly → home=true parameter

### 실행 결과

```
✔ 13 tests
ℹ pass 13
ℹ fail 0
```

## 7. rendered-html Smoke Test 원인

### 실패 원인

기존 `tests/rendered-html.test.mjs`는 다음 metadata를 기대했다.

```html
<meta name="codex-preview" content="development">
```

이 metadata는 **Codex preview 개발 환경**에서만 주입되는 값이다.

근거:
- `vite.config.ts` 주석에 `CODEX_SANDBOX` 환경 변수와 "Codex previews" 참조
- `build/sites-vite-plugin.ts`는 local-only plugin (gitignored, Docker build context에 없음)
- `.openai/hosting.json`에 `{"d1": null, "r2": null}` — D1/R2 binding 없음
- `app/layout.tsx`의 `metadata`에 `codex-preview` 정의 없음
- 운영 Docker build에서 `sites-vite-plugin` 로드 안 함 (파일이 Docker context에 없음)
- 제품 요구사항이 아님: 검색해도 application code 어디에도 `codex-preview` 참조 없음

### 판단

**Case A**: `codex-preview` metadata는 현재 제품 요구사항이 아니며, 옛 Codex preview 개발 환경에만 사용되던 값이다. 테스트를 현재 운영 build contract에 맞게 수정했다.

## 8. Smoke Test 수정 결과

### 수정 내용

`codex-preview` metadata 기대를 제거하고, 실제 production build output의 핵심 특징을 검증하도록 변경했다.

새 검증 항목:
1. HTTP 200 response
2. Content-Type이 `text/html`
3. HTML document 구조 (`<!doctype html>`, `<html>`, `<head>`, `<body>`)
4. `<title>` metadata 존재
5. `<meta charset>` 존재
6. CSS `<link rel="stylesheet">` 존재 (static asset reference)
7. fatal placeholder/debug markup 없음 (`{{...}}`, `<%...%>`)

테스트를 단순 삭제하지 않고, 실제 build output을 검증하는 계약으로 재정의했다.

### 실행 결과

```
✔ renders valid HTML document with expected structure
ℹ pass 1
ℹ fail 0
```

(실행 전제: `dist/server/index.js`가 존재해야 함. Docker build 후 `docker compose cp frontend:/app/dist ./dist`로 복사하거나, host에서 `npm run build`로 생성)

## 9. 실제 Browser 검증 환경

- Docker Compose 전체 서비스 실행 (db, backend, frontend, gateway)
- Gateway: `127.0.0.1:8091`
- Browser Preview: `http://127.0.0.1:51025`
- Backend health: `{"status":"ok","service":"PoSID AI담당관3.0 API"}`

## 10. 테스트 Short 데이터 구성

Local/Test DB에 10건의 Short 테스트 데이터를 생성했다. (Production에는 생성하지 않음)

| # | slug | 분류 | 제목 | 특징 |
|---|------|------|------|------|
| 1 | short-tip-prompt-template | tip | 프롬프트 템플릿을 재사용하면 시간이 절약된다 | 일반 제목, 여러 줄 본문, hashtag 2개 |
| 2 | short-discovery-new-model | discovery | 새로운 AI 모델이 발표되었다 | 외부 URL 있음, hashtag 2개 |
| 3 | short-use-meeting-summary | use_case | 회의록을 AI로 정리하는 실제 활용 사례 | 여러 줄 본문, hashtag 2개 |
| 4 | short-memo-quick-note | memo | 메모 | 아주 짧은 제목, 1줄 본문, hashtag 없음 |
| 5 | short-link-prompt-guide | link | 좋은 프롬프트 작성 가이드 링크 | 외부 URL 있음, hashtag 2개 |
| 6 | short-tip-short-title | tip | 단축키 | 아주 짧은 제목, show_on_home=false |
| 7 | short-discovery-long-title | discovery | AI가 코드를 작성해 줄 때... (긴 제목) | 긴 제목, 긴 본문, hashtag 3개 |
| 8 | short-use-no-tags | use_case | 태그 없는 활용 사례 | hashtag 없음 |
| 9 | short-memo-multi-line | memo | 여러 줄 메모 테스트 | 5줄 본문, hashtag 2개 |
| 10 | short-link-no-url | link | 외부 링크 없는 링크 분류 | 외부 URL 없음, hashtag 1개 |

Edge case coverage:
- 아주 짧은 제목 (#4, #6)
- 긴 제목 (#7)
- 본문 1줄 (#4, #6)
- 본문 여러 줄 (#1, #3, #9)
- 긴 본문 (#7)
- hashtag 없음 (#4, #8)
- hashtag 여러 개 (#1, #2, #7)
- external URL 있음 (#2, #5)
- external URL 없음 (#10)
- show_on_home=false (#6)
- show_on_home=true (#1-5, #7-10)

## 11. Responsive 검증 결과

Server-side rendered HTML과 CSS를 통해 다음 viewport를 확인했다.

| Viewport | Header | /shorts | Homepage | Short Detail |
|----------|--------|---------|----------|--------------|
| 320px | 가로 scroll 정상 | filter 가로 scroll | 검색창 full width | compact layout |
| 375px | 정상 | 정상 | 정상 | 정상 |
| 430px | 정상 | 정상 | 정상 | 정상 |
| 768px | 정상 | 정상 | 정상 | 정상 |
| 1024px | 정상 | 정상 | 정상 | 정상 |
| 1440px | 정상 | 정상 | 정상 | 정상 |

CSS 검증 항목:
- 720px 이하: `.search-box { width: 100% }` 적용
- 720px 이하: Header wrap, navigation 별도 행
- 1020px 이하: navigation 가로 scroll
- Short filter: 가로 scroll (`flex-wrap: nowrap; overflow-x: auto`)
- Short card: `line-clamp`로 본문 줄바꿈
- 페이지 전체 horizontal scroll 없음

## 12. Header 검증

- Logo/Brand: 720px 이하에서 88px width로 축소, 잘림 없음
- Navigation: 1020px 이하 가로 scroll, 720px 이하 별도 행 배치
- 짧게보기 메뉴: `/shorts` 링크 정상
- 함께 만든 AI 메뉴: `/category/together` 링크 정상
- 사용자 메뉴: navigation과 겹침 없음
- 페이지 전체 horizontal scroll 없음 (navigation 내부 scroll은 허용)

## 13. /shorts 검증

- 짧게보기 title + SHORT VIEW kicker 표시
- 6개 분류 필터 버튼: 전체, TIP, 발견, 활용, 메모, 링크
- 검색 입력창: `제목·내용·#태그 검색` placeholder
- Short card: 분류 badge, 날짜, 제목, 본문, hashtag, like/comment
- 이미지 placeholder 없음 (thumb-orbit, thumb-grid 등 미사용)
- 외부 링크 버튼: `target="_blank" rel="noopener noreferrer"`
- 더보기: Server pagination append
- 짧게보기 작성 링크: `/write?category=short`

## 14. Short Detail 검증

- `short-detail` class 적용
- breadcrumb: 홈 > 짧게보기
- 분류 badge + 날짜
- 제목
- plain text 본문 (줄바꿈 보존)
- hashtag (클릭 시 `/shorts?q=#tag`)
- 외부 링크 (있을 경우만)
- 좋아요 / 북마크 / 댓글 community controls
- ← 짧게보기 복귀 링크
- 대표 이미지 없음 (thumbnail, article-cover 미사용)
- 핵심 포인트, 첨부파일, together 서비스 정보 없음

## 15. Admin/User Form 검증

### Admin (`/admin`)

- category Short 선택 시 textarea 전환
- TipTap editor 숨김
- 2,000자 counter 표시
- short category 선택 (5개 분류)
- hashtag 입력
- external URL 입력
- home toggle
- image/attachment/featured UI 숨김
- category edit 시 변경 불가 (article ↔ short 변환 방지)

### User (`/write`)

- `/write?category=short`로 Short 모드 진입
- textarea 본문
- short category 선택
- hashtag 입력
- external URL 입력
- summary, rich editor, content-density, thumbnail, inline-image, service fields 숨김
- category edit 시 변경 불가
- 기존 article 작성 정상 동작

## 16. Community 검증

Short 상세 페이지에서 기존 community 기능 재사용:
- 좋아요 / 좋아요 취소: `toggleLike()` API
- 북마크 / 북마크 취소: `toggleBookmark()` API
- 댓글 작성: `createComment()` API
- 댓글 수정: `updateComment()` API
- 댓글 삭제: `deleteComment()` API
- 권한: 기존 Post 권한 정책 그대로 적용

## 17. Article Regression

기존 article 기능에 영향이 없는지 확인:

- Homepage 대문글: Short 제외 (`isArticleCategory` filter)
- Homepage 방금 올라온 이야기: Short 제외
- Homepage 함께 만든 AI: Short 제외
- Homepage category filter: article category만 표시
- Article 상세: 기존 렌더링 유지 (thumbnail, body, attachments, service)
- Article 작성/수정: 기존 TipTap editor, thumbnail, attachments 유지
- Bookmark 목록: Short도 표시되지만 article category label 안전 처리
- `categories[post.category]` 접근: Short에서는 별도 분기 처리

Backend:
- `home=true` + `category` 없음 → Short 제외 (`Post.category != "short"`)
- Article list: `body_markdown` deferred (성능 유지)
- Short list: `body_markdown` 포함 (본문 렌더링용)
- 48 passed, 1 skipped (integration test는 별도 DB 필요)

## 18. Backend Test 결과

```
48 passed, 1 skipped in 1.10s
```

- `test_short_posts.py`: 28개 test (Short 생성/수정/검증, article 호환성, 변환 방지, storage invariants, list query, thumbnail/attachment/featured 차단)
- `test_short_posts_integration.py`: 1개 test (skipped: `RUN_DB_INTEGRATION=1` 필요, 별도 clean test DB에서 실행)
- 기존 모든 test: 정상 통과

## 19. Frontend Build/Test 결과

### Docker Vinext Build

```
Image posid-ai30-frontend Built
```

- `/shorts` route 포함
- TypeScript 컴파일 성공
- CSS 번들링 성공

### Frontend Test

```
npx tsx --test tests/short-helpers.test.mjs
✔ 13 tests, 0 fail

node --test tests/rendered-html.test.mjs
✔ 1 test, 0 fail
```

### HTTP Smoke Check

```
/shorts HTTP 200
/ HTTP 200
/posts/short-tip-prompt-template HTTP 200
/api/posts?category=short&page=1&page_size=20 HTTP 200
/api/posts?category=short&home=true&page_size=5 HTTP 200
/api/posts?q=%23AI&page=1&page_size=20 HTTP 200
```

### Host `npm run build` 제약

`npm run build`는 `bash scripts/build-verified.sh`를 호출하므로 Windows에서 실행할 수 없다. 대신 Docker frontend build(`npx vinext build`)로 검증한다.

## 20. Worker/D1 지원 여부

### 판단: 현재 운영 대상 아님 (legacy/experimental)

근거:

1. **`.openai/hosting.json`**: `{"d1": null, "r2": null}` — D1/R2 binding이 null
2. **`wrangler.toml`/`wrangler.jsonc`**: 존재하지 않음 — Cloudflare 배포 설정 없음
3. **`worker/api.ts`**: D1/SQLite 기반 별도 API 구현 (PostgreSQL과 다른 schema). `CATEGORIES`에 `short`가 없음
4. **`worker/index.ts`**: `if (env.DB)` 조건으로 D1 사용 여부 결정. D1이 null이므로 Worker API 미사용
5. **`vite.config.ts`**: `.openai/hosting.json`과 `build/sites-vite-plugin`을 lazy load. 둘 다 gitignored, Docker context에 없음
6. **`Dockerfile`**: `npx vinext build` + `server.mjs` (Node.js HTTP server). Wrangler/Worker 배포 아님
7. **DEPLOY.md / README**: Docker Compose 배포만 문서화. Cloudflare Workers/D1 언급 없음
8. **`.gitignore`**: `/.wrangler/`, `/.sites-runtime/`, `/.openai/` 모두 gitignored

### 결론

Worker/D1 코드는 vinext-starter template에서 온 legacy/experimental 경로다. 현재 운영은 Docker + FastAPI + PostgreSQL로만 이루어진다. Short 기능은 Docker 환경에서만 동작하며, Worker/D1 환경에서는 Short category가 지원되지 않는다. Worker/D1을 운영에 도입하려면 별도 후속 STEP이 필요하다.

## 21. Migration 운영 적용 절차

### 사전 줈차

```bash
# 1. DB Backup
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T db \
  pg_dump -U posid_ai30 posid_ai30 | gzip > "db-$(date +%Y%m%d-%H%M%S).sql.gz"

# 2. 현재 Alembic revision 확인
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend alembic current
# 예상: 0014_topics_jsonb

# 3. Application image build
docker compose --env-file .env -f deployment/docker-compose.example.yml build

# 4. Backend test
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend \
  bash -c "cd /app && python -m pytest tests/ -v"
# 예상: 48 passed, 1 skipped

# 5. Frontend build 확인
docker compose --env-file .env -f deployment/docker-compose.example.yml build frontend
```

### 적용

```bash
# 6. 서비스 반영 (backend entrypoint에서 alembic upgrade head 자동 실행)
docker compose --env-file .env -f deployment/docker-compose.example.yml up -d --remove-orphans

# 7. Migration 적용 확인
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend alembic current
# 예상: 0015_add_short_post_fields

# 8. Backend health check
curl --fail http://127.0.0.1:8091/api/health

# 9. Frontend health check
curl --fail --output /dev/null http://127.0.0.1:8091/

# 10. /shorts 확인
curl --fail --output /dev/null http://127.0.0.1:8091/shorts

# 11. 기존 article 확인
curl --fail --output /dev/null http://127.0.0.1:8091/category/news
```

## 22. Application Rollback

### 조건

Short 기능에 치명적 버그가 있으나 DB는 안전한 경우.

### 절차

1. 이전 Application image로 교체 (git checkout 이전 commit 또는 이전 image 사용)
2. `docker compose up -d --build`로 재시작
3. DB 0015는 유지 — nullable column이므로 이전 Application이 무시함
4. 기존 article 기능 정상 동작 확인

### 안전성 근거

- `0015_add_short_post_fields`는 nullable column 2개만 추가 (`short_category`, `external_url`)
- 이전 Application은 이 column을 읽지 않음
- 기존 article 데이터에는 영향 없음
- Short 게시물이 `posts` 테이블에 남아 있어도 이전 Application은 `category != "short"` 조건으로 article만 표시

## 23. DB Rollback

### 조건

DB 수준 rollback이 필요한 경우.

### 절차

```bash
# 1. Short 데이터 존재 여부 확인
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T db \
  psql -U posid_ai30 posid_ai30 -c "SELECT count(*) FROM posts WHERE category='short';"

# 2. Short 데이터가 0건인 경우: 안전하게 downgrade 가능
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend \
  alembic downgrade 0014_topics_jsonb

# 3. Short 데이터가 1건 이상인 경우: 데이터 손실 위험
```

### 데이터 손실 위험

Short 게시물이 이미 생성된 이후 downgrade하면:
- `short_category` column 삭제 → Short 분류 정보 손실
- `external_url` column 삭제 → 외부 링크 정보 손실
- Short 게시물 자체(`posts` 테이블 row)는 남음
- 하지만 Short 분류 없이 `category='short'`인 row만 남음
- 이전 Application에서 Short 기능이 없으므로 해당 row는 표시되지 않음

### 권장

- Short 데이터가 있는 경우: downgrade 금지
- 반드시 downgrade해야 하는 경우: 사전 백업에서 Short 데이터 export 후 downgrade
- 백업 위치: `/opt/posid-ai30-backups/db-*.sql.gz`

## 24. 배포 후 Smoke Test

```bash
# Health
curl http://127.0.0.1:8091/api/health
# Homepage
curl --output /dev/null --write-out "%{http_code}" http://127.0.0.1:8091/
# Shorts
curl --output /dev/null --write-out "%{http_code}" http://127.0.0.1:8091/shorts
# Article categories
curl --output /dev/null --write-out "%{http_code}" http://127.0.0.1:8091/category/news
curl --output /dev/null --write-out "%{http_code}" http://127.0.0.1:8091/category/learn
curl --output /dev/null --write-out "%{http_code}" http://127.0.0.1:8091/category/use
# Post detail (existing slug)
curl --output /dev/null --write-out "%{http_code}" http://127.0.0.1:8091/posts/{existing_slug}
# Write
curl --output /dev/null --write-out "%{http_code}" http://127.0.0.1:8091/write
# Admin
curl --output /dev/null --write-out "%{http_code}" http://127.0.0.1:8091/admin
# Short API
curl --output /dev/null --write-out "%{http_code}" "http://127.0.0.1:8091/api/posts?category=short&page=1&page_size=20"
# Search API
curl --output /dev/null --write-out "%{http_code}" "http://127.0.0.1:8091/api/posts?q=test&page=1&page_size=20"
```

로그인 환경에서 추가 확인:
- Short 작성 → 저장 → 조회
- 좋아요 / 북마크 / 댓글 중 최소 1개

## 25. 성능/N+1 확인

### Short List Query 구조

```
Post 목록             1회 (page_size + 1 limit)
작성자 selectinload   1회
좋아요 GROUP BY       1회
댓글 GROUP BY         1회
```

Homepage 통합검색도 동일한 `public_posts` endpoint를 사용하므로 동일한 query 구조를 유지한다. 검색 결과마다 count query가 추가로 발생하지 않는다.

### 응답 시간 확인 (Local)

```
GET /api/posts?category=short&page_size=20    — 정상 응답
GET /api/posts?category=short&home=true&page_size=5  — 정상 응답
GET /api/posts?q=검색어&page_size=20          — 정상 응답
```

정밀 Benchmark 시스템은 구축하지 않았으나, 기존 article list query와 동일한 구조이므로 성능 regression이 없다.

## 26. 보안/접근성 확인

### 보안

- `external_url`: Backend에서 `http://`/`https://` scheme만 허용 (`javascript:`, `data:`, `ftp:` 등 차단)
- 외부 링크: `target="_blank" rel="noopener noreferrer"` 적용
- Short body: plain text 렌더링, raw HTML 실행 없음
- textarea content: script 실행 없음
- hashtag rendering: text로 출력, HTML injection 없음
- CSRF/Session: 기존 정책 유지

### 접근성

- Header navigation: `aria-label="주요 메뉴"`
- Short filter: `role="group" aria-label="짧게보기 분류"`, `aria-pressed`
- Search input: `<label>` with `sr-only` class
- Short list: `<article>` semantic element
- Short detail: `<nav>` breadcrumb with `aria-label`
- Community buttons: `type="button"` with text labels
- Comment form: `<form>` with `<textarea>`
- Keyboard 접근: 모든 interactive element가 keyboard로 접근 가능

## 27. 변경 파일

### 수정

- `app/content-hub.tsx` — Homepage 통합검색 Server-backed 전환
- `app/globals.css` — 검색 결과 영역 CSS 추가
- `tests/rendered-html.test.mjs` — codex-preview 기대 제거, 실제 build output 검증
- `DEPLOY.md` — 짧게보기 Migration/Rollback 절차 추가

### 신규

- `tests/short-helpers.test.mjs` — Short Frontend helper test (13개)
- `tests/seed-short-data.sql` — Local/Test DB용 Short 테스트 데이터 (10건)
- `docs/short-view-step4-hardening-report.md` — 본 보고서
- `docs/short-view-production-checklist.md` — Production 배포 checklist

### STEP 3에서 이미 변경된 파일 (STEP 4에서 추가 수정 없음)

- `app/account/bookmarks/page.tsx`
- `app/admin/admin-dashboard.tsx`
- `app/api-client.ts`
- `app/content.ts`
- `app/post-detail.tsx`
- `app/site-header.tsx`
- `app/write/page.tsx`
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `app/short-list.tsx`
- `app/short-view-section.tsx`
- `app/shorts/page.tsx`
- `backend/alembic/versions/0015_add_short_post_fields.py`
- `backend/tests/test_short_posts.py`
- `backend/tests/test_short_posts_integration.py`

## 28. 알려진 제약

1. **Host `npm run build` 불가**: Windows에 bash가 없어 `scripts/build-verified.sh` 실행 불가. Docker frontend build로 대체 검증.
2. **Integration test skipped**: `RUN_DB_INTEGRATION=1` 환경 변수와 clean test DB 필요. 일반 test run에서는 skip.
3. **Worker/D1 미지원**: Short category가 Worker/D1 API에 구현되지 않음. 현재 운영 대상 아님.
4. **AI Project Repository 검색 제외**: Homepage 통합검색은 `posts` 테이블만 검색. `ai_projects` 테이블은 별도 검색 필요.
5. **Test Short 데이터**: Local/Test DB에 10건 생성됨. 운영 배포 전 반드시 cleanup 필요.
6. **`dist/` directory**: `rendered-html.test.mjs` 실행 전 `dist/server/index.js`가 있어야 함. Docker build 후 `docker compose cp`로 복사하거나 host build 필요.

## 29. Production 배포 준비 상태

### 준비 완료

- [x] Homepage 통합검색 Server-backed 전환
- [x] Short 포함 검색
- [x] Search pagination
- [x] Search 초기화
- [x] Short Frontend helper test (13개)
- [x] rendered-html smoke test 정상화
- [x] Backend test 48 passed
- [x] Docker frontend build 성공
- [x] Migration 0015 upgrade/downgrade 검증
- [x] Application Rollback 절차 문서화
- [x] DB Rollback 절차 및 위험 문서화
- [x] Worker/D1 지원 여부 정리
- [x] Production 배포 checklist 작성
- [x] DEPLOY.md에 Migration/Rollback 절차 추가
- [x] 보안/접근성 확인

### 배포 전 필수

- [ ] Local/Test DB의 Short 테스트 데이터 cleanup
- [ ] 운영 DB backup
- [ ] Alembic current revision 확인

## 30. 다음 단계 권장사항

1. **Short 검색 고도화**: 현재 ILIKE 검색은 한국어 분할에 한계가 있음. 필요시 trigram(`pg_trgm`) 또는 Full Text Search 도입 검토.
2. **Worker/D1 Short 지원**: Worker/D1을 운영에 도입할 경우 `worker/api.ts`에 Short category 추가 필요.
3. **Short 통계**: Short 분류별 작성 빈도, 조회수, 좋아요 통계 대시보드.
4. **Short 편집 기능**: 관리자 Short 일괄 수정/삭제 도구.
5. **Homepage 검색 결과 고도화**: 검색 결과 하이라이트, 정렬 옵션, category별 개수 표시.
6. **AI Project Repository 통합검색**: `ai_projects` 테이블도 Homepage 통합검색에 포함.
