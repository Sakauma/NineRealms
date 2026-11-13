'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),E=require('../src/engine'),R=require('../src/rule-path-grading'),C=require('../src/curated');
let cases=0;
function verify(p){
 const context={mode:p.mode,clues:p.clues},input=p.givens.slice(),start=JSON.stringify(input),a=R.analyze(input,context,{trace:true}),b=input.slice();
 assert.equal(JSON.stringify(input),start,'grader does not mutate the board');
 assert.deepEqual(R.analyze(input,context,{trace:true}),a,'operation-bounded deterministic grading');
 for(const wave of a.trace){
  const candidates=b.map((n,i)=>n?[]:E.candidates(b,i,context)),units=E.getUnits(context).filter(u=>u.cells.length===9),expected=new Map();
  candidates.forEach((v,i)=>{if(!b[i]&&v.length===1)expected.set(i,v[0]);});
  units.forEach(u=>{for(let n=1;n<=9;n++){if(u.cells.some(i=>b[i]===n))continue;const at=u.cells.filter(i=>!b[i]&&candidates[i].includes(n));if(at.length===1){if(expected.has(at[0]))assert.equal(expected.get(at[0]),n);expected.set(at[0],n);}}});
  assert.equal(wave.length,expected.size,'wave includes exactly the simultaneous deductions');
  for(const m of wave){assert.equal(b[m.index],0);assert.equal(expected.get(m.index),m.digit);if(m.kind==='naked-single')assert.deepEqual(candidates[m.index],[m.digit]);else assert.equal(units[m.unit].cells.filter(i=>!b[i]&&candidates[i].includes(m.digit)).length,1);}
  wave.forEach(m=>b[m.index]=m.digit);
  assert.equal(E.getConflicts(b,context).length,0);
 }
 assert.equal(a.placements,input.filter(n=>!n).length-a.remaining);
 assert.equal(a.rounds,a.trace.length);
 if(a.solved){assert.deepEqual(b,p.solution);assert(E.validateComplete(b,context));assert.equal(a.level,R.tier(a,p.mode));}
 else assert.equal(a.level,null);
 if(a.rounds){assert.equal(R.analyze(input,context,{maxRounds:0}).status,'budget');assert.equal(R.tier(R.analyze(input,context,{maxRounds:0})),null);}
 if(p.mode==='twin'||p.mode==='samurai')assert.equal(a.ruleReductionPlacements,null);
 cases++;return a;
}
for(const entry of C.list())verify(C.getPuzzle(entry.id));
for(const mode of ['twin','samurai'])for(const difficulty of ['easy','medium','hard'])verify(E.getPuzzle(difficulty,'rule-path-contract',mode));
const p=C.getPuzzle(C.list({mode:'thermo'})[0].id);
const realSearch=E.analyzeSolutions,realSolve=E.solve,realGet=E.getPuzzle;
E.analyzeSolutions=E.solve=E.getPuzzle=()=>{throw Error('grader must not solve/search/read bank')};
try{verify(p);}finally{E.analyzeSolutions=realSearch;E.solve=realSolve;E.getPuzzle=realGet;}
assert.equal(R.analyze(p.solution,{mode:p.mode,clues:p.clues}).level,null,'completed puzzle is not rated easy');
assert.equal(R.analyze(p.givens.slice(1),{mode:p.mode,clues:p.clues}).status,'invalid');
assert.equal(R.analyze(p.givens,{mode:p.mode,clues:p.clues},{maxRounds:-1}).status,'invalid');
assert.equal(R.analyze(Array(81).fill(0),'classic').status,'beyond-supported');
assert.equal(R.analyze(Array(81).fill(1),'classic').status,'invalid');
for(const mode of ['thermo','killer','thermo-killer','nonconsecutive','twin','samurai']){
 const limits=R.thresholds(mode);
 for(let rounds=1;rounds<=10;rounds++){
  const result={version:1,mode,status:'rated',solved:true,rounds,givenCount:1};
  const tier=R.tier(result);assert.equal(tier,rounds<=limits.easyMax?'easy':rounds<=limits.mediumMax?'medium':'hard');
  result.givenCount=80;assert.equal(R.tier(result),tier,'density is not a grading input');
  assert.equal(R.tier({...result,status:'budget'}),null);
 }
 limits.easyMax=100;assert.notEqual(R.thresholds(mode).easyMax,100,'defensive cutoff copy');
}
const sandbox=vm.createContext({});vm.runInContext(E.workerSource()+R.workerSource(),sandbox);
const got=vm.runInContext('NineRealmsRulePathGrading.analyze('+JSON.stringify(p.givens)+','+JSON.stringify({mode:p.mode,clues:p.clues})+',{trace:true})',sandbox);
assert.deepEqual(JSON.parse(JSON.stringify(got)),R.analyze(p.givens,{mode:p.mode,clues:p.clues},{trace:true}));
console.log('PASS rule-path grading: '+cases+' replayed proofs; exact parallel waves, no answer/search, complete-only tiers, density-independent cutoffs, multi-board and worker parity. Not human difficulty calibration.');
