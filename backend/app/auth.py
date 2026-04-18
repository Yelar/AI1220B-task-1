from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def _build_token(
    subject: str,
    expires_delta: timedelta,
    secret_key: str,
    token_type: str,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }

    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int) -> str:
    return _build_token(
        subject=str(user_id),
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        secret_key=settings.jwt_secret_key,
        token_type="access",
    )


def create_refresh_token(user_id: int) -> str:
    return _build_token(
        subject=str(user_id),
        expires_delta=timedelta(minutes=settings.refresh_token_expire_minutes),
        secret_key=settings.jwt_refresh_secret_key,
        token_type="refresh",
    )


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise ValueError("Invalid access token.") from exc

    if payload.get("type") != "access":
        raise ValueError("Invalid access token type.")

    return payload


def decode_refresh_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_refresh_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise ValueError("Invalid refresh token.") from exc

    if payload.get("type") != "refresh":
        raise ValueError("Invalid refresh token type.")

    return payload