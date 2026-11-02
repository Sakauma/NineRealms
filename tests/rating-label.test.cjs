'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../src/engine.js'),H=require('../src/hints.js');
const app=fs.readFileSync('src/app.js','utf8'),start=app.indexOf('  function renderLogicRating()'),end=app.indexOf('  function hintSignature()',start),source=app.slice(start,end);
assert(start>=0&&end>start);
function render(result){const target={textContent:''},ctx={mode:'classic',clues:{}},game={givens:Array(81).fill(0)},cache=new Map();let calls=0,run;const box={$:()=>target,game,gameContext:()=>ctx,ratingCache:cache,window:{SudokuHints:{rateClassic(){calls++;return result;}}},setTimeout:f=>{run=f}};vm.runInNewContext(source+';this.run=renderLogicRating;',box);box.run();assert.equal(target.textContent,'技巧 · 分析中');run();const value=target.textContent;assert(value.length<=12);assert(!/\d|步|难度|原始|原因/.test(value));box.run();run();assert.equal(calls,1,'original-board cache retained');return value;}
const labels={'naked-single':'唯一候选','hidden-single':'唯一位置','locked-candidate':'锁定候选','naked-pair':'显性数对','hidden-pair':'隐性数对'};
for(const [technique,label] of Object.entries(labels))assert.equal(render({solved:true,steps:80,highestTechnique:technique,status:'rated'}),'技巧 · '+label);
for(const status of ['invalid','budget','beyond-supported'])assert.equal(render({solved:false,status,steps:123,reason:'long reason'}),'技巧 · 未评级');
const classic=E.getPuzzle('easy','compact-rating','classic');const rated=H.rateClassic(classic.solution,{mode:'classic',clues:classic.clues});assert.equal(render(rated),'技巧 · 无需推理');
assert.equal(render(H.rateClassic(Array(81).fill(0),'classic')),'技巧 · 未评级');
const variant=E.getPuzzle('hard','compact-rating','thermo-killer');assert.equal(render(H.rateClassic(variant.givens,{mode:variant.mode,clues:variant.clues})),'技巧 · 暂不支持');
const html=fs.readFileSync('src/index.html','utf8');assert(!html.includes('本题技巧评级'));assert(html.includes('id="logic-rating" role="status" aria-live="polite" aria-describedby="logic-rating-scope"'));assert(html.includes('id="logic-rating-scope" class="sr-only"'));assert(html.includes('不代表所选难度档'));
console.log('PASS compact technique labels: all five rated techniques, completed/unsupported/budget/invalid/beyond scope, original-board caching and accessible density distinction.');
