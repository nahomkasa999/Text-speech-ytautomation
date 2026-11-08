"""
In-app updater: small updates that replace only the app code (a few MB),
never the Python engine or the voice model.

Every push to main publishes update.json + app-<version>.zip to the GitHub
release tagged "updates" (see .github/workflows/build.yml). This module:
  - checks that manifest (on launch, every few hours, or from Settings),
  - downloads the package, verifies its size and SHA-256 checksum,
  - unpacks it to <user data>/app/<version>/ and marks it "pending",
  - restarts the app; app_boot.py then runs the new version and rolls back
    automatically if it fails to start.
If an update needs newer libraries (a different "engine"), it cannot be
installed in place and the UI points to the full installer instead.
"""

import hashlib
import os
import shutil
import sys
import threading
import time
import zipfile
from typing import Optional

import httpx

import app_boot
from src.version import base_info, current_info

REPO = "nahomkasa999/Text-speech-ytautomation"
MANIFEST_URL = os.environ.get(
    "BOOKNARRATOR_UPDATE_URL",
    f"https://github.com/{REPO}/releases/download/updates/update.json",
)
INSTALLER_PAGE = f"https://github.com/{REPO}/releases/latest"
CHECK_CACHE_SECONDS = 600

_lock = threading.Lock()
_manifest_cache = {"at": 0.0, "data": None, "error": None}
_download = {"state": "idle", "progress": 0.0, "error": None, "version": None}


def can_self_update() -> bool:
    return bool(getattr(sys, "frozen", False) and base_info().get("engine"))


def fetch_manifest(force: bool = False) -> Optional[dict]:
    now = time.time()
    if not force and _manifest_cache["data"] and now - _manifest_cache["at"] < CHECK_CACHE_SECONDS:
        return _manifest_cache["data"]
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            resp = client.get(MANIFEST_URL, headers={"Cache-Control": "no-cache"})
        if resp.status_code == 404:
            data, error = None, None  # nothing published yet
        else:
            resp.raise_for_status()
            data, error = resp.json(), None
    except Exception as exc:  # offline, GitHub down, ...
        data, error = None, f"Could not reach the update server ({exc.__class__.__name__})."
    _manifest_cache.update(at=now, data=data, error=error)
    return data


def status(force_check: bool = False) -> dict:
    current = current_info()
    manifest = fetch_manifest(force_check)
    available = bool(manifest and int(manifest.get("build", 0)) > current["build"])
    # A version that already failed to start here is not offered again;
    # the next published version will be.
    failed_before = bool(available and str(manifest.get("version")) in app_boot.load_state().get("failed", []))
    if failed_before:
        available = False
    base_engine = base_info().get("engine")
    needs_installer = bool(available and manifest.get("engine") != base_engine)
    return {
        "current": current,
        "can_self_update": can_self_update(),
        "update_available": available,
        "needs_installer": needs_installer,
        "installer_url": (manifest or {}).get("installer_url") or INSTALLER_PAGE,
        "latest": {
            "version": manifest.get("version"),
            "build": manifest.get("build"),
            "notes": manifest.get("notes", ""),
            "size": manifest.get("size", 0),
            "published_at": manifest.get("published_at"),
        } if manifest else None,
        "check_error": _manifest_cache["error"],
        "skipped_failed_version": failed_before,
        "download": dict(_download),
    }


def _safe_extract(zf: zipfile.ZipFile, target: str) -> None:
    root = os.path.realpath(target)
    for member in zf.infolist():
        dest = os.path.realpath(os.path.join(target, member.filename))
        if not (dest == root or dest.startswith(root + os.sep)):
            raise RuntimeError(f"Unsafe path in update package: {member.filename}")
    zf.extractall(target)


def _run_download(manifest: dict) -> None:
    version = str(manifest["version"])
    root = app_boot.app_root()
    os.makedirs(root, exist_ok=True)
    part = os.path.join(root, f"{version}.zip.part")
    staging = os.path.join(root, f"{version}.staging")
    final = os.path.join(root, version)
    try:
        _download.update(state="downloading", progress=0.0, error=None, version=version)
        expected_size = int(manifest.get("size") or 0)
        digest = hashlib.sha256()
        done = 0
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            with client.stream("GET", manifest["package_url"]) as resp:
                resp.raise_for_status()
                total = expected_size or int(resp.headers.get("content-length") or 0)
                with open(part, "wb") as f:
                    for chunk in resp.iter_bytes(64 * 1024):
                        f.write(chunk)
                        digest.update(chunk)
                        done += len(chunk)
                        if total:
                            _download["progress"] = min(0.99, done / total)

        _download.update(state="verifying", progress=0.99)
        if expected_size and done != expected_size:
            raise RuntimeError("The download was incomplete. Please try again.")
        if digest.hexdigest().lower() != str(manifest.get("sha256", "")).lower():
            raise RuntimeError("The download failed its integrity check. Please try again.")

        shutil.rmtree(staging, ignore_errors=True)
        with zipfile.ZipFile(part) as zf:
            _safe_extract(zf, staging)
        info = app_boot.read_json(os.path.join(staging, "version.json"), {})
        if str(info.get("version")) != version or info.get("engine") != base_info().get("engine"):
            raise RuntimeError("The update package does not match this installation.")
        if not (os.path.isfile(os.path.join(staging, "src", "server.py"))
                and os.path.isfile(os.path.join(staging, "static", "index.html"))):
            raise RuntimeError("The update package is incomplete.")

        shutil.rmtree(final, ignore_errors=True)
        os.replace(staging, final)
        state = app_boot.load_state()
        state["pending"] = version
        if version in state["failed"]:
            state["failed"].remove(version)
        app_boot.save_state(state)
        _download.update(state="ready", progress=1.0)
    except Exception as exc:
        shutil.rmtree(staging, ignore_errors=True)
        _download.update(state="error", error=str(exc))
    finally:
        try:
            os.remove(part)
        except OSError:
            pass


def start_download() -> dict:
    if not can_self_update():
        return {"ok": False, "error": "Updates can only be installed in the desktop app."}
    with _lock:
        if _download["state"] in ("downloading", "verifying"):
            return {"ok": True}
        info = status(force_check=True)
        if not info["update_available"]:
            return {"ok": False, "error": "You already have the latest version."}
        if info["needs_installer"]:
            return {"ok": False, "error": "This update needs the full installer.", "installer_url": info["installer_url"]}
        threading.Thread(target=_run_download, args=(_manifest_cache["data"],), daemon=True).start()
    return {"ok": True}


def restart_soon() -> None:
    """Restart into the downloaded version (after the HTTP response is sent)."""
    def _go():
        time.sleep(0.6)
        app_boot.relaunch_and_exit()
    threading.Thread(target=_go, daemon=True).start()


def confirm_running_version() -> None:
    """Called by the UI once it has loaded: the new version works, keep it."""
    if not getattr(sys, "frozen", False):
        return
    version = current_info()["version"]
    state = app_boot.load_state()
    if state.get("trying") and state["trying"] == version:
        state["previous"] = state.get("active")
        state["active"] = version
        state["trying"] = None
        app_boot.save_state(state)
