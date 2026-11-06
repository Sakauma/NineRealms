'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),R=require('../src/rule-examples.js');
for(const mode of ['thermo','arrow','renban','whispers','thermo-killer']){
 const e=R.get(mode),context={mode:mode==='thermo-killer'?'thermo':mode,clues:e.clues};
 for(const [values,valid] of [[e.correct,true],[e.wrong,false]]){
  const board=Array(81).fill(0);e.cells.forEach((cell,i)=>board[cell]=values[i]);
  assert.equal(E.getConflicts(board,context).length===0,valid,mode+' example matches production rules');
 }
 e.correct[0]=9;assert.notEqual(R.get(mode).correct[0],9,'callers cannot mutate shared examples');
 assert(e.note.includes('规则')||e.note.includes('标记'));
}
assert.equal(R.get('classic'),null);assert.equal(R.get('unsupported'),null);assert.match(R.get('arrow').note,/不额外要求互不重复/);
console.log('PASS rule examples: correct/wrong thermometer, arrow, renban and whispers checked by the real constraint engine, fusion scope and immutable data.');
