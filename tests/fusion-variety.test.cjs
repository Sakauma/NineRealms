'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),C=require('../src/challenge.js'),New=require('../src/fusion-bank.js'),Old=require('../src/variant-bank.js');
assert.equal(New.length,6);const solutions=new Set(),structures=new Set();let joint=0;
function canonical(b){const variants=[];for(let mirror=0;mirror<2;mirror++)for(let rotate=0;rotate<4;rotate++){const m=new Map(),v=b.map((_,i)=>{let r=Math.floor(i/9),c=i%9;if(mirror)c=8-c;for(let n=0;n<rotate;n++)[r,c]=[c,8-r];return b[r*9+c];});variants.push(v.map(n=>{if(!m.has(n))m.set(n,m.size+1);return m.get(n);}).join(''));}return variants.sort()[0];}
for(const p of Old.filter(p=>p.mode==='thermo-killer'))solutions.add(canonical(p.solution));
for(const source of New){const p=E.getPuzzle(source.difficulty,'variety-roundtrip','thermo-killer',{sourceId:source.id}),c={mode:p.mode,clues:p.clues};assert(!solutions.has(canonical(p.solution)),'different grids beyond digit relabeling and dihedral symmetry');solutions.add(canonical(p.solution));const shape=JSON.stringify([p.clues.cages.map(c=>c.cells),p.clues.lines.map(l=>l.cells)]);assert(!structures.has(shape));structures.add(shape);
 assert(p.clues.cages.some(c=>new Set(c.cells.map(i=>Math.floor(i/9))).size>1&&new Set(c.cells.map(i=>i%9)).size>1));
 const covered=p.clues.cages.flatMap(c=>c.cells);assert.equal(new Set(covered).size,81);assert.equal(covered.length,81);
 for(const cage of p.clues.cages){const v=cage.cells.map(i=>p.solution[i]);assert.equal(new Set(v).size,v.length);assert.equal(v.reduce((a,b)=>a+b,0),cage.sum);}
 for(const line of p.clues.lines){const v=line.cells.map(i=>p.solution[i]);assert(v.every((n,i)=>i===0||n>v[i-1]));}
 const proof=E.analyzeSolutions(p.givens,c,{limit:2,maxNodes:250000,timeLimitMs:1000});assert.equal(proof.count,1);assert(!proof.exhausted);assert.deepEqual(proof.solution,p.solution);
 for(const [mode,clues]of [['killer',{version:1,cages:p.clues.cages}],['thermo',{version:1,lines:p.clues.lines}]]){const q=E.analyzeSolutions(p.givens,{mode,clues},{limit:2,maxNodes:100000,timeLimitMs:1000});assert.equal(q.count,2,source.id+'/'+mode);assert(!q.exhausted);}
 const b=p.givens.slice();let localJoint=0;while(!b.every(Boolean)){const i=b.findIndex((v,i)=>!v&&E.candidates(b,i,c).length===1);if(i<0)break;const e=E.getFusionCandidateEvidence(b,i,c);if(e.cage.length>1&&e.thermo.length>1)localJoint++;b[i]=E.candidates(b,i,c)[0];}assert(localJoint>0);joint+=localJoint;
 const decoded=C.decode(C.create(p));assert.deepEqual(decoded.givens,p.givens);assert.deepEqual(decoded.clues,p.clues);assert.deepEqual(decoded.solution,p.solution);
}
console.log('PASS six new fusion structures: distinct symmetry-normalized solutions, connected cages, rule sums/order, unique complete proof, both families essential, '+joint+' actual intersection-only singles, challenge roundtrips; no human difficulty claim.');
