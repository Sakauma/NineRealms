"""Build the parallel Tauri shell and report actual, distinct verification stages."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import platform
import shlex
import shutil
import subprocess
import sys
import time
import tomllib

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "src-tauri"
TARGET = ROOT / ".build-cache/tauri-target"


def probe(command):
    try:
        p = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=15)
        return {"command": command, "exit_code": p.returncode, "output": (p.stdout + p.stderr).strip()[:2000]}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"command": command, "exit_code": None, "error": str(error)}


def cli_command():
    if shutil.which("cargo-tauri") and shutil.which("cargo"):
        return ["cargo", "tauri"]
    local = ROOT / ".build-cache/tauri-tools/node_modules/@tauri-apps/cli/tauri.js"
    if local.is_file() and shutil.which("node"):
        return ["node", str(local)]
    if shutil.which("tauri"):
        return ["tauri"]
    return None


def inspect():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    cargo = tomllib.loads((PROJECT / "Cargo.toml").read_text(encoding="utf-8"))
    if cargo["package"]["version"] != package["version"]:
        raise ValueError("Cargo product version differs from package.json")
    names = ["cargo", "rustc", "rustup", "cargo-tauri", "pkg-config", "makensis", "clang", "lld-link", "llvm-rc", "cargo-xwin", "wine", "Xvfb", "chromium", "node", "python3"]
    tools = {name: shutil.which(name) for name in names}
    versions = {name: probe([name, "--version"]) for name in ["cargo", "rustc", "rustup", "node", "chromium"] if tools[name]}
    versions["python"] = {"version": sys.version.split()[0]}
    cli = cli_command()
    if cli:
        versions["tauri-cli"] = probe(cli + ["--version"])
    system = {}
    if platform.system() == "Linux" and tools["pkg-config"]:
        system = {name: probe(["pkg-config", "--modversion", name]) for name in ["webkit2gtk-4.1", "gtk+-3.0", "openssl", "ayatana-appindicator3-0.1", "librsvg-2.0"]}
    return {"product_version": package["version"], "host": platform.platform(), "tools": tools, "versions": versions,
            "configured_dependencies": {**cargo["dependencies"], **cargo["build-dependencies"]}, "expected_cli": package["config"]["tauriCliVersion"],
            "system_libraries": system, "display_present": bool(os.getenv("DISPLAY") or os.getenv("WAYLAND_DISPLAY")),
            "cargo_lock_present": (PROJECT / "Cargo.lock").is_file(), "cli": cli}


def plan(action, info, offline_webview=False):
    if action in ["check", "test-rust"]:
        return ["cargo", "check" if action == "check" else "test", "--manifest-path", str(PROJECT / "Cargo.toml"), "--features", "custom-protocol"]
    build_hook = subprocess.list2cmdline([sys.executable, "scripts/build.py"]) if os.name == "nt" else shlex.join([sys.executable, "scripts/build.py"])
    overlay = {"build": {"beforeBuildCommand": build_hook, "beforeDevCommand": build_hook}}
    if offline_webview:
        overlay["bundle"] = json.loads((PROJECT / "tauri.offline.conf.json").read_text())["bundle"]
    command = (info["cli"] or ["cargo", "tauri"]) + ["dev" if action == "dev" else "build", "--config", json.dumps(overlay, ensure_ascii=False)]
    if action == "native":
        command += ["--no-bundle"]
    elif action == "windows":
        command += ["--target", "x86_64-pc-windows-msvc", "--bundles", "nsis"]
        if platform.system() != "Windows":
            command += ["--runner", "cargo-xwin"]
    return command


def prerequisites(action, info):
    errors = []
    for name in ["cargo", "rustc"]:
        if not info["tools"][name]:
            errors.append("Missing " + name)
    if action not in ["check", "test-rust"]:
        if not info["cli"]:
            errors.append("Missing Tauri CLI " + info["expected_cli"])
        else:
            version = info["versions"]["tauri-cli"]
            if version.get("exit_code") != 0 or info["expected_cli"] not in version.get("output", "").split():
                errors.append("Tauri CLI version is not the configured " + info["expected_cli"])
    if action != "windows" and platform.system() == "Linux":
        for name in ["webkit2gtk-4.1", "gtk+-3.0", "openssl"]:
            if info["system_libraries"].get(name, {}).get("exit_code") != 0:
                errors.append("Missing development library " + name)
    if action == "windows" and platform.system() != "Windows":
        for name in ["cargo-xwin", "lld-link", "llvm-rc", "makensis"]:
            if not info["tools"][name]:
                errors.append("Missing Windows cross-build tool " + name)
    if action == "dev" and platform.system() == "Linux" and not info["display_present"]:
        errors.append("No GUI display configured")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["doctor", "check", "test-rust", "native", "windows", "dev"])
    parser.add_argument("--offline-webview2", action="store_true", help="Embed WebView2's offline installer; does not make dependency fetching offline.")
    parser.add_argument("--report", type=Path, help="Save evidence without declaring unperformed native checks successful.")
    args = parser.parse_args()
    report_path = args.report or ROOT / "artifacts/tauri" / (args.action + ("-offline-webview2" if args.offline_webview2 else "") + ".json")
    if not report_path.is_absolute():
        report_path = ROOT / report_path
    report_path.parent.mkdir(parents=True, exist_ok=True)
    info = inspect()
    result = {"action": args.action, "environment": info, "status": "inspected", "webview2_install_mode": "offlineInstaller" if args.offline_webview2 else "downloadBootstrapper",
              "frontend_built": False, "rust_typechecked": False, "rust_compiled": False, "rust_tests_run": False, "installer_created": False, "installed": False, "native_running": False, "native_interactions_verified": False,
              "installer_bytes": None, "artifact_paths": []}
    if args.action != "doctor":
        subprocess.run([sys.executable, str(ROOT / "scripts/build.py")], cwd=ROOT, check=True)
        result["frontend_built"] = True
        result["frontend_sha256"] = hashlib.sha256((ROOT / "dist/index.html").read_bytes()).hexdigest()
        result["command"] = plan(args.action, info, args.offline_webview2)
        result["blockers"] = prerequisites(args.action, info)
        if result["blockers"]:
            result["status"] = "blocked_before_compilation"
            result["command_executed"] = False
        else:
            env = os.environ.copy()
            env["CARGO_TARGET_DIR"] = str(TARGET)
            began = time.time_ns()
            log_path = report_path.with_suffix(".log")
            with log_path.open("w", encoding="utf-8") as log:
                child = subprocess.Popen(result["command"], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                for line in child.stdout:
                    log.write(line); log.flush(); print(line, end="", flush=True)
                code = child.wait()
            result.update(command_executed=True, exit_code=code, log=str(log_path), status="passed" if code == 0 else "failed")
            if code == 0:
                result["rust_typechecked"] = args.action != "dev"
                result["rust_compiled"] = args.action in ["native", "windows", "test-rust"]
                result["rust_tests_run"] = args.action == "test-rust"
                # Never treat stale binaries from another invocation as new output.
                fresh = [p for p in TARGET.rglob("*") if p.is_file() and p.stat().st_mtime_ns >= began and (p.suffix.lower() in [".exe", ".msi", ".deb", ".appimage"] or p.name == "nine-realms-tauri")]
                result["artifact_paths"] = [str(p) for p in fresh]
                setups = [p for p in fresh if "bundle/nsis" in p.as_posix() and p.suffix.lower() == ".exe"]
                if args.action == "windows":
                    result["installer_created"] = bool(setups)
                    result["installer_bytes"] = sum(p.stat().st_size for p in setups) if setups else None
                    if not setups:
                        result["status"] = "failed_missing_installer"
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(report_path), **result}, ensure_ascii=False, indent=2))
    return 0 if result["status"] in ["passed", "inspected"] else 2


if __name__ == "__main__":
    sys.exit(main())
