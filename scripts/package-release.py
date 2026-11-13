"""Reconstructed release utilities. Original desktop entry/assets are kept unchanged."""
from pathlib import Path
import argparse, hashlib, http.client, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.request, zipfile
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".build-cache"
RUNTIME = CACHE / "recovered-installer"
RELEASE = ROOT / "release"
APP = RELEASE / "Nine-Realms-win32-x64"

def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()

def download(request, destination=None):
    """Retry temporary network failures without hiding permanent errors."""
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                if destination is None:
                    return response.read()
                with destination.open("wb") as output:
                    shutil.copyfileobj(response, output)
                return None
        except urllib.error.HTTPError as error:
            if error.code not in (408, 429, 500, 502, 503, 504) or attempt == 3:
                raise
            reason = "HTTP " + str(error.code)
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.IncompleteRead) as error:
            if attempt == 3:
                raise
            reason = type(error).__name__
        delay = 2 ** (attempt + 1)
        print("Temporary download error (" + reason + "); retrying in " + str(delay) + "s.", file=sys.stderr)
        time.sleep(delay)


def manifest():
    return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))

def safe_output(value):
    path = Path(value)
    if not path.is_absolute(): path = ROOT / path
    resolved = path.resolve()
    if resolved == ROOT or not resolved.is_relative_to(ROOT): raise RuntimeError("Output must stay inside the project.")
    return resolved

def ensure_runtime():
    expected = manifest().get("config", {}).get("electronVersion", "45.1.0")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?", expected):
        raise RuntimeError("Invalid Electron version.")
    filename = "electron-v" + expected + "-win32-x64.zip"
    base = "https://github.com/electron/electron/releases/download/v" + expected + "/"
    # Reviewed release digest lives with the source. A network outage must not
    # make a verified cache unusable, and a cache is never a trust source itself.
    lock = json.loads((ROOT / "scripts/electron-runtime-lock.json").read_text(encoding="utf-8"))
    if (lock.get("schemaVersion") != 1 or lock.get("version") != expected or
            lock.get("platform") != "win32" or lock.get("arch") != "x64" or lock.get("filename") != filename or
            not re.fullmatch(r"[0-9a-f]{64}", lock.get("sha256", ""))):
        raise RuntimeError("Electron runtime lock must match package.json and contain a verified SHA-256.")
    checksum = lock["sha256"]
    if CACHE.is_symlink() or RUNTIME.is_symlink() or not RUNTIME.resolve().is_relative_to(CACHE.resolve()):
        raise RuntimeError("Unsafe runtime cache path.")
    CACHE.mkdir(exist_ok=True)
    archive_path = CACHE / filename
    if archive_path.is_symlink():
        raise RuntimeError("Unsafe runtime archive path.")
    if not archive_path.is_file() or sha256(archive_path) != checksum:
        pending = CACHE / (filename + ".part")
        if pending.is_symlink():
            raise RuntimeError("Unsafe partial archive path.")
        try:
            request = urllib.request.Request(base + filename, headers={"User-Agent": "NineRealms-build"})
            download(request, pending)
            if sha256(pending) != checksum:
                raise RuntimeError("Electron runtime checksum mismatch.")
            pending.replace(archive_path)
        finally:
            if pending.exists():
                pending.unlink()
    # Recreate extracted files from the verified ZIP on every run. A version
    # marker, an old Setup.exe, or modified extracted files cannot bypass SHA-256.
    with tempfile.TemporaryDirectory(prefix="electron-verified-", dir=CACHE) as directory:
        staging = Path(directory)
        with zipfile.ZipFile(archive_path) as archive:
            if sum(entry.file_size for entry in archive.infolist()) > 2 * 1024 ** 3:
                raise RuntimeError("Electron archive exceeds extraction budget.")
            for entry in archive.infolist():
                if ("\\" in entry.filename or ":" in entry.filename or "\0" in entry.filename or
                        (entry.external_attr >> 16) & 0o170000 == 0o120000 or
                        not (staging / entry.filename).resolve().is_relative_to(staging)):
                    raise RuntimeError("Invalid Electron archive path.")
            archive.extractall(staging)
        executable = staging / "electron.exe"
        if not executable.is_file():
            raise RuntimeError("Electron Windows executable is missing or invalid.")
        with executable.open("rb") as stream:
            if stream.read(2) != b"MZ":
                raise RuntimeError("Electron Windows executable is missing or invalid.")
        version_file = staging / "version"
        if version_file.is_file() and version_file.read_text().strip().lstrip("v") != expected:
            raise RuntimeError("Electron runtime version mismatch.")
        executable.rename(staging / "Nine Realms.exe")
        version_file.write_text(expected, encoding="utf-8")
        if RUNTIME.exists():
            shutil.rmtree(RUNTIME)
        staging.rename(RUNTIME)
    return RUNTIME

def payload_files(app):
    app = Path(app).resolve()
    files = []
    for path in app.rglob("*"):
        relative = path.relative_to(app)
        if any(part.startswith("$") for part in relative.parts): continue
        if path.is_symlink(): raise RuntimeError("Symlinks are not allowed in the application payload.")
        if path.is_file():
            if not path.resolve().is_relative_to(app): raise RuntimeError("Payload escapes its application directory.")
            files.append(path)
    return sorted(files)

def build_desktop(output=None, no_web_build=False, no_zip=False, check_only=False):
    runtime = ensure_runtime()
    if check_only:
        for relative in ["desktop/main.cjs", "desktop/icon.png", "desktop/icon.ico", "dist/index.html"]:
            if not (ROOT / relative).is_file(): raise RuntimeError("Missing " + relative)
        return {"status": "passed", "runtime": str(runtime), "runtime_version": (runtime / "version").read_text().strip(), "files": len(payload_files(runtime))}
    if not no_web_build:
        subprocess.run([sys.executable, ROOT / "scripts/build.py"], check=True, cwd=ROOT)
    output = safe_output(output) if output else APP
    if output in [ROOT / "src", ROOT / "desktop", ROOT / "scripts", ROOT / "dist", RELEASE, CACHE, runtime]:
        raise RuntimeError("Choose a separate app output directory.")
    if output.exists():
        if output.is_symlink() or not (output / ".nine-realms-build.json").is_file():
            raise RuntimeError("Refusing to replace a directory not created by this build script: " + str(output))
        shutil.rmtree(output)
    output.mkdir(parents=True)
    for path in payload_files(runtime):
        relative = path.relative_to(runtime)
        if relative.parts[:2] == ("resources", "app"): continue
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
    app = output / "resources/app"
    app.mkdir(parents=True, exist_ok=True)
    for source, name in [("dist/index.html", "index.html"), ("desktop/main.cjs", "main.cjs"), ("desktop/icon.png", "icon.png")]:
        shutil.copy2(ROOT / source, app / name)
    shutil.copy2(ROOT / "desktop/icon.ico", output / "NineRealms.ico")
    package = manifest()
    packaged = {"name": package["name"], "productName": "九境 · Nine Realms", "version": package["version"], "main": "main.cjs", "private": True}
    (app / "package.json").write_text(json.dumps(packaged, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / ".nine-realms-build.json").write_text(json.dumps({"version": package["version"], "tool": "package-release.py"}))
    result = {"app": str(output), "version": package["version"], "html_sha256": sha256(app / "index.html")}
    if not no_zip:
        archive_path = RELEASE / "Nine-Realms-Windows-x64.zip"
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in payload_files(output):
                if path.name == ".nine-realms-build.json": continue
                archive.write(path, "Nine-Realms-win32-x64/" + path.relative_to(output).as_posix())
        result["zip"] = str(archive_path)
    return result

def source_archive():
    RELEASE.mkdir(exist_ok=True)
    output = RELEASE / "Nine-Realms-Source.zip"
    files = []
    for name in ["src", "desktop", "scripts"]:
        directory = ROOT / name
        if directory.exists():
            files += [p for p in directory.rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix not in [".pyc", ".log"]]
    files += [ROOT / name for name in ["package.json", "readme.md", "ROADMAP.md", "AGENTS.md", ".gitignore", "RECOVERY.md"] if (ROOT / name).is_file()]
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files):
            if path.is_symlink() or not path.resolve().is_relative_to(ROOT): raise RuntimeError("Unsafe source archive path")
            archive.write(path, "Nine Realms Source/" + path.relative_to(ROOT).as_posix())
    return str(output)

def refresh_checksums():
    paths = sorted([p for p in RELEASE.iterdir() if p.is_file() and (p.suffix.lower() in [".zip", ".exe"])])
    (RELEASE / "SHA256SUMS.txt").write_text("".join(sha256(p) + "  " + p.name + "\n" for p in paths), encoding="utf-8")
    return [p.name for p in paths]

def main():
    if os.name == "nt": raise RuntimeError("Run packaging in WSL/Linux.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--desktop", action="store_true")
    parser.add_argument("--output")
    parser.add_argument("--no-web-build", action="store_true")
    parser.add_argument("--no-zip", action="store_true")
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    if args.desktop:
        result = build_desktop(args.output, args.no_web_build, args.no_zip, args.check_only)
    elif args.check_only:
        result = {"status": "passed", "runtime": str(ensure_runtime())}
    else:
        result = {"source": source_archive(), "checksums": refresh_checksums()}
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__": main()
