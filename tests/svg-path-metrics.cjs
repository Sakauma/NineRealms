/* Test-only numerical sampling of SVG paths. No layout engine or browser. */
'use strict';
const assert = require('node:assert/strict');
const arity = {M:2,L:2,H:1,V:1,Q:4,C:6,Z:0};
function samplePath(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
  const samples = [], commands = [];
  let position = {x:0,y:0}, start = null, index = 0, command;
  const push = point => { assert(Number.isFinite(point.x) && Number.isFinite(point.y)); samples.push(point); position=point; };
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    assert(Object.hasOwn(arity,command), 'supported absolute path command: ' + command);
    const values = tokens.slice(index,index+arity[command]).map(Number);
    assert.equal(values.length,arity[command]);
    assert(values.every(Number.isFinite));
    index += arity[command];
    commands.push({command,values});
    const from = {...position};
    if (command==='M') { push({x:values[0],y:values[1]});start={...position};command='L';continue; }
    const end = command==='H' ? {x:values[0],y:from.y} : command==='V' ? {x:from.x,y:values[0]} :
      command==='Z' ? start : {x:values.at(-2),y:values.at(-1)};
    assert(end, 'closed path has a starting point');
    const count = Math.max(32,Math.ceil(Math.hypot(end.x-from.x,end.y-from.y)));
    for (let step=1;step<=count;step++) {
      const t=step/count,u=1-t;
      if(command==='Q')push({x:u*u*from.x+2*u*t*values[0]+t*t*end.x,y:u*u*from.y+2*u*t*values[1]+t*t*end.y});
      else if(command==='C')push({x:u**3*from.x+3*u*u*t*values[0]+3*u*t*t*values[2]+t**3*end.x,
        y:u**3*from.y+3*u*u*t*values[1]+3*u*t*t*values[3]+t**3*end.y});
      else push({x:from.x+(end.x-from.x)*t,y:from.y+(end.y-from.y)*t});
    }
    if(command==='Z')command=null;
  }
  return {commands,samples};
}
function closestPoint(samples, point, after=0) {
  let result={index:-1,distance:Infinity};
  for(let index=after;index<samples.length;index++) {
    const distance=Math.hypot(samples[index].x-point.x,samples[index].y-point.y);
    if(distance<result.distance)result={index,distance,point:samples[index]};
  }
  return result;
}
const center = cell => ({x:cell%9*100+50,y:Math.floor(cell/9)*100+50});
module.exports={samplePath,closestPoint,center};
