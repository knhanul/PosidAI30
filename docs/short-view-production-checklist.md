# 짧게보기 Production 배포 Checklist

## 배포 전

- [ ] DB backup 수행
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T db \
    pg_dump -U posid_ai30 posid_ai30 | gzip > "db-$(date +%Y%m%d-%H%M%S).sql.gz"
  ```
- [ ] 현재 Alembic revision 확인
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend alembic current
  ```
  (예상값: `0014_topics_jsonb` 또는 그 이전)
- [ ] 신규 image build
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml build
  ```
- [ ] Backend test 통과 확인
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend \
    bash -c "cd /app && python -m pytest tests/ -v"
  ```
  (예상: 48 passed, 1 skipped)
- [ ] Frontend build 성공 확인
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml build frontend
  ```
- [ ] Migration script 확인 (`0015_add_short_post_fields.py`)
  ```bash
  cat backend/alembic/versions/0015_add_short_post_fields.py
  ```
- [ ] `.env` 필수 항목 확인 (POSTGRES_PASSWORD, INITIAL_ADMIN_PASSWORD, WEBDAV_* 등)

## 배포

- [ ] Application stop/update
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml up -d --remove-orphans
  ```
- [ ] Migration 0015 자동 적용 확인 (backend entrypoint에서 alembic upgrade head 자동 실행)
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend alembic current
  ```
  (예상값: `0015_add_short_post_fields`)
- [ ] Backend 실행 및 health check
  ```bash
  curl --fail http://127.0.0.1:8091/api/health
  ```
- [ ] Frontend 실행 확인
  ```bash
  curl --fail --output /dev/null http://127.0.0.1:8091/
  ```
- [ ] Gateway/Nginx 확인
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml ps
  ```

## 배포 후

- [ ] `/api/health` → `{"status":"ok"}`
- [ ] Homepage (`/`) 정상 로딩
  - [ ] 대문글 표시
  - [ ] 짧게보기 최신 5건 영역 표시
  - [ ] 방금 올라온 이야기 목록 표시
  - [ ] 통합검색 입력창 표시
- [ ] `/shorts` 정상 로딩
  - [ ] 짧게보기 목록 표시
  - [ ] 6개 분류 필터 버튼 표시 (전체, TIP, 발견, 활용, 메모, 링크)
  - [ ] 검색 입력창 표시
  - [ ] 이미지 placeholder 없음
- [ ] 기존 article category 페이지 정상
  - [ ] `/category/news`
  - [ ] `/category/learn`
  - [ ] `/category/use`
  - [ ] `/category/together`
- [ ] Post detail 정상 (`/posts/{existing_slug}`)
- [ ] Admin 페이지 접근 (`/admin`)
- [ ] Login 정상 (`/admin/login`)
- [ ] Short 작성/조회 (로그인 환경)
  - [ ] `/write?category=short` 접근
  - [ ] Short 작성 (textarea, 분류, 해시태그, 외부 링크)
  - [ ] Short 저장 성공
  - [ ] Short 상세 페이지 조회
  - [ ] Short 수정
- [ ] Search 기능
  - [ ] Homepage 통합검색: 일반 검색어
  - [ ] Homepage 통합검색: `#해시태그` 검색
  - [ ] Homepage 통합검색: 검색 결과에 Short 포함
  - [ ] Homepage 통합검색: 더보기 pagination
  - [ ] Homepage 통합검색: 검색 지우기 → 홈 화면 복귀
  - [ ] `/shorts` 검색: 일반 검색어
  - [ ] `/shorts` 검색: `#해시태그` 검색
- [ ] Mobile (320px / 375px / 430px)
  - [ ] Header 가로 scroll 정상
  - [ ] 짧게보기 접근 가능
  - [ ] 함께 만든 AI 접근 가능
  - [ ] 페이지 horizontal scroll 없음
  - [ ] Short filter 가로 scroll 정상
  - [ ] Short card 줄바꿈 자연스러움

## Community (로그인 환경에서 최소 1개 확인)

- [ ] 좋아요 / 좋아요 취소
- [ ] 북마크 / 북마크 취소
- [ ] 댓글 작성 / 수정 / 삭제

## Rollback

### Application Rollback (DB 0015 유지)

- [ ] 조건: Short 기능에 치명적 버그가 있으나 DB는 안전한 경우
- [ ] 이전 Application image로 교체
  ```bash
  # 이전 코드로 git checkout 또는 이전 image 사용
  docker compose --env-file .env -f deployment/docker-compose.example.yml up -d --build
  ```
- [ ] 0015 nullable column은 이전 Application이 무시함 (정상 동작)

### DB Rollback (0015 → 0014)

- [ ] 조건: DB 수준 rollback이 필요한 경우
- [ ] **Short 데이터 존재 여부 확인**
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T db \
    psql -U posid_ai30 posid_ai30 -c "SELECT count(*) FROM posts WHERE category='short';"
  ```
- [ ] Short 데이터가 0건인 경우에만 안전하게 downgrade 가능
- [ ] Short 데이터가 1건 이상인 경우:
  - [ ] 백업 파일에서 Short 데이터 복구 가능한지 확인
  - [ ] `short_category`, `external_url` 데이터 손실 각오
- [ ] Backup 위치 확인: `/opt/posid-ai30-backups/db-*.sql.gz`
- [ ] Downgrade 실행
  ```bash
  docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend \
    alembic downgrade 0014_topics_jsonb
  ```
