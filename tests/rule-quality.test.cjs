'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),E=require('../src/engine'),R=require('../src/rule-path-grading'),Q=require('../src/rule-quality');
// A separate replay implementation, never reads answers, reuses neither quality
// counters nor RulePath traces to decide a step.
function moves(board,ctx){const c=board.map((n,i)=>n?[]:E.candidates(board,i,ctx)),out=new Map();
 for(let i=0;i<board.length;i++)if(!board[i]&&c[i].length===1)out.set(i,c[i][0]);
 for(const u of E.getUnits(ctx).filter(u=>u.cells.length===9))for(let d=1;d<=9;d++)if(!u.cells.some(i=>board[i]===d)){const ix=u.cells.filter(i=>!board[i]&&c[i].includes(d));if(ix.length===1){if(out.has(ix[0]))assert.equal(out.get(ix[0]),d);out.set(ix[0],d);}}
 return {c,out};}
function replay(input,ctx){const b=input.slice(),waves=[];while(b.some(n=>!n)){const m=moves(b,ctx);if(!m.out.size)break;waves.push(m);for(const[i,d]of m.out)b[i]=d;assert(!E.getConflicts(b,ctx).length);}return {b,waves};}
let verified=0,unproven=0,classicComplete=0,ruleNeeded=0,example;
for(const mode of Q.supportedModes())for(const difficulty of ['easy','medium','hard']){
 const p=E.getPuzzle(difficulty,'quality-proof-'+mode,mode),ctx={mode,clues:p.clues},copy=JSON.stringify(p.givens),a=Q.analyze(p.givens,ctx);assert.equal(JSON.stringify(p.givens),copy);assert.deepEqual(Q.analyze(p.givens,ctx),a);
 const full=replay(p.givens,ctx);if(full.b.some(n=>!n)){assert.equal(a.status,'unproven');assert(!Q.accepts(a,difficulty));assert.equal(Q.summary(a),null);unproven++;continue;}
 assert.equal(a.status,'verified');verified++;example={p,ctx,a};assert.deepEqual(full.b,p.solution);
 const baseline=replay(p.givens,'classic');assert.equal(a.classicSolved,baseline.b.every(Boolean));assert.equal(a.classicRemaining,baseline.b.filter(n=>!n).length);assert.equal(a.classicPlacements,p.givens.filter(n=>!n).length-a.classicRemaining);
 if(a.classicSolved){classicComplete++;assert(!Q.accepts(a,'medium'));assert(!Q.accepts(a,'hard'));}else ruleNeeded++;
 const b=p.givens.slice(),rows=new Set(),cols=new Set(),boxes=new Set(),indices=[],unlockedBoxes=new Set();let breaks=0,affects=0,affectedWaves=0,unlockedCells=0,unlockedWaves=0;
 for(const [w,proof]of full.waves.entries()){
  const old=moves(b,'classic');let breaksHere=0,affectsHere=0,unlockedHere=0;
  for(const[i,d]of proof.out){if(old.c[i].length>proof.c[i].length){affects++;affectsHere++;}if(old.out.get(i)!==d){breaks++;breaksHere++;rows.add(Math.floor(i/9));cols.add(i%9);boxes.add(Math.floor(i/27)*3+Math.floor(i%9/3));}else if(!baseline.b[i]){unlockedCells++;unlockedHere++;unlockedBoxes.add(Math.floor(i/27)*3+Math.floor(i%9/3));}}
  if(unlockedHere)unlockedWaves++;if(breaksHere)indices.push(w+1);if(affectsHere)affectedWaves++;for(const[i,d]of proof.out)b[i]=d;
 }
 assert.equal(a.unlockedClassicCells,unlockedCells);assert.equal(a.unlockedClassicWaves,unlockedWaves);assert.equal(a.unlockedClassicBoxes,unlockedBoxes.size);assert.equal(a.breakthroughCells,breaks);assert.equal(a.affectedCells,affects);assert.equal(a.breakthroughWaves,indices.length);assert.equal(a.affectedWaves,affectedWaves);assert.deepEqual(a.breakthroughWaveIndices,indices);assert.equal(a.breakthroughRows,rows.size);assert.equal(a.breakthroughColumns,cols.size);assert.equal(a.breakthroughBoxes,boxes.size);assert.equal(a.rounds,full.waves.length);assert.equal(a.initialChoices,full.waves[0].out.size);assert.equal(a.minChoices,Math.min(...full.waves.map(w=>w.out.size)));
 const s=Q.summary(a);assert(Q.validate(p.givens,ctx,s));assert(Q.sameSummary(s,JSON.parse(JSON.stringify(s))));assert(!Object.hasOwn(s,'initialChoiceRatio'));assert(!Object.hasOwn(s,'breakthroughWaveIndices'));
 for(const k of Object.keys(s)){const bad={...s};if(typeof bad[k]==='number')bad[k]++;else if(typeof bad[k]==='boolean')bad[k]=!bad[k];else bad[k]+='tampered';assert(!Q.sameSummary(bad,s),k+' tampering rejected');}
 assert(!Q.validate(p.givens,ctx,{...s,extra:0}));assert(!Q.validate(p.givens,ctx,{...s,breakthroughCells:s.breakthroughCells+1}));
}
assert(verified>=20);assert(classicComplete>0);assert(ruleNeeded>0);
// Fixed thresholds distinguish an actual extra forced digit from mere shrinkage.
const base={version:1,status:'verified',fullSolved:true,classicSolved:false,classicRemaining:10,classicSearchPerformed:true,classicSolutionCount:2,classicSearchExhausted:false,breakthroughCells:0,breakthroughWaves:0,breakthroughBoxes:0,affectedCells:1};
assert(Q.accepts(base,'easy'));assert(!Q.accepts(base,'medium'));assert(Q.accepts({...base,breakthroughCells:2,breakthroughWaves:1},'medium'));assert(!Q.accepts({...base,breakthroughCells:2,breakthroughWaves:1},'hard'));assert(!Q.accepts({...base,breakthroughCells:3,breakthroughWaves:2,breakthroughBoxes:1},'hard'));assert(Q.accepts({...base,breakthroughCells:3,breakthroughWaves:2,breakthroughBoxes:2},'hard'));
assert.equal(Q.analyze(Array(81).fill(0),{mode:'classic'}).status,'unsupported');assert.equal(Q.analyze(Array(81).fill(1),{mode:'thermo'}).status,'unproven');
// Exhaustion and single-solution evidence never satisfy the stronger rule gate.
assert(!Q.accepts({...base,breakthroughCells:9,breakthroughWaves:9,breakthroughBoxes:9,classicSearchExhausted:true},'medium'));
assert(!Q.accepts({...base,breakthroughCells:9,breakthroughWaves:9,breakthroughBoxes:9,classicSolutionCount:1},'hard'));
const searchOriginal=E.analyzeSolutions;let boundedCalls=0;E.analyzeSolutions=(g,c,o)=>{assert.equal(c,'classic');assert.equal(o.maxNodes,12000);assert.equal(o.limit,2);boundedCalls++;return {count:1,exhausted:true,nodes:12001};};
try{for(const mode of ['thermo','killer','arrow']){const p=E.getPuzzle('medium','budget-'+mode,mode),q=Q.analyze(p.givens,{mode,clues:p.clues});if(q.status==='verified'&&!q.classicSolved){assert(q.classicSearchExhausted);assert(!Q.accepts(q,'medium'));}}assert(boundedCalls>0);}finally{E.analyzeSolutions=searchOriginal;}
const {p,ctx,a}=example,real=E.analyzeSolutions,solve=E.solve,get=E.getPuzzle;E.solve=E.getPuzzle=()=>{throw Error('Quality accessed answer/bank');};try{assert.deepEqual(Q.analyze(p.givens,ctx),a);}finally{E.analyzeSolutions=real;E.solve=solve;E.getPuzzle=get;}
const worker=vm.createContext({SudokuEngine:E,NineRealmsRulePathGrading:R});vm.runInContext(Q.workerSource(),worker);assert.deepEqual(JSON.parse(JSON.stringify(worker.NineRealmsRuleQuality.analyze(p.givens,ctx))),a);
console.log('PASS rule quality:',JSON.stringify({verified,unproven,classicComplete,ruleNeeded}),'independent ablation proof, thresholds, tampering, bounded ablation search, no answer/bank, worker parity; not human difficulty.');
