'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../src/engine'),S=require('../src/diversity-source'),D=require('../src/puzzle-diversity');
assert.deepEqual(S.supportedModes(),['classic','diagonal','hyper','knight','king','nonconsecutive','disjoint','jigsaw','twin','samurai']);
assert.equal(S.supports('miracle'),false);assert.equal(S.supports('samurai'),true);assert.equal(S.supports('jigsaw'),true);
assert.throws(()=>S.generate({mode:'miracle',seed:'x'}),{code:'DIVERSITY_UNSUPPORTED_MODE'});
for(const seed of ['',null,123,'x'.repeat(257)])assert.throws(()=>S.generate({seed}),{code:'INVALID_SEED'});
for(const budget of [0,-1,1.5,Infinity,1000001])assert.throws(()=>S.generate({seed:'x',maxNodes:budget}),{code:'INVALID_CONSTRUCTION_BUDGET'});
for(const budget of [0,-1,1.5,17])assert.throws(()=>S.generate({seed:'x',maxAttempts:budget}),{code:'INVALID_CONSTRUCTION_BUDGET'});
assert.throws(()=>S.generate({seed:'bounded',maxNodes:1,maxAttempts:2}),e=>e.code==='DIVERSITY_BUDGET'&&e.construction.nodes===2&&e.construction.attempts===2);
const getPuzzle=E.getPuzzle,now=Date.now,random=Math.random;
E.getPuzzle=()=>{throw Error('must not read bank');};Date.now=Math.random=()=>{throw Error('must be seed-only');};
try{const a=S.generate({seed:'independent'}),b=S.generate({seed:'independent'});assert.deepEqual(a,b);a.givens[0]=0;assert(b.givens[0]);assert(a.solution[0]);}finally{E.getPuzzle=getPuzzle;Date.now=now;Math.random=random;}
const sandbox=vm.createContext({SudokuEngine:E});vm.runInContext(S.workerSource(),sandbox);for(const mode of S.supportedModes().filter(m=>!['nonconsecutive','jigsaw','twin','samurai'].includes(m)))assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('NineRealmsDiversitySource.generate('+JSON.stringify({mode,seed:'worker-parity'})+')',sandbox))),S.generate({mode,seed:'worker-parity'}));
const rows=[],samples=Number(process.env.SOURCE_SAMPLES||100);
for(const mode of S.supportedModes().filter(m=>!['jigsaw','twin','samurai'].includes(m))){
 const started=performance.now(),solutions=[],invariants=new Set();let maxMs=0,maxNodes=0,budgetFallbacks=0,repeatedEquivalenceClasses=0;
 for(let i=0;i<samples;i++){
  const seed='evidence-'+i,start=performance.now();let p;
  try{p=S.generate({mode,seed});}catch(e){assert.equal(e.code,'DIVERSITY_BUDGET');assert.equal(mode,'nonconsecutive');budgetFallbacks++;continue;}
  maxMs=Math.max(maxMs,performance.now()-start);maxNodes=Math.max(maxNodes,p.construction.nodes);
  assert(E.validateComplete(p.solution,{mode,clues:p.clues}));assert.deepEqual(p.givens,p.solution);assert.deepEqual(p.clues,E.normalizeClues(mode,{}));
  assert.equal(p.construction.kind,'random-search');assert(p.construction.nodes<=p.construction.maxNodes*p.construction.maxAttempts);
  // Full classical equivalence includes digit relabel, band/stack and within-band
  // row/column permutations, and transpose. Not merely different raw arrays.
  if(solutions.some(other=>D.equivalentSolutions(other,p.solution)))repeatedEquivalenceClasses++;else solutions.push(p.solution);invariants.add(D.solutionInvariant(p.solution));
 }
 assert(solutions.length>0);if(mode!=='nonconsecutive')assert.equal(solutions.length,samples);else assert(solutions.length>samples/4);
 rows.push({mode,requests:samples,successes:samples-budgetFallbacks,budgetFallbacks,repeatedEquivalenceClasses,inequivalentSolutions:solutions.length,distinctQuickInvariants:invariants.size,maxConstructionNodes:maxNodes,maxConstructionMs:Math.round(maxMs),auditMs:Math.round(performance.now()-started)});
}
const report={version:1,method:'empty-board seeded MRV search; exact classical solution-equivalence audit',miracle:'excluded; sampled completions collapse to one classical equivalence class',rows};
fs.mkdirSync('evidence/diversity',{recursive:true});fs.writeFileSync('evidence/diversity/source-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
