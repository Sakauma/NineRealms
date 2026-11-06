/* Optional jsdom integration; not browser rendering. */
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const E=require('../src/engine.js'),V=require('../src/voyage.js'),H=require('../src/hints.js');
const p=E.getPuzzle('hard','hints3','classic');
const board='820579406709008250040030987900000142010924008402100009300060700206000805100800620'.split('').map(Number);
assert.equal(H.getStep(board,p.givens,p.solution,'classic',Array(81).fill(0)).kind,'elimination');
const initial={version:8,preferences:{theme:'nebula',fx:false,intensity:'soft'},game:{sessionId:'roadmap-session',createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:'classic',difficulty:'hard',clues:p.clues,givens:p.givens,solution:p.solution,board,notes:Array(81).fill(0),selected:board.findIndex(v=>!v),mistakes:0,hints:0,elapsedMs:500,started:true,paused:false,completed:false,history:[],branch:null}};
const oldProgress={dawn:{stars:3,elapsedMs:123,mistakes:0,hints:0}},errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const html=fs.readFileSync('dist/index.html','utf8');
const dom=new JSDOM(html,{url:'https://ninerealms.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 w.localStorage.setItem('nine-realms.sudoku.v1',JSON.stringify(initial));w.localStorage.setItem('nine-realms.voyage.v1',JSON.stringify(oldProgress));
 w.matchMedia=()=>({matches:true,addEventListener(){},addListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;return new Proxy({canvas:this},{get:(o,k)=>k in o?o[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}})};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
}});
const w=dom.window,d=w.document,$=id=>d.getElementById(id),tick=()=>new Promise(r=>setTimeout(r,30)),saved=()=>JSON.parse(w.localStorage.getItem('nine-realms.sudoku.v1')).game;
(async()=>{
 await tick();assert.deepEqual(errors,[]);if(saved().paused)$('resume-btn').click();
 const before=saved();$('hint-btn').click();assert(!$('hint-panel').hidden);
 assert.match($('hint-title').textContent,/^提示 · /);assert.match($('hint-title').getAttribute('aria-label'),/答案/);assert.equal($('hint-value').textContent,String(p.solution[before.selected]));
 assert(!$('hint-next')&&!$('hint-apply')&&!$('hint-stage'),'no staged or write-through hint controls');
 const after=saved();for(const field of ['board','notes','selected','history','redo','draft'])assert.deepEqual(after[field],before[field],field+' unchanged by direct result');
 assert.equal(after.hints,before.hints+1);$('hint-btn').click();assert.equal(saved().hints,after.hints,'same visible result counts once');
 w.NineRealmsHistory.flush();const history=JSON.parse(w.localStorage.getItem('nine-realms.history.v1'));assert(!history.records.some(r=>JSON.stringify(r).includes('技巧排除')),'direct result never records a candidate-edit step');
 $('hint-close').click();assert($('hint-panel').hidden);
 $('rules-open').click();await tick();assert.match($('logic-rating').textContent,/^本题评级 · /);assert(!/步|不等同/.test($('logic-rating').textContent));assert.match($('logic-rating-scope').textContent,/不代表所选难度档/);$('rules-close').click();
 $('voyage-btn').click();$('voyage-tracks').querySelector('[data-track="lines"]').click();assert.equal($('voyage-tracks').children.length,4);assert.equal($('voyage-map').children.length,3);assert.equal($('voyage-map').querySelectorAll('button:not(:disabled)').length,1);assert.match($('voyage-lesson').textContent,/温度计/);const node=$('voyage-map').querySelector('button');node.focus();node.click();assert.equal(d.activeElement.dataset.voyage,node.dataset.voyage);
 $('voyage-tracks').querySelector('[data-track="legacy"]').click();assert.equal($('voyage-map').children.length,9);assert.equal($('voyage-map').querySelectorAll('button:not(:disabled)').length,2);assert.match($('voyage-card-progress').textContent,/1 \/ 16/);
 $('voyage-tracks').querySelector('[data-track="sums"]').click();assert.equal($('voyage-map').children.length,3);assert.match($('voyage-lesson').textContent,/笼/);
 $('voyage-start').click();assert($('confirm-dialog').open);$('confirm-cancel').click();await tick();assert.equal(saved().sessionId,before.sessionId);const migrated=JSON.parse(w.localStorage.getItem('nine-realms.voyage.v1'));assert.deepEqual(migrated.dawn,oldProgress.dawn);assert.equal(migrated.__journey.version,1);
 $('voyage-btn').click();$('voyage-tracks').querySelector('[data-track="lines"]').click();$('voyage-start').click();$('confirm-accept').click();await tick();
 assert.equal(saved().voyageId,'lines-rise-v1');const q=V.getPuzzle('lines-rise-v1');assert.deepEqual(saved().givens,q.givens);assert.deepEqual(saved().clues,q.clues);assert.equal(saved().started,false);
 $('rules-open').click();await tick();assert($('logic-rating-panel').hidden);assert.equal($('logic-rating').textContent,'');$('rules-close').click();
 assert.equal(d.querySelector('.app-version').textContent,'1.3.1');assert.deepEqual(errors,[]);dom.window.close();
 console.log('PASS roadmap DOM: single selected-cell result without board/note/history mutation, bounded original-puzzle rating, linked tracks with inherited passage, legacy progress, teaching text, cancel preservation and full-clue new chapter install. No actual rendering.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
