"""Resolve the local CPU FFmpeg executable without downloading at runtime."""

import shutil
import subprocess
import sys
from pathlib import Path

REQUIRED_ENCODERS = frozenset({"libx264", "aac", "libvpx-vp9", "libopus"})


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


if __name__ == "__main__":
    print(validate_ffmpeg(sys.argv[1] if len(sys.argv) > 1 else None))
