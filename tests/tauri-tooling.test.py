"""Tests command plans and conservative evidence without invoking a native compiler."""
from pathlib import Path
import importlib.util
import json
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("tauri_tools", ROOT / "scripts/tauri.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


class BuildPlans(unittest.TestCase):
    def info(self):
        return {"cli": ["cargo", "tauri"], "tools": {x: "/tool/" + x for x in ["cargo", "rustc", "cargo-xwin", "lld-link", "llvm-rc", "makensis"]},
                "versions": {"tauri-cli": {"exit_code": 0, "output": "tauri-cli 2.12.4"}}, "expected_cli": "2.12.4", "display_present": False,
                "system_libraries": {x: {"exit_code": 0} for x in ["webkit2gtk-4.1", "gtk+-3.0", "openssl"]}}

    def test_windows_msvc_nsis_and_explicit_offline_runtime(self):
        with patch.object(tools.platform, "system", return_value="Linux"):
            online = tools.plan("windows", self.info())
            offline = tools.plan("windows", self.info(), True)
        self.assertEqual(online[-2:], ["--runner", "cargo-xwin"])
        self.assertIn("x86_64-pc-windows-msvc", online)
        self.assertIn("nsis", online)
        overlay = json.loads(offline[offline.index("--config") + 1])
        self.assertEqual(overlay["bundle"]["windows"]["webviewInstallMode"]["type"], "offlineInstaller")
        self.assertNotIn("bundle", json.loads(online[online.index("--config") + 1]))

    def test_missing_compiler_cli_and_libraries_are_blockers(self):
        info = self.info()
        info["tools"]["cargo"] = None
        info["cli"] = None
        info["system_libraries"]["webkit2gtk-4.1"] = {"exit_code": 1}
        with patch.object(tools.platform, "system", return_value="Linux"):
            errors = tools.prerequisites("native", info)
        self.assertIn("Missing cargo", errors)
        self.assertIn("Missing Tauri CLI 2.12.4", errors)
        self.assertIn("Missing development library webkit2gtk-4.1", errors)

    def test_cli_version_guard_and_native_vs_check(self):
        info = self.info()
        info["versions"]["tauri-cli"]["output"] = "tauri-cli 1.0.0"
        self.assertIn("Tauri CLI version is not the configured 2.12.4", tools.prerequisites("native", info))
        self.assertIn("--no-bundle", tools.plan("native", self.info()))
        self.assertEqual(tools.plan("check", self.info())[:2], ["cargo", "check"])
        self.assertEqual(tools.plan("test-rust", self.info())[:2], ["cargo", "test"])


if __name__ == "__main__":
    unittest.main()
