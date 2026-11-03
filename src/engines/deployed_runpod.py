"""
Deployed GPU Engine (RunPod / Breeze-TTS-2 / Custom Server)
Allows connecting directly to a remote GPU endpoint running Breeze-TTS-2 or standard OpenAI-compatible TTS.
Supports:
- Breeze-TTS-2 voice design instructions (e.g. "A calm, reflective young woman...")
- Vocal event syntax: (sigh), (laugh), (clears throat)
- Streaming PCM / WAV / MP3 response decoding
"""

import io
import httpx
import soundfile as sf
import numpy as np
from typing import Dict, Any, List, Optional
from src.engines.base import BaseTTSEngine

class DeployedRunPodEngine(BaseTTSEngine):
    def __init__(self, endpoint_url: str = "", api_key: str = ""):
        self.endpoint_url = endpoint_url.rstrip("/")
        self.api_key = api_key

    @property
    def name(self) -> str:
        return "Deployed GPU (RunPod / Breeze-TTS-2)"

    @property
    def engine_id(self) -> str:
        return "deployed"

    def get_available_voices(self) -> List[Dict[str, str]]:
        return [
            {
                "id": "breeze-design",
                "name": "Breeze Voice Design (Dynamic Prompt)",
                "description": "Describe any voice tone, personality, or delivery",
                "default": True
            },
            {
                "id": "breeze-warm-narrator",
                "name": "Breeze: Warm Reflective Narrator",
                "instruction": "A warm, thoughtful young woman with a clear voice and a calm, reflective delivery.",
                "description": "Natural literary tone with emotional range"
            },
            {
                "id": "breeze-deep-storyteller",
                "name": "Breeze: Deep Dramatic Storyteller",
                "instruction": "A mature male narrator with a deep, resonant voice, steady pacing, and rich tone.",
                "description": "Epic story and historical narration"
            },
            {
                "id": "breeze-whisper-calm",
                "name": "Breeze: Intimate Calm Voice",
                "instruction": "A soft, gentle voice with close microphone presence and relaxed tempo.",
                "description": "Bedtime story or meditation reading"
            }
        ]

    def synthesize_segment(
        self,
        text: str,
        voice: str = "breeze-warm-narrator",
        speed: float = 1.0,
        options: Optional[Dict[str, Any]] = None
    ) -> np.ndarray:
        options = options or {}
        endpoint = options.get("endpoint_url", self.endpoint_url)
        if not endpoint:
            raise ValueError(
                "Deployed GPU endpoint URL is required. Please set your RunPod or server URL in the Settings panel."
            )

        token = options.get("api_key", self.api_key)
        instruction = options.get("instruction", "")
        
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        # 1. First attempt: Breeze-TTS-2 format (/v1/audio/speech with form-data or json)
        target_url = endpoint
        if not (target_url.endswith("/speech") or target_url.endswith("/synthesize")):
            target_url = f"{target_url}/v1/audio/speech"

        # Check if instruction is provided or pre-configured
        if not instruction:
            for v in self.get_available_voices():
                if v["id"] == voice and "instruction" in v:
                    instruction = v["instruction"]
                    break

        payload = {
            "text": text,
            "instruction": instruction or "A clear, natural audiobook narrator.",
            "speed": speed,
            "voice": voice
        }

        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(target_url, json=payload, headers=headers)
                
                # If json format fails, try form data (official Breeze format)
                if resp.status_code == 422 or resp.status_code == 400:
                    resp = client.post(target_url, data=payload, headers=headers)

                resp.raise_for_status()

                # Check content type: WAV, MP3, or raw PCM (24kHz 16-bit mono)
                content_type = resp.headers.get("content-type", "")
                if "pcm" in content_type or len(resp.content) % 2 == 0 and not resp.content.startswith(b"RIFF"):
                    # Raw 16-bit PCM little-endian at 24000Hz
                    audio_data = np.frombuffer(resp.content, dtype=np.int16).astype(np.float32) / 32768.0
                    return audio_data
                else:
                    audio_bytes = io.BytesIO(resp.content)
                    data, samplerate = sf.read(audio_bytes, dtype='float32')
                    return data
        except Exception as e:
            raise RuntimeError(f"Error calling deployed GPU endpoint ({endpoint}): {str(e)}")
