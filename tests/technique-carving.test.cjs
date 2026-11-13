'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const G=require('../src/generator'),E=require('../src/engine'),H=require('../src/hints'),S=require('../src/diversity-source');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const realSource=S.generate;let sources=0;S.generate=function(...args){sources++;return realSource.apply(this,args);};
const samples=[];
try{
 const regressionSeeds=[...[['classic',14],['king',17],['king',3],['classic',0],['king',0]].map(([mode,index])=>[mode,`fresh-quality-v4-${mode}-${index}`]),['classic','hard-controlled-v1-classic-105'],['classic','hard-controlled-v1-classic-168'],['classic','alignment-diagnosis-classic-3']];
 for(const [mode,seed] of regressionSeeds){
  sources=0;const request={mode,difficulty:'hard',fresh:true,seed},p=G.generate(request),ctx={mode,clues:p.clues};
  assert(sources<=6,'at most six new source grids for twelve removal branches');assert.equal(p.generation.version,5);assert.equal(p.generation.difficultyBasis,'supported-logic');
  assert(E.validateComplete(p.solution,ctx));assert(p.givens.every((n,i)=>!n||n===p.solution[i]));
  const u=E.analyzeSolutions(p.givens,ctx,{limit:2,maxNodes:500000});assert.equal(u.count,1);assert.equal(u.exhausted,false);
  const proof=H.ratePuzzle(p.givens,ctx,{maxSteps:200,timeLimitMs:1000,trace:true});assert.equal(G.ratingTier(proof),'hard');assert(proof.solved);assert(proof.trace.some(x=>['locked-candidate','naked-pair','hidden-pair'].includes(x.technique)));
  assert(G.matchesDifficulty(p.givens,'hard',ctx));assert.deepEqual(G.generate(request),p,'same seed deterministic');samples.push({p,request});
 }
 // No guard, source/order change or new contract leaks into any other pathway.
 for(const f of require('./fixtures/generation-v5-isolation.json')){
  if(f.error)assert.throws(()=>G.generate(f.request),e=>e.code===f.error);
  else assert.equal(hash(G.generate(f.request)),f.sha256,JSON.stringify(f.request));
 }
 // Force every guarded deletion to exceed supported techniques. The next
 // attempt must restore the rejected given (all calls stay at 44 givens), and
 // the entire request has a bounded six-source/twelve-carving budget.
 const original=H.rateClassic;let calls=0;H.rateClassic=(board)=>{calls++;assert.equal(board.filter(Boolean).length,44,'unsupported removal was restored');return {status:'beyond-supported',solved:false,steps:0,techniques:{}};};
 sources=0;try{assert.throws(()=>G.generate({mode:'classic',difficulty:'hard',seed:'all-techniques-blocked',fresh:true}),e=>['DENSITY_NOT_REACHED','FRESH_DIFFICULTY_NOT_REACHED'].includes(e.code));assert.equal(sources,6);assert(calls>12&&calls<=12*81);}finally{H.rateClassic=original;}
 // Reusing a source internally must not bypass canonical recent-base exclusion.
 const blocked=samples[0].p;S.generate=()=>({...blocked,givens:blocked.solution.slice()});
 try{assert.throws(()=>G.generate({...samples[0].request,avoidFingerprints:[blocked.generation.baseFingerprint]}),/RECENT_STRUCTURE_DUPLICATE/);}finally{S.generate=realSource;}
 const Daily=require('../src/daily');for(const f of require('./fixtures/daily-v3.json'))assert.equal(hash(Daily.getPuzzle(f.date)),f.sha256,'frozen daily must not change');
 console.log('PASS technique-aware carving: old failures now strict hard + unique, unsupported deletion rollback, bounded paired branches, deterministic seed, recent-base exclusion, v5 other-path golden and frozen daily isolation.');
}finally{S.generate=realSource;}
