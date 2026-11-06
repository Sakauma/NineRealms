'use strict';
const assert=require('node:assert/strict'),H=require('../src/history.js'),D=require('../src/drafts.js'),E=require('../src/engine.js');
const p=E.getPuzzle('easy','review','classic'),index=p.givens.findIndex(v=>!v);
const s={version:8,game:{sessionId:'review-session',mode:'classic',difficulty:'easy',givens:p.givens,solution:p.solution,clues:p.clues,board:p.givens.slice(),notes:Array(81).fill(0),elapsedMs:0,mistakes:0,hints:0,selected:index,started:true,completed:false,branch:null}};
const store=H.createStore({Engine:E});store.capture(s,{origin:'new'});assert.deepEqual(store.summarize(s.game.sessionId).events,[]);
s.game.elapsedMs=1200;store.capture(s);assert.equal(store.summarize(s.game.sessionId).retainedSteps,0,'time alone is not a fabricated action');
s.game.hints=1;store.capture(s,{action:'查看锁定候选提示'});s.game.notes[index]=3;store.capture(s,{action:'候选笔记'});s.game.draft=D.setCell(undefined,81,index,1,2);store.capture(s,{action:'草稿上色'});s.game.draft=D.empty(81);store.capture(s,{action:'撤销草稿'});s.game.mistakes++;store.capture(s);s.game.branch={};store.capture(s,{action:'建立假设'});
const report=store.summarize(s.game.sessionId);assert.deepEqual(report.counts,{hints:1,mistakes:1,notes:1,drafts:2,undo:1,branches:1,completion:0});assert.equal(report.events.length,6);assert.deepEqual(report.events.map(e=>e.stepIndex),[1,2,3,4,5,6]);assert(!('techniquesUsed' in report));assert.equal(report.partial,false);assert.match(report.scope,/不推断/);
assert.equal(store.frameAt(s.game.sessionId,3).draft.colors[index],1);assert(store.frameAt(s.game.sessionId,3).changed.includes(index));assert.equal(store.frameAt(s.game.sessionId,4).draft.colors[index],0);
const limited=H.createStore({Engine:E,maxSteps:1});limited.capture({...s,game:{...s.game,notes:Array(81).fill(0),hints:0}},{origin:'legacy'});s.game.hints=2;limited.capture(s);s.game.hints=3;limited.capture(s);const partial=limited.summarize(s.game.sessionId);assert.equal(partial.partial,true);assert.equal(partial.retainedSteps,1);assert.equal(partial.counts.hints,1);assert.equal(partial.events[0].absoluteStep,2);
// Old snapshots without a draft still capture and replay without invented draft events.
const old=H.createStore({Engine:E});delete s.game.draft;s.game.branch=null;old.capture(s,{origin:'new'});s.game.board[index]=p.solution[index];s.game.notes[index]=0;old.capture(s);assert.equal(old.summarize(s.game.sessionId).counts.drafts,0);assert.equal(old.frameAt(s.game.sessionId,1).draft,undefined);
console.log('PASS review: observed hint/note/draft/undo/mistake/branch events, exact replay jumps, no elapsed-only or inferred-technique events, retained-window statistics and legacy draft omission.');
if(process.env.REVIEW_DOM||process.argv.includes('--dom')){
 const fs=require('node:fs'),{JSDOM}=require('jsdom');
 const dom=new JSDOM('<button id="history-open">历史</button>',{url:'https://ninerealms.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 for(const file of ['variant-bank.js','multigrid-bank.js','engine.js','drafts.js','checkpoints.js','history.js'])w.eval(fs.readFileSync(require('node:path').join(__dirname,'../src',file),'utf8'));
 w.NineRealmsHistory.init({Engine:w.SudokuEngine,openDialog:d=>d.showModal()});
 const x=w.JSON.parse(JSON.stringify({...s,game:{...s.game,sessionId:'review-dom',draft:D.empty(81)}}));w.NineRealmsHistory.capture(x,{origin:'new'});
 x.game.draft=w.NineRealmsDrafts.setCell(x.game.draft,81,index,3,1,x.game.clues);w.NineRealmsHistory.capture(x,{action:'草稿关注'});
 x.game.hints++;w.NineRealmsHistory.capture(x,{action:'查看提示'});w.NineRealmsHistory.open('review-dom',1);
 const $=id=>w.document.getElementById(id);assert.equal($('history-replay-slider').value,'1');assert.equal(w.document.querySelectorAll('.history-review-jump').length,2);assert.equal(w.document.querySelector(`[data-index="${index}"]`).dataset.draftColor,'3');
 w.document.querySelector('.history-review-jump[data-step-index="2"]').click();assert.equal($('history-replay-slider').value,'2');assert.match($('history-action-label').textContent,/查看提示/);assert.match(w.document.querySelector('.history-review-summary').textContent,/不推断/);dom.window.close();
 console.log('PASS review DOM: exact event-button/explicit-step jumps and visible draft datasets/labels. jsdom only, not rendered pixels.');
}
