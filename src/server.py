"""
FastAPI Server for AI Book Narrator
Provides SSE (Server-Sent Events) for real-time progress updates,
audio stitching, session management, and preview generation.
"""

import os
import json
import time
import asyncio
from typing import Dict, Any, Optional
import numpy as np
import soundfile as sf
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from src.chunker import chunk_text_for_narration
from src.session_manager import SessionManager
from src.engines.local_kokoro import LocalKokoroEngine
from src.engines.deployed_runpod import DeployedRunPodEngine
from src.engines.api_cloud import CloudAPIEngine

import sys

if getattr(sys, 'frozen', False):
    # PyInstaller creates a temp folder and stores path in _MEIPASS
    BUNDLE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    # Models and static are in _internal or bundle root
    MODELS_DIR = os.path.join(BUNDLE_DIR, "models")
    if not os.path.exists(MODELS_DIR):
        MODELS_DIR = os.path.join(BUNDLE_DIR, "_internal", "models")
    STATIC_DIR = os.path.join(BUNDLE_DIR, "static")
    if not os.path.exists(STATIC_DIR):
        STATIC_DIR = os.path.join(BUNDLE_DIR, "_internal", "static")
    # Store outputs in working directory next to the executable
    APP_DATA_DIR = os.path.dirname(sys.executable)
    AUDIO_DIR = os.path.join(APP_DATA_DIR, "outputs", "audio")
    BASE_DIR = APP_DATA_DIR
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    MODELS_DIR = os.path.join(BASE_DIR, "models")
    STATIC_DIR = os.path.join(BASE_DIR, "static")
    AUDIO_DIR = os.path.join(BASE_DIR, "outputs", "audio")
    APP_DATA_DIR = BASE_DIR

app = FastAPI(title="AI Book Narrator Studio")

session_mgr = SessionManager(BASE_DIR)
local_engine = LocalKokoroEngine(MODELS_DIR)
deployed_engine = DeployedRunPodEngine()
cloud_engine = CloudAPIEngine()

ENGINES = {
    "local": local_engine,
    "deployed": deployed_engine,
    "cloud_api": cloud_engine
}

class DraftModel(BaseModel):
    title: Optional[str] = ""
    text: Optional[str] = ""
    engine: Optional[str] = "local"
    voice: Optional[str] = "am_adam"
    speed: Optional[float] = 1.0
    paragraph_pause: Optional[float] = 0.6
    sentence_pause: Optional[float] = 0.25
    audio_speed: Optional[float] = 1.0
    layers: Optional[Any] = None

@app.get("/api/draft")
def get_draft():
    draft_path = os.path.join(APP_DATA_DIR, "outputs", "draft.json")
    if os.path.exists(draft_path):
        try:
            with open(draft_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

@app.post("/api/draft")
def save_draft(draft: DraftModel):
    draft_path = os.path.join(APP_DATA_DIR, "outputs", "draft.json")
    os.makedirs(os.path.dirname(draft_path), exist_ok=True)
    with open(draft_path, "w", encoding="utf-8") as f:
        json.dump(draft.model_dump(), f, ensure_ascii=False, indent=2)
    return {"status": "saved"}

class GenerateRequest(BaseModel):
    title: Optional[str] = ""
    text: str
    engine: str = "local" # "local", "deployed", "cloud_api"
    voice: str = "am_adam"
    speed: float = 1.0
    paragraph_pause: float = 0.6
    sentence_pause: float = 0.25
    # Optional engine-specific settings
    endpoint_url: Optional[str] = ""
    api_key: Optional[str] = ""
    instruction: Optional[str] = ""
    cloud_provider: Optional[str] = "openai"

class PreviewRequest(BaseModel):
    engine: str = "local"
    voice: str = "am_adam"
    speed: float = 1.0
    sample_text: Optional[str] = "The morning sun rose gently over the misty hills, whispering secrets to the waking world."
    endpoint_url: Optional[str] = ""
    api_key: Optional[str] = ""
    instruction: Optional[str] = ""
    cloud_provider: Optional[str] = "openai"

class DeleteSessionRequest(BaseModel):
    session_id: str

@app.get("/api/status")
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

@app.get("/api/voices")
def get_voices():
    return {
        "local": local_engine.get_available_voices(),
        "deployed": deployed_engine.get_available_voices(),
        "cloud_api": cloud_engine.get_available_voices()
    }

@app.get("/api/sessions")
def list_sessions():
    return session_mgr.list_sessions()

@app.post("/api/sessions/delete")
def delete_session(req: DeleteSessionRequest):
    success = session_mgr.delete_session(req.session_id)
    return {"success": success}

@app.get("/audio/{filename}")
def serve_audio(filename: str):
    path = os.path.join(AUDIO_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(path, media_type="audio/wav")

@app.post("/api/preview")
def preview_voice(req: PreviewRequest):
    """Generates a quick 1-2 second voice preview sample."""
    engine = ENGINES.get(req.engine, local_engine)
    options = {
        "endpoint_url": req.endpoint_url,
        "api_key": req.api_key,
        "instruction": req.instruction,
        "provider": req.cloud_provider
    }

    try:
        samples = engine.synthesize_segment(
            text=req.sample_text or "Hello, this is a sample narration.",
            voice=req.voice,
            speed=req.speed,
            options=options
        )
        sample_filename = f"preview_{req.engine}_{req.voice}.wav"
        output_path = os.path.join(AUDIO_DIR, sample_filename)
        sf.write(output_path, samples, 24000)
        return {
            "success": True,
            "audio_url": f"/audio/{sample_filename}?t={int(time.time())}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/generate")
async def generate_narration_stream(req: GenerateRequest):
    """
    Server-Sent Events endpoint that processes the entire book in chunks,
    streaming live progress updates (percentage, chunk count, ETA) and returning
    the finalized audio file.
    """
    engine = ENGINES.get(req.engine, local_engine)
    
    # 1. Smart chunking
    chunks = chunk_text_for_narration(req.text)
    if not chunks:
        raise HTTPException(status_code=400, detail="Text is empty or invalid.")

    async def event_generator():
        total_chunks = len(chunks)
        start_time = time.time()
        audio_segments = []
        sample_rate = 24000

        # Silence buffers for natural pauses
        p_silence = np.zeros(int(sample_rate * max(0.1, req.paragraph_pause)), dtype=np.float32)
        s_silence = np.zeros(int(sample_rate * max(0.05, req.sentence_pause)), dtype=np.float32)

        options = {
            "endpoint_url": req.endpoint_url,
            "api_key": req.api_key,
            "instruction": req.instruction,
            "provider": req.cloud_provider,
            "sentence_pause": req.sentence_pause
        }

        # Send initial event
        yield f"data: {json.dumps({'status': 'started', 'total_chunks': total_chunks})}\n\n"

        for i, chunk in enumerate(chunks):
            chunk_start = time.time()
            text_to_speak = chunk["text"]

            try:
                # Synthesize chunk (run in threadpool to prevent blocking asyncio loop)
                samples = await asyncio.to_thread(
                    engine.synthesize_segment,
                    text=text_to_speak,
                    voice=req.voice,
                    speed=req.speed,
                    options=options
                )
                
                audio_segments.append(samples)
                
                # Append appropriate pause
                if chunk["is_paragraph_end"]:
                    audio_segments.append(p_silence)
                else:
                    audio_segments.append(s_silence)

            except Exception as exc:
                yield f"data: {json.dumps({'status': 'error', 'error': str(exc)})}\n\n"
                return

            # Compute ETA and progress
            elapsed = time.time() - start_time
            avg_per_chunk = elapsed / (i + 1)
            remaining_chunks = total_chunks - (i + 1)
            eta_seconds = round(avg_per_chunk * remaining_chunks)
            percent = int(((i + 1) / total_chunks) * 100)

            progress_data = {
                "status": "progress",
                "current_chunk": i + 1,
                "total_chunks": total_chunks,
                "percent": percent,
                "eta_seconds": eta_seconds,
                "elapsed_seconds": round(elapsed),
                "current_text": text_to_speak[:70] + ("..." if len(text_to_speak) > 70 else "")
            }
            yield f"data: {json.dumps(progress_data)}\n\n"

        # Concatenate all audio segments seamlessly
        yield f"data: {json.dumps({'status': 'stitching', 'message': 'Assembling final audio file...'})}\n\n"
        final_audio = np.concatenate(audio_segments)
        duration_seconds = len(final_audio) / sample_rate

        audio_filename = f"audiobook_{int(time.time())}_{os.urandom(2).hex()}.wav"
        output_path = os.path.join(AUDIO_DIR, audio_filename)
        sf.write(output_path, final_audio, sample_rate)

        # Save to session history
        session_data = session_mgr.save_session(
            title=req.title or "",
            text=req.text,
            engine=req.engine,
            voice=req.voice,
            speed=req.speed,
            audio_filename=audio_filename,
            duration_seconds=duration_seconds
        )

        yield f"data: {json.dumps({'status': 'completed', 'session': session_data})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Mount static frontend
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
