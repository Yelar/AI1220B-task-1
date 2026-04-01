from fastapi import APIRouter, Depends, HTTPException, status
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

    prompt, output_text, model_name = await generate_ai_suggestion(payload)

    interaction = AIInteraction(
        document_id=payload.document_id,
        user_id=current_user.id,
        feature=payload.feature,
        prompt_excerpt=prompt,
        response_text=output_text,
        model_name=model_name,
        status="completed",
    )
    db.add(interaction)
    db.commit()

    return AIInvokeResponse(
        feature=payload.feature,
        output_text=output_text,
        model_name=model_name,
    )


@router.get("/history", response_model=list[AIInteractionRead])
def list_history(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    statement = (
        select(AIInteraction)
        .where(AIInteraction.user_id == current_user.id)
        .order_by(AIInteraction.created_at.desc())
    )
    return db.scalars(statement).all()