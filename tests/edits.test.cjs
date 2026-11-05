'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),D=require('../src/drafts.js'),X=require('../src/edits.js'),R=require('../src/branches.js'),L=require('../src/logic.js');
const clone=x=>JSON.parse(JSON.stringify(x));
for(const mode of ['classic','twin','samurai']){
 const p=E.getPuzzle('easy','batch-'+mode,mode),n=p.givens.length;
 const g={...p,board:p.givens.slice(),notes:Array(n).fill(0),draft:D.empty(n),selected:p.givens.findIndex(v=>!v),history:[],redo:[],mistakes:7,hints:3,elapsedMs:42,branch:null};
 const blanks=g.board.map((v,i)=>v?-1:i).filter(i=>i>=0).slice(0,5),given=p.givens.findIndex(Boolean),before=clone(g);
 assert.equal(X.noteBatch(g,[...blanks,given,blanks[0]],5,'add',false),5);
 assert.equal(g.history.length,1,'a whole batch is exactly one edit');assert.equal(g.notes[given],0);
 assert(blanks.every(i=>g.notes[i]===5));let result=X.undo(g,true);assert.equal(result.noteMode,false);assert.deepEqual(g.notes,before.notes);assert.equal(g.redo.length,1);
 result=X.redo(g,false);assert.equal(result.noteMode,true);assert(blanks.every(i=>g.notes[i]===5));
 assert.equal(X.noteBatch(g,blanks,5,'add',true),0);assert.equal(g.history.length,1,'a no-op is not an edit');
 assert.equal(X.noteBatch(g,blanks,1,'remove',true),5);assert(blanks.every(i=>g.notes[i]===4));X.undo(g,true);assert(blanks.every(i=>g.notes[i]===5));
 const redoBefore=clone(g.redo);assert.equal(X.noteBatch(g,[],0,'clear',true),0);assert.deepEqual(g.redo,redoBefore);
 X.noteBatch(g,blanks,3,'toggle',true);assert.equal(g.redo.length,0,'new edit invalidates redo');assert(blanks.every(i=>g.notes[i]===6));
 X.noteBatch(g,blanks,0,'rules',true,L.masks(g.board,{mode,clues:p.clues}));const rules=clone(g.notes);X.undo(g,true);X.redo(g,true);assert.deepEqual(g.notes,rules);
 X.noteBatch(g,blanks,0,'clear',true);assert(blanks.every(i=>g.notes[i]===0));
 // A regular digit entry can change peer notes; the complete frame restores both.
 X.push(g,false);g.board[blanks[0]]=p.solution[blanks[0]];g.notes[blanks[0]]=0;g.notes[blanks[1]]=0;
 const placed=clone({board:g.board,notes:g.notes});X.undo(g,false);assert.equal(g.board[blanks[0]],0);X.redo(g,false);assert.deepEqual({board:g.board,notes:g.notes},placed);
 X.push(g,true);g.draft=D.setCell(g.draft,n,blanks[1],3,2,p.clues);const draft=clone(g.draft);X.undo(g,true);assert.equal(g.draft.colors[blanks[1]],0);X.redo(g,true);assert.deepEqual(g.draft,draft);
 assert.equal(g.mistakes,7);assert.equal(g.hints,3);assert.equal(g.elapsedMs,42,'undo/redo never rewinds cumulative counters or grants rewards');
 const primary=clone(g.board);let note=R.begin(g,true);X.noteBatch(g,[blanks[1]],1,'add',note);X.undo(g,note);R.sync(g,note);assert.equal(g.redo.length,1);note=R.switchTo(g,null,note);assert.deepEqual(g.board,primary);note=R.switchTo(g,'b1',note);assert.equal(g.redo.length,1);X.redo(g,note);assert(g.notes[blanks[1]]&1);
 for(const args of [[[-1],1,'add'],[[n],1,'add'],[[1],512,'add'],[[1],1,'bad']])assert.throws(()=>X.noteBatch(g,...args,true));
}
const b=Array(81).fill(0),notes=Array(81).fill(0);b[0]=1;notes[1]=1;
assert.deepEqual(L.lens(b,notes,1,'notes','classic').indices,[1],'player notes may include a rule-forbidden candidate');
assert(!L.lens(b,notes,1,'rules','classic').indices.includes(1));assert.equal(notes[1],1,'rule lens never cleans player notes');
console.log('PASS edits: atomic candidate add/remove/toggle/clear/rule-sync at 81/153/369 cells, no-op/invalid/given protection, full digit/peer-note/draft undo+redo, invalidation, branch-local stacks and no counter/reward rewind.');
