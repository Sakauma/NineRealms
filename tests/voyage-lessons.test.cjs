'use strict';
// Reproducible rule evidence, not a human playtest or a variant difficulty rating.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const V=require('../src/voyage.js'),E=require('../src/engine.js'),H=require('../src/hints.js'),B=require('../src/backup.js');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const revised=['lines-rise-v1','sums-sparks-v1'];
const pinned={
 'lines-rise-v1':{id:'voyage-lines-rise-lesson-v2',sourceId:'VOYAGE-THERMO-INTRO-V2',hash:'bdd097d9921784c3bd1ddef2f030567e40a5cf450ddc6fe946df65bbe3f14f76'},
 'sums-sparks-v1':{id:'voyage-sums-sparks-lesson-v2',sourceId:'VOYAGE-KILLER-INTRO-V2',hash:'0188f86934ff6d7905c19f912e91a69573389a3495ab5dab2c3ad31deffd9467'}
};
function proof(p,context){const r=E.analyzeSolutions(p.givens,context,{limit:2,maxNodes:1000000,timeLimitMs:1000});assert(!r.exhausted,p.voyageId+' search budget');return r;}
function localPath(p){
 const context={mode:p.mode,clues:p.clues},board=p.givens.slice(),units=E.getUnits(context).filter(u=>u.cells.length===9),steps=[];
 while(board.some(v=>!v)){
  const candidates=board.map((v,i)=>v?[]:E.candidates(board,i,context));
  let index=candidates.findIndex(a=>a.length===1),value=index<0?null:candidates[index][0],kind='rule-single';
  if(p.mode==='thermo-killer'){
   const joint=candidates.findIndex((a,i)=>a.length===1&&(()=>{const e=E.getFusionCandidateEvidence(board,i,context);return e.cage.length>1&&e.thermo.length>1;})());
   if(joint>=0){index=joint;value=candidates[index][0];}
  }
  if(index<0)outer:for(const u of units)for(let n=1;n<=9;n++){
   const places=u.cells.filter(i=>!board[i]&&candidates[i].includes(n));
   if(places.length===1){index=places[0];value=n;kind='hidden-single';break outer;}
  }
  assert(index>=0,p.voyageId+' needs more than local singles');
  const step={kind,index,value,classic:E.candidates(board,index,'classic'),full:candidates[index]};
  if(p.mode==='thermo-killer')step.evidence=E.getFusionCandidateEvidence(board,index,context);
  // Answer comparison only checks a chosen proof step; it does not select one.
  assert.equal(value,p.solution[index]);steps.push(step);board[index]=value;assert(steps.length<=81);
 }
 assert(E.validateComplete(board,context));return steps;
}
function cageSets(p,cage,usePeers){
 const missing=cage.cells.filter(i=>!p.givens[i]),known=cage.cells.filter(i=>p.givens[i]).map(i=>p.givens[i]);
 const remaining=cage.sum-known.reduce((a,b)=>a+b,0),out=new Set();
 function visit(k,used,sum,values){
  if(k===missing.length){if(sum===remaining)out.add(values.slice().sort((a,b)=>a-b).join(','));return;}
  const candidates=usePeers?E.candidates(p.givens,missing[k],'classic'):[1,2,3,4,5,6,7,8,9];
  for(const n of candidates)if(!used.includes(n)&&sum+n<=remaining)visit(k+1,used.concat(n),sum+n,values.concat(n));
 }
 visit(0,known,0,[]);return [...out].sort();
}
const report={method:'full-rule bounded uniqueness search; finite local rule replay; no human rating',chapters:[],revisions:[]};
const legacyHashes=require('./fixtures/compatibility.json').voyage;
for(const old of legacyHashes)assert.equal(hash(V.getPuzzle(old.id)),old.sha256);
for(const c of V.chapters()){
 const p=V.getPuzzle(c.id),context={mode:p.mode,clues:p.clues},before=JSON.stringify(p),r=proof(p,context);
 assert.equal(r.count,1);assert.deepEqual(r.solution,p.solution);assert.equal(JSON.stringify(p),before);
 for(const field of ['scene','observation','lesson','resolution','nextLink','objective'])assert(c[field],c.id+'/'+field);
 assert.match(c.ratingNote,/沿用/);if(p.mode!=='classic')assert.match(c.ratingNote,/尚未/);
 const item={id:c.id,objective:c.objective,givens:p.givens.filter(Boolean).length,puzzleId:p.id,sourceId:p.sourceId,sha256:hash(p),unique:{count:r.count,nodes:r.nodes,exhausted:r.exhausted}};
 if(p.mode==='classic'||['diagonal','hyper','knight'].includes(p.mode)){
  const rating=H.ratePuzzle(p.givens,context,{trace:true,timeLimitMs:1000});assert(rating.solved,c.id+' logical trace');
  item.path={steps:rating.steps,techniques:rating.techniques};
  if(c.objective==='naked-single'||c.objective==='hidden-single'||c.objective==='locked-candidate')assert(rating.techniques[c.objective]>0,c.id+' objective must occur in trace');
 }else{
  const steps=localPath(p);item.path={steps:steps.length,variantPlacements:steps.filter(s=>s.classic.length>s.full.length).length};
  if(c.objective==='joint-intersection'){
   const witness=steps.filter(s=>s.evidence.joint.length===1&&s.evidence.cage.length>1&&s.evidence.thermo.length>1);
   assert(witness.length>=1);item.witness=witness.map(s=>({index:s.index,...s.evidence}));
   for(const mode of ['thermo','killer'])assert.equal(proof(p,{mode,clues:mode==='thermo'?{version:1,lines:p.clues.lines}:{...p.clues,lines:[]}}).count,2);
  }
 }
 if(p.mode!=='classic'){
  assert.equal(proof(p,'classic').count,2,c.id+' extra rule must affect uniqueness');
  const reductions=[];
  for(let i=0;i<81;i++)if(!p.givens[i]){const classic=E.candidates(p.givens,i,'classic'),full=E.candidates(p.givens,i,context);if(full.length<classic.length)reductions.push({index:i,classic,full});}
  assert(reductions.length,c.id+' initial rule evidence');item.initialReductions=reductions.length;
  if(!item.witness)item.witness=reductions.slice(0,1);
 }
 if(c.objective==='thermo-bounds'){
  assert.deepEqual(p.clues.lines.map(l=>l.cells),[[75,67,68,69]]);assert.equal(p.givens[67],7);assert.equal(p.givens[69],9);
  assert.deepEqual(E.candidates(p.givens,68,'classic'),[2,6,8]);assert.deepEqual(E.candidates(p.givens,68,context),[8]);
 }
 if(c.objective==='palindrome-pair'){
  const paired=p.clues.lines.flatMap(l=>l.cells.flatMap((i,k)=>{const other=l.cells[l.cells.length-1-k];return p.givens[i]&&!p.givens[other]?[{given:i,empty:other,value:p.givens[i]}]:[]}));
  assert(paired.length);assert(paired.every(pair=>E.candidates(p.givens,pair.empty,context).includes(pair.value)));item.witness=paired.slice(0,1);
 }
 if(c.objective==='renban-set'){
  const reduced=p.clues.lines.flatMap(l=>l.cells.filter(i=>!p.givens[i]&&E.candidates(p.givens,i,context).length<E.candidates(p.givens,i,'classic').length));assert(reduced.length);item.witnessCells=[...new Set(reduced)];
 }
 if(c.objective==='cage-remainder'){
  const cage=p.clues.cages.find(cage=>cage.cells.length===2&&cage.cells.includes(0));assert.deepEqual(cage.cells,[0,1]);assert.equal(cage.sum,7);assert.equal(p.givens[0],1);
  assert.deepEqual(E.candidates(p.givens,1,'classic'),[2,6]);assert.deepEqual(E.candidates(p.givens,1,context),[6]);
  assert.deepEqual(E.candidates(p.givens,23,'classic'),[6,8]);assert.deepEqual(E.candidates(p.givens,23,context),[6]);
 }
 if(c.objective==='arrow-sum')assert(p.clues.lines.some(l=>l.type==='arrow'&&l.cells.some(i=>p.givens[i])));
 if(c.objective==='cage-combinations'){
  const witnesses=p.clues.cages.map(cage=>({cells:cage.cells,sum:cage.sum,arithmetic:cageSets(p,cage,false),withPeers:cageSets(p,cage,true)})).filter(w=>w.arithmetic.length>1&&w.withPeers.length>0&&w.withPeers.length<w.arithmetic.length);
  assert(witnesses.length);item.witness=witnesses.slice(0,1);
 }
 report.chapters.push(item);
}
let progress={};for(const c of V.chapters())progress=V.award(progress,c.id,{elapsedMs:1000,mistakes:0,hints:0});
assert.deepEqual(V.normalizeProgress(progress),progress);
for(const id of revised){
 const current=V.getPuzzle(id),original=V.getLegacyPuzzle(id),best=JSON.stringify(progress),originalBefore=JSON.stringify(original);
 assert.equal(current.id,pinned[id].id);assert.equal(current.sourceId,pinned[id].sourceId);assert.equal(hash(current),pinned[id].hash);
 assert.notEqual(current.id,original.id);assert.notEqual(current.sourceId,original.sourceId);
 assert.deepEqual(current.solution,original.solution);assert.equal(original.givens.filter(Boolean).length,44);assert.equal(current.givens.filter(Boolean).length,43);
 assert(V.matchesPuzzle(id,original.givens,original.mode,original.difficulty,original.clues));assert(V.matchesPuzzle(id,current.givens,current.mode,current.difficulty,current.clues));
 assert.equal(V.puzzleInfo(id,current.givens,current.mode,current.difficulty,current.clues).edition,'lesson-v2');
 assert(V.presentation(id,original).legacyEdition);assert.doesNotMatch(V.presentation(id,original).observation,/第8行|左上角/);
 assert.equal(proof(original,'classic').count,1,'old intro bypass was reproduced');
 const changed=original.givens.slice();changed[changed.findIndex(Boolean)]=0;assert(!V.matchesPuzzle(id,changed,original.mode,original.difficulty,original.clues));
 if(id==='lines-rise-v1')assert(!V.matchesPuzzle(id,current.givens,current.mode,current.difficulty,original.clues),'mixed editions cannot claim chapter progress');
 current.givens[0]=9;current.clues.cages.length=0;
 assert.notDeepEqual(V.getPuzzle(id),current,'public puzzle cannot mutate cached definitions');
 assert.equal(JSON.stringify(V.getLegacyPuzzle(id)),originalBefore);assert.equal(JSON.stringify(progress),best);
 report.revisions.push({id,originalHash:hash(original),currentHash:hash(V.getPuzzle(id)),retainedBest:progress[id]});
 for(const p of [original,V.getPuzzle(id)]){
  const game={sessionId:'lesson-compat-'+p.id,createdAt:1,puzzleId:p.id,sourceId:p.sourceId,voyageId:id,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.indexOf(0),elapsedMs:123,mistakes:0,hints:0,started:true,paused:true,completed:false,history:[],branch:null};
  const entries={[B.keys[0]]:JSON.stringify({version:8,preferences:{theme:'ivory'},game}),[B.keys[4]]:JSON.stringify(progress)},source={getItem:k=>entries[k]??null};
  const backup=B.create(source),target={...entries},storage={getItem:k=>target[k]??null,setItem:(k,v)=>{target[k]=v;},removeItem:k=>{delete target[k];}};
  assert(B.replace(storage,backup).replaced);assert.equal(target[B.keys[0]],entries[B.keys[0]]);assert.deepEqual(JSON.parse(target[B.keys[4]]),progress);
 }
}
const out=process.env.NINE_REALMS_LESSONS_REPORT;if(out)fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log('PASS voyage lessons: all 16 full-rule unique, local observation evidence and finite reasoning paths; 13 variants require extra rules; two new intro identities, original boards and chapter bests retained, cache isolation and old/new backup roundtrip. Programmatic evidence, not human playtesting.');
