import hashlib
import http.server
import json
import os
import re
import sys
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import add_installer_to_manifest as aim  # noqa: E402
import check_legacy_bridge  # noqa: E402
import make_engine_bundle  # noqa: E402
from src import updater  # noqa: E402

DATA = b"x" * 5000
SHA = hashlib.sha256(DATA).hexdigest()
OLD, NEW = "f750610b0c851c73", "newengine"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def v2_manifest(**kw):
    """What make_update_package + add_installer_to_manifest publish."""
    m = {
        "version": "1.0.20", "build": 20, "engine": OLD, "size": 10, "sha256": "b",
        "package_url": "http://x/app-1.0.20-for-old.zip", "format": 2,
        "latest": {"version": "1.0.20", "build": 20, "notes": "n"},
        "engine_target": NEW, "legacy_engines": [OLD],
        "packages": {NEW: {"version": "1.0.20", "build": 20, "url": "http://x/new.zip", "size": 10, "sha256": "a"},
                     OLD: {"version": "1.0.20", "build": 20, "url": "http://x/old.zip", "size": 10, "sha256": "b"}},
        "engine_bundle": {"windows": {"version": "1.0.20", "engine": NEW, "url": "u", "size": 99, "sha256": "s",
                                      "files_url": "f", "files_sha256": "fs"},
                          "linux": {"version": "1.0.20", "engine": NEW, "url": "u", "size": 99, "sha256": "s",
                                    "files_url": "f", "files_sha256": "fs"}},
        "installer_url": "http://x/Setup.exe", "installer_size": len(DATA), "installer_sha256": SHA,
        "installer_version": "1.0.20",
    }
    m.update(kw)
    return m


class Env:
    """Pretend to be an installed app: engine, build, platform, install kind."""

    def __init__(self, engine, build, platform="win32", folder=True):
        self.patches = [
            patch.object(updater, "base_info", return_value={"engine": engine, "build": build}),
            patch.object(updater, "current_info", return_value={"version": f"1.0.{build}", "build": build, "engine": engine}),
            patch.object(updater.sys, "platform", platform),
            patch.object(updater, "is_folder_install", return_value=folder),
            patch.object(updater.app_boot, "load_state", return_value={"failed": []}),
        ]

    def __enter__(self):
        for p in self.patches:
            p.start()
        return self

    def __exit__(self, *a):
        for p in reversed(self.patches):
            p.stop()


class PlanTests(unittest.TestCase):
    def test_1016_install_gets_the_bridge_package_first(self):
        with Env(OLD, 16):
            p = updater.plan_update(v2_manifest())
        self.assertEqual(p["kind"], "package")
        self.assertEqual(p["package"]["url"], "http://x/old.zip")

    def test_bridge_running_on_old_engine_then_syncs_engine(self):
        with Env(OLD, 20):
            p = updater.plan_update(v2_manifest())
        self.assertEqual(p["kind"], "engine_sync")
        self.assertTrue(p["needs_engine"])

    def test_up_to_date_install_has_nothing_to_do(self):
        with Env(NEW, 20):
            self.assertFalse(updater.plan_update(v2_manifest())["available"])

    def test_older_build_on_current_engine_gets_small_package(self):
        with Env(NEW, 19):
            p = updater.plan_update(v2_manifest())
        self.assertEqual((p["kind"], p["package"]["url"]), ("package", "http://x/new.zip"))

    def test_portable_and_installer_fallbacks(self):
        m = v2_manifest(portable_url="p", portable_size=7, portable_sha256="ps")
        with Env(OLD, 20, folder=False):
            self.assertEqual(updater.plan_update(m)["kind"], "portable")
        m = v2_manifest(); del m["engine_bundle"]
        with Env(OLD, 20):
            self.assertEqual(updater.plan_update(m)["kind"], "installer")
        with Env(OLD, 20, platform="linux"):
            self.assertIsNone(updater.plan_update(m)["kind"])  # nothing in-app possible: no web link either

    def test_old_format_manifest_still_understood(self):
        old = {"version": "1.0.19", "build": 19, "engine": NEW, "size": 5, "sha256": "a", "package_url": "http://x/a.zip"}
        with Env(NEW, 18):
            p = updater.plan_update(old)
        self.assertEqual((p["kind"], p["package"]["url"]), ("package", "http://x/a.zip"))

    def test_failed_version_not_offered_again(self):
        with Env(NEW, 19):
            with patch.object(updater.sys, "frozen", True, create=True), \
                 patch.object(updater.app_boot, "load_state", return_value={"failed": ["1.0.20"]}):
                p = updater.plan_update(v2_manifest())
        self.assertFalse(p["available"])
        self.assertTrue(p["skipped"])


class ManifestTests(unittest.TestCase):
    def built(self, d, version="1.0.20", engine=NEW):
        Path(d, f"BookNarrator-Setup-{version}.exe").write_bytes(DATA)
        Path(d, f"BookNarrator-Portable-{version}.exe").write_bytes(DATA)
        for plat in ("windows", "linux"):
            Path(d, f"BookNarrator-Engine-{plat}-{version}.zip").write_bytes(DATA)
            Path(d, f"engine-files-{plat}-{version}.json").write_text(json.dumps({"version": version, "engine": engine, "files": {}}))

    def fresh(self, bridge=True):
        m = v2_manifest()
        for k in ("engine_bundle", "installer_url", "installer_size", "installer_sha256", "installer_version"):
            m.pop(k)
        if not bridge:
            del m["packages"][OLD]
            m.update(engine=NEW, package_url="http://x/new.zip")
        return m

    def test_built_files_are_added(self):
        with tempfile.TemporaryDirectory() as d:
            self.built(d)
            m = aim.apply(self.fresh(), d, "o/r")
        self.assertEqual(m["installer_sha256"], SHA)
        self.assertEqual(m["portable_version"], "1.0.20")
        self.assertEqual(sorted(m["engine_bundle"]), ["linux", "windows"])
        self.assertTrue(m["engine_bundle"]["windows"]["url"].endswith("/v1.0.20/BookNarrator-Engine-windows-1.0.20.zip"))
        self.assertEqual(m["engine"], OLD)  # top level stays the bridge for 1.0.16

    def test_bundle_for_another_engine_is_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            self.built(d, engine="other")
            self.assertNotIn("engine_bundle", aim.apply(self.fresh(), d, "o/r"))

    def test_same_engine_carries_forward(self):
        with tempfile.TemporaryDirectory() as d:
            self.built(d)
            prev = aim.apply(self.fresh(), d, "o/r")
        nxt = self.fresh()
        nxt["latest"] = {"version": "1.0.21", "build": 21}
        m = aim.apply(nxt, "", "o/r", prev)
        self.assertEqual(m["engine_bundle"]["windows"]["version"], "1.0.20")
        self.assertEqual(m["installer_version"], "1.0.20")

    def test_other_engine_drops_entries(self):
        with tempfile.TemporaryDirectory() as d:
            self.built(d)
            prev = aim.apply(self.fresh(), d, "o/r")
        nxt = self.fresh()
        nxt["engine_target"] = "newer"
        m = aim.apply(nxt, "", "o/r", prev)
        for k in ("engine_bundle", "installer_url", "portable_url"):
            self.assertNotIn(k, m)

    def test_bridge_kept_when_it_could_not_be_built(self):
        prev = self.fresh()
        m = aim.apply(self.fresh(bridge=False), "", "o/r", prev)
        self.assertEqual(m["engine"], OLD)
        self.assertEqual(m["package_url"], prev["package_url"])
        self.assertEqual(m["packages"][OLD], prev["packages"][OLD])

    def test_current_code_runs_on_the_1016_engine(self):
        self.assertEqual(check_legacy_bridge.missing_modules(OLD), {})


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    ranges = True
    log_message = lambda *a: None  # noqa: E731

    def do_GET(self):
        path = self.translate_path(self.path)
        data = open(path, "rb").read()
        m = re.match(r"bytes=(\d+)-(\d+)", self.headers.get("Range", ""))
        type(self).requests = getattr(type(self), "requests", 0) + 1
        if m and self.ranges:
            a, b = int(m.group(1)), min(int(m.group(2)), len(data) - 1)
            body = data[a:b + 1]
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {a}-{b}/{len(data)}")
        else:
            body = data
            self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class EngineSyncTests(unittest.TestCase):
    """Real HTTP (local server) + real zip: only changed files are fetched."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        self.dist, self.install, self.www, self.root = t / "dist", t / "install", t / "www", t / "userdata"
        for d in (self.dist / "_internal" / "models", self.install / "_internal" / "models", self.www, self.root):
            d.mkdir(parents=True)
        big_same = os.urandom(3 << 20)
        files = {"book-narrator.exe": b"new exe", "_internal/same.dll": big_same,
                 "_internal/changed.dll": os.urandom(200_000), "_internal/added/new.pyd": b"new module",
                 "_internal/models/kokoro.onnx": b"model in dist"}
        for rel, data in files.items():
            (self.dist / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.dist / rel).write_bytes(data)
        old = {"book-narrator.exe": b"old exe", "_internal/same.dll": big_same, "_internal/changed.dll": b"old",
               "_internal/gone.dll": b"stale", "_internal/models/kokoro.onnx": b"user's model", "outputs/p.txt": b"mine"}
        for rel, data in old.items():
            (self.install / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.install / rel).write_bytes(data)
        with patch.object(sys, "argv", ["x", "--dist", str(self.dist), "--platform", "windows", "--version", "1.0.20",
                                        "--engine", NEW, "--out", str(self.www)]):
            make_engine_bundle.main()
        RangeHandler.requests = 0
        handler = lambda *a, **k: RangeHandler(*a, directory=str(self.www), **k)  # noqa: E731
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{self.server.server_port}"
        z = self.www / "BookNarrator-Engine-windows-1.0.20.zip"
        lst = self.www / "engine-files-windows-1.0.20.json"
        self.bundle = {"version": "1.0.20", "engine": NEW, "url": f"{base}/{z.name}", "size": z.stat().st_size,
                       "sha256": sha(z.read_bytes()), "files_url": f"{base}/{lst.name}", "files_sha256": sha(lst.read_bytes())}

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        RangeHandler.ranges = True
        self.tmp.cleanup()

    def sync(self):
        m = v2_manifest(engine_bundle={"windows": self.bundle})
        launched = {}
        with patch.object(updater.sys, "platform", "win32"), \
             patch.object(updater, "is_folder_install", return_value=True), \
             patch.object(updater.sys, "executable", str(self.install / "book-narrator.exe")), \
             patch.object(updater.app_boot, "app_root", return_value=str(self.root)), \
             patch.object(updater.time, "sleep"), \
             patch.object(updater, "_run_helper_script", side_effect=lambda n, t: launched.update(name=n, text=t)):
            updater._run_engine_sync(m)
        staged = self.root / "engine-sync-1.0.20" / "files"
        got = sorted(str(p.relative_to(staged)).replace(os.sep, "/") for p in staged.rglob("*") if p.is_file())
        return dict(updater._download), launched, got, staged

    def test_listing_never_contains_the_model(self):
        listing = json.loads((self.www / "engine-files-windows-1.0.20.json").read_text())
        self.assertNotIn("_internal/models/kokoro.onnx", listing["files"])
        self.assertNotIn("_internal/models/kokoro.onnx", zipfile.ZipFile(self.www / "BookNarrator-Engine-windows-1.0.20.zip").namelist())

    def test_only_changed_files_are_downloaded_with_ranges(self):
        st, launched, got, staged = self.sync()
        self.assertEqual(st["state"], "installing", st.get("error"))
        self.assertEqual(got, ["_internal/added/new.pyd", "_internal/changed.dll", "book-narrator.exe"])
        self.assertEqual((staged / "book-narrator.exe").read_bytes(), b"new exe")
        self.assertLess(st["done"], 1 << 20)  # the unchanged 3 MB file was not fetched
        self.assertIn("gone.dll", launched["text"])  # stale engine file removed
        for keep in ("kokoro.onnx", "p.txt"):
            self.assertNotIn(keep, launched["text"])  # model and user files untouched

    def test_server_without_ranges_downloads_whole_zip(self):
        RangeHandler.ranges = False
        st, launched, got, _ = self.sync()
        self.assertEqual(st["state"], "installing", st.get("error"))
        self.assertEqual(got, ["_internal/added/new.pyd", "_internal/changed.dll", "book-narrator.exe"])

    def test_tampered_listing_refused(self):
        self.bundle["files_sha256"] = "0" * 64
        st, launched, got, _ = self.sync()
        self.assertEqual(st["state"], "error")
        self.assertEqual(launched, {})
        self.assertFalse((self.root / "engine-sync-1.0.20").exists())


class ScriptTests(unittest.TestCase):
    def test_windows_script_waits_copies_removes_restarts(self):
        s = updater.build_patch_script(42, "C:\\a\\stage", "C:\\i", "book-narrator.exe", ["_internal/old.dll"], ["C:\\a\\stage"])
        self.assertIn('PID eq 42', s)
        self.assertLess(s.index("robocopy"), s.index("old.dll"))
        self.assertLess(s.index("old.dll"), s.index("start"))

    def test_linux_script(self):
        s = updater.build_linux_script(42, "/d/stage/files x", "/opt/bn", "book-narrator", ["/d/stage"], ["_internal/old.so"])
        self.assertIn("kill -0 42", s)
        self.assertIn("'/d/stage/files x'/. /opt/bn/", s)
        self.assertLess(s.index("cp -a"), s.index("old.so"))
        self.assertLess(s.index("old.so"), s.index("nohup"))

    def test_portable_script(self):
        s = updater.build_portable_script(7, "C:\\u\\new.exe", "D:\\bn.exe")
        self.assertIn('copy /Y "C:\\u\\new.exe" "D:\\bn.exe"', s)
        self.assertLess(s.index("copy /Y"), s.index('start ""'))


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
        launch, _, left, st = self.run_dl(v2_manifest())
        launch.assert_called_once()
        self.assertEqual(st["state"], "installing")

    def test_sha_mismatch_refuses_to_launch(self):
        launch, _, left, st = self.run_dl(v2_manifest(installer_sha256="0" * 64))
        launch.assert_not_called()
        self.assertEqual(st["state"], "error")
        self.assertEqual(left, [])

    def test_low_disk_space_refuses(self):
        launch, stream, _, st = self.run_dl(v2_manifest(), free=len(DATA))
        launch.assert_not_called()
        stream.assert_not_called()
        self.assertIn("disk space", st["error"])


class StartAndResumeTests(unittest.TestCase):
    def start(self, engine, build, allowed=None, **env):
        updater._download["state"] = "idle"
        with Env(engine, build, **env), \
             patch.object(updater, "can_self_update", return_value=True), \
             patch.object(updater, "fetch_manifest", return_value=v2_manifest()), \
             patch.object(updater.threading, "Thread") as T:
            res = updater.start_download(allowed)
            target = T.call_args.kwargs["target"] if T.called else None
        return res, target

    def test_routes(self):
        self.assertIs(self.start(OLD, 16)[1], updater._run_download)
        self.assertIs(self.start(OLD, 20)[1], updater._run_engine_sync)
        self.assertIs(self.start(OLD, 20, folder=False)[1], updater._run_installer_download)

    def test_resume_after_engine_update_only_takes_small_packages(self):
        res, target = self.start(OLD, 20, allowed=("package",))
        self.assertFalse(res["ok"]); self.assertIsNone(target)

    def test_confirm_after_bridge_starts_engine_update(self):
        state = {"failed": [], "active": None, "pending": None, "trying": "1.0.20", "previous": None}
        with patch.object(updater.sys, "frozen", True, create=True), \
             patch.object(updater, "current_info", return_value={"version": "1.0.20"}), \
             patch.object(updater.app_boot, "load_state", return_value=state), \
             patch.object(updater.app_boot, "save_state"), \
             patch.object(updater.threading, "Thread") as T:
            updater.confirm_running_version()
        self.assertEqual(T.call_args.kwargs["args"], (("engine_sync", "portable", "installer"),))

    def test_confirm_after_engine_update_fetches_small_update(self):
        state = {"failed": [], "active": None, "pending": None, "trying": None, "previous": None, "continue_update": True}
        saved = {}
        with patch.object(updater.sys, "frozen", True, create=True), \
             patch.object(updater, "current_info", return_value={"version": "1.0.20"}), \
             patch.object(updater.app_boot, "load_state", return_value=state), \
             patch.object(updater.app_boot, "save_state", side_effect=lambda s: saved.update(s)), \
             patch.object(updater.threading, "Thread") as T:
            updater.confirm_running_version()
        self.assertNotIn("continue_update", saved)
        self.assertEqual(T.call_args.kwargs["args"], (("package",),))

    def test_clean_env_drops_overlay(self):
        with patch.dict(os.environ, {"BOOKNARRATOR_APP_DIR": "/old"}):
            self.assertNotIn("BOOKNARRATOR_APP_DIR", updater._clean_env())


if __name__ == "__main__":
    unittest.main()
