from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, DocumentVersion
from app.schemas import (
    DocumentCreate,
    DocumentRead,
    DocumentUpdate,
    DocumentVersionRead,
)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=list[DocumentRead])
def list_documents(db: Session = Depends(get_db)):
    return db.scalars(select(Document).order_by(Document.updated_at.desc())).all()


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(payload: DocumentCreate, db: Session = Depends(get_db)):
    document = Document(title=payload.title, content=payload.content)
    db.add(document)
    db.flush()

    if payload.save_initial_version:
        db.add(
            DocumentVersion(
                document_id=document.id,
                label="Initial version",
                content=document.content,
            )
        )

    db.commit()
    db.refresh(document)
    return document


@router.get("/{document_id}", response_model=DocumentRead)
def get_document(document_id: int, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return document


@router.patch("/{document_id}", response_model=DocumentRead)
def update_document(document_id: int, payload: DocumentUpdate, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if payload.title is not None:
        document.title = payload.title
    if payload.content is not None:
        document.content = payload.content

    if payload.create_version:
        db.add(
            DocumentVersion(
                document_id=document.id,
                label=payload.version_label,
                content=document.content,
            )
        )

    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: int, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    db.delete(document)
    db.commit()


@router.get("/{document_id}/versions", response_model=list[DocumentVersionRead])
def list_versions(document_id: int, db: Session = Depends(get_db)):
    if db.get(Document, document_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    statement = (
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.created_at.desc())
    )
    return db.scalars(statement).all()
