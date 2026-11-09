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

With --legacy-engine E it also builds app-<version>-for-E.zip: the same code
stamped for that older engine (the "bridge"), so installs on it can take this
version through their own small-update path, then update the engine in-app.
It is only built when scripts/check_legacy_bridge.py says the code runs there.

Installer and engine-bundle entries are NOT written here (they do not exist
yet); scripts/add_installer_to_manifest.py adds them in the publish-update job.

Usage: make_update_package.py --version 1.0.20 --build 20 --repo owner/name [--notes "..."] [--legacy-engine E]
"""

import argparse
import hashlib
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_legacy_bridge  # noqa: E402

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
    ap.add_argument("--legacy-engine", action="append", default=[],
                    help="also build a bridge package for this older engine (repeatable)")
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
    published = datetime.now(timezone.utc).isoformat(timespec="seconds")
    base_url = f"https://github.com/{args.repo}/releases/download/updates"

    def entry(zip_name: str) -> dict:
        with open(os.path.join(args.out, zip_name), "rb") as f:
            data = f.read()
        return {"version": args.version, "build": args.build, "url": f"{base_url}/{zip_name}",
                "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}

    zip_name = f"app-{args.version}.zip"
    build_zip(os.path.join(args.out, zip_name), info)
    packages = {engine: entry(zip_name)}
    bridges = {}
    for legacy in args.legacy_engine:
        if legacy == engine:
            continue
        missing = check_legacy_bridge.missing_modules(legacy)
        if missing:
            print(f"NOT building the bridge for engine {legacy}; the code imports modules it lacks: {sorted(missing)}")
            continue
        name = f"app-{args.version}-for-{legacy}.zip"
        build_zip(os.path.join(args.out, name), {**info, "engine": legacy})
        packages[legacy] = bridges[legacy] = entry(name)

    latest = {"version": args.version, "build": args.build, "notes": info["notes"], "published_at": published}
    # Top level: read by app code that predates format 2 (<= 1.0.19). It gets the
    # bridge (if built), so v1.0.16 installs update in-app; publish-update keeps
    # the previous bridge when none could be built this time.
    top_engine = args.legacy_engine[0] if args.legacy_engine and args.legacy_engine[0] in bridges else engine
    top = packages[top_engine]
    manifest = {
        "version": args.version, "build": args.build, "engine": top_engine, "notes": info["notes"],
        "size": top["size"], "sha256": top["sha256"], "package_url": top["url"], "published_at": published,
        "format": 2,
        "latest": latest,
        "engine_target": engine,
        "legacy_engines": args.legacy_engine,
        "packages": packages,
    }
    with open(os.path.join(args.out, "update.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(json.dumps({"version": args.version, "engine": engine, "bridges": sorted(bridges),
                      "size": packages[engine]["size"]}))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write(f"engine={engine}\n")
    return 0


def build_zip(zip_path: str, info: dict) -> None:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zf.writestr("version.json", json.dumps(info, indent=2))
        for top in PACKAGE_DIRS:
            for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, top)):
                dirnames[:] = sorted(d for d in dirnames if d != "__pycache__")
                for name in sorted(filenames):
                    if name.endswith((".pyc", ".pyo")):
                        continue
                    full = os.path.join(dirpath, name)
                    zf.write(full, os.path.relpath(full, ROOT).replace(os.sep, "/"))


if __name__ == "__main__":
    sys.exit(main())
