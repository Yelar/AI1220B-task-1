from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, DocumentPermission, DocumentVersion, User
from app.schemas import (
    DocumentCreate,
    DocumentPermissionCreate,
    DocumentPermissionRead,
    DocumentRead,
    DocumentUpdate,
    DocumentVersionCreate,
    DocumentVersionRead,
)

router = APIRouter(prefix="/documents", tags=["documents"])


def get_current_user(
    x_user_id: int | None = Header(default=1, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-User-Id header.",
        )
    return user


def get_document_role(document: Document, user: User, db: Session) -> str | None:
    if document.owner_id == user.id:
        return "owner"

    permission = db.scalar(
        select(DocumentPermission).where(
            DocumentPermission.document_id == document.id,
            DocumentPermission.user_id == user.id,
        )
    )
    return permission.role if permission else None


def require_document_role(
    document: Document,
    user: User,
    db: Session,
    allowed_roles: set[str],
) -> str:
    role = get_document_role(document, user, db)
    if role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action.",
        )
    return role


@router.get("", response_model=list[DocumentRead])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = (
        select(Document)
        .outerjoin(
            DocumentPermission,
            DocumentPermission.document_id == Document.id,
        )
        .where(
            or_(
                Document.owner_id == current_user.id,
                DocumentPermission.user_id == current_user.id,
            )
        )
        .order_by(Document.updated_at.desc())
        .distinct()
    )
    return db.scalars(statement).all()


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = Document(
        title=payload.title,
        content=payload.content,
        owner_id=current_user.id,
    )
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
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
        {"owner", "editor", "commenter", "viewer"},
    )
    return document


@router.patch("/{document_id}", response_model=DocumentRead)
def update_document(
    document_id: int,
    payload: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    require_document_role(document, current_user, db, {"owner", "editor"})

    if payload.title is not None:
        document.title = payload.title
    if payload.content is not None:
        document.content = payload.content

    if payload.create_version:
        db.add(
            DocumentVersion(
                document_id=document.id,
                label=payload.version_label or "Manual version",
                content=document.content,
            )
        )

    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    require_document_role(document, current_user, db, {"owner"})
    db.delete(document)
    db.commit()


@router.get("/{document_id}/versions", response_model=list[DocumentVersionRead])
def list_versions(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
        {"owner", "editor", "commenter", "viewer"},
    )

    statement = (
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.created_at.desc(), DocumentVersion.id.desc())
    )
    return db.scalars(statement).all()


@router.post(
    "/{document_id}/versions",
    response_model=DocumentVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_version(
    document_id: int,
    payload: DocumentVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    require_document_role(document, current_user, db, {"owner", "editor"})

    version = DocumentVersion(
        document_id=document.id,
        label=payload.label or "Manual version",
        content=document.content,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


@router.post("/{document_id}/versions/{version_id}/revert", response_model=DocumentRead)
def revert_version(
    document_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    require_document_role(document, current_user, db, {"owner"})

    version = db.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == document_id,
        )
    )
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found for this document.",
        )

    document.content = version.content

    db.add(
        DocumentVersion(
            document_id=document.id,
            label=f"Revert to version {version.id}",
            content=document.content,
        )
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.get(
    "/{document_id}/permissions",
    response_model=list[DocumentPermissionRead],
)
def list_permissions(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    require_document_role(document, current_user, db, {"owner"})

    statement = (
        select(DocumentPermission)
        .where(DocumentPermission.document_id == document_id)
        .order_by(DocumentPermission.user_id.asc())
    )
    return db.scalars(statement).all()


@router.post(
    "/{document_id}/permissions",
    response_model=DocumentPermissionRead,
    status_code=status.HTTP_201_CREATED,
)
def upsert_permission(
    document_id: int,
    payload: DocumentPermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    require_document_role(document, current_user, db, {"owner"})

    target_user = db.get(User, payload.user_id)
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user not found.",
        )

    if target_user.id == document.owner_id and payload.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The document owner must keep the owner role.",
        )

    permission = db.scalar(
        select(DocumentPermission).where(
            DocumentPermission.document_id == document_id,
            DocumentPermission.user_id == payload.user_id,
        )
    )

    if permission is None:
        permission = DocumentPermission(
            document_id=document_id,
            user_id=payload.user_id,
            role=payload.role,
        )
        db.add(permission)
    else:
        permission.role = payload.role
        db.add(permission)

    db.commit()
    db.refresh(permission)
    return permission


@router.delete(
    "/{document_id}/permissions/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_permission(
    document_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    require_document_role(document, current_user, db, {"owner"})

    if user_id == document.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner permissions cannot be removed.",
        )

    permission = db.scalar(
        select(DocumentPermission).where(
            DocumentPermission.document_id == document_id,
            DocumentPermission.user_id == user_id,
        )
    )
    if permission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission not found.",
        )

    db.delete(permission)
    db.commit()