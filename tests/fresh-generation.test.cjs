'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const E=require('../src/engine.js'),G=require('../src/generator.js'),D=require('../src/puzzle-diversity.js'),C=require('../src/diversity-clues.js'),S=require('../src/diversity-source.js'),B=require('../src/backup.js'),H=require('../src/history.js');
const R=require('../src/rule-path-grading.js'),Q=require('../src/rule-quality.js');
assert.equal(G.freshModes().length,32);
const failures=[],summary={},samples=[],signatures=new Set(),layouts=new Map(),buckets=[],count=Number(process.env.FRESH_SEEDS||3);
const expected=new Set(['DIVERSITY_BUDGET','DIVERSITY_REGIONS_UNAVAILABLE','RULE_DEPTH_NOT_REACHED','RULE_QUALITY_NOT_REACHED','DIVERSITY_LAYOUT_UNAVAILABLE','DENSITY_NOT_REACHED','UNCHANGED_MASK','FRESH_DIFFICULTY_NOT_REACHED','FRESH_LOGIC_NOT_REACHED','FRESH_RULE_NOT_USED','FRESH_BUDGET','RECENT_STRUCTURE_DUPLICATE','RECENT_DUPLICATE']);
const start=Date.now();let maxMs=0;
for(const mode of G.freshModes())for(const difficulty of ['easy','medium','hard']){
 let successes=0;const key=mode+'/'+difficulty;
 for(let i=0;i<count;i++){
  const request={mode,difficulty,seed:`fresh-integration-${mode}-${difficulty}-${i}`,fresh:true};let p;const at=Date.now();
  try{p=G.generate(request);}catch(e){assert(expected.has(e.code),`${key}: unexpected ${e.stack}`);failures.push({mode,difficulty,seed:i,code:e.code,ms:Date.now()-at});continue;}
  const generationMs=Date.now()-at;maxMs=Math.max(maxMs,generationMs);successes++;
  const context={mode,clues:p.clues};assert(E.validateComplete(p.solution,context));assert(p.givens.every((v,i)=>!v||v===p.solution[i]));
  const unique=E.analyzeSolutions(p.givens,context,{limit:2,maxNodes:500000});assert.equal(unique.count,1,key);assert.equal(unique.exhausted,false,key);assert.deepEqual(unique.solution,p.solution);
  assert.equal(p.generation.version,5);assert.equal(p.generation.kind,'constructed');assert.equal(p.generation.logicVerified,true);assert.equal(p.generation.fingerprint,G.fingerprint(p));assert.equal(p.generation.givenCount,p.givens.filter(Boolean).length);
  if(G.supportsDifficulty(mode)){assert(G.matchesDifficulty(p.givens,difficulty,context));assert.equal(p.generation.difficultyBasis,'supported-logic');}
  else{const proof=R.analyze(p.givens,context);assert(proof.solved,key+' complete rule-based path');assert.equal(R.tier(proof,mode),difficulty);assert.equal(p.generation.logicRounds,proof.rounds);assert.equal(p.generation.logicGrade,difficulty);assert.equal(p.generation.difficultyBasis,'rule-depth');}
  if(Q.supported(mode)){
   const quality=Q.analyze(p.givens,context);assert(Q.accepts(quality,difficulty),key+' rule quality');assert.deepEqual(p.generation.ruleQuality,Q.summary(quality));
   if(difficulty!=='easy'){assert.equal(quality.classicSolved,false,key+' ordinary singles cannot finish without rules');const classic=E.analyzeSolutions(p.givens,'classic',{limit:2,maxNodes:100000});assert.equal(classic.count,2,key+' removing all marked rules loses uniqueness');assert.equal(classic.exhausted,false);assert.equal(quality.classicSolutionCount,2);assert.equal(quality.classicSearchExhausted,false);}
  }else assert.equal(p.generation.ruleQuality,undefined);
  if(mode!=='classic'&&mode!=='jigsaw'&&p.solution.length===81)assert(p.givens.some((v,j)=>!v&&E.candidates(p.givens,j,context).length<E.candidates(p.givens,j,'classic').length),key+' additional rules affect candidates');
  if(C.supportedModes().includes(mode)){
   const reductions=p.givens.reduce((n,v,j)=>n+(!v&&E.candidates(p.givens,j,context).length<E.candidates(p.givens,j,'classic').length?1:0),0);assert(reductions>0,key+' rules must actually reduce candidates');assert.equal(p.generation.ruleReductions,reductions);
   const layout=D.layoutSignature(mode,p.clues);if(!layouts.has(mode))layouts.set(mode,new Set());assert(!layouts.get(mode).has(layout),key+' duplicate D4 geometry in sampled seeds');layouts.get(mode).add(layout);
  }
  if(mode==='jigsaw'){
   const layout=D.layoutSignature(mode,p.clues);if(!layouts.has(mode))layouts.set(mode,new Set());assert(!layouts.get(mode).has(layout),key+' repeated irregular-region geometry');layouts.get(mode).add(layout);
   assert.equal(p.clues.regions.length,81);assert.equal(new Set(p.clues.regions).size,9);
   for(let t=0;t<8;t++){
    const regions=Array(81);p.clues.regions.forEach((label,i)=>{let r=Math.floor(i/9),c=i%9;if(t>=4)c=8-c;for(let n=0;n<t%4;n++)[r,c]=[c,8-r];regions[r*9+c]='renamed-'+label;});
    assert.equal(D.layoutSignature(mode,{...p.clues,regions}),layout,'D4/region labels are not new irregular layouts');
   }
  }
  if(p.solution.length>81){
   const boards=E.getLayout(context).boards.map(b=>b.cells.map(i=>p.solution[i]));
   const spectrum=boards.map(a=>D.solutionSignature(a)).sort();
   assert.equal(G.baseSignature(p),'joint-subgrid-spectrum-v1:'+mode+':'+spectrum.join('|'));
   // Each child can be independently relabelled/reordered/transposed: these are
   // NOT independent new bases, even if overlap geometry would cease to fit.
   const transformed=boards.map((a,k)=>{const rows=k%2?[6,7,8,0,1,2,3,4,5]:[1,0,2,3,4,5,6,7,8],cols=[0,1,2,6,8,7,3,4,5];const b=Array.from({length:81},(_,i)=>(a[rows[Math.floor(i/9)]*9+cols[i%9]]+k)%9+1);return k%2?b.map((_,i)=>b[i%9*9+Math.floor(i/9)]):b;});
   boards.forEach((a,i)=>assert(D.equivalentSolutions(a,transformed[i]),'independently transformed child is same base'));
   assert.deepEqual(transformed.map(a=>D.solutionSignature(a)).sort(),spectrum,'independent subboard equivalence cannot count as new');
  }
  const signature=G.baseSignature(p);assert(!signatures.has(signature),key+' equivalent full solution in sampled distinct seeds');signatures.add(signature);
  assert.deepEqual(G.generate(request),p,key+' same seed deterministic');samples.push({request,p,generationMs});
 }
 if(process.env.FRESH_REPORT)fs.writeFileSync(process.env.FRESH_REPORT,JSON.stringify({samples:samples.map(x=>({mode:x.p.mode,difficulty:x.p.difficulty,seed:x.request.seed,ms:x.generationMs,rounds:x.p.generation.logicRounds})),failures},null,2));
 summary[key]=successes+'/'+count;if(!successes)buckets.push(key);process.stdout.write(key+' '+summary[key]+'\n');
}
assert(samples.length>0);assert.deepEqual(buckets,[],'each mode/tier needs a verified sample');for(const mode of G.freshModes())assert(samples.some(x=>x.p.mode===mode),'No verified success for mode '+mode);
// A fresh generation must not read or transform a bank template at all.
const realGet=E.getPuzzle;E.getPuzzle=()=>{throw Error('Fresh path read old bank')};try{const sample=samples.find(x=>x.p.mode==='classic'&&x.p.difficulty==='easy');assert.deepEqual(G.generate(sample.request),sample.p);}finally{E.getPuzzle=realGet;}
// Independently compare complete-group signatures to all legacy catalog solutions.
const legacyBases=new Set();for(const item of E.getPuzzleCatalog('classic')){const p=E.getPuzzle(item.difficulty,'audit-old-base','classic',{sourceId:item.id});legacyBases.add(D.solutionInvariant(p.solution));}
for(const {p} of samples.filter(x=>x.p.mode==='classic'))if(legacyBases.has(D.solutionInvariant(p.solution))){for(const item of E.getPuzzleCatalog('classic'))assert(!D.equivalentSolutions(p.solution,E.getPuzzle(item.difficulty,'audit-old-base','classic',{sourceId:item.id}).solution),'fresh sample equals old catalog base');}
// Existing generator API keeps its exact output and legacy schedule fixtures.
const compatibility=require('./fixtures/compatibility.json'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
for(const p of compatibility.legacy)assert.equal(hash(E.getPuzzle(p.difficulty,'daily-regression',p.mode,{legacyPool:true})),p.sha256);
const legacyHashes={thermo:'1d7f473d0ba8255271cafac0a2415e6d1c22fab8849bc8843b418863305c2d98',killer:'b58412058c9673ef38f85f59b760fba2ab30c6020eefaa7d8f5d9fba65338b30',arrow:'cea65b6d13c089788b95aad4aabce1ba76a950ec574e847cc8f4de0fafed30c8'};
// Recorded from pre-diversity delivery, not from the implementation under test.
for(const [mode,sha] of Object.entries(legacyHashes))assert.equal(hash(G.generate({mode,difficulty:'easy',seed:'legacy-carve-api'})),sha,'legacy generation output changed');
try{G.generate({mode:'thermo',difficulty:'easy',seed:'x'.repeat(256),fresh:true});}catch(e){assert(expected.has(e.code),'accepted-length seed must not fail internal derived seed validation');}
const legacy=G.generate({mode:'thermo',difficulty:'easy',seed:'legacy-carve-api'});assert.equal(legacy.generation.version,2);assert.equal(legacy.generation.kind,'carved');
for(const mode of ['miracle'])assert.throws(()=>G.generate({mode,difficulty:'easy',seed:'unsupported',fresh:true}),/FRESH_MODE_UNSUPPORTED/);
assert.throws(()=>G.generate({mode:'classic',difficulty:'master',seed:'x',fresh:true}),/CURATED_DIFFICULTY/);
// Recent base/layout matches cannot silently return the blocked structure.
for(const sample of [samples.find(x=>x.p.mode==='classic'),samples.find(x=>x.p.mode==='thermo')])for(const field of ['baseFingerprint','layoutFingerprint','fingerprint']){
 if(!sample.p.generation[field])continue;
 try{const next=G.generate({...sample.request,avoidFingerprints:[sample.p.generation[field]]});assert.notEqual(next.generation[field],sample.p.generation[field]);if(field==='baseFingerprint')assert(!D.equivalentSolutions(next.solution,sample.p.solution));if(field==='layoutFingerprint')assert.notEqual(D.layoutSignature(next.mode,next.clues),D.layoutSignature(sample.p.mode,sample.p.clues));}catch(e){assert(expected.has(e.code),e.stack);}
}
// Exhausted proof or construction budgets must never return a partially verified puzzle.
const realAnalyze=E.analyzeSolutions;E.analyzeSolutions=()=>({count:1,exhausted:true,nodes:12001});try{assert.throws(()=>G.generate({mode:'thermo',difficulty:'easy',seed:'forced-unique-exhaustion',fresh:true}),e=>expected.has(e.code));}finally{E.analyzeSolutions=realAnalyze;}
const realGenerate=S.generate;S.generate=()=>{const e=Error('DIVERSITY_BUDGET');e.code='DIVERSITY_BUDGET';throw e;};try{assert.throws(()=>G.generate({mode:'classic',difficulty:'easy',seed:'forced-source-exhaustion',fresh:true}),/DIVERSITY_BUDGET/);}finally{S.generate=realGenerate;}
// Force every attempt to meet a blocked base or layout, proving bounded failure rather than only eventual success.
const blockedBase=samples.find(x=>x.p.mode==='classic').p;let constructionCalls=0;
S.generate=()=>{constructionCalls++;return {mode:'classic',sourceId:'test-fixed',solution:blockedBase.solution.slice(),givens:blockedBase.solution.slice(),clues:blockedBase.clues};};
try{assert.throws(()=>G.generate({mode:'classic',difficulty:'easy',seed:'all-bases-blocked',fresh:true,avoidFingerprints:[blockedBase.generation.baseFingerprint]}),/RECENT_STRUCTURE_DUPLICATE/);assert.equal(constructionCalls,12);}finally{S.generate=realGenerate;}
const blockedLayout=samples.find(x=>x.p.mode==='thermo').p,realBuild=C.build;C.build=()=>JSON.parse(JSON.stringify(blockedLayout.clues));
try{assert.throws(()=>G.generate({mode:'thermo',difficulty:'easy',seed:'all-layouts-blocked',fresh:true,avoidFingerprints:[blockedLayout.generation.layoutFingerprint]}),/RECENT_STRUCTURE_DUPLICATE/);}finally{C.build=realBuild;}
function storage(initial={}){const m=new Map(Object.entries(initial));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function snapshot(p){return {version:8,preferences:{theme:'nebula',fx:false,intensity:'soft'},game:{sessionId:'fresh-roundtrip-'+p.mode,createdAt:1,puzzleId:p.id,sourceId:null,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,generation:p.generation,board:p.givens.slice(),notes:Array(p.givens.length).fill(0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null}};}
// Generation v5 survives current save, history archive, backup validation and restore.
for(const sample of [samples.find(x=>x.p.mode==='classic'),samples.find(x=>x.p.mode==='thermo'),samples.find(x=>x.p.mode==='jigsaw'),samples.find(x=>x.p.mode==='twin'),samples.find(x=>x.p.mode==='samurai')]){
 const snap=snapshot(sample.p),s=storage({[B.keys[0]]:JSON.stringify(snap)}),history=H.createStore({Engine:E,storage:s});assert(history.capture(snap,{origin:'new'}));assert(history.flush());assert.deepEqual(history.getSnapshot(snap.game.sessionId).game.generation,sample.p.generation);
 const pack=B.create(s),target=storage();B.replace(target,pack);assert.deepEqual(JSON.parse(target.getItem(B.keys[0])).game.generation,sample.p.generation);const restored=H.createStore({Engine:E,storage:target});assert.deepEqual(restored.getSnapshot(snap.game.sessionId).game.generation,sample.p.generation);
}
// Backup validates the recomputed path, rather than trusting persisted metadata.
for(const sample of [samples.find(x=>x.p.mode==='thermo'),samples.find(x=>x.p.mode==='twin')]){
 const pack=B.create(storage({[B.keys[0]]:JSON.stringify(snapshot(sample.p))}));
 for(const mutate of [q=>q.logicRounds++,q=>q.logicGrade=q.logicGrade==='hard'?'easy':'hard',q=>delete q.logicRounds,q=>q.difficultyBasis='clue-density']){
  const bad=JSON.parse(JSON.stringify(pack));mutate(bad.entries[B.keys[0]].game.generation);assert.throws(()=>B.validate(bad),/推演|来源/,'tampered depth rejected');
 }
}
// Persisted v4 puzzles retain their original (weaker) grading contract and bytes.
for(const p of require('./fixtures/generated-v4.json')){
 assert.equal(p.generation.version,4);assert.equal(p.generation.ruleQuality,undefined);
 const snap=snapshot(p),s=storage({[B.keys[0]]:JSON.stringify(snap)}),h=H.createStore({Engine:E,storage:s});assert(h.capture(snap));assert(h.flush());const target=storage();B.replace(target,B.create(s));assert.deepEqual(JSON.parse(target.getItem(B.keys[0])),snap);assert.deepEqual(H.createStore({Engine:E,storage:target}).getSnapshot(snap.game.sessionId).game.generation,p.generation);
}
// Stored evidence is a checked claim, not authority to bypass the quality gate.
for(const sample of [samples.find(x=>x.p.mode==='thermo'),samples.find(x=>x.p.mode==='killer'&&x.p.difficulty==='hard')]){
 const pack=B.create(storage({[B.keys[0]]:JSON.stringify(snapshot(sample.p))}));
 for(const mutate of [g=>g.ruleQuality.breakthroughCells++,g=>g.ruleQuality.classicSolved=!g.ruleQuality.classicSolved,g=>delete g.ruleQuality,g=>g.ruleQuality.extra=0]){
  const bad=JSON.parse(JSON.stringify(pack));mutate(bad.entries[B.keys[0]].game.generation);assert.throws(()=>B.validate(bad),/规则|证据|质量|来源|字段/,'tampered rule-quality rejected');
 }
}
// The v3 release-candidate daily goldens are pinned; saved v3 source metadata roundtrips.
const Daily=require('../src/daily.js');
for(const fixture of require('./fixtures/daily-v3.json'))assert.equal(hash(Daily.getPuzzle(fixture.date)),fixture.sha256,'frozen v3 date changed');
for(const mode of ['thermo','killer','arrow','thermo-killer']){
 const p=G.generateDailyV1({mode,seed:'legacy-v3-roundtrip-'+mode});assert.equal(p.generation.version,3);assert.equal(p.generation.difficultyBasis,'clue-density');
 const snap=snapshot(p),s=storage({[B.keys[0]]:JSON.stringify(snap)}),target=storage();B.replace(target,B.create(s));assert.deepEqual(JSON.parse(target.getItem(B.keys[0])),snap,'v3 stored puzzle survives v5');
}
// Execute the actual client-built worker source, not a test replacement generator.
const NativeWorker=global.Worker,makeURL=URL.createObjectURL,revokeURL=URL.revokeObjectURL,sources=new Map();let counter=0;
URL.createObjectURL=blob=>{const id='fresh-test:'+ ++counter;sources.set(id,blob);return id;};URL.revokeObjectURL=url=>sources.delete(url);
global.Worker=class{constructor(url){this.ready=sources.get(url).text().then(code=>{if(this.stopped)return;const self={postMessage:data=>setImmediate(()=>{if(!this.stopped)this.onmessage({data});})};this.context=vm.createContext({self});vm.runInContext(code,this.context);});}postMessage(data){this.ready.then(()=>{if(!this.stopped)this.context.self.onmessage({data});}).catch(e=>this.onerror&&this.onerror(e));}terminate(){this.stopped=true;}};
(async()=>{try{
 const client=G.createClient();for(const sample of [samples.find(x=>x.p.mode==='classic'&&x.p.difficulty==='easy'),samples.find(x=>x.p.mode==='thermo')])assert.deepEqual(JSON.parse(JSON.stringify(await client.run(sample.request))),sample.p);
 await assert.rejects(client.run({fresh:true,mode:'classic',difficulty:'easy',seed:''}),/INVALID_SEED/);
 const cancelled=client.run(samples[0].request);client.cancel();await assert.rejects(cancelled,{name:'AbortError'});assert.equal(sources.size,0);
 const timings=samples.map(x=>x.generationMs).sort((a,b)=>a-b);
 console.log(JSON.stringify({medianGenerationMs:timings[Math.floor(timings.length/2)],p95GenerationMs:timings[Math.ceil(timings.length*.95)-1],successes:samples.length,requests:G.freshModes().length*3*count,zeroSuccessBuckets:buckets,failures,maxGenerationMs:maxMs,totalMs:Date.now()-start},null,2));
 console.log('PASS fresh v5 / 32-mode generation: legal unique completions, independently replayed logic, effective clues, full-group diversity, seeded determinism, explicit failure budgets, legacy fixtures, worker parity and generation-v5 backup/history.');
}finally{global.Worker=NativeWorker;URL.createObjectURL=makeURL;URL.revokeObjectURL=revokeURL;}})().catch(e=>{console.error(e);process.exitCode=1;});
