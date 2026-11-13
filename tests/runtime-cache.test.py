"""Offline integration tests: a cache is reusable only through the source digest."""
from pathlib import Path
from unittest import TestCase, main, mock
import hashlib
import importlib.util
import io
import json
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release_tools", ROOT / "scripts/package-release.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


def archive_bytes(extra=None, executable=b"MZ-test-runtime", version="45.1.0"):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("electron.exe", executable)
        archive.writestr("version", version)
        archive.writestr("resources/default_app.asar", b"official fixture")
        if extra:
            archive.writestr(*extra)
    return stream.getvalue()


class RuntimeTests(TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        (self.root / "package.json").write_text(json.dumps({"config": {"electronVersion": "45.1.0"}}))
        self.cache = self.root / ".build-cache"
        self.cache.mkdir()
        self.runtime = self.cache / "recovered-installer"
        self.filename = "electron-v45.1.0-win32-x64.zip"
        self.archive = self.cache / self.filename
        self.payload = archive_bytes()
        self.lock = json.loads((ROOT / "scripts/electron-runtime-lock.json").read_text())
        self.lock["sha256"] = hashlib.sha256(self.payload).hexdigest()
        self.write_lock()
        for name, value in [("ROOT", self.root), ("CACHE", self.cache), ("RUNTIME", self.runtime), ("RELEASE", self.root / "release")]:
            patch = mock.patch.object(tools, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        patch = mock.patch.object(tools, "download")
        self.download = patch.start()
        self.addCleanup(patch.stop)
        self.download.side_effect = lambda request, path: path.write_bytes(self.payload)

    def write_lock(self):
        (self.root / "scripts/electron-runtime-lock.json").write_text(json.dumps(self.lock))

    def test_verified_cache_works_without_any_network(self):
        self.archive.write_bytes(self.payload)
        self.download.side_effect = AssertionError("network must not be used")
        self.assertEqual(tools.ensure_runtime(), self.runtime)
        self.assertEqual((self.runtime / "Nine Realms.exe").read_bytes(), b"MZ-test-runtime")
        self.download.assert_not_called()

    def test_existing_executable_and_version_cannot_bypass_archive(self):
        self.runtime.mkdir()
        (self.runtime / "Nine Realms.exe").write_bytes(b"modified")
        (self.runtime / "version").write_text("45.1.0")
        self.archive.write_bytes(self.payload)
        tools.ensure_runtime()
        self.assertEqual((self.runtime / "Nine Realms.exe").read_bytes(), b"MZ-test-runtime")
        self.download.assert_not_called()

    def test_cache_miss_fetches_only_archive_and_verifies_it(self):
        tools.ensure_runtime()
        self.download.assert_called_once()
        self.assertEqual(self.download.call_args.args[0].full_url, "https://github.com/electron/electron/releases/download/v45.1.0/" + self.filename)
        self.assertEqual(self.archive.read_bytes(), self.payload)

    def test_corrupt_cache_is_replaced_only_by_verified_download(self):
        self.archive.write_bytes(b"broken cache")
        tools.ensure_runtime()
        self.assertEqual(self.archive.read_bytes(), self.payload)
        self.download.assert_called_once()

    def test_unverified_download_fails_and_cleans_partial(self):
        self.archive.write_bytes(b"corrupt")
        self.download.side_effect = lambda request, path: path.write_bytes(b"wrong download")
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
            tools.ensure_runtime()
        self.assertEqual(self.archive.read_bytes(), b"corrupt")
        self.assertFalse(self.runtime.exists())
        self.assertFalse((self.cache / (self.filename + ".part")).exists())

    def test_lock_is_mandatory_and_must_match_version(self):
        self.archive.write_bytes(self.payload)
        for key, value in [("version", "99.0.0"), ("platform", "linux"), ("arch", "arm64"), ("sha256", ""), ("filename", "other.zip")]:
            old = self.lock[key]
            self.lock[key] = value
            self.write_lock()
            with self.assertRaisesRegex(RuntimeError, "runtime lock"):
                tools.ensure_runtime()
            self.lock[key] = old
        (self.root / "scripts/electron-runtime-lock.json").unlink()
        with self.assertRaises(FileNotFoundError):
            tools.ensure_runtime()
        self.download.assert_not_called()

    def test_archive_path_and_symlink_entries_are_rejected(self):
        link = zipfile.ZipInfo("resources/link")
        link.create_system = 3
        link.external_attr = 0o120777 << 16
        for extra in [("../escape", b"bad"), ("/absolute", b"bad"), ("..\\escape", b"bad"), ("C:/escape", b"bad"), (link, b"../../escape")]:
            self.payload = archive_bytes(extra)
            self.archive.write_bytes(self.payload)
            self.lock["sha256"] = hashlib.sha256(self.payload).hexdigest()
            self.write_lock()
            with self.assertRaisesRegex(RuntimeError, "archive path"):
                tools.ensure_runtime()
        self.assertFalse(self.runtime.exists())
        self.assertFalse((self.root / "escape").exists())

    def test_wrong_runtime_payload_is_rejected(self):
        for payload in [archive_bytes(executable=b"not PE"), archive_bytes(version="99.0.0")]:
            self.payload = payload
            self.archive.write_bytes(payload)
            self.lock["sha256"] = hashlib.sha256(payload).hexdigest()
            self.write_lock()
            with self.assertRaises(RuntimeError):
                tools.ensure_runtime()
        self.assertFalse(self.runtime.exists())

    def test_cache_and_partial_symlinks_are_rejected(self):
        outside = self.root / "untouched"
        outside.write_bytes(b"original")
        for path in [self.archive, self.cache / (self.filename + ".part"), self.runtime]:
            path.symlink_to(outside)
            with self.assertRaisesRegex(RuntimeError, "Unsafe"):
                tools.ensure_runtime()
            path.unlink()
        self.assertEqual(outside.read_bytes(), b"original")


if __name__ == "__main__":
    main()
