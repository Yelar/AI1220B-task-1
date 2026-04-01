from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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


class DocumentVersionRead(BaseModel):
    id: int
    document_id: int
    label: str | None
    content: str
    created_at: datetime

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


class AIInteractionRead(BaseModel):
    id: int
    document_id: int | None
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
