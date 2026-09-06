# 짧게보기 STEP 2 Backend 구현 보고서

## 1. 구현 개요

기존 PostgreSQL `posts` 생태계를 확장하여 `category="short"`를 지원했다. 별도 short용 Post/Comment/Like/Bookmark 테이블과 별도 CRUD API는 만들지 않았다. FastAPI + SQLAlchemy + PostgreSQL + Alembic 운영 경로만 변경했으며 Frontend와 Cloudflare Worker/D1 코드는 변경하지 않았다.

구현 결과:

- `short_category`, `external_url` nullable 컬럼 추가
- 5개 short 분류 검증
- short 본문 2,000자 제한
- short 저장 형식과 이미지 없는 불변식 강제
- article↔short 변환 차단
- 기존 Post CRUD/list/detail/search/community/soft-delete 재사용
- short 목록에 본문 포함, 일반 article 목록의 body defer 유지
- 기존 homepage 요청에서 short 제외
- 대표 이미지/첨부/featured endpoint 차단
- 기존 category 회귀 및 실제 PostgreSQL 통합 테스트 완료

## 2. 변경된 파일

- `backend/app/models.py`
  - Post에 `short_category`, `external_url` 추가.
- `backend/app/schemas.py`
  - `short` category, `ShortCategory`, external URL, 조건부 validation 추가.
- `backend/app/main.py`
  - serializer, 저장 불변식, 목록 query, homepage 보호, 유형 전환 및 파일/featured 차단 구현.
- `backend/alembic/versions/0015_add_short_post_fields.py`
  - nullable 컬럼 2개만 추가/제거하는 migration.
- `backend/tests/test_short_posts.py`
  - schema/model/invariant/query/endpoint unit regression tests.
- `backend/tests/test_short_posts_integration.py`
  - 실제 PostgreSQL transaction rollback 기반 통합 테스트.
- `docs/short-view-step2-backend-report.md`
  - 본 보고서.

기존 STEP 1 문서 `docs/short-view-step1-analysis.md`는 유지했다.

## 3. DB Migration

Revision:

```text
0015_add_short_post_fields
```

Down revision:

```text
0014_topics_jsonb
```

추가 컬럼:

```text
posts.short_category VARCHAR(20) NULL
posts.external_url   TEXT NULL
```

신규 index와 기존 row UPDATE는 추가하지 않았다. 로컬 DB에서 migration 직전과 이후 category count 및 전체 Post count가 동일했고, 기존 row의 신규 필드는 모두 NULL이었다.

## 4. Post Model 변경

SQLAlchemy `Post`에 다음을 추가했다.

```python
short_category: Mapped[str | None] = mapped_column(String(20))
external_url: Mapped[str | None] = mapped_column(Text)
```

기존 category, summary, body, content format/density, thumbnail, status, 홈 노출, featured, topics 필드는 변경하지 않았다.

## 5. Schema / Validation 변경

허용 category:

```text
news, learn, use, together, short
```

허용 ShortCategory:

```text
tip, discovery, use_case, memo, link
```

규칙:

- short이면 `short_category` 필수.
- short body는 공백만으로 구성될 수 없음.
- short body 최대 2,000자.
- article에는 `short_category`, `external_url`을 전달할 수 없음.
- `external_url`은 NULL/빈 문자열 또는 Pydantic `HttpUrl`로 검증되는 http/https URL만 허용.
- `javascript:`, `data:`, `ftp:` 등은 거부.
- `link` 이외 short category에도 URL을 선택적으로 허용.

## 6. Short 불변식

`apply_post_input()`이 short에 대해 다음을 서버에서 강제한다.

```text
category             short
content_format       markdown
content_density      compact
is_featured          false
key_points           []
thumbnail_type       preset
thumbnail_path       NULL
thumbnail_filename   NULL
thumbnail_content_type NULL
service_status       NULL
service_audience     NULL
service_url          NULL
```

`show_on_home`, title, topics, short_category, external_url은 요청 정책에 따라 저장한다. 일반 사용자 short 수정에서도 `show_on_home=false`가 유지되며, 기존 article에 대한 사용자 수정의 홈 노출 정책은 변경하지 않았다.

summary는 short body의 앞뒤 공백을 제거하고 연속 whitespace를 한 칸으로 정규화한 뒤 최대 400자로 저장한다. 원본 short body는 앞뒤 공백만 제거하고 내부 줄바꿈은 유지한다.

## 7. API 변경사항

별도 short CRUD API를 만들지 않았다.

재사용 endpoint:

```text
POST   /api/posts
POST   /api/admin/posts
PUT    /api/posts/{post_id}
PUT    /api/admin/posts/{post_id}
GET    /api/posts
GET    /api/posts/{slug}
DELETE /api/admin/posts/{post_id}
```

조회 예:

```text
GET /api/posts?category=short&page=1&page_size=20
GET /api/posts?category=short&short_category=tip&page=1&page_size=20
GET /api/posts?category=short&home=true&page_size=5
GET /api/posts?q=검색어
GET /api/posts?q=#AI
```

## 8. 목록 조회 방식

`category=short` 요청은 published, soft-delete 제외, optional home filter 및 기존 최신순 정렬을 그대로 사용한다.

```text
published_at DESC NULLS LAST
created_at DESC
```

- 명시적 short 목록: short만 반환하고 `body_markdown` 포함.
- `short_category` query는 `category=short`일 때만 허용하며 5개 분류를 server-side filter한다.
- 명시적 article category 목록: 기존처럼 body 제외.
- `home=true` + category 미지정: `category != short` 조건을 추가하여 현재 Frontend homepage를 보호.
- `home=true` + `category=short`: short 중 `show_on_home=true`만 반환.
- category/home 미지정 일반 목록: article+short를 통합 반환하지만, body는 명시적 short 목록에서만 포함한다.

## 9. body_markdown 조회 및 N+1 방지

공개 목록에서 `include_body = category == "short"`로 결정한다.

- short 목록은 `defer(Post.body_markdown)`을 적용하지 않음.
- article 및 기타 목록은 기존 defer 유지.
- short 목록 serializer에만 `body_markdown` 추가.

실제 PostgreSQL 통합 테스트에서 short 1건 목록의 SQL을 event listener로 기록한 결과:

```text
Post page query           1회
Author selectinload       1회
Likes GROUP BY            1회
Comments GROUP BY         1회
```

short body 접근으로 인한 게시물별 추가 SELECT는 없었다.

## 10. 검색 동작

기존 검색 query를 변경하지 않고 같은 `posts` row로 short를 검색한다.

- 일반 검색: title, summary, body_markdown `ILIKE`.
- hashtag 검색: `#태그`로 topics JSONB exact/하위 계층 검색.
- short title/body/정규화된 summary/hashtag 검색을 실제 PostgreSQL 통합 테스트로 확인.
- article 검색 query는 변경하지 않았다.
- Full Text Search는 추가하지 않았다.

## 11. 댓글 / 좋아요 / 북마크 재사용 검증

별도 relation table을 만들지 않았다.

실제 PostgreSQL 통합 테스트에서 short Post에 대해 다음을 검증했다.

- 댓글 생성/목록 조회 성공.
- 좋아요 생성 성공.
- 같은 사용자의 중복 좋아요 요청 후 count 1 유지.
- 좋아요 취소 후 count 0.
- 북마크 생성 및 community 상태 확인.
- 북마크 해제 성공.

통합 테스트의 모든 데이터는 외부 transaction rollback으로 제거했다.

## 12. Thumbnail / Attachment 제한

다음 endpoint는 대상 Post가 short이면 HTTP 400을 반환한다.

```text
POST /api/posts/{post_id}/thumbnail
POST /api/admin/posts/{post_id}/thumbnail
POST /api/admin/posts/{post_id}/attachments
```

오류 메시지는 각각 짧게보기에는 대표 이미지 또는 첨부파일을 등록할 수 없음을 설명한다.

Short 저장 단계에서도 thumbnail metadata를 NULL, thumbnail type을 preset으로 강제한다. 기존 일반 Post의 파일 기능은 변경하지 않았다.

## 13. Article ↔ Short 변환 차단

사용자/관리자 update route 모두 저장 전 기존 category와 새 category를 비교한다.

다음은 HTTP 400:

```text
article → short
short → article
```

기존 article category 사이 변경(`news → learn` 등)은 계속 허용한다.

Short의 featured 값은 저장 시 false로 강제하며, 별도 featured 지정 endpoint도 short이면 HTTP 400을 반환한다.

## 14. 기존 게시판 Regression Test

`news`, `learn`, `use`, `together`에 대해 다음을 검증했다.

- Pydantic category 허용.
- 기존 article 저장 형식/summary/body/key_points/featured/thumbnail type 유지.
- 실제 PostgreSQL에서 관리자 생성.
- category별 공개 목록 조회.
- slug 상세 조회.
- 같은 article category로 수정.
- article category 간 변경 허용.

Short 조건 분기는 article이 아닐 때만 실행되므로 기존 article 저장 규칙은 유지된다.

## 15. Migration Upgrade / Downgrade 결과

로컬 PostgreSQL에서 수행:

```text
0014_topics_jsonb
  → upgrade
0015_add_short_post_fields
  → downgrade
0014_topics_jsonb
  → upgrade
0015_add_short_post_fields
```

검증 결과:

- upgrade 성공.
- 신규 컬럼 type/nullable 정확.
- downgrade 시 신규 컬럼 2개만 제거.
- 재-upgrade 성공.
- 최종 Alembic current/head: `0015_add_short_post_fields`.
- 기존 category count: `learn=2`, `news=9` 유지.
- 전체 Post count: `11` 유지.
- migration 후 기존 row의 short 필드 non-null count: `0`.
- 통합 테스트 후 short row count: `0`.

Production DB에는 적용하지 않았다.

## 16. 전체 Test 결과

고정된 Backend 런타임 의존성을 설치한 호스트 unit suite:

```text
48 passed, 1 skipped
```

Skip은 환경 변수로 보호된 PostgreSQL 통합 테스트다.

Compose 네트워크의 일회성 테스트 컨테이너에서 `RUN_DB_INTEGRATION=1`로 전체 Backend suite 실행:

```text
49 passed
0 failed
```

추가 검증:

- `python -m compileall -q app tests` 성공.
- backend Docker image build 성공.
- `/api/health` 정상 응답.
- `git diff --check` 오류 없음.

## 17. 알려진 제약

- Frontend category type/map은 STEP 2 지시에 따라 변경하지 않았다. 따라서 STEP 3 적용 전 운영 UI를 통해 short를 실제 생성하지 않아야 한다. short row가 생기면 현재 Admin 목록 등 `categories[post.category]` 사용처가 short를 알지 못한다.
- category 미지정 통합 목록은 short도 반환하지만 short body는 명시적 `category=short` 목록에서만 반환한다.
- 새로운 draft/private/scheduled publish 기능은 없다. 기존처럼 즉시 published 처리한다.
- 일반 사용자 Post 삭제 API는 추가하지 않았다.
- short inline-image upload endpoint는 이번 요구 범위의 thumbnail/attachment 차단과 별개로 변경하지 않았다. STEP 3 UI는 plain textarea를 사용하고 inline image 기능을 노출하지 않아야 한다.
- pytest는 운영 `backend/requirements.txt`에 없어서 통합 테스트는 일회성 컨테이너에 test runner를 설치해 수행했다. 운영 dependency 파일은 변경하지 않았다.

## 18. Cloudflare Worker / D1 후속 TODO

이번 단계에서는 지시대로 변경하지 않았다. Hosted runtime을 계속 지원하려면 이후 다음을 맞춰야 한다.

- `worker/api.ts`의 `CATEGORIES`에 short 추가.
- Worker `PostRow`, `ValidPostInput`, payload/validation/CRUD에 short fields 추가.
- Worker schemaStatements에 nullable columns 추가.
- `db/schema.ts` Drizzle schema에 short fields 추가.
- D1 migration 또는 안전한 ALTER 전략 수립.
- Worker short 불변식/변환/파일/featured 차단 구현.
- Worker list body/search/home exclusion 정책을 FastAPI와 일치시킴.
- Worker에는 현재 PostgreSQL community 기능과 동등한 댓글/좋아요/북마크 구조가 없으므로 지원 범위를 별도로 결정.

## 19. STEP 3 Frontend 구현 시 필요한 정보

### Request

기존 `PostPayload`에 다음을 추가해야 한다.

```text
category: "short"
short_category: "tip" | "discovery" | "use_case" | "memo" | "link"
external_url: string | null
```

Short Form도 현재 필수 schema 때문에 `summary`를 보내야 한다. Backend는 최종 summary를 body에서 다시 생성한다.

권장 short request:

```json
{
  "category": "short",
  "short_category": "tip",
  "title": "ChatGPT에서 PDF 여러 개 비교하기",
  "summary": "비교 기준을 먼저 지정하면 결과가 더 깔끔합니다.",
  "body_markdown": "비교 기준을 먼저 지정하면 결과가 더 깔끔합니다.",
  "content_format": "markdown",
  "content_density": "compact",
  "topics": ["ChatGPT", "문서요약"],
  "key_points": [],
  "is_featured": false,
  "show_on_home": true,
  "thumbnail_type": "preset",
  "service_status": null,
  "service_audience": null,
  "service_url": null,
  "external_url": null
}
```

### Short list response

`GET /api/posts?category=short&page=1&page_size=20` item:

```json
{
  "id": "uuid",
  "slug": "post-...",
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
  "author_name": "작성자",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "published_at": "ISO-8601",
  "like_count": 0,
  "comment_count": 0
}
```

Frontend 주의사항:

- `/api/posts?home=true&page_size=100`은 short를 반환하지 않는다.
- 홈 short 영역은 `/api/posts?category=short&home=true&page_size=5`를 별도 호출한다.
- `/shorts`는 명시적 `category=short`를 사용해야 body를 받는다.
- short에는 thumbnail/attachment/featured UI를 노출하지 않는다.
- existing `categories[post.category]` 사용처 전체에 short 대응이 필요하다.
- short 상세는 기존 `/posts/{slug}`와 community API를 재사용할 수 있다.
