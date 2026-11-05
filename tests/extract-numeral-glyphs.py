"""Reproduce test outlines from the application's embedded offline WOFF fonts.
This optional fixture-generation tool requires fontTools; tests need only Node.
It does not render text or claim native browser font positioning.
"""
import base64, hashlib, io, json, pathlib, re
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
root = pathlib.Path(__file__).resolve().parents[1]
css = (root / 'src/numerals.css').read_text()
fonts = {}
for weight, encoded in re.findall(r'@font-face\{[^}]*font-weight:(\d+);[^}]*base64,([^)]*)\)', css):
    font = TTFont(io.BytesIO(base64.b64decode(encoded)))
    glyph_set, cmap = font.getGlyphSet(), font.getBestCmap()
    glyphs = {}
    for digit in '123456789':
        name = cmap[ord(digit)]
        pen = SVGPathPen(glyph_set)
        glyph_set[name].draw(pen)
        glyphs[digit] = {'d': pen.getCommands(), 'advance': font['hmtx'][name][0]}
    fonts[weight] = {'unitsPerEm': font['head'].unitsPerEm, 'ascent': font['hhea'].ascent,
                     'descent': font['hhea'].descent, 'glyphs': glyphs}
reference = root.parent / 'Validation/numeral-glyphs.json'
if reference.exists():
    assert fonts == json.loads(reference.read_text()), 'Independent extraction must match preview outline data'
result = {'source': 'src/numerals.css embedded offline WOFF subsets; SVGPathPen extraction',
          'sourceSha256': hashlib.sha256((root / 'src/numerals.css').read_bytes()).hexdigest(),
          'fonts': fonts}
target = root / 'tests/fixtures/numeral-glyph-outlines.json'
target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print('Verified bundled outlines:', len(fonts), 'weights,', sum(len(f['glyphs']) for f in fonts.values()), 'digit glyphs')
