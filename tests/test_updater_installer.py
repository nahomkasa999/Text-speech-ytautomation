import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import add_installer_to_manifest as aim  # noqa: E402
from src import updater  # noqa: E402

DATA = b"x" * 5000
SHA = hashlib.sha256(DATA).hexdigest()


def manifest(**kw):
    m = {"version": "1.0.9", "build": 9, "engine": "new", "size": 10, "sha256": "a",
         "package_url": "http://x/app.zip", "installer_url": "http://x/Setup.exe",
         "installer_size": len(DATA), "installer_sha256": SHA}
    m.update(kw)
    return m


class ManifestTests(unittest.TestCase):
    def test_fields_only_when_new_installer_exists(self):
        with tempfile.TemporaryDirectory() as d:
            m = aim.apply({"version": "1.0.9", "installer_url": "stale"}, d, "o/r")
            self.assertNotIn("installer_url", m)  # no installer: stale fields removed
            Path(d, "BookNarrator-Setup-1.0.8.exe").write_bytes(b"old")
            self.assertNotIn("installer_sha256", aim.apply({"version": "1.0.9"}, d, "o/r"))
            Path(d, "BookNarrator-Setup-1.0.9.exe").write_bytes(DATA)
            m = aim.apply({"version": "1.0.9"}, d, "o/r")
            self.assertEqual(m["installer_sha256"], SHA)
            self.assertEqual(m["installer_size"], len(DATA))
            self.assertEqual(m["installer_url"],
                             "https://github.com/o/r/releases/download/v1.0.9/BookNarrator-Setup-1.0.9.exe")


class InstallerDownloadTests(unittest.TestCase):
    def run_dl(self, m, data=DATA, free=10**9):
        with tempfile.TemporaryDirectory() as d, \
             patch.object(updater.app_boot, "app_root", return_value=d), \
             patch.object(updater, "_stream_to_file") as stream, \
             patch.object(updater, "_launch_installer") as launch, \
             patch.object(updater.time, "sleep"), \
             patch.object(updater.shutil, "disk_usage") as du:
            du.return_value.free = free

            def fake(url, part, size):
                Path(part).write_bytes(data)
                return len(data), hashlib.sha256(data).hexdigest()
            stream.side_effect = fake
            updater._run_installer_download(m)
            return launch, stream, os.listdir(d), dict(updater._download)

    def test_good_download_launches(self):
        launch, _, left, st = self.run_dl(manifest())
        launch.assert_called_once()
        self.assertEqual(st["state"], "installing")

    def test_sha_mismatch_refuses_to_launch(self):
        launch, _, left, st = self.run_dl(manifest(installer_sha256="0" * 64))
        launch.assert_not_called()
        self.assertEqual(st["state"], "error")
        self.assertEqual(left, [])  # partial file deleted

    def test_size_mismatch_refuses_to_launch(self):
        launch, *_ = self.run_dl(manifest(installer_size=len(DATA) + 1))
        launch.assert_not_called()

    def test_low_disk_space_refuses(self):
        launch, stream, _, st = self.run_dl(manifest(), free=len(DATA))
        launch.assert_not_called()
        stream.assert_not_called()
        self.assertIn("disk space", st["error"])


class RoutingTests(unittest.TestCase):
    def start(self, m, needs_installer, platform="win32"):
        info = {"update_available": True, "needs_installer": needs_installer, "installer_url": updater.INSTALLER_PAGE}
        updater._download["state"] = "idle"
        with patch.object(updater, "can_self_update", return_value=True), \
             patch.object(updater, "status", return_value=info), \
             patch.dict(updater._manifest_cache, {"data": m}), \
             patch.object(updater.sys, "platform", platform), \
             patch.object(updater, "_run_installer_download") as inst, \
             patch.object(updater, "_run_download") as pkg, \
             patch.object(updater.threading, "Thread") as T:
            T.side_effect = lambda target, args, daemon: type("t", (), {"start": lambda self: target(*args)})()
            res = updater.start_download()
            return res, inst, pkg

    def test_engine_change_uses_installer(self):
        res, inst, pkg = self.start(manifest(), True)
        self.assertTrue(res["ok"]); inst.assert_called_once(); pkg.assert_not_called()

    def test_code_only_uses_zip(self):
        res, inst, pkg = self.start(manifest(), False)
        self.assertTrue(res["ok"]); pkg.assert_called_once(); inst.assert_not_called()

    def test_missing_fields_fall_back(self):
        m = manifest(); del m["installer_sha256"]
        res, inst, pkg = self.start(m, True)
        self.assertFalse(res["ok"]); self.assertIn("installer_url", res)
        inst.assert_not_called()

    def test_non_windows_falls_back(self):
        res, inst, _ = self.start(manifest(), True, platform="linux")
        self.assertFalse(res["ok"]); inst.assert_not_called()


if __name__ == "__main__":
    unittest.main()
