/* Actual SVG construction with a minimal DOM facade, not rendered pixels. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../src/desktop-workspace.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const {SvgNode,createRenderer,descendants,layer,clone,semanticSeeds}=require('./variant-renderer-fixture.cjs');
const view=createRenderer(),live=new SvgNode('svg'),replay=new SvgNode('svg');
const types=['thermo','renban','whispers','palindrome','between','lockout','entropic','modular','region-sum','arrow'];
const widths={thermo:18,renban:5.5,whispers:5,palindrome:4.5,between:3.5,lockout:3.5,entropic:4.5,modular:4.5,'region-sum':4.5,arrow:4.5};
function inspect(svg,context){
 const nodes=descendants(svg),defs=svg.children.filter(n=>n.tag==='defs');
 assert.equal(defs.length,1,'one local definitions container');
 assert.equal(svg.children[0],defs[0],'material definitions precede actual paint layers');
 assert.deepEqual(svg.children.filter(n=>n.attrs['data-layer']).map(n=>n.attrs['data-layer']),['areas','lines','line-endpoints','marks']);
 const identified=nodes.filter(n=>n.attrs.id),ids=new Set(identified.map(n=>n.attrs.id));
 assert.equal(ids.size,identified.length,'no duplicate ID within an SVG');
 const gradients=nodes.filter(n=>n.tag==='linearGradient');
 assert.equal(gradients.length,context.mode==='arrow'?0:1,'one gradient per nonarrow family, not per clue');
 for(const gradient of gradients){
  assert.equal(gradient.attrs.gradientUnits,'userSpaceOnUse','one board-wide material, not discontinuous per-segment gradients');
  assert.deepEqual([gradient.attrs.x1,gradient.attrs.y1,gradient.attrs.x2,gradient.attrs.y2],['0','0','675','900']);
  assert.deepEqual(gradient.children.map(n=>n.attrs.offset),['0','0.5','1']);
  for(const stop of gradient.children){
  const token=stop.attrs['stop-color'].match(/^var\((--[\w-]+)/)[1];assert(css.includes(token+':'),'renderer gradient token is actually defined in CSS: '+token);
  assert.match(stop.attrs['stop-color'],/^var\(--clue-[\w-]+-glass-(?:start|mid|end),var\(--clue-[\w-]+\)\)$/,'CSS theme token with existing solid fallback');
  }
 }
 for(const node of nodes)for(const value of Object.values(node.attrs))for(const match of value.matchAll(/url\(#([^)]*)\)/g))assert(ids.has(match[1]),'every paint/filter reference resolves in its own SVG');
 const paths=descendants(layer(svg,'lines')).filter(n=>n.attrs['data-line-cells']);
 assert.equal(paths.length,context.clues.lines.length);
 const seen=new Set();
 for(const node of paths){
  const index=Number(node.attrs['data-line-index']),clue=context.clues.lines[index];
  assert(!seen.has(index),'primary clue metadata is unique');seen.add(index);
  assert.equal(node.attrs['data-line-cells'],clue.cells.join(','));
  assert.equal(Number(node.attrs['stroke-width']),widths[clue.type],'quiet line family width');
  if(clue.type==='arrow'){assert(!node.attrs.stroke.startsWith('url('),'arrows retain their independent layout/material');continue;}
  assert.match(node.attrs.stroke,/^url\(#[^)]+\) var\(--clue-[\w-]+\)$/,'gradient paint has a solid CSS fallback');
  assert.match(node.attrs.style,/^--variant-solid-color:var\(--clue-[\w-]+\)$/,'forced-color/reduced-effects hook');
 }
 if(context.mode==='thermo'){
 const groups=nodes.filter(n=>(n.attrs.class||'').split(' ').includes('variant-thermometer-material'));
 assert.equal(groups.length,1,'thermometers share one material pass, including intersecting silhouettes');
 assert.equal(groups[0].children.length,2);
 for(const group of groups[0].children){assert.deepEqual(group.children.map(n=>n.tag),['path','circle','path','circle']);assert.equal(group.children[3].attrs.r,'29');for(const shell of group.children.slice(0,2)){assert.equal(shell.attrs.display,'none');assert((shell.attrs.class||'').includes('variant-thermo-shell'));}assert(!group.attrs.filter,'no per-tube lighting seams');}
 const filters=nodes.filter(n=>n.tag==='filter');assert.equal(filters.length,1);
 const filter=filters[0];assert.equal(groups[0].attrs.filter,'url(#'+filter.attrs.id+')');
 assert.equal(filter.children.at(-1).tag,'feComposite');
 assert.equal(filter.children.at(-1).attrs.in2,'SourceAlpha');assert.equal(filter.children.at(-1).attrs.operator,'in','material never leaks outside the silhouette');
 }else assert.equal(nodes.filter(n=>n.tag==='filter').length,0,'nonthermo clues need no material filter');
 assert(!nodes.some(n=>/^animate|^set$/.test(n.tag)),'static clue materials do not animate or distract');
 return {ids,prefix:defs[0].attrs['data-variant-materials']};
}
for(const type of types){
const context={mode:type,clues:{version:1,lines:[{type,cells:[1,2,3]},{type,cells:type==='thermo'?[2,3,12]:[39,48,57]}]}};
view.render(live,context);view.render(replay,clone(context));
const a=inspect(live,context),b=inspect(replay,context);
assert.notEqual(a.prefix,b.prefix,'live/replay material scopes are unique');
for(const id of a.ids)assert(!b.ids.has(id),'live/replay IDs never collide');
const before=live.children.slice(),replacements=live.replacements;
view.render(live,clone(context));
assert.equal(live.replacements,replacements,'cache hit preserves material DOM');
before.forEach((node,i)=>assert.equal(live.children[i],node));
view.render(live,{mode:'classic',clues:{version:1}});
assert.equal(descendants(live).filter(n=>n.attrs.id).length,0,'switching to classic clears stale gradients/filters');
view.render(live,context);
const again=inspect(live,context);assert.equal(again.prefix,a.prefix,'per-SVG scope stable across mode changes');assert.deepEqual(again.ids,a.ids);
}
// Clone labels must use semantic text ink even though their outlined regions
// share the subdued renban family. Actual text/position remain baseline-pinned.
const clonePuzzle=semanticSeeds().find(p=>p.mode==='clone');assert(clonePuzzle);
view.render(live,clonePuzzle);
const cloneLabels=descendants(layer(live,'marks')).filter(n=>n.tag==='text'&&n.attrs.fill==='var(--clue-renban)');
assert(cloneLabels.length>0,'exercise actual clone labels, not an empty selector');
assert(css.includes(':is(.variant-overlay,#history-replay-overlay) text[fill="var(--clue-renban)"]{fill:var(--clue-label)}'),'live and replay clone labels keep text ink');
assert(css.includes('body[data-workspace=unified] .cell .notes{color:var(--text)}'),'live candidates retain normal text ink without halo');
assert(css.includes('.history-cell .history-notes{color:var(--text);'),'replay candidates retain normal text ink');
const quiet=css.match(/body:not\(\[data-line-contrast=strong\]\)\{([^{}]+)\}/);assert(quiet);
for(const type of ['line','thermo-fill','renban','whispers','palindrome','between','lockout','entropic','modular','region-sum','cage'])assert(quiet[1].includes('--clue-'+type+':color-mix('),'quiet '+type+' is a blended secondary material');
const shares=[...css.matchAll(/--clue-material-share:(\d+)%/g)].map(m=>Number(m[1]));
assert.equal(shares.length,2);assert(shares[1]>0&&shares[1]<shares[0]&&shares[0]<70,'light and dark quiet materials remain subordinate to text, with distinct theme treatment');
// CSS source contracts: scoped fallback behavior, not computed visual contrast.
function mediaBlock(name){
 const marker='@media('+name+')',blocks=[];let start=css.indexOf(marker);
 while(start>=0){
  let i=css.indexOf('{',start)+1,depth=1,end=i;
  for(;end<css.length&&depth;end++){if(css[end]==='{')depth++;if(css[end]==='}')depth--;}
  assert.equal(depth,0);blocks.push(css.slice(i,end-1));start=css.indexOf(marker,end);
 }
 assert(blocks.length,'media fallback exists: '+name);return blocks.join('\n');
}
for(const name of ['forced-colors:active','prefers-reduced-transparency:reduce']){
 const block=mediaBlock(name);
 assert(block.includes('.variant-thermometer-material{filter:none}'),'disable material effects in '+name);
 assert(block.includes('.variant-glass-line{stroke:var(--variant-solid-color)}'),'solid line fallback in '+name);
 assert(block.includes('.variant-glass-fill{fill:var(--variant-solid-color)}'),'solid bulb fallback in '+name);
}
assert(mediaBlock('forced-colors:active').includes('.variant-thermo-shell{display:inline}'),'system Canvas bulb retains a visible outline');
assert(mediaBlock('prefers-reduced-motion:reduce').includes('.variant-thermometer-material{filter:none}'));
assert(css.includes('body:is([data-fx=off],[data-motion=reduced]) .variant-thermometer-material{filter:none}'));
assert(css.includes('.variant-thermo-shell{display:none}'),'default material has no doubled bright shell');
for(const rule of ['.variant-thermo-shell{display:inline}', '.variant-thermometer-material{filter:none}', '.variant-glass-line{stroke:var(--variant-solid-color)}', '.variant-glass-fill{fill:var(--variant-solid-color)}'])assert(css.includes('body[data-line-contrast=strong] '+rule),'strong mode retains explicit accessible fallback: '+rule);
console.log('PASS quiet glass materials: 10 families, unique live/replay local paints, stable IDs/cache, solid/theme fallbacks, shared 18/29 thermo silhouette and clipped static material. SVG facade only, no browser rendering.');
