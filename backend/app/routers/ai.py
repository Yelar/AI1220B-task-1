from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AIInteraction, Document
from app.schemas import AIInteractionRead, AIInvokeRequest, AIInvokeResponse
from app.services import generate_ai_suggestion

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/invoke", response_model=AIInvokeResponse)
async def invoke_ai(payload: AIInvokeRequest, db: Session = Depends(get_db)):
    if payload.document_id is not None and db.get(Document, payload.document_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    prompt, output_text, model_name = await generate_ai_suggestion(payload)
    interaction = AIInteraction(
        document_id=payload.document_id,
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
def list_history(db: Session = Depends(get_db)):
    return db.scalars(select(AIInteraction).order_by(AIInteraction.created_at.desc())).all()
