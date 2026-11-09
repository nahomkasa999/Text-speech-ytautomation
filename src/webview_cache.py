"""
Make the app window load the web UI of the version that is actually running.

The window's browser (WebView2 on Windows) keeps a disk cache of the UI files
in <user data>/outputs/webview_storage. Versions up to 1.0.16 served them
without "Cache-Control: no-cache", so the browser may keep using old cached
JS/HTML without asking the server, even after an update installed new ones.
The result was the old update dialog talking to the new updater.

So once per version, before the window opens (the server is imported first),
delete only the browser's HTTP/code caches. Settings kept in localStorage,
IndexedDB and cookies are left alone.
"""

import os
import shutil
import sys

CACHE_DIR_NAMES = {"Cache", "Code Cache", "GPUCache", "ShaderCache", "GrShaderCache", "DawnCache"}
MARKER = "ui-cache-version.txt"
MAX_DEPTH = 4


def clear_if_version_changed(storage_dir: str, version: str) -> bool:
    """Returns True if the caches were cleared (or there were none) for this version."""
    marker = os.path.join(storage_dir, MARKER)
    try:
        with open(marker, encoding="utf-8") as f:
            if f.read().strip() == version:
                return False
    except OSError:
        pass
    if not os.path.isdir(storage_dir):
        return False  # first launch ever: nothing cached yet
    ok = True
    base_depth = storage_dir.rstrip(os.sep).count(os.sep)
    for dirpath, dirnames, _files in os.walk(storage_dir):
        if dirpath.count(os.sep) - base_depth >= MAX_DEPTH:
            dirnames[:] = []
            continue
        for name in list(dirnames):
            if name in CACHE_DIR_NAMES:
                path = os.path.join(dirpath, name)
                shutil.rmtree(path, ignore_errors=True)
                ok = ok and not os.path.exists(path)
                dirnames.remove(name)
    if ok:  # if a file was still locked, try again on the next start
        try:
            with open(marker, "w", encoding="utf-8") as f:
                f.write(version)
        except OSError:
            pass
    return ok


def clear_for_running_version() -> None:
    if not getattr(sys, "frozen", False):
        return
    try:
        from src.config import APP_DATA_DIR
        from src.version import current_info
        clear_if_version_changed(os.path.join(APP_DATA_DIR, "outputs", "webview_storage"),
                                 str(current_info()["version"]))
    except Exception:
        pass  # never block startup over a cache
