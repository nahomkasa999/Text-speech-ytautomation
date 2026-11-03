#!/usr/bin/env python3
"""
Interactive Standalone App Builder
Allows you to adjust build specifications via terminal prompts or CLI flags.
"""

import os
import sys
import subprocess

def ask(prompt, default):
    val = input(f"{prompt} [{default}]: ").strip()
    return val if val else default

def main():
    print("==================================================")
    print("   🎙️  AI Book Narrator & YouTube Studio Builder   ")
    print("==================================================")
    print("Adjust your build specifications below:\n")

    app_name = ask("1. Application Name", "book-narrator")
    
    print("\nPackaging Style:")
    print("  [1] Folder / onedir (Recommended: Opens instantly in 1s)")
    print("  [2] Single File / onefile (1 standalone .exe file, unzips to temp on launch)")
    pack_choice = ask("Select packaging style (1 or 2)", "1")
    onefile = "true" if pack_choice == "2" else "false"

    bundle_models = ask("\n2. Bundle 330MB Kokoro models inside? (Y/n)", "Y").lower().startswith("y")
    show_console = ask("3. Show debug terminal console on launch? (y/N)", "N").lower().startswith("y")

    # Set environment variables for book_narrator.spec
    env = os.environ.copy()
    env["APP_NAME"] = app_name
    env["ONEFILE"] = onefile
    env["BUNDLE_MODELS"] = "true" if bundle_models else "false"
    env["SHOW_CONSOLE"] = "true" if show_console else "false"

    print("\nBuilding standalone app with specifications:")
    print(f"  • Name:           {app_name}")
    print(f"  • Format:         {'Single Executable' if onefile == 'true' else 'Directory Bundle'}")
    print(f"  • Bundle Models:  {bundle_models}")
    print(f"  • Console Window: {show_console}")
    print("--------------------------------------------------\n")

    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "book_narrator.spec"]
    res = subprocess.run(cmd, env=env)

    if res.returncode == 0:
        print("\n🎉 Build successful! Output is available in the 'dist/' folder.")
    else:
        print(f"\n❌ Build failed with return code {res.returncode}")

if __name__ == "__main__":
    main()
