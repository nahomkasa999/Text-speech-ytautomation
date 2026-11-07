"""
System status and available voices inspection routes.
"""

import os
from fastapi import APIRouter
from src.services.engine_service import local_engine, deployed_engine, cloud_engine
# from src.services.engine_service import gemini_engine  # Gemini disabled until next release

router = APIRouter(prefix="/api", tags=["status"])

@router.get("/status")
def get_status():
    model_ready = local_engine.is_model_ready()
    model_file_size = 0
    if os.path.exists(local_engine.model_path):
        model_file_size = os.path.getsize(local_engine.model_path)
    return {
        "local_model_ready": model_ready,
        "model_file_size_mb": round(model_file_size / (1024 * 1024), 1),
        "target_size_mb": 310
    }

@router.get("/voices")
def get_voices():
    return {
        "local": local_engine.get_available_voices(),
        "deployed": deployed_engine.get_available_voices(),
        "cloud_api": cloud_engine.get_available_voices(),
        # "voice_design": gemini_engine.get_available_voices()  # Gemini disabled until next release
    }
