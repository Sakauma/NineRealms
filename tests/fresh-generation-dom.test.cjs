/* jsdom integration + the actual generated worker program in node worker_threads.
 * This verifies application state, not browser rendering, native workers or pixels. */
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{Worker}=require('node:worker_threads');
const {JSDOM,VirtualConsole}=require('jsdom');
const E=require('../src/engine.js'),G=require('../src/generator.js'),B=require('../src/backup.js');
const KEY='nine-realms.sudoku.v1';
const html=fs.readFileSync('src/index.html','utf8').replace(/<script src="\.\/([^"]+)"><\/script>/g,(_,name)=>'<script>'+fs.readFileSync('src/'+name,'utf8')+'</script>').replace(/<link[^>]*href="\.\/[^"]+"[^>]*>/g,'');
const tick=(ms=25)=>new Promise(r=>setTimeout(r,ms));
const clone=x=>JSON.parse(JSON.stringify(x));
async function until(check,label){for(let i=0;i<500;i++){if(check())return;await tick();}throw Error('Timed out: '+label);}
function envelope(p,zen=false){return {version:8,preferences:{theme:'nebula',fx:false,intensity:'soft',zen},game:{sessionId:'fresh-dom-original',createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:p.clues,generation:p.generation,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:p.givens.map(()=>0),selected:p.givens.findIndex(v=>!v),mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null}};}
async function fixture(initial){
 const errors=[],requests=[],recoveryRequests=[],workers=new Set(),sources=new Map(),control={behavior:'run',nextSeed:'fresh-dom-0'},vc=new VirtualConsole();let serial=0;
 vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://ninerealms.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.localStorage.setItem(KEY,JSON.stringify(initial));
  w.matchMedia=()=>({matches:true,addEventListener(){},addListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;return new Proxy({canvas:this},{get:(o,k)=>k in o?o[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}})};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.Blob=class{constructor(parts){this.source=parts.join('');}};
  w.URL.createObjectURL=blob=>{const url='blob:test-'+(++serial);sources.set(url,blob.source);return url;};w.URL.revokeObjectURL=url=>sources.delete(url);
  w.Worker=class{
   constructor(url){this.source=sources.get(url);this.stopped=false;workers.add(this);}
   postMessage(request){
    (request.recoveryStage?recoveryRequests:requests).push(clone(request));
    const behavior=control.stageBehavior&&control.stageBehavior[request.recoveryStage||'primary']||control.behavior;
    if(behavior==='hold')return;
    if(behavior==='fail'){setTimeout(()=>{if(!this.stopped)this.onmessage({data:{error:control.error||'DIVERSITY_BUDGET'}});},5);return;}
    this.native=new Worker("const {parentPort}=require('node:worker_threads');var module=undefined;var self={postMessage:x=>parentPort.postMessage(x)};"+this.source+";parentPort.on('message',data=>self.onmessage({data}));",{eval:true});
    this.native.on('message',data=>{if(!this.stopped)this.onmessage({data});});
    this.native.on('error',error=>{errors.push(error.message);if(!this.stopped)this.onerror(error);});
    this.native.postMessage(clone(request));
   }
   terminate(){this.stopped=true;if(this.native)this.native.terminate();workers.delete(this);}
  };
 }});
 const w=dom.window,$=id=>w.document.getElementById(id),saved=()=>JSON.parse(w.localStorage.getItem(KEY));
 await tick(50);assert.deepEqual(errors,[]);w.NineRealmsGenerator.seed=()=>control.nextSeed;
 return {w,$,requests,recoveryRequests,control,saved,workers,async launch(){const n=requests.length;$('new-game').click();if($('confirm-dialog').open)$('confirm-accept').click();await until(()=>requests.length>n,'request');await until(()=>$('new-game').getAttribute('aria-busy')==='false','generation finish');assert.deepEqual(errors,[]);return saved();},close(){for(const worker of [...workers])worker.terminate();dom.window.close();assert.deepEqual(errors,[]);}};
}
function memory(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
(async()=>{
 let f;
 try{
  // Classic and variant normal play both ask the actual worker for fresh construction.
  for(const mode of ['classic','thermo','jigsaw','palindrome','twin']){
   f=await fixture(envelope(E.getPuzzle('easy','fresh-dom-initial',mode)));
   f.control.nextSeed='fresh-dom-'+mode;
   const before=f.saved(),result=await f.launch(),g=result.game;
   assert.equal(f.requests[0].fresh,true);assert.equal(f.requests[0].mode,mode);
   assert.equal(g.generation&&g.generation.kind,'constructed',f.$('status-message').textContent);
   assert.equal(g.generation.version,5);assert.equal(g.generation.logicVerified,true);
   assert.match(g.generation.baseFingerprint,/^[a-f0-9]{32}$/);
   if(mode==='thermo'){assert.match(g.generation.layoutFingerprint,/^[a-f0-9]{32}$/);assert.equal(g.generation.difficultyBasis,'rule-depth');assert.equal(g.generation.logicGrade,'easy');assert(g.generation.logicRounds>0);assert.equal(g.generation.ruleQuality.version,1);}
   assert.notEqual(g.sessionId,before.game.sessionId);assert.equal(g.started,false);
   assert.match(f.$('status-message').textContent,/新底盘/);
   const recent=JSON.parse(f.w.localStorage.getItem('nine-realms.generated-recent.v1'));
   assert(recent.includes(g.generation.fingerprint));assert(recent.includes(g.generation.baseFingerprint));if(g.generation.layoutFingerprint)assert(recent.includes(g.generation.layoutFingerprint));
   f.w.NineRealmsHistory.flush();
   const history=JSON.parse(f.w.localStorage.getItem('nine-realms.history.v1'));
   assert.deepEqual(history.records.find(r=>r.sessionId===g.sessionId).snapshot.game.generation,g.generation);
   const backup=B.create(f.w.localStorage),target=memory();assert(B.replace(target,backup).replaced);
   assert.deepEqual(JSON.parse(target.getItem(KEY)).game.generation,g.generation);
   assert.deepEqual(JSON.parse(target.getItem('nine-realms.generated-recent.v1')),recent);
   const roundtrip=JSON.parse(target.getItem(KEY));f.close();f=null;
   f=await fixture(roundtrip);assert.deepEqual(f.saved().game.generation,g.generation,'constructed metadata survives actual app restore');
   assert.deepEqual(f.saved().game.givens,g.givens);f.close();f=null;
   if(mode==='thermo'){
    const v4=clone(roundtrip);v4.game.generation.version=4;delete v4.game.generation.ruleQuality;
    f=await fixture(v4);assert.equal(f.saved().game.generation.version,4,'valid v4 metadata remains accepted without new quality fields');f.close();f=null;
    const changedQuality=clone(roundtrip);changedQuality.game.generation.ruleQuality.affectedCells++;
    f=await fixture(changedQuality);assert.equal(f.saved().game.generation,null,'quality evidence must be independently recomputed');assert.deepEqual(f.saved().game.givens,g.givens);f.close();f=null;
    const mixed=clone(roundtrip);mixed.game.generation.version=4;
    f=await fixture(mixed);assert.equal(f.saved().game.generation,null,'old v4 cannot claim new quality metadata');f.close();f=null;
    const altered=clone(roundtrip);altered.game.generation.logicRounds++;
    f=await fixture(altered);assert.equal(f.saved().game.generation,null,'unverified rule-depth metadata must not retain a graded label');assert.deepEqual(f.saved().game.givens,g.givens,'bad metadata does not erase valid puzzle');f.close();f=null;
   }
  }
  // Legacy carved generation metadata is still valid, including after app restore.
  const carved=G.generate({mode:'thermo',difficulty:'easy',seed:'fresh-dom-legacy',fresh:false});assert.equal(carved.generation.kind,'carved');
  f=await fixture(envelope(carved));assert.equal(f.saved().game.generation.kind,'carved');assert.equal(f.saved().game.generation.fingerprint,carved.generation.fingerprint);
  const legacyBackup=B.create(f.w.localStorage),legacyTarget=memory();assert(B.replace(legacyTarget,legacyBackup).replaced);assert.equal(JSON.parse(legacyTarget.getItem(KEY)).game.generation.kind,'carved');f.close();f=null;
  // Forced budget failure preserves the original puzzle, never silently substitutes the library.
  f=await fixture(envelope(E.getPuzzle('easy','fresh-dom-fallback','thermo')));f.control.behavior='fail';
  const original=f.saved();const fallback=await f.launch();assert.equal(f.requests[0].fresh,true);assert.equal(fallback.game.sessionId,original.game.sessionId);assert.deepEqual(fallback.game.givens,original.game.givens);
  assert.match(f.$('status-message').textContent,/原棋局已保留/);assert.match(f.$('status-message').textContent,/未替换为未经验证的旧题/);
  f.control.behavior='run';f.control.nextSeed='fresh-dom-thermo';const retried=await f.launch();assert.equal(retried.game.generation.kind,'constructed');assert.match(f.$('new-game').textContent,/新游戏/);assert.equal(f.$('new-game').hasAttribute('title'),false);f.close();f=null;
  // Retry keeps the requested target, not the preserved live game's old difficulty/mode.
  f=await fixture(envelope(E.getPuzzle('easy','retry-original','classic')));f.control.behavior='fail';
  const retryOriginal=f.saved().game;
  f.$('difficulty').value='hard';f.$('difficulty').dispatchEvent(new f.w.Event('change'));
  await until(()=>f.requests.length===1&&f.$('new-game').getAttribute('aria-busy')==='false','hard failure');
  assert.equal(f.requests[0].difficulty,'hard');assert.equal(f.saved().game.difficulty,'easy');
  assert.match(f.$('new-game').textContent,/重试生成/);assert.match(f.$('new-game').title,/进阶/);
  await tick(100);assert.equal(f.requests.length,1,'no automatic unlimited retries');
  await f.launch();assert.equal(f.requests[1].difficulty,'hard');assert.equal(f.requests[1].mode,'classic');
  f.control.error='GENERATION_TIMEOUT';await f.launch();assert.match(f.$('status-message').textContent,/有限构造与备选验证/);
  assert.deepEqual(f.saved().game.givens,retryOriginal.givens);
  // An explicit difficulty selection overrides the remembered failed target.
  f.$('difficulty').value='medium';f.$('difficulty').dispatchEvent(new f.w.Event('change'));
  await until(()=>f.requests.length===4&&f.$('new-game').getAttribute('aria-busy')==='false','explicit medium failure');
  assert.equal(f.requests[3].difficulty,'medium');await f.launch();assert.equal(f.requests[4].difficulty,'medium');
  // Opening/closing another dialog clears a stale retry intent.
  f.$('mode-picker-open').click();f.$('mode-close').click();assert.match(f.$('new-game').textContent,/新游戏/);assert.doesNotMatch(f.$('status-message').textContent,/重试生成/);
  await f.launch();assert.equal(f.requests[5].difficulty,'easy');
  f.$('mode-picker-open').click();f.w.document.querySelector('#mode-switcher [data-mode="king"]').click();
  await until(()=>f.requests.length===7&&f.$('new-game').getAttribute('aria-busy')==='false','king failure');
  assert.equal(f.requests[6].mode,'king');assert.equal(f.saved().game.mode,'classic');
  await f.launch();assert.equal(f.requests[7].mode,'king');
  // Cancel a held retry; even an adversarial late response cannot replace the original game.
  f.control.behavior='hold';f.$('new-game').click();await until(()=>f.requests.length===9,'held king retry');
  const stale=[...f.workers][0];assert.match(f.$('status-message').textContent,/首轮预算 8 秒/);
  f.$('new-game').click();stale.onmessage({data:{puzzle:E.getPuzzle('easy','late','king')}});await tick();
  assert.equal(f.saved().game.sessionId,retryOriginal.sessionId);assert.match(f.$('new-game').textContent,/新游戏/);
  f.$('new-game').click();await until(()=>f.requests.length===10,'new request after cancellation');assert.equal(f.requests[9].mode,'classic');assert.equal(f.requests[9].difficulty,'easy');
  f.$('new-game').click();f.close();f=null;
  // Failure to preserve the current game/history prevents replacement both before
  // starting a worker and if storage fails while the worker is in flight.
  for(const broken of ['save','history']){
   f=await fixture(envelope(carved));const before=f.saved().game;
   if(broken==='save'){const originalSet=f.w.Storage.prototype.setItem;f.w.Storage.prototype.setItem=function(k,v){if(k===KEY)throw Error('quota');return originalSet.call(this,k,v);};}
   else f.w.NineRealmsHistory.flush=()=>false;
   f.$('new-game').click();await tick(100);assert.equal(f.requests.length,0);assert.equal(f.saved().game.sessionId,before.sessionId);assert.deepEqual(f.saved().game.board,before.board);assert.match(f.$('status-message').textContent,/尚未安全保存/);f.close();f=null;
  }
  f=await fixture(envelope(carved));const beforeLateFailure=f.saved().game;f.$('new-game').click();await until(()=>f.requests.length===1,'late archive failure request');f.w.NineRealmsHistory.flush=()=>false;await until(()=>f.$('new-game').getAttribute('aria-busy')==='false','late archive failure');assert.equal(f.saved().game.sessionId,beforeLateFailure.sessionId);assert.deepEqual(f.saved().game.board,beforeLateFailure.board);assert.match(f.$('status-message').textContent,/未能安全保存/);f.close();f=null;
  // Cancelling the in-flight request retains the entire existing puzzle and its session.
  f=await fixture(envelope(carved));f.control.behavior='hold';const before=f.saved().game;
  f.$('new-game').click();await until(()=>f.requests.length===1,'held request');assert.equal(f.$('new-game').getAttribute('aria-busy'),'true');
  f.$('new-game').click();await tick();assert.equal(f.saved().game.sessionId,before.sessionId);assert.deepEqual(f.saved().game.board,before.board);assert.deepEqual(f.saved().game.generation,before.generation);assert.match(f.$('status-message').textContent,/已取消/);f.close();f=null;
  // Zen uses the same app new-game action and worker request; DOM only, no visibility claim.
  f=await fixture(envelope(E.getPuzzle('easy','fresh-dom-zen','classic'),true));assert.equal(f.w.document.body.dataset.zen,'on');
  f.control.nextSeed='fresh-dom-zen';const zen=await f.launch();assert.equal(f.requests[0].fresh,true);assert.equal(zen.game.generation.kind,'constructed');assert.equal(zen.preferences.zen,true);f.close();f=null;
  console.log('PASS fresh-generation DOM: actual worker program; normal/Zen fresh requests, constructed save/history/backup/restore, legacy carved compatibility, explicit budget failure, target-preserving retry, timeout, overrides, dialog reset, late-result and cancel preservation. No browser layout or screenshot validation.');
 }finally{if(f)f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
