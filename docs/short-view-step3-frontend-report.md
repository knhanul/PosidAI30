# 짧게보기 STEP 3 Frontend 구현 보고서

## 1. 구현 개요

STEP 2 Backend API를 기반으로 이미지 없는 텍스트 중심 짧게보기 기능을 구현했다.

구현 범위:

- Frontend Post/Api DTO에 short 지원
- `/shorts` 신규 route
- TIP/발견/활용/메모/링크 filter
- server-backed 검색과 분류별 pagination
- Homepage 최신 Short 5건 영역
- Short compact detail
- 좋아요/댓글/북마크 community 재사용
- Admin/User 작성·수정 Form의 Short mode
- Bookmark 및 article 영역의 short 안전 처리
- 모바일 Header와 Short responsive CSS

이번 단계에서는 DB migration을 추가하지 않았다. Worker/D1도 변경하지 않았다.

## 2. 변경 파일

### Frontend

- `app/content.ts`
- `app/api-client.ts`
- `app/site-header.tsx`
- `app/content-hub.tsx`
- `app/short-view-section.tsx` 신규
- `app/short-list.tsx` 신규
- `app/shorts/page.tsx` 신규
- `app/post-detail.tsx`
- `app/write/page.tsx`
- `app/admin/admin-dashboard.tsx`
- `app/account/bookmarks/page.tsx`
- `app/globals.css`

### Backend 최소 보완

- `backend/app/main.py`
  - `short_category` query parameter와 server-side filter만 추가.
- `backend/tests/test_short_posts_integration.py`
  - 분류 filter 검증을 보강.

DB schema와 migration은 변경하지 않았다.

## 3. Frontend Type 구조

기존 article category와 전체 Post category를 분리했다.

```ts
ArticleCategorySlug = "news" | "learn" | "use" | "together"
PostCategorySlug = ArticleCategorySlug | "short"
ShortCategory = "tip" | "discovery" | "use_case" | "memo" | "link"
```

`categories` metadata는 기존 4개 article category만 유지한다. short는 `shortCategoryLabels`로 별도 관리한다.

따라서 `/category/[slug]`의 기존 article route가 `short` 때문에 자동 생성되지 않는다. 공식 short URL은 `/shorts`다.

`Post`와 `ApiPost`에는 다음을 추가했다.

- `shortCategory` / `short_category`
- `externalUrl` / `external_url`

## 4. API Client 변경

`app/api-client.ts`에 다음을 반영했다.

- `ApiPost.category`에 `short` 지원
- `PostPayload`에 `short_category`, `external_url` 추가
- `toPublicPost()` mapping 확장
- `listPublishedPostPage()`에 `shortCategory` query 지원
- `buildShortPostPayload()` 추가
- `shortSummary()` 추가

Short payload는 항상 다음 값을 사용한다.

```text
category          short
content_format    markdown
content_density   compact
key_points        []
is_featured        false
thumbnail_type    preset
service fields    null
```

summary는 Frontend에서도 body 기반으로 생성하지만 최종 정규화는 Backend가 수행한다.

## 5. Header / Navigation

`app/site-header.tsx`의 category 배열을 href 기반 navigation item으로 변경했다.

메뉴:

```text
AI 소식       /category/news
배워보기      /category/learn
써보기        /category/use
짧게보기      /shorts
함께 만든 AI  /category/together
```

`/category/short`는 사용하지 않는다.

## 6. Mobile Header 대응

기존 1020px 이하에서 `함께 만든 AI`를 숨기던 동작을 제거하고, Header navigation을 horizontal scroll 가능한 영역으로 변경했다.

720px 이하에서는:

- Header를 wrap
- navigation을 두 번째 줄로 배치
- 메뉴를 가로 스크롤
- 각 메뉴를 줄바꿈하지 않음
- 사용자 메뉴와 브랜드 영역을 분리

따라서 5개 메뉴가 좁은 화면에서 겹치거나 강제로 줄바꿈되지 않는다.

## 7. `/shorts` 페이지

신규 route:

```text
/shorts
```

파일:

- `app/shorts/page.tsx`
- `app/short-list.tsx`

특징:

- 이미지 없음
- Hero image 없음
- 텍스트 중심 row
- 제목, 본문, 날짜, 분류, hashtag, 좋아요/댓글 수 표시
- 외부 링크가 있으면 `원문 보기 →` 표시
- 작성 링크 제공
- 빈 목록/검색 결과/에러/loading 상태 제공

기존 `Thumb`, image card, category artwork placeholder를 사용하지 않는다.

## 8. Filter / Pagination

Short filter:

```text
전체
TIP
발견
활용
메모
링크
```

Backend 요청:

```text
GET /api/posts?category=short&page=1&page_size=20
GET /api/posts?category=short&short_category=tip&page=1&page_size=20
```

filter 변경 시:

- 목록 초기화
- page 1 요청
- 기존 결과 제거

더보기 클릭 시:

- 다음 page 요청
- 기존 목록 뒤에 append
- id/slug 기준 중복 제거

이번 단계에서 `short_category` server-side query filter를 최소 Backend 보완으로 추가했다. Client가 한 페이지를 가져온 뒤 임의로 filter하는 방식이 아니다.

## 9. Short 검색

`/shorts` 검색은 Server-backed 방식이다.

```text
GET /api/posts?category=short&q=ChatGPT
GET /api/posts?category=short&q=%23AI
GET /api/posts?category=short&short_category=tip&q=ChatGPT
```

검색은 검색 버튼 또는 Enter로 실행한다. 매 keystroke마다 요청하지 않는다.

검색 대상:

- title
- summary
- body_markdown
- `#hashtag`

Backend의 계층형 hashtag 검색도 그대로 사용한다.

## 10. Homepage ShortViewSection

`app/short-view-section.tsx`를 추가하고 `ContentHub`에서 대문글과 일반 최신글 사이에 삽입했다.

별도 요청:

```text
GET /api/posts?category=short&home=true&page_size=5
```

표시:

- Short category
- 제목
- 날짜

표시하지 않음:

- 이미지
- thumbnail
- 본문 전문
- 좋아요/댓글 수
- 큰 카드

Short API 실패 시 Short 영역만 숨겨지고 기존 Homepage article request에는 영향을 주지 않는다.

기존 Homepage `home=true` 응답의 `homePosts`도 article category만 남기도록 client에서 한 번 더 보호했다.

## 11. Short Detail

기존 URL convention을 재사용한다.

```text
/posts/{slug}
```

`app/post-detail.tsx`에서 `post.category === "short"`이면 compact detail로 분기한다.

표시:

- 분류
- 날짜
- 제목
- plain text 본문
- 줄바꿈
- hashtag
- 선택적 외부 링크
- community UI
- 짧게보기로 돌아가기

제거:

- 대표 이미지
- thumbnail placeholder
- 핵심 포인트
- 첨부파일
- together service
- article용 큰 Hero
- image gallery

Short body는 `white-space: pre-wrap` 기반 텍스트로 렌더링하며 `dangerouslySetInnerHTML`을 사용하지 않는다.

## 12. 좋아요 / 댓글 / 북마크 재사용

기존 `PostDetail`의 community API와 UI를 재사용했다.

- 좋아요/좋아요 취소
- 북마크/북마크 해제
- 댓글 목록
- 댓글 작성
- 댓글 수정/삭제
- 카카오 공유

Short 전용 community API나 테이블은 추가하지 않았다.

## 13. Admin 작성/수정 UX

`app/admin/admin-dashboard.tsx`에 Short mode를 추가했다.

Short 새 글 작성 시 표시:

- 분류
- 제목
- textarea 본문
- hashtag
- 외부 URL
- 홈 표시

숨김:

- TipTap
- 핵심 포인트
- 대표 이미지
- 첨부파일
- 본문 밀도
- 대문 지정
- together service

Short textarea:

```text
maxlength=2000
현재 글자 수 / 2,000
```

수정 시 Short는 Short category로 고정된다. article 수정은 기존 4개 article category 사이에서만 선택할 수 있다.

Short 저장은 `buildShortPostPayload()`를 사용하므로 article의 stale thumbnail/editor/service 값이 섞이지 않는다.

## 14. User 작성/수정 UX

`app/write/page.tsx`에도 동일한 Short mode를 추가했다.

Short mode:

- textarea
- short category
- title
- hashtag
- optional external URL
- 기존 사용자 권한 범위 유지

일반 article mode:

- 기존 홈 요약
- TipTap
- 본문 이미지
- 대표 이미지
- 기존 HTML 저장 흐름 유지

Short 수정 시 다음 필드를 hydrate한다.

- `short_category`
- `title`
- `body_markdown`
- `topics`
- `external_url`
- `show_on_home`

Short는 article로 category 변경이 불가능하며, 기존 article은 article category 간 변경이 가능하다.

## 15. Bookmark 및 기존 Category 처리

`app/account/bookmarks/page.tsx`에서 short를 별도 label로 표시하도록 수정했다.

- Short bookmark가 있어도 `categories["short"]` 접근을 하지 않음
- Short 내부 분류 label 표시
- `/posts/{slug}`로 정상 이동
- 이미지 placeholder를 추가하지 않음

Homepage, Admin 목록, Post detail의 category 직접 접근도 short를 분기하도록 처리했다.

## 16. Responsive 결과

CSS에 다음 short 전용 스타일을 추가했다.

- `.short-page`
- `.short-list`
- `.short-item`
- `.short-filter`
- `.short-home-section`
- `.short-home-row`
- `.short-detail`
- `.short-editor-field`

대응한 viewport 기준:

- 320px
- 375px
- 430px
- 768px
- 1024px
- Desktop

모바일에서는 filter를 가로 스크롤하고, Header navigation도 가로 스크롤한다. Short row는 desktop 한 줄 구조를 모바일에 강제하지 않고 제목과 본문을 세로로 배치한다.

## 17. Backend 최소 보완 여부

최소 보완을 적용했다.

추가한 query parameter:

```text
short_category
```

조건:

- `category=short`일 때만 허용
- `tip`, `discovery`, `use_case`, `memo`, `link`만 허용
- 잘못된 범위/값은 HTTP 400
- DB schema/migration 없음
- 기존 category/list query contract 유지

## 18. Frontend Test 결과

통과:

- `npx vinext build`
- Docker frontend build
- `/shorts` HTTP 200
- `/write` HTTP 200
- `/posts/{slug}` route HTTP 200
- `git diff --check`

기존 Node rendered HTML smoke test는 실패했다. 실패 원인은 현재 Vinext build 결과에 기존 테스트가 기대하는 `codex-preview` development metadata가 포함되지 않는 환경/기존 smoke contract 불일치다. 이번 Short 기능의 TypeScript/Vinext build 자체는 성공했다.

## 19. Regression Test 결과

Backend 통합 test container:

```text
49 passed
0 failed
```

기존 article category와 Short API filter, community, pagination, home 분리까지 포함한다.

Frontend 확인:

- 기존 article category route `/category/{slug}` 유지
- `/category/short` 신규 route 미생성
- `/shorts` 신규 route 생성
- 기존 `/write`, `/posts/{slug}`, `/admin`, `/account/bookmarks` build 성공

## 20. Build 결과

Docker Vinext build 성공:

```text
Route (app)
/shorts
```

Backend API health:

```json
{"status":"ok","service":"PoSID AI담당관3.0 API"}
```

## 21. 알려진 제약

- 로컬 DB에는 테스트 후 rollback되어 Short 데이터가 0건이다. 실제 운영 데이터를 생성하지 않았다.
- 기존 Homepage의 통합 검색은 여전히 기존 client-side article 검색 방식이다. `/shorts` 검색만 server-backed로 구현했다.
- Cloudflare Worker/D1은 변경하지 않았다.
- 기존 Node smoke test의 `codex-preview` metadata 기대 조건은 별도 기존 테스트/빌드 환경 이슈로 남아 있다.
- Frontend에 별도 테스트 runner를 추가하지 않고 기존 build/smoke와 Backend integration으로 검증했다.

## 22. STEP 4 권장 개선사항

- Homepage 전체 통합검색을 server-backed로 전환하고 Short까지 검색 대상에 포함.
- Cloudflare Worker/D1 parity 구현.
- Short 전용 frontend component test 추가.
- 기존 `rendered-html.test.mjs`의 codex preview metadata 계약 정리.
- Short 작성 권한/노출 정책에 대한 운영 UX 검토.
- 실제 운영 Short 콘텐츠 등록 후 320px~desktop 실제 브라우저 검증.
