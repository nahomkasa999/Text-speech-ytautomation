#!/usr/bin/env python3
"""
Add the full-installer fields (and the small engine_patch entry, if one was
built) to update.json (run in the publish-update job).

Looks for BookNarrator-Setup-<version>.exe in --search-dir. Only if that exact
file exists (a new installer was built for THIS manifest version) are
installer_url, installer_size and installer_sha256 written. Otherwise the
fields are removed, so they can never point at an older installer.

Usage: add_installer_to_manifest.py --manifest update.json --search-dir release --repo owner/name
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
    }


def apply(manifest: dict, search_dir: str, repo: str) -> dict:
    for key in ("installer_url", "installer_size", "installer_sha256"):
        manifest.pop(key, None)
    add_engine_patch(manifest, search_dir, repo)
    version = str(manifest["version"])
    name = f"BookNarrator-Setup-{version}.exe"
    path = os.path.join(search_dir, name) if search_dir else ""
    if not (path and os.path.isfile(path)):
        return manifest
    h = hashlib.sha256()
    size = 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
            size += len(chunk)
    manifest["installer_url"] = f"https://github.com/{repo}/releases/download/v{version}/{name}"
    manifest["installer_size"] = size
    manifest["installer_sha256"] = h.hexdigest()
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--search-dir", default="")
    ap.add_argument("--repo", required=True)
    args = ap.parse_args()
    with open(args.manifest, encoding="utf-8") as f:
        manifest = json.load(f)
    manifest = apply(manifest, args.search_dir, args.repo)
    with open(args.manifest, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("installer fields:", {k: manifest[k] for k in manifest if k.startswith("installer_")} or "none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
