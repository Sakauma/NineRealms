/* Conservative bounding-box proof: no candidate's contour reaches another
 * candidate's ink. Two backdrop-colored contours may overlap harmlessly. */
'use strict';
const assert=require('node:assert/strict'),G=require('./numeral-glyph-metrics.cjs');
const profiles=require('./arrow-glyph-profiles.cjs')().filter(p=>p.kind==='notes'),cache=new Map();
let minimum=Infinity,actualMinimum=Infinity,pairs=0;
for(const p of profiles){
 let sx=Infinity,sy=Infinity;
 for(let cell=0;cell<81;cell++){
  const col=cell%9,row=Math.floor(cell/9),cp=p.cellPixels,scale=p.overlayScale;
  const bx=p.replay?(col%3===2?1.5:1):p.strong?(col%3===2?3:1.5):(col===8?0:col%3===2?2:1),by=p.replay?(row%3===2?1.5:1):p.strong?(row===2||row===5?3:1.5):(row===8?0:row===2||row===5?2:1),bl=p.replay&&col%3===0?1.5:0,bt=p.replay&&row%3===0?1.5:0;
  sx=Math.min(sx,(cp-bx-bl)*(1-2*p.noteInsetRatio)/3*scale);sy=Math.min(sy,(cp-by-bt)*(1-2*p.noteInsetRatio)/3*scale);
 }
 const key=[p.size,p.weight,p.baselineEm].join('/');
 if(!cache.has(key))cache.set(key,Array.from({length:9},(_,i)=>G.placedGlyph(i+1,{size:p.size,weight:p.weight,baselineEm:p.baselineEm}).bounds));
 const gs=cache.get(key),halo=p.size*.06;
 for(let a=0;a<9;a++)for(let b=a+1;b<9;b++){
  const dx=(b%3-a%3)*sx,dy=(Math.floor(b/3)-Math.floor(a/3))*sy;
  const horizontal=Math.max(dx+gs[b].left-gs[a].right,gs[a].left-dx-gs[b].right,0),vertical=Math.max(dy+gs[b].top-gs[a].bottom,gs[a].top-dy-gs[b].bottom,0);
  const gap=Math.hypot(horizontal,vertical)-halo;
  assert(gap>.1,JSON.stringify({profile:p.name,a:a+1,b:b+1,gap}));minimum=Math.min(minimum,gap);pairs++;
  if(p.name.startsWith('actualReplay')||!p.replay)actualMinimum=Math.min(actualMinimum,gap);
 }
}
console.log(`PASS candidate spacing:${profiles.length} coupled profiles,${pairs} all-nine-note pairs,400/600 ink boxes with .12em contour; minimum ink-to-other-contour clearance${minimum.toFixed(6)} units (${actualMinimum.toFixed(6)} on modeled current layouts). Contours may meet only other backdrop contours; no native pixel claim.`);
