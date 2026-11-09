#!/usr/bin/env python3
"""
Build the engine bundle for one platform (run in the build job, after PyInstaller).

Writes to --out:
  BookNarrator-Engine-<platform>-<version>.zip   every file of the app folder
      except the voice model (_internal/models/), deflate-compressed, one zip
      member per file so the app can fetch single files with HTTP range requests
  engine-files-<platform>-<version>.json         {path: [size, sha256]} of those files

An installed app compares its own files with the JSON and downloads only the
files that differ (src/updater.py, "engine_sync"). The voice model does not
change, so it is never downloaded again.

Usage: make_engine_bundle.py --dist dist/book-narrator --platform windows --version 1.0.20 --engine abc --out release
"""

import argparse
import hashlib
import json
import os
import sys
import zipfile

EXCLUDE_PREFIXES = ("_internal/models/",)


def scan(dist: str) -> dict:
    files = {}
    for dirpath, dirnames, names in os.walk(dist):
        dirnames.sort()
        for name in sorted(names):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, dist).replace(os.sep, "/")
            if rel.startswith(EXCLUDE_PREFIXES):
                continue
            h = hashlib.sha256()
            with open(full, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    h.update(chunk)
            files[rel] = [os.path.getsize(full), h.hexdigest()]
    return files


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    ap.add_argument("--platform", required=True, choices=["windows", "linux"])
    ap.add_argument("--version", required=True)
    ap.add_argument("--engine", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    files = scan(args.dist)
    listing = {"version": args.version, "engine": args.engine, "platform": args.platform,
               "excluded": list(EXCLUDE_PREFIXES), "files": files}
    list_path = os.path.join(args.out, f"engine-files-{args.platform}-{args.version}.json")
    with open(list_path, "w", encoding="utf-8") as f:
        json.dump(listing, f, separators=(",", ":"))
    zip_path = os.path.join(args.out, f"BookNarrator-Engine-{args.platform}-{args.version}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for rel in sorted(files):
            zf.write(os.path.join(args.dist, *rel.split("/")), rel)
    raw = sum(v[0] for v in files.values())
    print(f"engine bundle: {len(files)} files, {raw / 1e6:.1f} MB -> {os.path.getsize(zip_path) / 1e6:.1f} MB zip")
    return 0


if __name__ == "__main__":
    sys.exit(main())
