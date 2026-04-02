from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AIInteraction, Document, DocumentPermission
from app.schemas import AIInteractionRead, AIInvokeRequest, AIInvokeResponse
from app.services import generate_ai_suggestion
from app.routers.documents import get_current_user

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


@router.post("/invoke", response_model=AIInvokeResponse)
async def invoke_ai(
    payload: AIInvokeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
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
    interaction = AIInteraction(
        document_id=payload.document_id,
        user_id=current_user.id,
        feature=payload.feature,
        prompt_excerpt=result.prompt,
        response_text=result.output_text,
        model_name=result.model_name,
        status="completed",
    )
    db.add(interaction)
    db.commit()

    return AIInvokeResponse(
        feature=payload.feature,
        output_text=result.output_text,
        model_name=result.model_name,
        provider=result.provider,
        mocked=result.mocked,
    )


@router.get("/history", response_model=list[AIInteractionRead])
def list_history(
    document_id: int | None = Query(default=None),
    feature: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    statement = (
        select(AIInteraction)
        .where(AIInteraction.user_id == current_user.id)
        .order_by(AIInteraction.created_at.desc())
        .limit(limit)
    )

    if document_id is not None:
        statement = statement.where(AIInteraction.document_id == document_id)

    if feature is not None:
        statement = statement.where(AIInteraction.feature == feature)

    return db.scalars(statement).all()
