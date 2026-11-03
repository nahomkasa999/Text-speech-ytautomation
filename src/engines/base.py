"""
Base TTS Engine Interface
Defines the standard interface that all 3 TTS engines implement:
1. Local Kokoro-82M (ONNX)
2. Deployed GPU (RunPod / Breeze-TTS-2 / Custom Endpoint)
3. Cloud API (OpenAI / ElevenLabs / BreezeBlue API)
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import numpy as np

class BaseTTSEngine(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """User friendly name of the engine."""
        pass

    @property
    @abstractmethod
    def engine_id(self) -> str:
        """Unique key: 'local', 'deployed', 'cloud_api'."""
        pass

    @abstractmethod
    def get_available_voices(self) -> List[Dict[str, str]]:
        """List of available voices with id, label, gender, and language."""
        pass

    @abstractmethod
    def synthesize_segment(
        self,
        text: str,
        voice: str,
        speed: float = 1.0,
        options: Optional[Dict[str, Any]] = None
    ) -> np.ndarray:
        """
        Synthesize a single text chunk into 24kHz (or standard rate) float32 audio samples.
        Returns a numpy array of audio samples.
        """
        pass
