from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi import Header
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import resolve_http_user
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
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    legacy_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> User:
    return resolve_http_user(credentials, legacy_user_id, db)


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


def safe_export_filename(title: str, export_format: str) -> str:
    collapsed = "-".join(title.lower().split()) or "document"
    sanitized = "".join(
        character
        for character in collapsed
        if character.isalnum() or character in {"-", "_"}
    ).strip("-_")
    stem = sanitized or "document"
    return f"{stem}.{export_format}"


@router.get(
    "",
    response_model=list[DocumentRead],
    summary="List accessible documents",
    description="Return documents owned by the authenticated user or explicitly shared with them.",
)
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


@router.post(
    "",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a document",
    description="Create a new document owned by the authenticated user.",
)
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


@router.get(
    "/{document_id}",
    response_model=DocumentRead,
    summary="Get a document",
    description="Return a single document if the authenticated user has access to it.",
)
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
        {"owner", "editor", "viewer"},
    )
    return document


@router.get(
    "/{document_id}/export",
    summary="Export a document",
    description="Export a document as markdown, plain text, or JSON.",
)
def export_document(
    document_id: int,
    format: str = Query(default="md"),
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
        {"owner", "editor", "viewer"},
    )

    export_format = format.lower().strip()
    if export_format not in {"txt", "md", "json"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported export format. Use txt, md, or json.",
        )

    filename = safe_export_filename(document.title, export_format)

    if export_format == "json":
        payload = {
            "id": document.id,
            "title": document.title,
            "content": document.content,
            "created_at": document.created_at.isoformat(),
            "updated_at": document.updated_at.isoformat(),
        }
        return JSONResponse(
            payload,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    body = (
        document.content
        if export_format == "txt"
        else f"# {document.title}\n\n{document.content}"
    )
    return PlainTextResponse(
        body,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch(
    "/{document_id}",
    response_model=DocumentRead,
    summary="Update a document",
    description="Update title or content for a document if the authenticated user has write access.",
)
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


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document",
    description="Delete a document if the authenticated user is the owner.",
)
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


@router.get(
    "/{document_id}/versions",
    response_model=list[DocumentVersionRead],
    summary="List document versions",
    description="Return saved versions for a document if the authenticated user can access it.",
)
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
        {"owner", "editor", "viewer"},
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
    summary="Create a document version",
    description="Create a new named snapshot for a document if the authenticated user can edit it.",
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


@router.post(
    "/{document_id}/versions/{version_id}/revert",
    response_model=DocumentRead,
    summary="Restore a previous version",
    description="Revert a document to a previous saved version if the authenticated user is the owner.",
)
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
    summary="List document permissions",
    description="Return sharing roles for a document if the authenticated user is the owner.",
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
    summary="Share a document",
    description="Create or update a sharing role for a user if the authenticated user is the owner.",
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
    
    if payload.role == "owner" and target_user.id != document.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ownership transfer is not supported.",
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
    summary="Remove a sharing role",
    description="Remove a non-owner permission from a document if the authenticated user is the owner.",
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
