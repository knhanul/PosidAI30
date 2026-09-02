# 성능 결과와 남은 한계

## 로컬 재측정

변경 후 공개 목록 API를 20회 직렬 호출했다.

| 경로 | TTFB p50 | 전체 p50 | 전체 p95 |
|---|---:|---:|---:|
| `/api/posts` | 11.6ms | 11.7ms | 30.4ms |
| `/api/posts?category=news` | 12.1ms | 12.2ms | 18.0ms |
| `/api/posts`, 동시 5 | - | 14.4ms | 21.5ms |
| `/api/posts`, 동시 10 | - | 14.0ms | 21.3ms |

데이터셋은 공개 게시물 8개, 전체 11개로 작다. 따라서 이 수치는 운영의 절대 성능 수치가 아니라 회귀 기준이다. 최초 워밍업 요청은 약 766ms였고 이후 안정화됐다.

응답 헤더에서 gzip(`content-encoding: gzip`)을 확인했다. 페이지 1, 페이지 크기 1 요청은 `page: 1`, `has_more: true`를 반환했다. 변경 후 컨테이너 메모리는 backend 약 85MiB, PostgreSQL 약 25MiB, frontend 약 31MiB, gateway 약 12MiB였다. 로컬 Docker host의 7.4GiB limit 값은 1GiB 운영 서버를 대변하지 않는다.

## SQL 결과

페이지당 최대 4 SQL이며 N+1은 없다. 로컬 `EXPLAIN (ANALYZE, BUFFERS)`는 작아서 posts Seq Scan을 선택했다(약 0.67ms). 좋아요 집계는 `post_likes_pkey`, 댓글 집계는 `ix_comments_post_id`를 사용했다. 운영 데이터가 증가하면 `ix_posts_listing`/`ix_posts_home_listing` 사용 여부를 재확인해야 한다.

## 검증 결과

- Frontend build: 성공
- Python AST syntax: 성공
- Compose config: 성공
- ESLint: 오류 0, 기존 img 및 미사용 상태 경고 12건
- 기존 rendered HTML test: 실패. 기대하는 `codex-preview` 메타 태그가 현재 빌드 결과에 없어 실패했으며, 이번 성능 변경과 무관한 기존 테스트/배포 메타데이터 불일치다.
- Backend pytest: 이미지에 pytest가 설치되어 있지 않아 실행 불가

## 남은 한계 및 권고

NAS/WireGuard은 이 로컬 환경에서 계측할 수 없었다. 10Mbps 회선에서 원본 파일 다운로드·업로드 속도는 그 회선이 상한이다. 운영 측정 후에도 NAS 이미지가 주요 병목이면, 공개 썸네일의 제한적 로컬 디스크 캐시(용량 상한/TTL/권한 분리 포함)를 별도 작업으로 설계한다. 검색의 `%ILIKE%`는 대량 데이터에서 비싸므로 실제 검색 사용량을 측정한 뒤 pg_trgm 또는 full-text index를 검토한다.
