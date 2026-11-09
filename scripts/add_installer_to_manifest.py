#!/usr/bin/env python3
"""
Add the full-installer fields (and the small engine_patch entry, if one was
built) to update.json (run in the publish-update job).

Looks for BookNarrator-Setup-<version>.exe, BookNarrator-Linux-<version>.tar.gz
and BookNarrator-EnginePatch-<version>.zip in --search-dir (built for THIS
manifest version) and writes their URL, size and SHA-256.

When this run built none of them (the engine did not change), the entries of
the previously published manifest (--previous) are carried forward, but only
if that manifest has the same engine. So installed apps on an older engine can
always update in-app; they get the newest installer for this engine and then
the small app update on top. Entries for another engine are never kept.

Usage: add_installer_to_manifest.py --manifest update.json --search-dir release --repo owner/name [--previous prev-update.json]
"""

import argparse
import hashlib
import json
import os
import sys
import zipfile


def add_engine_patch(manifest: dict, search_dir: str, repo: str) -> None:
    """engine_patch: only when BookNarrator-EnginePatch-<version>.zip exists for THIS version."""
    manifest.pop("engine_patch", None)
    version = str(manifest["version"])
    name = f"BookNarrator-EnginePatch-{version}.zip"
    path = os.path.join(search_dir, name) if search_dir else ""
    if not os.path.isfile(path):
        return
    try:
        with zipfile.ZipFile(path) as zf:
            info = json.loads(zf.read("patch.json"))
    except Exception:
        return
    if str(info.get("version")) != version or info.get("engine") != manifest.get("engine"):
        return
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    manifest["engine_patch"] = {
        "url": f"https://github.com/{repo}/releases/download/v{version}/{name}",
        "size": os.path.getsize(path),
        "sha256": h.hexdigest(),
        "base_engine": info["base_engine"],
        "base_version": info.get("base_version"),
        "version": version,
    }


INSTALLER_KEYS = ("installer_url", "installer_size", "installer_sha256", "installer_version")
LINUX_KEYS = ("linux_url", "linux_size", "linux_sha256", "linux_version")


def _hash(path: str) -> tuple:
    h = hashlib.sha256()
    size = 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
            size += len(chunk)
    return size, h.hexdigest()


def add_linux_bundle(manifest: dict, search_dir: str, repo: str) -> None:
    version = str(manifest["version"])
    name = f"BookNarrator-Linux-{version}.tar.gz"
    path = os.path.join(search_dir, name) if search_dir else ""
    if not (path and os.path.isfile(path)):
        return
    size, sha = _hash(path)
    manifest.update(linux_url=f"https://github.com/{repo}/releases/download/v{version}/{name}",
                    linux_size=size, linux_sha256=sha, linux_version=version)


def carry_forward(manifest: dict, previous: dict) -> None:
    """Keep last release's installer/tarball/patch when they were built for this same engine."""
    if not previous or not manifest.get("engine") or previous.get("engine") != manifest.get("engine"):
        return
    prev_version = str(previous.get("version") or "")
    if "installer_url" not in manifest and previous.get("installer_url") and previous.get("installer_sha256"):
        for k in INSTALLER_KEYS[:3]:
            manifest[k] = previous[k]
        manifest["installer_version"] = str(previous.get("installer_version") or prev_version)
    if "linux_url" not in manifest and previous.get("linux_url") and previous.get("linux_sha256"):
        for k in LINUX_KEYS[:3]:
            manifest[k] = previous[k]
        manifest["linux_version"] = str(previous.get("linux_version") or prev_version)
    p = previous.get("engine_patch")
    if "engine_patch" not in manifest and isinstance(p, dict) and p.get("url") and p.get("sha256"):
        manifest["engine_patch"] = dict(p, version=str(p.get("version") or prev_version))


def apply(manifest: dict, search_dir: str, repo: str, previous: dict = None) -> dict:
    for key in INSTALLER_KEYS + LINUX_KEYS:
        manifest.pop(key, None)
    add_engine_patch(manifest, search_dir, repo)
    add_linux_bundle(manifest, search_dir, repo)
    _add_installer(manifest, search_dir, repo)
    carry_forward(manifest, previous or {})
    return manifest


def _add_installer(manifest: dict, search_dir: str, repo: str) -> dict:
    version = str(manifest["version"])
    name = f"BookNarrator-Setup-{version}.exe"
    path = os.path.join(search_dir, name) if search_dir else ""
    if not (path and os.path.isfile(path)):
        return manifest
    size, sha = _hash(path)
    manifest["installer_url"] = f"https://github.com/{repo}/releases/download/v{version}/{name}"
    manifest["installer_size"] = size
    manifest["installer_sha256"] = sha
    manifest["installer_version"] = version
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--search-dir", default="")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--previous", default="", help="the update.json published before this run (optional)")
    args = ap.parse_args()
    with open(args.manifest, encoding="utf-8") as f:
        manifest = json.load(f)
    previous = {}
    if args.previous and os.path.isfile(args.previous):
        try:
            with open(args.previous, encoding="utf-8") as f:
                previous = json.load(f)
        except Exception:
            previous = {}
    manifest = apply(manifest, args.search_dir, args.repo, previous)
    with open(args.manifest, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("in-app engine update entries:",
          {k: manifest[k] for k in manifest if k.startswith(("installer_", "linux_", "engine_patch"))} or "none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
