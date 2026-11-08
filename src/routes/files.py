"""
Temporary file upload used by the desktop "Save As..." flow.

Exported videos / project files are created in the browser as Blobs. In the
desktop app they are streamed here first, then Python copies them to the
location the user picks in the native Save dialog (see src/desktop_api.py).
"""

import os
import uuid
from fastapi import APIRouter, Request

from src.config import TEMP_DIR

router = APIRouter(prefix="/api", tags=["files"])


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
