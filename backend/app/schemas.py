from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


RoleValue = Literal["owner", "editor", "commenter", "viewer"]


class UserRead(BaseModel):
    id: int
    email: str
    name: str

    model_config = {"from_attributes": True}


class DocumentBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""


class DocumentCreate(DocumentBase):
    save_initial_version: bool = True


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = None
    version_label: str | None = Field(default=None, max_length=200)
    create_version: bool = False


class DocumentRead(DocumentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentVersionCreate(BaseModel):
    label: str | None = Field(default=None, max_length=200)


class DocumentVersionRead(BaseModel):
    id: int
    document_id: int
    label: str | None
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentPermissionCreate(BaseModel):
    user_id: int
    role: RoleValue


class DocumentPermissionRead(BaseModel):
    id: int
    document_id: int
    user_id: int
    role: RoleValue

    model_config = {"from_attributes": True}


class AIInvokeRequest(BaseModel):
    feature: Literal["rewrite", "summarize", "translate", "restructure"]
    selected_text: str = Field(min_length=1)
    surrounding_context: str = ""
    target_language: str | None = None
    document_id: int | None = None


class AIInvokeResponse(BaseModel):
    feature: str
    output_text: str
    model_name: str
    provider: str = "lm-studio"
    status: str = "completed"
    mocked: bool = False


class AIInteractionRead(BaseModel):
    id: int
    document_id: int | None
    user_id: int | None
    feature: str
    prompt_excerpt: str
    response_text: str
    model_name: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HealthResponse(BaseModel):
    status: str
    app_name: str
