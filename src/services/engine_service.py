"""
TTS Engines Registry and Session Service.
Provides centralized access to speech synthesis backends and session management.
"""

from src.config import BASE_DIR, MODELS_DIR
from src.session_manager import SessionManager
from src.engines.local_kokoro import LocalKokoroEngine
from src.engines.deployed_runpod import DeployedRunPodEngine
from src.engines.api_cloud import CloudAPIEngine

session_mgr = SessionManager(BASE_DIR)
local_engine = LocalKokoroEngine(MODELS_DIR)
deployed_engine = DeployedRunPodEngine()
cloud_engine = CloudAPIEngine()

ENGINES = {
    "local": local_engine,
    "deployed": deployed_engine,
    "cloud_api": cloud_engine
}
