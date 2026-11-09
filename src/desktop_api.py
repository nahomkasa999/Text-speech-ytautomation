"""
Native desktop helpers exposed to the web UI through pywebview's js_api.

The desktop window (pywebview / WebView2) blocks normal browser downloads, so
the UI asks Python to show a real "Save As..." dialog and copies the file
straight from disk. This also avoids pushing large WAV/MP4 files through the
JavaScript bridge.
"""

import os
import shutil
import subprocess
import sys
from typing import Optional

from src.config import AUDIO_DIR, TEMP_DIR

FILE_TYPES = {
    ".wav": "WAV audio (*.wav)",
    ".mp4": "MP4 video (*.mp4)",
    ".webm": "WebM video (*.webm)",
    ".videoproj": "Video project (*.videoproj)",
    ".json": "JSON file (*.json)",
}


def resolve_server_path(url_path: str) -> Optional[str]:
    """Map a URL served by this app ("/audio/x.wav", "/api/temp-file/<id>")
    to the file on disk. Only those two folders are allowed."""
    path = (url_path or "").split("?")[0].split("#")[0]
    if "://" in path:  # absolute URL to our own server
        path = "/" + path.split("://", 1)[1].split("/", 1)[-1]
    name = os.path.basename(path)
    if not name or name.startswith("."):
        return None
    if path.startswith("/audio/"):
        candidate = os.path.join(AUDIO_DIR, name)
    elif path.startswith("/api/temp-file/"):
        candidate = os.path.join(TEMP_DIR, name)
    else:
        return None
    return candidate if os.path.isfile(candidate) else None


def default_save_dir() -> str:
    downloads = os.path.join(os.path.expanduser("~"), "Downloads")
    return downloads if os.path.isdir(downloads) else os.path.expanduser("~")


class DesktopApi:
    """Methods callable from JavaScript as window.pywebview.api.<name>(...)."""

    def __init__(self):
        self._window = None

    def set_window(self, window) -> None:
        self._window = window

    def _ask_save_path(self, suggested_name: str) -> Optional[str]:
        import webview
        file_dialog = getattr(webview, "FileDialog", None)
        save_type = file_dialog.SAVE if file_dialog else webview.SAVE_DIALOG
        ext = os.path.splitext(suggested_name)[1].lower()
        file_types = (FILE_TYPES[ext], "All files (*.*)") if ext in FILE_TYPES else ()
        result = self._window.create_file_dialog(
            save_type, directory=default_save_dir(), save_filename=suggested_name, file_types=file_types
        )
        if not result:
            return None
        target = result[0] if isinstance(result, (list, tuple)) else result
        if ext and not target.lower().endswith(ext):
            target += ext
        return target

    def save_as(self, url_path: str, suggested_name: str) -> dict:
        """Show a Save dialog and put the server file there.

        Temp files are moved (instant on the same disk, no second copy of a
        multi-GB export) and kept when the dialog is cancelled, so the user can
        try saving again instead of re-rendering."""
        try:
            source = resolve_server_path(url_path)
            if not source:
                return {"ok": False, "error": "File not found. Please generate it again."}
            suggested_name = os.path.basename(suggested_name or os.path.basename(source))
            target = self._ask_save_path(suggested_name)
            if not target:
                return {"ok": False, "cancelled": True}
            if "/api/temp-file/" in url_path:
                shutil.move(source, target)
            else:
                shutil.copyfile(source, target)
            return {"ok": True, "path": target}
        except Exception as exc:  # report to the UI instead of failing silently
            return {"ok": False, "error": str(exc)}

    def prepare_video_export(self, settings: dict) -> dict:
        """Select the destination before probing audio or starting the encoder."""
        try:
            from src.services.native_export import export_manager

            if not isinstance(settings, dict):
                raise ValueError("Invalid video export settings.")
            extension = settings.get("format", "mp4")
            if extension not in ("mp4", "webm"):
                raise ValueError("Unsupported video format.")
            name = os.path.basename(settings.get("filename") or f"video.{extension}")
            name = os.path.splitext(name)[0] + "." + extension
            target = self._ask_save_path(name)
            if not target:
                return {"ok": False, "cancelled": True}
            return export_manager.prepare(target, settings)
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def reveal(self, path: str) -> bool:
        """Open the folder containing a saved file (selecting it on Windows)."""
        if not path or not os.path.exists(path):
            return False
        try:
            if sys.platform == "win32":
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
            elif sys.platform == "darwin":
                subprocess.Popen(["open", "-R", path])
            else:
                subprocess.Popen(["xdg-open", os.path.dirname(path)])
            return True
        except Exception:
            return False
