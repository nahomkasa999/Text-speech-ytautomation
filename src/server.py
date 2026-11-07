"""
FastAPI Server for AI Book Narrator Studio.
Mounts modular API routers and static frontend assets.
"""

import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from src.config import STATIC_DIR
from src.routes.draft import router as draft_router
from src.routes.images import router as images_router
from src.routes.sessions import router as sessions_router
from src.routes.status import router as status_router
from src.routes.narration import router as narration_router
from src.routes.views import router as views_router
from src.routes.voice_design import router as voice_design_router

app = FastAPI(title="AI Book Narrator Studio")

# Register modular API and View routers
app.include_router(views_router)
app.include_router(draft_router)
app.include_router(images_router)
app.include_router(sessions_router)
app.include_router(status_router)
app.include_router(narration_router)
app.include_router(voice_design_router)

# Mount static frontend
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
