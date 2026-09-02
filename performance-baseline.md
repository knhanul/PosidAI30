# 성능 기준 측정

측정일: 2026-09-02. 로컬 Docker Compose 환경에서 수행했다. 이 문서는 Alibaba 운영 서버/NAS에 직접 접속해 측정한 결과가 아니다.

## 환경

- Compose: Nginx 1.27, FastAPI/Uvicorn 1 worker, PostgreSQL 16, Vinext/Node 22
- 로컬 DB: 게시물 11개(공개 8개), 좋아요 0개, 댓글 0개
- WebDAV: 로컬 측정에서는 실제 NAS를 사용하지 않았으므로 NAS 처리량·지연·패킷 손실은 미측정

## 변경 전 목록 API

최근 `1895b35` 이후의 목록 구현을 코드와 실행 중 컨테이너로 점검했다.

- SQL 수: 최대 4개: 게시물, 작성자 `selectinload`, 현재 페이지 게시물 ID에 대한 좋아요 GROUP BY, 댓글 GROUP BY
- N+1: 없음. 좋아요/댓글은 게시물마다 호출하지 않고 각각 일괄 집계한다.
- NAS 접근: `/api/posts`는 DB 메타데이터로 URL만 생성하며 `storage`/WebDAV 호출은 0회다.
- 프런트엔드: 목록 항목별 community API 호출은 없다.
- 목록 한도: 200개. 데이터 증가 시 응답 크기와 집계 ID 범위가 불필요하게 커질 위험이 있었다.

## 로컬 HTTP 기준값

`curl` 15회(직렬)에서 `/api/posts`는 최초 요청 766ms(컨테이너/DB 캐시 워밍업), 이후 약 9.5~24.4ms였다. 카테고리 요청은 약 9.1~11.8ms였다. 작은 로컬 데이터셋이므로 운영 p95의 대용 수치로 사용할 수 없다.

변경 전 컨테이너 메모리: backend 약 74MiB, PostgreSQL 약 32MiB, frontend 약 36MiB, gateway 약 11MiB였다.

## PostgreSQL 실행계획

공개 목록 계획은 11행 테이블에서 Seq Scan + quicksort(실행 약 0.67ms)을 선택했다. 작은 테이블에는 인덱스 스캔보다 정상적으로 저렴하다. 좋아요는 `post_likes_pkey(post_id, user_id)`, 댓글은 `ix_comments_post_id(post_id)` 인덱스를 사용한다.

## 운영 측정이 필요한 항목

운영 서버에서만 아래를 측정한다. 명령은 `performance-deployment.md`에 있다.

- 1/5/10 동시 사용자별 API p50/p95, TTFB, CPU/메모리/OOM/swap
- 실제 데이터에 대한 `EXPLAIN (ANALYZE, BUFFERS)`
- WireGuard 지연·MTU·손실·처리량 및 NAS WebDAV의 작은/큰 파일 TTFB
- 썸네일 최초/재요청 및 NAS 장애 시 동작
