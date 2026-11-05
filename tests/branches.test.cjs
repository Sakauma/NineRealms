'use strict';
const assert=require('node:assert/strict'), E=require('../src/engine.js'), D=require('../src/drafts.js'), R=require('../src/branches.js'), H=require('../src/history.js'), B=require('../src/backup.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const p=E.getPuzzle('easy','branch-regression','classic'),i=p.givens.findIndex(v=>!v),j=p.givens.findIndex((v,n)=>!v&&n!==i);
function game(){return {sessionId:'branch-test-session',createdAt:1,puzzleId:p.id,mode:'classic',difficulty:'easy',clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),draft:D.empty(81),selected:i,noteMode:false,history:[],redo:[],mistakes:0,hints:0,elapsedMs:0,started:true,paused:false,completed:false,branch:null,logicMode:true};}
let g=game(),note=false,raw=new Map();const storage={getItem:k=>raw.get(k)||null,setItem:(k,v)=>raw.set(k,v),removeItem:k=>raw.delete(k)},store=H.createStore({Engine:E,storage});
function capture(action){R.sync(g,note);g.noteMode=note;assert(R.matches(g.branch,g));store.capture({version:8,game:g},{action,origin:'new'});store.flush();raw.set('nine-realms.sudoku.v1',JSON.stringify({version:8,game:g}));assert(B.create(storage));}
capture('主盘');const original=clone(g.board);
note=R.begin(g,note);g.notes[i]=5;capture('假设 1');
note=R.begin(g,note);g.board[j]=p.solution[j];capture('假设 2');
assert.deepEqual(g.branch.board,original);assert.equal(g.branch.notes[i],0);assert.equal(R.choices(g).find(x=>x.id==='b2').depth,2);
note=R.switchTo(g,null,note);assert.deepEqual(g.board,original);assert.equal(g.notes[i],0);capture('切回主盘');
note=R.begin(g,note);g.notes[j]=9;capture('假设 3');
note=R.switchTo(g,'b2',note);assert.equal(g.notes[i],5);assert.equal(g.board[j],p.solution[j]);
let adopted=R.adopt(g,note);note=adopted.noteMode;assert.equal(adopted.main,false);assert.equal(g.branch.activeId,'b1');assert.equal(g.history.length,1);capture('采纳子假设');
adopted=R.adopt(g,note);note=adopted.noteMode;assert.equal(adopted.main,true);assert.equal(g.branch.activeId,null);assert.equal(g.board[j],p.solution[j]);assert.equal(g.notes[i],5);assert.equal(g.history.length,1);assert.equal(R.active(g.branch),false);capture('采纳到主盘');
const main=clone({board:g.board,notes:g.notes,draft:g.draft});
note=R.switchTo(g,'b3',note);const prior=clone(g);assert.throws(()=>R.adopt(g,note),/上层棋盘已变动/);assert.deepEqual(g,prior,'stale adoption must not overwrite either workspace');capture('切换旧分支');
note=R.discard(g,note);assert.equal(g.branch,null);assert.deepEqual({board:g.board,notes:g.notes,draft:g.draft},main);capture('丢弃旧分支');
const reloaded=H.createStore({Engine:E,storage});assert.equal(reloaded.get(g.sessionId).replayRecovered,undefined,'branch identity must clear when returning to a plain main board');
assert.equal(reloaded.frameAt(g.sessionId,reloaded.get(g.sessionId).steps.length).branchId,null);
// Every workspace has separate undo/redo history; the old single-layer save migrates lazily.
g=game();const legacy=clone(g);g.branch={board:legacy.board,notes:legacy.notes,draft:legacy.draft,selected:i,noteMode:false,history:[],mistakes:0};g.notes[i]=3;
note=R.begin(g,false);assert.equal(g.branch.nodes.length,2);note=R.discard(g,note);assert.equal(g.notes[i],3);note=R.discard(g,note);assert.equal(g.notes[i],0);assert.equal(g.branch,null);
g=game();for(let n=0;n<4;n++)note=R.begin(g,false);assert.throws(()=>R.begin(g,false),/4 层/);assert.equal(R.choices(g).length,4);note=R.discard(g,false);assert.equal(g.branch.nodes.length,3);
g=game();for(let n=0;n<8;n++){note=R.begin(g,false);note=R.switchTo(g,null,note);}assert.throws(()=>R.begin(g,false),/8 个/);R.sync(g,false);
const valid=R.validate(g.branch,g.givens,g.clues);assert.equal(valid.nodes.length,8);
for(const mutate of [x=>x.nodes[0].parentId='b1',x=>x.activeId='b999',x=>x.nodes[0].state.notes[0]=512,x=>x.nodes[0].evil=true,x=>x.nextId=1]){const bad=clone(valid);mutate(bad);assert.throws(()=>R.validate(bad,g.givens,g.clues));}
console.log('PASS branches: independent main/sibling/nested workspaces, switch/discard/adopt, atomic parent undo, stale-parent protection, legacy migration, depth/count limits, strict validation and replay/backup/reload.');
