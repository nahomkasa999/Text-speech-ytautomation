"""Version of the running app code and of the installed base (.exe)."""

import json
import os
import sys


def _read(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def base_info() -> dict:
    """version.json inside the installed .exe ({} when running from source)."""
    if getattr(sys, "frozen", False):
        return _read(os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)), "version.json"))
    return {}


def current_info() -> dict:
    """Version of the app code actually running (an update, or the .exe copy)."""
    app_dir = os.environ.get("BOOKNARRATOR_APP_DIR")
    if app_dir:
        info = _read(os.path.join(app_dir, "version.json"))
    elif getattr(sys, "frozen", False):
        info = base_info()
    else:
        info = _read(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "version.json"))
    return {
        "version": info.get("version") or "dev",
        "build": int(info.get("build") or 0),
        "engine": info.get("engine"),
        "notes": info.get("notes", ""),
    }
