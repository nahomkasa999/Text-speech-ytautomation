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


def _ui_voice(v: dict) -> dict:
    name = v.get("display_name") or v["id"]
    return {
        "id": v["id"],
        "name": f"★ {name} (designed)",
        "gender": v.get("gender", ""),
        "description": v.get("description") or (v.get("prompted") or {}).get("input") or "Your designed Gemini voice",
        "kind": "designed",
    }


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
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    voice_id = created["id"]
    preview_url = ""
    sample_audio = created.get("sample_audio") or {}
    if sample_audio.get("data"):
        os.makedirs(AUDIO_DIR, exist_ok=True)
        preview_filename = f"preview_{voice_id}.wav"
        with open(os.path.join(AUDIO_DIR, preview_filename), "wb") as f:
            f.write(base64.b64decode(sample_audio["data"]))
        preview_url = f"/audio/{preview_filename}"  # served by the narration router

    created.setdefault("display_name", req.display_name)
    created.setdefault("description", req.description)
    return {
        "status": "success",
        "voice_id": voice_id,
        "display_name": req.display_name,
        "preview_url": preview_url,
        "voice": _ui_voice(created),
    }


@router.get("/list")
def list_custom_voices(api_key: str = Query(..., description="Gemini API Key")):
    try:
        voices = gemini_engine.list_prompted_voices(api_key=api_key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "voices": [_ui_voice(v) for v in voices]}


@router.delete("/{voice_id}")
def delete_custom_voice(voice_id: str, api_key: str = Query(..., description="Gemini API Key")):
    try:
        success = gemini_engine.delete_prompted_voice(api_key=api_key, voice_id=voice_id)
        return {"status": "success" if success else "failed", "voice_id": voice_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
