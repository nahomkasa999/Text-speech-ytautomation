"""
Desktop App Launcher for AI Book Narrator Studio
Opens a native desktop application window using pywebview,
with an automatic fallback to the default browser.
"""

import sys
import time
import socket
import threading
import webbrowser
import uvicorn
from src.server import app

HOST = "127.0.0.1"
PORT = 8000

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((HOST, port)) == 0

def start_server():
    if not is_port_in_use(PORT):
        uvicorn.run(app, host=HOST, port=PORT, log_level="warning")

def main():
    # Start server in background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Wait for server to bind
    for _ in range(30):
        if is_port_in_use(PORT):
            break
        time.sleep(0.1)

    url = f"http://{HOST}:{PORT}"

    # Try opening native desktop window via pywebview
    try:
        import webview
        window = webview.create_window(
            title="AI Book Narrator Studio",
            url=url,
            width=1280,
            height=860,
            min_size=(900, 600)
        )
        webview.start()
    except Exception as e:
        # Fallback to browser if display/webview library is not present
        print(f"[Desktop Launcher] Native window unavailable ({e}). Opening in default browser...")
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down AI Book Narrator Studio...")
            sys.exit(0)

if __name__ == "__main__":
    main()
