#!/usr/bin/env python3
"""
Build the "engine patch" for the Windows app folder (run in the build job).

Always writes <out>/engine-files.json: every file of the PyInstaller folder with
its size and SHA-256. Given the previous release's engine-files.json (--prev) it
also writes <out>/BookNarrator-EnginePatch-<version>.zip holding only the files
that are new or changed (the 400 MB voice model and big libraries are normally
identical, so they are left out) plus patch.json (removed files, base engine).

An installed app whose engine equals patch.json "base_engine" can then update
the engine by downloading only that zip, instead of the full installer.

Usage: make_engine_patch.py --dist dist/book-narrator --version 1.0.20 --engine abc [--prev prev.json] --out release
"""

import argparse
import hashlib
import json
import os
import sys
import zipfile


def scan(dist: str) -> dict:
    files = {}
    for dirpath, _dirs, names in os.walk(dist):
        for name in names:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, dist).replace(os.sep, "/")
            h = hashlib.sha256()
            with open(full, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    h.update(chunk)
            files[rel] = [os.path.getsize(full), h.hexdigest()]
    return files


def diff(prev: dict, new: dict) -> tuple:
    changed = sorted(p for p, v in new.items() if prev.get(p) != v)
    removed = sorted(p for p in prev if p not in new)
    return changed, removed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--engine", required=True)
    ap.add_argument("--prev", default="")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    files = scan(args.dist)
    listing = {"version": args.version, "engine": args.engine, "files": files}
    with open(os.path.join(args.out, "engine-files.json"), "w", encoding="utf-8") as f:
        json.dump(listing, f)

    prev = None
    if args.prev and os.path.isfile(args.prev):
        try:
            with open(args.prev, encoding="utf-8") as f:
                prev = json.load(f)
        except Exception:
            prev = None
    if not prev or not prev.get("engine") or prev["engine"] == args.engine:
        print("no engine patch (no previous engine listing, or engine unchanged)")
        return 0

    changed, removed = diff(prev.get("files", {}), files)
    patch = {"version": args.version, "base_engine": prev["engine"], "base_version": prev.get("version"),
             "engine": args.engine, "remove": removed}
    zip_path = os.path.join(args.out, f"BookNarrator-EnginePatch-{args.version}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr("patch.json", json.dumps(patch))
        for rel in changed:
            zf.write(os.path.join(args.dist, rel), "files/" + rel)
    print(f"engine patch: {len(changed)} changed/new, {len(removed)} removed, {os.path.getsize(zip_path)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
