'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),C=require('../src/custom-puzzle.js'),S=require('../src/challenge.js'),F=require('../src/favorites.js'),B=require('../src/backup.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const text='530070000600195000098000060800060003400803001700020006060000280000419005000080079',givens=C.parse(text),before=clone(givens);
const unique=C.validate(givens);assert.equal(unique.status,'unique');assert.equal(unique.playable,true);assert.equal(unique.count,1);assert(E.validateComplete(unique.solution,'classic'));
assert.deepEqual(C.parse(C.toText(givens)),givens);assert.deepEqual(C.parse(C.toText(givens).replace(/\./g,'0').replace(/\n/g,' \n ')),givens);assert.deepEqual(givens,before);
const conflict=givens.slice();conflict[1]=5;assert.equal(C.validate(conflict).status,'conflict');assert(C.validate(conflict).conflicts.includes(0));
const noSolution=givens.slice();const i=noSolution.findIndex((v,i)=>!v&&E.candidates(noSolution,i,'classic').some(n=>n!==unique.solution[i]));noSolution[i]=E.candidates(noSolution,i,'classic').find(n=>n!==unique.solution[i]);
assert.equal(E.getConflicts(noSolution,'classic').length,0);assert.equal(C.validate(noSolution).status,'unsolvable');
assert.equal(C.validate(Array(81).fill(0)).status,'multiple');
const budget=C.validate(givens,{maxNodes:1});assert.equal(budget.status,'budget');assert.equal(budget.solution,null,'unfinished uniqueness proof must not publish a solution');
const full=C.validate(unique.solution);assert.equal(full.status,'unique');assert.equal(full.playable,false);assert.throws(()=>C.puzzle(unique.solution,full));
for(const bad of [text.slice(1),text+'0',text.replace('0','x'),'<script>',JSON.stringify(givens),'NR1-'+text,'０'.repeat(81),'0'.repeat(2049)])assert.throws(()=>C.parse(bad));
assert.throws(()=>C.validate(Array(81)));assert.throws(()=>C.validate(Array(81).fill(10)));
const puzzle=C.puzzle(givens,unique);assert.equal(puzzle.custom,true);assert.equal(puzzle.mode,'classic');
const shared=C.toText(puzzle.givens);assert(!shared.includes(puzzle.solution.join('')));assert.deepEqual(S.decode(S.create(puzzle)).givens,givens,'reuse existing challenge-code format');
const raw=new Map(),storage={getItem:k=>raw.get(k)||null,setItem:(k,v)=>raw.set(k,v),removeItem:k=>raw.delete(k)};
const store=F.createStore(storage);const record=store.add(puzzle,{later:true});assert.equal(record.puzzle.custom,true);assert.deepEqual(F.createStore(storage).get(record.id).puzzle.givens,givens);
const game={...puzzle,custom:true,puzzleId:puzzle.id,sessionId:'custom-save-session',createdAt:1,board:givens.slice(),notes:Array(81).fill(0),selected:i,history:[],redo:[],hints:0,mistakes:0,elapsedMs:0,started:false,paused:false,completed:false,branch:null};
delete game.id;
raw.set('nine-realms.sudoku.v1',JSON.stringify({version:8,preferences:{customDraft:C.toText(givens)},game}));const backup=B.create(storage);assert.equal(B.validate(backup).entries['nine-realms.sudoku.v1'].game.custom,true);
const bad=clone(backup);bad.entries['nine-realms.sudoku.v1'].game.custom='yes';assert.throws(()=>B.validate(bad));
(async()=>{
 const client=C.createClient();assert.equal((await client.run(givens)).status,'unique','bounded fallback works when Worker is absent');
 const nativeWorker=global.Worker;try{global.Worker=class{constructor(){throw Error('Worker blocked by browser');}};assert.equal((await C.createClient().run(givens)).status,'unique','constructor failure uses the same bounded fallback');}finally{if(nativeWorker===undefined)delete global.Worker;else global.Worker=nativeWorker;}
 const pending=client.run(givens);client.cancel();await assert.rejects(pending,{name:'AbortError'});
 console.log('PASS custom classic: text roundtrip, direct conflicts vs conflict-free unsolvable vs multiple vs unique, budget honesty, full-grid guard, givens-only sharing, NR compatibility, custom favorites/save/backup and cancellable bounded fallback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
