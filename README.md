# Posid AI담당관3.0

우체국금융개발원 TF 구성원을 위한 블로그·매거진형 AI 정보 서비스의 운영 가능한 풀 소스입니다. 공개 화면, 관리자 글쓰기, PostgreSQL, WebDAV 파일 저장, Docker Compose, Nginx 분기 예시를 포함합니다.

같은 프런트엔드를 두 환경에서 사용할 수 있습니다.

- 게시된 Sites 주소: 접근 권한이 있는 계정으로 자동 인증하고 내장 DB·파일 저장소에 글과 파일을 보관합니다.
- Alibaba Cloud: 관리자 아이디·비밀번호로 로그인하고 PostgreSQL·WebDAV에 글과 파일을 보관합니다.

## 포함 기능

- `AI 소식`, `배워보기`, `써보기`, `함께 만든 AI` 카테고리
- 최신 대표 글, 토픽·카테고리 필터, 제목·내용 검색
- 블로그형 글 상세 페이지와 첨부파일 다운로드
- 관리자 ID·비밀번호 및 연결된 Kakao 계정 로그인·로그아웃
- HttpOnly 세션 쿠키, OAuth state 1회 검증, CSRF 검증
- 웹에서 글 작성·수정·소프트 삭제
- 저장 즉시 게시, 홈 노출 및 대표 글 지정
- 카테고리 기본 이미지 또는 JPG·PNG·WebP 대표 이미지 업로드
- WebDAV 다중 첨부 업로드·다운로드·개별 원본 삭제
- PostgreSQL 마이그레이션, 최초 관리자 자동 생성, 감사 로그
- PC·태블릿·모바일 반응형 화면
- Alibaba Cloud용 Docker Compose와 Nginx 분기 구성

## 구조

```text
게시된 Sites
  ├─ 공개·관리 화면
  ├─ 내장 DB: 글·게시상태·파일 메타데이터
  └─ 내장 파일 저장소: 대표 이미지·첨부 원본

Alibaba Cloud
브라우저
  └─ 호스트 Nginx (도메인·HTTPS)
       └─ 127.0.0.1:8091 / gateway Nginx
            ├─ /api/* → FastAPI :8000
            │             ├─ PostgreSQL: 글·계정·상태·파일 메타데이터
            │             └─ WireGuard → WebDAV: 대표 이미지·첨부 원본
            └─ /*     → React/Vinext :3000
```

WebDAV 원본은 Alibaba 서버에 저장하지 않습니다. 컨테이너에는 빌드 산출물과 패키지만 남고, 운영 중 늘어나는 데이터는 PostgreSQL 볼륨의 텍스트·메타데이터가 대부분입니다.

공개 화면의 상단 `글쓰기`를 누르면 관리 화면으로 이동합니다. 게시된 Sites에서는 사이트 접근 권한이 곧 작성 권한이며, Alibaba Cloud에서는 `.env`에 설정한 관리자 계정으로 인증합니다.

## 주요 디렉터리

```text
app/                         공개·관리자 프런트엔드
backend/app/                 FastAPI, 인증, PostgreSQL, WebDAV
backend/alembic/             DB 마이그레이션
public/brand/                공식 PoSID CI 이미지
deployment/
├─ docker-compose.example.yml
├─ nginx-internal.conf       프런트와 API 내부 분기
└─ posid-ai30.nginx.conf.example  호스트 Nginx 예시
```

## Alibaba Cloud 배포

Ubuntu 서버에 Docker Engine, Docker Compose plugin, Nginx가 설치되어 있다고 가정합니다.

```bash
cd /opt/posid-ai30
cp .env.example .env
nano .env
docker compose -f deployment/docker-compose.example.yml up -d --build
docker compose -f deployment/docker-compose.example.yml ps
curl http://127.0.0.1:8091/api/health
```

반드시 `.env`에서 DB·관리자·WebDAV 비밀번호를 변경하세요. `INITIAL_ADMIN_PASSWORD`는 12자 이상이어야 합니다. 개발환경은 `ENVIRONMENT=development`, `COOKIE_SECURE=false`, `KAKAO_REDIRECT_URI_DEVELOPMENT=http://127.0.0.1:8091/api/auth/kakao/callback`을 사용하고, 운영환경은 `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `KAKAO_REDIRECT_URI_PRODUCTION=https://posidai30.nuni.co.kr/api/auth/kakao/callback`을 사용합니다. Kakao 로그인을 사용하려면 `KAKAO_REST_API_KEY`와 `KAKAO_LOGIN_ENABLED=true`를 설정하세요. Client Secret은 Kakao Console에서 활성화한 경우에만 필요하며 서버 `.env`에만 보관합니다.

호스트 Nginx에는 `deployment/posid-ai30.nginx.conf.example`을 복사해 도메인을 바꾸고 활성화합니다.

```bash
sudo cp deployment/posid-ai30.nginx.conf.example /etc/nginx/sites-available/posid-ai30
sudo ln -s /etc/nginx/sites-available/posid-ai30 /etc/nginx/sites-enabled/posid-ai30
sudo nginx -t
sudo systemctl reload nginx
```

최종적으로 `https://서비스도메인/admin/login`에서 `.env`의 최초 관리자 계정으로 로그인합니다. 최초 관리자는 DB에 같은 아이디가 없을 때만 생성되므로, 컨테이너 재시작이 기존 비밀번호를 덮어쓰지 않습니다.

### Kakao 개발자 콘솔 설정

1. **앱 키 > REST API 키**를 서버 `.env`의 `KAKAO_REST_API_KEY`에 입력합니다.
2. **제품 설정 > 카카오 로그인 > 활성화 설정**에서 카카오 로그인을 켭니다.
3. **제품 설정 > 카카오 로그인 > Redirect URI**에 `https://posidai30.nuni.co.kr/api/auth/kakao/callback`을 등록합니다.
4. **제품 설정 > 카카오 로그인 > 보안 > Client Secret**을 생성·활성화하고 `KAKAO_CLIENT_SECRET`에 입력합니다.
5. 동의항목에서는 별도 개인정보 동의 없이 기본 제공되는 **카카오 사용자 고유번호(ID)**만 사용합니다. 닉네임·프로필 이미지는 선택 동의이므로 제공되지 않아도 로그인할 수 있습니다.

카카오 사용자는 자동으로 관리자가 되지 않습니다. 기존 관리자 ID·비밀번호로 로그인한 뒤 관리자 화면의 `카카오 계정 연결`을 먼저 실행해야 합니다.

## WireGuard와 WebDAV 확인

Alibaba 호스트에서 NAS의 WireGuard 주소가 열리는지 먼저 확인합니다.

```bash
sudo wg show
curl -I http://10.66.0.2:5005/webdav/
```

그 다음 백엔드 컨테이너에서도 같은 경로로 접근 가능한지 확인합니다.

```bash
docker compose -f deployment/docker-compose.example.yml exec backend \
  python -c "import httpx; print(httpx.get('http://10.66.0.2:5005/webdav/', timeout=10).status_code)"
```

`401`은 경로까지 통신된 상태일 수 있고, timeout은 Docker NAT에서 WireGuard 대역으로 가는 전달·방화벽 규칙을 점검해야 합니다. 자체 서명 HTTPS를 쓴다면 인증서를 신뢰하도록 구성하는 것이 우선이며, 제한된 내부 시험에서만 `WEBDAV_VERIFY_TLS=false`를 사용하세요.

## PostgreSQL 용량과 서비스별 DB

기본 Compose는 이 서비스만의 `postgres:16-alpine` 컨테이너와 볼륨을 만듭니다. 이미지와 기본 데이터가 일정 공간을 차지하지만, 첨부 원본을 WebDAV에 저장하므로 게시글 중심 운영에서 DB 증가는 비교적 작습니다. 실제 사용량은 다음으로 확인합니다.

```bash
docker system df
docker compose -f deployment/docker-compose.example.yml exec db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT pg_size_pretty(pg_database_size(current_database()));"'
```

서버 공간이 특히 작다면 기존 PostgreSQL 한 컨테이너를 여러 서비스가 공유해도 됩니다. 서비스마다 **별도 DB와 별도 ROLE**을 만들면 서로 권한과 백업을 분리할 수 있습니다.

```sql
CREATE ROLE posid_ai30 LOGIN PASSWORD '충분히-긴-비밀번호';
CREATE DATABASE posid_ai30 OWNER posid_ai30 ENCODING 'UTF8';
REVOKE ALL ON DATABASE posid_ai30 FROM PUBLIC;
GRANT CONNECT ON DATABASE posid_ai30 TO posid_ai30;
```

공유 PostgreSQL을 사용할 때는 `.env`의 `DATABASE_URL`을 해당 서버 주소로 변경하고, Compose에서 `db` 서비스와 `backend.depends_on.db`를 제거합니다. WireGuard를 통해 원격 MySQL을 사용하는 것도 네트워크상 가능하지만 이 소스의 ORM·마이그레이션은 PostgreSQL 기준이므로, 그대로는 MySQL과 호환되지 않습니다. 새 서비스도 PostgreSQL의 별도 DB/ROLE로 나누는 방식을 권장합니다.

## 백업과 복구

DB와 WebDAV를 둘 다 백업해야 완전하게 복구할 수 있습니다.

```bash
# DB 백업
docker compose -f deployment/docker-compose.example.yml exec -T db \
  pg_dump -U posid_ai30 -d posid_ai30 -Fc > posid_ai30_$(date +%F).dump

# DB 복구 예시
docker compose -f deployment/docker-compose.example.yml exec -T db \
  pg_restore -U posid_ai30 -d posid_ai30 --clean --if-exists < posid_ai30_2026-08-25.dump
```

WebDAV의 `AI담당관3.0/` 폴더는 NAS의 스냅샷 또는 백업 정책에 포함하세요. DB를 먼저 복구하고 WebDAV 경로를 같은 위치로 되돌리면 파일 링크가 다시 연결됩니다.

## 운영 명령

```bash
# 로그
docker compose -f deployment/docker-compose.example.yml logs -f --tail=200 backend

# 마이그레이션 상태
docker compose -f deployment/docker-compose.example.yml exec backend alembic current

# 재배포
docker compose -f deployment/docker-compose.example.yml up -d --build

# 상태 및 용량
docker compose -f deployment/docker-compose.example.yml ps
docker system df
```

DB 비밀번호와 WebDAV 비밀번호는 소스나 ZIP에 넣지 말고 `.env`에서만 관리하세요. `/api/docs`는 `ENVIRONMENT=production`에서 비활성화됩니다.

## 글 작성과 홈 노출

관리자 화면에서 새 글은 `저장` 즉시 정상 게시글로 저장됩니다. 기존 글 수정은 `수정 내용 저장`, `삭제`로 처리하며 임시저장·게시 상태를 화면에서 선택하지 않습니다. `홈에 표시`를 해제한 글도 카테고리·검색·직접 주소에서는 계속 확인할 수 있지만 홈 기본 화면, 빠르게 보기, 최신 목록, 함께 만든 AI 영역에는 노출되지 않습니다. `대표 글로 표시`는 홈에 표시되는 글에서만 선택할 수 있습니다.

기존 데이터의 `status` 컬럼은 호환성을 위해 유지합니다. 기존 `draft` 글은 자동 공개하지 않으며, 관리자가 열어 저장할 때만 정상 게시글로 전환됩니다.

## 로컬 프런트엔드 실행

Node.js 22.13 이상에서 실행합니다. 백엔드가 없으면 공개 화면은 포함된 예시 콘텐츠를 사용하며, 관리자 저장 기능은 Alibaba Docker 스택을 올린 뒤 동작합니다.

```bash
npm ci
npm run dev
```

## 공식 CI 사용

CI 이미지는 우체국금융개발원 공식 상징소개 페이지의 원본을 사용했습니다.

- 공식 안내: https://www.posid.or.kr/introduction/ci.do
- 로고와 기관문양의 비율·형태·색상을 임의로 변경하지 않습니다.
- 외부 공개 전에는 기관의 최신 CI·저작권·정보보호 기준을 다시 확인합니다.
