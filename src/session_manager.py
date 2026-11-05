"""
Session Manager
Handles saving, loading, listing, and deleting narration projects / chapters.
Persists history so users can return to any previous audiobook narration.
"""

import os
import json
import time
from typing import List, Dict, Any, Optional

class SessionManager:
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.audio_dir = os.path.join(base_dir, "outputs", "audio")
        self.db_path = os.path.join(base_dir, "outputs", "sessions.json")
        os.makedirs(self.audio_dir, exist_ok=True)
        self._ensure_db()

    def _ensure_db(self):
        if not os.path.exists(self.db_path):
            with open(self.db_path, "w", encoding="utf-8") as f:
                json.dump([], f)

    def _read_db(self) -> List[Dict[str, Any]]:
        try:
            with open(self.db_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _write_db(self, sessions: List[Dict[str, Any]]):
        with open(self.db_path, "w", encoding="utf-8") as f:
            json.dump(sessions, f, indent=2, ensure_ascii=False)

    def list_sessions(self) -> List[Dict[str, Any]]:
        sessions = self._read_db()
        # Return sorted by newest first
        return sorted(sessions, key=lambda s: s.get("created_at_ts", 0), reverse=True)

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        for s in self._read_db():
            if s["id"] == session_id:
                return s
        return None

    def save_session(
        self,
        title: str,
        text: str,
        engine: str,
        voice: str,
        speed: float,
        audio_filename: str,
        duration_seconds: float,
        paragraph_pause: float = 0.6,
        sentence_pause: float = 0.25,
        synced_segments: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        sessions = self._read_db()
        now_ts = time.time()
        
        # If title is empty, generate from beginning of text
        if not title.strip():
            words = text.strip().split()
            title = " ".join(words[:6]) + ("..." if len(words) > 6 else "")
            if not title:
                title = f"Narration {time.strftime('%b %d, %H:%M')}"

        word_count = len(text.split())
        char_count = len(text)
        
        session_id = f"sess_{int(now_ts)}_{os.urandom(3).hex()}"
        session_data = {
            "id": session_id,
            "title": title,
            "text": text,
            "engine": engine,
            "voice": voice,
            "speed": speed,
            "paragraph_pause": paragraph_pause,
            "sentence_pause": sentence_pause,
            "synced_segments": synced_segments or [],
            "word_count": word_count,
            "char_count": char_count,
            "audio_filename": audio_filename,
            "audio_url": f"/audio/{audio_filename}",
            "duration_seconds": round(duration_seconds, 1),
            "created_at_ts": now_ts,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now_ts))
        }

        sessions.append(session_data)
        self._write_db(sessions)
        return session_data

    def update_session(self, session_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update editable per-session fields (e.g. the Video Studio background image)."""
        sessions = self._read_db()
        for s in sessions:
            if s["id"] == session_id:
                s.update(fields)
                self._write_db(sessions)
                return s
        return None

    def delete_session(self, session_id: str) -> bool:
        sessions = self._read_db()
        target = None
        remaining = []
        for s in sessions:
            if s["id"] == session_id:
                target = s
            else:
                remaining.append(s)

        if target:
            # Clean up audio file if exists
            audio_path = os.path.join(self.audio_dir, target.get("audio_filename", ""))
            if os.path.exists(audio_path):
                try:
                    os.remove(audio_path)
                except Exception:
                    pass
            self._write_db(remaining)
            return True
        return False
