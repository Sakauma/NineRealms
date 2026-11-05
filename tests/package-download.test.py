"""Exercise download retries without making network requests."""
from pathlib import Path
from unittest import TestCase, main, mock
import importlib.util
import io
import tempfile
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release_tools", ROOT / "scripts/package-release.py")
release_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_tools)


def http_error(code):
    return urllib.error.HTTPError("https://example.test/runtime", code, "test", {}, None)


class InterruptedStream(io.BytesIO):
    def __init__(self):
        super().__init__(b"partial")
        self.reads = 0

    def read(self, size=-1):
        self.reads += 1
        if self.reads > 1:
            raise ConnectionResetError("connection lost")
        return super().read(size)


class DownloadTests(TestCase):
    @mock.patch.object(release_tools.time, "sleep")
    @mock.patch.object(release_tools.urllib.request, "urlopen")
    def test_retries_temporary_http_errors(self, urlopen, sleep):
        urlopen.side_effect = [http_error(504), http_error(503), io.BytesIO(b"checksum")]
        self.assertEqual(release_tools.download("https://example.test"), b"checksum")
        self.assertEqual(urlopen.call_count, 3)
        self.assertEqual(sleep.call_args_list, [mock.call(2), mock.call(4)])

    @mock.patch.object(release_tools.time, "sleep")
    @mock.patch.object(release_tools.urllib.request, "urlopen")
    def test_does_not_retry_permanent_http_errors(self, urlopen, sleep):
        urlopen.side_effect = http_error(404)
        with self.assertRaises(urllib.error.HTTPError):
            release_tools.download("https://example.test")
        self.assertEqual(urlopen.call_count, 1)
        sleep.assert_not_called()

    @mock.patch.object(release_tools.time, "sleep")
    @mock.patch.object(release_tools.urllib.request, "urlopen")
    def test_restarts_partial_download(self, urlopen, sleep):
        urlopen.side_effect = [InterruptedStream(), io.BytesIO(b"complete")]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "archive.part"
            release_tools.download("https://example.test", output)
            self.assertEqual(output.read_bytes(), b"complete")
        self.assertEqual(urlopen.call_count, 2)
        sleep.assert_called_once_with(2)

    @mock.patch.object(release_tools.time, "sleep")
    @mock.patch.object(release_tools.urllib.request, "urlopen")
    def test_fails_after_retry_limit(self, urlopen, sleep):
        urlopen.side_effect = http_error(504)
        with self.assertRaises(urllib.error.HTTPError):
            release_tools.download("https://example.test")
        self.assertEqual(urlopen.call_count, 4)
        self.assertEqual(sleep.call_args_list, [mock.call(2), mock.call(4), mock.call(8)])


if __name__ == "__main__":
    main()
