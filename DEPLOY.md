# Posid AI담당관3.0 — 실행 및 배포 가이드

## 1. 사전 요구사항

- **Docker** 24 이상
- **Docker Compose** v2 이상
- 서버 포트 8091 사용 가능 (또는 80번 포트, 아래 참고)

Windows 환경에서는 PowerShell을 관리자 권한으로 실행합니다.

## 2. 환경 설정

### 2.1 `.env` 파일 생성

```powershell
Copy-Item .env.sample .env
```

### 2.2 `.env` 항목 편집

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `POSTGRES_USER` | DB 사용자 | `posid_ai30` |
| `POSTGRES_PASSWORD` | DB 비밀번호 | `CHANGE_TO_A_STRONG_DB_PASSWORD` (운영 전 반드시 변경) |
| `POSTGRES_DB` | DB 이름 | `posid_ai30` |
| `POSTGRES_HOST` | DB 호스트 | `db` |
| `POSTGRES_PORT` | DB 포트 | `5432` |
| `DATABASE_URL` | PostgreSQL 연결 문자열 (선택) | 비워 두면 `POSTGRES_*` 값으로 자동 생성 (비밀번호 자동 URL 인코딩) |
| `INITIAL_ADMIN_USERNAME` | 초기 관리자 ID | `admin` |
| `INITIAL_ADMIN_PASSWORD` | 초기 관리자 비밀번호 | `CHANGE_TO_A_STRONG_ADMIN_PASSWORD` (운영 전 반드시 변경, 12자 이상 권장) |
| `INITIAL_ADMIN_DISPLAY_NAME` | 관리자 표시명 | `AI담당관3.0` |
| `SESSION_DAYS` | ID/비밀번호 세션 유지 일수 | `7` |
| `PERSISTENT_SESSION_DAYS` | Kakao 영속 세션 유지 일수 | `180` |
| `SESSION_REFRESH_THRESHOLD_DAYS` | 자동 연장 기준 일수 | `30` |
| `SESSION_COOKIE_NAME` | 세션 쿠키명 | `posid_ai30_session` |
| `COOKIE_SECURE` | HTTPS에서만 쿠키 전송 | `true` (HTTP 테스트 시 `false`) |
| `ENVIRONMENT` | 실행 환경 | `production` |
| `ALLOWED_ORIGINS` | CORS 허용 출처 | 비어 있으면 제한 없음 |
| `KAKAO_REST_API_KEY` | Kakao REST API 키 | 빈 값 (Kakao 로그인 사용 시 입력) |
| `KAKAO_CLIENT_SECRET` | Kakao Client Secret | 빈 값 (Kakao Developer Console에서 시크릿 코드 활성화한 경우에만 입력) |
| `KAKAO_REDIRECT_URI` | 운영환경에서 사용하는 명시적 callback override (선택) | 비워 두면 환경별 URI 자동 선택 |
| `KAKAO_REDIRECT_URI_DEVELOPMENT` | 개발환경 callback URI | `http://127.0.0.1:8091/api/auth/kakao/callback` |
| `KAKAO_REDIRECT_URI_PRODUCTION` | 운영환경 callback URI | `https://posidai30.nuni.co.kr/api/auth/kakao/callback` |
| `KAKAO_LOGIN_ENABLED` | Kakao 로그인 활성화 | `false` (사용 시 `true`) |
| `KAKAO_STATE_SECRET` | OAuth state 서명용 시크릿 | 빈 값 (운영 권장: 임의의 긴 문자열) |
| `WEBDAV_URL` | WebDAV 주소 (WireGuard 내부) | `http://192.168.0.250/dav/VOL1/Repo` |
| `WEBDAV_USERNAME` | WebDAV 계정 | `CHANGE_TO_WEBDAV_USERNAME` (운영 전 반드시 변경) |
| `WEBDAV_PASSWORD` | WebDAV 비밀번호 | `CHANGE_TO_WEBDAV_PASSWORD` (운영 전 반드시 변경) |
| `WEBDAV_ROOT` | WebDAV 루트 폴더 | `AI담당관3.0` |
| `WEBDAV_VERIFY_TLS` | TLS 검증 여부 | `true` |
| `WEBDAV_TIMEOUT_SECONDS` | WebDAV 타임아웃 | `60` |
| `MAX_THUMBNAIL_MB` | 대표 이미지 최대 크기 | `10` |
| `MAX_ATTACHMENT_MB` | 게시글 첨부파일 최대 크기 | `100` |
| `MAX_PROJECT_FILE_MB` | 함께 만든 AI 프로젝트 파일 최대 크기 | `2048` |

> **주의**:
> - 운영 배포 전 `POSTGRES_PASSWORD`, `INITIAL_ADMIN_PASSWORD`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD`를 반드시 변경하세요.
> - `DATABASE_URL`은 비워 두면 `POSTGRES_*` 값으로 자동 생성되며, 비밀번호의 특수문자는 자동으로 URL 인코딩됩니다. 직접 지정할 경우 특수문자를 URL 인코딩해야 합니다 (예: `posid00!!` → `posid00%21%21`).
> - Kakao 로그인을 사용하려면 `KAKAO_LOGIN_ENABLED=true`로 설정하고 `KAKAO_REST_API_KEY`를 Kakao Developer Console에서 발급받아 입력하세요.
> - 개발환경(`ENVIRONMENT=development`)은 `KAKAO_REDIRECT_URI_DEVELOPMENT`, 운영환경(`ENVIRONMENT=production`)은 `KAKAO_REDIRECT_URI_PRODUCTION`을 자동 사용합니다. Kakao Console에 두 URI를 각각 등록하세요.
> - 운영환경에서만 `KAKAO_REDIRECT_URI`를 직접 지정해 callback URI를 override할 수 있습니다.
> - `KAKAO_CLIENT_SECRET`은 Kakao Developer Console에서 "시크릿 코드"를 활성화한 경우에만 필요합니다. 비활성화 상태면 비워 두세요.

## 3. 로컬 실행 (개발/테스트)

개발환경에서는 `.env`에 다음처럼 설정합니다.

```env
ENVIRONMENT=development
COOKIE_SECURE=false
KAKAO_LOGIN_ENABLED=true
KAKAO_REDIRECT_URI=
KAKAO_REDIRECT_URI_DEVELOPMENT=http://127.0.0.1:8091/api/auth/kakao/callback
```

Kakao Developer Console의 Redirect URI에도 다음 개발용 주소를 추가해야 합니다.

```text
http://127.0.0.1:8091/api/auth/kakao/callback
```

운영환경에서는 다음 설정을 사용합니다.

```env
ENVIRONMENT=production
COOKIE_SECURE=true
KAKAO_REDIRECT_URI=
KAKAO_REDIRECT_URI_PRODUCTION=https://posidai30.nuni.co.kr/api/auth/kakao/callback
```

### 3.1 수동 실행

```powershell
docker compose --env-file .env -f deployment/docker-compose.example.yml up --build -d
docker compose -f deployment/docker-compose.example.yml --env-file .env ps
```

### 3.2 접속

```
http://127.0.0.1:8091
```

- 공개 화면: `http://127.0.0.1:8091/`
- 관리자 로그인: `http://127.0.0.1:8091/admin/login`
- API 문서: `http://127.0.0.1:8091/api/docs`

초기 로그인 정보는 `.env`의 `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` 값입니다.

### 3.3 로그 확인

```powershell
docker compose -f deployment/docker-compose.example.yml --env-file .env logs -f --tail=200
```

### 3.4 중지

```powershell
docker compose -f deployment/docker-compose.example.yml --env-file .env down
```

### 3.5 DB 데이터까지 초기화 (주의: 모든 글 삭제)

```powershell
docker compose -f deployment/docker-compose.example.yml --env-file .env down -v
```

### 3.6 함께 만든 AI 저장소와 migration

운영환경에서는 프로젝트 파일을 PostgreSQL이나 Docker 볼륨이 아닌 WebDAV의 전용 namespace에 저장합니다.

```text
{WEBDAV_ROOT}/together-ai/projects/{project_uuid}/
{WEBDAV_ROOT}/together-ai/trash/
```

`WEBDAV_URL`에 이미 포함된 경로는 다시 결합하지 않습니다. `ENVIRONMENT=development`에서는 개발 편의를 위해 `/app/storage` 로컬 저장소를 사용하며, 운영 배포 전 반드시 `ENVIRONMENT=production`과 실제 `WEBDAV_*` 연결을 확인해야 합니다.

새 migration 적용 전 백업:

```bash
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "posid-ai30-before-together-ai-$(date +%Y%m%d-%H%M%S).sql.gz"
```

현재 migration 확인:

```bash
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend alembic current
```

`0010_together_ai_repository` rollback은 새 프로젝트 테이블을 제거하므로, 해당 기능에 데이터가 없는 경우에만 다음 명령을 사용합니다.

```bash
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend alembic downgrade 0009_add_content_format
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T backend alembic upgrade head
```

정합성 점검은 DB의 활성 파일 경로와 WebDAV 파일 존재 여부를 비교합니다. 누락 경로는 `ai_file_events`의 `operation`, `status`, `source_path`, `destination_path`, `detail`과 함께 확인합니다. 운영 WebDAV 검증은 기존 Repository와 분리된 `together-ai` namespace에서만 수행합니다.

## 4. 서버 배포 (운영)

### 개발 PC

```powershell
# 1) ZIP 생성 (빌드 산물, 캐시, 환경파일, 로그 제외)

cd C:\Pjt\PosidAI30

tar.exe -a -c -f ".\posid-ai30-update.zip" `
  --exclude=".git" `
  --exclude=".wrangler" `
  --exclude=".sites-runtime" `
  --exclude=".env" `
  --exclude="node_modules" `
  --exclude="dist" `
  --exclude="build" `
  --exclude="tests" `
  --exclude="examples" `
  --exclude="scripts" `
  --exclude="*.zip" `
  --exclude="npm-debug.log*" `
  --exclude="tsconfig.tsbuildinfo" `
  .

# 2) 서버 업로드

scp ".\posid-ai30-update.zip" root@8.219.243.65:/tmp/posid-ai30-update.zip
```

### 서버

```bash
set -euo pipefail

cd /opt/posid-ai30

# --------------------------------------
# 1. 배포 ID
# --------------------------------------

TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/opt/posid-ai30-backups

mkdir -p "$BACKUP_DIR"

# --------------------------------------
# 2. 환경설정 백업
# --------------------------------------

cp .env "$BACKUP_DIR/env-$TS"
chmod 600 "$BACKUP_DIR/env-$TS"

# --------------------------------------
# 3. DB 백업
# --------------------------------------

docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T db \
  pg_dump -U posid_ai30 posid_ai30 \
  | gzip > "$BACKUP_DIR/db-$TS.sql.gz"

test -s "$BACKUP_DIR/db-$TS.sql.gz"
gzip -t "$BACKUP_DIR/db-$TS.sql.gz"

# --------------------------------------
# 4. 현재 소스 백업
# --------------------------------------

tar \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='build' \
  -czf "$BACKUP_DIR/source-$TS.tar.gz" \
  -C /opt/posid-ai30 .

# --------------------------------------
# 5. 새 배포본 압축 해제
# --------------------------------------

rm -rf /tmp/posid-ai30-update
mkdir -p /tmp/posid-ai30-update

unzip -q /tmp/posid-ai30-update.zip \
  -d /tmp/posid-ai30-update

# --------------------------------------
# 6. 배포본 검증
# --------------------------------------

test -f /tmp/posid-ai30-update/deployment/docker-compose.example.yml
test -f /tmp/posid-ai30-update/Dockerfile
test -d /tmp/posid-ai30-update/backend

# --------------------------------------
# 7. 소스 반영 (.env, 데이터 볼륨은 제외)
# --------------------------------------

rsync -a --delete \
  --exclude='.env' \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='build/' \
  /tmp/posid-ai30-update/ \
  /opt/posid-ai30/

# --------------------------------------
# 8. Docker 설정 검증
# --------------------------------------

cd /opt/posid-ai30

docker compose --env-file .env -f deployment/docker-compose.example.yml config -q

# --------------------------------------
# 9. 이미지 빌드
# --------------------------------------

docker compose --env-file .env -f deployment/docker-compose.example.yml build

# --------------------------------------
# 10. 서비스 반영
# --------------------------------------

docker compose --env-file .env -f deployment/docker-compose.example.yml up -d --remove-orphans

# --------------------------------------
# 11. 상태 확인
# --------------------------------------

docker compose --env-file .env -f deployment/docker-compose.example.yml ps

docker compose --env-file .env -f deployment/docker-compose.example.yml logs --tail=100 backend

# --------------------------------------
# 12. 내부 Health Check
# --------------------------------------

curl --fail --silent --show-error \
  http://127.0.0.1:8091/api/health

echo
echo "Deployment successful: $TS"
```

## 5. 최초 배포 (서버에 프로젝트가 없는 경우)

서버에 처음 배포할 때는 백업 단계를 건너뛰고 바로 압축 해제 후 실행합니다.

```bash
# 서버
mkdir -p /opt/posid-ai30 && cd /opt/posid-ai30

# 압축 해제
unzip -q /tmp/posid-ai30-update.zip -d .

# 환경 파일 생성 및 편집
cp .env.sample .env
vi .env

# Docker 실행
docker compose --env-file .env -f deployment/docker-compose.example.yml up -d --build

# 상태 확인
docker compose --env-file .env -f deployment/docker-compose.example.yml ps

# Health Check
curl http://127.0.0.1:8091/api/health
```

## 6. 외부 접속 설정

게이트웨이는 기본적으로 `127.0.0.1:8091`에 바인딩됩니다. 외부 접속이 필요하면 `deployment/docker-compose.example.yml`의 `ports`를 수정합니다.

```yaml
# 외부 80번 포트로 노출
ports:
  - "80:80"
```

또는 기존 리버스 프록시(Nginx/Caddy)를 앞에 두고 `127.0.0.1:8091`로 프록시합니다.

프로젝트 파일은 최대 `MAX_PROJECT_FILE_MB=2048`까지 허용하므로 외부 Nginx와 내부 gateway의 제한을 모두 맞춰야 합니다. 외부 Nginx의 HTTPS `server` 블록에도 다음 설정을 적용하세요.

```nginx
client_max_body_size 2050m;

location / {
    proxy_pass http://127.0.0.1:8091;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

적용 전후 검증:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo nginx -T | grep -E 'server_name|client_max_body_size'
```

`413 Request Entity Too Large`가 계속되면 실제 요청을 처리하는 HTTPS `server_name` 블록에 설정이 들어갔는지 확인해야 합니다. HTTP 블록이나 사용되지 않는 예제 파일만 수정하면 운영 요청에는 반영되지 않습니다.

## 7. 운영 명령 요약

```bash
cd /opt/posid-ai30

# 로그 확인
docker compose --env-file .env -f deployment/docker-compose.example.yml logs -f --tail=200

# 서비스 중지
docker compose --env-file .env -f deployment/docker-compose.example.yml down

# 서비스 재시작 (소스 변경 없이)
docker compose --env-file .env -f deployment/docker-compose.example.yml restart

# 소스 업데이트 후 재배포 (4절의 서버 스크립트 재실행)

# DB 데이터 초기화 (주의: 모든 글 삭제)
docker compose --env-file .env -f deployment/docker-compose.example.yml down -v
```

## 8. 빠른 전체 흐름 (복사-붙여넣기용)

### 개발 PC

```powershell
cd C:\Pjt\PosidAI30
tar.exe -a -c -f ".\posid-ai30-update.zip" --exclude=".git" --exclude=".wrangler" --exclude=".sites-runtime" --exclude=".env" --exclude="node_modules" --exclude="dist" --exclude="build" --exclude="tests" --exclude="examples" --exclude="scripts" --exclude="*.zip" --exclude="npm-debug.log*" --exclude="tsconfig.tsbuildinfo" .
scp ".\posid-ai30-update.zip" root@8.219.243.65:/tmp/posid-ai30-update.zip
```

### 서버 (업데이트 배포)

```bash
set -euo pipefail
cd /opt/posid-ai30
TS=$(date +%Y%m%d-%H%M%S); BACKUP_DIR=/opt/posid-ai30-backups; mkdir -p "$BACKUP_DIR"
cp .env "$BACKUP_DIR/env-$TS"; chmod 600 "$BACKUP_DIR/env-$TS"
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T db pg_dump -U posid_ai30 posid_ai30 | gzip > "$BACKUP_DIR/db-$TS.sql.gz"
test -s "$BACKUP_DIR/db-$TS.sql.gz" && gzip -t "$BACKUP_DIR/db-$TS.sql.gz"
tar --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='build' -czf "$BACKUP_DIR/source-$TS.tar.gz" -C /opt/posid-ai30 .
rm -rf /tmp/posid-ai30-update && mkdir -p /tmp/posid-ai30-update
unzip -q /tmp/posid-ai30-update.zip -d /tmp/posid-ai30-update
test -f /tmp/posid-ai30-update/deployment/docker-compose.example.yml && test -d /tmp/posid-ai30-update/backend
rsync -a --delete --exclude='.env' --exclude='.git/' --exclude='node_modules/' --exclude='dist/' --exclude='build/' /tmp/posid-ai30-update/ /opt/posid-ai30/
cd /opt/posid-ai30
docker compose --env-file .env -f deployment/docker-compose.example.yml config -q
docker compose --env-file .env -f deployment/docker-compose.example.yml build
docker compose --env-file .env -f deployment/docker-compose.example.yml up -d --remove-orphans
docker compose --env-file .env -f deployment/docker-compose.example.yml ps
curl --fail --silent --show-error http://127.0.0.1:8091/api/health
echo; echo "Deployment successful: $TS"
```

## 체크리스트

- [ ] `.env`의 모든 `CHANGE_TO_*` 값을 실제 값으로 변경
- [ ] `POSTGRES_PASSWORD`가 설정되어 있음 (`DATABASE_URL`은 비워 두면 자동 생성)
- [ ] `INITIAL_ADMIN_PASSWORD`가 12자 이상
- [ ] `WEBDAV_URL`이 WireGuard 내부 주소이고 접근 가능
- [ ] `COOKIE_SECURE`가 HTTPS 여부에 맞게 설정
- [ ] Kakao 로그인 사용 시 `KAKAO_LOGIN_ENABLED=true`, `KAKAO_REST_API_KEY` 입력
- [ ] Kakao Developer Console에서 시크릿 코드 활성화한 경우에만 `KAKAO_CLIENT_SECRET` 입력
- [ ] Kakao Developer Console의 Redirect URI와 `KAKAO_REDIRECT_URI`가 일치
- [ ] 서버에서 `curl http://127.0.0.1:8091/api/health`가 `{"status":"ok"}` 반환
- [ ] 관리자 로그인(`http://서버주소:8091/admin/login`) 정상 동작

## 9. Git 기반 배포 (PC에서 push, 서버에서 pull)

zip 파일 전송 대신 Git을 이용해 배포하는 방법입니다. 서버를 Git 저장소로 한 번 설정하면 이후 업데이트는 `git pull`만으로 간단히 반영할 수 있습니다.

### 9-1. 서버 최초 설정 (Git 저장소가 없는 경우)

서버에 프로젝트가 없거나 Git 저장소가 아닌 경우, 한 번만 수행합니다.

```bash
# 서버
cd /opt

# 기존 디렉토리가 있으면 백업
if [ -d /opt/posid-ai30 ]; then
  TS=$(date +%Y%m%d-%H%M%S)
  mv /opt/posid-ai30 /opt/posid-ai30-backup-$TS
fi

# Git 저장소 클론
git clone https://github.com/knhanul/PosidAI30.git /opt/posid-ai30
cd /opt/posid-ai30

# 환경 파일 생성 및 편집
cp .env.sample .env
vi .env

# Docker 빌드 및 실행
docker compose --env-file .env -f deployment/docker-compose.example.yml up -d --build

# 상태 확인
docker compose --env-file .env -f deployment/docker-compose.example.yml ps
curl http://127.0.0.1:8091/api/health
```

> 기존 `.env`가 백업 디렉토리에 있다면 복사해 옵니다:
> ```bash
> cp /opt/posid-ai30-backup-*/.env /opt/posid-ai30/.env
> ```

### 9-2. 일반적인 업데이트 배포

개발 PC에서 코드를 수정하고 push한 후, 서버에서 pull하여 배포합니다.

#### 개발 PC (Windows PowerShell)

```powershell
cd C:\Pjt\PosidAI30

# 변경 사항 커밋 및 푸시
git add -A
git commit -m "변경 내용 요약"
git push origin main
```

#### 서버 (Linux)

```bash
set -euo pipefail
cd /opt/posid-ai30

# --------------------------------------
# 1. 백업
# --------------------------------------
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/opt/posid-ai30-backups
mkdir -p "$BACKUP_DIR"
cp .env "$BACKUP_DIR/env-$TS"
chmod 600 "$BACKUP_DIR/env-$TS"
docker compose --env-file .env -f deployment/docker-compose.example.yml exec -T db pg_dump -U posid_ai30 posid_ai30 | gzip > "$BACKUP_DIR/db-$TS.sql.gz"
test -s "$BACKUP_DIR/db-$TS.sql.gz" && gzip -t "$BACKUP_DIR/db-$TS.sql.gz"

# --------------------------------------
# 2. 최신 코드 받기
# --------------------------------------
git pull origin main

# --------------------------------------
# 3. Docker 재빌드 및 반영
# --------------------------------------
docker compose --env-file .env -f deployment/docker-compose.example.yml config -q
docker compose --env-file .env -f deployment/docker-compose.example.yml build
docker compose --env-file .env -f deployment/docker-compose.example.yml up -d --remove-orphans

# --------------------------------------
# 4. 상태 확인
# --------------------------------------
docker compose --env-file .env -f deployment/docker-compose.example.yml ps
curl --fail --silent --show-error http://127.0.0.1:8091/api/health
echo
echo "Deployment successful: $TS"
```

### 9-3. .env가 Git에 포함되지 않도록 주의

`.env`는 `.gitignore`에 등록되어 있어 Git에 커밋되지 않습니다. 서버에서 직접 편집해야 하며, `git pull` 시에도 덮어쓰지 않습니다.

새 환경 변수가 추가된 경우 (예: `KAKAO_ADMIN_EMAILS`), 서버의 `.env`에 수동으로 추가해야 합니다:

```bash
# 서버
cd /opt/posid-ai30
vi .env   # 새 변수 추가

# .env.sample과 비교해서 누락된 변수 확인
diff .env.sample .env
```

### 9-4. 빠른 업데이트 (백업 생략)

긴급 수정이나 개발 중에는 백업을 생략하고 빠르게 반영할 수 있습니다.

```bash
# 서버
cd /opt/posid-ai30
git pull origin main
docker compose --env-file .env -f deployment/docker-compose.example.yml up --build -d
curl http://127.0.0.1:8091/api/health
```

