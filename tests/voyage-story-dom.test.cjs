/* Optional jsdom integration; no actual browser rendering or native keyboard emulation. */
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('../.build-cache/dom-test/node_modules/jsdom');
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
 // New-player migration marker must not be mistaken for a completed chapter or old passage.
 let f=await fixture(fresh());let {$,d,w}=f;$('voyage-btn').click();assert.match($('voyage-card-progress').textContent,/0 \/ 15 关 · 0 \/ 45 星/);assert.match($('voyage-milestones').textContent,/0\/9.*0\/3.*0\/2.*0\/1/);
 for(const track of ['lines','sums']){const tab=$('voyage-tracks').querySelector(`[data-track="${track}"]`);tab.focus();tab.click();assert.equal(d.activeElement,tab);assert.equal($('voyage-map').querySelectorAll('button:not(:disabled)').length,0);assert($('voyage-start').disabled);assert.match($('voyage-gate').textContent,/九关/);}
 $('voyage-next-stop').focus();$('voyage-next-stop').click();assert.equal(d.activeElement,$('voyage-start'));assert.match($('voyage-selected-title').textContent,/启明星/);const node=$('voyage-map').querySelector('[data-voyage="dawn"]');node.focus();node.click();assert.equal(d.activeElement.dataset.voyage,'dawn');
 const before=f.saved(),rawBefore=f.stored();$('voyage-start').click();assert($('confirm-dialog').open);$('confirm-cancel').click();await tick();assert.equal(f.saved().sessionId,before.sessionId);assert.deepEqual(f.stored(),rawBefore);f.close();
 // Existing empty old progress with a valid current themed puzzle retains passage, not fake scores.
 f=await fixture({},'lines-rise-v1');({$,d,w}=f);$('voyage-btn').click();assert(!$('voyage-start').disabled);assert.match($('voyage-selected-title').textContent,/微光升温/);assert.match($('voyage-card-progress').textContent,/0 \/ 15 关 · 0 \/ 45 星/);assert.match($('voyage-gate').textContent,/旧版通行/);$('voyage-start').click();assert.equal(f.saved().voyageId,'lines-rise-v1');assert.equal(V.getStatus(f.stored(),'all').completed,0);f.close();
 // Actual last-cell completion of original ninth stage opens both branches, even one-star predecessors.
 const legacy=V.chapters('legacy').map(c=>c.id),lines=V.chapters('lines').map(c=>c.id),sums=V.chapters('sums').map(c=>c.id);
 f=await fixture(progress(legacy.slice(0,8)),'home',true);({$,d,w}=f);await f.finish();assert.match($('completion-voyage').textContent,/新航路已开放：.*微光升温.*星火相聚/);assert.match($('play-again').textContent,/微光升温/);assert(V.canEnter(f.stored(),lines[0]));assert(V.canEnter(f.stored(),sums[0]));assert.equal(V.getStatus(f.stored(),'all').completed,9);$('play-again').click();assert($('voyage-dialog').open);assert.match($('voyage-selected-title').textContent,/微光升温/);assert(!$('voyage-start').disabled);f.close();
 // Completing arrow second stage when all three line stages are done unlocks the convergence finale.
 f=await fixture(progress([...legacy,...lines,sums[0]]),sums[1],true);({$,d,w}=f);await f.finish();assert.match($('completion-voyage').textContent,/新航路已开放：群星合奏/);assert.match($('play-again').textContent,/群星合奏/);assert(V.canEnter(f.stored(),sums[2]));$('play-again').click();assert.match($('voyage-selected-title').textContent,/群星合奏/);assert(!$('voyage-start').disabled);assert.match($('voyage-milestones').textContent,/9\/9.*3\/3.*2\/2.*0\/1/);f.close();
 // All fifteen completed means no invented future stop or marker counted as a sixteenth record.
 f=await fixture(progress([...legacy,...lines,...sums.slice(0,2)]),sums[2],true);({$,d,w}=f);await f.finish();assert.match($('play-again').textContent,/归航完成/);assert.doesNotMatch($('completion-voyage').textContent,/新航路已开放/);assert.equal(V.journey(f.stored()).nextId,null);$('play-again').click();assert($('voyage-next-stop').disabled);assert.match($('voyage-card-progress').textContent,/15 \/ 15 关/);assert.match($('voyage-card-title').textContent,/已复原/);assert.match($('voyage-milestones').textContent,/9\/9.*3\/3.*2\/2.*1\/1/);f.close();
 // Unknown future progress must remain byte-exact and must not be silently omitted from backup.
 const future={__journey:{version:2,granted:['lines-rise-v1']},futureState:{preserve:true}};
 f=await fixture(future);({$,d,w}=f);const futureRaw=w.localStorage.getItem('nine-realms.voyage.v1');assert.equal(futureRaw,JSON.stringify(future));
 $('voyage-btn').click();assert($('voyage-start').disabled);assert($('voyage-next-stop').disabled);assert.match($('voyage-gate').textContent,/较新|不可读取/);$('voyage-close').click();
 const index=f.p.givens.findIndex(v=>!v);d.querySelectorAll('.cell')[index].click();$('notes-btn').click();d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'2',bubbles:true}));assert(f.saved().notes[index],'ordinary game remains usable');
 $('backup-open').click();$('backup-export').click();await tick();assert.match($('backup-status').textContent,/避免导出遗漏|完整备份已暂停/);assert.equal(w.localStorage.getItem('nine-realms.voyage.v1'),futureRaw);f.close();
 // A legitimate high-stage historical session is playable without forging predecessor results.
 f=await fixture(fresh());({$,d,w}=f);const high=V.getPuzzle('sums-constellation-v1'),highBlank=high.givens.findIndex(v=>!v),snapshot=JSON.parse(w.localStorage.getItem('nine-realms.sudoku.v1'));
 snapshot.game=Object.assign({},snapshot.game,{sessionId:'historical-high',puzzleId:high.id,sourceId:high.sourceId,voyageId:high.voyageId,mode:high.mode,difficulty:high.difficulty,clues:high.clues,givens:high.givens,solution:high.solution,board:high.solution.slice(),notes:Array(81).fill(0),selected:highBlank,started:true,paused:false,completed:false,history:[],branch:null});snapshot.game.board[highBlank]=0;
 assert(w.NineRealmsHistory.capture(snapshot,{type:'snapshot'}));w.NineRealmsHistory.flush();w.NineRealmsHistory.open('historical-high');assert(!$('history-resume').disabled);$('history-resume').click();assert($('confirm-dialog').open);$('confirm-accept').click();await tick();assert.equal(f.saved().sessionId,'historical-high');
 let retained=f.stored();assert.deepEqual(retained.__journey.granted,['sums-constellation-v1']);assert.equal(V.getStatus(retained,'all').completed,0);
 if(f.saved().paused)$('resume-btn').click();d.querySelectorAll('.cell')[highBlank].click();d.dispatchEvent(new w.KeyboardEvent('keydown',{key:String(high.solution[highBlank]),bubbles:true,cancelable:true}));await tick(80);assert(f.saved().completed);retained=f.stored();assert.equal(V.getStatus(retained,'all').completed,1);assert(retained['sums-constellation-v1']);assert(!retained.dawn);assert(!retained['sums-sparks-v1']);assert(!retained['lines-rise-v1']);f.close();
 console.log('PASS story voyage DOM: fresh gate/preview/focus/cancel, legacy current passage without fake scores, actual ninth-stage dual unlock, branch convergence and final completion CTA, 15-stage counts, future-schema preservation/backup refusal/ordinary play, historical high-stage restore and independent completion without fabricated predecessors. jsdom only, no rendering.');
})().catch(e=>{console.error(e);process.exitCode=1;});
