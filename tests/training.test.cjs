'use strict';
const crypto=require('node:crypto');
const assert=require('node:assert/strict'),E=require('../src/engine.js'),T=require('../src/training.js');
assert.equal(T.stations().length,6);assert.equal(T.exercises().length,15);
const stations=T.stations().slice(0,3),summaries=T.exercises().filter(e=>!e.sourceId.startsWith('local-'));assert.equal(stations.length,3);assert.equal(summaries.length,9);assert.equal(new Set(summaries.map(x=>x.id)).size,9);
const techniques=['locked-candidate','naked-pair','hidden-pair'];assert.deepEqual(stations.map(x=>x.id),techniques);techniques.forEach(t=>assert.equal(T.exercises(t).length,3));
const pinned={"locked-candidate-1":"7a8231f25a99e10dc48f10684aeb551341e47397ccc53e01dbc1c62a7e940f55","locked-candidate-2":"e1edec1a5299bf145f6d9b4bc8e90af58562bb06abd3c84e96c0e18f3ad25cb1","naked-pair-1":"b0f79452a2c5f2f816014186008f1bd0039a3f46b8c85db1e4e5a5e54810810b","hidden-pair-1":"97113f6b572fd9e63c31a423cb1d2c3bfec4b75846625affa29029fb30321f9e","locked-candidate-3":"357aeb89be6a4c0c6fe18466f170c7252d2c909ac2af8bde320ea7bff7a9bb8f","hidden-pair-2":"e985857d6acaccaf03126e382284382e06c79bd8797903a42294ec2cb8c18054","naked-pair-2":"476a9d7945b0062e13b9e8f43d3f17d5ca553ce80e2fad2cdec28299a7869910","hidden-pair-3":"727f11a0a127e6abd1fb6a78ab7dd7e48ccfb024bffbf5e69d3f7f1406e94212","naked-pair-3":"92c1b0861ae4b1b5fc3ac2b45b19e3c64705b2bab90d612a5f616aafb2121dd2"};
const kinds=new Set();let proofCount=0,rejectedAnswerOnly=0,progress=T.validateProgress();
for(const summary of summaries){
 const e=T.exercise(summary.id),before=JSON.stringify(e);assert.equal(crypto.createHash('sha256').update(JSON.stringify([e.givens,e.board,e.candidateMasks,e.technique])).digest('hex'),pinned[e.id]);assert.equal(e.stationId,e.technique);assert.equal(e.board.length,81);assert.equal(e.candidateMasks.length,81);assert.deepEqual(e.candidateMasks,e.masks);assert(!('solution' in e));assert(e.task&&e.scope&&e.observe&&e.candidateNote);assert(e.focusCells.every(i=>Number.isInteger(i)&&i>=0&&i<81));
 const unique=E.analyzeSolutions(e.givens,'classic',{limit:2,maxNodes:250000,timeLimitMs:500});assert.equal(unique.count,1,e.id);assert.equal(unique.exhausted,false,e.id);assert(E.validateComplete(unique.solution,'classic'));
 e.board.forEach((v,i)=>{if(v)assert.equal(v,unique.solution[i]);if(e.givens[i])assert.equal(v,e.givens[i]);const base=E.candidates(e.board,i,'classic').reduce((m,n)=>m|(1<<(n-1)),0);assert.equal(e.masks[i]&~base,0);if(!v)assert(e.masks[i]&(1<<(unique.solution[i]-1)));else assert.equal(e.masks[i],0);});
 const revealed=T.explain(e.id,2);assert(revealed.proofs.length);assert(revealed.eliminations.length);assert(T.explain(e.id,0).text&&T.explain(e.id,1).text);
 const considered=new Set();
 for(const proof of revealed.proofs){
  const key=proof.index+':'+proof.digit;if(considered.has(key))continue;considered.add(key);kinds.add(proof.kind);proofCount++;
  const answer=T.check(e.id,proof.index,proof.digit);assert(answer.ok&&answer.correct);assert.equal(answer.code,'proved');assert(answer.proof.explanation.includes('因此'));assert(answer.proof.focusCells.includes(proof.index));
  const forced=e.board.slice();forced[proof.index]=proof.digit;
  const contradiction=E.analyzeSolutions(forced,'classic',{limit:1,maxNodes:250000,timeLimitMs:500});assert.equal(contradiction.count,0,'claimed deletion must be impossible in a full solution: '+e.id+' '+key);assert.equal(contradiction.exhausted,false);
 }
 // A wrong solution digit is not enough: some other technique/proof may be needed.
 let found=false;for(let i=0;i<81&&!found;i++)for(let digit=1;digit<=9&&!found;digit++)if(!e.board[i]&&(e.masks[i]&(1<<(digit-1)))&&unique.solution[i]!==digit&&!T.check(e.id,i,digit).ok){found=true;rejectedAnswerOnly++;assert.equal(T.check(e.id,i,digit).code,'unproved-by-technique');}
 const first=revealed.proofs[0];progress=T.recordSuccess(progress,e.id,first.index,first.digit);assert(progress.completed.includes(e.id));assert.equal(JSON.stringify(e),before);
 const saved=JSON.stringify(progress);assert.deepEqual(T.validateProgress(JSON.parse(saved)),progress);assert.deepEqual(T.recordSuccess(progress,e.id,first.index,first.digit),progress);
 assert.equal(T.check(e.id,-1,1).code,'invalid-input');assert.equal(T.check(e.id,81,1).code,'invalid-input');assert.equal(T.check(e.id,0,NaN).code,'invalid-input');assert.equal(T.check(e.id,'1',1).code,'invalid-input');assert.equal(T.check(e.id,0,10).code,'invalid-input');assert.equal(T.check(e.id,{},1).code,'invalid-input');
 const filled=e.board.findIndex(Boolean);assert.equal(T.check(e.id,filled,e.board[filled]).code,'filled-cell');assert.throws(()=>T.recordSuccess(progress,e.id,filled,e.board[filled]));
 const empty=e.board.findIndex(v=>!v);let absent=1;while(absent<=9&&(e.masks[empty]&(1<<(absent-1))))absent++;if(absent<=9)assert.equal(T.check(e.id,empty,absent).code,'not-candidate');
 e.board[0]=99;e.candidateMasks[0]=999;revealed.proofs[0].index=999;assert.notEqual(T.exercise(e.id).board[0],99);assert.notEqual(T.exercise(e.id).candidateMasks[0],999);assert.notEqual(T.explain(e.id,2).proofs[0].index,999);
}
assert(kinds.has('pointing')&&kinds.has('claiming'));assert(rejectedAnswerOnly>=6);assert.equal(progress.completed.length,9);
for(const bad of ['__proto__','constructor','toString','locked-candidate-999',null,{},[],123,'x'.repeat(100000)])assert.throws(()=>T.exercise(bad));
assert.throws(()=>T.exercises('__proto__'));assert.throws(()=>T.explain(summaries[0].id,-1));assert.throws(()=>T.explain(summaries[0].id,3));
for(const bad of [{version:2,completed:[]},{version:1,completed:['unknown']},{version:1,completed:[summaries[0].id,summaries[0].id]},{version:1,completed:[],extra:true},[],{version:1,completed:Array(1000).fill('x')},Object.create({version:1,completed:[]}),JSON.parse('{"version":1,"completed":[],"__proto__":{}}')])assert.throws(()=>T.validateProgress(bad));
assert.deepEqual(T.validateProgress(null),{version:1,completed:[]});
console.log('PASS training stations: 9 fixed exercises, 3 techniques including pointing/claiming, independently rechecked proof witnesses; unique sources and '+proofCount+' forced-candidate contradictions without exhausted budgets; rejects answer-only guessing, progress bounds and malicious inputs.');
