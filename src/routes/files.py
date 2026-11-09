"""
Temporary files on the local disk.

- Blobs made in the browser (project files) are uploaded in one POST.
- Long video exports reserve an empty file and write into it piece by piece
  (PUT with a byte offset), so the video never has to fit in browser memory.

The desktop "Save As..." flow then moves the file to where the user picks
(see src/desktop_api.py). TEMP_DIR is emptied on every app start.
"""

import os
import re
import shutil
import uuid
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from src.config import TEMP_DIR

router = APIRouter(prefix="/api", tags=["files"])

_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def _temp_path(file_id: str) -> str:
    if not _ID_RE.match(file_id):
        raise HTTPException(status_code=400, detail="Invalid file id.")
    return os.path.join(TEMP_DIR, file_id)


@router.post("/temp-file")
async def upload_temp_file(request: Request):
    os.makedirs(TEMP_DIR, exist_ok=True)
    file_id = uuid.uuid4().hex
    path = os.path.join(TEMP_DIR, file_id)
    size = 0
    with open(path, "wb") as f:
        async for chunk in request.stream():
            f.write(chunk)
            size += len(chunk)
    return {"id": file_id, "url": f"/api/temp-file/{file_id}", "size": size}


@router.post("/temp-file/reserve")
async def reserve_temp_file():
    os.makedirs(TEMP_DIR, exist_ok=True)
    file_id = uuid.uuid4().hex
    open(os.path.join(TEMP_DIR, file_id), "wb").close()
    return {
        "id": file_id,
        "url": f"/api/temp-file/{file_id}",
        "free_bytes": shutil.disk_usage(TEMP_DIR).free,
    }


@router.put("/temp-file/{file_id}")
async def write_temp_file_at(file_id: str, pos: int, request: Request):
    path = _temp_path(file_id)
    if pos < 0 or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Export file not found.")
    written = 0
    with open(path, "r+b") as f:
        f.seek(pos)
        async for chunk in request.stream():
            f.write(chunk)
            written += len(chunk)
    return {"written": written}


@router.get("/temp-file/{file_id}")
async def download_temp_file(file_id: str, name: str = "video.mp4"):
    path = _temp_path(file_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path, filename=os.path.basename(name), media_type="application/octet-stream")


@router.delete("/temp-file/{file_id}")
async def delete_temp_file(file_id: str):
    path = _temp_path(file_id)
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    return {"deleted": True}
