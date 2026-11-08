"""
Startup selection of the app code version (part of the installed .exe).

The installer ships a "base": Python runtime, libraries, the Kokoro voice
model and a copy of the app code (src/ + static/). Small in-app updates only
replace the app code: they are unpacked to <user data>/app/<version>/ and,
when valid, put first on sys.path so Python and the web UI load them instead
of the copy inside the .exe.

State lives in <user data>/app/state.json:
  active   - version currently in use (None = the copy inside the .exe)
  pending  - version downloaded by the updater, to try on next start
  trying   - version being tried right now (set until the UI confirms it)
  previous - version to fall back to
  failed   - versions that failed to start (never tried again)

Rollback: a version that fails to start, or never confirms within a minute,
is marked failed and the app restarts on the previous working version.
This file is part of the .exe and is never replaced by updates, so keep it small
and dependency-free.
"""

import json
import os
import shutil
import sys

STATE_FILE = "state.json"


def user_data_dir() -> str:
    """Same location rules as src/config.py (kept in sync by hand)."""
    exe_dir = os.path.dirname(sys.executable)
    if os.path.isdir(os.path.join(exe_dir, "outputs")) and os.access(exe_dir, os.W_OK):
        return exe_dir
    if sys.platform == "win32":
        root = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
    elif sys.platform == "darwin":
        root = os.path.expanduser("~/Library/Application Support")
    else:
        root = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(root, "BookNarrator")


def bundle_dir() -> str:
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def app_root() -> str:
    return os.path.join(user_data_dir(), "app")


def read_json(path: str, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json_atomic(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def load_state() -> dict:
    state = read_json(os.path.join(app_root(), STATE_FILE), {})
    state.setdefault("failed", [])
    for key in ("active", "pending", "trying", "previous"):
        state.setdefault(key, None)
    return state


def save_state(state: dict) -> None:
    write_json_atomic(os.path.join(app_root(), STATE_FILE), state)


def base_version_info() -> dict:
    """version.json written into the .exe at build time ({} for local builds)."""
    return read_json(os.path.join(bundle_dir(), "version.json"), {})


def overlay_dir(version: str) -> str:
    return os.path.join(app_root(), version)


def overlay_is_usable(version: str, base: dict) -> bool:
    """An update may only run on the same engine (libraries) it was built for,
    and only if it is newer than the code inside the .exe."""
    if not version:
        return False
    path = overlay_dir(version)
    info = read_json(os.path.join(path, "version.json"), {})
    if not (os.path.isfile(os.path.join(path, "src", "server.py"))
            and os.path.isfile(os.path.join(path, "static", "index.html"))):
        return False
    if not base.get("engine") or info.get("engine") != base.get("engine"):
        return False
    return int(info.get("build", 0)) > int(base.get("build", 0))


def select_app_code() -> dict:
    """Decide which app code to run and activate it. Call before importing src.

    Returns {"version", "dir", "trying"} describing what was selected
    ("dir" is None for the copy inside the .exe).
    """
    if not getattr(sys, "frozen", False):
        return {"version": None, "dir": None, "trying": False}

    base = base_version_info()
    state = load_state()

    # A version that was being tried but never confirmed failed last time.
    if state["trying"]:
        state["failed"].append(state["trying"])
        state["trying"] = None

    candidate, trying = None, False
    if state["pending"] and state["pending"] not in state["failed"] and overlay_is_usable(state["pending"], base):
        candidate, trying = state["pending"], True
    elif state["active"] and state["active"] not in state["failed"] and overlay_is_usable(state["active"], base):
        candidate = state["active"]
    elif state["previous"] and state["previous"] not in state["failed"] and overlay_is_usable(state["previous"], base):
        candidate = state["previous"]
        state["active"] = candidate
    else:
        state["active"] = None  # the copy inside the .exe

    state["pending"] = None
    if trying:
        state["trying"] = candidate
    save_state(state)
    cleanup_old_versions(state)

    if candidate:
        path = overlay_dir(candidate)
        sys.path.insert(0, path)
        os.environ["BOOKNARRATOR_APP_DIR"] = path
        return {"version": candidate, "dir": path, "trying": trying}
    return {"version": None, "dir": None, "trying": False}


def mark_current_failed() -> None:
    """The version being tried could not start: never use it again."""
    state = load_state()
    bad = state.get("trying") or state.get("active")
    if bad:
        if bad not in state["failed"]:
            state["failed"].append(bad)
        if state.get("active") == bad:
            state["active"] = state.get("previous")
        state["trying"] = None
        save_state(state)


def is_still_trying(version: str) -> bool:
    return load_state().get("trying") == version


def cleanup_old_versions(state: dict) -> None:
    """Keep only versions that may still be used; delete the rest."""
    keep = {state.get(k) for k in ("active", "pending", "trying", "previous")} - {None}
    root = app_root()
    if not os.path.isdir(root):
        return
    for name in os.listdir(root):
        path = os.path.join(root, name)
        if os.path.isdir(path) and name not in keep:
            shutil.rmtree(path, ignore_errors=True)


def wait_for_pid_exit(pid: int, timeout: float = 30.0) -> None:
    """Used after a restart: wait for the old app process to close first."""
    import time
    deadline = time.time() + timeout
    if sys.platform == "win32":
        try:
            import ctypes
            SYNCHRONIZE = 0x00100000
            handle = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, int(pid))
            if handle:
                ctypes.windll.kernel32.WaitForSingleObject(handle, int(timeout * 1000))
                ctypes.windll.kernel32.CloseHandle(handle)
        except Exception:
            time.sleep(2)
        return
    while time.time() < deadline:
        try:
            os.kill(int(pid), 0)
        except OSError:
            return
        time.sleep(0.2)


def relaunch_and_exit() -> None:
    """Start a fresh copy of the app (it waits for this one to close), then exit."""
    import subprocess
    args = [sys.executable] if getattr(sys, "frozen", False) else [sys.executable, os.path.abspath(sys.argv[0])]
    args += ["--restart-after", str(os.getpid())]
    kwargs = {"close_fds": True}
    if sys.platform == "win32":
        kwargs["creationflags"] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(args, **kwargs)
    os._exit(0)
