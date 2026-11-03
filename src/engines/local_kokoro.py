"""
Local Kokoro-82M TTS Engine (ONNX Runtime)
Runs 100% offline on standard CPU with 0 cloud dependencies or API keys.
"""

import os
from typing import Dict, Any, List, Optional
import numpy as np
from src.engines.base import BaseTTSEngine

VOICE_METADATA = {
    # American Female
    "af_bella": {"name": "Bella", "gender": "Female", "accent": "US", "desc": "Warm, expressive audiobook tone"},
    "af_sarah": {"name": "Sarah", "gender": "Female", "accent": "US", "desc": "Crisp, articulate narrative voice"},
    "af_nicole": {"name": "Nicole", "gender": "Female", "accent": "US", "desc": "Conversational, engaging"},
    "af_sky": {"name": "Sky", "gender": "Female", "accent": "US", "desc": "Gentle, calm storytelling"},
    "af_alloy": {"name": "Alloy", "gender": "Female", "accent": "US", "desc": "Neutral, direct"},
    "af_heart": {"name": "Heart", "gender": "Female", "accent": "US", "desc": "Friendly, pleasant"},
    "af_kore": {"name": "Kore", "gender": "Female", "accent": "US", "desc": "Bright, clear"},
    # American Male
    "am_adam": {"name": "Adam", "gender": "Male", "accent": "US", "desc": "Deep, authoritative narrator"},
    "am_michael": {"name": "Michael", "gender": "Male", "accent": "US", "desc": "Warm, engaging storyteller"},
    "am_eric": {"name": "Eric", "gender": "Male", "accent": "US", "desc": "Friendly, approachable"},
    "am_echo": {"name": "Echo", "gender": "Male", "accent": "US", "desc": "Smooth, steady pace"},
    "am_fenrir": {"name": "Fenrir", "gender": "Male", "accent": "US", "desc": "Deep, resonant tone"},
    "am_liam": {"name": "Liam", "gender": "Male", "accent": "US", "desc": "Youthful, energetic"},
    "am_puck": {"name": "Puck", "gender": "Male", "accent": "US", "desc": "Character, animated"},
    # British Female
    "bf_emma": {"name": "Emma", "gender": "Female", "accent": "UK", "desc": "Distinguished, classic BBC style"},
    "bf_isabella": {"name": "Isabella", "gender": "Female", "accent": "UK", "desc": "Cultured, literary narrator"},
    "bf_alice": {"name": "Alice", "gender": "Female", "accent": "UK", "desc": "Crisp, proper British delivery"},
    # British Male
    "bm_george": {"name": "George", "gender": "Male", "accent": "UK", "desc": "Sophisticated, documentary style"},
    "bm_lewis": {"name": "Lewis", "gender": "Male", "accent": "UK", "desc": "Rich, historical narrative"},
    "bm_daniel": {"name": "Daniel", "gender": "Male", "accent": "UK", "desc": "Contemporary, clear"},
}

class LocalKokoroEngine(BaseTTSEngine):
    def __init__(self, model_dir: str):
        self.model_dir = model_dir
        self.model_path = os.path.join(model_dir, "kokoro-v1.0.onnx")
        self.voices_path = os.path.join(model_dir, "voices-v1.0.bin")
        self._kokoro = None

    @property
    def name(self) -> str:
        return "Kokoro-82M (Local Offline CPU)"

    @property
    def engine_id(self) -> str:
        return "local"

    def is_model_ready(self) -> bool:
        return (
            os.path.exists(self.model_path) and 
            os.path.exists(self.voices_path) and
            os.path.getsize(self.model_path) > 100_000_000
        )

    def _get_kokoro(self):
        if self._kokoro is None:
            if not self.is_model_ready():
                raise RuntimeError(
                    f"Kokoro model files not ready yet in {self.model_dir}. Download in progress."
                )
            from kokoro_onnx import Kokoro
            self._kokoro = Kokoro(self.model_path, self.voices_path)
        return self._kokoro

    def get_available_voices(self) -> List[Dict[str, str]]:
        voices = []
        for voice_id, meta in VOICE_METADATA.items():
            voices.append({
                "id": voice_id,
                "name": f"{meta['name']} ({meta['accent']} {meta['gender']})",
                "gender": meta["gender"],
                "accent": meta["accent"],
                "description": meta["desc"],
                "default": voice_id == "am_adam"
            })
        return voices

    def synthesize_segment(
        self,
        text: str,
        voice: str = "am_adam",
        speed: float = 1.0,
        options: Optional[Dict[str, Any]] = None
    ) -> np.ndarray:
        kokoro = self._get_kokoro()
        
        # Determine language prefix from voice (e.g. bf_emma -> en-gb, af_bella -> en-us)
        lang = "en-gb" if voice.startswith("b") else "en-us"
        
        sentence_pause = 0.25
        clause_pause = 0.1
        if options:
            sentence_pause = float(options.get("sentence_pause", 0.25))
            clause_pause = float(options.get("clause_pause", 0.1))

        samples, sample_rate = kokoro.create(
            text=text,
            voice=voice,
            speed=speed,
            lang=lang,
            sentence_pause=sentence_pause,
            clause_pause=clause_pause
        )
        return samples
