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
        self._mark_interrupted()

    def _mark_interrupted(self):
        """A session still "generating" at startup lost its generator when the app last stopped."""
        sessions = self._read_db()
        stale = [s for s in sessions if s.get("status") == "generating"]
        for s in stale:
            s["status"] = "interrupted"
        if stale:
            self._write_db(sessions)

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

    def create_session(
        self,
        title: str,
        text: str,
        engine: str,
        voice: str,
        speed: float,
        paragraph_pause: float = 0.6,
        sentence_pause: float = 0.25,
    ) -> Dict[str, Any]:
        """Record a narration the moment it starts. The audio fields arrive when it completes."""
        sessions = self._read_db()
        now_ts = time.time()

        if not title.strip():
            words = text.strip().split()
            title = " ".join(words[:6]) + ("..." if len(words) > 6 else "")
            if not title:
                title = f"Narration {time.strftime('%b %d, %H:%M')}"

        session_data = {
            "id": f"sess_{int(now_ts)}_{os.urandom(3).hex()}",
            "status": "generating",
            "title": title,
            "text": text,
            "engine": engine,
            "voice": voice,
            "speed": speed,
            "paragraph_pause": paragraph_pause,
            "sentence_pause": sentence_pause,
            "synced_segments": [],
            "word_count": len(text.split()),
            "char_count": len(text),
            "audio_filename": "",
            "audio_url": "",
            "duration_seconds": 0,
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
            envelope_path = audio_path + ".envelope.json"  # cached voice loudness curve
            if target.get("audio_filename") and os.path.exists(envelope_path):
                try:
                    os.remove(envelope_path)
                except Exception:
                    pass
            if os.path.exists(audio_path):
                try:
                    os.remove(audio_path)
                except Exception:
                    pass
            self._write_db(remaining)
            return True
        return False
