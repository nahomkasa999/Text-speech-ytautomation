#!/usr/bin/env python3
"""
Build the small in-app update package (used by .github/workflows/build.yml).

Creates:
  version.json                         - version info (also bundled into installers)
  dist/update-channel/app-<ver>.zip    - src/ + static/ + version.json
  dist/update-channel/update.json      - manifest the app checks for updates

The "engine" is a fingerprint of everything an in-app update cannot change:
the Python libraries (requirements.txt), the PyInstaller spec and the
launcher/boot code inside the .exe. If it changes, users need the full installer.

The installer_url / installer_size / installer_sha256 fields are NOT written
here (the installer does not exist yet); scripts/add_installer_to_manifest.py
adds them in the publish-update job, only when a new installer was built.

Usage: make_update_package.py --version 1.0.20 --build 20 --repo owner/name [--notes "..."]
"""

import argparse
import hashlib
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_FILES = ["requirements.txt", "book_narrator.spec", "app_boot.py", "desktop.py"]
PACKAGE_DIRS = ["src", "static"]


def engine_fingerprint() -> str:
    h = hashlib.sha256()
    for name in ENGINE_FILES:
        with open(os.path.join(ROOT, name), "rb") as f:
            h.update(name.encode() + b"\0" + f.read().replace(b"\r\n", b"\n") + b"\0")
    return h.hexdigest()[:16]


def clean_notes(text: str) -> str:
    lines = [l.rstrip() for l in (text or "").splitlines()]
    lines = [l for l in lines if not re.match(r"^(Co-Authored-By|Claude-Session|Signed-off-by):", l, re.I)]
    return "\n".join(lines).strip()[:800]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--build", type=int, required=True)
    ap.add_argument("--repo", required=True)
    ap.add_argument("--notes", default="")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "update-channel"))
    args = ap.parse_args()

    engine = engine_fingerprint()
    info = {
        "version": args.version,
        "build": args.build,
        "engine": engine,
        "notes": clean_notes(args.notes),
    }
    with open(os.path.join(ROOT, "version.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, indent=2)

    os.makedirs(args.out, exist_ok=True)
    zip_name = f"app-{args.version}.zip"
    zip_path = os.path.join(args.out, zip_name)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zf.write(os.path.join(ROOT, "version.json"), "version.json")
        for top in PACKAGE_DIRS:
            for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, top)):
                dirnames[:] = sorted(d for d in dirnames if d != "__pycache__")
                for name in sorted(filenames):
                    if name.endswith((".pyc", ".pyo")):
                        continue
                    full = os.path.join(dirpath, name)
                    zf.write(full, os.path.relpath(full, ROOT).replace(os.sep, "/"))

    with open(zip_path, "rb") as f:
        data = f.read()
    manifest = {
        **info,
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "package_url": f"https://github.com/{args.repo}/releases/download/updates/{zip_name}",
        "published_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with open(os.path.join(args.out, "update.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(json.dumps({k: manifest[k] for k in ("version", "build", "engine", "size")}))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write(f"engine={engine}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
