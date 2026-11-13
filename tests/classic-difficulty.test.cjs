'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),H=require('../src/hints.js'),G=require('../src/generator.js'),B=require('../src/backup.js');
// This fixed former "easy" puzzle needs hidden singles after a naked single.
// highestTechnique intentionally retains the first technique at the tied level.
const tiedGivens=[0,5,6,0,7,3,0,4,8,8,2,1,0,0,9,3,5,7,0,0,3,0,0,1,9,6,0,7,0,0,0,5,2,0,0,0,0,1,0,9,6,0,7,3,0,6,9,5,1,0,7,2,8,4,0,6,9,0,2,0,4,0,1,0,0,0,7,0,0,8,0,0,1,0,0,0,0,0,5,0,3];
const tiedRating=H.rateClassic(tiedGivens,'classic',{timeLimitMs:1000,trace:true});
assert.equal(tiedRating.highestTechnique,'naked-single');
assert.deepEqual(tiedRating.techniques,{'naked-single':35,'hidden-single':3});
assert.equal(G.ratingTier(tiedRating),'medium');assert.equal(G.matchesDifficulty(tiedGivens,'easy'),false);
assert.equal(tiedRating.trace.filter(s=>s.technique==='hidden-single').length,3);
for(const [techniques,expected] of [[{'naked-single':3},'easy'],[{'naked-single':2,'hidden-single':1},'medium'],[{'naked-single':1,'hidden-single':1,'locked-candidate':1},'hard'],[{'hidden-single':1,'hidden-pair':2},'hard']]){
 assert.equal(G.ratingTier({solved:true,status:'rated',steps:3,techniques}),expected);
}
for(const techniques of [null,{},[],{'naked-single':0},{'naked-single':-1},{'naked-single':0.5},{'naked-single':1,unknown:1},{'naked-single':2}])assert.equal(G.ratingTier({solved:true,status:'rated',steps:3,techniques}),null);
let generated=0,fallbacks=0,maxMs=0;const counts={};
for(const difficulty of ['easy','medium','hard']){
 counts[difficulty]=0;
 for(let i=0;i<32;i++){
  const request={mode:'classic',difficulty,seed:'technique-calibration-'+i},start=Date.now();let p;
  try{p=G.generate(request);}catch(error){assert.equal(error.code,'CLASSIC_DIFFICULTY_NOT_REACHED');fallbacks++;continue;}
  maxMs=Math.max(maxMs,Date.now()-start);
  const rating=H.rateClassic(p.givens,'classic',{timeLimitMs:1000,trace:true});
  assert.equal(rating.status,'rated');assert.equal(G.ratingTier(rating),difficulty);assert.equal(p.generation.difficultyBasis,'supported-logic');
  if(difficulty==='easy')assert.deepEqual(Object.keys(rating.techniques),['naked-single'],'easy proof never uses hidden singles or eliminations');
  const singles=H.rateClassic(p.givens,'classic',{maxSteps:rating.steps-1,timeLimitMs:1000});assert(!singles.solved,'an unfinished proof is never a completed rating');
  const proof=E.analyzeSolutions(p.givens,'classic',{limit:2,maxNodes:500000});assert.equal(proof.count,1);assert(!proof.exhausted);assert.deepEqual(proof.solution,p.solution);
  if(i===0){assert.deepEqual(G.generate(request),p);const envelope=B.create({getItem(){return null;}});const b=JSON.parse(JSON.stringify(envelope));b.entries['nine-realms.sudoku.v1']={version:8,game:{...p,puzzleId:p.id,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.indexOf(0),elapsedMs:0,mistakes:0,hints:0}};delete b.entries['nine-realms.sudoku.v1'].game.id;delete b.entries['nine-realms.sudoku.v1'].game.rating;assert(B.validate(b));}
  generated++;counts[difficulty]++;
 }
 assert(counts[difficulty]>=20,'bounded generation succeeds regularly for '+difficulty);
}
for(const result of [null,{solved:false,status:'budget',highestTechnique:'naked-single',steps:1},{solved:true,status:'rated',highestTechnique:'unknown',steps:1},{solved:true,status:'rated',highestTechnique:'naked-single',steps:0}])assert.equal(G.ratingTier(result),null);
const original=H.rateClassic;try{H.rateClassic=()=>({solved:false,status:'budget'});assert.throws(()=>G.generate({mode:'classic',difficulty:'easy',seed:'rating-budget'}),/CLASSIC_DIFFICULTY_NOT_REACHED/);}finally{H.rateClassic=original;}
const variant=G.generate({mode:'thermo',difficulty:'medium',seed:'density-still-honest'});assert.equal(variant.generation.difficultyBasis,'clue-density');
console.log('PASS classic technique calibration:',JSON.stringify({generated,fallbacks,counts,maxMs,unique:true,seedReproducible:true,backupRoundtrip:true,variantDensityUnchanged:true}));
