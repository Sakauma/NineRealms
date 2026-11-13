'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const G=require('../src/generator'),E=require('../src/engine'),H=require('../src/hints'),R=require('../src/recovery-reserve');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const failed=['hard-controlled-v2-classic-51','hard-controlled-v2-classic-57','hard-controlled-v1-classic-171'];
function verify(result,request){const p=result.puzzle,ctx={mode:p.mode,clues:p.clues};assert.equal(p.mode,request.mode);assert.equal(p.difficulty,request.difficulty);assert(G.recoveryValid(p,request));assert.equal(G.ratingTier(H.ratePuzzle(p.givens,ctx,{maxSteps:200,timeLimitMs:1000})),'hard');const u=E.analyzeSolutions(p.givens,ctx,{limit:2,maxNodes:500000});assert.equal(u.count,1);assert(!u.exhausted);assert.deepEqual(u.solution,p.solution);assert.equal(result.recovery.requestSeed,request.seed);assert.equal(result.recovery.sourceId,p.sourceId||null);}
const results=[];
for(const seed of failed){const request={mode:'classic',difficulty:'hard',seed,fresh:true,avoidFingerprints:[]};assert.throws(()=>G.generate(request),e=>['DENSITY_NOT_REACHED','FRESH_DIFFICULTY_NOT_REACHED'].includes(e.code),'original generation contract remains a failure');let result;try{result=G.recover(request,{stage:'fresh-retry'});}catch(e){result=G.recover(request,{stage:'verified-catalog'});}verify(result,request);assert.deepEqual(G.recover(request,{stage:result.recovery.kind==='fresh-retry'?'fresh-retry':'verified-catalog'}),result);results.push(result);}
const request={mode:'king',difficulty:'hard',seed:'strict-catalog-recovery',fresh:true},catalog=G.recover(request,{stage:'verified-catalog'});verify(catalog,request);assert.equal(catalog.recovery.kind,'verified-reserve');assert(catalog.puzzle.generation);assert.equal(catalog.recovery.seed,catalog.puzzle.generation.seed);assert(R.get(catalog.recovery.reserveId));
const prior=G.recover({...request,avoidFingerprints:G.recentKeys(catalog.puzzle)},{stage:'verified-catalog'});verify(prior,request);assert.notEqual(G.baseSignature(prior.puzzle),G.baseSignature(catalog.puzzle),'reserve reuse must not evade canonical exclusion');
// Exclude all known source base classes plus the finite reserve. Completion
// must fail explicitly instead of clearing exclusions or lowering the tier.
const allKeys=[];for(const row of E.getPuzzleCatalog('king','hard')){const p=E.getPuzzle('hard','blocked-catalog','king',{sourceId:row.id});allKeys.push(...G.recentKeys(p));}for(const x of R.candidates('king','hard'))allKeys.push(...G.recentKeys(x.puzzle));
assert.throws(()=>G.recover({...request,avoidFingerprints:allKeys},{stage:'verified-catalog'}),/CATALOG_EXHAUSTED/);
// Illegal candidate, mismatched tier and budget exhaustion are never accepted.
const realCatalog=E.getPuzzleCatalog,realGet=E.getPuzzle,realReserve=R.candidates,realAnalyze=E.analyzeSolutions;
try{
 E.getPuzzleCatalog=()=>[{id:'invalid-test',mode:'king',difficulty:'hard'}];R.candidates=()=>[];
 E.getPuzzle=()=>({...catalog.puzzle,solution:Array(81).fill(1)});assert.throws(()=>G.recover(request,{stage:'verified-catalog'}),/CATALOG_EXHAUSTED/);
 E.getPuzzle=()=>({...catalog.puzzle,difficulty:'easy'});assert.throws(()=>G.recover(request,{stage:'verified-catalog'}),/CATALOG_EXHAUSTED/);
 E.getPuzzle=()=>{const p=JSON.parse(JSON.stringify(catalog.puzzle));delete p.generation;p.sourceId="invalid-test";return p;};E.analyzeSolutions=()=>({count:1,exhausted:true,nodes:12001});assert.throws(()=>G.recover(request,{stage:'verified-catalog'}),/CATALOG_EXHAUSTED/);
}finally{E.getPuzzleCatalog=realCatalog;E.getPuzzle=realGet;R.candidates=realReserve;E.analyzeSolutions=realAnalyze;}
const miracleRequest={mode:'miracle',difficulty:'easy',seed:'miracle-verified-catalog'};
const miracle=G.recover(miracleRequest,{stage:'verified-catalog'});assert.equal(miracle.recovery.kind,'verified-catalog');assert.equal(miracle.puzzle.rating,'verified-catalog-rule-depth-easy');assert(G.recoveryValid(miracle.puzzle,miracleRequest));
assert.throws(()=>G.recover({...miracleRequest,avoidFingerprints:G.recentKeys(miracle.puzzle)},{stage:'verified-catalog'}),/CATALOG_EXHAUSTED/,'one-equivalence-class inventory remains exhaustible');
assert.throws(()=>G.recover({...miracleRequest,difficulty:'hard'},{stage:'verified-catalog'}),/CATALOG_EXHAUSTED/,'density hard cannot substitute for actual easy');
assert.throws(()=>G.recover({...request,seed:''},{stage:'fresh-retry'}),/INVALID_SEED/);assert.throws(()=>G.recover(request,{stage:'other'}),/INVALID_RECOVERY_STAGE/);assert.throws(()=>G.recover({...request,mode:'miracle'},{stage:'fresh-retry'}),/RECOVERY_SEARCH_UNSUPPORTED/);
for(const f of require('./fixtures/generation-v5-isolation.json')){if(f.error)assert.throws(()=>G.generate(f.request),e=>e.code===f.error);else assert.equal(hash(G.generate(f.request)),f.sha256);}
const Daily=require('../src/daily');for(const f of require('./fixtures/daily-v3.json'))assert.equal(hash(Daily.getPuzzle(f.date)),f.sha256);
console.log('PASS recovery: original three v6 declines preserved but bounded recovery yields same-tier unique puzzles; reserve provenance, full-base exclusions/exhaustion, illegal/wrong-tier/budget candidates rejected, deterministic seed and legacy/frozen isolation.');
