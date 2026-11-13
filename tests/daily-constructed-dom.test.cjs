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
function envelope(p,zen=false){return {version:8,preferences:{theme:'nebula',fx:false,intensity:'soft',zen},game:{sessionId:'fresh-dom-original',createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:p.clues,generation:p.generation,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.findIndex(v=>!v),mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null}};}
async function fixture(initial,behavior){
 const errors=[],requests=[],workers=new Set(),sources=new Map(),control={behavior:behavior||'run',nextSeed:'fresh-dom-0',now:Date.parse('2026-11-15T04:00:00Z')},vc=new VirtualConsole();let serial=0;
 vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://ninerealms.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.localStorage.setItem(KEY,JSON.stringify(initial));
  const RealDate=w.Date;w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[control.now]));}static now(){return control.now;}};
  if(behavior==='guard'){let generator;Object.defineProperty(w,'NineRealmsGenerator',{configurable:true,get(){return generator;},set(value){generator=value;value.generateDailyV1=()=>{throw Error('MAIN_THREAD_DAILY_GENERATION');};}});}

  w.matchMedia=()=>({matches:true,addEventListener(){},addListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;return new Proxy({canvas:this},{get:(o,k)=>k in o?o[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}})};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.Blob=class{constructor(parts){this.source=parts.join('');}};
  w.URL.createObjectURL=blob=>{const url='blob:test-'+(++serial);sources.set(url,blob.source);return url;};w.URL.revokeObjectURL=url=>sources.delete(url);
  w.Worker=class{
   constructor(url){this.source=sources.get(url);this.stopped=false;workers.add(this);}
   postMessage(request){
    requests.push(clone(request));control.lastWorker=this;
    if(control.behavior==='hold')return;
    if(control.behavior==='fallback'||control.behavior==='missing'){setTimeout(()=>{if(!this.stopped)this.onmessage({data:{key:request.key,error:control.behavior==='fallback'?'DENSITY_NOT_REACHED':'MISSING_RESOURCE'}});},5);return;}
    this.native=new Worker("const {parentPort}=require('node:worker_threads');var module=undefined;var self={postMessage:x=>parentPort.postMessage(x)};"+this.source+";parentPort.on('message',data=>self.onmessage({data}));",{eval:true});
    this.native.on('message',data=>{if(!this.stopped)this.onmessage({data});});
    this.native.on('error',error=>{errors.push(error.message);if(!this.stopped)this.onerror(error);});
    this.native.postMessage(clone(request));
   }
   terminate(){this.stopped=true;if(this.native)this.native.terminate();workers.delete(this);}
  };
 }});
 const w=dom.window,$=id=>w.document.getElementById(id),saved=()=>JSON.parse(w.localStorage.getItem(KEY));
 await until(()=>saved().game.energy,'startup complete');assert.deepEqual(errors,[]);w.NineRealmsGenerator.seed=()=>control.nextSeed;
 return {w,$,requests,control,saved,async launch(){const n=requests.length;$('new-game').click();if($('confirm-dialog').open)$('confirm-accept').click();await until(()=>requests.length>n,'request');await until(()=>$('new-game').getAttribute('aria-busy')==='false','generation finish');assert.deepEqual(errors,[]);return saved();},close(){for(const worker of [...workers])worker.terminate();dom.window.close();assert.deepEqual(errors,[]);}};
}
function memory(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
(async()=>{let f;try{
 const Daily=require('../src/daily.js'),date='2026-11-15',expected=Daily.getPuzzle(date);
 const ordinary=()=>envelope(E.getPuzzle('easy','daily-v3-dom','classic'));
 f=await fixture(ordinary(),'guard');assert.equal(f.requests.length,0);assert.equal(f.w.SudokuDaily.peekPuzzle(date),null,'startup must not synchronously generate today');const original=f.saved().game;
 f.$('daily-btn').click();assert.match(f.$('daily-description').textContent,/按日期构造新题/);assert.equal(f.requests.length,0);f.$('daily-start').click();assert.equal(f.$('daily-start').getAttribute('aria-busy'),'true');assert.equal(f.saved().game.sessionId,original.sessionId);await until(()=>f.saved().game.dailyDate===date,'first daily prepared');assert.equal(f.requests.length,1);assert.deepEqual(f.saved().game.givens,expected.givens);assert.equal(f.saved().game.generation.version,3);f.close();f=null;
 // Explicit cancel and closing the dialog both terminate and ignore late messages.
 for(const close of [false,true]){f=await fixture(ordinary(),'hold');const before=f.saved().game;f.$('daily-btn').click();f.$('daily-start').click();await until(()=>f.requests.length===1,'held request');const late=f.control.lastWorker;if(close)f.$('daily-close').click();else f.$('daily-start').click();await tick();late.onmessage({data:{key:date,puzzle:clone(expected)}});await tick();assert.equal(f.saved().game.sessionId,before.sessionId);assert.equal(f.w.SudokuDaily.peekPuzzle(date),null);assert(late.stopped);f.close();f=null;}
 // An answer arriving after Beijing midnight cannot replace the current game.
 f=await fixture(ordinary(),'hold');const beforeMidnight=f.saved().game;f.$('daily-btn').click();f.$('daily-start').click();await until(()=>f.requests.length===1,'midnight request');f.control.now+=86400000;f.control.lastWorker.onmessage({data:{key:date,puzzle:clone(expected)}});await tick();assert.equal(f.saved().game.sessionId,beforeMidnight.sessionId);assert.match(f.$('daily-date').textContent,/2026 \/ 11 \/ 16/);f.close();f=null;
 // Both save checkpoints preserve the original; a verified cached result is reusable.
 f=await fixture(ordinary());let before=f.saved().game,flush=f.w.NineRealmsHistory.flush;f.w.NineRealmsHistory.flush=()=>false;f.$('daily-btn').click();f.$('daily-start').click();await tick();assert.equal(f.requests.length,0);assert.equal(f.saved().game.sessionId,before.sessionId);assert.match(f.$('status-message').textContent,/未能安全保存/);f.close();f=null;
 f=await fixture(ordinary());before=f.saved().game;flush=f.w.NineRealmsHistory.flush;f.$('daily-btn').click();f.$('daily-start').click();await until(()=>f.requests.length===1,'late-save request');f.w.NineRealmsHistory.flush=()=>false;await until(()=>f.$('daily-start').getAttribute('aria-busy')==='false','late-save check');assert.equal(f.saved().game.sessionId,before.sessionId);assert(f.w.SudokuDaily.peekPuzzle(date));f.w.NineRealmsHistory.flush=flush;f.$('daily-start').click();await until(()=>f.saved().game.dailyDate===date,'cached retry');assert.equal(f.requests.length,1);f.close();f=null;
 for(const old of [Daily.getLegacyPuzzle(date),Daily.getCuratedPuzzle(date)]){const initial=envelope(old);initial.game.dailyDate=date;f=await fixture(initial,'missing');assert.equal(f.requests.length,0);f.$('daily-btn').click();assert.match(f.$('daily-description').textContent,/继续已保存的今日棋局/);f.$('daily-start').click();await tick();assert.equal(f.saved().game.sessionId,initial.game.sessionId);assert.deepEqual(f.saved().game.givens,old.givens);f.close();f=null;}
 // A delivered v3 save warms its identity in a worker, not the main-thread generator.
 const savedV3=envelope(expected);savedV3.game.dailyDate=date;f=await fixture(savedV3,'guard');assert.equal(f.requests.length,1);assert.equal(f.saved().game.dailyDate,date);assert.deepEqual(f.saved().game.givens,expected.givens);f.close();f=null;
 f=await fixture(ordinary(),'fallback');f.$('daily-btn').click();f.$('daily-start').click();await until(()=>f.saved().game.dailyDate===date,'fallback');assert.equal(f.saved().game.generation,null);assert.match(f.$('status-message').textContent,/本日不是新生成题/);f.close();f=null;
 f=await fixture(ordinary(),'missing');before=f.saved().game;f.$('daily-btn').click();f.$('daily-start').click();await until(()=>f.requests.length===1&&f.$('daily-start').getAttribute('aria-busy')==='false','worker failure');assert(!f.$('daily-start').disabled);assert.match(f.$('daily-start').textContent,/重试/);assert.equal(f.saved().game.sessionId,before.sessionId);assert.equal(f.w.SudokuDaily.peekPuzzle(date),null);f.close();f=null;
 console.log('PASS daily async DOM: no generation on startup/preview, worker-first prepare, cancel/close/late/midnight isolation, both save-failure checkpoints, cached retry, exact old dates and v3 worker recovery, pinned fallback and retryable unknown failure.');
 }finally{if(f)f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
