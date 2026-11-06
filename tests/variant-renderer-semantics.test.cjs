/* Exact renderer semantics and SVG construction on a minimal DOM. No browser,
 * computed layout, visual appearance or measured contrast is claimed here. */
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Engine = require('../src/engine.js');
const baseline = require('./fixtures/variant-renderer-semantics.json');
const {SvgNode, createRenderer, descendants, layer, clone, freeze, semanticSeeds} = require('./variant-renderer-fixture.cjs');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const view = createRenderer(), svg = new SvgNode('svg'), seeds = semanticSeeds();
const modes = Engine.getModes().map(mode=>mode.id);
assert.equal(modes.length, 33, 'every released mode is covered');
assert.deepEqual(baseline.modes.map(item=>item.mode), modes);
let rendered = 0;
for (const pinned of baseline.modes) {
  const items = seeds.filter(puzzle=>puzzle.mode===pinned.mode);
  assert.equal(items.length, pinned.count, pinned.mode + ': published catalog count is retained');
  assert.equal(hash(items.map(({id,clues})=>({id,clues}))), pinned.clueHash,
    pinned.mode + ': original clue documents and cell order are unchanged');
  const results = items.map(puzzle => {
    const context = freeze({mode:puzzle.mode, clues:clone(puzzle.clues)});
    const before = JSON.stringify(context), result = view.render(svg, context);
    assert.equal(JSON.stringify(context), before, puzzle.id + ': rendering never mutates immutable clues');
    assert.equal(result.cellDescriptions.length, 81);
    assert.equal(svg.getAttribute('viewBox'), '0 0 900 900');
    assert.equal(svg.getAttribute('aria-hidden'), 'true', 'SVG decoration remains hidden from assistive technology');
    assert.equal(svg.getAttribute('focusable'), 'false');
    assert.equal(svg.style.pointerEvents, 'none');
    assert.equal(svg.style.overflow, 'visible', 'outside clues retain unclipped SVG overflow');
    assert.equal(svg.dataset.hasOutside, String(result.hasOutside));
    assert.equal(result.hasOutside, !!context.clues.outside.length);
    assert.equal(result.replacesBoxes, context.mode === 'jigsaw');
    const groups = svg.children.filter(node=>node.attrs['data-layer']);
    assert.deepEqual(groups.map(node=>node.attrs['data-layer']), ['areas','lines','line-endpoints','marks'],
      'areas, shafts, semantic endpoints and marks keep their relative stacking order');
    assert(layer(svg,'lines') && layer(svg,'line-endpoints'));
    for (const node of descendants(svg)) {
      assert(!Object.keys(node.attrs).some(name=>/^on/i.test(name)), 'decorations add no event handlers');
      for (const value of Object.values(node.attrs)) assert(!/\b(?:NaN|Infinity)\b/.test(value), puzzle.id + ': finite SVG attributes');
    }
    for (let index=0; index<81; index++) assert.equal(view.getCellLabel(index), result.cellDescriptions[index]);
    rendered++;
    // Only thermometer accessibility copy intentionally changes; keep the
    // historical geometry/legend baseline and every other description pinned.
    const oldThermo='温度计：从球端起严格递增';
    const normalized=clone(result);
    normalized.cellDescriptions=normalized.cellDescriptions.map(text=>{
      let value=text.replace(/第 \d+ 根温度计：球端在第 [^；]+，从球端起严格递增/g,oldThermo),seen=false;
      return value.split('；').filter(part=>{if(part!==oldThermo)return true;if(seen)return false;seen=true;return true;}).join('；');
    });
    for(const [lineIndex,line] of context.clues.lines.entries())if(line.type==='thermo'){
      const location=i=>(Math.floor(i/9)+1)+' 行 '+(i%9+1)+' 列';
      for(const cell of line.cells){const label=result.cellDescriptions[cell];assert(label.includes('第 '+context.clues.lines.slice(0,lineIndex+1).filter(l=>l.type==='thermo').length+' 根温度计'));assert(label.includes('球端在第 '+(Math.floor(line.cells[0]/9)+1)+' 行第 '+(line.cells[0]%9+1)+' 列'));assert(label.includes(line.cells.map(location).join('、')));}
    }
    return {id:puzzle.id, result:normalized};
  });
  assert.equal(hash(results), pinned.semanticHash,
    pinned.mode + ': legends and non-thermometer descriptions match the baseline; thermometer descriptions additionally contain the original ordered path');
}
// Reuse the same SVG across all modes in both directions, including exterior clues
// and multi-grid handoffs. Nothing from the previous clue family may remain.
const transitionOrder = [...modes, ...modes.slice().reverse(), 'classic'];
for (const mode of transitionOrder) {
  const puzzle = seeds.find(item=>item.mode===mode), context = freeze({mode, clues:clone(puzzle.clues)});
  const fresh = new SvgNode('svg');
  const expected = view.render(fresh, context), actual = view.render(svg, context);
  assert.deepEqual(clone(actual), clone(expected));
  // Per-SVG paint IDs legitimately differ; normalize only the IDs and their
  // exact local references, retaining every coordinate/material/label.
  const tree = root => {
    const ids=new Map(descendants(root).filter(node=>node.attrs.id).map((node,index)=>[node.attrs.id,'paint-'+index]));
    const visit=node=>({tag:node.tag,attrs:Object.fromEntries(Object.entries(node.attrs).map(([key,value])=>[key,key==='data-variant-materials'?'local-material-scope':key==='id'?ids.get(value):value.replace(/url\(#([^)]*)\)/g,(whole,id)=>ids.has(id)?'url(#'+ids.get(id)+')':whole)])),text:node.textContent,children:node.children.map(visit)});
    return visit(root);
  };
  assert.deepEqual(tree(svg), tree(fresh), mode + ': reuse clears stale geometry and outside labels');
  const children = svg.children.slice(), replacements = svg.replacements;
  const cached = view.render(svg, {mode, clues:clone(puzzle.clues)});
  assert.equal(cached, actual, mode + ': identical normalized clues reuse the cached result');
  assert.equal(svg.replacements, replacements, 'cache hit leaves the live SVG nodes intact');
  children.forEach((child,index)=>assert.equal(svg.children[index], child));
  assert.equal(view.getCellLabel(0), actual.cellDescriptions[0], 'cache hit restores the correct latest label');
}
assert.equal(descendants(svg).filter(node=>['path','circle','rect','text'].includes(node.tag)).length, 0,
  'classic after every variant contains no stale clue geometry');
assert.equal(view.getCellLabel(-1), '');
assert.equal(view.getCellLabel(81), '');
assert.deepEqual(clone(view.render(null, {mode:'classic'})), {
  legend:'',cellDescriptions:Array(81).fill(''),hasOutside:false,replacesBoxes:false
});
// A mutable caller may edit an existing clue object. The value-based key must
// invalidate even when object identity is retained, and then cache the new result.
const context = {mode:'thermo', clues:{version:1,lines:[{type:'thermo',cells:[0,1,11]}]}};
const before = view.render(svg, context), replacements = svg.replacements;
context.clues.lines[0].cells = [80,79,69];
const after = view.render(svg, context);
assert.notEqual(after, before);
assert.equal(svg.replacements, replacements + 1);
assert.equal(after.cellDescriptions[0], '');
assert.match(after.cellDescriptions[80], /温度计/);
assert.equal(view.getCellLabel(80), after.cellDescriptions[80]);
assert.equal(view.render(svg, context), after);
console.log('PASS variant renderer semantics: ' + rendered + ' immutable catalog clue documents across 33 modes, pinned legends/non-thermometer labels, explicit ordered thermometer labels, ' + transitionOrder.length + ' mode transitions, outside flags, layering, cache and mutation invalidation. SVG facade only, not visual/browser validation.');
