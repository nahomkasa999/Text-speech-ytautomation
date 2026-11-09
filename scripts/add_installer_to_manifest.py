#!/usr/bin/env python3
"""
Finish update.json in the publish-update job: add what the app needs to update
its engine in-app, from the files this run built (in --search-dir), or carried
forward from the previously published manifest (--previous) when this run did
not build them and the engine is the same.

  engine_bundle.<platform>  BookNarrator-Engine-<platform>-<v>.zip + engine-files-<platform>-<v>.json
                            (the app downloads only the files that changed; never the voice model)
  installer_*               BookNarrator-Setup-<v>.exe   (Windows fallback; also what app code
                            <= 1.0.19 on the 1.0.18 engine installs in-app)
  portable_*                BookNarrator-Portable-<v>.exe (the portable exe replaces itself)

Entries built for a different engine are never kept. Also keeps the previous
bridge package (top-level fields + packages[<legacy engine>]) when this run
could not build one, so v1.0.16 installs always find a small update they can install.

Usage: add_installer_to_manifest.py --manifest update.json --search-dir release --repo owner/name [--previous prev-update.json]
"""

import argparse
import hashlib
import json
import os
import sys

INSTALLER_KEYS = ("installer_url", "installer_size", "installer_sha256", "installer_version")
PORTABLE_KEYS = ("portable_url", "portable_size", "portable_sha256", "portable_version")
OLD_KEYS = ("engine_patch", "linux_url", "linux_size", "linux_sha256", "linux_version")
TOP_LEVEL_PACKAGE_KEYS = ("version", "build", "engine", "notes", "size", "sha256", "package_url", "published_at")
PLATFORMS = ("windows", "linux")


def target_engine(m: dict) -> str:
    return (m or {}).get("engine_target") or (m or {}).get("engine") or ""


def _hash(path: str) -> tuple:
    h = hashlib.sha256()
    size = 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
            size += len(chunk)
    return size, h.hexdigest()


def _release_url(repo: str, version: str, name: str) -> str:
    return f"https://github.com/{repo}/releases/download/v{version}/{name}"


def add_built_files(manifest: dict, search_dir: str, repo: str) -> None:
    version = str(manifest.get("latest", {}).get("version") or manifest["version"])
    engine = target_engine(manifest)

    def found(name):
        path = os.path.join(search_dir, name) if search_dir else ""
        return path if path and os.path.isfile(path) else None

    setup = found(f"BookNarrator-Setup-{version}.exe")
    if setup:
        size, sha = _hash(setup)
        manifest.update(installer_url=_release_url(repo, version, os.path.basename(setup)),
                        installer_size=size, installer_sha256=sha, installer_version=version)
    portable = found(f"BookNarrator-Portable-{version}.exe")
    if portable:
        size, sha = _hash(portable)
        manifest.update(portable_url=_release_url(repo, version, os.path.basename(portable)),
                        portable_size=size, portable_sha256=sha, portable_version=version)
    bundles = {}
    for plat in PLATFORMS:
        zip_path = found(f"BookNarrator-Engine-{plat}-{version}.zip")
        list_path = found(f"engine-files-{plat}-{version}.json")
        if not (zip_path and list_path):
            continue
        with open(list_path, encoding="utf-8") as f:
            listing = json.load(f)
        if str(listing.get("version")) != version or listing.get("engine") != engine:
            continue
        size, sha = _hash(zip_path)
        lsize, lsha = _hash(list_path)
        bundles[plat] = {
            "version": version, "engine": engine,
            "url": _release_url(repo, version, os.path.basename(zip_path)), "size": size, "sha256": sha,
            "files_url": _release_url(repo, version, os.path.basename(list_path)),
            "files_size": lsize, "files_sha256": lsha,
        }
    if bundles:
        manifest["engine_bundle"] = bundles


def carry_forward(manifest: dict, previous: dict) -> None:
    """Keep last release's entries that were built for this same engine."""
    if not previous:
        return
    same_engine = bool(target_engine(manifest)) and target_engine(previous) == target_engine(manifest)
    prev_version = str((previous.get("latest") or {}).get("version") or previous.get("version") or "")
    if same_engine:
        if "installer_url" not in manifest and previous.get("installer_url") and previous.get("installer_sha256"):
            for k in INSTALLER_KEYS[:3]:
                manifest[k] = previous[k]
            manifest["installer_version"] = str(previous.get("installer_version") or prev_version)
        if "portable_url" not in manifest and previous.get("portable_url") and previous.get("portable_sha256"):
            for k in PORTABLE_KEYS[:3]:
                manifest[k] = previous[k]
            manifest["portable_version"] = str(previous.get("portable_version") or prev_version)
        bundles = dict(manifest.get("engine_bundle") or {})
        for plat, b in (previous.get("engine_bundle") or {}).items():
            if plat not in bundles and isinstance(b, dict) and b.get("engine") == target_engine(manifest):
                bundles[plat] = b
        if bundles:
            manifest["engine_bundle"] = bundles

    # The bridge for the oldest supported engine: keep the previous one if this
    # run could not build it (the code no longer runs on that engine).
    legacy = (manifest.get("legacy_engines") or [None])[0]
    packages = manifest.setdefault("packages", {})
    if legacy and legacy not in packages:
        prev_pkg = (previous.get("packages") or {}).get(legacy)
        if prev_pkg:
            packages[legacy] = prev_pkg
        if previous.get("engine") == legacy and previous.get("package_url"):
            for k in TOP_LEVEL_PACKAGE_KEYS:
                if k in previous:
                    manifest[k] = previous[k]


def apply(manifest: dict, search_dir: str, repo: str, previous: dict = None) -> dict:
    for key in INSTALLER_KEYS + PORTABLE_KEYS + OLD_KEYS + ("engine_bundle",):
        manifest.pop(key, None)
    if "latest" not in manifest:  # an old-format manifest: treat the top level as latest
        manifest["latest"] = {k: manifest.get(k) for k in ("version", "build", "notes", "published_at")}
    add_built_files(manifest, search_dir, repo)
    carry_forward(manifest, previous or {})
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
    print("engine bundles:", sorted((manifest.get("engine_bundle") or {}).keys()) or "none",
          "| installer:", manifest.get("installer_version") or "none",
          "| portable:", manifest.get("portable_version") or "none",
          "| top-level package engine:", manifest.get("engine"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
