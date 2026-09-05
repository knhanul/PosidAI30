from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


Category = Literal["news", "learn", "use", "together"]
ThumbnailType = Literal["preset", "webdav"]


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=500)


class CommentInput(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class DisplayNameInput(BaseModel):
    display_name: str = Field(min_length=1, max_length=20)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2 or len(cleaned) > 20:
            raise ValueError("닉네임은 2~20자로 입력해 주세요.")
        if any(char in cleaned for char in "<>\"'") or "javascript:" in cleaned.lower():
            raise ValueError("HTML이나 스크립트 문자는 닉네임에 사용할 수 없습니다.")
        if any(ord(char) < 32 for char in cleaned):
            raise ValueError("닉네임에 사용할 수 없는 문자가 포함되어 있습니다.")
        return cleaned


class PostInput(BaseModel):
    slug: str | None = Field(default=None, max_length=140, pattern=r"^[a-z0-9가-힣-]+$")
    category: Category
    title: str = Field(min_length=1, max_length=180)
    summary: str = Field(min_length=1, max_length=400)
    body_markdown: str = Field(min_length=1, max_length=200_000)
    content_format: Literal["markdown", "html"] = "markdown"
    content_density: Literal["normal", "compact"] = "normal"
    topics: list[str] = Field(default_factory=list, max_length=10)
    key_points: list[str] = Field(default_factory=list, max_length=3)
    is_featured: bool = False
    show_on_home: bool = True
    thumbnail_type: ThumbnailType = "preset"
    service_status: str | None = Field(default=None, max_length=30)
    service_audience: str | None = Field(default=None, max_length=300)
    service_url: HttpUrl | None = None

    @field_validator("slug")
    @classmethod
    def normalize_slug(cls, value: str | None) -> str | None:
        return value.strip().lower().strip("-") if value else None

    @field_validator("topics")
    @classmethod
    def clean_topics(cls, values: list[str]) -> list[str]:
        output: list[str] = []
        for value in values:
            cleaned = value.strip().lstrip("#").strip()
            if not cleaned:
                continue
            segments = [segment.strip()[:40] for segment in cleaned.split("/") if segment.strip()]
            if not segments:
                continue
            normalized = "/".join(segments)[:120]
            if normalized and normalized not in output:
                output.append(normalized)
        return output

