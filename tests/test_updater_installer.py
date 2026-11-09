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

    def test_missing_fields_refuse_without_a_web_link(self):
        m = manifest(); del m["installer_sha256"]
        res, inst, pkg = self.start(m, True)
        self.assertFalse(res["ok"]); self.assertNotIn("installer_url", res)
        inst.assert_not_called()

    def test_non_windows_falls_back(self):
        res, inst, _ = self.start(manifest(), True, platform="linux")
        self.assertFalse(res["ok"]); inst.assert_not_called()


class EnginePatchTests(unittest.TestCase):
    def test_patch_routing_and_base_engine(self):
        m = manifest(engine_patch={"url": "u", "size": 5, "sha256": "a", "base_engine": "old"})
        with patch.object(updater.sys, "platform", "win32"), \
             patch.object(updater, "base_info", return_value={"engine": "old"}):
            self.assertIsNotNone(updater.engine_patch_for_this_install(m))
        with patch.object(updater.sys, "platform", "win32"), \
             patch.object(updater, "base_info", return_value={"engine": "other"}):
            self.assertIsNone(updater.engine_patch_for_this_install(m))  # too old: full installer

    def test_script_waits_copies_removes_restarts(self):
        s = updater.build_patch_script(42, "C:\\a\\stage", "C:\\i", "book-narrator.exe", ["_internal/old.dll"], ["C:\\a\\stage"])
        self.assertIn('PID eq 42', s)
        self.assertLess(s.index("robocopy"), s.index("old.dll"))
        self.assertLess(s.index("old.dll"), s.index("start"))

    def test_patch_build_and_manifest(self):
        import make_engine_patch as mep, zipfile as zf
        with tempfile.TemporaryDirectory() as d:
            dist = Path(d, "dist"); (dist / "_internal").mkdir(parents=True)
            (dist / "a.exe").write_bytes(b"new"); (dist / "_internal" / "big.bin").write_bytes(b"same")
            prev = {"version": "1.0.1", "engine": "old", "files": {
                "a.exe": [3, "x"], "_internal/big.bin": [4, hashlib.sha256(b"same").hexdigest()], "_internal/gone.dll": [1, "y"]}}
            Path(d, "prev.json").write_text(json.dumps(prev))
            out = Path(d, "out")
            with patch.object(sys, "argv", ["x", "--dist", str(dist), "--version", "1.0.2", "--engine", "new",
                                            "--prev", str(Path(d, "prev.json")), "--out", str(out)]):
                mep.main()
            z = zf.ZipFile(out / "BookNarrator-EnginePatch-1.0.2.zip")
            self.assertEqual(sorted(z.namelist()), ["files/a.exe", "patch.json"])  # big file left out
            self.assertEqual(json.loads(z.read("patch.json"))["remove"], ["_internal/gone.dll"])
            m = aim.apply({"version": "1.0.2", "engine": "new"}, str(out), "o/r")
            self.assertEqual(m["engine_patch"]["base_engine"], "old")
            self.assertNotIn("installer_url", m)  # no installer in this dir


class CarryForwardTests(unittest.TestCase):
    PREV = {"version": "1.0.18", "engine": "E", "installer_url": "https://x/v1.0.18/BookNarrator-Setup-1.0.18.exe",
            "installer_size": 400, "installer_sha256": "s1", "linux_url": "https://x/l.tar.gz", "linux_size": 450,
            "linux_sha256": "s2", "engine_patch": {"url": "p", "size": 5, "sha256": "s3", "base_engine": "OLD"}}

    def test_same_engine_keeps_previous_entries(self):
        m = aim.apply({"version": "1.0.19", "engine": "E"}, "", "o/r", self.PREV)
        self.assertEqual(m["installer_url"], self.PREV["installer_url"])
        self.assertEqual(m["installer_version"], "1.0.18")
        self.assertEqual(m["linux_version"], "1.0.18")
        self.assertEqual(m["engine_patch"]["version"], "1.0.18")
        # and once more: the original version is kept, not the carrying one
        m2 = aim.apply({"version": "1.0.20", "engine": "E"}, "", "o/r", m)
        self.assertEqual(m2["installer_version"], "1.0.18")
        self.assertEqual(m2["engine_patch"]["version"], "1.0.18")

    def test_other_engine_drops_everything(self):
        m = aim.apply({"version": "1.0.19", "engine": "NEW"}, "", "o/r", self.PREV)
        for k in ("installer_url", "linux_url", "engine_patch"):
            self.assertNotIn(k, m)

    def test_new_build_wins_over_previous(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, "BookNarrator-Setup-1.0.19.exe").write_bytes(DATA)
            Path(d, "BookNarrator-Linux-1.0.19.tar.gz").write_bytes(DATA)
            m = aim.apply({"version": "1.0.19", "engine": "E"}, d, "o/r", self.PREV)
            self.assertEqual(m["installer_version"], "1.0.19")
            self.assertEqual(m["installer_sha256"], SHA)
            self.assertEqual(m["linux_version"], "1.0.19")
            self.assertTrue(m["linux_url"].endswith("/v1.0.19/BookNarrator-Linux-1.0.19.tar.gz"))


class LinuxTests(unittest.TestCase):
    def test_linux_routes_to_bundle(self):
        m = manifest(linux_url="u", linux_size=5, linux_sha256="a")
        with patch.object(updater.sys, "platform", "linux"):
            self.assertEqual(updater.engine_update_route(m)["kind"], "linux_bundle")
        with patch.object(updater.sys, "platform", "win32"):
            self.assertEqual(updater.engine_update_route(m)["kind"], "installer")

    def test_script_waits_copies_restarts(self):
        s = updater.build_linux_script(42, "/d/stage/book narrator", "/opt/bn", "book-narrator", ["/d/stage"])
        self.assertIn("kill -0 42", s)
        self.assertIn("'/d/stage/book narrator'/. /opt/bn/", s)
        self.assertLess(s.index("cp -a"), s.index("nohup"))
        self.assertLess(s.index("rm -rf /d/stage"), s.index("nohup"))

    def make_tar(self, d, version="1.0.18", engine="new"):
        import tarfile as tf, io
        src = Path(d, "src", "book-narrator"); (src / "_internal").mkdir(parents=True)
        (src / "book-narrator").write_bytes(b"elf")
        (src / "_internal" / "version.json").write_text(json.dumps({"version": version, "engine": engine}))
        out = Path(d, "b.tar.gz")
        with tf.open(out, "w:gz") as t:
            t.add(src, arcname="book-narrator")
        return out.read_bytes()

    def run_bundle(self, data, **kw):
        with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as inst, \
             patch.object(updater.app_boot, "app_root", return_value=d), \
             patch.object(updater.sys, "executable", os.path.join(inst, "book-narrator")), \
             patch.object(updater, "_stream_to_file") as stream, \
             patch.object(updater, "_launch_linux_helper") as launch, \
             patch.object(updater.time, "sleep"):
            def fake(url, part, size):
                Path(part).write_bytes(data)
                return len(data), hashlib.sha256(data).hexdigest()
            stream.side_effect = fake
            m = manifest(linux_url="u", linux_size=len(data), linux_sha256=hashlib.sha256(data).hexdigest(),
                         linux_version="1.0.18", **kw)
            updater._run_linux_bundle(m)
            st = dict(updater._download)
            bundle = launch.call_args[0][0] if launch.called else None
            ok_bundle = bool(bundle and os.path.isfile(os.path.join(bundle, "book-narrator")))
            return launch, st, ok_bundle, os.listdir(d)

    def test_good_bundle_launches_helper(self):
        with tempfile.TemporaryDirectory() as t:
            data = self.make_tar(t)
        launch, st, ok_bundle, _ = self.run_bundle(data)
        launch.assert_called_once()
        self.assertTrue(ok_bundle)
        self.assertEqual(st["state"], "installing")

    def test_wrong_engine_refuses(self):
        with tempfile.TemporaryDirectory() as t:
            data = self.make_tar(t, engine="other")
        launch, st, _, left = self.run_bundle(data)
        launch.assert_not_called()
        self.assertEqual(st["state"], "error")
        self.assertEqual(left, [])


class ResumeTests(unittest.TestCase):
    def test_engine_patch_version_from_patch_entry(self):
        m = manifest(version="1.0.19", engine_patch={"url": "u", "size": 5, "sha256": "a", "base_engine": "old",
                                                      "version": "1.0.18"})
        with patch.object(updater.sys, "platform", "win32"), \
             patch.object(updater, "base_info", return_value={"engine": "old"}), \
             patch.object(updater.app_boot, "app_root", return_value=tempfile.mkdtemp()), \
             patch.object(updater, "_stream_to_file", side_effect=RuntimeError("stop")) as stream:
            updater._run_engine_patch(m)
            self.assertIn("EnginePatch-1.0.18.zip", stream.call_args[0][1])

    def test_confirm_resumes_small_update_once(self):
        state = {"failed": [], "active": None, "pending": None, "trying": None, "previous": None,
                 "continue_update": True}
        saved = {}
        with patch.object(updater.sys, "frozen", True, create=True), \
             patch.object(updater, "current_info", return_value={"version": "1.0.18"}), \
             patch.object(updater.app_boot, "load_state", return_value=state), \
             patch.object(updater.app_boot, "save_state", side_effect=lambda s: saved.update(s)), \
             patch.object(updater.threading, "Thread") as T:
            updater.confirm_running_version()
            self.assertNotIn("continue_update", saved)
            T.assert_called_once()

    def test_resume_never_chains_an_engine_update(self):
        with patch.object(updater, "status", return_value={"update_available": True, "needs_installer": True}), \
             patch.object(updater, "start_download") as sd:
            updater._resume_small_update()
            sd.assert_not_called()

    def test_clean_env_drops_overlay(self):
        with patch.dict(os.environ, {"BOOKNARRATOR_APP_DIR": "/old"}):
            self.assertNotIn("BOOKNARRATOR_APP_DIR", updater._clean_env())


if __name__ == "__main__":
    unittest.main()
