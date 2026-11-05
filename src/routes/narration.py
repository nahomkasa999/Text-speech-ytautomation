"""
Narration generation, streaming progress (SSE), voice preview, and audio serving routes.
"""

import os
import time
import json
import asyncio
import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from src.config import AUDIO_DIR
from src.chunker import chunk_text_for_narration
from src.models import GenerateRequest, PreviewRequest
from src.services.engine_service import ENGINES, local_engine, session_mgr

router = APIRouter(tags=["narration"])

@router.get("/audio/{filename}")
def serve_audio(filename: str):
    path = os.path.join(AUDIO_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(path, media_type="audio/wav")

@router.post("/api/preview")
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

async def stream_chunks(chunks, engine, req):
    """Async generator yielding Server-Sent Events for each chunk synthesis."""
    total_chunks = len(chunks)
    start_time = time.time()
    audio_segments = []
    sample_rate = 24000
    chunk_timings = []
    current_time = 0.0

    p_pause_sec = max(0.1, req.paragraph_pause)
    s_pause_sec = max(0.05, req.sentence_pause)
    p_silence = np.zeros(int(sample_rate * p_pause_sec), dtype=np.float32)
    s_silence = np.zeros(int(sample_rate * s_pause_sec), dtype=np.float32)

    options = {
        "endpoint_url": req.endpoint_url,
        "api_key": req.api_key,
        "instruction": req.instruction,
        "provider": req.cloud_provider,
        "sentence_pause": req.sentence_pause
    }

    yield f"data: {json.dumps({'status': 'started', 'total_chunks': total_chunks})}\n\n"

    for i, chunk in enumerate(chunks):
        text_to_speak = chunk["text"]
        try:
            samples = await asyncio.to_thread(
                engine.synthesize_segment,
                text=text_to_speak,
                voice=req.voice,
                speed=req.speed,
                options=options
            )
            audio_segments.append(samples)
            speech_dur = len(samples) / sample_rate
            pause_dur = p_pause_sec if chunk["is_paragraph_end"] else s_pause_sec
            audio_segments.append(p_silence if chunk["is_paragraph_end"] else s_silence)

            seg_start = current_time
            seg_end = current_time + speech_dur + pause_dur
            chunk_timings.append({
                "start": round(seg_start, 3),
                "end": round(seg_end, 3),
                "speech_end": round(seg_start + speech_dur, 3),
                "text": text_to_speak,
                "is_paragraph_end": chunk["is_paragraph_end"]
            })
            current_time = seg_end
        except Exception as exc:
            yield f"data: {json.dumps({'status': 'error', 'error': str(exc)})}\n\n"
            return

        elapsed = time.time() - start_time
        remaining = total_chunks - (i + 1)
        eta_seconds = round((elapsed / (i + 1)) * remaining)
        percent = int(((i + 1) / total_chunks) * 100)

        yield f"data: {json.dumps({'status': 'progress', 'current_chunk': i + 1, 'total_chunks': total_chunks, 'percent': percent, 'eta_seconds': eta_seconds, 'elapsed_seconds': round(elapsed), 'current_text': text_to_speak[:70] + ('...' if len(text_to_speak) > 70 else '')})}\n\n"

    yield f"data: {json.dumps({'status': 'stitching', 'message': 'Assembling final audio file...'})}\n\n"
    final_audio = np.concatenate(audio_segments)
    duration_seconds = len(final_audio) / sample_rate
    audio_filename = f"audiobook_{int(time.time())}_{os.urandom(2).hex()}.wav"
    output_path = os.path.join(AUDIO_DIR, audio_filename)
    sf.write(output_path, final_audio, sample_rate)

    session_data = session_mgr.save_session(
        title=req.title or "",
        text=req.text,
        engine=req.engine,
        voice=req.voice,
        speed=req.speed,
        audio_filename=audio_filename,
        duration_seconds=duration_seconds,
        paragraph_pause=req.paragraph_pause,
        sentence_pause=req.sentence_pause,
        synced_segments=chunk_timings
    )
    yield f"data: {json.dumps({'status': 'completed', 'session': session_data})}\n\n"

@router.post("/api/generate")
async def generate_narration_stream(req: GenerateRequest):
    """Processes long-form text, streaming live SSE progress and finalized audio."""
    engine = ENGINES.get(req.engine, local_engine)
    chunks = chunk_text_for_narration(req.text)
    if not chunks:
        raise HTTPException(status_code=400, detail="Text is empty or invalid.")
    return StreamingResponse(stream_chunks(chunks, engine, req), media_type="text/event-stream")
