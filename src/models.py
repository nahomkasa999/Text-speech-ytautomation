"""
Pydantic Request and Response Models for AI Book Narrator Studio.
"""

from typing import Optional, Any
from pydantic import BaseModel

class DraftModel(BaseModel):
    title: Optional[str] = ""
    text: Optional[str] = ""
    engine: Optional[str] = "local"
    voice: Optional[str] = "am_adam"
    speed: Optional[float] = 1.0
    paragraph_pause: Optional[float] = 0.6
    sentence_pause: Optional[float] = 0.25
    audio_speed: Optional[float] = 1.0
    audio_volume: Optional[float] = 1.0
    layers: Optional[Any] = None
    bg_image: Optional[str] = None

class ImageUploadModel(BaseModel):
    data_url: str

class GenerateRequest(BaseModel):
    title: Optional[str] = ""
    text: str
    engine: str = "local"  # "local", "deployed", "cloud_api"
    voice: str = "am_adam"
    speed: float = 1.0
    paragraph_pause: float = 0.6
    sentence_pause: float = 0.25
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

class UpdateSessionRequest(BaseModel):
    session_id: str
    bg_image: Optional[str] = None

class CreateVoiceDesignRequest(BaseModel):
    api_key: str
    description: str
    display_name: Optional[str] = "Custom Persona"
    gender: Optional[str] = "male"
    language_code: Optional[str] = "en-US"
    model: Optional[str] = "gemini-3.8-flash-tts"
