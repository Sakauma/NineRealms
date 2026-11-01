"""Reconstructed per-user NSIS build; original publish artifacts remain unchanged until explicitly built."""
from pathlib import Path
import argparse, importlib.util, json, os, shutil, subprocess, sys
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release_tools", ROOT / "scripts/package-release.py")
release_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_tools)
CACHE = ROOT / ".build-cache"
WORK = CACHE / "installer"

def compiler():
    local = CACHE / "nsis/usr/bin/makensis"
    env = os.environ.copy()
    if not local.is_file():
        found = shutil.which("makensis")
        if found: return found, env
        download = CACHE / "nsis-debs"
        download.mkdir(parents=True, exist_ok=True)
        subprocess.run(["apt-get", "download", "nsis", "nsis-common"], cwd=download, check=True)
        for package in sorted(download.glob("nsis*.deb")):
            subprocess.run(["dpkg-deb", "-x", str(package), str(CACHE / "nsis")], check=True)
    if not local.is_file(): raise RuntimeError("NSIS compiler could not be prepared inside WSL.")
    env["NSISDIR"] = str(CACHE / "nsis/usr/share/nsis")
    return str(local), env

def escaped(value):
    return str(value).replace("$", "$$").replace('"', '$\\"')

def prepare(app):
    files = [p for p in release_tools.payload_files(app) if p.name != ".nine-realms-build.json"]
    for name in ["Nine Realms.exe", "NineRealms.ico", "resources/app/main.cjs", "resources/app/index.html", "resources/app/package.json"]:
        if not (app / name).is_file(): raise RuntimeError("Missing payload: " + name)
    install, uninstall, payload, directories = [], [], {}, set()
    current = None
    for path in files:
        rel = path.relative_to(app)
        if rel.parent != current:
            destination = "$INSTDIR" + ("\\" + escaped(str(rel.parent).replace("/", "\\")) if str(rel.parent) != "." else "")
            install += ['SetOutPath "' + destination + '"', "IfErrors install_failed"]
            current = rel.parent
        install += ['File "' + escaped(path) + '"', "IfErrors install_failed"]
        target = '$INSTDIR\\' + escaped(str(rel).replace("/", "\\"))
        uninstall += ['IfFileExists "' + target + '" 0 +2', 'Delete "' + target + '"']
        payload[rel.as_posix()] = release_tools.sha256(path)
        directories.update(d for d in rel.parents if str(d) != ".")
    uninstall += ["IfErrors un_files_failed"]
    for d in sorted(directories, key=lambda d: (-len(d.parts), str(d))):
        uninstall += ['RMDir "$INSTDIR\\' + escaped(str(d).replace("/", "\\")) + '"']
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "install-files.nsh").write_text("\n".join(install) + "\n")
    (WORK / "uninstall-files.nsh").write_text("\n".join(uninstall) + "\n")
    return files, payload

def main():
    if os.name == "nt": raise RuntimeError("Use WSL/Linux.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-dir", help="Existing app payload; avoids rebuilding web/portable files.")
    parser.add_argument("--output", default="release/Setup.exe")
    parser.add_argument("--compression", choices=["lzma", "off"], default="lzma")
    parser.add_argument("--check-only", action="store_true", help="Check compiler/runtime/source without compiling.")
    args = parser.parse_args()
    package = release_tools.manifest()
    build_compiler, environment = compiler()
    if args.check_only:
        result = release_tools.build_desktop(check_only=True)
        result["compiler"] = build_compiler
        print(json.dumps(result, ensure_ascii=False, indent=2)); return
    if args.app_dir:
        app = release_tools.safe_output(args.app_dir)
    else:
        release_tools.build_desktop(no_zip=True)
        app = release_tools.APP
    app_package = json.loads((app / "resources/app/package.json").read_text())
    if app_package.get("version") != package["version"]: raise RuntimeError("App payload version differs from package.json.")
    files, payload = prepare(app)
    output = release_tools.safe_output(args.output)
    if output.suffix.lower() != ".exe": raise RuntimeError("Installer output must be an .exe file.")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = WORK / "Setup.pending.exe"
    version = package["version"]
    parts = version.split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts): raise RuntimeError("Use a numeric x.y.z package version.")
    definitions = {"VERSION": version, "VERSION_QUAD": version + ".0", "OUTPUT_FILE": temporary_output,
                   "PAYLOAD_INSTALL": WORK / "install-files.nsh", "PAYLOAD_UNINSTALL": WORK / "uninstall-files.nsh",
                   "ICON_FILE": ROOT / "desktop/icon.ico", "INSTALL_SIZE_KB": (sum(p.stat().st_size for p in files) + 1023) // 1024}
    command = [build_compiler, "-V3", "-INPUTCHARSET", "UTF8"] + ["-D" + k + "=" + str(v) for k, v in definitions.items()]
    if args.compression == "off": command += ["-DNO_COMPRESSION"]
    command += [str(ROOT / "desktop/installer.nsi")]
    subprocess.run(command, cwd=ROOT, env=environment, check=True)
    temporary_output.replace(output)
    record = {"version": version, "electron_version": package.get("config", {}).get("electronVersion", "45.1.0"),
              "installer": str(output), "sha256": release_tools.sha256(output), "payload": payload,
              "signed": False, "installer_source": "reconstructed", "compression": args.compression}
    (WORK / "payload.json").write_text(json.dumps(record, ensure_ascii=False, indent=2))
    if output == ROOT / "release/Setup.exe": release_tools.refresh_checksums()
    print(json.dumps({"installer": str(output), "version": version, "MiB": round(output.stat().st_size / 1024**2, 2),
                      "sha256": record["sha256"], "signed": False}, ensure_ascii=False, indent=2))

if __name__ == "__main__": main()
