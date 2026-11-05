/* Coupled CSS sizes and HTML border offsets in the shared 900-unit SVG box.
 * These are explicit model samples, not computed browser styles. */
'use strict';
function profiles({mainCap=70,noteCap=20,noteInset=.20}={}){
 const out=[],clamp=(a,x,b)=>Math.max(a,Math.min(x,b));
 function add(base,mainPx,notePx){for(const fallback of [false,true])for(const weight of ['400','600'])for(const baselineEm of [.36,.388])for(const kind of ['main','notes']){
  if(base.stress&&fallback)continue;
  const px=kind==='main'?mainPx:notePx,cap=kind==='main'?mainCap:noteCap;
  out.push({...base,name:base.name+(fallback?'/fallback':'/cqw')+'/'+weight,kind,weight,baselineEm,size:fallback?Math.min(px,kind==='main'?20:6)*base.overlayScale:Math.min(px*base.overlayScale,cap),noteInsetRatio:noteInset,glyphHaloEm:kind==='main'?.04:.06,fallback});
 }}
 for(const width of [320,350,360,390,480,600,760])for(const large of [false,true])for(const strong of [false,true]){
  const grid=Math.min(width-24,600)-18;
  add({name:`mobile${width}/${large?'large':'normal'}/${strong?'strong':'normal'}`,cellPixels:(grid-2)/9,overlayScale:900/grid,boardBorder:1,strong},large?29:width<=350?24:26,large?11.5:width<=350?10:10.5);
 }
 for(const grid of [318,400,500,618])for(const height of [600,760,900,1080])for(const large of [false,true])for(const strong of [false,true]){
  add({name:`desktopGrid${grid}/height${height}/${large?'large':'normal'}/${strong?'strong':'normal'}`,cellPixels:(grid-2)/9,overlayScale:900/grid,boardBorder:1,strong},clamp(28,.041*height,38)+(large?3:0),(height<=760?10.5:11.5)+(large?1:0));
 }
 for(const width of [180,240,300,450])for(const viewport of [320,600,1024,1440])add({name:`replay${width}/viewport${viewport}`,replay:true,stress:width<240,cellPixels:width/9,overlayScale:900/width,boardBorder:0},clamp(16,.018*viewport,24),clamp(6,.008*viewport,10));
 for(const viewport of [320,350,360,361,390,480,600,601,640,760,761,800,1024,1440,2560]){
  const dialog=Math.min(1020,viewport-(viewport<=600?24:32));
  const padding=viewport<=360?14:viewport<=600?18:viewport<=760?20:24;
  const sidebar=viewport<=600?0:viewport<=760?190:230,gap=viewport<=600?0:viewport<=760?16:24;
  const detail=viewport<=600?0:viewport<=760?17:25;
  const width=Math.min(450,dialog-2-2*padding-sidebar-gap-detail-12);
  add({name:`actualReplay/viewport${viewport}/stage${width}`,replay:true,cellPixels:width/9,overlayScale:900/width,boardBorder:0},clamp(16,.018*viewport,24),clamp(6,.008*viewport,10));
 }
 return out;
}
module.exports=profiles;
if(require.main===module)process.stdout.write(JSON.stringify(profiles(),null,2)+'\n');
