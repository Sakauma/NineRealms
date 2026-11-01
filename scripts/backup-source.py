"""Create a verified source archive outside disposable build caches."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import argparse
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", help="Optional archive basename (without directories).")
    args = parser.parse_args()
    manifest = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    required = ["src/index.html", "src/app.js", "src/engine.js", "desktop/main.cjs",
                "scripts/build.py", "package.json", "readme.md"]
    for name in required:
        if not (ROOT / name).is_file():
            raise RuntimeError("Source backup is incomplete: missing " + name)
    files = []
    for folder in ("src", "desktop", "scripts"):
        for path in (ROOT / folder).rglob("*"):
            if (path.is_file() and not path.is_symlink() and
                "__pycache__" not in path.parts and path.suffix not in (".pyc", ".log")):
                if not path.resolve().is_relative_to(ROOT.resolve()):
                    raise RuntimeError("Source file resolves outside project: " + str(path))
                files.append(path)
    for name in ("package.json", "readme.md", "AGENTS.md", "ROADMAP.md", "RECOVERY.md", "recovery-web.json", "recovery-desktop.json", ".gitignore"):
        if (ROOT / name).is_file():
            files.append(ROOT / name)
    stamp = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8))).strftime("%Y%m%d-%H%M%S")
    name = args.name or "Nine-Realms-Source-" + manifest["version"] + "-" + stamp + ".zip"
    if Path(name).name != name or not name.endswith(".zip"):
        raise ValueError("Backup name must be a ZIP basename.")
    output = ROOT / "backups" / name
    output.parent.mkdir(exist_ok=True)
    if output.exists():
        raise FileExistsError("Will not overwrite an existing source backup: " + str(output))
    hashes = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in files}
    with zipfile.ZipFile(output, "x", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files):
            archive.write(path, "Nine Realms Source/" + path.relative_to(ROOT).as_posix())
        archive.writestr("Nine Realms Source/BACKUP-SHA256.json", json.dumps(hashes, indent=2))
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("Backup ZIP integrity check failed.")
        for relative, digest in hashes.items():
            if hashlib.sha256(archive.read("Nine Realms Source/" + relative)).hexdigest() != digest:
                raise RuntimeError("Backup content differs: " + relative)
    print(json.dumps({"backup": str(output), "source_files": len(hashes),
                      "bytes": output.stat().st_size, "verified": True}, ensure_ascii=False))

if __name__ == "__main__":
    main()
