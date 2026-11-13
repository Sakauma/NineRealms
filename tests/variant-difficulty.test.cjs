'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),H=require('../src/hints.js'),G=require('../src/generator.js'),B=require('../src/backup.js');
const {fixture}=require('./browser-helper.cjs');
const supported=H.ratingModes.filter(m=>m!=='classic'),report={samples:0,fallbacks:0,maxMs:0,modes:{}};
for(const mode of supported){
 const counts={easy:0,medium:0,hard:0,fallbacks:0};report.modes[mode]=counts;
 for(const difficulty of ['easy','medium','hard'])for(let i=0;i<12;i++){
  const request={mode,difficulty,seed:'variant-calibration-'+i},start=Date.now();let p;
  try{p=G.generate(request);}catch(e){assert.equal(e.code,'VARIANT_DIFFICULTY_NOT_REACHED');counts.fallbacks++;report.fallbacks++;continue;}
  report.maxMs=Math.max(report.maxMs,Date.now()-start);counts[difficulty]++;report.samples++;
  const context={mode,clues:p.clues},r=H.ratePuzzle(p.givens,context,{trace:true,timeLimitMs:1000});
  assert.equal(r.status,'rated');assert.equal(G.ratingTier(r),difficulty);assert(G.matchesDifficulty(p.givens,difficulty,context));
  assert.equal(p.generation.version,2);assert.equal(p.generation.difficultyBasis,'supported-logic');assert(p.id.startsWith('G2-'));
  const used=Object.fromEntries([...new Set(r.trace.map(s=>s.technique))].map(k=>[k,r.trace.filter(s=>s.technique===k).length]));assert.deepEqual(used,r.techniques);
  if(difficulty==='easy')assert.deepEqual(Object.keys(used),['naked-single']);
  if(difficulty==='medium'){assert(used['hidden-single']>0);assert(Object.keys(used).every(k=>['naked-single','hidden-single'].includes(k)));}
  if(difficulty==='hard')assert(Object.keys(used).some(k=>['locked-candidate','naked-pair','hidden-pair'].includes(k)));
  const proof=E.analyzeSolutions(p.givens,context,{limit:2,maxNodes:500000});assert.equal(proof.count,1);assert(!proof.exhausted);assert.deepEqual(proof.solution,p.solution);
  if(i===0){assert.deepEqual(G.generate(request),p);const s=fixture();Object.assign(s.game,{...p,puzzleId:p.id,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.indexOf(0)});delete s.game.id;delete s.game.rating;assert(B.validateWindow(s));}
 }
 for(const difficulty of ['easy','medium','hard'])assert(counts[difficulty]>0,mode+' has a complete '+difficulty+' proof');
}
const unsupported=E.getModes().filter(m=>!G.supportsDifficulty(m.id));assert.equal(unsupported.length,26);
for(const m of unsupported){const p=G.generate({mode:m.id,difficulty:'medium',seed:'still-density'});assert.equal(p.generation.difficultyBasis,'clue-density');assert.equal(G.matchesDifficulty(p.givens,'medium',{mode:m.id,clues:p.clues}),false);assert.equal(H.ratePuzzle(p.givens,{mode:m.id,clues:p.clues}).status,'unsupported');}
const real=H.ratePuzzle;try{H.ratePuzzle=()=>({solved:false,status:'budget',steps:1,techniques:{'naked-single':1}});assert.throws(()=>G.generate({mode:'diagonal',difficulty:'easy',seed:'no-invented-proof'}),/VARIANT_DIFFICULTY_NOT_REACHED/);}finally{H.ratePuzzle=real;}
console.log('PASS variant difficulty:',JSON.stringify(report));
