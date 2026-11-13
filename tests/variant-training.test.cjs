'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),T=require('../src/training.js'),V=require('../src/voyage.js');
const exercises=T.exercises().filter(e=>e.sourceId.startsWith('local-')),backups={};assert.equal(exercises.length,6);
let proofs=0,progress={version:1,completed:T.exercises().filter(e=>!e.sourceId.startsWith('local-')).map(e=>e.id)};
for(const e of exercises){const x=T.exercise(e.id),context={mode:x.mode,clues:x.clues};assert(x.local&&x.viewCells.length>=3&&x.viewCells.length<=4);assert(!('solution' in x));
 const existence=E.analyzeSolutions(x.board,context,{limit:1,maxNodes:250000,timeLimitMs:1000});assert.equal(existence.count,1,e.id);assert(!existence.exhausted);assert(E.validateComplete(existence.solution,context));
 for(const p of T.explain(e.id,2).proofs){proofs++;assert.equal(T.check(e.id,p.index,p.digit).code,'proved');const b=x.board.slice();b[p.index]=p.digit;const q=E.analyzeSolutions(b,context,{limit:1,maxNodes:250000,timeLimitMs:1000});assert.equal(q.count,0,e.id+'/'+p.index+'/'+p.digit);assert(!q.exhausted,'no budget exhaustion is a contradiction proof');assert(p.allowed.length&&p.assignmentCount>0);}
 const first=T.explain(e.id,2).proofs[0];progress=T.recordSuccess(progress,e.id,first.index,first.digit);assert.equal(T.check(e.id,-1,1).code,'invalid-input');assert.equal(T.check(e.id,80,1).code,'outside-exercise');
 const before=JSON.stringify(T.exercise(e.id));x.board.fill(9);assert.equal(JSON.stringify(T.exercise(e.id)),before);assert(T.explain(e.id,0).text&&T.explain(e.id,1).text);
}
assert.equal(progress.completed.length,15);assert.deepEqual(V.practiceProgress({__practice:progress}),progress);
const repeat=T.exercise('arrow-sum-2'),b=repeat.board.slice();b[1]=b[21]=2;const q=E.analyzeSolutions(b,{mode:'arrow',clues:repeat.clues},{limit:1,maxNodes:250000,timeLimitMs:1000});assert.equal(q.count,1);assert(!q.exhausted);assert.equal(T.check('arrow-sum-2',1,2).correct,false);assert.equal(T.check('arrow-sum-2',21,2).correct,false);
for(const key of ['solve','countSolutions','analyzeSolutions','getHint','getPuzzle']){backups[key]=E[key];E[key]=()=>{throw Error('practice read an answer/search oracle '+key);};}
try{delete require.cache[require.resolve('../src/variant-training.js')];delete require.cache[require.resolve('../src/training.js')];const Fresh=require('../src/training.js');for(const e of exercises){const x=Fresh.exercise(e.id),p=Fresh.explain(e.id,2).proofs[0];assert(Fresh.check(e.id,p.index,p.digit).ok);assert(x.candidateNote.includes('基础候选'));}}finally{Object.assign(E,backups);}
console.log('PASS six short variant exercises: '+proofs+' proven deletions, completion witnesses, peer-aware arrow repetitions, no answer/search API, old nine progress markers retained.');
