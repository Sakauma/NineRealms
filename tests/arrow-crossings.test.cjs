/* Production SVG on a dependency-free facade and numerical path checks only.
 * These tests do not run a browser or certify rendered pixels/contrast. */
'use strict';
const assert=require('node:assert/strict');
const baseline=require('./fixtures/pre-crossing-arrow-layouts.json');
const {SvgNode,createRenderer,descendants,layer,clone,freeze,semanticSeeds,normalizedTree}=require('./variant-renderer-fixture.cjs');
const {samplePath,closestPoint,center}=require('./svg-path-metrics.cjs');
const seeds=semanticSeeds().filter(p=>p.mode==='arrow'),view=createRenderer();
const near=(a,b,tol=.001)=>Math.hypot(a.x-b.x,a.y-b.y)<=tol;
const distance=(p,a,b)=>{const x=b.x-a.x,y=b.y-a.y,n=x*x+y*y,t=n?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/n)):0;return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);};
function segmentCross(a,b,c,d){
 const x=b.x-a.x,y=b.y-a.y,u=d.x-c.x,v=d.y-c.y,cross=x*v-y*u;
 if(Math.abs(cross)<1e-9)return false;
 const t=((c.x-a.x)*v-(c.y-a.y)*u)/cross,q=((c.x-a.x)*y-(c.y-a.y)*x)/cross;
 return t>=-1e-8&&t<=1+1e-8&&q>=-1e-8&&q<=1+1e-8;
}
function headDistance(a,b){let best=Infinity;for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
 if(segmentCross(a[i-1],a[i],b[j-1],b[j]))return 0;
 best=Math.min(best,distance(a[i-1],b[j-1],b[j]),distance(a[i],b[j-1],b[j]),distance(b[j-1],a[i-1],a[i]),distance(b[j],a[i-1],a[i]));
}return best;}
let contexts=0,arrows=0,gaps=0,retreated=0,headPairs=0;
function inspect(context,pin,assertSeparate=false){
 const svg=new SvgNode('svg'),frozen=freeze(clone(context)),before=JSON.stringify(frozen);
 const result=view.render(svg,frozen);assert.equal(JSON.stringify(frozen),before,'rendering is immutable');
 const nodes=descendants(svg),paths=nodes.filter(n=>n.attrs['data-arrow-path']!==undefined).sort((a,b)=>+a.attrs['data-arrow-path']-b.attrs['data-arrow-path']);
 const heads=nodes.filter(n=>n.attrs['data-arrow-head']!==undefined).sort((a,b)=>+a.attrs['data-arrow-head']-b.attrs['data-arrow-head']);
 const circles=nodes.filter(n=>n.attrs['data-arrow-circle']!==undefined).sort((a,b)=>+a.attrs['data-arrow-circle']-b.attrs['data-arrow-circle']);
 assert.equal(paths.length,context.clues.lines.length);assert.equal(heads.length,paths.length);assert.equal(circles.length,paths.length);
 assert(!nodes.some(n=>n.attrs['data-arrow-underlay']!==undefined),'no board-colored underlay runs behind full arrow paths');
 const shapes=heads.map(h=>samplePath(h.attrs.d).commands.map(c=>({x:c.values[0],y:c.values[1]})));
 for(let i=0;i<paths.length;i++){
  const path=paths[i],head=heads[i],ring=circles[i],cells=context.clues.lines[i].cells;
  const sample=samplePath(path.attrs.d).samples,tip=sample.at(-1),last=center(cells.at(-1));
  const lane={x:+path.attrs['data-arrow-lane-x'],y:+path.attrs['data-arrow-lane-y']},retreat=+path.attrs['data-arrow-end-retreat'];
  const original={x:last.x+lane.x,y:last.y+lane.y},penultimate=center(cells.at(-2));
  if(cells.length>2){penultimate.x+=lane.x;penultimate.y+=lane.y;}
  const length=Math.hypot(original.x-penultimate.x,original.y-penultimate.y);
  assert.equal(path.attrs['data-line-cells'],cells.join(','),'exact ordered cells survive');
  assert.equal(path.attrs['data-line-index'],String(i));assert.equal(head.attrs['data-endpoint-cell'],String(cells.at(-1)));
  assert.equal(ring.attrs['data-endpoint-cell'],String(cells[0]));
  assert(near({x:+ring.attrs.cx,y:+ring.attrs.cy},center(cells[0])),'bulb remains at original first cell');
  assert(Number.isFinite(retreat)&&retreat>0&&retreat<100&&retreat<=length-12+.001,'tip retreat is bounded and leaves a positive final segment');
  assert(Math.hypot(lane.x,lane.y)<=24,'shared shaft lane remains inside clue cells');
  assert(near(tip,{x:original.x-(original.x-penultimate.x)/length*retreat,y:original.y-(original.y-penultimate.y)/length*retreat}),'tip moves only backward on original final direction');
  assert(near(shapes[i][1],tip),'head is attached to the rendered shaft');
  assert(near(shapes[i][1],{x:+head.attrs['data-arrow-tip-x'],y:+head.attrs['data-arrow-tip-y']}));
  assert.equal(+head.attrs['data-arrow-end-retreat'],retreat);
  assert.equal(head.attrs['data-arrow-head-placement'],'cell-entry');
  assert.equal(head.attrs['data-arrow-wing-containment'],'entry-boundary');
  const ux=(original.x-penultimate.x)/length,uy=(original.y-penultimate.y)/length;
  const edge=Math.min(ux?(50+Math.sign(ux)*(original.x-last.x))/Math.abs(ux):Infinity,uy?(50+Math.sign(uy)*(original.y-last.y))/Math.abs(uy):Infinity);
  const entry={x:original.x-ux*edge,y:original.y-uy*edge},diagonal=!!(ux&&uy),inset=diagonal?20:8;
  assert.equal(+head.attrs['data-arrow-entry-inset'],inset);
  assert(near(entry,{x:+head.attrs['data-arrow-entry-x'],y:+head.attrs['data-arrow-entry-y']}),'entry audit point lies on original lane and cell boundary');
  assert(near(tip,{x:entry.x+ux*inset,y:entry.y+uy*inset}),'tip stays at the specified axial/diagonal target-cell entry depth');
  assert(Math.abs(tip.x-last.x)<50&&Math.abs(tip.y-last.y)<50,'tip remains inside original target cell');
  for(const p of shapes[i]){assert(p.x>=0&&p.x<=900&&p.y>=0&&p.y<=900,'boundary wings remain on board');assert(Math.hypot(p.x-entry.x,p.y-entry.y)<21,'whole chevron stays local to entry boundary');}
  const back={x:(shapes[i][0].x+shapes[i][2].x)/2,y:(shapes[i][0].y+shapes[i][2].y)/2},v={x:tip.x-back.x,y:tip.y-back.y},direction={x:original.x-penultimate.x,y:original.y-penultimate.y};
  assert(v.x*direction.x+v.y*direction.y>0,'head direction never reverses');
  assert(Math.abs(v.x*direction.y-v.y*direction.x)<.1,'head remains parallel to final intended segment');
  assert.equal(+head.attrs['data-arrow-head-size'],diagonal?11:15,'axial and diagonal heads retain their specified readable size');
  assert(+head.attrs['data-arrow-head-width']>=6&&+head.attrs['data-arrow-head-width']<=15);
  assert.equal(+path.attrs['stroke-width'],4.5);assert.equal(+head.attrs['stroke-width'],3.2);
  assert(!head.attrs.mask,'head itself is never erased by the crossing mask');
  if(pin){const old=pin.arrows[i];assert.deepEqual(cells,old.cells);assert.deepEqual(lane,old.lane);assert.equal(+ring.attrs.r,old.radius,'all shared circle radii unchanged');
   assert(near(sample[0],old.start));assert.deepEqual(original,old.end,'semantic endpoint is unchanged');
   const actual=samplePath(path.attrs.d).commands,prior=samplePath(old.d).commands;
   assert.deepEqual(actual.map(c=>c.command),prior.map(c=>c.command),'path command and turn order remain exact');
   const q=prior.length-2,local=q>=1&&prior[q].command==='Q';
   const unchanged=local?q-1:prior.length-1;
   assert.deepEqual(actual.slice(0,unchanged),prior.slice(0,unchanged),'all commands before final local corner remain exact');
   if(local){assert.deepEqual(actual[q].values.slice(0,2),prior[q].values.slice(0,2),'final fillet retains original cell control point');
    assert(Math.hypot(actual[q].values[2]-actual[q].values[0],actual[q].values[3]-actual[q].values[1])<=14.1,'final corner remains locally rounded');}
  }
  if(retreat)retreated++;arrows++;
 }
 const masks=nodes.filter(n=>n.attrs['data-arrow-crossing-mask']!==undefined);
 for(const mask of masks){
  const index=+mask.attrs['data-arrow-crossing-mask'];assert.equal(mask.tag,'mask');assert.equal(mask.parentNode.tag,'defs','clearance never paints over board/grid background');
  for(const name of ['maskUnits','maskContentUnits'])assert.equal(mask.attrs[name],'userSpaceOnUse');
  assert.equal(mask.attrs['mask-type'],'luminance');assert.equal(paths[index].attrs.mask,'url(#'+mask.attrs.id+')');
  assert.deepEqual(mask.children[0].attrs,{x:'0',y:'0',width:'900',height:'900',fill:'white'});
  assert(mask.children.length>1,'no unnecessary empty masks');
  for(const gap of mask.children.slice(1)){
   assert.equal(gap.tag,'circle');assert.equal(gap.attrs.fill,'black');assert.equal(+gap.attrs['data-arrow-crossing-gap'],index);
   const over=+gap.attrs['data-arrow-crossing-over'],p={x:+gap.attrs.cx,y:+gap.attrs.cy},radius=+gap.attrs.r;
   assert(Number.isInteger(over)&&over>=0&&over<paths.length&&over!==index,'gap identifies a distinct crossing clue');
   assert(radius>=5.49&&radius<=10,'only a small local underpass is cleared');
   assert(closestPoint(samplePath(paths[index].attrs.d).samples,p).distance<.8,'gap center lies on affected shaft');
   assert(Math.min(closestPoint(samplePath(paths[over].attrs.d).samples,p).distance,closestPoint(samplePath(heads[over].attrs.d).samples,p).distance)<.8,'gap is at an actual foreign shaft or chevron crossing');
   assert(p.x-radius>=0&&p.y-radius>=0&&p.x+radius<=900&&p.y+radius<=900,'local clearance stays inside board');gaps++;
  }
 }
 for(const path of paths)if(path.attrs.mask)assert(masks.some(m=>path.attrs.mask==='url(#'+m.attrs.id+')'),'all masks resolve locally');
 for(let i=0;i<heads.length;i++)for(let j=i+1;j<heads.length;j++){
  if(assertSeparate)assert(headDistance(shapes[i],shapes[j])>3.2-1e-6,'all chevrons keep stroke-aware separation, including adjacent-cell diagonal junctions: '+context.id+' arrows '+i+'/'+j);
  if(context.clues.lines[i].cells.at(-1)===context.clues.lines[j].cells.at(-1))headPairs++;
 }
 const replay=new SvgNode('svg');view.render(replay,clone(context));assert.deepEqual(normalizedTree(svg),normalizedTree(replay),'live/replay use identical normalized geometry including miniature viewBox scaling');
 const ids=nodes.filter(n=>n.attrs.id).map(n=>n.attrs.id),replayIds=descendants(replay).filter(n=>n.attrs.id).map(n=>n.attrs.id);
 assert.equal(new Set(ids).size,ids.length);for(const id of ids)assert(!replayIds.includes(id),'live/replay mask IDs are unique');
 const replacements=svg.replacements,children=svg.children.slice();assert.equal(view.render(svg,clone(context)),result);assert.equal(svg.replacements,replacements);children.forEach((n,i)=>assert.equal(svg.children[i],n));
 view.render(svg,{mode:'classic',clues:{version:1}});assert(!descendants(svg).some(n=>n.tag==='mask'||n.attrs.mask||n.attrs['data-arrow-head']),'mode changes clear all crossing geometry');
 contexts++;return {paths,heads,masks};
}
for(const puzzle of seeds){const pin=baseline.rows.find(row=>row.id===puzzle.id);assert(pin);inspect(puzzle,pin,true);}
assert.equal(seeds.length,36);assert(retreated>0&&gaps>0,'catalog exercises real head collisions and line crossings');
const screenshot=seeds.find(p=>p.id==='V-arrow-easy-6'),dense=seeds.find(p=>p.id==='V-arrow-easy-10');assert(screenshot&&dense);
const screenshotResult=inspect(screenshot,baseline.rows.find(p=>p.id===screenshot.id),true);
for(const i of [0,5,10,11,16,7,15])assert(+screenshotResult.paths[i].attrs['data-arrow-end-retreat']>0,'known screenshot collision retreats arrow '+(i+1));
const denseCount=dense.clues.lines.filter(l=>l.cells.at(-1)===3).length;assert.equal(denseCount,3,'catalog densest shared-head regression is retained');
const synthetic=[
 {name:'isolated short axial',lines:[[0,1,2]]},
 {name:'isolated edge diagonal',lines:[[20,10,0]]},
 {name:'ordinary diagonal X',lines:[[0,10,20],[1,9,18]]},
 {name:'shared segment and bulb',lines:[[0,1,2,11],[0,1,2,3],[0,10,11,2],[20,11,10,1]]},
 {name:'head meets bulb at border',lines:[[2,1,0],[0,9,18]]}
];
function transform(cell,rotation,reflected){let x=cell%9,y=Math.floor(cell/9);if(reflected)x=8-x;for(let n=0;n<rotation;n++){const t=x;x=8-y;y=t;}return y*9+x;}
for(const item of synthetic)for(let rotation=0;rotation<4;rotation++)for(const reflected of [false,true]){
 const context={id:item.name+'/'+rotation+'/'+reflected,mode:'arrow',clues:{version:1,lines:item.lines.map(cells=>({type:'arrow',cells:cells.map(c=>transform(c,rotation,reflected))}))}};
 const result=inspect(context,null,true);
 if(item.name.startsWith('isolated')){assert(+result.paths[0].attrs['data-arrow-end-retreat']>0);assert.equal(result.masks.length,0);}
 if(item.name==='ordinary diagonal X')assert.equal(result.masks.length,1,'one local underpass, never duplicate whole-shaft backgrounds');
}
// Dense real configurations are also reflected/rotated through edge/corner orientations.
for(const puzzle of [screenshot,dense])for(let rotation=0;rotation<4;rotation++)for(const reflected of [false,true]){
 const context={id:puzzle.id+'/'+rotation+'/'+reflected,mode:'arrow',clues:{version:1,lines:puzzle.clues.lines.map(l=>({...l,cells:l.cells.map(c=>transform(c,rotation,reflected))}))}};
 inspect(context,null,true);
}
console.log('PASS local arrow crossings: '+contexts+' catalog/rotated/reflected/synthetic contexts, '+arrows+' direction/bulb/cell-preserved arrows, '+retreated+' bounded tips, '+gaps+' true local underpass gaps, '+headPairs+' separated shared-cell head pairs, unchanged lanes/rings/earlier paths and bounded final-corner rounding, unique live/replay masks and cache. SVG facade/math only.');
