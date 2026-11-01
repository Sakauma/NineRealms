'use strict';
const assert=require('node:assert/strict');
const Engine=require('../src/engine.js'),Hints=require('../src/hints.js');
const found=new Set(),counts={solved:0,unrated:0,eliminations:0};
function masks(board){return board.map((v,i)=>v?0:Engine.candidates(board,i,'classic').reduce((m,n)=>m|(1<<(n-1)),0));}
function play(puzzle){
 const board=puzzle.givens.slice(),givens=board.slice();let notes=Array(81).fill(0),seen=new Set();
 for(let step=0;step<1000;step++){
  const before=JSON.stringify({board,givens,solution:puzzle.solution,notes});
  const hint=Hints.getStep(board,givens,puzzle.solution,'classic',notes);
  assert.equal(JSON.stringify({board,givens,solution:puzzle.solution,notes}),before,'pure hints');
  if(!hint){assert(Engine.validateComplete(board,'classic'));return true;}
  const state=JSON.stringify([board,notes]);assert(!seen.has(state),'no stalled hint cycle');seen.add(state);
  assert(hint.title&&hint.observe&&hint.explanation&&hint.answer);assert(hint.focusCells.every(i=>i>=0&&i<81));
  if(hint.kind==='solution')return false;
  if(hint.kind==='elimination'){
   found.add(hint.technique);counts.eliminations++;
   assert.equal(hint.candidateMasks.length,81);assert(hint.eliminations.length);
   const base=masks(board);
   hint.candidateMasks.forEach((mask,i)=>{
    assert.equal(mask&~base[i],0,'never introduce illegal candidates');
    if(!board[i])assert(mask&(1<<(puzzle.solution[i]-1)),'retain solution candidate');else assert.equal(mask,0);
   });
   hint.eliminations.forEach(c=>{assert(!board[c.index]);assert(c.values.length);assert(c.values.every(n=>n!==puzzle.solution[c.index]));assert(hint.focusCells.includes(c.index));});
   // Host replaces notes atomically and records the ordinary note-diff history.
   notes=hint.candidateMasks.slice();
   const next=Hints.getStep(board,givens,puzzle.solution,'classic',notes);
   assert.notDeepEqual(next,hint,'applied proof snapshot advances');
   // Malicious or incomplete handwritten notes cannot alter the deduction.
   assert.deepEqual(Hints.getStep(board,givens,puzzle.solution,'classic',Array(81).fill(511)),Hints.getStep(board,givens,puzzle.solution,'classic',Array(81).fill(0)));
  }else{
   assert.equal(hint.value,puzzle.solution[hint.index]);assert(!board[hint.index]);board[hint.index]=hint.value;notes[hint.index]=0;
   Engine.getPeers(hint.index,'classic').forEach(i=>notes[i]&=~(1<<(hint.value-1)));
  }
 }
 assert.fail('step budget exceeded');
}
for(let i=0;i<64;i++){
 const p=Engine.getPuzzle(i<8?'easy':'hard','hints'+i,'classic');
 const rating=Hints.rateClassic(p.givens,'classic',{timeLimitMs:1000});
 assert(['rated','beyond-supported'].includes(rating.status));assert.equal(rating.solved,rating.status==='rated');
 assert.equal(play(p),rating.solved,'interactive proof and classifier agree');
 counts[rating.solved?'solved':'unrated']++;
 if(rating.solved)assert.equal(rating.remaining,0);else assert.match(rating.label,/未评级/);
 assert.match(rating.explanation,/不是给定数密度/);
}
assert.deepEqual([...found].sort(),['hidden-pair','locked-candidate','naked-pair']);
const p=Engine.getPuzzle('hard','hints3','classic');
assert.equal(Hints.rateClassic(p.givens,'classic',{maxSteps:0}).status,'budget');
assert.equal(Hints.rateClassic(Array(81).fill(0)).status,'beyond-supported');
assert.equal(Hints.rateClassic([1]).status,'invalid');
assert.equal(Hints.rateClassic(p.givens,'diagonal').status,'unsupported');
assert.equal(Hints.rateClassic(p.givens,{mode:'classic',clues:{lines:[{}]}}).status,'unsupported');
const duplicate=p.givens.slice();duplicate[0]=duplicate[1]=1;assert.equal(Hints.rateClassic(duplicate).status,'invalid');
const wrong=p.givens.slice(),index=wrong.findIndex(v=>!v);wrong[index]=p.solution[index]%9+1;
assert.equal(Hints.getStep(wrong,p.givens,p.solution,'classic',Array(81).fill(0)).kind,'correction');
// Other modes retain the original basic / explicit-answer hint contract.
for(const mode of Engine.getModes().map(m=>m.id).filter(m=>m!=='classic')){
 const variant=Engine.getPuzzle('easy','hints-regression',mode),context={mode,clues:variant.clues};
 const hint=Hints.getStep(variant.givens,variant.givens,variant.solution,context);
 assert(hint&&hint.kind!=='elimination',mode);assert.equal(hint.value,variant.solution[hint.index]);
}
console.log('PASS classic logic hints: 64 source paths, locked candidates + naked/hidden pairs, sound eliminations, notes-proof progression, honest bounded ratings, correction and 31-mode regressions.',counts);
