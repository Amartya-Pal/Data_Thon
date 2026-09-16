from datetime import datetime
from typing import List, Literal
import uuid

from pydantic import BaseModel, Field

FileCategory = Literal["mandi-receipt", "weather-log", "field-photo", "report", "other"]


class FileRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    content_type: str
    size_bytes: int
    category: FileCategory = "other"
    label: str | None = None
    is_image: bool
    uploaded_at: datetime
    url: str


class FileListResponse(BaseModel):
    files: List[FileRecord]
    total_bytes: int
    max_file_mb: int
    allowed_types: List[str]
