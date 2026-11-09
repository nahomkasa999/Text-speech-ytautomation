# -*- mode: python ; coding: utf-8 -*-
"""
Dynamic PyInstaller Spec for AI Book Narrator & YouTube Studio
All specifications can be adjusted via environment variables or GitHub Actions inputs:
- APP_NAME: custom executable name (default: book-narrator)
- BUNDLE_MODELS: whether to bundle 330MB ONNX models inside (default: true)
- ONEFILE: single file .exe vs folder (default: false)
- SHOW_CONSOLE: show console window on launch (default: false)
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path
from importlib.metadata import distribution
from PyInstaller.utils.hooks import collect_all
from src.ffmpeg_runtime import wheel_ffmpeg, validate_ffmpeg

block_cipher = None

# Configurable inputs from environment variables
APP_NAME = os.environ.get('APP_NAME', 'book-narrator').strip() or 'book-narrator'
BUNDLE_MODELS = os.environ.get('BUNDLE_MODELS', 'true').strip().lower() in ('true', '1', 'yes')
ONEFILE = os.environ.get('ONEFILE', 'false').strip().lower() in ('true', '1', 'yes')
SHOW_CONSOLE = os.environ.get('SHOW_CONSOLE', 'false').strip().lower() in ('true', '1', 'yes')

datas = [
    ('static', 'static'),
]

# version.json (written by CI) tells the in-app updater which version and
# engine (set of libraries) this installer contains.
if os.path.exists('version.json'):
    datas.append(('version.json', '.'))

if BUNDLE_MODELS and os.path.exists('models'):
    datas.append(('models', 'models'))

binaries = []
hiddenimports = []

# Require the wheel binary itself. Never silently package PATH's FFmpeg.
ffmpeg = wheel_ffmpeg()
validate_ffmpeg(ffmpeg)
ffmpeg_dir = Path('build/ffmpeg-runtime')
ffmpeg_dir.mkdir(parents=True, exist_ok=True)
packaged_ffmpeg = ffmpeg_dir / ('ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg')
shutil.copy2(ffmpeg, packaged_ffmpeg)
binaries.append((str(packaged_ffmpeg), 'ffmpeg'))
for filename in ('FFMPEG-NOTICE.txt', 'GPL-3.0.txt'):
    datas.append((str(Path('licenses') / filename), 'licenses'))
wheel_license = distribution('imageio-ffmpeg').locate_file('imageio_ffmpeg-0.6.0.dist-info/LICENSE')
if not wheel_license.is_file():
    raise RuntimeError('The imageio-ffmpeg wheel license is missing')
shutil.copy2(wheel_license, ffmpeg_dir / 'imageio-ffmpeg-LICENSE.txt')
datas.append((str(ffmpeg_dir / 'imageio-ffmpeg-LICENSE.txt'), 'licenses'))
build_notice = ffmpeg_dir / 'ffmpeg-build.txt'
build_notice.write_text('\n'.join(
    subprocess.check_output([str(ffmpeg), option], stderr=subprocess.STDOUT, text=True)
    for option in ('-version', '-L')
), encoding='utf-8')
datas.append((str(build_notice), 'licenses'))

# Packages that ship data files / native libraries the local Kokoro engine needs:
#   kokoro_onnx     -> config.json (required at runtime)
#   espeakng_loader -> libespeak-ng (.dll/.so) + espeak-ng-data voices
#   phonemizer      -> share/ data files
for pkg in ('kokoro_onnx', 'espeakng_loader', 'phonemizer'):
    try:
        pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
        datas += pkg_datas
        binaries += pkg_binaries
        hiddenimports += pkg_hidden
    except Exception as exc:
        print(f"[spec] warning: could not collect {pkg}: {exc}")

hiddenimports += [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'kokoro_onnx',
    'onnxruntime',
    'soundfile',
    'numpy',
    # Standard-library modules that small in-app updates may start using even
    # though the current code does not (updates can't add modules to the .exe).
    'zipfile', 'hashlib', 'hmac', 'uuid', 'shutil', 'tempfile', 'subprocess',
    'urllib.request', 'urllib.parse', 'http.client', 'email.utils', 'csv',
    'sqlite3', 'xml.etree.ElementTree', 'difflib', 'statistics', 'dataclasses',
    'decimal', 'fractions', 'random', 'secrets', 'textwrap', 'unicodedata',
    'concurrent.futures', 'queue', 'colorsys', 'wave', 'struct', 'zlib', 'gzip',
    'io', 'pathlib', 'glob', 'fnmatch', 'heapq', 'bisect', 'itertools',
    'functools', 'operator', 'copy', 'pprint', 'string', 're', 'datetime',
    'calendar', 'locale', 'platform', 'getpass', 'socket', 'ssl', 'html',
    'html.parser', 'mimetypes', 'base64', 'binascii', 'array', 'math',
]

a = Analysis(
    ['desktop.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'torch'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

if ONEFILE:
    # Single standalone .exe file
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name=APP_NAME,
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=SHOW_CONSOLE,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    )
else:
    # Fast-starting directory bundle (recommended for 300MB+ models)
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name=APP_NAME,
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        console=SHOW_CONSOLE,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    )
    coll = COLLECT(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        strip=False,
        upx=False,
        upx_exclude=[],
        name=APP_NAME,
    )
