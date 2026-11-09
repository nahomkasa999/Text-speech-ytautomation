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
installed in place. On Windows the app then downloads the full installer
itself (size + SHA-256 verified), runs it silently and quits; the installer
reopens the app. Elsewhere, or if the manifest has no installer file, the UI
falls back to the GitHub releases page.

Even better, when the manifest has an "engine_patch" built against the engine
this install already has, only the files that changed (usually far less than
the 400 MB installer) are downloaded; a small helper script swaps them in
after the app closes and reopens it.
"""

import hashlib
import json
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
INSTALLER_ARGS = ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"]

_lock = threading.Lock()
_manifest_cache = {"at": 0.0, "data": None, "error": None}
_download = {"state": "idle", "progress": 0.0, "error": None, "version": None,
             "kind": "package", "done": 0, "total": 0}


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


def has_installer_fields(manifest: Optional[dict]) -> bool:
    """True when the manifest points at a directly downloadable, checkable installer."""
    m = manifest or {}
    return bool(m.get("installer_url") and m.get("installer_sha256") and int(m.get("installer_size") or 0) > 0
                and m.get("installer_url") != INSTALLER_PAGE)


def engine_patch_for_this_install(manifest: Optional[dict]) -> Optional[dict]:
    """The manifest's engine patch if it applies to the engine installed here."""
    p = (manifest or {}).get("engine_patch") or {}
    if not (sys.platform == "win32" and p.get("url") and p.get("sha256") and int(p.get("size") or 0) > 0):
        return None
    base = base_info().get("engine")
    return p if base and p.get("base_engine") == base else None


def can_install_in_app(manifest: Optional[dict]) -> bool:
    return bool(engine_patch_for_this_install(manifest)) or (sys.platform == "win32" and has_installer_fields(manifest))


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
        # Page link for the manual fallback (never the direct .exe).
        "installer_url": INSTALLER_PAGE,
        "installer_in_app": bool(available and needs_installer and can_install_in_app(manifest)),
        "installer_size": int((manifest or {}).get("installer_size") or 0),
        # What an engine update will actually download (patch if it applies, else installer).
        "download_size": (int((engine_patch_for_this_install(manifest) or {}).get("size") or 0)
                          or int((manifest or {}).get("installer_size") or 0)) if needs_installer else int((manifest or {}).get("size") or 0),
        "engine_patch": bool(needs_installer and engine_patch_for_this_install(manifest)),
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


def _stream_to_file(url: str, part: str, expected_size: int) -> tuple:
    """Stream `url` to `part`, updating _download progress. Returns (bytes, sha256 hex)."""
    digest = hashlib.sha256()
    done = 0
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            total = expected_size or int(resp.headers.get("content-length") or 0)
            _download["total"] = total
            with open(part, "wb") as f:
                for chunk in resp.iter_bytes(64 * 1024):
                    f.write(chunk)
                    digest.update(chunk)
                    done += len(chunk)
                    _download["done"] = done
                    if total:
                        _download["progress"] = min(0.99, done / total)
    return done, digest.hexdigest()


def _launch_installer(path: str) -> None:
    """Run the verified installer silently, then quit so no files are locked.

    KNOWN TRADE-OFF: unlike the small in-app updates, a full installer replace
    has NO automatic rollback. If the new version fails to start after the silent
    install, the user must reinstall the previous version from GitHub.
    The installer (CloseApplications=yes) also closes us as a backstop, and its
    [Run] entry reopens the app after a silent install.
    """
    import subprocess
    kwargs = {"close_fds": True}
    if sys.platform == "win32":
        kwargs["creationflags"] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen([path] + INSTALLER_ARGS, **kwargs)
    os._exit(0)


def build_patch_script(pid: int, staging: str, install_dir: str, exe_name: str, remove: list, cleanup: list) -> str:
    """cmd script: wait for the app to exit, copy the patched files over the
    install, delete removed files, reopen the app. No rollback (see _launch_installer)."""
    lines = [
        "@echo off",
        ":wait",
        f'tasklist /FI "PID eq {pid}" 2>NUL | find " {pid} " >NUL',
        "if not errorlevel 1 (",
        "  ping -n 2 127.0.0.1 >NUL",
        "  goto wait",
        ")",
        f'robocopy "{staging}\\files" "{install_dir}" /E /IS /IT /R:15 /W:1 /NFL /NDL /NJH /NJS /NP >NUL',
        "if errorlevel 8 echo engine patch copy failed >> \"%~dp0engine-update.log\"",
    ]
    for rel in remove:
        lines.append(f'del /F /Q "{os.path.join(install_dir, *rel.split("/"))}" 2>NUL')
    lines.append(f'start "" "{os.path.join(install_dir, exe_name)}"')
    for path in cleanup:
        lines.append(f'rmdir /S /Q "{path}" 2>NUL' if os.path.isdir(path) else f'del /F /Q "{path}" 2>NUL')
    lines.append('(goto) 2>NUL & del "%~f0"')
    return "\r\n".join(lines) + "\r\n"


def _launch_patch_helper(staging: str, patch_zip: str, remove: list) -> None:
    import subprocess
    install_dir = os.path.dirname(sys.executable)
    root = app_boot.app_root()
    script = os.path.join(root, "apply-engine-patch.cmd")
    with open(script, "w", encoding="utf-8", newline="") as f:
        f.write(build_patch_script(os.getpid(), staging, install_dir, os.path.basename(sys.executable),
                                   remove, [staging, patch_zip]))
    # CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(["cmd.exe", "/c", script], close_fds=True, creationflags=0x08000000 | 0x00000200)
    os._exit(0)


def _run_engine_patch(manifest: dict) -> None:
    patch = engine_patch_for_this_install(manifest) or {}
    version = str(manifest["version"])
    root = app_boot.app_root()
    part = os.path.join(root, f"EnginePatch-{version}.zip")
    staging = os.path.join(root, f"engine-staging-{version}")
    ok = False
    try:
        os.makedirs(root, exist_ok=True)
        _download.update(state="downloading", progress=0.0, error=None, version=version,
                         kind="engine_patch", done=0, total=0)
        size = int(patch["size"])
        if shutil.disk_usage(root).free < 3 * size:
            raise RuntimeError(f"Not enough free disk space. Free up at least {(3 * size) // (1024 * 1024)} MB and try again.")
        shutil.rmtree(staging, ignore_errors=True)
        done, sha = _stream_to_file(patch["url"], part, size)
        _download.update(state="verifying", progress=0.99)
        if done != size:
            raise RuntimeError("The download was incomplete. Please try again.")
        if sha.lower() != str(patch["sha256"]).lower():
            raise RuntimeError("The download failed its integrity check. Please try again.")
        with zipfile.ZipFile(part) as zf:
            info = json.loads(zf.read("patch.json"))
            if str(info.get("version")) != version or info.get("base_engine") != base_info().get("engine"):
                raise RuntimeError("The update package does not match this installation.")
            _safe_extract(zf, staging)
        remove = [r for r in info.get("remove", []) if isinstance(r, str) and r and not r.startswith(("/", "\\"))
                  and ".." not in r.replace("\\", "/").split("/") and ":" not in r]
        ok = True
        _download.update(state="installing", progress=1.0)
        time.sleep(1.0)
        _launch_patch_helper(staging, part, remove)
    except Exception as exc:
        ok = False
        _download.update(state="error", error=str(exc))
    finally:
        if not ok:
            shutil.rmtree(staging, ignore_errors=True)
            try:
                os.remove(part)
            except OSError:
                pass


def _run_installer_download(manifest: dict) -> None:
    version = str(manifest["version"])
    root = app_boot.app_root()
    name = f"BookNarrator-Setup-{version}.exe"
    final = os.path.join(root, name)
    part = final + ".part"
    ok = False
    try:
        os.makedirs(root, exist_ok=True)
        _download.update(state="downloading", progress=0.0, error=None, version=version,
                         kind="installer", done=0, total=0)
        expected_size = int(manifest.get("installer_size") or 0)
        if shutil.disk_usage(root).free < 2 * expected_size:
            need = (2 * expected_size) // (1024 * 1024)
            raise RuntimeError(f"Not enough free disk space. Free up at least {need} MB and try again.")
        for old in os.listdir(root):  # leftovers from earlier attempts
            if old.startswith("BookNarrator-Setup-") and (old.endswith(".exe") or old.endswith(".part")):
                try:
                    os.remove(os.path.join(root, old))
                except OSError:
                    pass

        done, sha = _stream_to_file(manifest["installer_url"], part, expected_size)

        _download.update(state="verifying", progress=0.99)
        if done != expected_size:
            raise RuntimeError("The download was incomplete. Please try again.")
        if sha.lower() != str(manifest.get("installer_sha256", "")).lower():
            raise RuntimeError("The download failed its integrity check. Please try again.")
        os.replace(part, final)
        ok = True
        _download.update(state="installing", progress=1.0)
        time.sleep(1.0)  # let the UI show "Installing…"
        _launch_installer(final)
    except Exception as exc:
        ok = False  # also covers a failed launch: do not keep the file
        _download.update(state="error", error=str(exc))
    finally:
        if not ok:
            for p in (part, final):
                try:
                    os.remove(p)
                except OSError:
                    pass


def _run_download(manifest: dict) -> None:
    version = str(manifest["version"])
    root = app_boot.app_root()
    os.makedirs(root, exist_ok=True)
    part = os.path.join(root, f"{version}.zip.part")
    staging = os.path.join(root, f"{version}.staging")
    final = os.path.join(root, version)
    try:
        _download.update(state="downloading", progress=0.0, error=None, version=version,
                         kind="package", done=0, total=0)
        expected_size = int(manifest.get("size") or 0)
        done, sha = _stream_to_file(manifest["package_url"], part, expected_size)

        _download.update(state="verifying", progress=0.99)
        if expected_size and done != expected_size:
            raise RuntimeError("The download was incomplete. Please try again.")
        if sha.lower() != str(manifest.get("sha256", "")).lower():
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
        if _download["state"] in ("downloading", "verifying", "installing"):
            return {"ok": True}
        info = status(force_check=True)
        if not info["update_available"]:
            return {"ok": False, "error": "You already have the latest version."}
        manifest = _manifest_cache["data"]
        if info["needs_installer"]:
            if not can_install_in_app(manifest):
                # Fallback: no installer file in the manifest (or not Windows).
                return {"ok": False, "error": "This update needs the full installer.", "installer_url": info["installer_url"]}
            runner = _run_engine_patch if engine_patch_for_this_install(manifest) else _run_installer_download
            threading.Thread(target=runner, args=(manifest,), daemon=True).start()
        else:
            threading.Thread(target=_run_download, args=(manifest,), daemon=True).start()
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
