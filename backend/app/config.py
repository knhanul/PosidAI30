from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "PoSID AI담당관3.0 API"
    environment: str = "production"
    database_url: str = ""
    postgres_user: str = "posid_ai30"
    postgres_password: str = ""
    postgres_db: str = "posid_ai30"
    postgres_host: str = "db"
    postgres_port: int = 5432
    allowed_origins: str = ""

    kakao_rest_api_key: str = ""
    kakao_client_secret: str = ""
    kakao_redirect_uri: str = ""
    kakao_redirect_uri_development: str = "http://127.0.0.1:8091/api/auth/kakao/callback"
    kakao_redirect_uri_production: str = "https://posidai30.nuni.co.kr/api/auth/kakao/callback"
    kakao_login_enabled: bool = False
    kakao_state_secret: str = ""

    session_cookie_name: str = "posid_ai30_session"
    session_days: int = 7
    persistent_session_days: int = 180
    session_refresh_threshold_days: int = 30
    cookie_secure: bool = True

    initial_admin_username: str = "admin"
    initial_admin_password: str = Field(default="", min_length=0)
    initial_admin_display_name: str = "AI TF 관리자"

    webdav_url: str = ""
    webdav_username: str = ""
    webdav_password: str = ""
    webdav_root: str = "AI담당관3.0"
    webdav_verify_tls: bool = True
    webdav_timeout_seconds: float = 60.0
    max_thumbnail_mb: int = 10
    max_attachment_mb: int = 100

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.allowed_origins.split(",") if item.strip()]

    @property
    def effective_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        password = quote_plus(self.postgres_password)
        return f"postgresql+psycopg://{self.postgres_user}:{password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    @property
    def kakao_callback_uri(self) -> str:
        if self.environment.lower() in {"development", "dev", "local", "test"}:
            return self.kakao_redirect_uri_development
        return self.kakao_redirect_uri or self.kakao_redirect_uri_production

    @property
    def webdav_configured(self) -> bool:
        return bool(self.webdav_url and self.webdav_username and self.webdav_password)


@lru_cache
def get_settings() -> Settings:
    return Settings()

