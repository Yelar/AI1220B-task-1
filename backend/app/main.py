from contextlib import asynccontextmanager

from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import ensure_local_schema, seed_demo_users
from app.database import get_db
from app.identity import resolve_websocket_identity
from app.realtime import manager
from app.routers import ai, documents, users
from app.schemas import HealthResponse

ensure_local_schema()
seed_demo_users()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_local_schema()
    seed_demo_users()
    yield


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix=settings.api_prefix)
app.include_router(ai.router, prefix=settings.api_prefix)
app.include_router(users.router, prefix=settings.api_prefix)


@app.get("/", response_model=HealthResponse)
def root():
    return HealthResponse(status="ok", app_name=settings.app_name)


@app.get(f"{settings.api_prefix}/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok", app_name=settings.app_name)


@app.websocket("/ws/documents/{document_id}")
async def document_socket(
    websocket: WebSocket,
    document_id: str,
    db: Session = Depends(get_db),
):
    try:
        identity = resolve_websocket_identity(websocket, db)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    presence = await manager.connect(
        document_id,
        websocket,
        user_id=str(identity.user.id),
        user_name=identity.user_name,
        client_id=identity.client_id,
    )
    state = manager.get_document_state(document_id)
    await manager.send_to_client(
        websocket,
        {
            "type": "connection:ack",
            "documentId": document_id,
            "clientId": identity.client_id,
            "presence": {
                "userId": presence.user_id,
                "userName": presence.user_name,
                "clientId": presence.client_id,
            },
            "participants": manager.get_room_presence(document_id),
        },
    )
    await manager.send_to_client(
        websocket,
        {
            "type": "document:sync",
            "documentId": document_id,
            "state": state,
        },
    )
    await manager.broadcast(
        document_id,
        {
            "type": "presence:sync",
            "documentId": document_id,
            "participants": manager.get_room_presence(document_id),
        },
    )

    try:
        while True:
            payload = await websocket.receive_json()
            message_type = payload.get("type")

            if message_type == "presence:update":
                manager.update_presence(
                    document_id,
                    identity.client_id,
                    cursor=payload.get("cursor"),
                    selection=payload.get("selection"),
                )
                await manager.broadcast(
                    document_id,
                    {
                        "type": "presence:sync",
                        "documentId": document_id,
                        "participants": manager.get_room_presence(document_id),
                    },
                )
                continue

            if message_type == "document:update":
                manager.set_document_state(document_id, payload.get("payload", {}))
                await manager.broadcast(
                    document_id,
                    {
                        "type": "document:update",
                        "documentId": document_id,
                        "sender": {
                            "userId": str(identity.user.id),
                            "userName": identity.user_name,
                            "clientId": identity.client_id,
                        },
                        "payload": payload.get("payload", {}),
                    },
                    exclude_client_id=identity.client_id,
                )
                continue

            await manager.send_to_client(
                websocket,
                {
                    "type": "error",
                    "documentId": document_id,
                    "message": "Unsupported WebSocket message type.",
                },
            )
    except WebSocketDisconnect:
        manager.disconnect(document_id, identity.client_id)
        await manager.broadcast(
            document_id,
            {
                "type": "presence:sync",
                "documentId": document_id,
                "participants": manager.get_room_presence(document_id),
            },
        )
