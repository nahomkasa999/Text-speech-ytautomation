"""
Configuration and Path Resolution for AI Book Narrator Studio.
Supports both standard Python development and PyInstaller bundled environments.
"""

import os
import sys

if getattr(sys, 'frozen', False):
    # PyInstaller creates a temp folder and stores path in _MEIPASS
    BUNDLE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    MODELS_DIR = os.path.join(BUNDLE_DIR, "models")
    if not os.path.exists(MODELS_DIR):
        MODELS_DIR = os.path.join(BUNDLE_DIR, "_internal", "models")
    STATIC_DIR = os.path.join(BUNDLE_DIR, "static")
    if not os.path.exists(STATIC_DIR):
        STATIC_DIR = os.path.join(BUNDLE_DIR, "_internal", "static")
    APP_DATA_DIR = os.path.dirname(sys.executable)
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
