"""
FastAPI Server for AI Book Narrator Studio.
Mounts modular API routers and static frontend assets.
"""

import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from src.config import STATIC_DIR
from src.webview_cache import clear_for_running_version

# Before the window opens: drop UI files the window's browser cached from an older version.
clear_for_running_version()
from src.routes.draft import router as draft_router
from src.routes.images import router as images_router
from src.routes.sessions import router as sessions_router
from src.routes.status import router as status_router
from src.routes.narration import router as narration_router
from src.routes.views import router as views_router
from src.routes.voice_design import router as voice_design_router
from src.routes.files import router as files_router
from src.routes.updates import router as updates_router
from src.routes.native_export import router as native_export_router
from src.services.native_export import export_manager

app = FastAPI(title="AI Book Narrator Studio")


@app.middleware("http")
async def revalidate_static_files(request, call_next):
    # Without this, the window keeps running stale JS and HTML after the code changes.
    response = await call_next(request)
    if not request.url.path.startswith(("/api/", "/audio/")):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response

# Register modular API and View routers
app.include_router(views_router)
app.include_router(draft_router)
app.include_router(images_router)
app.include_router(sessions_router)
app.include_router(status_router)
app.include_router(narration_router)
app.include_router(voice_design_router)
app.include_router(files_router)
app.include_router(updates_router)
app.include_router(native_export_router)


@app.on_event("shutdown")
def stop_native_exports():
    export_manager.shutdown()

# Mount static frontend
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
