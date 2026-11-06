"""Build the recovered modular source into a standalone offline web game."""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
DIST = ROOT / "dist"
RELEASE = ROOT / "release"
STYLES = ("styles.css", "history.css", "easter-extras.css", "numerals.css", "workspace.css", "desktop-workspace.css", "zen.css")
SCRIPTS = (
    "variant-bank.js", "multigrid-bank.js", "engine.js", "desktop-bridge.js", "logic.js", "custom-puzzle.js", "challenge.js",
    "daily.js", "hints.js", "technique-guides.js", "rule-examples.js", "training.js", "voyage.js", "variant-view.js", "scene-webgl.js",
    "atmosphere.js", "secret-archives.js", "easter-eggs.js", "drafts.js", "branches.js", "edits.js", "checkpoints.js", "history.js", "puzzle-deck.js", "generator.js", "favorites.js", "backup.js", "save-recovery.js", "personal.js", "glass-select.js", "floating-draft.js", "draft-ui.js", "training-ui.js", "custom-ui.js", "workspace.js", "app.js",
)


def render_html():
    """Keep module bodies and whitespace unchanged for a lossless round trip."""
    html = (SRC / "index.html").read_text(encoding="utf-8")
    icon_reference = 'href="../desktop/icon.png"'
    if html.count(icon_reference) != 1:
        raise RuntimeError("Expected exactly one favicon reference")
    icon = base64.b64encode((ROOT / "desktop/icon.png").read_bytes()).decode("ascii")
    html = html.replace(icon_reference, 'href="data:image/png;base64,' + icon + '"', 1)
    for filename in STYLES:
        source = (SRC / filename).read_text(encoding="utf-8")
        pattern = r"""<link\b[^>]*href=["'](?:\./)?""" + re.escape(filename) + r"""["'][^>]*>"""
        html, count = re.subn(pattern, lambda _: "<style>\n" + source + "\n</style>",
                             html, flags=re.I)
        if count != 1:
            raise RuntimeError("Expected exactly one stylesheet reference: " + filename)
    for filename in SCRIPTS:
        source = (SRC / filename).read_text(encoding="utf-8").replace("</script", r"<\/script")
        pattern = r"""<script\b[^>]*src=["'](?:\./)?""" + re.escape(filename) + r"""["'][^>]*>\s*</script>"""
        html, count = re.subn(pattern, lambda _: "<script>\n" + source + "\n</script>",
                             html, flags=re.I)
        if count != 1:
            raise RuntimeError("Expected exactly one script reference: " + filename)
    return html


def build(output=None, web_zip=True):
    """Default: rebuild dist/index.html and release/Nine-Realms-Web.zip."""
    html = render_html()
    target = Path(output).resolve() if output is not None else DIST / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding="utf-8")
    result = {
        "html": str(target),
        "html_bytes": target.stat().st_size,
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
    }
    if web_zip:
        RELEASE.mkdir(exist_ok=True)
        archive_path = RELEASE / "Nine-Realms-Web.zip"
        instructions = (
            "九境 · Nine Realms — 网页离线版\n"
            "解压后双击 index.html 即可开始，无需联网或安装其他运行环境。\n"
            "数字键填写；方向键选格；N 切换笔记；Delete/Backspace 擦除；Ctrl+Z 撤销。\n"
            "进度保存在当前浏览器中。开始或恢复棋局时，点击开始/继续后才计时。\n"
            "玩法目录提供 32 种玩法与各档题量；顶部历史支持继续、重新挑战和逐步回放。\n"
            "页脚旅途拾遗提供七个彩蛋；主题、动态、音效和禅模式可以在界面中调整。\n"
            "开发源码位于项目 src/，请保留源码及 scripts/；清理仅针对可再生成的产物。\n"
        )
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            archive.writestr("Nine Realms/index.html", html)
            archive.writestr("Nine Realms/使用说明.txt", instructions)
        result["web_zip"] = str(archive_path)
    print(json.dumps(result, ensure_ascii=False))
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true",
                        help="Compare rebuilt HTML with the existing published HTML; write nothing.")
    parser.add_argument("--output", type=Path,
                        help="Write HTML to another path; no web ZIP is produced.")
    args = parser.parse_args()
    if args.check_only:
        reference = args.output or DIST / "index.html"
        rendered = render_html().encode("utf-8")
        if rendered != reference.read_bytes():
            raise RuntimeError("Rebuilt HTML differs from " + str(reference))
        print(json.dumps({"status": "passed", "reference": str(reference),
                          "bytes": len(rendered), "sha256": hashlib.sha256(rendered).hexdigest()}))
    else:
        build(args.output, web_zip=args.output is None)


if __name__ == "__main__":
    main()
