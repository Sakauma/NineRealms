'use strict';
const assert = require('node:assert/strict'), E = require('../src/engine.js'), H = require('../src/history.js'), B = require('../src/backup.js'), D = require('../src/drafts.js');
const clone = x => JSON.parse(JSON.stringify(x)), raw = new Map();
const storage = {getItem:k=>raw.get(k)||null,setItem:(k,v)=>raw.set(k,v),removeItem:k=>raw.delete(k)};
let clock = 1000;
const store = H.createStore({Engine:E,storage,now:()=>++clock,maxSteps:3});
const p = E.getPuzzle('easy','independent-practice','classic'), i = p.givens.findIndex(v=>!v);
const s = {version:8,game:{sessionId:'practice-original',createdAt:1,puzzleId:p.id,mode:'classic',difficulty:'easy',clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),draft:D.empty(81),selected:i,noteMode:true,mistakes:0,hints:0,elapsedMs:100,started:true,paused:false,completed:false,history:[],branch:null,logicMode:true}};
store.capture(s,{origin:'new'});
s.game.notes[i]=5;s.game.draft=D.setCell(s.game.draft,81,i,2,1,s.game.clues);store.capture(s,{action:'笔记与草稿'});
store.markCheckpoint(s.game.sessionId,1,'复练这里');
s.game.notes[i]=0;s.game.board[i]=p.solution[i];s.game.hints=2;store.capture(s,{action:'填数'});
const original = clone(store.get(s.game.sessionId)), practice = store.practiceAt(s.game.sessionId,1), other = store.practiceAt(s.game.sessionId,1);
assert.notEqual(practice.game.sessionId,s.game.sessionId);assert.notEqual(practice.game.sessionId,other.game.sessionId);
assert.equal(practice.game.board[i],0);assert.equal(practice.game.notes[i],5);assert.equal(practice.game.draft.colors[i],2);
assert.equal(practice.game.logicMode,true);assert.equal(practice.game.elapsedMs,0);assert.equal(practice.game.hints,0);assert.equal(practice.game.started,false);
assert.equal(practice.game.dailyDate,null);assert.equal(practice.game.voyageId,null);assert.equal(practice.game.branch,null);
assert.deepEqual(store.get(s.game.sessionId),original,'creating a copy must not alter the original snapshot, logs or marks');
store.capture(practice,{origin:'new'});practice.game.notes[i]=7;store.capture(practice,{action:'复练笔记'});
assert.equal(store.frameAt(practice.game.sessionId,0).notes[i],5);assert.equal(store.frameAt(practice.game.sessionId,1).notes[i],7);
assert.deepEqual(store.get(s.game.sessionId),original);
store.flush();raw.set('nine-realms.sudoku.v1',JSON.stringify(practice));
const backup=B.create(storage);assert.equal(B.validate(backup).entries[H.KEY].records.length,2);
const reload=H.createStore({Engine:E,storage});assert.equal(reload.getSnapshot(practice.game.sessionId).game.practice.absoluteStep,1);
assert.throws(()=>store.practiceAt('missing',1),/移除/);assert.throws(()=>store.practiceAt(s.game.sessionId,99),/清理/);assert.throws(()=>store.practiceAt(s.game.sessionId,1.1),/清理/);
for(let n=0;n<4;n++){s.game.notes[i]=0;s.game.board[i]=n%2?p.solution[i]:0;store.capture(s,{action:'继续原局'});}
assert.throws(()=>store.practiceAt(s.game.sessionId,1),/清理/,'absolute historical steps must not silently clamp to a retained frame');
const assumption=clone(s);assumption.game.sessionId='practice-assumption';assumption.game.branch={board:p.givens.slice()};assumption.game.logicMode=false;store.capture(assumption);
const trial=store.practiceAt(assumption.game.sessionId,0);assert.equal(trial.game.practice.wasAssumption,true);assert.equal(trial.game.logicMode,true);assert.equal(trial.game.branch,null);
const bad=clone(backup);bad.entries['nine-realms.sudoku.v1'].game.practice.evil=true;assert.throws(()=>B.validate(bad));
// Creating a practice copy at the record limit must protect its source, even
// when ordinary completed-first eviction would have selected that source.
const capacity=H.createStore({Engine:E,now:()=>++clock,maxRecords:2});
const finished=clone(s);finished.game.sessionId='practice-finished-source';finished.game.board=p.solution.slice();finished.game.notes=Array(81).fill(0);finished.game.completed=true;finished.game.branch=null;
capacity.capture(finished,{origin:'new'});
const unrelated=clone(finished);unrelated.game.sessionId='practice-unrelated';unrelated.game.board=p.givens.slice();unrelated.game.completed=false;capacity.capture(unrelated,{origin:'new'});
const retained=capacity.practiceAt(finished.game.sessionId,0);capacity.capture(retained,{origin:'new'});
assert(capacity.get(finished.game.sessionId),'practice creation must not evict its own original');assert(capacity.get(retained.game.sessionId));assert.equal(capacity.getRecords().length,2);
console.log('PASS independent practice: exact historical board/notes/draft, separate IDs/logs/timer, source immutability, stale/evicted rejection, assumption provenance, persistence and strict eight-key backup roundtrip.');
