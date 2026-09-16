from typing import Any, Literal
import uuid

from pydantic import BaseModel, Field


class AiQueryRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1200)
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    context: dict[str, Any] = Field(default_factory=dict)


class AiStreamEvent(BaseModel):
    type: Literal["delta", "done", "error"]
    content: str | None = None
