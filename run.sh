#!/usr/bin/env bash
# AI Book Narrator Studio - Launcher
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    ~/.local/bin/uv venv
    ~/.local/bin/uv pip install fastapi uvicorn httpx numpy soundfile kokoro-onnx
fi

echo "========================================================"
echo "  AI Book Narrator Studio"
echo "  Engines: Local Kokoro-82M | Deployed RunPod | Cloud API"
echo "  URL:     http://127.0.0.1:8000"
echo "========================================================"

exec .venv/bin/uvicorn src.server:app --host 127.0.0.1 --port 8000
