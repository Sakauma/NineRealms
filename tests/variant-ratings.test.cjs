'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),H=require('../src/hints.js');
const supported=['classic','diagonal','hyper','knight','king','disjoint','jigsaw'];assert.deepEqual(H.ratingModes,supported);
const fixtures=supported.flatMap(mode=>Array.from({length:12},(_,i)=>E.getPuzzle(E.getDifficulties(mode)[i%E.getDifficulties(mode).length].id,'rating-'+i,mode)));
const unsupported=E.getModes().map(x=>x.id).filter(x=>!supported.includes(x));assert.equal(unsupported.length,26);
const other=unsupported.map(mode=>E.getPuzzle('easy','unrated-guide',mode));
const backups={};for(const name of ['solve','countSolutions','analyzeSolutions','getPuzzle']){backups[name]=E[name];E[name]=()=>{throw Error('rating must not read a solution/search/catalogue: '+name);};}
const bit=n=>1<<(n-1),digits=m=>Array.from({length:9},(_,i)=>i+1).filter(n=>m&bit(n)),levels={'naked-single':1,'hidden-single':1,'locked-candidate':2,'naked-pair':3,'hidden-pair':3};
let proofSteps=0,removals=0;const totals={};
function replay(p,r){
 const c={mode:p.mode,clues:p.clues},units=E.getUnits(c).map(u=>u.cells),b=p.givens.slice(),m=b.map((v,i)=>v?0:E.candidates(b,i,c).reduce((s,n)=>s|bit(n),0));let placements=0,eliminations=0,highest=null;
 for(const a of r.trace){
  proofSteps++;assert(levels[a.technique]);if(!highest||levels[a.technique]>levels[highest])highest=a.technique;
  if(a.kind!=='elimination'){
   assert.equal(b[a.index],0);assert(m[a.index]&bit(a.value));assert.equal(a.value,p.solution[a.index]);
   if(a.technique==='naked-single')assert.deepEqual(digits(m[a.index]),[a.value]);
   else{assert.equal(a.technique,'hidden-single');assert(units.some(u=>u.includes(a.index)&&u.filter(i=>m[i]&bit(a.value)).length===1));}
   b[a.index]=a.value;m[a.index]=0;for(const i of E.getPeers(a.index,c))m[i]&=~bit(a.value);placements++;
  }else{
   assert(a.eliminations.length);const next=m.slice();
   for(const change of a.eliminations){assert(!b[change.index]);assert(change.values.length);assert.equal(new Set(change.values).size,change.values.length);
    for(const n of change.values){assert(m[change.index]&bit(n));assert.notEqual(n,p.solution[change.index]);
     let justified=false;
     if(a.technique==='locked-candidate')justified=units.some(from=>{const positions=from.filter(i=>m[i]&bit(n));return positions.length>=2&&units.some(to=>!from.includes(change.index)&&to.includes(change.index)&&positions.every(i=>to.includes(i)));});
     if(a.technique==='naked-pair')justified=units.some(u=>u.includes(change.index)&&u.some(i=>i!==change.index&&digits(m[i]).length===2&&(m[i]&bit(n))&&u.filter(j=>m[j]===m[i]).length===2&&m[change.index]!==m[i]));
     if(a.technique==='hidden-pair')justified=units.some(u=>{if(!u.includes(change.index))return false;for(let x=1;x<9;x++)for(let y=x+1;y<=9;y++){if(n===x||n===y)continue;const px=u.filter(i=>m[i]&bit(x)),py=u.filter(i=>m[i]&bit(y));if(px.length===2&&py.length===2&&px.every((i,j)=>i===py[j])&&px.includes(change.index))return true;}return false;});
     assert(justified,p.mode+' '+a.technique+' needs a valid unit witness');next[change.index]&=~bit(n);eliminations++;removals++;
    }
   }
   assert.deepEqual(a.candidateMasks,next);next.forEach((v,i)=>m[i]=v);
  }
  for(let i=0;i<81;i++)if(!b[i])assert(m[i]&bit(p.solution[i]),'every proven candidate set retains the known solution');
 }
 assert.equal(r.steps,r.trace.length);assert.equal(r.placements,placements);assert.equal(r.eliminations,eliminations);assert.equal(r.highestTechnique,highest);assert(!('solution' in r));assert(!('board' in r));
 if(r.solved){assert.equal(r.status,'rated');assert(E.validateComplete(b,c));assert.deepEqual(b,p.solution);}else assert(['budget','beyond-supported'].includes(r.status));
}
try{
 for(const p of fixtures){const before=JSON.stringify(p),c={mode:p.mode,clues:p.clues},r=H.ratePuzzle(p.givens,c,{trace:true,timeLimitMs:1000});replay(p,r);assert.equal(JSON.stringify(p),before,'rating never mutates givens/clues/answer');const t=totals[p.mode]||(totals[p.mode]={rated:0,unrated:0,usesVariant:0});t[r.solved?'rated':'unrated']++;if(p.mode!=='classic'&&r.solved&&!H.rateClassic(p.givens,'classic',{timeLimitMs:1000}).solved)t.usesVariant++;}
 for(const mode of supported){assert(totals[mode].rated>0);if(mode!=='classic')assert(totals[mode].usesVariant>0,mode+' must actually use its rule');}
 for(const p of other){const r=H.ratePuzzle(p.givens,{mode:p.mode,clues:p.clues});assert.equal(r.status,'unsupported');assert(!r.solved);}
 for(const p of fixtures.filter((p,i)=>i%12===0)){
  const c={mode:p.mode,clues:p.clues};assert.equal(H.ratePuzzle(p.givens,c,{maxSteps:0}).status,'budget');assert.equal(H.ratePuzzle(Array(81).fill(0),c).status,'beyond-supported');assert.equal(H.ratePuzzle([0],c).status,'invalid');assert.equal(H.ratePuzzle(p.givens,{mode:p.mode,clues:{unexpected:[]}}).status,'invalid');
  const b=Array(81).fill(0),peer=E.getPeers(0,c)[0];b[0]=b[peer]=1;assert.equal(H.ratePuzzle(b,c).status,'invalid');
  const completed=H.ratePuzzle(p.solution,c);assert(completed.solved);assert.equal(completed.steps,0);
 }
 for(const [mode,a,b] of [['diagonal',0,40],['hyper',10,30],['knight',2,13],['king',20,30],['disjoint',0,30]]){const board=Array(81).fill(0);board[a]=board[b]=5;assert.equal(E.getConflicts(board,'classic').length,0);assert.equal(H.ratePuzzle(board,mode).status,'invalid');}
 for(const malformed of [Array(81),null,'0'.repeat(81),...['1',null,NaN,1.5,10,-1].map(n=>[n,...Array(80).fill(0)])])assert.equal(H.ratePuzzle(malformed,'classic').status,'invalid');
 const deadend=Array(81).fill(0);for(let i=0;i<8;i++)deadend[i]=i+1;deadend[17]=9;assert.equal(E.getConflicts(deadend,'classic').length,0);assert.equal(H.ratePuzzle(deadend,'classic').status,'invalid','a conflict-free cell with no candidate is never rated');
 const now=Date.now;let clock=0;try{Date.now=()=>clock+=10;assert.equal(H.ratePuzzle(fixtures[0].givens,'classic',{timeLimitMs:1}).status,'budget');}finally{Date.now=now;}
 const frozen=fixtures[0].givens.slice();Object.freeze(frozen);assert(H.ratePuzzle(frozen,'classic',{timeLimitMs:1000}).steps>0);
}finally{Object.assign(E,backups);}
console.log('PASS 7-mode logical ratings: '+fixtures.length+' paths, '+proofSteps+' independently witnessed steps, '+removals+' safe candidate removals; no answer/search API; 26 unsupported modes, invalid/stalled/budget bounds. '+JSON.stringify(totals));
