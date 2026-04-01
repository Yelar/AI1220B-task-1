from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.realtime import manager
from app.routers import ai, documents
from app.schemas import HealthResponse

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
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


@app.get("/", response_model=HealthResponse)
def root():
    return HealthResponse(status="ok", app_name=settings.app_name)


@app.get(f"{settings.api_prefix}/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok", app_name=settings.app_name)


@app.websocket("/ws/documents/{document_id}")
async def document_socket(websocket: WebSocket, document_id: str):
    await manager.connect(document_id, websocket)
    await manager.broadcast(
        document_id,
        {"type": "presence", "message": f"Client joined document {document_id}."},
    )

    try:
        while True:
            payload = await websocket.receive_json()
            await manager.broadcast(
                document_id,
                {
                    "type": payload.get("type", "update"),
                    "documentId": document_id,
                    "payload": payload,
                },
            )
    except WebSocketDisconnect:
        manager.disconnect(document_id, websocket)
        await manager.broadcast(
            document_id,
            {"type": "presence", "message": f"Client left document {document_id}."},
        )
