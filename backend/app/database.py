from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


def _sqlite_connect_args(database_url: str) -> dict[str, bool]:
    return {"check_same_thread": False} if database_url.startswith("sqlite") else {}


def ensure_database_directory(database_url: str) -> None:
    if not database_url.startswith("sqlite:///"):
        return

    relative_path = database_url.removeprefix("sqlite:///")
    db_path = Path(relative_path)
    if not db_path.is_absolute():
        db_path = Path.cwd() / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)


ensure_database_directory(settings.database_url)

engine = create_engine(
    settings.database_url,
    connect_args=_sqlite_connect_args(settings.database_url),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def seed_demo_users() -> None:
    from app.models import User

    demo_users = [
        {"email": "owner@example.com", "name": "Owner Demo"},
        {"email": "editor@example.com", "name": "Editor Demo"},
        {"email": "commenter@example.com", "name": "Commenter Demo"},
        {"email": "viewer@example.com", "name": "Viewer Demo"},
    ]

    with SessionLocal() as db:
        existing = db.scalars(select(User)).first()
        if existing is not None:
            return

        for user in demo_users:
            db.add(User(**user))
        db.commit()