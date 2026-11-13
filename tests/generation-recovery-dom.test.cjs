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
(async()=>{let f;try{
 for(const stage of ['fresh-retry','verified-catalog','verified-reserve']){
  const mode=stage==='verified-catalog'?'classic':'thermo';f=await fixture(envelope(E.getPuzzle('easy','recovery-dom-original',mode)));
  f.control.nextSeed=stage==='fresh-retry'?'recovery-client-1':stage==='verified-reserve'?'reserve-dom-1':'recovery-inventory-1';f.control.stageBehavior=stage==='fresh-retry'?{primary:'fail'}:{primary:'fail','fresh-retry':'fail'};
  const original=f.saved().game,result=await f.launch(),g=result.game;
  assert.notEqual(g.sessionId,original.sessionId);assert.equal(g.mode,mode);assert.equal(g.difficulty,'easy');assert(g.recovery, f.$('status-message').textContent);assert.equal(g.recovery.kind,stage);
  assert.match(f.$('puzzle-bank-status').textContent,stage==='fresh-retry'?/备用构造/:stage==='verified-reserve'?/固定备用/:/题库备选/);assert.match(f.$('status-message').textContent,stage==='fresh-retry'?/备用构造/:/不是.*新构造/);
  assert(f.requests[0].avoidFingerprints.includes(G.recentKeys(original)[1]),'current static board base is excluded');
  const recent=JSON.parse(f.w.localStorage.getItem('nine-realms.generated-recent.v1'));G.recentKeys(g).forEach(k=>assert(recent.includes(k),'fallback records base and geometry, even without generation'));
  f.w.NineRealmsHistory.flush();const history=JSON.parse(f.w.localStorage.getItem('nine-realms.history.v1'));assert.deepEqual(history.records.find(r=>r.sessionId===g.sessionId).snapshot.game.recovery,g.recovery);
  const backup=B.create(f.w.localStorage),target=memory();assert(B.replace(target,backup).replaced);const restored=JSON.parse(target.getItem(KEY));assert.deepEqual(restored.game.recovery,g.recovery);
  f.close();f=null;f=await fixture(restored);assert.deepEqual(f.saved().game.recovery,g.recovery);f.$('rules-open').click();assert.equal(f.$('curated-rating').hidden,false);assert.match(f.$('curated-rating').textContent,stage==='fresh-retry'?/备用构造/:stage==='verified-reserve'?/固定备用/:/题库备选/);f.$('rules-close').click();assert.match(f.$('puzzle-bank-status').textContent,stage==='fresh-retry'?/备用构造/:stage==='verified-reserve'?/固定备用/:/题库备选/);
  f.control.behavior='hold';f.$('new-game').click();await until(()=>f.requests.length===1,'restored fallback new request');G.recentKeys(g).forEach(k=>assert(f.requests[0].avoidFingerprints.includes(k)));f.$('new-game').click();f.close();f=null;
  // Forged provenance is stripped without discarding the valid original puzzle.
  const bad=clone(restored);bad.game.recovery.seed='0'.repeat(32);f=await fixture(bad);assert.equal(f.saved().game.recovery,null);assert.deepEqual(f.saved().game.givens,g.givens);f.close();f=null;
 }
 // Every background phase retains the current game until all validations/save checks finish.
 for(const stage of ['fresh-retry','verified-catalog']){
  f=await fixture(envelope(E.getPuzzle('easy','phase-original','classic')));const original=f.saved().game;
  f.control.stageBehavior={primary:'fail','fresh-retry':stage==='fresh-retry'?'hold':'fail','verified-catalog':'hold'};
  f.$('new-game').click();await until(()=>f.recoveryRequests.some(r=>r.recoveryStage===stage),'recovery stage');
  assert.equal(f.saved().game.sessionId,original.sessionId);assert.match(f.$('status-message').textContent,stage==='fresh-retry'?/备用构造/:stage==='verified-reserve'?/固定备用/:/题库备选/);
  const stale=[...f.workers][0];f.$('new-game').click();await tick();stale.onmessage({data:{puzzle:E.getPuzzle('easy','late-result','classic'),recovery:{kind:stage}}});await tick();assert.equal(f.saved().game.sessionId,original.sessionId);assert.match(f.$('status-message').textContent,/已取消/);f.close();f=null;
 }
 // Quota/history failure during recovery cannot install its verified late result.
 f=await fixture(envelope(E.getPuzzle('easy','recovery-save','thermo')));f.control.nextSeed='recovery-client-1';f.control.stageBehavior={primary:'fail'};const before=f.saved().game;
 f.$('new-game').click();await until(()=>f.recoveryRequests.length===1,'recovery save boundary');f.w.NineRealmsHistory.flush=()=>false;
 await until(()=>f.$('new-game').getAttribute('aria-busy')==='false','recovery save rejection');assert.equal(f.saved().game.sessionId,before.sessionId);assert.match(f.$('status-message').textContent,/未能安全保存/);f.close();f=null;
 // Non-fresh miracle must not silently fall through to an ungraded library puzzle.
 f=await fixture(envelope(E.getPuzzle('easy','miracle-recovery','miracle')));f.control.behavior='fail';const miracleBefore=f.saved().game;await f.launch();assert.equal(f.requests[0].fresh,false);assert.equal(f.recoveryRequests.length,2);assert.equal(f.saved().game.sessionId,miracleBefore.sessionId);assert.match(f.$('status-message').textContent,/未替换为未经验证/);f.close();f=null;
 // Worker unavailability cannot trigger heavy synchronous generation or an unverified substitute.
 f=await fixture(envelope(E.getPuzzle('easy','no-worker','classic')));const noWorker=f.saved().game;f.w.Worker=undefined;f.$('new-game').click();await until(()=>f.$('new-game').getAttribute('aria-busy')==='false','no worker');assert.equal(f.requests.length,0);assert.equal(f.saved().game.sessionId,noWorker.sessionId);assert.match(f.$('status-message').textContent,/不支持后台生成/);f.close();f=null;
 console.log('PASS recovery DOM: actual fresh/catalog recovery, honest persistent provenance, backup/history/restore/tamper, current+recent exclusion, stage cancellation/late result, save rejection, miracle and Worker-unavailable retain old game.');
}finally{if(f)f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
