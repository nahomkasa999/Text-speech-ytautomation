"""
Image upload and static serving routes for book covers and video studio backgrounds.
"""

import os
import time
import base64
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from src.config import IMAGES_DIR
from src.models import ImageUploadModel

router = APIRouter(tags=["images"])

@router.post("/api/upload-image")
def upload_image(req: ImageUploadModel):
    if not req.data_url:
        raise HTTPException(status_code=400, detail="No image provided")
    header, _, encoded = req.data_url.partition(",")
    content = base64.b64decode(encoded if encoded else req.data_url)
    ext = ".png"
    if "jpeg" in header or "jpg" in header:
        ext = ".jpg"
    elif "webp" in header:
        ext = ".webp"
    elif "svg" in header:
        ext = ".svg"
    filename = f"cover_{int(time.time())}_{os.urandom(2).hex()}{ext}"
    target_path = os.path.join(IMAGES_DIR, filename)
    with open(target_path, "wb") as f:
        f.write(content)
    return {"url": f"/images/{filename}"}

@router.api_route("/images/{filename}", methods=["GET", "HEAD"])
def serve_image(filename: str):
    path = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image not found")
    media_type = "image/png"
    if filename.endswith(".jpg") or filename.endswith(".jpeg"):
        media_type = "image/jpeg"
    elif filename.endswith(".webp"):
        media_type = "image/webp"
    elif filename.endswith(".svg"):
        media_type = "image/svg+xml"
    return FileResponse(path, media_type=media_type)
