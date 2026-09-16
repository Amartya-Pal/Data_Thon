"""Local file & media storage: files land on disk under backend/uploads, metadata in Mongo."""

import os
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.status import HTTP_204_NO_CONTENT

from lib.db import db
from models.files import FileCategory, FileListResponse, FileRecord

router = APIRouter(prefix="/files", tags=["files"])

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", Path(__file__).resolve().parent.parent / "uploads"))
MAX_FILE_MB = int(os.environ.get("MAX_UPLOAD_MB", "15"))
ALLOWED_TYPES: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "text/csv": ".csv",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "application/json": ".json",
}


def _safe_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", Path(name).name).strip() or "upload"
    return cleaned[:120]


def _record(doc: dict) -> FileRecord:
    return FileRecord(
        id=doc["id"],
        filename=doc["filename"],
        content_type=doc["content_type"],
        size_bytes=doc["size_bytes"],
        category=doc.get("category", "other"),
        label=doc.get("label"),
        is_image=doc["content_type"].startswith("image/"),
        uploaded_at=doc["uploaded_at"],
        url=f"/api/files/{doc['id']}/content",
    )


@router.get("", response_model=FileListResponse)
async def list_files():
    docs = await db.media_files.find({}, {"_id": 0}).sort("uploaded_at", -1).to_list(500)
    return FileListResponse(
        files=[_record(doc) for doc in docs],
        total_bytes=sum(doc["size_bytes"] for doc in docs),
        max_file_mb=MAX_FILE_MB,
        allowed_types=sorted(ALLOWED_TYPES.values()),
    )


@router.post("", response_model=FileRecord, status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    category: FileCategory = Form("other"),
    label: str | None = Form(None),
):
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{content_type or 'unknown'}'. Allowed: {', '.join(sorted(ALLOWED_TYPES.values()))}")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    record = FileRecord(
        filename=_safe_name(file.filename or "upload"),
        content_type=content_type,
        size_bytes=0,
        category=category,
        label=(label or "").strip() or None,
        is_image=content_type.startswith("image/"),
        uploaded_at=datetime.now(timezone.utc),
        url="",
    )
    target = UPLOAD_DIR / f"{record.id}{ALLOWED_TYPES[content_type]}"
    size = 0
    limit = MAX_FILE_MB * 1024 * 1024
    with target.open("wb") as handle:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                handle.close()
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_FILE_MB} MB limit")
            handle.write(chunk)
    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Uploaded file is empty")

    doc = {
        "id": record.id,
        "filename": record.filename,
        "content_type": content_type,
        "size_bytes": size,
        "category": category,
        "label": record.label,
        "storage_path": str(target),
        "uploaded_at": record.uploaded_at,
    }
    await db.media_files.insert_one(doc)
    return _record(doc)


@router.get("/{file_id}/content")
async def get_file_content(file_id: str):
    doc = await db.media_files.find_one({"id": file_id}, {"_id": 0})
    if not doc or not Path(doc["storage_path"]).exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(doc["storage_path"], media_type=doc["content_type"], filename=doc["filename"], content_disposition_type="inline")


@router.delete("/{file_id}", status_code=HTTP_204_NO_CONTENT)
async def delete_file(file_id: str):
    doc = await db.media_files.find_one_and_delete({"id": file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")
    Path(doc["storage_path"]).unlink(missing_ok=True)
    return None
