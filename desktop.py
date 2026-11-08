"""
Desktop App Launcher for AI Book Narrator Studio
Opens a native desktop application window using pywebview,
with an automatic fallback to the default browser.

This is the entry point of the packaged Windows / Linux app (see book_narrator.spec).
"""

import os
import sys
import json
import time
import socket
import threading
import traceback
import webbrowser
import urllib.request
import multiprocessing

HOST = "127.0.0.1"
PREFERRED_PORT = 8000
APP_TITLE = "AI Book Narrator Studio"
SERVER_START_TIMEOUT_S = 60


def _redirect_missing_streams(log_dir: str) -> None:
    """A windowed (no console) .exe has sys.stdout/stderr = None, which crashes
    uvicorn's logging. Send output to a log file instead."""
    if sys.stdout is not None and sys.stderr is not None:
        return
    os.makedirs(log_dir, exist_ok=True)
    log = open(os.path.join(log_dir, "app.log"), "a", encoding="utf-8", buffering=1)
    log.write(f"\n===== {APP_TITLE} started {time.strftime('%Y-%m-%d %H:%M:%S')} =====\n")
    if sys.stdout is None:
        sys.stdout = log
    if sys.stderr is None:
        sys.stderr = log


def _show_fatal_error(message: str) -> None:
    print(message, file=sys.stderr)
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, message, APP_TITLE, 0x10)
        except Exception:
            pass


def _port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((HOST, port)) == 0


def _is_our_server(port: int) -> bool:
    """True if this app is already running on the port (e.g. a second launch)."""
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/api/status", timeout=1.5) as resp:
            return "local_model_ready" in json.loads(resp.read().decode("utf-8"))
    except Exception:
        return False


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((HOST, 0))
        return s.getsockname()[1]


def _choose_port() -> tuple:
    """Returns (port, already_running). Prefers 8000 so the browser storage
    (UI settings, backgrounds) stays on the same origin between launches."""
    if not _port_in_use(PREFERRED_PORT):
        return PREFERRED_PORT, False
    if _is_our_server(PREFERRED_PORT):
        return PREFERRED_PORT, True
    return _free_port(), False


def _start_server(port: int) -> None:
    import uvicorn
    from src.server import app
    uvicorn.run(app, host=HOST, port=port, log_level="warning")


def _wait_for_server(port: int, server_thread: threading.Thread) -> bool:
    deadline = time.time() + SERVER_START_TIMEOUT_S
    while time.time() < deadline:
        if _port_in_use(port):
            return True
        if server_thread is not None and not server_thread.is_alive():
            return False
        time.sleep(0.1)
    return False


def _open_window(url: str, storage_dir: str) -> None:
    try:
        import webview
        from src.desktop_api import DesktopApi

        # The embedded browser blocks downloads by default. Allow them, and give the
        # UI a native "Save As..." dialog (window.pywebview.api.save_as).
        webview.settings["ALLOW_DOWNLOADS"] = True
        api = DesktopApi()
        window = webview.create_window(
            title=APP_TITLE,
            url=url,
            js_api=api,
            width=1280,
            height=800,
            min_size=(900, 600),
            maximized=True,  # small laptops: never start larger than the screen
        )
        api.set_window(window)
        # Persist localStorage/cookies between launches (pywebview defaults to private
        # mode, which wipes storage on every restart and loses UI state like backgrounds)
        os.makedirs(storage_dir, exist_ok=True)
        webview.start(private_mode=False, storage_path=storage_dir)
    except Exception as e:
        # Fallback to browser if the native window (e.g. WebView2) is not available
        print(f"[Desktop Launcher] Native window unavailable ({e}). Opening in default browser...")
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down AI Book Narrator Studio...")


def main() -> None:
    from src.config import APP_DATA_DIR
    _redirect_missing_streams(os.path.join(APP_DATA_DIR, "logs"))

    port, already_running = _choose_port()
    server_thread = None
    if not already_running:
        server_thread = threading.Thread(target=_start_server, args=(port,), daemon=True)
        server_thread.start()
        if not _wait_for_server(port, server_thread):
            _show_fatal_error(
                "The narration server could not start.\n\n"
                f"Details were written to:\n{os.path.join(APP_DATA_DIR, 'logs', 'app.log')}"
            )
            sys.exit(1)

    _open_window(f"http://{HOST}:{port}", os.path.join(APP_DATA_DIR, "outputs", "webview_storage"))


if __name__ == "__main__":
    multiprocessing.freeze_support()
    try:
        main()
    except Exception:
        _show_fatal_error(f"{APP_TITLE} hit an unexpected error:\n\n{traceback.format_exc()}")
        sys.exit(1)
