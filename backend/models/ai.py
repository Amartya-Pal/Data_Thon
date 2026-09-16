from typing import Any, Literal
import uuid

from pydantic import BaseModel, Field

from models.dashboard import SeriesResponse


class AiQueryRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1200)
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    context: dict[str, Any] = Field(default_factory=dict)


class ChartIntent(BaseModel):
    crop: str | None
    location: str | None
    location_kind: Literal["mandi", "district", "state", "all"]
    days: int


class AiStreamEvent(BaseModel):
    type: Literal["delta", "done", "error", "chart"]
    content: str | None = None
    chart: SeriesResponse | None = None
    intent: ChartIntent | None = None
