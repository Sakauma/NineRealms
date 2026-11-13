'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine'),G=require('../src/generator'),S=require('../src/diversity-source'),H=require('../src/hints'),R=require('../src/rule-path-grading');
const p=E.getPuzzle('easy','audit-budget-proof','classic'),context={mode:p.mode,clues:p.clues};
const logic=H.ratePuzzle(p.givens,context,{maxSteps:0,timeLimitMs:1000,trace:true});assert.equal(logic.status,'budget');assert.equal(logic.solved,false);assert.equal(G.ratingTier(logic),null);
const depth=R.analyze(p.givens,context,{maxRounds:0,trace:true});assert.equal(depth.status,'budget');assert.equal(depth.solved,false);assert.equal(R.tier(depth,'classic'),null);
assert.throws(()=>S.generate({mode:'samurai',seed:'audit-budget-proof',maxNodes:1,maxAttempts:1}),e=>e.code==='DIVERSITY_BUDGET'&&e.construction.nodes===1);
// Simulate a worker that never returns. This tests the watchdog contract, NOT
// real device speed, browser delivery, or equivalence of 0ms and 8000ms workloads.
const originals={Worker:global.Worker,setTimeout:global.setTimeout,create:URL.createObjectURL,revoke:URL.revokeObjectURL};let delay=null,terminated=0,revoked=0;
global.Worker=class{postMessage(){}terminate(){terminated++;}};URL.createObjectURL=()=> 'mock-audit-worker';URL.revokeObjectURL=()=>{revoked++;};global.setTimeout=(fn,ms)=>{delay=ms;return originals.setTimeout(fn,0);};
(async()=>{try{await assert.rejects(G.createClient().run({mode:'classic',difficulty:'easy',seed:'audit-watchdog',fresh:true}),/GENERATION_TIMEOUT/);assert.equal(delay,8000);assert.equal(terminated,1);assert.equal(revoked,1);console.log('PASS deterministic source/technique/depth budget refusals and simulated 8000ms worker watchdog cleanup; no real-device performance claim.');}finally{global.Worker=originals.Worker;global.setTimeout=originals.setTimeout;URL.createObjectURL=originals.create;URL.revokeObjectURL=originals.revoke;}})().catch(e=>{console.error(e);process.exitCode=1;});
