'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const Daily=require('../src/daily.js'),G=require('../src/generator.js'),E=require('../src/engine.js'),C=require('../src/curated.js'),D=require('../src/puzzle-diversity.js'),B=require('../src/backup.js'),H=require('../src/history.js');
const hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),day=i=>new Date(Date.parse('2026-11-15T00:00:00Z')+i*86400000).toISOString().slice(0,10);
const matches=(key,p)=>Daily.matchesPuzzle(key,p.givens,p.mode,p.difficulty,p.clues),fixtures=require('./fixtures/daily-v3.json');
for(const fixture of fixtures)assert.equal(hash(Daily.getPuzzle(fixture.date)),fixture.sha256,fixture.date+' frozen daily policy drift');
assert.equal(Daily.dateKey('2026-11-14T15:59:59Z'),'2026-11-14');assert.equal(Daily.dateKey('2026-11-14T16:00:00Z'),Daily.constructedStart);
const signatures=new Set(),geometry=new Map(),samples=[];
for(let i=0;i<40;i++){
 const key=day(i),p=Daily.getPuzzle(key),ctx={mode:p.mode,clues:p.clues};assert.equal(p.dailyDate,key);assert.equal(p.dailyEdition,'constructed-v3');assert.equal(p.dailyFallback,false);assert.equal(p.difficulty,'easy');assert.equal(p.mode,['classic','thermo','diagonal','killer','hyper','arrow','knight','thermo-killer'][i%8]);
 assert(E.validateComplete(p.solution,ctx));const unique=E.analyzeSolutions(p.givens,ctx,{limit:2,maxNodes:500000});assert.equal(unique.count,1);assert.equal(unique.exhausted,false);assert(G.basicProof(p.givens,ctx).solved);if(['thermo','killer','arrow','thermo-killer'].includes(p.mode))assert(p.generation.ruleReductions>0);
 const signature=D.solutionSignature(p.solution);assert(!signatures.has(signature),'daily dates repeat equivalent full base');signatures.add(signature);if(['thermo','killer','arrow','thermo-killer'].includes(p.mode)){const layout=D.layoutSignature(p.mode,p.clues);assert(!geometry.has(layout),'daily dates repeat D4 geometry');geometry.set(layout,key);}
 assert(matches(key,p));assert(matches(key,Daily.getLegacyPuzzle(key)),'v1 future game lost');assert(matches(key,Daily.getCuratedPuzzle(key)),'v2 future game lost');assert.deepEqual(Daily.getPuzzle(key),p);samples.push(p);
 const mutated=JSON.parse(JSON.stringify(p));mutated.givens[0]=(mutated.givens[0]+1)%10;assert(!matches(key,mutated));if(['thermo','killer','arrow','thermo-killer'].includes(p.mode))assert(!Daily.matchesPuzzle(key,p.givens,p.mode,p.difficulty,{}));assert(!Daily.matchesPuzzle(key,p.givens,p.mode,p.difficulty,{...p.clues,extra:[]}));
 const exposed=Daily.getPuzzle(key);exposed.solution.fill(1);assert.deepEqual(Daily.getPuzzle(key),p,'cache must return copies');
}
// Old daily identities remain valid even with the new generator absent/broken.
const real=G.generateDailyV1;G.generateDailyV1=()=>{throw Error('new generator unavailable')};try{for(const key of ['2026-11-15','2030-08-17']){assert(matches(key,Daily.getLegacyPuzzle(key)));assert(matches(key,Daily.getCuratedPuzzle(key)));}}finally{G.generateDailyV1=real;}
// No wall-clock rating / runtime-dependent daily selection, including a cold module cache.
const loadCold=()=>{const context=vm.createContext({SudokuEngine:E,NineRealmsCurated:C,NineRealmsGenerator:G});vm.runInContext(fs.readFileSync('src/daily.js','utf8'),context);return context.SudokuDaily;};
const cold=loadCold(),originalNow=Date.now;let clock=1;Date.now=()=>clock+=1000000;
try{for(const fixture of fixtures.slice(0,4))assert.equal(hash(cold.getPuzzle(fixture.date)),fixture.sha256,'clock influenced daily');}finally{Date.now=originalNow;}
// LRU is bounded (32), and cache eviction cannot change a date's result.
const bounded=loadCold();let calls=0;G.generateDailyV1=arg=>{calls++;return real(arg);};try{for(let i=0;i<33;i++)bounded.getPuzzle(day(i));assert.equal(calls,33);bounded.getPuzzle(day(32));assert.equal(calls,33);assert.equal(hash(bounded.getPuzzle(day(0))),fixtures[0].sha256);assert.equal(calls,34);}finally{G.generateDailyV1=real;}
// A deterministic budget failure is pinned and explicit. Unknown errors are not
// converted to a different daily, since that would split devices by availability.
const fallbackDaily=loadCold();G.generateDailyV1=()=>{let e=Error('DENSITY_NOT_REACHED');e.code=e.message;throw e;};try{const p=fallbackDaily.getPuzzle('2040-04-01');assert.equal(p.dailyFallback,true);assert.equal(p.dailyEdition,'fallback-v3');assert(!p.generation);assert(matches('2040-04-01',Daily.getLegacyPuzzle('2040-04-01')));assert.deepEqual(fallbackDaily.getPuzzle('2040-04-01'),p);}finally{G.generateDailyV1=real;}
G.generateDailyV1=()=>{throw Error('missing resource')};try{assert.throws(()=>loadCold().getPuzzle('2040-04-02'),/missing resource/);}finally{G.generateDailyV1=real;}
function memory(initial={}){const map=new Map(Object.entries(initial));return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
function snapshot(p,n){return {version:8,preferences:{theme:'nebula',fx:false,intensity:'soft'},game:{sessionId:'daily-version-'+n,createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,generation:p.generation,clues:p.clues,dailyDate:p.dailyDate,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null}};}
for(const [n,p] of [Daily.getLegacyPuzzle('2026-11-15'),Daily.getCuratedPuzzle('2026-11-15'),Daily.getPuzzle('2026-11-15')].entries()){
 const snap=JSON.parse(JSON.stringify(snapshot(p,n))),source=memory({[B.keys[0]]:JSON.stringify(snap)}),history=H.createStore({Engine:E,storage:source});assert(history.capture(snap));assert(history.flush());const pack=B.create(source),target=memory();assert(B.replace(target,pack).replaced);assert.deepEqual(JSON.parse(target.getItem(B.keys[0])),snap);assert.deepEqual(H.createStore({Engine:E,storage:target}).getSnapshot(snap.game.sessionId).game.givens,p.givens);
}
let records=Daily.recordCompletion({},'2026-11-15',{elapsedMs:100,mistakes:0,hints:0});records=Daily.recordCompletion(records,'2026-11-15',{elapsedMs:50,mistakes:1,hints:3});assert.deepEqual(records['2026-11-15'],{elapsedMs:100,mistakes:0,hints:0});
console.log('PASS daily v3: 40 unique dates with new base/layout, unique solution/rule logic, fixed 8-mode schedule, 11 golden dates, adversarial clock, bounded LRU, explicit deterministic fallback, v1/v2/v3 future-save + backup/history compatibility and unchanged first results.');
