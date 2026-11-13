'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const E=require('../src/engine.js'),G=require('../src/generator.js');
const crypto=require('node:crypto'),fixture=require('./fixtures/compatibility.json');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
let generated=0,failed=[],maxMs=0,totalMs=0;
const duplicates=new Set(),masks=new Map();
const count=Number(process.env.SEEDS||10);
for(const m of E.getModes())for(const d of ['easy','medium','hard'])for(let n=0;n<count;n++){
 const request={mode:m.id,difficulty:d,seed:'regression-v1-'+n};
 const before=Date.now();let p;
 try{p=G.generate(request)}catch(e){failed.push({mode:m.id,difficulty:d,seed:n,error:e.message});continue}
 const ms=Date.now()-before;maxMs=Math.max(maxMs,ms);totalMs+=ms;
 assert.deepEqual(G.generate(request),p,'successful seed must be deterministic');
 const ctx={mode:p.mode,clues:p.clues};
 assert(E.validateComplete(p.solution,ctx));
 assert(p.givens.every((v,i)=>!v||v===p.solution[i]));
 const proof=E.analyzeSolutions(p.givens,ctx,{limit:2,maxNodes:500000});
 assert.equal(proof.count,1);assert.equal(proof.exhausted,false);assert.deepEqual(proof.solution,p.solution);
 assert.equal(p.generation.givenCount,p.givens.filter(Boolean).length);
 assert.equal(p.generation.givenCount,p.generation.target);
 const original=E.getPuzzle(d,request.seed,m.id);
 assert(p.givens.some((v,i)=>Boolean(v)!==Boolean(original.givens[i])),'mask must change');
 const exact=JSON.stringify([p.mode,p.givens,p.clues]);assert(!duplicates.has(exact),'sample repeated an exact puzzle');duplicates.add(exact);
 const key=m.id+'/'+d;if(!masks.has(key))masks.set(key,new Set());masks.get(key).add(p.givens.map(Boolean).map(Number).join(''));
 assert.throws(()=>G.generate({...request,avoidFingerprints:[p.generation.fingerprint]}),/RECENT_DUPLICATE/);
 generated++;
}
assert(failed.every(f=>G.supportsDifficulty(f.mode)&&f.error===(f.mode==='classic'?'CLASSIC_DIFFICULTY_NOT_REACHED':'VARIANT_DIFFICULTY_NOT_REACHED')),JSON.stringify(failed));
for(const [key,values] of masks)assert.equal(values.size,count-failed.filter(f=>key===f.mode+'/'+f.difficulty).length,'same structural mask in '+key);
for(const p of fixture.legacy)assert.equal(hash(E.getPuzzle(p.difficulty,'daily-regression',p.mode,{legacyPool:true})),p.sha256,'legacy schedule pool changed');
assert.throws(()=>G.generate({mode:'classic',difficulty:'master',seed:'x'}),/CURATED_DIFFICULTY/);
assert.throws(()=>G.generate({mode:'classic',difficulty:'easy',seed:''}),/INVALID_SEED/);
const realAnalyze=E.analyzeSolutions;
 E.analyzeSolutions=()=>({count:1,exhausted:true,nodes:12001});
 assert.throws(()=>G.generate({mode:'classic',difficulty:'easy',seed:'budget-proof'}),/CLASSIC_DIFFICULTY_NOT_REACHED/);
 E.analyzeSolutions=realAnalyze;
 const sandbox=vm.createContext({});vm.runInContext(E.workerSource(),sandbox);
assert.equal(vm.runInContext('SudokuEngine.getModes().length',sandbox),E.getModes().length);
assert.equal(vm.runInContext('SudokuEngine.getPuzzleCatalog().length',sandbox),E.getPuzzleCatalog().length);
// Worker/client lifecycle checks without an actual browser: source is executed in an isolated JS context.
const NativeWorker=global.Worker,makeURL=URL.createObjectURL,revokeURL=URL.revokeObjectURL;
const sources=new Map();let urls=0,revoked=0,terminated=0;
URL.createObjectURL=blob=>{const id='test:'+ ++urls;sources.set(id,blob);return id};
URL.revokeObjectURL=url=>{sources.delete(url);revoked++};
global.Worker=class {
 constructor(url){this.stopped=false;this.ready=sources.get(url).text().then(code=>{if(this.stopped)return;const self={postMessage:data=>setImmediate(()=>{if(!this.stopped)this.onmessage({data})})};this.context=vm.createContext({self});vm.runInContext(code,this.context)})}
 postMessage(data){this.ready.then(()=>{if(!this.stopped)this.context.self.onmessage({data})}).catch(e=>this.onerror&&this.onerror(e))}
 terminate(){this.stopped=true;terminated++}
};
(async()=>{
 const client=G.createClient();
 const req={mode:'classic',difficulty:'easy',seed:'worker-portability'};
 assert.deepEqual(JSON.parse(JSON.stringify(await client.run(req))),G.generate(req));
 const cancelled=client.run({...req,seed:'cancelled'});client.cancel();await assert.rejects(cancelled,{name:'AbortError'});
 const first=client.run({...req,seed:'old'});const second=client.run({...req,seed:'new'});await assert.rejects(first,{name:'AbortError'});assert.equal((await second).generation.seed,'new');
 await assert.rejects(client.run({...req,difficulty:'master'}),/CURATED_DIFFICULTY/);
 const MockWorker=global.Worker;
 global.Worker=class {postMessage(){setImmediate(()=>this.onerror(new Error('mock')))}terminate(){terminated++}};
 await assert.rejects(client.run(req),/WORKER_FAILED/);
 const nativeTimeout=global.setTimeout;let timeoutDelay;
 global.setTimeout=(fn,ms)=>{timeoutDelay=ms;return nativeTimeout(fn,0)};
 global.Worker=class {postMessage(){}terminate(){terminated++}};
 await assert.rejects(client.run(req),/GENERATION_TIMEOUT/);assert.equal(timeoutDelay,8000);
 global.setTimeout=nativeTimeout;global.Worker=MockWorker;
 assert.equal(sources.size,0);assert.equal(urls,revoked);assert.equal(urls,terminated);
 global.Worker=NativeWorker;URL.createObjectURL=makeURL;URL.revokeObjectURL=revokeURL;
 const Challenge=require('../src/challenge.js');
 for(const mode of E.getModes()) {
   let puzzle;
   for(let attempt=0;attempt<8&&!puzzle;attempt++)try{puzzle=G.generate({mode:mode.id,difficulty:'hard',seed:'challenge-roundtrip'+(attempt?'-'+attempt:'')});}catch(error){assert(G.supportsDifficulty(mode.id));assert.equal(error.code,mode.id==='classic'?'CLASSIC_DIFFICULTY_NOT_REACHED':'VARIANT_DIFFICULTY_NOT_REACHED');}
   assert(puzzle,'a calibrated sample is available for challenge roundtrip');
   const decoded=Challenge.decode(Challenge.create(puzzle));
   assert.deepEqual(decoded.givens,puzzle.givens);assert.deepEqual(E.normalizeClues(puzzle.mode,decoded.clues),puzzle.clues);assert.deepEqual(decoded.solution,puzzle.solution);
 }
 const report={challengeRoundtripModes:E.getModes().length,workerErrorAndTimeoutMock:true,status:'passed',samples:generated,calibrationFallbacks:failed.length,modes:E.getModes().length,difficultyTiers:3,seedsPerTier:count,exactSampleDuplicates:0,seedReproducibility:true,uniqueSolutionRecheck:true,curatedApiUnchanged:true,workerSourceVm:true,workerCancellationMock:true,maxGenerationMs:maxMs,meanGenerationMs:totalMs/generated,visualBrowserTest:false};
 fs.mkdirSync('evidence/generator',{recursive:true});fs.writeFileSync('evidence/generator/regression.json',JSON.stringify(report,null,2));console.log(report);
})().catch(e=>{console.error(e);process.exitCode=1});
