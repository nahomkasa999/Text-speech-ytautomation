"""
Gemini TTS + Voice Design Engine (Interactions API & POST /v1beta/voices).

- 30 prebuilt Gemini voices work as soon as an API key is entered.
- Voice design creates persistent "voice_..." personas from a text description;
  they are stored in the user's Google project and listed back from the API.
Docs: https://aistudio.google.com/docs/speech-generation and /docs/voice-design
"""

import io
import os
import base64
import httpx
import soundfile as sf
import numpy as np
from typing import Dict, Any, List, Optional
from src.engines.base import BaseTTSEngine

# Overridable for testing against a local mock server.
GEMINI_BASE_URL = os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
DEFAULT_MODEL = "gemini-3.8-flash-tts"
TARGET_SR = 24000

# The 30 prebuilt studio voices (name -> character), from the Gemini TTS docs.
PREBUILT_VOICES = {
    "Charon": "Informative", "Kore": "Firm", "Puck": "Upbeat", "Zephyr": "Bright",
    "Fenrir": "Excitable", "Leda": "Youthful", "Orus": "Firm", "Aoede": "Breezy",
    "Callirrhoe": "Easy-going", "Autonoe": "Bright", "Enceladus": "Breathy", "Iapetus": "Clear",
    "Umbriel": "Easy-going", "Algieba": "Smooth", "Despina": "Smooth", "Erinome": "Clear",
    "Algenib": "Gravelly", "Rasalgethi": "Informative", "Laomedeia": "Upbeat", "Achernar": "Soft",
    "Alnilam": "Firm", "Schedar": "Even", "Gacrux": "Mature", "Pulcherrima": "Forward",
    "Achird": "Friendly", "Zubenelgenubi": "Casual", "Vindemiatrix": "Gentle", "Sadachbia": "Lively",
    "Sadaltager": "Knowledgeable", "Sulafat": "Warm",
}


def _api_error(prefix: str, resp: httpx.Response) -> RuntimeError:
    try:
        msg = resp.json().get("error", {}).get("message") or resp.text
    except Exception:
        msg = resp.text
    if resp.status_code in (401, 403):
        msg = f"API key was rejected. {msg}"
    return RuntimeError(f"{prefix} ({resp.status_code}): {msg}")


def _normalize_voice_id(voice_id: str) -> str:
    """Accept both "voice_abc" and resource names like "voices/voice_abc"."""
    return (voice_id or "").split("/")[-1]


def _find_audio_block(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Return the last audio block of an Interactions API REST response.

    REST responses store audio in steps[].content[] (type "audio", base64 "data").
    The SDKs expose the same block as `output_audio`, so accept that too.
    """
    if isinstance(result.get("output_audio"), dict) and result["output_audio"].get("data"):
        return result["output_audio"]
    last = None
    for step in result.get("steps") or []:
        for item in step.get("content") or []:
            if isinstance(item, dict) and item.get("type") == "audio" and item.get("data"):
                last = item
    return last


def _decode_audio(data_b64: str, mime_type: str = "") -> np.ndarray:
    """Decode WAV (unary default) or headerless 16-bit PCM (audio/l16) to float32 mono @ 24 kHz."""
    raw = base64.b64decode(data_b64)
    mime = (mime_type or "").lower()
    sr = TARGET_SR
    if "l16" in mime or "pcm" in mime:
        audio = np.frombuffer(raw[: len(raw) // 2 * 2], dtype="<i2").astype(np.float32) / 32768.0
        for part in mime.split(";"):
            if part.strip().startswith("rate="):
                sr = int(part.strip()[5:])
    else:
        try:
            audio, sr = sf.read(io.BytesIO(raw), dtype="float32")
        except Exception:
            audio = np.frombuffer(raw[: len(raw) // 2 * 2], dtype="<i2").astype(np.float32) / 32768.0
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    audio = audio.astype(np.float32)
    if sr != TARGET_SR and len(audio) > 1:
        new_len = int(round(len(audio) * TARGET_SR / sr))
        audio = np.interp(np.linspace(0, len(audio) - 1, new_len), np.arange(len(audio)), audio).astype(np.float32)
    return audio


def _pace_style(speed: float) -> str:
    """Gemini controls pace through the style text, not a numeric speed."""
    if speed <= 0.8:
        return "speaking slowly"
    if speed < 0.95:
        return "speaking a little slowly"
    if speed >= 1.3:
        return "speaking rapidly"
    if speed > 1.05:
        return "speaking a little quickly"
    return ""


class GeminiVoiceDesignEngine(BaseTTSEngine):
    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    @property
    def name(self) -> str:
        return "Gemini TTS & Voice Design"

    @property
    def engine_id(self) -> str:
        return "voice_design"

    def get_available_voices(self) -> List[Dict[str, Any]]:
        """Prebuilt voices (usable with any API key). Designed voices are added by the UI from /api/voice-design/list."""
        return [
            {
                "id": name,
                "name": f"{name} ({trait})",
                "description": f"Gemini prebuilt voice: {trait.lower()}",
                "default": name == "Charon",
                "kind": "prebuilt",
            }
            for name, trait in PREBUILT_VOICES.items()
        ]

    def create_prompted_voice(
        self,
        api_key: str,
        description: str,
        display_name: str = "Custom Persona",
        gender: str = "male",
        language_code: str = "en-US",
        model: str = DEFAULT_MODEL
    ) -> Dict[str, Any]:
        """Creates a persistent voice persona from a natural-language description."""
        if not api_key:
            raise ValueError("Gemini API Key is required to design a voice.")

        payload = {
            "store": True,
            "voice": {
                "model": model or DEFAULT_MODEL,
                "type": "prompted",
                "display_name": display_name,
                "gender": gender,
                "language_code": language_code,
                "prompted": {"input": description}
            }
        }
        headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
        # Designing a voice also renders a sample, which can take a while.
        with httpx.Client(timeout=180.0) as client:
            resp = client.post(f"{GEMINI_BASE_URL}/voices", headers=headers, json=payload)
        if resp.status_code >= 400:
            raise _api_error("Gemini Voices API error", resp)
        created = resp.json()
        created["id"] = _normalize_voice_id(created.get("id") or created.get("name") or "")
        if not created["id"]:
            raise RuntimeError(f"Gemini Voices API returned no voice id: {resp.text[:300]}")
        return created

    def list_prompted_voices(self, api_key: str, languages: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Lists the custom (designed) voices stored in the user's Google project."""
        if not api_key:
            return []
        params: Dict[str, Any] = {"type": "prompted", "page_size": 200}
        if languages:
            params["language_code"] = languages
        voices: List[Dict[str, Any]] = []
        with httpx.Client(timeout=20.0) as client:
            for _ in range(5):  # 200-voice project limit -> at most a couple of pages
                resp = client.get(f"{GEMINI_BASE_URL}/voices", headers={"x-goog-api-key": api_key}, params=params)
                if resp.status_code >= 400:
                    raise _api_error("Gemini Voices API error", resp)
                data = resp.json()
                voices += [v for v in data.get("voices") or [] if v.get("type", "prompted") == "prompted"]
                token = data.get("next_page_token")
                if not token:
                    break
                params["page_token"] = token
        for v in voices:
            v["id"] = _normalize_voice_id(v.get("id") or v.get("name") or "")
        return [v for v in voices if v["id"]]

    def delete_prompted_voice(self, api_key: str, voice_id: str) -> bool:
        """Deletes a custom designed voice by voice_id."""
        if not api_key or not voice_id:
            return False
        url = f"{GEMINI_BASE_URL}/voices/{_normalize_voice_id(voice_id)}"
        with httpx.Client(timeout=15.0) as client:
            resp = client.delete(url, headers={"x-goog-api-key": api_key})
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
        model = options.get("model") or DEFAULT_MODEL
        if not api_key:
            raise ValueError("Gemini API Key is required. Please enter it in the Gemini panel.")

        # Docs: keep the transcript verbatim; most requests need no style at all,
        # and long style text causes voice drift. Only send a short pace hint.
        style = (options.get("style") or _pace_style(speed)).strip()
        content: Dict[str, Any] = {"type": "text", "text": text}
        if style:
            content["annotations"] = [{"type": "speech_metadata", "style": style}]

        payload = {
            "model": model,
            "input": [{"type": "user_input", "content": [content]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": _normalize_voice_id(voice) or "Charon"}]}
        }
        headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(f"{GEMINI_BASE_URL}/interactions", headers=headers, json=payload)
        if resp.status_code >= 400:
            raise _api_error("Gemini TTS error", resp)

        block = _find_audio_block(resp.json())
        if not block:
            raise RuntimeError(f"No audio returned from Gemini: {resp.text[:300]}")
        return _decode_audio(block["data"], block.get("mime_type", ""))
