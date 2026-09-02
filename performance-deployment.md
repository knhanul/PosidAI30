# 성능 배포·운영 검증·롤백

## 배포 전

```bash
cd /opt/posid-ai30
git pull origin main
docker compose --env-file .env -f deployment/docker-compose.example.yml config -q
```

`.env`에는 필요할 때만 다음을 추가한다(미지정 시 안전한 기본값 사용).

```dotenv
DATABASE_POOL_SIZE=3
DATABASE_MAX_OVERFLOW=2
DATABASE_POOL_TIMEOUT_SECONDS=10
WEBDAV_CONNECT_TIMEOUT_SECONDS=5
WEBDAV_TIMEOUT_SECONDS=60
WEBDAV_WRITE_TIMEOUT_SECONDS=3600
```

## 반영

백엔드·프론트엔드·gateway 설정이 함께 바뀌었으므로 한 번만 다음을 실행한다.

```bash
docker compose --env-file .env -f deployment/docker-compose.example.yml build backend frontend
docker compose --env-file .env -f deployment/docker-compose.example.yml up -d backend frontend gateway
docker compose --env-file .env -f deployment/docker-compose.example.yml ps
curl --fail --silent --show-error http://127.0.0.1:8091/api/health
```

DB 스키마 변경은 없다. entrypoint의 `alembic upgrade head`는 계속 실행되지만 새 migration은 적용하지 않는다.

## 즉시 검증

```bash
curl -sS 'http://127.0.0.1:8091/api/posts?page=1&page_size=24'
docker stats --no-stream
docker compose --env-file .env -f deployment/docker-compose.example.yml logs --tail=100 backend
```

공개 썸네일이 있는 글로 HTTP 헤더를 확인한다. `v` 값이 변경된 URL 및 long-lived cache header가 보여야 한다.

```bash
curl -I 'http://127.0.0.1:8091/api/posts/POST_SLUG/thumbnail?v=VERSION'
```

## 저부하 운영 측정

운영 피크가 아닌 시간에 20회 직렬, 필요 시 5회 병렬까지만 실행한다. 공개 포트를 새로 열지 않는다.

```bash
for i in $(seq 1 20); do curl -sS -o /dev/null -w '%{time_starttransfer} %{time_total}\n' 'http://127.0.0.1:8091/api/posts?page=1&page_size=24'; done

docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM posts WHERE status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 25;"
```

NAS/WireGuard는 사전 승인 없이 MTU를 바꾸지 않는다. 서버에서 다음의 짧은 관찰만 수행한다.

```bash
ping -c 10 NAS_WIREGUARD_IP
curl -o /dev/null -sS -w 'ttfb=%{time_starttransfer} total=%{time_total} speed=%{speed_download}\n' --max-time 90 'WEBDAV_TEST_FILE_URL'
wg show
free -h
```

WebDAV URL/계정은 명령 이력이나 문서에 기록하지 않는다. iperf3는 터널 양단에 이미 설치·승인된 경우에만 짧게 실행한다.

## 롤백

애플리케이션 문제가 있으면 직전 commit으로 되돌린 뒤 같은 서비스만 재빌드한다.

```bash
git log --oneline -5
git checkout PREVIOUS_COMMIT -- backend app deployment .env.example .env.sample performance-*.md
docker compose --env-file .env -f deployment/docker-compose.example.yml build backend frontend
docker compose --env-file .env -f deployment/docker-compose.example.yml up -d backend frontend gateway
```

이 변경에는 DB migration/data mutation이 없으므로 DB 롤백은 필요 없다. `git checkout`은 지정 파일의 현재 배포 변경을 덮어쓰므로, 로컬 수정이 있다면 먼저 백업 또는 커밋한다.
