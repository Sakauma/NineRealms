'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const D=require('../src/puzzle-diversity.js'),E=require('../src/engine.js');
let state=193827;function random(n){state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function axis(){return shuffle([0,1,2]).flatMap(b=>shuffle([0,1,2]).map(n=>b*3+n));}
function transform(a){const rows=axis(),cols=axis(),digits=[0,...shuffle([1,2,3,4,5,6,7,8,9])],flip=random(2);return Array.from({length:81},(_,i)=>digits[a[flip?cols[i%9]*9+rows[i/9|0]:rows[i/9|0]*9+cols[i%9]]]);}
// Independent test-only randomized MRV solver, not production generator or equivalence code.
function fresh(){const a=Array(81).fill(0),rows=Array(9).fill(0),cols=rows.slice(),boxes=rows.slice();
 function visit(){let index=-1,choices=null;for(let i=0;i<81;i++)if(!a[i]){const mask=rows[i/9|0]|cols[i%9]|boxes[(i/27|0)*3+(i%9/3|0)],available=[];for(let n=1;n<=9;n++)if(!(mask&(1<<n)))available.push(n);if(!available.length)return false;if(!choices||available.length<choices.length){choices=available;index=i;}if(choices.length===1)break;}if(index<0)return true;const r=index/9|0,c=index%9,b=(index/27|0)*3+(index%9/3|0);for(const n of shuffle(choices)){a[index]=n;rows[r]|=1<<n;cols[c]|=1<<n;boxes[b]|=1<<n;if(visit())return true;rows[r]^=1<<n;cols[c]^=1<<n;boxes[b]^=1<<n;a[index]=0;}return false;}
 assert(visit());return a;
}
const boards=Array.from({length:12},fresh),signatures=boards.map(a=>D.solutionSignature(a));
assert.equal(new Set(signatures).size,12,'independent random boards must not be merged');
for(const a of boards)assert(E.validateComplete(a,'classic'));
let transforms=0;for(const [index,a] of boards.entries())for(let n=0;n<12;n++){const b=transform(a);assert(E.validateComplete(b,'classic'));assert(D.equivalentSolutions(a,b));assert(D.equivalentSolutions(b,a));assert.equal(D.solutionInvariant(a),D.solutionInvariant(b));if(n===0)assert.equal(D.solutionSignature(b),signatures[index]);transforms++;}
for(let i=0;i<boards.length;i++)for(let j=0;j<i;j++){assert(!D.equivalentSolutions(boards[i],boards[j]));assert.notEqual(signatures[i],signatures[j]);}
// Very symmetric cyclic grid exercises ambiguous row mappings and transpose symmetry.
const cyclic=Array.from({length:81},(_,i)=>((i/9|0)*3+(i/27|0)+i%9)%9+1);
for(let i=0;i<10;i++)assert(D.equivalentSolutions(cyclic,transform(cyclic)));
assert.equal(D.solutionSignature(cyclic),D.solutionSignature(transform(cyclic)));
assert.throws(()=>D.solutionSignature(Array(81).fill(1)));assert.throws(()=>D.equivalentSolutions(boards[0],Array(80).fill(1)));assert.throws(()=>D.solutionInvariant('0'.repeat(81)));
assert(D.equivalentSolutions(boards[0].join(''),boards[0]));
// Entire-rule D4 changes, list reordering and region ID relabelling are ignored.
const clues={version:1,cages:[{cells:[0,1,10],sum:12,unique:true},{cells:[65,66],sum:8,unique:true}],lines:[{type:'thermo',cells:[20,21,22,31]},{type:'arrow',cells:[40,41,50]}],edges:[{type:'greater',cells:[53,62]}],parity:[{cell:17,parity:'odd'}],quadruples:[{cells:[54,55,63,64],values:[1,2]}],clones:[{a:[3,4],b:[12,13]}],outside:[{type:'xsum',side:'top',index:5,cells:[5,14,23,32,41,50,59,68,77],value:13}]};
function rotate(a){return a.map(i=>(i%9)*9+8-(i/9|0));}
function rotateClues(x){const c=JSON.parse(JSON.stringify(x));for(const k of ['cages','lines','edges','quadruples'])c[k]?.forEach(v=>v.cells=rotate(v.cells));c.parity?.forEach(v=>v.cell=rotate([v.cell])[0]);c.clones?.forEach(v=>{v.a=rotate(v.a);v.b=rotate(v.b);});c.outside?.forEach(v=>{v.cells=rotate(v.cells);const old=v.side;v.side={top:'right',right:'bottom',bottom:'left',left:'top'}[old];if(old==='right'||old==='left')v.index=8-v.index;});return c;}
let rotated=clues;for(let n=0;n<4;n++){rotated=rotateClues(rotated);assert.equal(D.layoutSignature('test',clues),D.layoutSignature('test',rotated));assert.equal(D.layoutSignature('test',clues,{includeValues:true}),D.layoutSignature('test',rotated,{includeValues:true}));}
const mirrored=JSON.parse(JSON.stringify(clues)),mirror=a=>a.map(i=>(i/9|0)*9+8-i%9);
for(const k of ['cages','lines','edges','quadruples'])mirrored[k].forEach(v=>v.cells=mirror(v.cells));mirrored.parity.forEach(v=>v.cell=mirror([v.cell])[0]);mirrored.clones.forEach(v=>{v.a=mirror(v.a);v.b=mirror(v.b);});mirrored.outside.forEach(v=>{v.cells=mirror(v.cells);if(v.side==='top'||v.side==='bottom')v.index=8-v.index;else v.side=v.side==='left'?'right':'left';});
assert.equal(D.layoutSignature('test',clues),D.layoutSignature('test',mirrored));assert.equal(D.layoutSignature('test',clues,{includeValues:true}),D.layoutSignature('test',mirrored,{includeValues:true}));
const reversed=JSON.parse(JSON.stringify(clues));reversed.lines.reverse();reversed.cages.reverse();reversed.cages[0].cells.reverse();assert.equal(D.layoutSignature('test',clues),D.layoutSignature('test',reversed));
const changed=JSON.parse(JSON.stringify(clues));changed.cages[0].sum++;assert.equal(D.layoutSignature('test',clues),D.layoutSignature('test',changed));assert.notEqual(D.layoutSignature('test',clues,{includeValues:true}),D.layoutSignature('test',changed,{includeValues:true}));
changed.lines[0].cells.reverse();assert.notEqual(D.layoutSignature('test',clues),D.layoutSignature('test',changed),'thermometer bulb direction matters');
assert.notEqual(D.layoutSignature('test',clues),D.layoutSignature('other-mode',clues));assert.throws(()=>D.layoutSignature('test',{mystery:[]}));
const regions=Array.from({length:81},(_,i)=>(i/27|0)*3+(i%9/3|0));assert.equal(D.layoutSignature('jigsaw',{regions}),D.layoutSignature('jigsaw',{regions:regions.map(n=>8-n)}));
const context=vm.createContext({});vm.runInContext(D.workerSource(),context);assert.equal(context.NineRealmsDiversity.solutionSignature(boards[0]),signatures[0]);assert(context.NineRealmsDiversity.equivalentSolutions(boards[0],transform(boards[0])));
// Online bound: 64 recent boards are quickly rejected with an invariant; exact
// checks remain available when invariants collide. Timing is diagnostic, not a
// flaky shared-runner assertion. The candidate count is the explicit CPU bound.
const recent=Array.from({length:64},(_,i)=>transform(boards[i%boards.length])),candidate=fresh();let start=performance.now();for(const previous of recent)assert(!D.equivalentSolutions(candidate,previous));const rejectMs=performance.now()-start;
start=performance.now();for(let i=0;i<12;i++)assert(D.equivalentSolutions(boards[i],transform(boards[i])));const equivalentMs=performance.now()-start;
console.log(`PASS diversity: ${transforms} randomized full-group transforms + 10 symmetric transforms, 12 independent canonical classes, 66 negative pairs, D4 rules/value separation and worker parity; 64 recent rejections ${rejectMs.toFixed(1)}ms; 12 exact matches ${equivalentMs.toFixed(1)}ms.`);
