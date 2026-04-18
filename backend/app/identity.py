from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from fastapi import HTTPException, WebSocket, status
from fastapi.security import HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from app.auth import decode_access_token
from app.models import User


@dataclass(slots=True)
class WebSocketIdentity:
    user: User
    client_id: str
    user_name: str


def _load_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user no longer exists.",
        )
    return user


def resolve_http_user(
    credentials: HTTPAuthorizationCredentials | None,
    legacy_user_id: str | None,
    db: Session,
) -> User:
    if credentials is not None and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
        try:
            payload = decode_access_token(token)
            user_id = int(payload["sub"])
        except (ValueError, KeyError, TypeError, JWTError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token.",
            )
        return _load_user(db, user_id)

    if legacy_user_id is not None:
        try:
            user_id = int(legacy_user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid legacy user identity.",
            ) from exc
        return _load_user(db, user_id)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing bearer token.",
    )


def resolve_websocket_identity(websocket: WebSocket, db: Session) -> WebSocketIdentity:
    authorization = websocket.headers.get("authorization")
    token = websocket.query_params.get("token")
    legacy_user_id = websocket.query_params.get("userId")
    user_name = websocket.query_params.get("userName") or "Anonymous"
    client_id = websocket.query_params.get("clientId", str(uuid4()))

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()

    if token:
        try:
            payload = decode_access_token(token)
            user_id = int(payload["sub"])
        except (ValueError, KeyError, TypeError, JWTError) as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token.",
            ) from exc

        user = _load_user(db, user_id)
        return WebSocketIdentity(user=user, client_id=client_id, user_name=user.name)

    if legacy_user_id is not None:
        try:
            user_id = int(legacy_user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid legacy user identity.",
            ) from exc

        user = _load_user(db, user_id)
        return WebSocketIdentity(user=user, client_id=client_id, user_name=user.name or user_name)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing WebSocket authentication token.",
    )
