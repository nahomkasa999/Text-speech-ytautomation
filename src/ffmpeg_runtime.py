"""Resolve the local CPU FFmpeg executable without downloading at runtime."""

import shutil
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

REQUIRED_ENCODERS = frozenset({"libx264", "aac", "libvpx-vp9", "libopus"})
HARDWARE_ENCODERS = {
    'h264_qsv': ['-preset', 'veryfast', '-look_ahead', '0'],
    'h264_nvenc': ['-preset', 'p1'],
    'h264_amf': ['-quality', 'speed', '-usage', 'transcoding'],
}


class FFmpegUnavailable(RuntimeError):
    """The installed media engine is missing or lacks required encoders."""


def wheel_ffmpeg() -> Path:
    """Return only the binary shipped in the pinned imageio-ffmpeg wheel."""
    import imageio_ffmpeg
    from imageio_ffmpeg._definitions import FNAME_PER_PLATFORM, get_platform

    return Path(imageio_ffmpeg.__file__).parent / "binaries" / FNAME_PER_PLATFORM[get_platform()]


def resolve_ffmpeg() -> str:
    if getattr(sys, "frozen", False):
        name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
        path = Path(sys._MEIPASS) / "ffmpeg" / name
    else:
        try:
            path = wheel_ffmpeg()
        except (ImportError, KeyError):
            path = Path(shutil.which("ffmpeg") or "")
        if not path.is_file():
            path = Path(shutil.which("ffmpeg") or "")
    if not path.is_file():
        if getattr(sys, "frozen", False):
            # The installer bundles FFmpeg. It is only absent when this install
            # predates the bundled media engine (an app-code update does not add
            # it), when an engine update did not finish, or when antivirus removed it.
            raise FFmpegUnavailable(
                f"The bundled FFmpeg media engine was not found at {path}. This install is missing part of "
                "the app: install the pending update from the update dialog (it restores the media engine) "
                "or reinstall with the latest BookNarrator-Setup. If it keeps disappearing, check that "
                "antivirus did not quarantine ffmpeg.exe."
            )
        raise FFmpegUnavailable("FFmpeg is missing. Install the project requirements (imageio-ffmpeg) or put ffmpeg on PATH.")
    return str(path.resolve())


def validate_ffmpeg(executable: str | Path | None = None) -> str:
    """Check the actual executable's CPU encoders and return its absolute path."""
    path = str(Path(executable).resolve()) if executable is not None else resolve_ffmpeg()
    try:
        result = subprocess.run(
            [path, "-hide_banner", "-encoders"], capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=20,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise FFmpegUnavailable(f"Cannot start the FFmpeg media engine: {exc}") from exc
    encoders = {fields[1] for line in result.stdout.splitlines() if len(fields := line.split()) >= 2}
    missing = REQUIRED_ENCODERS - encoders
    if result.returncode or missing:
        raise FFmpegUnavailable("FFmpeg lacks required CPU encoders: " + ", ".join(sorted(missing or REQUIRED_ENCODERS)))
    return path


def hardware_encoder_options(encoder: str, bitrate: int, fps: int) -> list[str]:
    return ['-c:v', encoder, '-pix_fmt', 'nv12', '-bf', '0',
            *HARDWARE_ENCODERS[encoder], '-b:v', str(bitrate), '-maxrate', str(bitrate),
            '-bufsize', str(bitrate), '-g', str(fps * 2)]


def select_video_encoder(executable: str, width: int, height: int, fps: int,
                         preference: str = 'auto') -> str:
    if preference == 'cpu':
        return 'libx264'
    if preference != 'auto':
        raise ValueError('Invalid video encoder preference.')
    path = Path(executable).resolve()
    try:
        stat = path.stat()
    except OSError:
        return 'libx264'
    return _probe_video_encoder(str(path), stat.st_mtime_ns, stat.st_size, width, height, fps)


@lru_cache(maxsize=32)
def _probe_video_encoder(executable, modified, size, width, height, fps):
    options = dict(capture_output=True, timeout=3,
                   creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
    try:
        result = subprocess.run([executable, '-hide_banner', '-encoders'], **options)
    except (OSError, subprocess.TimeoutExpired):
        return 'libx264'
    if result.returncode:
        return 'libx264'
    advertised = {fields[1] for line in result.stdout.decode('utf-8', errors='replace').splitlines()
                  if len(fields := line.split()) >= 2}
    bitrate = max(500_000, min(8_000_000, (8_000_000 * width * height * fps + 62_207_999) // 62_208_000))
    for encoder in HARDWARE_ENCODERS:
        if encoder not in advertised:
            continue
        command = [executable, '-hide_banner', '-loglevel', 'error', '-nostdin',
                   '-f', 'lavfi', '-i', f'color=c=black:s={width}x{height}:r={fps}',
                   '-frames:v', '2', '-an', *hardware_encoder_options(encoder, bitrate, fps),
                   '-f', 'h264', 'pipe:1']
        try:
            result = subprocess.run(command, **options)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if result.returncode == 0 and result.stdout:
            return encoder
    return 'libx264'


if __name__ == "__main__":
    print(validate_ffmpeg(sys.argv[1] if len(sys.argv) > 1 else None))
