# 성능 변경 사항

## 목록 페이지네이션

`GET /api/posts`에 `page`(기본 1)와 `page_size`(기본 24, 최대 100)를 추가했다. 쿼리는 `page_size + 1`건만 읽어 `has_more`를 판별한 뒤, 해당 페이지 ID에 대해서만 좋아요/댓글을 GROUP BY 한다. API 응답은 기존 `items`를 유지하고 `page`, `has_more`를 추가했다. 카테고리 화면은 `글 더 보기`로 후속 페이지를 가져온다.

SQL 수는 페이지당 최대 4개로 유지되며 게시물 수에 비례해 늘지 않는다. `post_summary_payload()`는 deferred 본문을 접근하지 않아 추가 lazy-load를 만들지 않는다.

## 썸네일 브라우저 캐시

공개 썸네일 URL에 `updated_at` 기반 버전 쿼리(`?v=...`)를 붙이고, 공개 썸네일 응답에 `Cache-Control: public, max-age=31536000, immutable`을 적용했다. 썸네일 교체는 Post의 `updated_at`을 바꾸므로 URL도 변경된다. 같은 URL의 반복 조회는 브라우저 캐시로 처리되어 NAS 재전송을 줄인다. 첨부파일/관리자 파일은 기존 private 5분 캐시 정책을 유지했다.

이 변경은 공개 게시물 썸네일에만 적용했으며 인증 응답을 공용 캐시하지 않는다.

## 연결·로그·압축

- SQLAlchemy: 풀 크기 3, overflow 2, pool timeout 10초를 환경변수로 설정했다. `pool_pre_ping`과 recycle 1800초는 유지한다.
- WebDAV: connect/pool timeout 5초, read timeout 60초, write timeout 3600초를 명시했다. 업로드/다운로드 스트리밍 및 재시도 없음은 유지한다.
- Nginx: JSON/CSS/JS/SVG/text gzip을 활성화했다.
- Docker: 모든 서비스의 json-file 로그를 10MiB x 3개로 제한했다.

## 데이터 정합성·보안

스키마 변경이나 데이터 마이그레이션은 없다. 좋아요의 복합 기본키가 동일 사용자의 중복 좋아요를 막는다. 댓글에는 삭제/공개 상태 필드가 없으므로 집계 제외 조건을 임의로 추가하지 않았다. 기존 파일 경로와 파일 API는 바꾸지 않았다.

## 롤백

애플리케이션 변경이므로 이전 Git commit으로 checkout 후 해당 서비스 이미지를 재빌드/재기동하면 된다. DB 마이그레이션은 없으며 데이터 롤백도 필요 없다.
