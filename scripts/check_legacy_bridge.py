#!/usr/bin/env python3
"""
Can the current app code (src/) run on an older installed engine?

The "bridge" package lets installs on an old engine (v1.0.16) receive the new
updater through their own small-update path. That only works if every module
src/ imports exists inside that old build. scripts/legacy_engines/<engine>.modules.txt
lists them (read from the real build). Prints what is missing; exit 1 if anything is.

Usage: check_legacy_bridge.py <engine>
"""

import ast
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Imported only on paths the installed app never takes (running from source / at build time).
NOT_USED_WHEN_INSTALLED = {"imageio_ffmpeg"}


def load_modules(engine: str) -> set:
    path = os.path.join(ROOT, "scripts", "legacy_engines", f"{engine}.modules.txt")
    with open(path, encoding="utf-8") as f:
        return {l.strip() for l in f if l.strip() and not l.startswith("#")}


def imports_of(path: str):
    with open(path, encoding="utf-8") as f:
        tree = ast.parse(f.read(), path)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                yield a.name
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            yield node.module


def missing_modules(engine: str) -> dict:
    mods = load_modules(engine)
    missing = {}
    for dirpath, _dirs, names in os.walk(os.path.join(ROOT, "src")):
        for name in names:
            if not name.endswith(".py"):
                continue
            path = os.path.join(dirpath, name)
            for mod in imports_of(path):
                top = mod.split(".")[0]
                if top == "src" or top in NOT_USED_WHEN_INSTALLED or mod in mods:
                    continue
                if top in mods and not any(m.startswith(top + ".") for m in mods):
                    continue  # a single extension module, e.g. "fcntl"
                missing.setdefault(mod, set()).add(os.path.relpath(path, ROOT))
    return missing


def main() -> int:
    engine = sys.argv[1]
    missing = missing_modules(engine)
    for mod, where in sorted(missing.items()):
        print(f"missing on engine {engine}: {mod} (imported by {', '.join(sorted(where))})")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
