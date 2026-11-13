/* Exact production SVG facade comparison. No browser, pixels or contrast check. */
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const baseline=require('./fixtures/pre-crossing-nonarrow-renderer.json');
const {SvgNode,createRenderer,semanticSeeds,freeze,clone,normalizedTree}=require('./variant-renderer-fixture.cjs');
const addedFusionIds=new Set(require('../src/fusion-bank.js').map(p=>p.id)),allSeeds=semanticSeeds();
assert.equal(allSeeds.filter(p=>addedFusionIds.has(p.id)).length,6,'six new fusion sources are covered separately by the renderer semantics suite');
const seeds=allSeeds.filter(p=>!addedFusionIds.has(p.id)&&!p.clues.lines.some(l=>l.type==='arrow'));
assert.equal(seeds.length,baseline.rows.length,'non-arrow catalog remains complete');
const view=createRenderer(),svg=new SvgNode('svg');
for(let i=0;i<seeds.length;i++){
 const p=seeds[i],pin=baseline.rows[i];assert.equal(p.id,pin.id);assert.equal(p.mode,pin.mode);
 const context=freeze({mode:p.mode,clues:clone(p.clues)}),before=JSON.stringify(context);
 view.render(svg,context);assert.equal(JSON.stringify(context),before);
 const hash=crypto.createHash('sha256').update(JSON.stringify(normalizedTree(svg))).digest('hex');
 assert.equal(hash,pin.hash,p.id+': crossing repair leaves every non-arrow SVG path, material, mark, label and layer unchanged');
}
console.log('PASS unchanged non-arrow renderer: '+seeds.length+' exact pre-crossing-repair normalized SVG trees, including all non-arrow line/materials and outside clues. SVG facade only.');
