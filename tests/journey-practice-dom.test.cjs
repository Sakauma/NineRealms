/* Optional jsdom integration; no actual browser rendering or native keyboard emulation. */
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const E=require('../src/engine.js'),V=require('../src/voyage.js');
const html=fs.readFileSync('src/index.html','utf8').replace(/<script src="\.\/([^"]+)"><\/script>/g,(_,name)=>'<script>'+fs.readFileSync('src/'+name,'utf8')+'</script>').replace(/<link[^>]*href="\.\/[^"]+"[^>]*>/g,'');
const tick=(ms=30)=>new Promise(r=>setTimeout(r,ms));
const stats=()=>({stars:1,elapsedMs:123,mistakes:1,hints:1});
const fresh=()=>({__journey:{version:1,granted:[]}});
function progress(ids){return Object.assign(fresh(),Object.fromEntries(ids.map(id=>[id,stats()])));}
async function fixture(raw,chapter,nearDone=false){
 const p=chapter?V.getPuzzle(chapter):E.getPuzzle('easy','voyage-story-dom','classic');
 const blank=p.givens.findIndex(v=>!v),board=nearDone?p.solution.slice():p.givens.slice();if(nearDone)board[blank]=0;
 const initial={version:8,preferences:{theme:'nebula',fx:false,intensity:'soft'},game:{sessionId:'story-'+(chapter||'ordinary'),createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,board,notes:Array(81).fill(0),selected:blank,mistakes:0,hints:0,elapsedMs:500,started:true,paused:false,completed:false,history:[],branch:null}};
 if(chapter)initial.game.voyageId=chapter;
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://ninerealms.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.localStorage.setItem('nine-realms.sudoku.v1',JSON.stringify(initial));w.localStorage.setItem('nine-realms.voyage.v1',JSON.stringify(raw));
  w.matchMedia=()=>({matches:true,addEventListener(){},addListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;return new Proxy({canvas:this},{get:(o,k)=>k in o?o[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}})};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 }});
 const w=dom.window,d=w.document,$=id=>d.getElementById(id),saved=()=>JSON.parse(w.localStorage.getItem('nine-realms.sudoku.v1')).game,stored=()=>JSON.parse(w.localStorage.getItem('nine-realms.voyage.v1'));
 await tick();assert.deepEqual(errors,[]);if(saved().paused)$('resume-btn').click();
 return {w,d,$,p,blank,saved,stored,close(){assert.deepEqual(errors,[]);dom.window.close();},async finish(){d.querySelectorAll('.cell')[blank].click();d.dispatchEvent(new w.KeyboardEvent('keydown',{key:String(p.solution[blank]),bubbles:true,cancelable:true}));await tick(80);assert(saved().completed);assert($('completion-dialog').open);}};
}
(async()=>{
 const T=require('../src/training.js'), C=require('../src/curated.js');
 // An optional discovery is visible early without forging chapter completion.
 let f=await fixture(progress(['dawn']));let {$,d,w}=f;let before=f.saved();$('voyage-btn').click();
 assert.equal($('voyage-discovery').querySelectorAll('button').length,1);
 $('voyage-discovery').querySelector('button').click();assert($('confirm-dialog').open);
 $('confirm-cancel').click();await tick();assert($('voyage-dialog').open);assert.equal(f.saved().sessionId,before.sessionId);
 $('voyage-discovery').querySelector('button').click();$('confirm-accept').click();await tick();
 assert(C.identify(f.saved()));assert.equal(f.saved().voyageId,null);assert.equal(V.getStatus(f.stored(),'all').completed,1);assert.equal($('curated-choices').querySelectorAll('button').length,3);
 assert.match($('puzzle-bank-status').textContent,/温度/);assert.match($('curated-rating').textContent,/温度/);assert.equal($('curated-choices').closest('dialog').id,'rules-dialog');
 $('rules-open').click();$('curated-choices').querySelector('button').click();await tick();assert.equal(C.identify(f.saved()).id,'curated-thermo-intro-2-v1');assert(!$('rules-dialog').open);
 assert(!/密度档|原题库/.test($('puzzle-bank-status').textContent));f.close();
 // Completing a practice offers a related real puzzle. Cancelling preserves both game and practice.
 for(const station of ['thermo-bounds','killer-sum','arrow-sum','locked-candidate']) {
  f=await fixture(fresh());({$,d,w}=f);before=f.saved();$('voyage-btn').click();
  $('voyage-training-links').querySelector(`[data-station="${station}"]`).click();assert($('training-dialog').open);assert($('training-play').hidden);
  const id=$('training-exercises').querySelector('button').dataset.exercise, ex=T.exercise(id);
  let answer;for(let i=0;i<81&&!answer;i++)for(let n=1;n<=9;n++)if(T.check(id,i,n).ok){answer={i,n};break;}
  assert(answer);$('training-board').querySelector(`[data-practice-cell="${answer.i}"]`).click();$('training-digits').children[answer.n-1].click();assert(!$('training-play').hidden);
  $('training-play').click();assert($('confirm-dialog').open);$('confirm-cancel').click();await tick();assert($('training-dialog').open);assert.equal(f.saved().sessionId,before.sessionId);assert(V.practiceProgress(f.stored()).completed.includes(id));
  $('training-play').click();$('confirm-accept').click();await tick();assert(!$('training-dialog').open);assert(!$('voyage-dialog').open);assert.notEqual(f.saved().sessionId,before.sessionId);assert.equal(f.saved().started,false);assert.equal(f.saved().hints,0);assert.equal(f.saved().voyageId,null);
  if(ex.local)assert.equal(C.identify(f.saved()).mode,ex.mode);else assert.equal(f.saved().sourceId,ex.sourceId);
  assert.equal(V.getStatus(f.stored(),'all').completed,0);f.close();
 }
 // A history-storage failure must not replace the active board, even after confirmation.
 f=await fixture(progress(['dawn']));({$,d,w}=f);before=f.saved();$('voyage-btn').click();
 const originalSet=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(key===w.NineRealmsHistory.KEY)throw new Error('quota');return originalSet.call(this,key,value);};
 $('voyage-discovery').querySelector('button').click();$('confirm-accept').click();await tick();assert.equal(f.saved().sessionId,before.sessionId);assert($('voyage-dialog').open);w.Storage.prototype.setItem=originalSet;f.close();
 console.log('journey-practice-dom: discovery, cancel, confirmation, all practice handoffs, rating labels and progress preservation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
