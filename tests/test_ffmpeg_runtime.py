import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.ffmpeg_runtime import FFmpegUnavailable, resolve_ffmpeg, validate_ffmpeg


class FFmpegRuntimeTests(unittest.TestCase):
    def test_frozen_missing_binary_never_uses_system_path(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(sys, 'frozen', True, create=True), patch.object(sys, '_MEIPASS', directory, create=True):
                with patch('src.ffmpeg_runtime.shutil.which') as which:
                    with self.assertRaises(FFmpegUnavailable):
                        resolve_ffmpeg()
                    which.assert_not_called()

    def test_frozen_resolves_binary_in_bundle_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix='app with spaces ') as directory:
            binary = Path(directory) / 'ffmpeg' / ('ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg')
            binary.parent.mkdir()
            binary.touch()
            with patch.object(sys, 'frozen', True, create=True), patch.object(sys, '_MEIPASS', directory, create=True):
                self.assertEqual(resolve_ffmpeg(), str(binary.resolve()))

    def test_missing_required_encoder_is_reported(self):
        output = subprocess.CompletedProcess([], 0, stdout=' V..... libx264\n A..... aac\n V..... libvpx-vp9\n')
        with patch('src.ffmpeg_runtime.subprocess.run', return_value=output):
            with self.assertRaisesRegex(FFmpegUnavailable, 'libopus'):
                validate_ffmpeg('/example/ffmpeg')


if __name__ == '__main__':
    unittest.main()
