"""
Configuration and Path Resolution for AI Book Narrator Studio.
Supports both standard Python development and PyInstaller bundled environments.
"""

import os
import sys

APP_FOLDER_NAME = "BookNarrator"


def _frozen_user_data_dir() -> str:
    """Where the packaged app keeps projects, audio, drafts and images.

    Portable mode: if an "outputs" folder sits next to the .exe, keep using it.
    Otherwise use the per-user data folder (e.g. %LOCALAPPDATA%\\BookNarrator),
    which is always writable, even when installed under Program Files, and
    survives app updates / reinstalls.
    """
    exe_dir = os.path.dirname(sys.executable)
    if os.path.isdir(os.path.join(exe_dir, "outputs")) and os.access(exe_dir, os.W_OK):
        return exe_dir
    if sys.platform == "win32":
        root = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
    elif sys.platform == "darwin":
        root = os.path.expanduser("~/Library/Application Support")
    else:
        root = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    path = os.path.join(root, APP_FOLDER_NAME)
    os.makedirs(path, exist_ok=True)
    return path


if getattr(sys, 'frozen', False):
    # PyInstaller creates a temp folder and stores path in _MEIPASS
    BUNDLE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    MODELS_DIR = os.path.join(BUNDLE_DIR, "models")
    if not os.path.exists(MODELS_DIR):
        MODELS_DIR = os.path.join(BUNDLE_DIR, "_internal", "models")
    STATIC_DIR = os.path.join(BUNDLE_DIR, "static")
    if not os.path.exists(STATIC_DIR):
        STATIC_DIR = os.path.join(BUNDLE_DIR, "_internal", "static")
    APP_DATA_DIR = _frozen_user_data_dir()
    AUDIO_DIR = os.path.join(APP_DATA_DIR, "outputs", "audio")
    IMAGES_DIR = os.path.join(APP_DATA_DIR, "outputs", "images")
    BASE_DIR = APP_DATA_DIR
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    MODELS_DIR = os.path.join(BASE_DIR, "models")
    STATIC_DIR = os.path.join(BASE_DIR, "static")
    AUDIO_DIR = os.path.join(BASE_DIR, "outputs", "audio")
    IMAGES_DIR = os.path.join(BASE_DIR, "outputs", "images")
    APP_DATA_DIR = BASE_DIR

os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

# Scratch space for the desktop "Save As..." flow; cleared on every start.
TEMP_DIR = os.path.join(APP_DATA_DIR, "outputs", "tmp")
os.makedirs(TEMP_DIR, exist_ok=True)
for _name in os.listdir(TEMP_DIR):
    try:
        os.remove(os.path.join(TEMP_DIR, _name))
    except OSError:
        pass
