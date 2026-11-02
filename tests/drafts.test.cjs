'use strict';
const assert=require('node:assert/strict'),D=require('../src/drafts.js'),E=require('../src/engine.js'),H=require('../src/history.js'),B=require('../src/backup.js');
const clone=x=>JSON.parse(JSON.stringify(x));
for(const n of [81,153,369]){
 let d=D.empty(n);assert.deepEqual(D.validate(undefined,n),d);const before=clone(d);
 d=D.setCell(d,n,n-1,4,3);assert.equal(d.colors[n-1],4);assert.equal(d.marks[n-1],3);assert.deepEqual(before,D.empty(n));
 d=D.setLink(d,n,n-1,0,'same');assert.deepEqual(d.links,[{a:0,b:n-1,type:'same'}]);d=D.setLink(d,n,0,n-1,'different');assert.equal(d.links.length,1);d=D.setLink(d,n,0,n-1,null);assert.equal(d.links.length,0);
 assert.deepEqual(D.validate(d,n),d);assert.throws(()=>D.validate(d,n===81?153:81));
}
const p=E.getPuzzle('easy','draft-test','killer'),cage=p.clues.cages.findIndex(c=>c.cells.length>1),combos=D.cageCombinations(p.clues.cages[cage]);assert(combos.length);
let d=D.setCage(D.empty(81),81,cage,combos.slice(0,2),p.clues);assert.deepEqual(D.validate(d,81,p.clues),d);
for(const bad of [null,{},[],{...D.empty(81),version:2},{...D.empty(81),colors:Array(81)},{...D.empty(81),marks:Array(81).fill(4)},{...D.empty(81),links:[{a:2,b:1,type:'same'}]},{...D.empty(81),links:[{a:1,b:1,type:'same'}]},{...D.empty(81),links:[{a:1,b:2,type:'script'}]},{...D.empty(81),cages:[{index:900,combinations:[1]}]}])assert.throws(()=>D.validate(bad,81,p.clues));
assert.throws(()=>D.validate(Object.assign(Object.create({attack:1}),D.empty(81)),81));assert.throws(()=>D.validate({...D.empty(81),__proto__:null,evil:true},81));
assert.throws(()=>D.setCage(D.empty(81),81,cage,[511],p.clues));assert.throws(()=>D.validate(d,81,{}));
const tooMany=D.empty(81);for(let i=1;i<=65;i++)tooMany.links.push({a:0,b:i,type:'association'});assert.throws(()=>D.validate(tooMany,81));
const storage=new Map(),io={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
let snap={version:8,preferences:{},game:{sessionId:'draft-session',createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:'killer',difficulty:'easy',clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:true,paused:false,completed:false,history:[],branch:null,draft:D.empty(81)}};
const store=H.createStore({Engine:E,storage:io,maxSteps:2});assert(store.capture(snap,{origin:'new'}));
const stages=[D.setCell(d,81,0,2,1,p.clues),D.setLink(d,81,1,20,'association',p.clues),D.empty(81)];
stages.forEach((draft,i)=>{snap.game.draft=draft;snap.game.elapsedMs=i+1;assert(store.capture(snap,{action:i===2?'撤销草稿':'推理草稿'}));});assert(store.flush());
const r=store.get('draft-session');assert.equal(r.steps.length,2);assert.equal(r.droppedSteps,1);assert.deepEqual(store.frameAt('draft-session',0).draft,stages[0]);assert.deepEqual(store.frameAt('draft-session',1).draft,stages[1]);assert.deepEqual(store.frameAt('draft-session',2).draft,D.empty(81));
const reloaded=H.createStore({Engine:E,storage:io});assert.deepEqual(reloaded.frameAt('draft-session',2).draft,D.empty(81));
snap.game.draft=stages[1];snap.game.history=[{board:snap.game.board,notes:snap.game.notes,selected:0,noteMode:false,draft:stages[0]}];snap.game.branch={...snap.game.history[0],history:snap.game.history,mistakes:0};
reloaded.capture(snap,{action:'草稿与假设'});reloaded.flush();io.setItem('nine-realms.sudoku.v1',JSON.stringify(snap));const backup=B.create(io);assert.deepEqual(B.validate(backup).entries['nine-realms.sudoku.v1'].game.draft,stages[1]);
const tamper=clone(backup);tamper.entries['nine-realms.history.v1'].records[0].steps.at(-1).draft=D.empty(81);assert.throws(()=>B.validate(tamper));
const badDraft=clone(backup);badDraft.entries['nine-realms.sudoku.v1'].game.draft.cages[0].index=80;assert.throws(()=>B.validate(badDraft));
console.log('PASS drafts: 81/153/369, pure color/mark/link/cage operations, malformed/prototype/size/cage rejection, sparse replay changes, trim/reload, undo/branch backup and tampered replay rejection.');
