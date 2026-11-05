/* Semantic SVG geometry, not browser pixels. The path sampler checks coordinates
 * and local fillets; it cannot certify visual contrast or physical hit targets. */
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const baseline = require('./fixtures/variant-renderer-semantics.json');
const {SvgNode, createRenderer, descendants, layer, clone, freeze, semanticSeeds} = require('./variant-renderer-fixture.cjs');
const {samplePath, closestPoint, center} = require('./svg-path-metrics.cjs');
const view = createRenderer(), svg = new SvgNode('svg');
const close = (a,b,label) => assert(Math.abs(a-b)<1e-7,label + ': ' + a + ' / ' + b);
const samePoint = (a,b,label) => {close(a.x,b.x,label+' x');close(a.y,b.y,label+' y');};
const classes = node => (node.attrs.class || '').split(/\s+/);
const primaryPaths = svg => descendants(layer(svg,'lines')).filter(node=>node.attrs['data-line-cells']!==undefined).sort((a,b)=>Number(a.attrs['data-line-index'])-Number(b.attrs['data-line-index']));
const endpointNodes = svg => descendants(svg).filter(node=>node.attrs['data-endpoint-role']!==undefined);
const lineTypes = new Set(), arrowRecords = [];
let pathsChecked=0,anchorsChecked=0,roundedPaths=0;
function inspectLine(context, node, index) {
  const line=context.clues.lines[index],type=line.type,cells=line.cells;
  assert.equal(node.tag,'path');
  assert.equal(node.attrs['data-line-type'],type);
  assert.equal(node.attrs['data-line-index'],String(index));
  assert.equal(node.attrs['data-line-cells'],cells.join(','),'visible primary path retains exact clue cell order');
  assert(classes(node).includes('variant-line') && classes(node).includes('variant-line--'+type));
  assert.equal(node.attrs.fill,'none','a shaft never fills the enclosed region of a folded line');
  assert.equal(node.attrs['stroke-linecap'],'round');
  assert.equal(node.attrs['stroke-linejoin'],'round');
  const {commands,samples}=samplePath(node.attrs.d),first=center(cells[0]),last=center(cells.at(-1));
  samePoint(samples[0],first,'path begins at the original first cell');
  const lane=type==='arrow'?{x:Number(node.attrs['data-arrow-lane-x']),y:Number(node.attrs['data-arrow-lane-y'])}:{x:0,y:0};
  assert(Math.hypot(lane.x,lane.y)<=24,'arrow tracking lane remains inside its intended cells');
  const semanticEnd={x:last.x+lane.x,y:last.y+lane.y};
  if(type==='arrow'){
    const retreat=Number(node.attrs['data-arrow-end-retreat']),before=center(cells.at(-2));
    if(cells.length>2){before.x+=lane.x;before.y+=lane.y;}
    const length=Math.hypot(semanticEnd.x-before.x,semanticEnd.y-before.y),tip=samples.at(-1);
    assert(Number.isFinite(retreat)&&retreat>0&&retreat<100&&retreat<=length-12+.001,'arrow retreat is local and bounded');
    assert(Math.hypot(tip.x-(semanticEnd.x-(semanticEnd.x-before.x)/length*retreat),tip.y-(semanticEnd.y-(semanticEnd.y-before.y)/length*retreat))<.001,
      'only the final tip retreats along its original direction, within coordinate serialization');
    assert(Math.abs(tip.x-last.x)<50&&Math.abs(tip.y-last.y)<50,'arrow tip remains inside its original final cell');
  }else samePoint(samples.at(-1),semanticEnd,'path ends at its original final cell');
  let previous=0;
  for(const [position,cell] of cells.entries()) {
    const p=center(cell),expected=type==='arrow'&&position===cells.length-1?samples.at(-1):{x:p.x+(position?lane.x:0),y:p.y+(position?lane.y:0)};
    const nearest=closestPoint(samples,expected,previous);
    assert(nearest.distance<=15,type+' local fillet stays near intended cell '+cell+' in original order');
    assert(nearest.point.x>Math.floor(expected.x/100)*100 && nearest.point.x<Math.floor(expected.x/100)*100+100);
    assert(nearest.point.y>Math.floor(expected.y/100)*100 && nearest.point.y<Math.floor(expected.y/100)*100+100);
    previous=nearest.index; anchorsChecked++;
  }
  for(const p of samples) assert(p.x>=0 && p.x<=900 && p.y>=0 && p.y<=900,'all line geometry remains inside the board');
  // Short, local rounding must not replace a path with a broad spline that skips a cell.
  for(const item of commands.filter(item=>item.command==='Q')) {
    const [cx,cy,x,y]=item.values;
    assert(Math.hypot(cx-x,cy-y)<=14.1,'quadratic bend is bounded by the local 14-unit fillet');
  }
  if(commands.some(item=>item.command==='Q'))roundedPaths++;
  if(type==='entropic' || type==='modular') {
    const pattern=String(node.attrs['stroke-dasharray']||'').trim().split(/[ ,]+/).map(Number);
    assert(pattern.length>=2 && pattern.every(value=>value>0),'rule-coded dashed line remains dashed');
  } else assert(!node.attrs['stroke-dasharray'] || node.attrs['stroke-dasharray']==='none',type+' line remains solid');
  const endpoints=endpointNodes(svg).filter(endpoint=>endpoint.attrs['data-line-index']===String(index));
  const expectedRoles=type==='thermo'?['start:'+cells[0]]:['between','lockout','arrow'].includes(type)?['start:'+cells[0],'end:'+cells.at(-1)]:[];
  const roles=[...new Set(endpoints.map(endpoint=>endpoint.attrs['data-endpoint-role']+':'+endpoint.attrs['data-endpoint-cell']))].sort();
  assert.deepEqual(roles,expectedRoles.sort(),type+' preserves its distinct endpoint meaning');
  for(const endpoint of endpoints)assert.equal(endpoint.attrs['data-line-type'],type);
  if(type==='thermo') {
    const group=node.parentNode;
    assert(classes(group).includes('variant-thermometer'),'thermometer body and bulb form one paint group');
    assert.deepEqual(group.children.map(child=>child.tag),['path','circle','path','circle'],
      'hidden accessibility shell before the continuous body/bulb silhouette');
    assert.equal(group.children[2],node);
    for(const shell of group.children.slice(0,2)){assert(classes(shell).includes('variant-thermo-shell'));assert.equal(shell.attrs.display,'none','shell hidden by default, reserved for explicit contrast modes');}
    assert.equal(Number(group.children[0].attrs['stroke-width']),22);assert.equal(Number(group.children[1].attrs.r),31);
    assert.equal(Number(node.attrs['stroke-width']),18,'quiet thermometer body remains 18 units wide');
    assert.equal(Number(group.children[3].attrs.r),29,'quiet thermometer bulb remains 29 units radius');
    assert.equal(node.attrs.stroke,group.children[3].attrs.fill,'tube and bulb use one continuous material');
    assert(classes(group.parentNode).includes('variant-thermometer-material'),'all thermometer silhouettes share one material pass');
    assert(group.parentNode.attrs.filter,'shared material has a local filter reference');
    const bulbs=endpoints.filter(endpoint=>endpoint.tag==='circle');
    assert(bulbs.some(bulb=>bulb.attrs.fill && bulb.attrs.fill!=='none'),'thermometer has a filled start bulb');
    for(const bulb of bulbs) {
      samePoint({x:Number(bulb.attrs.cx),y:Number(bulb.attrs.cy)},first,'thermometer start bulb');
      assert(Number(bulb.attrs.r)>=20 && Number(bulb.attrs.r)<45,'thermometer bulb remains cell-contained');
      assert(!bulb.attrs.opacity || Number(bulb.attrs.opacity)===1,'opaque thermometer union avoids dark overlap seams');
    }
  }
  if(type==='between')for(const role of ['start','end']) {
    assert(endpoints.some(endpoint=>endpoint.tag==='circle' && endpoint.attrs['data-endpoint-role']===role && endpoint.attrs.stroke),
      'between clue keeps both circular outlined endpoints');
  }
  if(type==='lockout')for(const role of ['start','end']) {
    const diamond=endpoints.find(endpoint=>endpoint.tag==='path' && endpoint.attrs['data-endpoint-role']===role && /[Zz]/.test(endpoint.attrs.d));
    assert(diamond,'lockout clue keeps both closed diamond endpoints');
    const c=center(role==='start'?cells[0]:cells.at(-1)),shape=samplePath(diamond.attrs.d).samples;
    const dx=Math.max(...shape.map(p=>Math.abs(p.x-c.x))),dy=Math.max(...shape.map(p=>Math.abs(p.y-c.y)));
    assert(dx>=20 && dx<45 && dy>=20 && dy<45,'diamond remains visibly distinct and cell-contained');
    close(dx,dy,'lockout diamond keeps balanced horizontal/vertical extent');
  }
  if(type==='arrow') {
    assert.equal(node.attrs['data-arrow-path'],String(index));
    const head=descendants(svg).find(endpoint=>endpoint.attrs['data-arrow-head']===String(index));
    assert(head,'each arrow has its own traceable direction marker');
    const headSamples=samplePath(head.attrs.d).samples,tip=samples.at(-1);
    assert(closestPoint(headSamples,tip).distance<.001,'arrowhead tip meets the end of its own shaft');
    const a=headSamples[0],b=headSamples.at(-1),back={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const tangent={x:tip.x-samples.at(-2).x,y:tip.y-samples.at(-2).y};
    const direction={x:tip.x-back.x,y:tip.y-back.y};
    assert(tangent.x*direction.x+tangent.y*direction.y>0,'arrowhead follows the final shaft direction');
    assert(Math.abs((tangent.x*direction.y-tangent.y*direction.x)/(Math.hypot(tangent.x,tangent.y)*Math.hypot(direction.x,direction.y)))<1e-4,
      'arrowhead remains parallel to the final shaft within coordinate serialization precision');
  }
  pathsChecked++;lineTypes.add(type);
  // Preserve the original semantic end/lane baseline separately from the intentionally retreated visual tip.
  return {cells,start:samples[0],end:semanticEnd,lane};
}
for(const puzzle of semanticSeeds().filter(puzzle=>puzzle.clues.lines.length)) {
  const context=freeze({mode:puzzle.mode,clues:clone(puzzle.clues)});
  view.render(svg,context);
  const paths=primaryPaths(svg);
  assert.equal(paths.length,context.clues.lines.length,puzzle.id+': exactly one primary path per clue');
  const layouts=paths.map((node,index)=>inspectLine(context,node,index));
  if(puzzle.mode==='arrow') {
    const nodes=descendants(svg),rings=nodes.filter(node=>node.attrs['data-arrow-circle']!==undefined);
    assert.equal(rings.length,paths.length,'one semantic circle per arrow, including shared bulbs');
    arrowRecords.push({id:puzzle.id,arrows:layouts.map((layout,index)=>({...layout,
      radius:Number(rings.find(ring=>ring.attrs['data-arrow-circle']===String(index)).attrs.r)}))});
  }
}
assert.deepEqual([...lineTypes].sort(),['arrow','between','entropic','lockout','modular','palindrome','region-sum','renban','thermo','whispers'].sort());
assert(roundedPaths>0,'turning clue lines receive actual local quadratic rounding');
assert.equal(arrowRecords.length,baseline.arrowLayouts.count);
assert.equal(crypto.createHash('sha256').update(JSON.stringify(arrowRecords)).digest('hex'),baseline.arrowLayouts.hash,
  'every published arrow retains its pre-styling start, semantic end, lane offset and concentric-ring radius');
// Straight runs and tight turns keep all centers rather than injecting a loop.
for(const cells of [[0,1,2,3],[0,1,2,11],[0,1,10,19],[0,1,10,9]]) {
  const context={mode:'lockout',clues:{version:1,lines:[{type:'lockout',cells}]}};
  view.render(svg,context);inspectLine(context,primaryPaths(svg)[0],0);
  const {commands}=samplePath(primaryPaths(svg)[0].attrs.d);
  if(cells.join(',')==='0,1,2,3')assert(!commands.some(item=>item.command==='Q'),'collinear run is exact');
}
// Shared bulb + coincident and crossing shafts exercise layering beyond isolated examples.
const arrowContext={mode:'arrow',clues:{version:1,lines:[
  {type:'arrow',cells:[0,1,2,11]}, {type:'arrow',cells:[0,1,2,3]}, {type:'arrow',cells:[0,10,11,2]},
  {type:'arrow',cells:[20,11,10,1]}
]}};
view.render(svg,arrowContext);
const arrows=primaryPaths(svg);arrows.forEach((node,index)=>inspectLine(arrowContext,node,index));
const rings=descendants(svg).filter(node=>node.attrs['data-arrow-circle']!==undefined);
const shared=rings.filter(ring=>Number(ring.attrs.cx)===50 && Number(ring.attrs.cy)===50);
assert.equal(shared.length,3);
assert.equal(new Set(shared.map(ring=>ring.attrs.r)).size,3,'shared-bulb arrows keep separate concentric rings');
assert.notEqual(arrows[0].attrs.d,arrows[1].attrs.d,'coincident shafts use distinct tracking lanes');
for(const ring of rings)assert(Number(ring.attrs.r)<50,'all arrow circles remain within their cell');
const endpointLayer=layer(svg,'line-endpoints'),paint=descendants(endpointLayer);
for(const sharedRing of shared) {
  const ringIndex=paint.indexOf(sharedRing);
  assert(paint.slice(0,ringIndex).some(node=>node.tag==='circle' && node.attrs.cx===sharedRing.attrs.cx && node.attrs.cy===sharedRing.attrs.cy &&
    node.attrs.fill && node.attrs.fill!=='none' && Number(node.attrs.r)>=Math.max(...shared.map(ring=>Number(ring.attrs.r)))),
  'a common opaque bulb mask is painted before all shared rings');
}
assert(svg.children.indexOf(layer(svg,'lines'))<svg.children.indexOf(endpointLayer),'every arrow circle and head stays above all shafts');
// Dash distinction is independent of color and available in every theme.
const dashPatterns={};
for(const mode of ['entropic','modular']) {
  view.render(svg,{mode,clues:{version:1,lines:[{type:mode,cells:[0,1,2]}]}});
  dashPatterns[mode]=primaryPaths(svg)[0].attrs['stroke-dasharray'];
}
assert.notEqual(dashPatterns.entropic,dashPatterns.modular,'entropy and modular clues retain distinct dash rhythms');

// Other clue families keep exact values, adjacency, orientation and exterior placement.
let marksChecked=0;
for(const puzzle of semanticSeeds().filter(puzzle=>puzzle.clues.edges.length || puzzle.clues.outside.length || puzzle.clues.parity.length || puzzle.clues.cages.length || puzzle.clues.quadruples.length || puzzle.clues.regions.length)) {
  view.render(svg,puzzle);
  const nodes=descendants(svg),marks=descendants(layer(svg,'marks'));
  const edges=marks.filter(node=>node.attrs['data-edge-type']);
  assert.equal(edges.length,puzzle.clues.edges.length,'one semantic glyph per marked adjacency');
  puzzle.clues.edges.forEach((edge,index)=>{
    const glyph=edges[index],a=center(edge.cells[0]),b=center(edge.cells[1]),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    assert.equal(glyph.attrs['data-edge-type'],edge.type);
    if(edge.type.startsWith('kropki-')) {
      assert.equal(glyph.tag,'circle');
      samePoint({x:Number(glyph.attrs.cx),y:Number(glyph.attrs.cy)},mid,'Kropki midpoint');
      assert.equal(glyph.attrs.fill,edge.type==='kropki-white'?'var(--cell-bg)':'var(--clue-edge)',
        'hollow/filled Kropki meaning survives theme styling');
    } else if(edge.type==='xv') {
      assert.equal(glyph.tag,'text');assert.equal(glyph.textContent,edge.value===10?'X':'V');
      samePoint({x:Number(glyph.attrs.x),y:Number(glyph.attrs.y)-1},mid,'XV midpoint');
    } else {
      const points=samplePath(glyph.attrs.d).commands.map(item=>({x:item.values[0],y:item.values[1]}));
      const opening={x:(points[0].x+points[2].x)/2,y:(points[0].y+points[2].y)/2};
      const direction={x:(b.x-a.x)/100,y:(b.y-a.y)/100};
      samePoint(points[1],{x:mid.x+11*direction.x,y:mid.y+11*direction.y},'inequality tip points to smaller second cell');
      samePoint(opening,{x:mid.x-11*direction.x,y:mid.y-11*direction.y},'inequality opening faces larger first cell');
    }
    marksChecked++;
  });
  const outside=marks.filter(node=>node.attrs['data-outside-type']);
  assert.equal(outside.length,puzzle.clues.outside.length);
  puzzle.clues.outside.forEach((clue,index)=>{
    const label=outside[index],horizontal=['top','bottom'].includes(clue.side);
    assert.equal(label.textContent,String(clue.value));
    assert.equal(label.attrs['data-outside-type'],clue.type);
    assert.equal(label.attrs['data-outside-side'],clue.side);
    samePoint({x:Number(label.attrs.x),y:Number(label.attrs.y)},horizontal?
      {x:clue.index*100+50,y:clue.side==='top'?-25:925}:{x:clue.side==='left'?-25:925,y:clue.index*100+50},
      'outside value retains its original side/index and margin');
    if(clue.type==='littlekiller') {
      const item=marks.indexOf(label),shaft=samplePath(marks[item+1].attrs.d).samples,head=samplePath(marks[item+2].attrs.d).samples;
      const a=center(clue.cells[0]),b=center(clue.cells[1]),direction={x:b.x-a.x,y:b.y-a.y};
      const delta={x:shaft.at(-1).x-shaft[0].x,y:shaft.at(-1).y-shaft[0].y};
      assert(delta.x*direction.x+delta.y*direction.y>0,'little-killer shaft points into its original diagonal');
      assert(closestPoint(head,shaft.at(-1)).distance<1e-7,'little-killer head remains attached to its shaft');
    }
    marksChecked++;
  });
  if(puzzle.clues.cages.length) {
    const labels=marks.filter(node=>node.tag==='text'),outlines=marks.filter(node=>node.tag==='path');
    assert.equal(labels.length,puzzle.clues.cages.length);
    assert.equal(outlines.length,puzzle.clues.cages.length);
    puzzle.clues.cages.forEach((cage,index)=>{
      const first=center(Math.min(...cage.cells));
      assert.equal(labels[index].textContent,String(cage.sum));
      samePoint({x:Number(labels[index].attrs.x),y:Number(labels[index].attrs.y)},{x:first.x-34,y:first.y-29},'cage sum stays at its original corner');
      assert(outlines[index].attrs['stroke-dasharray'],'killer cage remains a dashed territory');
      marksChecked++;
    });
  }
  if(puzzle.clues.parity.length) {
    const shapes=descendants(layer(svg,'areas'));
    assert.equal(shapes.length,puzzle.clues.parity.length);
    puzzle.clues.parity.forEach((clue,index)=>{
      const shape=shapes[index],p=center(clue.cell);
      assert.equal(shape.tag,clue.parity==='even'?'rect':'circle','odd/even retains shape distinction independent of color');
      assert.equal(shape.attrs.stroke,'var(--clue-edge)','parity outline contrasts with both its inside tint and surrounding cell');
      assert(Number(shape.attrs['stroke-width'])>0,'parity has a readable semantic outline');
      assert(!shape.attrs.opacity || Number(shape.attrs.opacity)===1,'parity outline is fully opaque');
      assert(Number(shape.attrs['fill-opacity'])>0 && Number(shape.attrs['fill-opacity'])<1,'decorative parity tint is separate from opaque outline');
      samePoint(shape.tag==='circle'?{x:Number(shape.attrs.cx),y:Number(shape.attrs.cy)}:
        {x:Number(shape.attrs.x)+Number(shape.attrs.width)/2,y:Number(shape.attrs.y)+Number(shape.attrs.height)/2},p,'parity remains centered on its original cell');
      marksChecked++;
    });
  }
  if(puzzle.clues.regions.length) {
    const regions=descendants(layer(svg,'areas')).filter(node=>node.tag==='path');
    assert.equal(regions.length,9,'jigsaw retains nine separate region outlines');
    for(const region of regions)assert.equal(region.attrs.stroke,'var(--clue-neutral)','jigsaw boundaries use the theme-aware semantic clue contrast');
    marksChecked+=regions.length;
  }
  if(puzzle.clues.quadruples.length) {
    assert.deepEqual(marks.filter(node=>node.tag==='text').map(node=>Number(node.textContent)),puzzle.clues.quadruples.flatMap(clue=>clue.values));
    assert.equal(marks.filter(node=>node.tag==='circle').length,puzzle.clues.quadruples.length);
    marksChecked+=puzzle.clues.quadruples.length;
  }
}
view.render(svg,{mode:'quadruple',clues:{version:1,quadruples:[{cells:[0,1,9,10],values:[1,1,3,5]}]}});
assert.deepEqual(descendants(svg).filter(node=>node.tag==='text').map(node=>node.textContent),['1','1','3','5'],'quadruple repeated digits are not deduplicated');

// Static cascade guards. These are declarations, not computed browser geometry.
const read=name=>fs.readFileSync(path.join(__dirname,'../src/',name),'utf8');
const desktop=read('desktop-workspace.css').replace(/\/\*[\s\S]*?\*\//g,''),styles=read('styles.css');
const finalRule=selector=>{
  const matches=[...desktop.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].trim()===selector);
  assert(matches.length,'explicit final rule exists: '+selector);return matches.at(-1)[2];
};
assert.match(finalRule('body[data-workspace=unified] .board'),/isolation:auto/,'board does not trap digits below sibling SVG');
assert.match(finalRule('.board-grid-shell .cell,.board-grid-shell .cell.hint-cell,.board-grid-shell .cell:focus-visible,.history-cell'),/z-index:auto/);
assert.match(finalRule('.board-grid-shell .cell:disabled'),/opacity:1/,'given/disabled cells do not create a lower opacity stacking context');
assert.match(finalRule('.variant-overlay,#history-replay-overlay'),/z-index:4;pointer-events:none/);
assert.match(finalRule('.draft-overlay,#history-draft-overlay'),/z-index:3;pointer-events:none/);
assert.match(finalRule('.board-grid-shell .cell .value,.board-grid-shell .cell .notes,.history-cell .history-value,.history-cell .history-notes'),/z-index:6;pointer-events:none/);
assert.match(finalRule('.board-grid-shell .cell.selected::after'),/z-index:7/);
assert(desktop.includes('body[data-game-state=ready] #board-grid-shell,body[data-game-state=paused] #board-grid-shell{visibility:hidden}'));
assert(styles.includes('body[data-game-state=ready] .variant-overlay,body[data-game-state=paused] .variant-overlay{visibility:hidden}'));
assert(!/visibility\s*:\s*visible/.test(desktop),'styling does not resurrect paused child digits/clues');
assert(styles.includes('body[data-multi=true] .variant-overlay{display:none}'),'multi-grid keeps its own renderer');
const tokens=['line','neutral','thermo-ink','thermo-fill','renban','whispers','palindrome','between','lockout','entropic','modular','region-sum','label','edge','cage'];
const palette=desktop.slice(desktop.indexOf('--clue-ink-share:70%'));
for(const token of tokens)assert(palette.includes('--clue-'+token+':'),'shared live/history palette contains '+token);
assert.match([...desktop.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].trim()==='body[data-line-contrast=strong]').map(match=>match[2]).join(';'),/--clue-ink-share:82%;--clue-neutral-share:88%;--clue-thermo-share:86%/);
const forced=[...desktop.matchAll(/@media\(forced-colors:active\)\{/g)].map(match=>{
  let depth=1,index=match.index+match[0].length;
  const start=index;
  while(index<desktop.length && depth) {if(desktop[index]==='{')depth++;else if(desktop[index]==='}')depth--;index++;}
  assert.equal(depth,0,'forced-colors block is balanced');return desktop.slice(start,index-1);
}).join('\n');
for(const token of tokens)assert(forced.includes('--clue-'+token+':'+(token==='thermo-fill'?'Canvas':'CanvasText')),'system-color fallback for '+token);
for(const marker of ['path','circle','head'])assert(forced.includes(':is(.variant-overlay,#history-replay-overlay) [data-arrow-'+marker+']'));
assert(forced.includes('[data-arrow-underlay]{stroke:Canvas}'));
assert(forced.includes(':is(.variant-overlay,#history-replay-overlay){forced-color-adjust:none}'),'SVG keeps explicit system-color semantics');
assert(forced.includes('[fill="var(--cell-bg)"]{fill:Canvas}'),'hollow marker backings use system canvas');
assert(forced.includes('[stroke="var(--cell-bg)"]{stroke:Canvas}'),'text halos use system canvas');
assert(forced.includes(':is(.cell,.history-cell):is(.diagonal-main,.diagonal-anti)::before{content:"";position:absolute;inset:0;pointer-events:none;forced-color-adjust:none}'));
for(const selector of ['.diagonal-main','.diagonal-anti','.diagonal-main.diagonal-anti']) {
  assert(forced.includes(':is(.cell,.history-cell)'+selector+'::before{background-image:linear-gradient'),
    'forced colors retain structural diagonals without opting the interactive cell out');
}
for(const selector of ['.diagonal-main','.diagonal-anti','.diagonal-main.diagonal-anti']) {
  assert.match(finalRule(':is(.cell,.history-cell)'+selector),/background-image:linear-gradient/,'structural diagonals cover play and replay');
}
assert.match(finalRule(':is(.cell,.history-cell)[class*="hyper-"]::before'),/pointer-events:none/);
for(const side of ['top','bottom','left','right'])assert.match(finalRule(':is(.cell,.history-cell).window-'+side+'::before'),new RegExp('border-'+side+'-width:1px'));
const html=read('index.html');
assert(html.indexOf('./desktop-workspace.css')>html.indexOf('./history.css') && html.indexOf('./desktop-workspace.css')>html.indexOf('./workspace.css'),'final live/replay guards load after earlier conflicting styles');
console.log('PASS refined overlay marks/styles: '+marksChecked+' adjacency, exterior, cage, parity, quadruple and jigsaw marks; original outside coordinates and inequality directions; live/replay layering, pause privacy, theme/strong/system-color contracts. Static/numerical checks only; no measured pixels or contrast.');

console.log('PASS refined overlay geometry: '+pathsChecked+' primary lines, '+anchorsChecked+' ordered cell anchors, '+roundedPaths+' rounded paths; all 10 line families, endpoint shapes, direction/dash semantics and all 36 unchanged semantic arrow lane/ring layouts plus bounded final-cell tip retreat. Numerical SVG facade only, not browser rendering or measured contrast.');
