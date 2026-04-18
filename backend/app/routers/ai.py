from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import AIInteraction, Document, DocumentPermission, User
from app.routers.documents import get_current_user, require_document_role
from app.schemas import (
    AIInteractionRead,
    AIInteractionStatusUpdate,
    AIInvokeRequest,
    AIInvokeResponse,
)
from app.services import build_prompt, generate_ai_suggestion, get_ai_provider, sanitize_model_output

router = APIRouter(prefix="/ai", tags=["ai"])


def _can_invoke_ai(document: Document, user_id: int, db: Session) -> bool:
    if document.owner_id == user_id:
        return True

    permission = db.scalar(
        select(DocumentPermission).where(
            DocumentPermission.document_id == document.id,
            DocumentPermission.user_id == user_id,
        )
    )
    return permission is not None and permission.role in {"owner", "editor"}


def _format_sse(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _create_interaction(
    db: Session,
    *,
    document_id: int | None,
    user_id: int,
    feature: str,
    prompt_excerpt: str,
    response_text: str,
    model_name: str,
    status_value: str,
) -> AIInteraction:
    interaction = AIInteraction(
        document_id=document_id,
        user_id=user_id,
        feature=feature,
        prompt_excerpt=prompt_excerpt,
        response_text=response_text,
        model_name=model_name,
        status=status_value,
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction


def _persist_interaction_status(
    db: Session,
    interaction_id: int,
    *,
    status_value: str,
    response_text: str | None = None,
    model_name: str | None = None,
) -> None:
    bind = db.get_bind()
    if bind is None:
        return

    with Session(bind=bind) as status_db:
        interaction = status_db.get(AIInteraction, interaction_id)
        if interaction is None:
            return

        if response_text is not None:
            interaction.response_text = response_text
        if model_name is not None:
            interaction.model_name = model_name

        interaction.status = status_value
        status_db.commit()


@router.post(
    "/invoke",
    response_model=AIInvokeResponse,
    summary="Invoke the AI assistant",
    description="Generate an AI suggestion for selected text if the authenticated user has edit access.",
)
async def invoke_ai(
    payload: AIInvokeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.document_id is not None:
        document = db.get(Document, payload.document_id)
        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )
        if not _can_invoke_ai(document, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners and editors can invoke AI for this document.",
            )

    result = await generate_ai_suggestion(payload)
    interaction = _create_interaction(
        db,
        document_id=payload.document_id,
        user_id=current_user.id,
        feature=payload.feature,
        prompt_excerpt=result.prompt,
        response_text=result.output_text,
        model_name=result.model_name,
        status_value="completed",
    )

    return AIInvokeResponse(
        feature=payload.feature,
        output_text=result.output_text,
        model_name=result.model_name,
        provider=result.provider,
        mocked=result.mocked,
        interaction_id=interaction.id,
    )


@router.post(
    "/stream",
    summary="Stream an AI suggestion",
    description="Stream a token-by-token AI suggestion for selected text and persist the interaction history.",
)
async def stream_ai(
    payload: AIInvokeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.document_id is not None:
        document = db.get(Document, payload.document_id)
        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )
        if not _can_invoke_ai(document, current_user.id, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners and editors can invoke AI for this document.",
            )

    interaction = _create_interaction(
        db,
        document_id=payload.document_id,
        user_id=current_user.id,
        feature=payload.feature,
        prompt_excerpt=build_prompt(payload),
        response_text="",
        model_name="pending",
        status_value="streaming",
    )
    provider = get_ai_provider()
    provider_name = "mock" if settings.llm_mock else "lm-studio"
    model_name = "mock-model" if settings.llm_mock else settings.lm_studio_model

    async def event_stream():
        accumulated: list[str] = []
        completed = False
        try:
            yield _format_sse(
                "start",
                {
                    "interaction_id": interaction.id,
                    "feature": payload.feature,
                    "provider": provider_name,
                    "model_name": model_name,
                },
            )
            async for chunk in provider.stream(payload):
                if await request.is_disconnected():
                    _persist_interaction_status(db, interaction.id, status_value="cancelled")
                    return

                accumulated.append(chunk)
                yield _format_sse(
                    "chunk",
                    {
                        "interaction_id": interaction.id,
                        "delta": chunk,
                        "text": "".join(accumulated),
                    },
                )

            final_text = sanitize_model_output("".join(accumulated))
            if not final_text:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="LM Studio returned an empty completion.",
                )

            _persist_interaction_status(
                db,
                interaction.id,
                status_value="completed",
                response_text=final_text,
                model_name=model_name,
            )
            completed = True
            yield _format_sse(
                "done",
                {
                    "interaction_id": interaction.id,
                    "feature": payload.feature,
                    "output_text": final_text,
                    "provider": provider_name,
                    "model_name": model_name,
                },
            )
        except HTTPException as exc:
            _persist_interaction_status(db, interaction.id, status_value="failed")
            completed = True
            yield _format_sse(
                "error",
                {
                    "interaction_id": interaction.id,
                    "message": exc.detail,
                },
            )
        except asyncio.CancelledError:
            _persist_interaction_status(db, interaction.id, status_value="cancelled")
            completed = True
            return
        finally:
            if not completed:
                _persist_interaction_status(db, interaction.id, status_value="cancelled")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.patch(
    "/history/{interaction_id}",
    response_model=AIInteractionRead,
    summary="Update AI interaction status",
    description="Record whether an AI suggestion was accepted, rejected, edited, or cancelled.",
)
def update_history_status(
    interaction_id: int,
    payload: AIInteractionStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interaction = db.get(AIInteraction, interaction_id)
    if interaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI interaction not found.",
        )

    if interaction.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own AI interaction history.",
        )

    interaction.status = payload.status
    db.commit()
    db.refresh(interaction)
    return interaction


@router.get(
    "/history",
    response_model=list[AIInteractionRead],
    summary="List AI interaction history",
    description="Return AI history for the authenticated user or for a specific accessible document.",
)
def list_history(
    document_id: int | None = Query(default=None),
    feature: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = select(AIInteraction)

    if document_id is not None:
        document = db.get(Document, document_id)
        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

        require_document_role(
            document,
            current_user,
            db,
            {"owner", "editor", "viewer"},
        )
        statement = statement.where(AIInteraction.document_id == document_id)
    else:
        statement = statement.where(AIInteraction.user_id == current_user.id)

    if feature is not None:
        statement = statement.where(AIInteraction.feature == feature)

    statement = statement.order_by(AIInteraction.created_at.desc()).limit(limit)
    return db.scalars(statement).all()
