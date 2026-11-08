"""
Voice loudness envelope for "Move with the voice" animations.

Reads the narration WAV in blocks (fine for multi-hour books), measures the
loudness 30 times per second, smooths it (quick rise, gentle fall so motion
looks natural) and returns it as compact base64 bytes (0-255). The result is
cached next to the WAV so it is only computed once per narration.
"""

import base64
import json
import os
from typing import Dict

import numpy as np
import soundfile as sf

FPS = 30
ATTACK = 0.55   # how fast the level rises when speech starts (per frame)
RELEASE = 0.10  # how fast it falls back during pauses (per frame)


def _frame_rms(path: str, fps: int) -> np.ndarray:
    values = []
    with sf.SoundFile(path) as f:
        frame_len = max(1, int(round(f.samplerate / fps)))
        for block in f.blocks(blocksize=frame_len * 2000, dtype="float32", always_2d=True):
            mono = block.mean(axis=1)
            usable = len(mono) // frame_len * frame_len
            if usable:
                frames = mono[:usable].reshape(-1, frame_len)
                values.append(np.sqrt(np.mean(frames ** 2, axis=1)))
            if usable < len(mono):  # trailing partial frame
                tail = mono[usable:]
                values.append(np.array([np.sqrt(np.mean(tail ** 2))], dtype=np.float32))
    return np.concatenate(values) if values else np.zeros(0, dtype=np.float32)


def compute_envelope(path: str, fps: int = FPS) -> Dict:
    rms = _frame_rms(path, fps)
    if rms.size == 0:
        return {"fps": fps, "data": ""}
    loud = np.percentile(rms, 95)
    level = np.clip(rms / loud, 0.0, 1.0) if loud > 1e-6 else np.zeros_like(rms)
    smoothed = np.empty_like(level)
    cur = 0.0
    for i, target in enumerate(level):
        cur += (target - cur) * (ATTACK if target > cur else RELEASE)
        smoothed[i] = cur
    data = np.round(smoothed * 255).astype(np.uint8).tobytes()
    return {"fps": fps, "data": base64.b64encode(data).decode("ascii")}


def get_envelope(audio_dir: str, filename: str) -> Dict:
    """Envelope for a narration file in audio_dir, using a cache file."""
    name = os.path.basename(filename)
    path = os.path.join(audio_dir, name)
    if not name or name.startswith(".") or not os.path.isfile(path):
        raise FileNotFoundError(name)
    cache = path + ".envelope.json"
    if os.path.isfile(cache) and os.path.getmtime(cache) >= os.path.getmtime(path):
        with open(cache, "r", encoding="utf-8") as fh:
            return json.load(fh)
    env = compute_envelope(path)
    try:
        with open(cache, "w", encoding="utf-8") as fh:
            json.dump(env, fh)
    except OSError:
        pass
    return env
