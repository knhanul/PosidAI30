# POSID AI담당관 3.0 짧게보기 STEP 1 분석

> 작성일: 2026-09-06  
> 범위: 현행 코드·로컬 DB 스키마 분석 및 구현 설계만 수행  
> 제외: 애플리케이션 코드 수정, Migration 생성·적용, DB 데이터 변경, API/페이지 구현, 리팩터링

## 1. Executive Summary

현재 일반 콘텐츠는 별도 게시판 테이블이 아니라 PostgreSQL `posts` 한 테이블의 `category` 문자열(`news`, `learn`, `use`, `together`)로 구분된다. 댓글, 좋아요, 북마크, 첨부파일은 모두 `posts.id`를 참조하고, 공개 목록·상세·작성·수정·관리자 관리 또한 `Post` 모델과 공통 API를 중심으로 구성되어 있다.

따라서 짧게보기는 **별도 `short_posts` 테이블을 만들지 않고 기존 `posts` 구조를 확장하는 OPTION A**가 가장 적합하다. 구체적으로는 다음을 권장한다.

- 최상위 게시판 구분: `posts.category = "short"`
- 짧게보기 내부 분류: nullable `short_category` (`tip`, `discovery`, `use_case`, `memo`, `link`)
- 선택적 외부 링크: nullable `external_url`
- 짧은 본문: 기존 `body_markdown`에 plain text/markdown으로 저장
- 목록용 요약: `summary`를 본문에서 자동 생성하거나 동일한 짧은 내용을 사용
- 이미지: `thumbnail_type="preset"`, 실제 thumbnail 경로는 NULL로 유지하고 짧게보기 UI에서는 `Thumb`을 렌더링하지 않음
- 목록 API: 기존 `GET /api/posts?category=short` 확장
- 상세·댓글·좋아요·북마크: 기존 `/posts/{slug}` 및 `/api/posts/{post_id}/...` 재사용
- 홈페이지: `ContentHub` 안에서 `ShortViewSection`을 대문글과 방금 올라온 이야기 사이에 배치하고 최신 5건을 별도 요청

새 테이블 방식은 댓글·좋아요·북마크 FK와 API, 관리자 화면, 검색, 감사 로그를 이중화하거나 다형 관계로 바꿔야 하므로 현재 구조에서는 비용과 회귀 위험이 훨씬 크다.

현행 운영 경로는 React/Vinext → Nginx gateway → FastAPI → PostgreSQL/WebDAV이다. 저장소에는 Cloudflare D1/R2용 대체 실행 경로도 존재하므로, 해당 호스팅 경로를 계속 지원해야 한다면 STEP 2에서 `worker/api.ts`와 `db/schema.ts`도 동일하게 맞춰야 한다.

## 2. 현재 기술 스택

| 영역 | 실제 구성 | 근거 |
|---|---|---|
| Frontend | React 19.2.6, Next.js 16.2.6 App Router 호환 구조, Vinext 0.0.50, Vite 8 | `package.json`, `app/**/page.tsx`, `vite.config.ts` |
| Frontend 실행 | Vinext worker build를 Node HTTP 서버(`server.mjs`)가 실행 | `Dockerfile`, `server.mjs` |
| Backend | FastAPI 0.116.1, Uvicorn 0.35.0 | `backend/requirements.txt`, `backend/entrypoint.sh` |
| ORM | SQLAlchemy 2.0.43 declarative ORM | `backend/app/database.py`, `backend/app/models.py` |
| Database | PostgreSQL 16, psycopg 3.2.9 | `deployment/docker-compose.example.yml`, `backend/requirements.txt` |
| Validation | Pydantic/Pydantic Settings | `backend/app/schemas.py`, `backend/app/config.py` |
| Migration | Alembic 1.16.5, 현재 head `0014_topics_jsonb` | `backend/alembic/`, 로컬 `alembic current/heads` 확인 |
| 인증 | HttpOnly 세션 쿠키 + DB 세션 + CSRF, ID/비밀번호, Kakao OAuth | `backend/app/security.py`, `backend/app/main.py` |
| 권한 | `admin_users.role`의 `admin`/`user`; Dependency로 검사 | `backend/app/models.py`, `backend/app/security.py` |
| Editor | TipTap 2.x WYSIWYG, HTML 저장, 이미지 paste/drop/upload | `app/rich-text-editor.tsx`, `package.json` |
| HTML 보안 | Bleach allow-list sanitization | `backend/app/main.py`의 `sanitize_html()` |
| CSS/UI | 외부 컴포넌트 프레임워크 없이 단일 `app/globals.css`와 React 컴포넌트; Tailwind 패키지는 있으나 현행 UI는 클래스 기반 CSS | `app/globals.css`, `package.json` |
| 파일 저장 | 개발은 `/app/storage` 로컬, 운영은 WebDAV; 메타데이터는 PostgreSQL | `backend/app/config.py`, `backend/app/webdav.py` |
| 이미지 저장 | 대표/본문 이미지를 WebDAV 또는 로컬 Storage adapter에 저장 | `backend/app/main.py`, `backend/app/webdav.py` |
| WebDAV | 운영 설정 시 Digest Auth, TLS 1.2, MKCOL/PUT/GET/DELETE | `backend/app/webdav.py` |
| Docker | `db`, `backend`, `frontend`, `gateway` 4개 서비스 | `deployment/docker-compose.example.yml` |
| Reverse Proxy | 호스트 Nginx → `127.0.0.1:8091` → 내부 gateway; `/api/*`는 FastAPI, 나머지는 frontend | `deployment/*.conf`, `README.md` |
| Frontend test | Node 내장 test runner; 현재 rendered HTML smoke test 1개 | `package.json`, `tests/rendered-html.test.mjs` |
| Backend test | pytest 형식 테스트 2개 파일. 단, `pytest`는 운영 `requirements.txt`에 명시되지 않음 | `backend/tests/` |
| 대체 호스팅 | Cloudflare Worker + D1/R2 경로가 별도로 존재 | `worker/index.ts`, `worker/api.ts`, `db/schema.ts`, `vite.config.ts` |

### API 통신 구조

Docker 운영 기준으로 브라우저는 상대 경로 `/api/...`를 호출한다. 내부 Nginx가 `/api/`를 `backend:8000`으로, 그 외 요청을 `frontend:3000`으로 프록시한다. `apiFetch()`는 `credentials: "include"`로 세션 쿠키를 전달한다.

## 3. Frontend 구조

### 3.1 주요 디렉터리와 Routing

Vinext가 Next.js App Router 형태의 `app/` 구조를 사용한다.

- `/`: `app/page.tsx` → `ContentHub`
- `/category/[slug]`: `app/category/[slug]/page.tsx`
- `/posts/[slug]`: `app/posts/[slug]/page.tsx` → `PostDetail`
- `/write`: `app/write/page.tsx`
- `/admin`: `app/admin/page.tsx` → `AdminDashboard`
- `/admin/login`: 관리자 로그인
- `/account`, `/account/bookmarks`, `/account/setup-name`
- `/together-ai/[slug]`: AI 프로젝트 상세

루트 layout은 `app/layout.tsx`이며 전역 CSS와 metadata만 제공한다. 공통 Header는 각 화면 컴포넌트가 `SiteHeader`를 직접 렌더링한다.

### 3.2 Header / Navigation

상단 콘텐츠 메뉴는 `app/site-header.tsx`의 다음 코드가 단일 관리 지점이다.

- `navItems: CategorySlug[] = ["news", "learn", "use", "together"]`
- 라벨은 `app/content.ts`의 `categories`에서 읽는다.
- 링크는 `/category/{slug}`이다.

현재 실제 메뉴 링크는 `AI 소식`, `배워보기`, `써보기`, `함께 만든 AI` 네 개다. `AI담당관3.0`은 별도 메뉴 항목이 아니라 Header의 홈 브랜드 링크다.

짧게보기는 기존 article category route에 억지로 포함하기보다 `SiteHeader`에 `/shorts` 링크를 명시적으로 추가하는 방식이 적절하다.

### 3.3 목록/Card/상세

- 홈 목록: `app/content-hub.tsx`의 `latest-card`; 같은 파일의 `Thumb`, `Meta`가 로컬 컴포넌트다.
- 카테고리 목록: `app/category-list.tsx`의 `category-list-card`.
- 북마크 목록: `app/account/bookmarks/page.tsx`가 유사 목록 markup을 별도로 보유한다.
- 상세: `app/post-detail.tsx`.
- 대표 이미지 카드: `Thumb`은 업로드 이미지가 없어도 카테고리 tone/icon으로 그래픽 placeholder를 항상 렌더링한다.

공통 Button/Badge/Tag React 컴포넌트는 없다. `primary-button`, `secondary-button`, `status-chip`, `new-chip`, `topic-row` 같은 CSS 클래스가 공통 시각 규칙 역할을 한다. `SiteIcon`만 공통 아이콘 컴포넌트다.

### 3.4 Pagination

- 카테고리 목록과 북마크: 서버의 `page`, `page_size`, `has_more`를 사용하고 버튼 클릭 시 다음 페이지를 append한다.
- 홈: 최초에 `homeOnly=true`, `pageSize=100`으로 한 번 가져온 뒤 `visibleCount`를 8씩 늘리는 client-side 표시 방식이다. 100건 이후 서버 페이지는 홈에서 가져오지 않는다.
- 관리자 목록: 최대 500건 고정이며 pagination이 없다.
- Cloudflare hosted API는 별도 구현이며 공개 목록 최대 200건 고정이다.

### 3.5 Mobile Responsive

`app/globals.css`의 `@media (max-width: 1020px)`와 `@media (max-width: 720px)`에서 Grid, Header, 카드, 관리자 화면을 조정한다.

- 1020px 이하에서 `.post-nav .nav-together`를 숨긴다.
- 720px 이하에서도 `.post-nav`는 유지되고 gap/font만 줄인다.
- `.mobile-nav` CSS는 존재하지만 실제 React markup에서 사용되지 않는다.

따라서 메뉴 하나를 단순 추가하면 좁은 화면에서 brand + 메뉴 + 사용자 메뉴가 충돌할 가능성이 있다. 짧게보기 메뉴 추가 시 모바일 Header의 명시적 overflow/숨김/보조 메뉴 설계가 필요하다.

## 4. Backend 구조

Post 관련 코드는 별도 Router/Service/Repository 계층 없이 대부분 `backend/app/main.py`에 있다.

```text
React Form / List
  → app/api-client.ts
  → Nginx /api proxy
  → FastAPI route (backend/app/main.py)
  → Pydantic PostInput (backend/app/schemas.py)
  → SQLAlchemy Session / Post model
  → PostgreSQL

이미지·첨부 요청
  → FastAPI route
  → backend/app/webdav.py Storage adapter
  → 운영 WebDAV / 개발 LocalStorage
  → 저장 경로 메타데이터는 PostgreSQL
```

AI 프로젝트만 `ai_projects_router.py`, `ai_projects_service.py`로 분리되어 있으며 일반 Post에는 동일한 계층이 없다. 짧게보기 때문에 Post 전체를 Service/Repository로 리팩터링하는 것은 STEP 2 최소 범위에서 제외하는 것이 적절하다.

## 5. Database / Post Model

### 5.1 게시물 테이블

테이블명은 `posts`, PK는 UUID `id`다. 다음은 SQLAlchemy 모델과 로컬 PostgreSQL `information_schema`를 대조한 결과다.

| Field | DB type | Nullable | DB default | ORM/API 의미 |
|---|---|---:|---|---|
| `id` | UUID | NO | 없음 | ORM `uuid4` 생성 PK |
| `slug` | varchar(140) | NO | 없음 | unique/index, 서버 자동 생성 가능 |
| `category` | varchar(30) | NO | 없음 | `news/learn/use/together` |
| `title` | varchar(180) | NO | 없음 | API 1~180자 |
| `summary` | varchar(400) | NO | 없음 | API 1~400자; UI는 220자로 제한 |
| `body_markdown` | text | NO | 없음 | API 1~200,000자; HTML 또는 markdown |
| `content_format` | varchar(20) | NO | 현재 DB default 없음 | API default `markdown`; 값은 `markdown/html` |
| `content_density` | varchar(20) | NO | `normal` | `normal/compact` |
| `view_count` | bigint | NO | `0` | 상세 조회 시 +1 |
| `topics` | jsonb | NO | 현재 DB default 없음 | 계층형 hashtag 문자열 배열, API 최대 10개 |
| `key_points` | jsonb | NO | 현재 DB default 없음 | 홈 핵심 포인트 최대 3개 |
| `status` | varchar(20) | NO | 현재 DB default 없음 | ORM default `draft`, 저장 로직은 항상 `published` |
| `is_featured` | boolean | NO | `false` | 전역 대문글 플래그; 동시에 하나만 유지 |
| `show_on_home` | boolean | NO | 현재 DB default 없음 | 홈 노출 여부 |
| `thumbnail_type` | varchar(20) | NO | 현재 DB default 없음 | `preset/webdav`, API default `preset` |
| `thumbnail_path` | text | YES | 없음 | WebDAV/로컬 저장 경로 |
| `thumbnail_filename` | varchar(255) | YES | 없음 | 원본 파일명 |
| `thumbnail_content_type` | varchar(120) | YES | 없음 | MIME type |
| `service_status` | varchar(30) | YES | 없음 | 함께 만든 AI 게시물용 |
| `service_audience` | varchar(300) | YES | 없음 | 함께 만든 AI 게시물용 |
| `service_url` | text | YES | 없음 | 함께 만든 AI 서비스 주소 |
| `author_id` | integer FK | NO | 없음 | `admin_users.id` |
| `created_at` | timestamptz | NO | 없음 | ORM UTC now |
| `updated_at` | timestamptz | NO | 없음 | ORM UTC now/onupdate |
| `published_at` | timestamptz | YES | 없음 | 최초 published 시각 |
| `deleted_at` | timestamptz | YES | 없음 | soft delete |

중요: 일부 default는 ORM/Pydantic default이고 DB server default가 아니다. Post 생성은 반드시 애플리케이션 경로를 거쳐야 현재 불변식이 유지된다.

### 5.2 관련 테이블

- `attachments`: UUID PK, `post_id` FK(CASCADE), 파일명/저장경로/MIME/크기/작성일.
- `comments`: UUID PK, `post_id` FK(CASCADE), `user_id` FK(CASCADE), 본문/작성·수정일.
- `post_likes`: `(post_id, user_id)` 복합 PK.
- `bookmarks`: `(post_id, user_id)` 복합 PK.
- `audit_logs`: 사용자/행위/대상/상세 JSON/시간.

`Post.attachments`는 relationship으로 선언되어 있다. Comment/Like/Bookmark는 endpoint에서 직접 조회한다.

## 6. 게시판 Category 구조

현행은 **구조 A: 단일 `posts` 테이블 + `category` 컬럼**이다. 게시판별 별도 테이블이나 `board_id`는 없다.

Category 제약은 DB enum/check가 아니라 애플리케이션에 하드코딩되어 있다.

- Backend Pydantic: `Category = Literal["news", "learn", "use", "together"]`
- Backend list validation: 동일한 4개 문자열 set
- Frontend: `CategorySlug` union과 `categories` metadata map
- Hosted Worker: `CATEGORIES` set에 동일한 4개 값

특이사항: `/category/together`는 일반 `CategoryList`를 렌더링하지 않고 별도 `TogetherProjectList`로 분기한다. 따라서 `posts.category="together"` 데이터와 실제 메뉴 화면의 AI 프로젝트 repository가 완전히 같은 목록 구조는 아니다.

## 7. Homepage 구조

`app/page.tsx`는 `ContentHub`만 렌더링하며, 실제 구조는 `app/content-hub.tsx`에 있다.

현재 순서:

1. `SiteHeader`
2. 대문글(`home-feature`)
3. 방금 올라온 이야기(`stories-section`)
4. 함께 만든 AI 서비스 영역(`service-section`, 조건부)

### 7.1 조회 방식

- Client Component에서 `useEffect()`로 `GET /api/posts?home=true&page_size=100` 호출.
- Server Side DB fetch가 아니라 브라우저 client-side fetch다.
- 목록 API는 `published`, `deleted_at IS NULL`, 필요 시 `show_on_home=true`를 적용한다.
- 정렬은 `published_at DESC NULLS LAST`, `created_at DESC`다.
- `body_markdown`은 `defer()`하여 목록에서 불러오지 않는다.
- 저자 정보는 `selectinload(Post.author)`로 가져온다.
- 조회된 페이지의 좋아요·댓글 수는 각각 post ID 목록에 대한 GROUP BY 쿼리 1회씩으로 집계한다.
- 대문글은 `is_featured` 첫 건, 없으면 응답의 첫 건이다.
- 최신글은 category/검색어를 브라우저 메모리에서 필터한다.
- 홈 더보기는 서버 추가 조회가 아니라 `visibleCount`만 8씩 증가한다.

### 7.2 Cache

게시물 JSON fetch에 `cache`, `revalidate`, `unstable_cache` 등 명시적 Frontend cache 설정은 없다. FastAPI JSON에도 cache header가 없다. 정적 asset은 `server.mjs`가 1시간 cache하고, thumbnail은 1년 immutable cache를 사용한다.

### 7.3 짧게보기 삽입안

```text
ContentHub
 ├─ SiteHeader
 └─ main
     ├─ HomeFeature
     ├─ ShortViewSection       ← 신규, 최신 5건
     │   ├─ ShortViewHeader
     │   └─ ShortViewRow × 5
     ├─ LatestStories
     └─ TogetherServices
```

현재 `ContentHub`가 긴 단일 JSX이므로 `ShortViewSection`을 별도 컴포넌트 파일로 만드는 것이 자연스럽다. 하지만 홈 전체 리팩터링은 하지 않고 신규 영역만 추출한다.

권장 데이터 호출은 `GET /api/posts?category=short&home=true&page_size=5`다. 기존 홈 100건 응답에서 short를 찾으면 article 100건 사이에 밀려 최신 short 5건을 보장할 수 없으므로 별도 병렬 요청이 안전하다. 동시에 기존 대문글/최신 이야기 계산에서는 `category !== "short"`로 분리하여 short가 기존 article 카드와 대문글 fallback에 섞이지 않게 해야 한다.

## 8. 관리자 게시물 작성 구조

관리자 route는 `/admin`, Form은 `app/admin/admin-dashboard.tsx` 내부 `AdminDashboard`다.

```text
/admin
 → AdminDashboard
 → getMe() + listAdminPosts()
 → EditorState/PostPayload
 → createPost() 또는 updatePost() in app/api-client.ts
 → POST /api/admin/posts 또는 PUT /api/admin/posts/{id}
 → require_admin_csrf
 → PostInput validation
 → apply_post_input()
 → SQLAlchemy Post
 → PostgreSQL
 → 선택적 thumbnail/attachment upload
 → WebDAV/LocalStorage
```

현재 Admin Form은 제목, 홈 요약, 핵심 포인트, TipTap 본문, 본문 밀도, 첨부, 홈 표시, 대문 지정, category, hashtag, thumbnail, together 전용 service 정보를 한 화면에서 제공한다.

짧게보기에는 이 Form의 인증, 목록, 저장 상태, 오류 처리, CRUD 함수를 재사용하되 UI를 category에 따라 단순화하는 것이 적합하다.

- `category="short"`이면 TipTap 대신 textarea.
- 핵심 포인트, 대표 이미지, 첨부파일, 본문 밀도, 대문 지정, together service 정보는 숨김.
- `short_category`, `external_url`, 제목, 짧은 내용, hashtag만 표시.
- 일반 article Form은 현행 동작 유지.

## 9. 대표 이미지 처리 구조

### 필수 여부

- DB: `thumbnail_type`은 NOT NULL이지만 실제 파일 메타데이터 3개 필드는 nullable.
- API: `thumbnail_type`은 default `preset`; 업로드 파일은 Post 생성에 필수가 아님.
- Frontend: 파일 input에 `required`가 없고 사용자 작성에서도 선택 사항.
- Serializer: `thumbnail_type="webdav"`이면서 `thumbnail_path`가 있을 때만 `thumbnail_url` 생성.
- 상세: `thumbnailUrl`이 있을 때만 `<img>` 렌더링.
- 홈 `Thumb`: 실제 이미지가 없어도 category 색/아이콘 기반 placeholder를 렌더링.
- CategoryList: 처음부터 image를 렌더링하지 않는 텍스트 목록이다.

따라서 대표 이미지 없이 Post를 생성해도 DB/API/상세는 오류가 나지 않는다. 단, 기존 홈 article 카드의 `Thumb`은 무이미지를 "이미지 없음"이 아니라 자동 category 그래픽으로 표시한다. 짧게보기는 `Thumb`/article card를 재사용하지 말고 전용 텍스트 row를 사용해야 이미지가 완전히 제거된다.

권장 불변식:

- short 생성 시 `thumbnail_type="preset"`.
- thumbnail 관련 path/filename/content_type은 NULL.
- short Form에서 thumbnail 업로드 UI를 노출하지 않음.
- Backend가 short에 대한 thumbnail upload를 거부하거나 최소한 UI/API validation으로 금지.
- `apply_post_input()`은 현재 `thumbnail_type`만 바꾸고 path/filename/content_type은 지우지 않는다. 따라서 기존 업로드 파일을 가진 article을 short로 변경하는 기능은 STEP 2에서 금지하는 것이 가장 안전하다. 변환을 허용한다면 DB 메타데이터 정리와 WebDAV 원본 삭제/보존 정책을 원자적으로 설계해야 한다.

## 10. 댓글 구조

- 관계: `comments.post_id → posts.id ON DELETE CASCADE`.
- 목록: `GET /api/posts/{post_id}/comments`, 공개된 활성 Post만 허용.
- 작성: `POST /api/posts/{post_id}/comments`, 로그인·닉네임 확인·CSRF 필요.
- 수정/삭제: 해당 댓글 작성자만 가능.
- 관리자도 타인의 댓글을 삭제할 수 있는 별도 endpoint/예외는 현재 없음.
- 목록 serializer는 `owned_by_current_user`를 계산한다.
- 댓글 수는 Post 목록 페이지의 ID 집합을 GROUP BY하여 한 번에 조회한다.

짧게보기가 `posts`를 사용하면 기존 댓글 기능을 변경 없이 재사용할 수 있다. 별도 `short_posts`를 만들면 현재 FK가 연결되지 않아 댓글 테이블을 다형화하거나 별도 댓글 테이블/API를 만들어야 한다.

## 11. 좋아요 구조

- 테이블: `post_likes`.
- FK: `post_id → posts.id`, `user_id → admin_users.id`, 둘 다 CASCADE.
- 중복 방지: `(post_id, user_id)` 복합 Primary Key.
- 좋아요: 기존 레코드가 없을 때만 insert.
- 취소: 동일 복합키 row 삭제.
- 상태: `GET /api/posts/{slug}/community`에서 전체 count와 현재 사용자 liked/bookmarked 반환.
- 인증: 쓰기 endpoint는 `require_confirmed_csrf`.

공개 Post 목록은 결과의 `post_ids`를 모은 뒤 좋아요와 댓글을 각각 하나의 GROUP BY 쿼리로 가져온다. 게시물별 반복 count 쿼리가 아니므로 현재 목록 경로에는 N+1 count 문제가 없다.

짧게보기 목록에서도 반드시 동일한 bulk aggregation을 재사용해야 한다. 별도 `short_posts`를 만들면 현재 복합 FK 모델을 그대로 쓸 수 없다.

## 12. Tag 구조

별도 `tags` 또는 `post_tags` 테이블은 없다. `posts.topics` JSONB 배열에 최대 10개의 문자열을 저장한다.

- 앞의 `#`은 제거된다.
- `/`로 계층형 hashtag를 표현한다.
- 각 segment 최대 40자, 정규화된 전체 문자열 최대 120자.
- 예: `AI/보안/모델`.
- `#AI` 검색은 `AI`와 `AI/...` 하위 계층을 매칭한다.

짧게보기는 기존 `topics`를 그대로 재사용하는 것이 적절하며 DB 변경이 필요 없다.

## 13. 검색 구조

### 13.1 FastAPI 검색

`GET /api/posts?q=...`:

- 일반 검색어: `title`, `summary`, `body_markdown`에 PostgreSQL `ILIKE '%term%'`.
- `#`로 시작: `topics::text`에 exact/prefix 형태의 `ILIKE`를 적용하여 계층형 hashtag 검색.
- Full Text Search나 전용 검색 index는 없다.
- 일반 검색어는 `topics`를 검색하지 않는다.

즉, UI 문구가 "제목·요약·토픽"이지만 FastAPI의 일반 검색은 topic을 포함하지 않는다. hashtag는 `#`를 붙였을 때만 검색된다.

### 13.2 Homepage 검색

홈 검색은 입력마다 API를 다시 부르지 않고 최초 `home=true&page_size=100` 응답 안에서 client-side 필터한다.

- 일반 검색: title, summary, author, topic.
- `#` 검색: 계층형 topic.
- body는 목록 API에서 제외되므로 홈 client 검색 대상이 아니다.
- 홈 노출 100건까지만 검색한다.

### 13.3 짧게보기 포함 방안

short의 canonical 내용은 `body_markdown`에 저장하고 `summary`를 자동 생성한다. 그러면 FastAPI 일반 검색은 제목/내용(summary+body)/태그(`#` 검색)를 이미 검색할 수 있다.

다만 홈페이지에서 짧게보기를 검색에 완전히 포함하려면 client-side 100건 필터만으로는 부족하다. STEP 2에서는 다음 중 하나가 필요하다.

1. 검색어가 있을 때 `listPublishedPostPage({query})`를 호출하는 server-backed 검색으로 전환하고 article/short 결과를 각 전용 row로 렌더링(권장).
2. homepage article 100건과 short 5건만 합쳐 client 검색(불완전하므로 비권장).

검색 index는 현재 없으므로 데이터가 커지면 `ILIKE '%...%'` 비용이 증가한다. STEP 2 최소 기능에는 FTS 도입을 포함하지 않고, 사용량을 측정한 뒤 별도 개선으로 둔다.

## 14. 인증 / 관리자 권한

### 구조

- `admin_users`: username, password hash, role, active, display name.
- `admin_sessions`: random token의 SHA-256 hash, CSRF token, 만료, persistent 여부.
- session raw token은 HttpOnly/SameSite=Lax cookie에 저장.
- 비밀번호는 scrypt.
- Kakao OAuth는 state cookie + DB `oauth_states`의 1회성 검증을 사용.
- Kakao identity는 `auth_identities`에 저장.
- 설정된 관리자 email이면 `role="admin"`, 일반 Kakao 사용자는 `role="user"`.

### Post 권한

- 일반 사용자 생성/수정: 로그인, 닉네임 확정, CSRF; 본인 글만 수정.
- 일반 사용자 Post 삭제 endpoint는 없음.
- 관리자 생성/수정/soft-delete/featured/attachment: admin + CSRF.
- 공개 상세/목록/댓글 읽기는 로그인 없이 가능.

짧게보기는 기존 권한 체계를 그대로 사용할 수 있다. 첫 구현 범위를 관리자 작성으로 제한하려면 Admin Form/API만 노출하면 되고, 일반 사용자도 작성하도록 할 경우 `/write`의 단순 Form 분기를 추가하면 된다. 데이터/API 모델을 별도로 만들 필요는 없다.

권장 STEP 2 기본값은 현행 Post 정책과 일관되게 **관리자와 닉네임이 확정된 일반 사용자 모두 생성 가능, 본인 수정, 관리자 soft-delete**다. 운영 정책상 관리자만 작성해야 한다면 UI 노출과 route dependency만 더 강하게 제한하면 된다.

## 15. Migration 구조

- Alembic revision chain은 현재 `0014_topics_jsonb` 단일 head다.
- `backend/entrypoint.sh`가 container 시작 시 `alembic upgrade head`를 먼저 수행한다.
- 그 다음 초기 관리자 bootstrap 후 Uvicorn을 실행한다.
- Alembic은 SQLAlchemy `Base.metadata`를 target metadata로 사용한다.
- 운영 가이드는 migration 전 `pg_dump` 백업을 안내한다.

추후 기존 Post 확장 시 권장 migration:

1. nullable `short_category VARCHAR(20)` 추가.
2. nullable `external_url TEXT` 추가.
3. 필요 시 공개 category 목록용 partial/composite index 추가.
4. 기존 row는 두 신규 필드가 NULL이므로 데이터 rewrite/분류 변경 없음.
5. 기존 `category` 값은 업데이트하지 않음.

`category` 자체가 varchar이며 DB enum이 아니므로 `short` 추가를 위해 enum 재작성은 필요 없다. Pydantic/TypeScript/Worker validation만 확장한다. 이번 STEP 1에서는 migration 파일을 만들지 않았다.

## 16. 배포 / Docker 구조

```text
Host Nginx (HTTPS/domain)
  → 127.0.0.1:8091
    → gateway (nginx:1.27-alpine)
      ├─ /api/* → backend:8000
      └─ /*     → frontend:3000

backend
  ├─ PostgreSQL db:5432
  └─ 운영 WebDAV (WireGuard 경유) / 개발 local storage
```

- PostgreSQL 데이터는 named volume `postgres_data`.
- WebDAV는 Compose service가 아니라 backend가 외부 URL로 연결한다.
- 이미지/첨부파일은 DB가 아니라 WebDAV에 저장하고 path metadata만 DB에 둔다.
- Docker network는 내부 `app_internal`.
- gateway만 host loopback 8091에 bind한다.

짧게보기에는 이미지/파일이 없으므로 WebDAV, WireGuard, Nginx upload limit, volume 구성을 변경할 필요가 없다. frontend/backend rebuild와 DB migration 적용만 필요하다.

### Cloudflare 대체 경로

`worker/index.ts`는 D1 binding이 있을 때 `worker/api.ts`를 사용하고, Docker에서는 Nginx/FastAPI가 `/api`를 처리한다. D1 schema는 `db/schema.ts`와 Worker 내부 `schemaStatements`에 중복되어 있다. 실제 운영이 Docker만이라면 STEP 2 핵심 범위는 FastAPI/PostgreSQL이다. Cloudflare 배포도 유지해야 한다면 Worker/D1의 category, input, payload, schema, 검색을 별도로 맞춰야 한다.

## 17. 기존 Post 확장안 분석

### 제안

- `posts.category`에 `short` 값 허용.
- `short_category`와 `external_url`만 nullable field로 추가.
- 기존 `body_markdown`, `summary`, `topics`, author/status/timestamps를 재사용.
- 기존 Post API에 short conditional validation/serialization을 추가.
- 전용 `/shorts` UI를 추가하되 상세는 `/posts/{slug}`를 재사용.

### 장점

- 댓글, 좋아요, 북마크 FK와 API를 그대로 사용.
- 사용자/관리자 권한, 세션, CSRF, 감사 로그 재사용.
- slug, soft delete, published timestamp, 조회수 재사용.
- hashtag JSONB와 계층형 검색 재사용.
- 기존 목록 bulk count 집계 재사용으로 N+1 방지.
- 관리자 목록을 한 곳에서 관리 가능.
- migration은 nullable field 추가 중심이라 기존 데이터 영향이 작음.
- WebDAV/thumbnail을 전혀 사용하지 않아도 Post는 정상 동작.

### 단점

- `PostInput`이 일반 article 중심으로 summary/body/thumbnail/service field를 모두 가진다.
- Admin/User Form에서 category별 conditional UI/validation이 필요하다.
- `categories[post.category]`를 직접 참조하는 여러 frontend 위치가 short를 처리해야 한다.
- 기존 homepage all-category 응답에 short가 섞일 수 있어 명시적으로 분리해야 한다.
- 상세 화면은 article 레이아웃이므로 short 전용 compact rendering 분기가 필요하다.
- 일반 Post와 short의 유효성 규칙을 한 schema에서 관리하면 conditional validator가 복잡해질 수 있다.

### Content type 컬럼 추가 여부

현재 `content_format`은 markdown/html 저장 형식이고, board 구분은 `category`다. 별도의 `content_type=SHORT`를 추가하면 `category`와 이중 판별이 생기며 모든 query가 둘을 함께 관리해야 한다. 현행 convention에는 `category="short"`가 더 단순하다. `short_category`는 TIP/발견 등 short 내부 분류만 담당한다.

## 18. 별도 Short Post 구조 분석

예: `short_posts(id, short_category, title, content, external_url, author_id, ...)`.

### 장점

- 짧은 콘텐츠에 정확히 맞는 단순 schema를 만들 수 있음.
- 일반 Post validation/editor/thumbnail 규칙과 완전히 분리 가능.
- short 전용 index와 보존 정책을 독립적으로 적용 가능.

### 단점

- 댓글 FK가 `posts.id`만 참조하므로 그대로 사용할 수 없음.
- 좋아요/북마크 복합 PK와 FK 역시 재사용 불가.
- 다형 `target_type/target_id`로 바꾸면 참조 무결성이 약해지고 기존 데이터 migration이 커짐.
- 별도 comment/like/bookmark 테이블을 만들면 API/UI/집계가 중복됨.
- 통합 검색에서 두 테이블 query와 결과 정렬/pagination 병합 필요.
- 관리자 목록/작성/수정/삭제 및 감사 로그 경로가 이중화됨.
- Homepage 최신 5건과 사용자 소유권 로직이 별도 구현됨.
- `/posts/{slug}` 상세와 community 기능 재사용이 어려움.
- 운영 중인 관계 테이블을 건드릴 가능성이 커 regression risk가 높음.

별도 테이블은 short가 향후 완전히 다른 수명주기, 대량 스트리밍, 독립 권한/보존 정책을 가질 때만 이점이 커진다. 현재 요구사항은 기존 Post의 경량 표현이므로 해당 조건에 해당하지 않는다.

## 19. 최종 추천 Architecture

**OPTION A: 기존 `posts` 확장**을 명확히 추천한다.

| 기준 | 기존 Post 확장 | 별도 ShortPosts |
|---|---|---|
| 개발 난이도 | 낮음~중간 | 높음 |
| 기존 기능 재사용 | 매우 높음 | 낮음 |
| 유지보수 | 단일 CRUD/관계 유지 | 이중 CRUD/관계 필요 |
| DB 안정성 | nullable column 추가, 기존 row 불변 | 신규 관계 또는 다형 FK 필요 |
| 성능 | 기존 bulk count/query 재사용 | 통합 검색·집계 비용 증가 |
| 확장성 | 현재 요구에 충분 | 완전 독립 도메인에는 유리 |
| Regression Risk | 중간; category 분기 누락 주의 | 높음 |
| 변경 범위 | Front conditional UI + Post schema/API | 전 계층 신규 구현 |

### 권장 도메인 규칙

- 최상위 category: `short`.
- 내부 category 값은 프로젝트 convention에 맞춰 소문자 문자열:
  - `tip` → TIP
  - `discovery` → 발견
  - `use_case` → 활용
  - `memo` → 메모
  - `link` → 링크
- DB enum은 사용하지 않고 Pydantic Literal + TypeScript union으로 제한.
- `short_category`는 article row에서는 NULL, short row에서는 필수.
- `external_url`은 기본 NULL, `short_category="link"`일 때 권장 또는 필수 정책을 STEP 2에서 확정.
- URL은 http/https만 허용하고 Pydantic `HttpUrl`로 검증.
- 일반 article을 short로 또는 short를 article로 변경하는 기능은 초기 구현에서 금지.

### 본문 저장

- canonical short content: `body_markdown` plain text/markdown.
- `content_format="markdown"`, `content_density="compact"`.
- `summary`: 작성 UI가 본문에서 plain text 기준 최대 400자로 파생해 기존의 필수 `PostInput.summary`로 함께 전송하고, Backend 저장 단계에서도 short이면 같은 규칙으로 재정규화한다. 현재 Pydantic validation은 route 진입 전에 summary를 필수 검사하므로, summary 생략 요청까지 허용하려면 별도 input schema/validator 설계가 추가로 필요하다.
- 현재 Admin/User Form은 `content_format="html"`을 하드코딩하므로 short 분기에서는 반드시 `markdown`으로 보내야 한다.
- short 목록 API에서는 `body_markdown`을 포함해야 피드에서 1~5문장을 바로 읽을 수 있음.
- 기존 article 목록은 계속 body를 defer하여 payload/DB 비용을 유지.

## 20. 예상 DB 변경사항

STEP 2 예상이며 이번 단계에서는 적용하지 않았다.

```text
posts
  + short_category VARCHAR(20) NULL
  + external_url TEXT NULL
```

선택적 index:

```text
(category, published_at DESC)
WHERE status='published' AND deleted_at IS NULL
```

이 index는 short feed뿐 아니라 일반 category 목록에도 도움이 될 수 있으나, 실제 운영 데이터량과 `EXPLAIN ANALYZE`를 보고 포함 여부를 결정하는 것이 가장 안전하다.

### 기존 데이터 보호

- 기존 category 값은 변경하지 않음.
- 신규 nullable field는 기존 row에서 NULL.
- 기존 status, thumbnail, body, hashtag, 관계 테이블을 backfill하지 않음.
- migration 전에 DB backup.
- migration 후 기존 4개 category count와 slug/thumbnail path 샘플 검증.

## 21. 예상 API 변경사항

별도 `/api/shorts` CRUD는 만들지 않는 것을 권장한다.

### 재사용/확장

- `GET /api/posts?category=short&page=1&page_size=24`
  - short feed 목록.
  - short일 때 `body_markdown`, `short_category`, `external_url` 포함.
- `GET /api/posts?category=short&home=true&page_size=5`
  - 홈 최신 5건.
- `GET /api/posts?q=검색어`
  - title/summary/body 검색에 short 자동 포함.
- `GET /api/posts?q=#AI`
  - existing hashtag 검색 재사용.
- `GET /api/posts/{slug}`
  - 상세 재사용.
- `POST /api/posts`, `PUT /api/posts/{id}`
  - 일반 사용자 작성/수정 재사용.
- `POST /api/admin/posts`, `PUT/DELETE /api/admin/posts/{id}`
  - 관리자 CRUD 재사용.
- 댓글/좋아요/북마크 endpoint 전부 그대로 재사용.

### Validation 분기

- article: 현행 validation 유지.
- short:
  - `category="short"`.
  - `short_category` 필수.
  - 제목 1~180자(실제 UI는 더 짧은 권장 제한 가능).
  - body 1~예: 1,000자 정책을 STEP 2에서 확정.
  - 현재 `PostInput.summary`가 route 진입 전에 필수 검증되므로 작성 UI가 body 기반 summary를 생성해 함께 전송하고, Backend가 저장 시 다시 정규화. API에서 summary 자체를 생략하게 하려면 short 전용 input schema가 필요.
  - thumbnail/service/key_points/featured는 허용하지 않거나 강제로 기본값.
  - external_url은 http/https만 허용.

## 22. 예상 Frontend 변경사항

### `/shorts`

- image 없는 text feed.
- short category filter(TIP/발견/활용/메모/링크).
- 제목, 내용, hashtag, 날짜, 좋아요/댓글 수.
- 기존 `page/hasMore` 기반 append pagination 재사용.
- 외부 URL은 명확한 새 창 링크/아이콘으로 표시.

### 상세

기존 `/posts/{slug}` convention을 유지한다. `PostDetail`에서 `category="short"`이면 compact hero/body를 렌더링하고 thumbnail/service/related article UI를 제외하거나 short 전용 관련 목록으로 대체한다. 댓글·좋아요·북마크 section은 그대로 유지한다.

### 작성

- 관리자와 `/write` 모두 category short 선택 시 TipTap 대신 textarea.
- 대표 이미지와 첨부/핵심 포인트/featured/together fields 숨김.
- short category select, 외부 URL input, title/content/hashtag만 표시.
- 일반 Post 작성 화면은 변경하지 않음.

### Homepage

- `ShortViewSection` 별도 컴포넌트.
- 대문글과 `stories-section` 사이에 삽입.
- desktop row: 분류 badge / 제목 / 날짜.
- mobile row: 분류+날짜 상단, 제목 하단 또는 2줄 clamp.
- `더보기 →`는 `/shorts`.

## 23. 예상 변경 파일

### Frontend

- `app/content.ts`
  - 역할: Post/Category Type과 표시 metadata.
  - 예상 변경: `short` 및 `ShortCategory` type/label 정의; article category와 short 구분.

- `app/api-client.ts`
  - 역할: API DTO, mapping, Post CRUD/list 호출.
  - 예상 변경: `short_category`, `external_url` DTO/payload/mapping; short list body 처리.

- `app/site-header.tsx`
  - 역할: 상단 메뉴.
  - 예상 변경: `/shorts` 메뉴 추가 및 responsive class.

- `app/content-hub.tsx`
  - 역할: 홈 조회/대문/최신 목록.
  - 예상 변경: short 최신 5건 호출, article에서 short 제외, `ShortViewSection` 삽입.

- `app/short-view-section.tsx` (신규 예상)
  - 역할: 홈 짧게보기 5건 UI.
  - 예상 변경: 신규 컴포넌트.

- `app/shorts/page.tsx` (신규 예상)
  - 역할: 짧게보기 전용 route.
  - 예상 변경: feed shell/metadata.

- `app/short-list.tsx` (신규 예상)
  - 역할: short filter, text row, pagination.
  - 예상 변경: 기존 `CategoryList` pagination pattern 재사용.

- `app/post-detail.tsx`
  - 역할: Post 상세와 community.
  - 예상 변경: short compact rendering, external URL; community는 재사용.

- `app/write/page.tsx`
  - 역할: 일반 사용자 작성/수정.
  - 예상 변경: category short 시 textarea/short fields, image/editor section 숨김.

- `app/admin/admin-dashboard.tsx`
  - 역할: 관리자 Post 목록/편집.
  - 예상 변경: short conditional Form 및 목록 badge.

- `app/account/bookmarks/page.tsx`
  - 역할: 북마크 목록.
  - 예상 변경: short row의 category label/레이아웃 처리.

- `app/globals.css`
  - 역할: 전역 UI 및 responsive.
  - 예상 변경: short homepage/list/detail 스타일, 5번째 Header 메뉴 모바일 대응.

### Backend

- `backend/app/models.py`
  - 역할: SQLAlchemy model.
  - 예상 변경: Post에 nullable `short_category`, `external_url`.

- `backend/app/schemas.py`
  - 역할: Pydantic Post validation.
  - 예상 변경: `short` category, short category values, external URL, conditional validation.

- `backend/app/main.py`
  - 역할: Post API/serializer/query/CRUD.
  - 예상 변경: short fields 직렬화, category validation, short 목록 body 선택, short 불변식, 기존 article과 homepage 분리 지원.

- `backend/tests/test_short_posts.py` (신규 예상)
  - 역할: short validation/serializer/search/권한 회귀 테스트.
  - 예상 변경: 신규 테스트.

### Database / Migration

- `backend/alembic/versions/0015_*.py` (실제 revision명은 생성 시 결정)
  - 예상 변경: `short_category`, `external_url` nullable column과 검증된 경우 category listing index.

### Cloudflare 호스팅 경로(지원 유지 시)

- `worker/api.ts`
  - 역할: D1/R2 대체 API.
  - 예상 변경: schema statement, row/payload/input/category/search/CRUD. `external_url`은 FastAPI와 동일하게 최대 길이와 http/https scheme을 수동 검증.

- `db/schema.ts`
  - 역할: Drizzle D1 schema.
  - 예상 변경: short fields.

Docker 전용 운영만 지원한다면 Cloudflare 변경은 STEP 2 별도 범위로 분리할 수 있으나, 저장소의 dual-runtime 호환성을 유지하려면 함께 변경해야 한다.

## 24. 성능 영향

### 현재 강점

- 공개 목록은 `body_markdown`을 defer한다.
- Post author는 `selectinload`.
- 좋아요/댓글 count는 목록 페이지별 2개 GROUP BY 쿼리이며 N+1이 아니다.
- `page_size` 최대 100, 기본 24.
- `ix_posts_listing`, `ix_posts_home_listing`, `ix_posts_category`가 존재한다.

### short 추가 시

- 홈 latest short 5건 요청이 API 요청 1개를 추가한다.
- 해당 목록에서도 like/comment를 보여주면 기존 방식대로 2개 bulk count query가 추가된다.
- 홈 short 예시 UI가 count를 표시하지 않는다면 short homepage endpoint에서 count query를 생략할 수 있지만 serializer/API 일관성과 trade-off가 있다.
- `/shorts` 목록이 body를 표시하므로 article 목록보다 payload가 크다. 본문 길이를 짧게 제한하면 영향은 작다.
- short와 article을 같은 homepage 응답에서 섞어 필터하면 데이터 누락 위험이 있으므로 dedicated filtered request가 낫다.
- 별도 `short_posts`는 통합 검색/정렬과 count 관계를 더 비싸게 만든다.

### 권장

- `/shorts`는 기존 page size 24보다 20 정도의 작은 단위도 검토.
- short content 최대 길이를 제한.
- count는 현재 bulk aggregation 재사용.
- 운영 데이터 증가 후 `EXPLAIN ANALYZE`; 필요 시 partial category listing index 추가.
- FTS/검색 엔진 도입은 현재 범위에서 제외.

## 25. Regression Risk

### 기존 데이터

`category`는 DB enum이 아니라 varchar라 기존 row 값을 건드리지 않고 `short`를 허용할 수 있다. 신규 nullable fields만 추가하면 기존 콘텐츠의 의미와 저장값은 보존된다.

### 주요 회귀 지점

- `categories[post.category]` 직접 접근 코드가 short metadata를 모르면 runtime/typing 오류.
- homepage all-category 응답에 short가 들어오면 대문글 fallback 또는 article latest에 섞일 수 있음.
- `generateStaticParams()`가 `categories` 전체를 순회하므로 short metadata 배치 방식에 따라 `/category/short`가 의도치 않게 생성될 수 있음.
- `/category/together` 특수 분기처럼 route와 category가 일대일이 아닌 선례가 있음.
- Admin/User Form이 `PostPayload` 전체 필드를 항상 전송하므로 hidden field 기본값을 명확히 해야 함.
- short를 article로 변환할 때 기존 thumbnail/file 처리 문제가 생길 수 있음.
- Cloudflare Worker category set/schema를 누락하면 Docker와 hosted 환경 동작이 달라짐.
- 현재 상세 조회는 조회수를 매 요청 증가시키며 short에도 동일하게 적용됨.

## 26. 위험요소 및 대응방안

### 26.1 Category 하드코딩 누락

- 위험도: **High**
- 원인: Backend Pydantic, FastAPI set, TypeScript union/map, Header, Worker에 category가 분산됨.
- 영향: 저장 422/400, 화면 label 접근 오류, 환경별 불일치.
- 권장 대응: 변경 지점 checklist와 category validation 테스트 작성. article category와 short type을 TypeScript에서 분리.

### 26.2 기존 Homepage에 short 혼입

- 위험도: **High**
- 원인: 홈 API가 category 제한 없이 home post 최대 100건을 가져옴.
- 영향: short가 대문글 fallback, 방금 올라온 이야기, 기존 `Thumb` 카드에 노출.
- 권장 대응: `articlePosts`와 `shortPosts` 명시적 분리; short 최신 5건은 별도 filtered API.

### 26.3 List에서 short content 누락 또는 N+1

- 위험도: **High**
- 원인: `body_markdown`이 목록 query에서 defer됨.
- 영향: short feed에서 내용이 보이지 않거나 serializer가 deferred body를 row별 lazy load.
- 권장 대응: category=short query에서 body를 명시적으로 select/undefer하고 테스트로 query 수 확인. 일반 article list defer 유지.

### 26.4 대표 이미지 없는 UI가 그래픽 placeholder 표시

- 위험도: **Medium**
- 원인: `Thumb`은 thumbnail URL이 없어도 category artwork를 렌더링.
- 영향: 요구사항의 이미지 없는 텍스트 feed 위반.
- 권장 대응: short 전용 row에서 `Thumb`을 사용하지 않음. thumbnail upload UI 숨김/검증.

### 26.5 Form validation이 article 중심

- 위험도: **High**
- 원인: 제목·summary·body가 모두 필수이고 Admin/User Form은 TipTap/thumbnail fields를 전제.
- 영향: 단순 textarea UX 실패, hidden field의 잘못된 값 저장.
- 권장 대응: short 조건부 validation과 payload factory 함수. summary 자동 생성, short 불변식 서버 강제.

### 26.6 검색 UI와 API의 대상 불일치

- 위험도: **Medium**
- 원인: 홈은 client-side title/summary/author/topic, API는 title/summary/body 및 `#` topic 검색.
- 영향: 같은 검색어가 화면/페이지에 따라 다른 결과.
- 권장 대응: 검색 입력 시 server-backed `/api/posts?q=` 사용을 우선 검토하고 short 유형 renderer 추가.

### 26.7 모바일 Header 공간 부족

- 위험도: **Medium**
- 원인: 1020px 이하에서는 together만 숨기며 실제 mobile-nav markup은 없음.
- 영향: 5번째 메뉴 추가 시 줄바꿈/사용자 메뉴 충돌.
- 권장 대응: 짧게보기 우선 노출 정책, horizontal scroll 또는 compact menu를 실제 viewport로 검증.

### 26.8 외부 URL 필드 오용

- 위험도: **Medium**
- 원인: Post에는 `service_url`만 있고 together 의미에 묶여 있음.
- 영향: short link가 service UI와 결합되고 유지보수성이 저하.
- 권장 대응: nullable `external_url` 별도 필드, `HttpUrl`/http(s) 검증, `rel="noopener noreferrer"`.

### 26.9 관리자 댓글 moderation 부재

- 위험도: **Low**
- 원인: 댓글 삭제는 작성자만 가능.
- 영향: short 확산 시 관리자 moderation 요구가 생길 수 있음.
- 권장 대응: 짧게보기 필수 범위는 아니므로 STEP 2에서 제외하고 별도 개선 항목으로 기록.

### 26.10 Hosted/Docker 이중 구현

- 위험도: **Medium**
- 원인: FastAPI/PostgreSQL과 Worker/D1 API/schema가 별도로 존재.
- 영향: 한쪽만 구현 시 환경별 기능 차이.
- 권장 대응: 실제 지원 환경을 STEP 2 시작 전에 확정. Docker production 우선, hosted parity는 명시적 subtask.

### 26.11 일반 사용자의 삭제 기능 없음

- 위험도: **Low**
- 원인: user Post에는 생성/수정만 있고 삭제 API가 없음.
- 영향: 사용자가 작성한 short를 직접 삭제하지 못함.
- 권장 대응: 현행 정책을 유지하고 관리자 soft-delete를 사용. 사용자 삭제는 별도 정책 결정 없이는 범위 확대하지 않음.

### 26.12 공개/임시저장/예약발행 오해

- 위험도: **Medium**
- 원인: DB status default는 draft지만 `apply_post_input()`이 모든 저장을 published로 강제. 예약/비공개 기능 없음.
- 영향: short에 초안 UI만 추가하면 실제 저장 정책과 불일치.
- 권장 대응: STEP 2에서는 현행 즉시 게시 정책을 그대로 사용. draft/schedule은 별도 기능으로 분리.

### 26.13 Short 본문 저장 형식 불일치

- 위험도: **High**
- 원인: 관리자와 일반 사용자 Form 모두 현재 저장 시 `content_format="html"`을 하드코딩한다.
- 영향: textarea의 plain text를 넣어도 HTML 경로로 처리되거나, short 표시기가 기대하는 markdown/plain text와 실제 데이터가 달라질 수 있음.
- 권장 대응: short payload factory에서 `content_format="markdown"`, `content_density="compact"`를 명시하고 Backend conditional validation으로 강제. article 저장 경로는 변경하지 않음.

### 26.14 Thumbnail 메타데이터 잔존

- 위험도: **Medium**
- 원인: `apply_post_input()`은 `thumbnail_type`만 변경하고 기존 thumbnail path/filename/content_type을 지우지 않음.
- 영향: 업로드 이미지가 있는 article을 short로 변환하면 노출은 안 되어도 WebDAV 파일과 DB 경로가 남을 수 있음.
- 권장 대응: 초기 구현에서는 article↔short 유형 변환을 차단. 향후 허용 시 파일 삭제 성공과 DB 변경의 실패 보상 정책을 별도 설계.

## 27. STEP 2 구현 계획

### 반드시 필요한 수정

1. 모델/API type에 `short`, `short_category`, `external_url` 추가.
2. 기존 데이터를 보존하는 nullable-column migration 작성 및 테스트.
3. Backend conditional validation/serialization/query 구현.
4. `/shorts` text feed와 append pagination 구현.
5. Home `ShortViewSection` 최신 5건 구현.
6. 기존 Home article 계산에서 short 제외.
7. Admin/User Form에 short용 textarea/분류/link UX 분기.
8. PostDetail short compact 분기 및 community 재사용.
9. Search에 short title/content/hashtag 포함 및 UI/API 동작 일치.
10. Header 메뉴와 mobile responsive 조정.
11. 북마크/관련 목록 등 `categories[post.category]` 사용처 회귀 처리.
12. Backend validation/search/list count test와 frontend build/smoke 검증.
13. 지원 대상이면 Worker/D1 parity 구현.

### 이번 기능과 직접 무관하여 제외할 기술 부채

- Post route를 Service/Repository 계층으로 전면 리팩터링.
- 공통 Button/Card 컴포넌트 체계 전면 도입.
- Homepage 전체 JSX 분해.
- PostgreSQL Full Text Search 도입.
- 관리자 댓글 moderation 기능.
- 일반 사용자 Post 삭제 기능.
- draft/private/scheduled publishing 신규 구현.
- 관리자 목록 pagination.
- Cloudflare/Docker architecture 통합.
- 기존 정적 fallback sample 콘텐츠 제거.

### 검증 계획

- 기존 4개 category 생성/조회/수정 회귀 테스트.
- short 생성 시 thumbnail path NULL, featured false 확인.
- `/api/posts?category=short`가 body와 count를 bulk query로 반환하는지 확인.
- short 댓글/좋아요/북마크가 기존 FK/API로 동작하는지 확인.
- 일반 검색과 `#` 계층형 hashtag 검색 검증.
- 홈에서 short가 대문/일반 최신글에 섞이지 않는지 확인.
- `/shorts` pagination 중복/누락 확인.
- 모바일 Header 320/375/768/1024px 확인.
- migration upgrade/downgrade를 운영 DB 복사본에서 검증.
- frontend build, lint, Node smoke test, backend pytest 수행.

---

## 부록 A. 짧게보기 예상 데이터 구조

기존 Post 확장 기준 예시다. 실제 API는 snake_case를 유지한다.

```json
{
  "id": "2d5c4ed8-5e78-4bb4-bc12-386ac8dcff6e",
  "slug": "post-20260906100000-a1b2c3",
  "category": "short",
  "short_category": "tip",
  "title": "ChatGPT에서 PDF 여러 개 비교하기",
  "summary": "비교 기준을 먼저 지정하면 결과가 더 깔끔합니다.",
  "body_markdown": "비교 기준을 먼저 지정하면 결과가 더 깔끔합니다.",
  "content_format": "markdown",
  "content_density": "compact",
  "topics": ["ChatGPT", "문서요약"],
  "key_points": [],
  "status": "published",
  "is_featured": false,
  "show_on_home": true,
  "thumbnail_type": "preset",
  "thumbnail_url": null,
  "external_url": null,
  "author_name": "AI TF 관리자",
  "published_at": "2026-09-06T10:00:00+09:00",
  "like_count": 0,
  "comment_count": 0
}
```

링크 유형 예시:

```json
{
  "category": "short",
  "short_category": "link",
  "title": "이번 주 읽어볼 만한 AI 사례",
  "body_markdown": "현업 적용 과정을 간결하게 정리한 사례입니다.",
  "external_url": "https://example.com/ai-case"
}
```

## 부록 B. 현행 상태 관리 기능 구분

| 기능 | 현행 구현 | short 재사용 판단 |
|---|---|---|
| 수정 | 사용자 본인 PUT, 관리자 PUT | 재사용 |
| 삭제 | 관리자 soft-delete만 | 재사용; 사용자 삭제는 추가하지 않음 |
| 임시저장 | 모델 default만 draft, 실제 저장은 published 강제 | 현재는 없음 |
| 공개 | status=published | 재사용 |
| 비공개 | 독립 기능 없음; `show_on_home=false`는 비공개가 아님 | 추가하지 않음 |
| 예약 발행 | 없음 | 추가하지 않음 |
| 상단 고정 | `is_featured` 대문글 1건 | short에서는 비활성화 |
| 홈 노출 | `show_on_home` | short 홈 5건에 재사용 |
| 조회수 | 상세 GET 때 증가 | 재사용 |
| 댓글 | Post FK 기반 | 그대로 재사용 |
| 좋아요 | Post/user 복합 PK | 그대로 재사용 |
| 북마크 | Post/user 복합 PK | 그대로 재사용 |
| 첨부 | 관리자 WebDAV upload | short에서는 비활성화 |
