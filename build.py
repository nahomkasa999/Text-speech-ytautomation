#!/usr/bin/env python3
"""
Interactive Standalone App Builder
Builds the desktop app with PyInstaller and, on Windows, can wrap it into a
single BookNarrator-Setup.exe installer (needs Inno Setup 6: https://jrsoftware.org/isdl.php).

The GitHub Actions workflow (.github/workflows/build.yml) does all of this
automatically when you push a tag like v1.0.0.
"""

import os
import sys
import shutil
import subprocess
import urllib.request

MODEL_FILES = {
    "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}


def ask(prompt, default):
    val = input(f"{prompt} [{default}]: ").strip()
    return val if val else default


def ensure_models():
    os.makedirs("models", exist_ok=True)
    for name, url in MODEL_FILES.items():
        path = os.path.join("models", name)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            continue
        print(f"Downloading {name} (one time)...")
        urllib.request.urlretrieve(url, path)


def find_iscc():
    candidates = [
        shutil.which("iscc"),
        os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Inno Setup 6", "ISCC.exe"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Inno Setup 6", "ISCC.exe"),
    ]
    return next((c for c in candidates if c and os.path.exists(c)), None)


def main():
    print("==================================================")
    print("   🎙️  AI Book Narrator & YouTube Studio Builder   ")
    print("==================================================")
    print("Adjust your build specifications below:\n")

    app_name = ask("1. Application Name", "book-narrator")

    print("\nPackaging Style:")
    print("  [1] Folder (Recommended: opens in ~2s; on Windows also builds a single Setup.exe installer)")
    print("  [2] Portable single .exe (no install, but unpacks itself on every launch: ~5-20s)")
    pack_choice = ask("Select packaging style (1 or 2)", "1")
    onefile = "true" if pack_choice == "2" else "false"

    bundle_models = ask("\n2. Bundle 330MB Kokoro models inside? (Y/n)", "Y").lower().startswith("y")
    show_console = ask("3. Show debug terminal console on launch? (y/N)", "N").lower().startswith("y")
    version = ask("4. Version", "1.0.0")

    if bundle_models:
        ensure_models()

    # Set environment variables for book_narrator.spec
    env = os.environ.copy()
    env["APP_NAME"] = app_name
    env["ONEFILE"] = onefile
    env["BUNDLE_MODELS"] = "true" if bundle_models else "false"
    env["SHOW_CONSOLE"] = "true" if show_console else "false"

    print("\nBuilding standalone app with specifications:")
    print(f"  • Name:           {app_name}")
    print(f"  • Format:         {'Portable Single Executable' if onefile == 'true' else 'Folder (+ installer on Windows)'}")
    print(f"  • Bundle Models:  {bundle_models}")
    print(f"  • Console Window: {show_console}")
    print("--------------------------------------------------\n")

    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "book_narrator.spec"]
    res = subprocess.run(cmd, env=env)
    if res.returncode != 0:
        print(f"\n❌ Build failed with return code {res.returncode}")
        sys.exit(res.returncode)

    print("\n🎉 Build successful! Output is available in the 'dist/' folder.")

    if onefile == "false" and sys.platform == "win32":
        iscc = find_iscc()
        if not iscc:
            print("ℹ️  Install Inno Setup 6 (https://jrsoftware.org/isdl.php) and re-run to also get a single Setup.exe.")
            return
        res = subprocess.run([iscc, f"/DAppVersion={version}", f"/DAppExeName={app_name}",
                              os.path.join("installer", "book_narrator.iss")])
        if res.returncode == 0:
            print(f"📦 Installer ready: dist\\installer\\BookNarrator-Setup-{version}.exe")
        else:
            print(f"❌ Installer build failed with return code {res.returncode}")


if __name__ == "__main__":
    main()
