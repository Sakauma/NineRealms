'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine'),C=require('../src/curated'),Challenge=require('../src/challenge');
const crypto=require('node:crypto'), pinned=require('./fixtures/curated-v1.json');
for(const item of pinned){const p=C.getPuzzle(item.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify({mode:p.mode,difficulty:p.difficulty,givens:p.givens,solution:p.solution,clues:p.clues})).digest('hex'),item.sha256,'v1 identity must not change: '+item.id);}
const modes=['thermo','killer','arrow','thermo-killer'];
assert.equal(C.list().length,16);assert.equal(new Set(C.list().map(x=>x.id)).size,16);
assert.throws(()=>C.getPuzzle('not-a-curated-puzzle'),RangeError);
assert.deepEqual(C.list({mode:'classic'}),[]);
// Reproduce the exact deterministic proof from candidates only, never from solution.
function evidence(p){const context={mode:p.mode,clues:p.clues},b=p.givens.slice();let rounds=0,ruleSingles=0,initialSingles=0,minChoices=81;
 while(b.includes(0)){const moves=[];for(let i=0;i<81;i++)if(!b[i]){const candidates=E.candidates(b,i,context);assert(candidates.length,'no dead cells');if(candidates.length===1)moves.push([i,candidates[0],E.candidates(b,i,'classic').length>1]);}
 assert(moves.length,'must finish without guessing');if(!rounds)initialSingles=moves.length;rounds++;minChoices=Math.min(minChoices,moves.length);ruleSingles+=moves.filter(m=>m[2]).length;moves.forEach(([i,n])=>b[i]=n);assert(rounds<=81);}
 assert.deepEqual(b,p.solution);return {method:'local-rule-singles-v1',rounds,ruleSingles,initialSingles,minChoices,emptyCells:p.givens.filter(n=>!n).length,lineCount:p.clues.lines.length,cageCount:p.clues.cages.length};}
const signatures=new Set();
for(const meta of C.list()){
 const p=C.getPuzzle(meta.id),context={mode:p.mode,clues:p.clues};assert.equal(p.curatedId,meta.id);assert.equal(p.curatedLevel,meta.level);assert.deepEqual(evidence(p),meta.evidence);assert(meta.evidence.ruleSingles>=1);
 assert(E.validateComplete(p.solution,context));p.givens.forEach((n,i)=>assert(!n||n===p.solution[i]));
 const proof=E.analyzeSolutions(p.givens,context,{limit:2,maxNodes:250000,timeLimitMs:2000});assert.equal(proof.count,1,meta.id);assert(!proof.exhausted);assert.deepEqual(proof.solution,p.solution);
 const signature=p.mode+p.givens.join('')+JSON.stringify(p.clues);assert(!signatures.has(signature));signatures.add(signature);
 if(p.mode==='thermo'||p.mode==='arrow'){assert(p.clues.lines.length<=(meta.level==='intro'?2:5),'low visual burden');if(meta.level==='intro'){const cells=p.clues.lines.flatMap(l=>l.cells);assert.equal(new Set(cells).size,cells.length,'intro lines do not overlap');}}
 assert.equal(C.identify(p).id,meta.id);
 const recovered=Challenge.decode(Challenge.create(p));assert.equal(C.identify(recovered).id,meta.id,'backup round trip');
 const changed=JSON.parse(JSON.stringify(p));changed.givens[0]=(changed.givens[0]+1)%10;assert.equal(C.identify(changed),null,'ID cannot authenticate changed board');
 p.givens.fill(0);p.clues.lines.length=0;meta.evidence.rounds=999;assert.equal(C.getPuzzle(meta.id).givens.some(Boolean),true,'defensive copies');
}
for(const mode of modes){const intro=C.list({mode,level:'intro'}),standard=C.list({mode,level:'standard'});assert.equal(intro.length,2);assert.equal(standard.length,2);
 assert(Math.max(...intro.map(x=>x.evidence.rounds))<Math.min(...standard.map(x=>x.evidence.rounds)),'strict rule dependency gradient within mode');
 assert(Math.min(...intro.map(x=>x.evidence.initialSingles))>=10,'welcoming opening');
}
assert.equal(C.identify(null),null);assert.equal(C.identify({mode:'classic',givens:[]}),null);
console.log('curated: 16 fixed unique boards; local rule proofs, within-mode gradient, copies and backup identity passed');
