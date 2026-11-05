/* Actual embedded-font outlines flattened to numerical contours. Font placement
 * is supplied explicitly by the caller: this does not measure a browser. */
'use strict';
const assert=require('node:assert/strict');
const fixture=require('./fixtures/numeral-glyph-outlines.json');
const arity={M:2,L:2,H:1,V:1,Q:4,C:6,Z:0};
function flattenContours(d){
 const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
 let at=0,command,p={x:0,y:0},start,contour,contours=[];
 const add=q=>{contour.push(q);p=q;};
 while(at<tokens.length){
  if(/^[a-zA-Z]$/.test(tokens[at]))command=tokens[at++];
  assert(Object.hasOwn(arity,command),'absolute font-outline command: '+command);
  const v=tokens.slice(at,at+arity[command]).map(Number);at+=arity[command];assert(v.every(Number.isFinite));
  if(command==='M'){contour=[];contours.push(contour);start={x:v[0],y:v[1]};add(start);command='L';continue;}
  const from=p,end=command==='H'?{x:v[0],y:p.y}:command==='V'?{x:p.x,y:v[0]}:command==='Z'?start:{x:v.at(-2),y:v.at(-1)};
  if(command==='Q'||command==='C')for(let i=1;i<=64;i++){const t=i/64,u=1-t;
   add(command==='Q'?{x:u*u*from.x+2*u*t*v[0]+t*t*end.x,y:u*u*from.y+2*u*t*v[1]+t*t*end.y}:
    {x:u**3*from.x+3*u*u*t*v[0]+3*u*t*t*v[2]+t**3*end.x,y:u**3*from.y+3*u*u*t*v[1]+3*u*t*t*v[3]+t**3*end.y});
  }else add(end);
  if(command==='Z')command=null;
 }
 return contours;
}
const base={};
for(const [weight,font] of Object.entries(fixture.fonts))base[weight]=Object.fromEntries(Object.entries(font.glyphs).map(([digit,g])=>[digit,flattenContours(g.d)]));
function bounds(points){return {left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};}
function placedGlyph(digit,{x=0,y=0,size=57,weight='400',baselineEm=.388}={}){
 const font=fixture.fonts[weight],glyph=font.glyphs[String(digit)],scale=size/font.unitsPerEm;
 assert(glyph,'bundled digit exists');
 const contours=base[weight][String(digit)].map(c=>c.map(p=>({x:x-glyph.advance*scale/2+p.x*scale,y:y+size*baselineEm-p.y*scale})));
 return {digit,weight,size,baselineEm,contours,bounds:bounds(contours.flat())};
}
function pointInGlyph(p,glyph){
 let winding=0;
 for(const points of glyph.contours)for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],cross=(b.x-a.x)*(p.y-a.y)-(p.x-a.x)*(b.y-a.y);
  if(a.y<=p.y&&b.y>p.y&&cross>0)winding++;
  if(a.y>p.y&&b.y<=p.y&&cross<0)winding--;
 }
 return winding!==0;
}
function pointSegmentDistance(p,a,b){const x=b.x-a.x,y=b.y-a.y,n=x*x+y*y,t=n?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/n)):0;return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);}
function segmentsCross(a,b,c,d){
 const x=b.x-a.x,y=b.y-a.y,u=d.x-c.x,v=d.y-c.y,den=x*v-y*u;
 if(Math.abs(den)<1e-12)return false;
 const t=((c.x-a.x)*v-(c.y-a.y)*u)/den,q=((c.x-a.x)*y-(c.y-a.y)*x)/den;
 return t>=0&&t<=1&&q>=0&&q<=1;
}
function segmentDistance(a,b,c,d){return segmentsCross(a,b,c,d)?0:Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));}
function strokeGlyphClearance(points,width,glyph){
 let minimum=Infinity;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if(pointInGlyph(a,glyph)||pointInGlyph(b,glyph))return -width/2;
  for(const c of glyph.contours)for(let j=1;j<c.length;j++){
   const u=c[j-1],v=c[j],dx=Math.max(Math.min(a.x,b.x)-Math.max(u.x,v.x),Math.min(u.x,v.x)-Math.max(a.x,b.x),0),dy=Math.max(Math.min(a.y,b.y)-Math.max(u.y,v.y),Math.min(u.y,v.y)-Math.max(a.y,b.y),0);
   if(Math.hypot(dx,dy)>minimum)continue;
   const d=segmentDistance(a,b,u,v);if(d<minimum)minimum=d;if(!minimum)return -width/2;
  }
 }
 return minimum-width/2;
}
module.exports={fixture,flattenContours,placedGlyph,pointInGlyph,strokeGlyphClearance,bounds};
