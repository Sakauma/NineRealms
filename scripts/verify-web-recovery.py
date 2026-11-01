"""Check modular source syntax, catalog metadata and exact current published HTML."""
from pathlib import Path
import argparse
import hashlib
import json
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, help="Optionally save the check record; default writes nothing.")
    parser.add_argument("--expected-puzzles", type=int, help="Optional catalog-size assertion for a specific release.")
    parser.add_argument("--expected-modes", type=int, help="Optional mode-count assertion for a specific release.")
    args = parser.parse_args()
    build = runpy.run_path(str(ROOT / "scripts/build.py"))
    reference = (ROOT / "dist/index.html").read_bytes()
    rendered = build["render_html"]().encode("utf-8")
    if rendered != reference:
        raise RuntimeError("Rebuilt HTML is not byte-for-byte identical to dist/index.html")
    preferred = Path("/home/sakauma/.nvm/versions/node/v22.20.0/bin/node")
    node = str(preferred) if preferred.is_file() else shutil.which("node")
    if not node:
        raise RuntimeError("Node is required for recovered JavaScript syntax checks.")
    for filename in build["SCRIPTS"]:
        subprocess.run([node, "--check", str(ROOT / "src" / filename)],
                       check=True, capture_output=True, text=True)
    code = (
        'const E=require("./src/engine.js");'
        'const catalog=E.getPuzzleCatalog();'
        'const groups={};for(const p of catalog){const key=p.mode+"/"+p.difficulty;groups[key]=(groups[key]||0)+1;}'
        'if(!E.getModes().length||!catalog.length)throw Error("Empty puzzle catalog");'
        'process.stdout.write(JSON.stringify({modes:E.getModes().length,puzzles:catalog.length,groups}));'
    )
    engine = json.loads(subprocess.run([node, "-e", code], cwd=ROOT, check=True,
                                      capture_output=True, text=True).stdout)
    if args.expected_puzzles is not None and engine["puzzles"] != args.expected_puzzles:
        raise RuntimeError("Unexpected puzzle count: " + str(engine["puzzles"]))
    if args.expected_modes is not None and engine["modes"] != args.expected_modes:
        raise RuntimeError("Unexpected mode count: " + str(engine["modes"]))
    manifest = ROOT / "package.json"
    version = json.loads(manifest.read_text(encoding="utf-8")).get("version") if manifest.is_file() else None
    report = {
        "status": "passed",
        "verified_version": version,
        "scope": "Only recovered module syntax, catalog metadata and exact HTML reconstruction.",
        "html_bytes": len(reference),
        "sha256": hashlib.sha256(reference).hexdigest(),
        "roundtrip_byte_identical": True,
        "published_files_written": False,
        "javascript_modules_checked": len(build["SCRIPTS"]),
        "stylesheets_recovered": len(build["STYLES"]),
        "engine": engine,
        "recovered_modules": list(build["STYLES"]) + list(build["SCRIPTS"]),
        "limits": "Published game code and embedded puzzle data recovered. Deleted development history, generation scripts, previous test sources/logs and build caches are not present in the web artifact.",
    }
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in [
        "status", "html_bytes", "sha256", "roundtrip_byte_identical",
        "javascript_modules_checked", "stylesheets_recovered"
    ]}, ensure_ascii=False))
    print(json.dumps({"modes": engine["modes"], "puzzles": engine["puzzles"]}))


if __name__ == "__main__":
    main()
