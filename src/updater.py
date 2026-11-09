"""
In-app updater. Everything downloads and installs inside the app, with a
progress bar; the user is never sent to a web page.

Every push to main publishes update.json + small app packages to the GitHub
release tagged "updates" (see .github/workflows/build.yml).

Two kinds of update:
  - App code (src/ + static/, about 0.5 MB): downloaded, verified (size +
    SHA-256), unpacked to <user data>/app/<version>/ and marked "pending";
    the app restarts and app_boot.py runs it (with automatic rollback).
  - Engine (the Python runtime, libraries, FFmpeg: everything frozen into the
    app folder). The app compares its own files with the new engine's file
    list and downloads ONLY the files that differ, straight out of the engine
    zip with HTTP range requests. The voice model is never part of it (it does
    not change), so an engine update is usually a few tens of MB. A helper
    script copies the files in after the app closes and reopens it.
    Fallbacks, still in-app: the portable .exe is replaced as a whole; an
    install without an engine file list downloads the full Setup.exe.

update.json format 2 (older apps only read the top-level fields):
  latest          {version, build, notes, published_at} of the newest release
  engine_target   engine of the newest release
  packages        {engine: {version, build, url, size, sha256}}: app code that
                  runs on that engine. Includes a "bridge" for the v1.0.16
                  engine, so 1.0.16 installs get this updater through their own
                  small-update path, then update their engine from here.
  engine_bundle   {windows|linux: {version, url, size, sha256, files_url, files_sha256}}
  top level       version/build/engine/package_url/...: the bridge package, for
                  app code that predates format 2.
"""

import hashlib
import io
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
MODELS_PREFIX = "_internal/models/"  # the voice model: never part of an engine update
RANGE_CHUNK = 256 << 10
RANGE_CHUNK_MAX = 8 << 20
FULL_DOWNLOAD_RATIO = 0.6  # needing more than this share of the zip: just download all of it

_lock = threading.Lock()
_manifest_cache = {"at": 0.0, "data": None, "error": None}
_download = {"state": "idle", "progress": 0.0, "error": None, "version": None,
             "kind": "package", "done": 0, "total": 0}


# ---------------------------------------------------------------- manifest

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


def read_channel(manifest: Optional[dict]) -> dict:
    """Format 2 view of any manifest (an old one is read as 'latest = top level')."""
    m = manifest or {}
    if "engine_target" in m:
        latest = dict(m.get("latest") or {})
        packages = dict(m.get("packages") or {})
        target = m.get("engine_target")
    else:
        latest = {k: m.get(k) for k in ("version", "build", "notes", "published_at")}
        target = m.get("engine")
        packages = {}
        if m.get("package_url") and target:
            packages[target] = {"version": m.get("version"), "build": m.get("build"), "url": m["package_url"],
                                "size": m.get("size", 0), "sha256": m.get("sha256")}
    return {"latest": latest, "target": target, "packages": packages}


def platform_key() -> Optional[str]:
    if sys.platform == "win32":
        return "windows"
    if sys.platform.startswith("linux"):
        return "linux"
    return None


def is_folder_install() -> bool:
    """The normal install (an app folder with _internal/), not the one-file portable exe."""
    return bool(getattr(sys, "frozen", False)
                and os.path.isdir(os.path.join(os.path.dirname(sys.executable), "_internal")))


def has_installer_fields(manifest: Optional[dict]) -> bool:
    """True when the manifest points at a directly downloadable, checkable installer."""
    m = manifest or {}
    return bool(m.get("installer_url") and m.get("installer_sha256") and int(m.get("installer_size") or 0) > 0
                and m.get("installer_url") != INSTALLER_PAGE)


def engine_bundle_for_this_install(manifest: Optional[dict]) -> Optional[dict]:
    b = ((manifest or {}).get("engine_bundle") or {}).get(platform_key() or "") or {}
    if b.get("url") and b.get("files_url") and b.get("files_sha256") and int(b.get("size") or 0) > 0:
        return b
    return None


def engine_update_route(manifest: Optional[dict]) -> Optional[dict]:
    """How this install gets the new engine in-app: {kind, size}, or None if it can't."""
    m = manifest or {}
    bundle = engine_bundle_for_this_install(m)
    if bundle and is_folder_install():
        return {"kind": "engine_sync", "size": int(bundle["size"]), "size_is_max": True}
    if sys.platform == "win32" and not is_folder_install() and m.get("portable_url") and m.get("portable_sha256") \
            and int(m.get("portable_size") or 0) > 0:
        return {"kind": "portable", "size": int(m["portable_size"])}
    if sys.platform == "win32" and has_installer_fields(m):
        return {"kind": "installer", "size": int(m["installer_size"])}
    return None


def can_install_in_app(manifest: Optional[dict]) -> bool:
    return engine_update_route(manifest) is not None


def plan_update(manifest: Optional[dict]) -> dict:
    """What to do next on this install: a small app-code package first when one
    exists for this engine, otherwise the engine update (if the engine differs)."""
    current = current_info()
    base_engine = base_info().get("engine")
    ch = read_channel(manifest)
    failed = app_boot.load_state().get("failed", []) if getattr(sys, "frozen", False) else []
    pkg = ch["packages"].get(base_engine) if base_engine else None
    if pkg and not pkg.get("build"):
        pkg = None
    skipped = bool(pkg and int(pkg["build"]) > current["build"] and str(pkg.get("version")) in failed)
    if pkg and (int(pkg["build"]) <= current["build"] or skipped):
        pkg = None
    engine_needed = bool(manifest and ch["target"] and base_engine and ch["target"] != base_engine)
    if pkg:
        return {"kind": "package", "package": pkg, "size": int(pkg.get("size") or 0), "needs_engine": False,
                "available": True, "skipped": skipped, "channel": ch}
    if engine_needed:
        route = engine_update_route(manifest)
        return {"kind": route["kind"] if route else None, "package": None, "size": route["size"] if route else 0,
                "size_is_max": bool(route and route.get("size_is_max")), "needs_engine": True,
                "available": True, "skipped": skipped, "channel": ch}
    if not base_engine and manifest:  # running from source: show what is out there
        latest_build = int(ch["latest"].get("build") or 0)
        return {"kind": None, "package": None, "size": 0, "needs_engine": False,
                "available": latest_build > current["build"], "skipped": False, "channel": ch}
    return {"kind": None, "package": None, "size": 0, "needs_engine": False, "available": False,
            "skipped": skipped, "channel": ch}


def status(force_check: bool = False) -> dict:
    current = current_info()
    manifest = fetch_manifest(force_check)
    plan = plan_update(manifest)
    latest = plan["channel"]["latest"]
    offered = plan["package"] or latest
    return {
        "current": current,
        "can_self_update": can_self_update(),
        "update_available": plan["available"],
        "kind": plan["kind"],
        "needs_engine": plan["needs_engine"],
        "in_app": bool(plan["kind"]),
        # For an older UI that may still be on screen (a cached 1.0.16 window):
        # it only knows "needs_installer" (shows a link) or not (shows "Update now",
        # which calls start_download, so the update still happens in-app).
        "needs_installer": bool(plan["needs_engine"] and not plan["kind"]),
        "installer_in_app": bool(plan["needs_engine"] and plan["kind"]),
        "installer_url": INSTALLER_PAGE,
        "download_size": plan["size"],
        "size_is_max": bool(plan.get("size_is_max")),
        "latest": {
            "version": (offered or {}).get("version"),
            "build": (offered or {}).get("build"),
            "notes": latest.get("notes", ""),
            "size": plan["size"],
            "published_at": latest.get("published_at"),
        } if manifest else None,
        "check_error": _manifest_cache["error"],
        "skipped_failed_version": plan["skipped"],
        "download": dict(_download),
    }


# ---------------------------------------------------------------- helpers

def _clean_env() -> dict:
    """Environment for the reopened app: never inherit the old overlay choice."""
    env = dict(os.environ)
    env.pop("BOOKNARRATOR_APP_DIR", None)
    return env


def _continue_after_restart() -> None:
    """After an engine update the app may still be one small update behind;
    ask the next launch to fetch it by itself."""
    try:
        state = app_boot.load_state()
        state["continue_update"] = True
        app_boot.save_state(state)
    except Exception:
        pass


def _safe_rel(rel: str) -> bool:
    parts = rel.replace("\\", "/").split("/")
    return bool(rel) and not rel.startswith(("/", "\\")) and ".." not in parts and ":" not in rel


def _safe_extract(zf: zipfile.ZipFile, target: str) -> None:
    root = os.path.realpath(target)
    for member in zf.infolist():
        dest = os.path.realpath(os.path.join(target, member.filename))
        if not (dest == root or dest.startswith(root + os.sep)):
            raise RuntimeError(f"Unsafe path in update package: {member.filename}")
    zf.extractall(target)


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


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


def _detached_kwargs() -> dict:
    kwargs = {"close_fds": True, "env": _clean_env()}
    if sys.platform == "win32":
        kwargs["creationflags"] = 0x08000000 | 0x00000200  # CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    else:
        import subprocess
        kwargs.update(start_new_session=True, stdin=subprocess.DEVNULL,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return kwargs


def _run_helper_script(name: str, text: str) -> None:
    """Write a helper script next to the user data, start it detached, quit."""
    import subprocess
    script = os.path.join(app_boot.app_root(), name)
    with open(script, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    _continue_after_restart()
    if sys.platform == "win32":
        subprocess.Popen(["cmd.exe", "/c", script], **_detached_kwargs())
    else:
        subprocess.Popen(["/bin/sh", script], **_detached_kwargs())
    os._exit(0)


def _win_wait_lines(pid: int) -> list:
    return [
        "@echo off",
        ":wait",
        f'tasklist /FI "PID eq {pid}" 2>NUL | find " {pid} " >NUL',
        "if not errorlevel 1 (",
        "  ping -n 2 127.0.0.1 >NUL",
        "  goto wait",
        ")",
    ]


def build_patch_script(pid: int, staging: str, install_dir: str, exe_name: str, remove: list, cleanup: list) -> str:
    """cmd script: wait for the app to exit, copy <staging>\\files over the
    install, delete removed files, reopen the app. No rollback (see _launch_installer)."""
    lines = _win_wait_lines(pid) + [
        f'robocopy "{staging}\\files" "{install_dir}" /E /IS /IT /R:15 /W:1 /NFL /NDL /NJH /NJS /NP >NUL',
        "if errorlevel 8 echo engine update copy failed >> \"%~dp0engine-update.log\"",
    ]
    for rel in remove:
        lines.append(f'del /F /Q "{os.path.join(install_dir, *rel.split("/"))}" 2>NUL')
    lines.append(f'start "" "{os.path.join(install_dir, exe_name)}"')
    for path in cleanup:
        lines.append(f'rmdir /S /Q "{path}" 2>NUL' if os.path.isdir(path) else f'del /F /Q "{path}" 2>NUL')
    lines.append('(goto) 2>NUL & del "%~f0"')
    return "\r\n".join(lines) + "\r\n"


def build_linux_script(pid: int, source: str, install_dir: str, exe_name: str, cleanup: list,
                       remove: Optional[list] = None) -> str:
    """sh script: wait for the app to exit, copy `source` over the install
    (user files in it are kept), delete removed files, reopen the app."""
    import shlex
    q = shlex.quote
    exe = os.path.join(install_dir, exe_name)
    lines = [
        "#!/bin/sh",
        f"while kill -0 {int(pid)} 2>/dev/null; do sleep 0.5; done",
        f"cp -a {q(source)}/. {q(install_dir)}/ || echo 'engine update copy failed' >> \"$(dirname \"$0\")/engine-update.log\"",
    ]
    lines += [f"rm -f {q(os.path.join(install_dir, *rel.split('/')))}" for rel in (remove or [])]
    lines.append(f"chmod +x {q(exe)} 2>/dev/null")
    lines += [f"rm -rf {q(p)}" for p in cleanup]
    lines += [
        f"cd {q(install_dir)} && nohup {q(exe)} >/dev/null 2>&1 &",
        'rm -f "$0"',
    ]
    return "\n".join(lines) + "\n"


def build_portable_script(pid: int, new_exe: str, exe_path: str) -> str:
    """cmd script: wait for the portable exe to exit, replace it, reopen it."""
    lines = _win_wait_lines(pid) + [
        "set n=0",
        ":copy",
        f'copy /Y "{new_exe}" "{exe_path}" >NUL 2>NUL',
        "if errorlevel 1 (",
        "  set /a n+=1",
        "  if %n% LSS 20 ( ping -n 2 127.0.0.1 >NUL & goto copy )",
        "  echo portable update copy failed >> \"%~dp0engine-update.log\"",
        ")",
        f'start "" "{exe_path}"',
        f'del /F /Q "{new_exe}" 2>NUL',
        '(goto) 2>NUL & del "%~f0"',
    ]
    return "\r\n".join(lines) + "\r\n"


# ---------------------------------------------------------------- app code package

def _run_download(pkg: dict) -> None:
    version = str(pkg["version"])
    root = app_boot.app_root()
    os.makedirs(root, exist_ok=True)
    part = os.path.join(root, f"{version}.zip.part")
    staging = os.path.join(root, f"{version}.staging")
    final = os.path.join(root, version)
    try:
        _download.update(state="downloading", progress=0.0, error=None, version=version,
                         kind="package", done=0, total=0)
        expected_size = int(pkg.get("size") or 0)
        done, sha = _stream_to_file(pkg["url"], part, expected_size)

        _download.update(state="verifying", progress=0.99)
        if expected_size and done != expected_size:
            raise RuntimeError("The download was incomplete. Please try again.")
        if sha.lower() != str(pkg.get("sha256", "")).lower():
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


# ---------------------------------------------------------------- engine: changed files only

class _RangeUnsupported(Exception):
    pass


class RemoteFile(io.RawIOBase):
    """Read-only, seekable view of a remote file through HTTP range requests,
    so zipfile can read single members of a big zip without downloading it."""

    def __init__(self, client: httpx.Client, url: str, size: int):
        super().__init__()
        self._client, self._url, self._size = client, url, int(size)
        self._resolved = None  # GitHub redirects to a short-lived signed link
        self._pos = 0
        self._buf, self._buf_start = b"", 0
        self._chunk = RANGE_CHUNK
        self.fetched = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self._pos

    def seek(self, offset, whence=0):
        base = {0: 0, 1: self._pos, 2: self._size}[whence]
        self._pos = max(0, base + offset)
        return self._pos

    def readinto(self, b):
        n = len(b)
        if n == 0 or self._pos >= self._size:
            return 0
        want_end = min(self._pos + n, self._size)
        buf_end = self._buf_start + len(self._buf)
        if not (self._buf_start <= self._pos and want_end <= buf_end):
            # Reading on from the last chunk: fetch bigger chunks (big files).
            self._chunk = min(self._chunk * 2, RANGE_CHUNK_MAX) if self._pos == buf_end and self._buf else RANGE_CHUNK
            start = self._pos
            end = min(self._size, start + max(n, self._chunk)) - 1
            self._buf, self._buf_start = self._get(start, end), start
        off = self._pos - self._buf_start
        chunk = self._buf[off:off + n]
        b[:len(chunk)] = chunk
        self._pos += len(chunk)
        return len(chunk)

    def _get(self, start: int, end: int) -> bytes:
        last_exc = None
        for attempt in range(4):
            url = self._resolved or self._url
            try:
                with self._client.stream("GET", url, headers={"Range": f"bytes={start}-{end}"}) as r:
                    if r.status_code == 206:
                        data = r.read()
                        if len(data) != end - start + 1:
                            raise RuntimeError("The download was incomplete. Please try again.")
                        self._resolved = str(r.url)
                        self.fetched += len(data)
                        return data
                    if r.status_code == 200:
                        raise _RangeUnsupported()
                    if self._resolved and r.status_code in (400, 401, 403, 404, 410):
                        self._resolved = None  # signed link expired: ask GitHub again
                        continue
                    r.raise_for_status()
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                last_exc = exc
                self._resolved = None
                time.sleep(1 + attempt)
        raise RuntimeError(f"The download failed ({last_exc.__class__.__name__ if last_exc else 'error'}). Please try again.")


def _fetch_listing(bundle: dict) -> dict:
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        resp = client.get(bundle["files_url"])
        resp.raise_for_status()
        data = resp.content
    if hashlib.sha256(data).hexdigest().lower() != str(bundle["files_sha256"]).lower():
        raise RuntimeError("The engine file list failed its integrity check. Please try again.")
    listing = json.loads(data)
    if str(listing.get("version")) != str(bundle.get("version")):
        raise RuntimeError("The engine file list does not match this update.")
    return listing


def compare_install(install_dir: str, files: dict, progress=None) -> tuple:
    """(files to download, files to delete) to make install_dir match `files`.
    The voice model and anything outside _internal/ that is not listed are left alone."""
    norm = os.path.normcase
    need = []
    items = sorted(files.items())
    for i, (rel, (size, sha)) in enumerate(items):
        if progress:
            progress(i, len(items))
        if not _safe_rel(rel):
            raise RuntimeError(f"Unsafe path in update package: {rel}")
        if rel.startswith(MODELS_PREFIX):
            continue
        path = os.path.join(install_dir, *rel.split("/"))
        try:
            if os.path.getsize(path) == int(size) and _sha256_file(path) == sha:
                continue
        except OSError:
            pass
        need.append(rel)
    listed = {norm(rel) for rel in files}
    remove = []
    internal = os.path.join(install_dir, "_internal")
    for dirpath, _dirs, names in os.walk(internal):
        for name in names:
            rel = os.path.relpath(os.path.join(dirpath, name), install_dir).replace(os.sep, "/")
            if rel.startswith(MODELS_PREFIX):
                continue
            if norm(rel) not in listed:
                remove.append(rel)
    return need, sorted(remove)


def _extract_verified(zf: zipfile.ZipFile, rel: str, size: int, sha: str, files_dir: str, on_read=None) -> None:
    dest = os.path.join(files_dir, *rel.split("/"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    h = hashlib.sha256()
    n = 0
    with zf.open(rel) as src, open(dest, "wb") as out:
        for chunk in iter(lambda: src.read(1024 * 1024), b""):
            out.write(chunk)
            h.update(chunk)
            n += len(chunk)
            if on_read:
                on_read()
    if n != int(size) or h.hexdigest() != sha:
        raise RuntimeError("The download failed its integrity check. Please try again.")


def _download_members(bundle: dict, need: list, files: dict, files_dir: str, part: str) -> None:
    size = int(bundle["size"])
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        remote = RemoteFile(client, bundle["url"], size)
        try:
            zf = zipfile.ZipFile(remote)
        except _RangeUnsupported:
            zf = None
        if zf is not None:
            with zf:
                infos = {i.filename: i for i in zf.infolist()}
                missing = [p for p in need if p not in infos]
                if missing:
                    raise RuntimeError("The engine update package is incomplete.")
                todo = sum(infos[p].compress_size for p in need)
                if todo <= FULL_DOWNLOAD_RATIO * size:
                    start = remote.fetched
                    _download.update(state="downloading", total=todo, done=0, progress=0.0)

                    def tick():
                        _download["done"] = min(todo, remote.fetched - start)
                        _download["progress"] = min(0.99, _download["done"] / todo) if todo else 0.99
                    try:
                        for rel in sorted(need, key=lambda p: infos[p].header_offset):
                            _extract_verified(zf, rel, files[rel][0], files[rel][1], files_dir, tick)
                        return
                    except _RangeUnsupported:
                        pass
    # Whole zip: the server ignores ranges, or most files changed anyway.
    _download.update(state="downloading", progress=0.0, done=0, total=size)
    done, sha = _stream_to_file(bundle["url"], part, size)
    _download.update(state="verifying", progress=0.99)
    if done != size or sha.lower() != str(bundle["sha256"]).lower():
        raise RuntimeError("The download failed its integrity check. Please try again.")
    with zipfile.ZipFile(part) as zf:
        for rel in need:
            _extract_verified(zf, rel, files[rel][0], files[rel][1], files_dir)


def _run_engine_sync(manifest: dict) -> None:
    bundle = engine_bundle_for_this_install(manifest) or {}
    version = str(bundle.get("version") or "")
    root = app_boot.app_root()
    staging = os.path.join(root, f"engine-sync-{version}")
    files_dir = os.path.join(staging, "files")
    part = os.path.join(root, f"BookNarrator-Engine-{version}.zip.part")
    install_dir = os.path.dirname(sys.executable)
    exe_name = os.path.basename(sys.executable)
    ok = False
    try:
        os.makedirs(root, exist_ok=True)
        _download.update(state="checking", progress=0.0, error=None, version=version,
                         kind="engine_sync", done=0, total=0)
        if not os.access(install_dir, os.W_OK):
            raise RuntimeError(f"The app folder ({install_dir}) is not writable, so the update can't be installed.")
        listing = _fetch_listing(bundle)
        files = {k: v for k, v in (listing.get("files") or {}).items() if not k.startswith(MODELS_PREFIX)}
        if exe_name not in files:
            raise RuntimeError("The engine update does not match this installation.")

        def checking(i, n):
            _download["progress"] = (i / n) if n else 0.0
        need, remove = compare_install(install_dir, files, checking)
        need_bytes = sum(int(files[p][0]) for p in need)
        if shutil.disk_usage(root).free < 2 * need_bytes + 50 * 1024 * 1024:
            raise RuntimeError(f"Not enough free disk space. Free up at least {(2 * need_bytes) // (1024 * 1024) + 50} MB and try again.")
        shutil.rmtree(staging, ignore_errors=True)
        os.makedirs(files_dir)
        if need:
            _download_members(bundle, need, files, files_dir, part)
        try:
            os.remove(part)
        except OSError:
            pass
        ok = True
        _download.update(state="installing", progress=1.0)
        time.sleep(1.0)  # let the UI show "Installing…"
        if sys.platform == "win32":
            _run_helper_script("apply-engine-update.cmd",
                               build_patch_script(os.getpid(), staging, install_dir, exe_name, remove, [staging]))
        else:
            _run_helper_script("apply-engine-update.sh",
                               build_linux_script(os.getpid(), files_dir, install_dir, exe_name, [staging], remove))
    except Exception as exc:
        ok = False
        _download.update(state="error", error=str(exc) or exc.__class__.__name__)
    finally:
        if not ok:
            shutil.rmtree(staging, ignore_errors=True)
            try:
                os.remove(part)
            except OSError:
                pass


# ---------------------------------------------------------------- engine: whole-file fallbacks

def _launch_installer(path: str) -> None:
    """Run the verified installer silently, then quit so no files are locked.

    KNOWN TRADE-OFF: unlike the small in-app updates, an engine update has NO
    automatic rollback. If the new version fails to start, the user must
    reinstall. The installer (CloseApplications=yes) also closes us as a
    backstop, and its [Run] entry reopens the app after a silent install.
    """
    import subprocess
    kwargs = {"close_fds": True, "env": _clean_env()}
    if sys.platform == "win32":
        kwargs["creationflags"] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    _continue_after_restart()
    subprocess.Popen([path] + INSTALLER_ARGS, **kwargs)
    os._exit(0)


def _download_whole(url: str, size: int, sha256: str, final: str, kind: str, version: str) -> bool:
    part = final + ".part"
    _download.update(state="downloading", progress=0.0, error=None, version=version, kind=kind, done=0, total=0)
    if shutil.disk_usage(os.path.dirname(final)).free < 2 * size:
        raise RuntimeError(f"Not enough free disk space. Free up at least {(2 * size) // (1024 * 1024)} MB and try again.")
    done, sha = _stream_to_file(url, part, size)
    _download.update(state="verifying", progress=0.99)
    if done != size:
        raise RuntimeError("The download was incomplete. Please try again.")
    if sha.lower() != str(sha256).lower():
        raise RuntimeError("The download failed its integrity check. Please try again.")
    os.replace(part, final)
    return True


def _run_installer_download(manifest: dict) -> None:
    version = str(manifest.get("installer_version") or manifest["version"])
    root = app_boot.app_root()
    final = os.path.join(root, f"BookNarrator-Setup-{version}.exe")
    ok = False
    try:
        os.makedirs(root, exist_ok=True)
        for old in os.listdir(root):  # leftovers from earlier attempts
            if old.startswith("BookNarrator-Setup-") and old.endswith((".exe", ".part")):
                try:
                    os.remove(os.path.join(root, old))
                except OSError:
                    pass
        _download_whole(manifest["installer_url"], int(manifest.get("installer_size") or 0),
                        manifest.get("installer_sha256", ""), final, "installer", version)
        ok = True
        _download.update(state="installing", progress=1.0)
        time.sleep(1.0)
        _launch_installer(final)
    except Exception as exc:
        ok = False  # also covers a failed launch: do not keep the file
        _download.update(state="error", error=str(exc))
    finally:
        if not ok:
            for p in (final + ".part", final):
                try:
                    os.remove(p)
                except OSError:
                    pass


def _run_portable(manifest: dict) -> None:
    version = str(manifest.get("portable_version") or manifest.get("version"))
    root = app_boot.app_root()
    final = os.path.join(root, f"BookNarrator-Portable-{version}.exe")
    ok = False
    try:
        os.makedirs(root, exist_ok=True)
        _download_whole(manifest["portable_url"], int(manifest["portable_size"]), manifest["portable_sha256"],
                        final, "portable", version)
        ok = True
        _download.update(state="installing", progress=1.0)
        time.sleep(1.0)
        _run_helper_script("apply-portable-update.cmd", build_portable_script(os.getpid(), final, sys.executable))
    except Exception as exc:
        ok = False
        _download.update(state="error", error=str(exc))
    finally:
        if not ok:
            for p in (final + ".part", final):
                try:
                    os.remove(p)
                except OSError:
                    pass


# ---------------------------------------------------------------- entry points

def start_download(allowed_kinds=None) -> dict:
    if not can_self_update():
        return {"ok": False, "error": "Updates can only be installed in the desktop app."}
    with _lock:
        if _download["state"] in ("checking", "downloading", "verifying", "installing"):
            return {"ok": True}
        manifest = fetch_manifest(force=True)
        plan = plan_update(manifest)
        if not plan["available"]:
            return {"ok": False, "error": "You already have the latest version."}
        if not plan["kind"]:
            return {"ok": False, "error": "This update can't be installed from inside the app on this system yet."}
        if allowed_kinds is not None and plan["kind"] not in allowed_kinds:
            return {"ok": False, "error": "Not started automatically."}
        if plan["kind"] == "package":
            target, arg = _run_download, plan["package"]
        else:
            target = {"engine_sync": _run_engine_sync, "installer": _run_installer_download,
                      "portable": _run_portable}[plan["kind"]]
            arg = manifest
        _download.update(state="checking" if plan["kind"] == "engine_sync" else "downloading",
                         progress=0.0, error=None, done=0, total=0, kind=plan["kind"])
        threading.Thread(target=target, args=(arg,), daemon=True).start()
    return {"ok": True}


def restart_soon() -> None:
    """Restart into the downloaded version (after the HTTP response is sent)."""
    def _go():
        time.sleep(0.6)
        app_boot.relaunch_and_exit()
    threading.Thread(target=_go, daemon=True).start()


def confirm_running_version() -> None:
    """Called by the UI once it has loaded: the new version works, keep it.

    Then carries on by itself where the user already said "Update":
      - right after an app-code update that still needs the engine (the 1.0.16
        bridge): start the engine update;
      - right after an engine update: fetch the remaining small update.
    """
    if not getattr(sys, "frozen", False):
        return
    version = current_info()["version"]
    state = app_boot.load_state()
    changed = False
    just_updated = False
    if state.get("trying") and state["trying"] == version:
        state["previous"] = state.get("active")
        state["active"] = version
        state["trying"] = None
        changed = just_updated = True
    after_engine = bool(state.pop("continue_update", False))
    if after_engine:
        changed = True
    if changed:
        app_boot.save_state(state)
    if after_engine:
        threading.Thread(target=_resume, args=(("package",),), daemon=True).start()
    elif just_updated:
        threading.Thread(target=_resume, args=(("engine_sync", "portable", "installer"),), daemon=True).start()


def _resume(kinds) -> None:
    """Continue an update the user already started; never chains a second engine update."""
    try:
        start_download(allowed_kinds=kinds)
    except Exception:
        pass
