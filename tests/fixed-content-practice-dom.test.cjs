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
async function fixture(initial,voyage={}){
 const errors=[],requests=[],workers=new Set(),sources=new Map(),control={behavior:'run',nextSeed:'fresh-dom-0'},vc=new VirtualConsole();let serial=0;
 vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://ninerealms.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.localStorage.setItem(KEY,JSON.stringify(initial));w.localStorage.setItem("nine-realms.voyage.v1",JSON.stringify(voyage));
  w.matchMedia=()=>({matches:true,addEventListener(){},addListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;return new Proxy({canvas:this},{get:(o,k)=>k in o?o[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}})};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.Blob=class{constructor(parts){this.source=parts.join('');}};
  w.URL.createObjectURL=blob=>{const url='blob:test-'+(++serial);sources.set(url,blob.source);return url;};w.URL.revokeObjectURL=url=>sources.delete(url);
  w.Worker=class{
   constructor(url){this.source=sources.get(url);this.stopped=false;workers.add(this);}
   postMessage(request){
    requests.push(clone(request));
    if(control.behavior==='hold')return;
    if(control.behavior==='fail'){setTimeout(()=>{if(!this.stopped)this.onmessage({data:{error:'DIVERSITY_BUDGET'}});},5);return;}
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
 return {w,$,requests,control,saved,async launch(){const n=requests.length;$('new-game').click();if($('confirm-dialog').open)$('confirm-accept').click();await until(()=>requests.length>n,'request');await until(()=>$('new-game').getAttribute('aria-busy')==='false','generation finish');assert.deepEqual(errors,[]);return saved();},close(){for(const worker of [...workers])worker.terminate();dom.window.close();assert.deepEqual(errors,[]);}};
}
function memory(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
(async()=>{let f;try{
 const V=require('../src/voyage.js'),C=require('../src/curated.js');
 const progress={__journey:{version:1,granted:[]},dawn:{stars:3,elapsedMs:12000,mistakes:0,hints:0}},initial=envelope(V.getPuzzle('dawn'));initial.game.voyageId='dawn';initial.game.started=true;
 f=await fixture(initial,progress);const original=f.saved().game,raw=f.w.localStorage.getItem('nine-realms.voyage.v1');
 f.$('voyage-btn').click();f.$('voyage-world-nodes').querySelector('[data-world-id="dawn"]').click();assert(f.$('voyage-fresh'));f.$('voyage-fresh').click();assert(f.$('confirm-dialog').open);f.$('confirm-cancel').click();await tick();assert(f.$('voyage-dialog').open);assert.equal(f.saved().game.sessionId,original.sessionId);
 f.$('voyage-fresh').click();f.$('confirm-accept').click();await until(()=>f.requests.length===1,'voyage practice request');await until(()=>f.$('new-game').getAttribute('aria-busy')==='false','voyage practice generated');
 assert.equal(f.requests[0].mode,'classic');assert.equal(f.requests[0].fresh,true);assert.notEqual(f.saved().game.sessionId,original.sessionId);assert.equal(f.saved().game.voyageId,null);assert.equal(f.saved().game.dailyDate,null);assert.equal(f.saved().game.generation.kind,'constructed');assert.equal(f.w.localStorage.getItem('nine-realms.voyage.v1'),raw,'independent practice must not change chapter scores');f.close();f=null;
 f=await fixture(envelope(C.getPuzzle('curated-thermo-intro-1-v1')));const curatedOriginal=f.saved().game;f.$('rules-open').click();assert(f.$('curated-fresh'));f.$('curated-fresh').click();await until(()=>f.requests.length===1,'curated fresh request');await until(()=>f.$('new-game').getAttribute('aria-busy')==='false','curated fresh generated');assert.equal(f.requests[0].mode,'thermo');assert.equal(f.saved().game.generation.kind,'constructed');assert.equal(f.saved().game.voyageId,null);assert.equal(f.saved().game.dailyDate,null);assert(!C.identify(f.saved().game));assert.notDeepEqual(f.saved().game.givens,curatedOriginal.givens);f.close();f=null;
 f=await fixture(envelope(C.getPuzzle('curated-thermo-intro-1-v1')));f.control.behavior='fail';const beforeFailure=f.saved().game;f.$('rules-open').click();f.$('curated-fresh').click();await until(()=>f.requests.length===1,'failed practice request');await until(()=>f.$('new-game').getAttribute('aria-busy')==='false','failure resolved');assert.equal(f.saved().game.sessionId,beforeFailure.sessionId);assert.deepEqual(f.saved().game.board,beforeFailure.board);assert(f.$('rules-dialog').open);assert.match(f.$('status-message').textContent,/原棋局已保留/);f.close();f=null;
 f=await fixture(envelope(C.getPuzzle('curated-thermo-intro-1-v1')));f.control.behavior='hold';const beforeCancel=f.saved().game;f.$('rules-open').click();f.$('curated-fresh').click();await until(()=>f.requests.length===1,'held practice');f.$('new-game').click();await tick();assert.equal(f.saved().game.sessionId,beforeCancel.sessionId);assert.deepEqual(f.saved().game.board,beforeCancel.board);assert(!f.$('rules-dialog').open);f.close();f=null;
 console.log('PASS fixed-content practice: completed voyage independent new puzzle, untouched stars/IDs, curated fresh action, actual worker success, confirmation cancel, generation failure and in-flight cancellation preserve original. jsdom, not pixel rendering.');
 }finally{if(f)f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
