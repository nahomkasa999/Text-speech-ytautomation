"""
Cloud API Engine (OpenAI / ElevenLabs / BreezeBlue API)
Allows users to enter their API key and generate speech directly from cloud providers.
"""

import io
import httpx
import soundfile as sf
import numpy as np
from typing import Dict, Any, List, Optional
from src.engines.base import BaseTTSEngine

class CloudAPIEngine(BaseTTSEngine):
    def __init__(self, provider: str = "openai", api_key: str = ""):
        self.provider = provider
        self.api_key = api_key

    @property
    def name(self) -> str:
        return "Cloud API (API Key)"

    @property
    def engine_id(self) -> str:
        return "cloud_api"

    def get_available_voices(self) -> List[Dict[str, str]]:
        return [
            # OpenAI standard voices
            {"id": "onyx", "name": "Onyx (Deep Authoritative Male - OpenAI)", "provider": "openai", "default": True},
            {"id": "nova", "name": "Nova (Warm Expressive Female - OpenAI)", "provider": "openai"},
            {"id": "alloy", "name": "Alloy (Neutral Balanced - OpenAI)", "provider": "openai"},
            {"id": "echo", "name": "Echo (Smooth Male - OpenAI)", "provider": "openai"},
            {"id": "fable", "name": "Fable (British Narrative Accent - OpenAI)", "provider": "openai"},
            {"id": "shimmer", "name": "Shimmer (Clear Emotional Female - OpenAI)", "provider": "openai"},
            # ElevenLabs popular voices
            {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel (Calm Professional - ElevenLabs)", "provider": "elevenlabs"},
            {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi (Strong Empathic - ElevenLabs)", "provider": "elevenlabs"},
            {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella (Narrative Storyteller - ElevenLabs)", "provider": "elevenlabs"},
            {"id": "ErXwobaYiN019PkySvjV", "name": "Antoni (Classic Audiobook Male - ElevenLabs)", "provider": "elevenlabs"},
            # BreezeBlue Cloud API
            {"id": "breeze-cloud-narrator", "name": "Breeze Cloud Narrator (BreezeBlue)", "provider": "breezeblue"}
        ]

    def synthesize_segment(
        self,
        text: str,
        voice: str = "onyx",
        speed: float = 1.0,
        options: Optional[Dict[str, Any]] = None
    ) -> np.ndarray:
        options = options or {}
        api_key = options.get("api_key", self.api_key)
        provider = options.get("provider", self.provider)

        if not api_key:
            raise ValueError(f"API Key for {provider.upper()} is required. Please enter it in the Settings panel.")

        if provider == "elevenlabs":
            return self._call_elevenlabs(text, voice, speed, api_key)
        elif provider == "breezeblue":
            return self._call_breezeblue(text, voice, speed, api_key, options)
        else: # Default OpenAI
            return self._call_openai(text, voice, speed, api_key)

    def _call_openai(self, text: str, voice: str, speed: float, api_key: str) -> np.ndarray:
        url = "https://api.openai.com/v1/audio/speech"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "tts-1",
            "input": text,
            "voice": voice if voice in ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] else "onyx",
            "speed": max(0.25, min(4.0, speed)),
            "response_format": "wav"
        }
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            audio_bytes = io.BytesIO(resp.content)
            data, samplerate = sf.read(audio_bytes, dtype='float32')
            return data

    def _call_elevenlabs(self, text: str, voice: str, speed: float, api_key: str) -> np.ndarray:
        voice_id = voice if len(voice) > 10 else "21m00Tcm4TlvDq8ikWAM"
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        }
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            audio_bytes = io.BytesIO(resp.content)
            data, samplerate = sf.read(audio_bytes, dtype='float32')
            return data

    def _call_breezeblue(self, text: str, voice: str, speed: float, api_key: str, options: Dict[str, Any]) -> np.ndarray:
        url = "https://api.breezeblue.ai/v1/audio/speech"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        instruction = options.get("instruction", "A warm, thoughtful young woman with a calm delivery.")
        payload = {
            "text": text,
            "instruction": instruction,
            "speed": speed
        }
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            audio_bytes = io.BytesIO(resp.content)
            data, samplerate = sf.read(audio_bytes, dtype='float32')
            return data
