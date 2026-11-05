'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../src/engine.js'),H=require('../src/hints.js');
const app=fs.readFileSync('src/app.js','utf8'),start=app.indexOf('  function renderLogicRating()'),end=app.indexOf('  function hintSignature()',start),source=app.slice(start,end);
assert(start>=0&&end>start);
function harness(result){
 const target={textContent:'old label',removeAttribute(k){delete this[k];}},panel={hidden:false},ctx={mode:'classic',clues:{}},game={givens:Array(81).fill(0),board:Array(81).fill(7),notes:Array(81).fill(511)},cache=new Map(),queue=[];
 let calls=0;const box={$:id=>id==='logic-rating'?target:panel,game,gameContext:()=>ctx,ratingCache:cache,window:{SudokuHints:{ratePuzzle(g,c){calls++;assert.notEqual(g,game.givens);assert.deepEqual(g,game.givens);assert.equal(c,ctx);if(result instanceof Error)throw result;return result;}}},setTimeout:f=>queue.push(f)};
 vm.runInNewContext(source+';this.run=renderLogicRating;',box);
 function run(){box.run();assert.equal(panel.hidden,true);assert.equal(target.textContent,'');queue.shift()();}
 return {target,panel,ctx,game,cache,queue,box,run,get calls(){return calls;}};
}
const labels={'naked-single':'唯一候选','hidden-single':'唯一位置','locked-candidate':'锁定候选','naked-pair':'显性数对','hidden-pair':'隐性数对'};
for(const [technique,label] of Object.entries(labels)){
 const h=harness({solved:true,steps:80,highestTechnique:technique,status:'rated'});h.run();assert.equal(h.target.textContent,'本题评级 · '+label);assert.equal(h.panel.hidden,false);
 h.game.board.fill(9);h.game.notes.fill(0);h.run();assert.equal(h.calls,1,'only original givens affect the cache');assert.equal(h.cache.size,1);
}
for(const status of ['unsupported','invalid','budget','beyond-supported']){
 const h=harness({solved:false,status,steps:123,reason:'not product copy'});h.run();assert.equal(h.panel.hidden,true);assert.equal(h.target.textContent,'');h.run();assert.equal(h.calls,2,'failed ratings can retry and are never cached');assert.equal(h.cache.size,0);
}
for(const r of [null,new Error('rating unavailable'),{solved:true,status:'invalid',steps:1},{solved:true,status:'rated',steps:1,highestTechnique:'unknown'}]){const h=harness(r);h.run();assert.equal(h.panel.hidden,true);assert.equal(h.target.textContent,'');}
const h=harness({solved:true,status:'rated',steps:1,highestTechnique:'naked-single'});h.box.run();h.ctx.mode='thermo';h.queue.shift()();assert.equal(h.calls,0,'outdated asynchronous results cannot appear on another puzzle');assert.equal(h.panel.hidden,true);
const bounded=harness({solved:true,status:'rated',steps:1,highestTechnique:'naked-single'});for(let i=0;i<70;i++){bounded.game.givens[0]=i;bounded.run();}assert.equal(bounded.cache.size,64);
const classic=E.getPuzzle('easy','compact-rating','classic'),rated=H.rateClassic(classic.solution,{mode:'classic',clues:classic.clues}),complete=harness(rated);complete.run();assert.equal(complete.target.textContent,'本题评级 · 无需推理');
const html=fs.readFileSync('src/index.html','utf8');assert.match(html,/id="logic-rating-panel"[^>]* hidden/);assert(html.includes('id="logic-rating" role="status" aria-live="polite" aria-describedby="logic-rating-scope"'));assert(html.includes('id="logic-rating-scope" class="sr-only"'));assert(html.includes('不代表所选难度档'));assert(html.includes('解题技巧 <span>· 通用指南</span>'));assert(!html.includes('通用建议，不表示本题一定用到这些技巧。'));assert(!/暂不支持|未评级|分析中/.test(source));
console.log('PASS rating labels: five computed techniques; only complete successful ratings shown; failures hidden/retryable; original-givens cache, 64-entry limit, stale results, errors and accessible guide distinction.');
