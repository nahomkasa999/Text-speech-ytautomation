"""
Voice Design API Router (Gemini Voices API).
Provides endpoints to create, audition, list, and delete custom vocal personas.
"""

import os
import base64
from fastapi import APIRouter, HTTPException, Query
from src.config import AUDIO_DIR
from src.models import CreateVoiceDesignRequest
from src.services.engine_service import gemini_engine

router = APIRouter(prefix="/api/voice-design", tags=["voice-design"])

@router.post("/create")
def create_custom_voice(req: CreateVoiceDesignRequest):
    try:
        created = gemini_engine.create_prompted_voice(
            api_key=req.api_key,
            description=req.description,
            display_name=req.display_name,
            gender=req.gender,
            language_code=req.language_code,
            model=req.model
        )

        voice_id = created.get("id") or created.get("name", "voice_custom")
        sample_audio = created.get("sample_audio", {})
        preview_url = ""

        if sample_audio and sample_audio.get("data"):
            os.makedirs(AUDIO_DIR, exist_ok=True)
            safe_id = voice_id.replace("/", "_")
            preview_filename = f"preview_{safe_id}.wav"
            preview_path = os.path.join(AUDIO_DIR, preview_filename)
            audio_bytes = base64.b64decode(sample_audio["data"])
            with open(preview_path, "wb") as f:
                f.write(audio_bytes)
            preview_url = f"/outputs/audio/{preview_filename}"

        return {
            "status": "success",
            "voice_id": voice_id,
            "display_name": req.display_name,
            "preview_url": preview_url,
            "sample_audio": sample_audio
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/list")
def list_custom_voices(api_key: str = Query(..., description="Gemini API Key")):
    try:
        voices = gemini_engine.list_prompted_voices(api_key=api_key)
        return {"status": "success", "voices": voices}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{voice_id}")
def delete_custom_voice(voice_id: str, api_key: str = Query(..., description="Gemini API Key")):
    try:
        success = gemini_engine.delete_prompted_voice(api_key=api_key, voice_id=voice_id)
        return {"status": "success" if success else "failed", "voice_id": voice_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
