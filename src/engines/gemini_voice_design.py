"""
Gemini Voice Design Engine (POST /v1beta/voices & Interactions API).
Enables natural-language persona generation, voice auditioning, and TTS synthesis.
"""

import io
import base64
import httpx
import soundfile as sf
import numpy as np
from typing import Dict, Any, List, Optional
from src.engines.base import BaseTTSEngine

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

class GeminiVoiceDesignEngine(BaseTTSEngine):
    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    @property
    def name(self) -> str:
        return "Gemini Voice Design"

    @property
    def engine_id(self) -> str:
        return "voice_design"

    def get_available_voices(self) -> List[Dict[str, str]]:
        return [
            {"id": "voice_astronomer_sample", "name": "Astronomer (Warm British - Sample Prompt)", "gender": "male", "default": True},
            {"id": "voice_storyteller_sample", "name": "Storyteller (Gentle Narrative - Sample Prompt)", "gender": "female"},
            {"id": "voice_historian_sample", "name": "Historian (Reflective Scholar - Sample Prompt)", "gender": "male"}
        ]

    def create_prompted_voice(
        self,
        api_key: str,
        description: str,
        display_name: str = "Custom Persona",
        gender: str = "male",
        language_code: str = "en-US",
        model: str = "gemini-3.8-flash-tts"
    ) -> Dict[str, Any]:
        """Creates a persistent voice persona using natural language description."""
        if not api_key:
            raise ValueError("Gemini API Key is required to design a voice.")

        url = f"{GEMINI_BASE_URL}/voices"
        headers = {
            "x-goog-api-key": api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "store": True,
            "voice": {
                "model": model,
                "type": "prompted",
                "display_name": display_name,
                "gender": gender,
                "language_code": language_code,
                "prompted": {
                    "input": description
                }
            }
        }

        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.status_code >= 400:
                raise RuntimeError(f"Gemini Voices API error ({resp.status_code}): {resp.text}")
            return resp.json()

    def list_prompted_voices(self, api_key: str, languages: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Lists stored custom voices created in the project."""
        if not api_key:
            return []

        url = f"{GEMINI_BASE_URL}/voices"
        headers = {"x-goog-api-key": api_key}
        params = {"type": "prompted"}
        if languages:
            params["language_code"] = languages

        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, headers=headers, params=params)
            if resp.status_code >= 400:
                return []
            data = resp.json()
            return data.get("voices", [])

    def delete_prompted_voice(self, api_key: str, voice_id: str) -> bool:
        """Deletes a custom designed voice by voice_id."""
        if not api_key or not voice_id:
            return False

        url = f"{GEMINI_BASE_URL}/voices/{voice_id}"
        headers = {"x-goog-api-key": api_key}
        with httpx.Client(timeout=15.0) as client:
            resp = client.delete(url, headers=headers)
            return resp.status_code in (200, 204)

    def synthesize_segment(
        self,
        text: str,
        voice: str,
        speed: float = 1.0,
        options: Optional[Dict[str, Any]] = None
    ) -> np.ndarray:
        options = options or {}
        api_key = options.get("api_key") or options.get("gemini_api_key") or self.api_key
        model = options.get("model", "gemini-3.8-flash-tts")
        style = options.get("style", "expressive and natural audiobook narration")

        if not api_key:
            raise ValueError("Gemini API Key is required for speech synthesis. Please enter it in the Voice Design panel.")

        url = f"{GEMINI_BASE_URL}/interactions"
        headers = {
            "x-goog-api-key": api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "input": [{
                "type": "user_input",
                "content": [{
                    "type": "text",
                    "text": text,
                    "annotations": [{
                        "type": "speech_metadata",
                        "style": style
                    }]
                }]
            }],
            "response_format": {"type": "audio"},
            "generation_config": {
                "speech_config": [
                    {"voice": voice}
                ]
            }
        }

        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.status_code >= 400:
                raise RuntimeError(f"Gemini Interactions API error ({resp.status_code}): {resp.text}")

            result = resp.json()
            audio_b64 = result.get("output_audio", {}).get("data")
            if not audio_b64:
                raise RuntimeError(f"No audio returned from Gemini Interactions API: {resp.text}")

            audio_bytes = base64.b64decode(audio_b64)
            audio_arr, orig_sr = sf.read(io.BytesIO(audio_bytes))

            if audio_arr.ndim > 1:
                audio_arr = np.mean(audio_arr, axis=1)

            audio_arr = audio_arr.astype(np.float32)

            # Resample to 24000 Hz if necessary
            if orig_sr != 24000:
                new_len = int(round(len(audio_arr) * (24000.0 / orig_sr)))
                indices = np.linspace(0, len(audio_arr) - 1, new_len)
                audio_arr = np.interp(indices, np.arange(len(audio_arr)), audio_arr).astype(np.float32)

            return audio_arr
