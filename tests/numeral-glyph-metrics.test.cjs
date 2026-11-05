/* Proves the outline math and its font provenance, not native text placement. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {fixture,placedGlyph,pointInGlyph,strokeGlyphClearance,flattenContours}=require('./numeral-glyph-metrics.cjs');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(require('node:path').join(__dirname,'../src/numerals.css'))).digest('hex'),fixture.sourceSha256,'outline data matches unchanged embedded-font source');
assert.deepEqual(Object.keys(fixture.fonts),['400','600']);
for(const [weight,font] of Object.entries(fixture.fonts)){
 assert.equal(font.unitsPerEm,1000);assert.equal(font.ascent,1069);assert.equal(font.descent,-293);
 for(let digit=1;digit<=9;digit++){
  assert.equal(font.glyphs[digit].advance,572);const g=placedGlyph(digit,{weight});
  assert(g.bounds.left>-20&&g.bounds.right<20&&g.bounds.top>-25&&g.bounds.bottom<25);
  assert(strokeGlyphClearance([{x:-40,y:-45},{x:-40,y:45}],3.2,g)>18);
  const contour=g.contours[0],p=contour[Math.floor(contour.length/2)];
  assert(strokeGlyphClearance([p,{x:p.x+.1,y:p.y+.1}],3.2,g)<0,'touching glyph ink is a collision');
 }
}
const square={contours:flattenContours('M0 0L10 0L10 10L0 10Z M3 3L3 7L7 7L7 3Z')};
assert(pointInGlyph({x:1,y:1},square));assert(!pointInGlyph({x:5,y:5},square),'counter is not ink');
assert.equal(strokeGlyphClearance([{x:-5,y:5},{x:15,y:5}],2,square),-1,'a segment crossing glyph ink cannot hide behind outside endpoints');
assert.equal(strokeGlyphClearance([{x:4,y:5},{x:6,y:5}],1,square),.5,'a stroke contained in a glyph counter is correctly separated');
console.log('PASS numeral outline metrics: independently extracted 18 embedded WOFF digit outlines, verified font SHA-256, nonzero-fill counters, crossings and stroke-width clearance. No browser placement claim.');
