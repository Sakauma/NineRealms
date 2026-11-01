"""Extract an installer in WSL and verify all recorded app payload files."""
from pathlib import Path
import argparse, hashlib, json, shutil, struct, subprocess, tempfile
ROOT = Path(__file__).resolve().parents[1]

def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b""): h.update(chunk)
    return h.hexdigest()

def require(value, message):
    if not value: raise RuntimeError(message)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--installer", default="release/Setup.exe")
    parser.add_argument("--record", default=".build-cache/installer/payload.json")
    parser.add_argument("--report", help="Optional JSON report path.")
    args = parser.parse_args()
    setup = Path(args.installer)
    if not setup.is_absolute(): setup = ROOT / setup
    record_path = Path(args.record)
    if not record_path.is_absolute(): record_path = ROOT / record_path
    require(setup.is_file(), "Installer is missing.")
    record = json.loads(record_path.read_text()) if record_path.is_file() else None
    # A temporary recovery record must not be mistaken for the published installer.
    if record and Path(record["installer"]).resolve() != setup.resolve(): record = None
    digest = sha256(setup)
    if record: require(digest == record["sha256"], "Installer checksum differs from build record.")
    with setup.open("rb") as f:
        require(f.read(2) == b"MZ", "Missing Windows MZ header.")
        f.seek(0x3c); offset = struct.unpack("<I", f.read(4))[0]
        f.seek(offset); require(f.read(4) == b"PE\0\0", "Missing Windows PE header.")
    seven = shutil.which("7z")
    require(seven, "7z is needed inside WSL.")
    listing = subprocess.run([seven, "l", "-slt", str(setup)], check=True, capture_output=True, text=True).stdout
    require("Type = Nsis" in listing, "Expected an NSIS installer.")
    checked = 0
    with tempfile.TemporaryDirectory(prefix="nine-realms-installer-") as temporary:
        subprocess.run([seven, "x", "-y", "-o" + temporary, str(setup)], check=True, stdout=subprocess.DEVNULL)
        extracted = Path(temporary)
        roots = [p.parent for p in extracted.rglob("Nine Realms.exe") if (p.parent / "resources/app/index.html").is_file()]
        require(len(roots) == 1, "Expected one complete app payload.")
        app = roots[0]
        if record:
            for rel, expected in record["payload"].items():
                require((app / rel).is_file() and sha256(app / rel) == expected, "Payload mismatch: " + rel)
                checked += 1
        require((app / "resources/app/main.cjs").read_bytes() == (ROOT / "desktop/main.cjs").read_bytes(), "Desktop source differs.")
        require((app / "resources/app/index.html").read_bytes() == (ROOT / "dist/index.html").read_bytes(), "Web entry differs.")
        package = json.loads((app / "resources/app/package.json").read_text())
        require(package["main"] == "main.cjs", "Incorrect Electron entry.")
        current = json.loads((ROOT / "package.json").read_text())
        require(package["version"] == current["version"], "Installer/app version is stale.")
        with (app / "Nine Realms.exe").open("rb") as f:
            f.seek(0x3c); pos = struct.unpack("<I", f.read(4))[0]
            f.seek(pos+4); require(struct.unpack("<H", f.read(2))[0] == 0x8664, "App is not Windows x64.")
    result = {"status": "passed", "version": package["version"], "installer": str(setup), "sha256": digest,
              "payload_files_compared": checked, "payload_manifest_present": bool(record),
              "checks": ["PE/NSIS structure", "Electron x64", "Current HTML and main entry", "Version"],
              "native_windows_install_launch_uninstall": "Not run; WSL only.", "signed": False}
    if args.report:
        output = Path(args.report)
        if not output.is_absolute(): output = ROOT / output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__": main()
