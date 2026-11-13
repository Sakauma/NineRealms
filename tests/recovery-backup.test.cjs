'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine'),G=require('../src/generator'),B=require('../src/backup'),H=require('../src/history'),R=require('../src/recovery-reserve');
const clone=x=>JSON.parse(JSON.stringify(x));
function storage(initial={}){const m=new Map(Object.entries(initial));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function snapshot(p,recovery){return {version:8,preferences:{fx:false},game:{sessionId:'recovery-test',createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:p.clues,generation:p.generation,recovery,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:p.givens.map(()=>0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null}};}
const seed=G.recoverySeed({mode:'classic',difficulty:'easy',seed:'original-request'},'verified-catalog');
let catalog,misgraded;
for(const entry of E.getPuzzleCatalog('classic','easy').slice(0,80)){
 const p=E.getPuzzle('easy',seed,'classic',{sourceId:entry.id});
 if(G.matchesDifficulty(p.givens,'easy',{mode:p.mode,clues:p.clues})){if(!catalog)catalog=p;}else if(!misgraded)misgraded=p;
 if(catalog&&misgraded)break;
}
assert(catalog&&misgraded,'tests require both accurately graded and raw-density easy catalog examples');
const catMeta=p=>({version:1,kind:'verified-catalog',requestSeed:'original-request',seed:G.recoverySeed({mode:p.mode,difficulty:p.difficulty,seed:'original-request'},'verified-catalog'),sourceId:p.sourceId});
const freshSeed=G.recoverySeed({mode:'classic',difficulty:'easy',seed:'original-request'},'fresh-retry');
const fresh=G.generate({mode:'classic',difficulty:'easy',seed:freshSeed,fresh:true});
const freshMeta={version:1,kind:'fresh-retry',requestSeed:'original-request',seed:freshSeed,sourceId:null};
const fixed=R.candidates('classic','hard')[0];assert(fixed);
const reserveMeta={version:1,kind:'verified-reserve',requestSeed:'original-request',seed:fixed.puzzle.generation.seed,sourceId:null,reserveId:fixed.reserveId};
(async()=>{
 assert.equal(B.recoveryInfo(undefined,catalog),null);assert.equal(B.recoveryInfo(null,catalog),null);
 for(const [p,meta] of [[catalog,catMeta(catalog)],[fresh,freshMeta],[fixed.puzzle,reserveMeta]]){
  assert.deepEqual(B.recoveryInfo(meta,p),meta);assert.notEqual(B.recoveryInfo(meta,p),meta);
  const snap=snapshot(p,meta),source=storage({[B.keys[0]]:JSON.stringify(snap)}),history=H.createStore({Engine:E,storage:source});history.capture(snap,{origin:'new'});history.flush();
  const backup=await B.createAsync(source),target=storage();assert(B.replace(target,backup).replaced);
  const restored=JSON.parse(target.getItem(B.keys[0]));assert.deepEqual(restored.game.recovery,meta);assert.deepEqual(B.recoveryInfo(restored.game.recovery,restored.game),meta);
  assert.deepEqual(JSON.parse(target.getItem(B.keys[1])).records[0].snapshot.game.recovery,meta);
  for(const mutate of [m=>m.version=2,m=>m.kind='primary',m=>m.requestSeed='',m=>m.requestSeed='x'.repeat(257),m=>m.seed='',m=>m.extra=true,m=>delete m.sourceId]){const bad=clone(meta);mutate(bad);assert.throws(()=>B.recoveryInfo(bad,p));}
  if(meta.kind!=='verified-reserve')assert.throws(()=>B.recoveryInfo({...meta,requestSeed:'different-request'},p),/请求与种子/);
  for(const extra of [{dailyDate:'2026-11-13'},{voyageId:'dawn'},{custom:true}])assert.throws(()=>B.recoveryInfo(meta,{...p,...extra}));
  const corrupt=clone(backup);corrupt.entries[B.keys[0]].game.recovery.sourceId='invented';assert.throws(()=>B.validate(corrupt));
 }
 assert.throws(()=>B.recoveryInfo(catMeta(misgraded),misgraded),/相同技巧档位/,'raw catalog difficulty is not a proof');
 assert.throws(()=>B.recoveryInfo({...catMeta(catalog),sourceId:'invented'},catalog));
 assert.throws(()=>B.recoveryInfo(catMeta(catalog),{...catalog,generation:fresh.generation}));
 assert.throws(()=>B.recoveryInfo(catMeta(catalog),{...catalog,clues:{version:1,lines:[{type:'thermo',cells:[0,1]}]}}));
 const wrongBoard=clone(catalog);const empty=wrongBoard.givens.indexOf(0);wrongBoard.givens[empty]=wrongBoard.solution[empty];assert.throws(()=>B.recoveryInfo(catMeta(catalog),wrongBoard),/题面与题源/);
 assert.throws(()=>B.recoveryInfo({...freshMeta,seed:'f'.repeat(32)},fresh));
 assert.throws(()=>B.recoveryInfo(freshMeta,{...fresh,generation:null}));
 assert.throws(()=>B.recoveryInfo({...reserveMeta,reserveId:'invented'},fixed.puzzle));
 assert.throws(()=>B.recoveryInfo({...reserveMeta,seed:'not-the-archived-seed'},fixed.puzzle));
 const alteredReserve=clone(fixed.puzzle);alteredReserve.generation.baseFingerprint='f'.repeat(32);assert.throws(()=>B.recoveryInfo(reserveMeta,alteredReserve));
 // App stores the validated generation summary, not optional generation diagnostics.
 const compact=clone(fixed.puzzle);for(const k of ['target','unique','checks','nodes','rejectedByBudget'])delete compact.generation[k];assert.deepEqual(B.recoveryInfo(reserveMeta,compact),reserveMeta);
 // Failed/partial uniqueness proof is never accepted, even in rule-only play.
 const original=E.analyzeSolutions;try{E.analyzeSolutions=()=>({count:1,exhausted:true,solution:catalog.solution});assert.throws(()=>B.recoveryInfo(catMeta(catalog),catalog),/唯一解/);const source=storage({[B.keys[0]]:JSON.stringify({...snapshot(catalog,catMeta(catalog)),game:{...snapshot(catalog,catMeta(catalog)).game,logicMode:true}})});assert.throws(()=>B.create(source),/唯一解/);}finally{E.analyzeSolutions=original;}
 // A marked reserve must satisfy independent rule-path/quality requirements.
 const marked=R.candidates('arrow','medium')[0];assert(marked);const markedMeta={version:1,kind:'verified-reserve',requestSeed:'marked-request',seed:marked.puzzle.generation.seed,sourceId:null,reserveId:marked.reserveId};assert.deepEqual(B.recoveryInfo(markedMeta,marked.puzzle),markedMeta);
 // Non-fresh Miracle catalog entries may recover only at their actual rule-depth tier.
 for(const difficulty of ['easy','medium','hard']){
  const entry=E.getPuzzleCatalog('miracle',difficulty)[0],p=E.getPuzzle(difficulty,G.recoverySeed({mode:'miracle',difficulty,seed:'original-request'},'verified-catalog'),'miracle',{sourceId:entry.id}),meta=catMeta(p);
  if(difficulty==='easy'){assert.deepEqual(B.recoveryInfo(meta,p),meta);const source=storage({[B.keys[0]]:JSON.stringify(snapshot(p,meta))});assert(B.create(source));}
  else assert.throws(()=>B.recoveryInfo(meta,p),/相同规则推演档位/);
 }
 // Historical practice can retain the same truthful provenance for its unchanged original puzzle.
 const practice={version:1,sourceSessionId:'prior-session',absoluteStep:0,wasAssumption:false};assert.deepEqual(B.recoveryInfo(catMeta(catalog),{...catalog,practice}),catMeta(catalog));
 // Old saves without recovery provenance keep their former contract unchanged.
 const old=snapshot(E.getPuzzle('easy','old-save','classic'));delete old.game.recovery;const oldStore=storage({[B.keys[0]]:JSON.stringify(old)}),oldBackup=B.create(oldStore),oldTarget=storage();assert(B.replace(oldTarget,oldBackup).replaced);assert.equal(JSON.parse(oldTarget.getItem(B.keys[0])).game.recovery,undefined);
 console.log('PASS recovery backup: 3 provenance kinds, strict catalog grading and fixed reserve identity, unique/rule-quality reproof, current/history roundtrip, malformed metadata rejection, compact generation restore and old-save compatibility.');
})().catch(error=>{console.error(error);process.exitCode=1;});
