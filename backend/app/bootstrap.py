import sys

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import AdminUser
from .security import hash_password


def main() -> None:
    settings = get_settings()
    if not settings.initial_admin_password:
        print("INITIAL_ADMIN_PASSWORD가 비어 있습니다. 최초 관리자를 만들지 않습니다.")
        return
    with SessionLocal() as db:
        existing = db.scalar(select(AdminUser).where(AdminUser.username == settings.initial_admin_username))
        if existing:
            print(f"관리자 '{settings.initial_admin_username}'가 이미 존재합니다.")
            return
        db.add(AdminUser(username=settings.initial_admin_username, display_name=settings.initial_admin_display_name, password_hash=hash_password(settings.initial_admin_password)))
        db.commit()
        print(f"최초 관리자 '{settings.initial_admin_username}'를 생성했습니다.")


if __name__ == "__main__":
    main()

