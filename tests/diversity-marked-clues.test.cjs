/* Constraint geometry audit, not a difficulty/unique-puzzle or visual browser audit. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../src/engine'),S=require('../src/diversity-source'),C=require('../src/diversity-clues'),D=require('../src/puzzle-diversity');
const modes=['palindrome','between','lockout','entropic','modular','region-sum','clone'];
const adjacent=(a,b)=>Math.abs(Math.floor(a/9)-Math.floor(b/9))+Math.abs(a%9-b%9)===1;
const box=i=>Math.floor(i/27)*3+Math.floor(i%9/3);
function verify(mode,s,c){
 assert.deepEqual(E.normalizeClues(mode,c),c);assert(E.validateComplete(s,{mode,clues:c}));
 if(mode==='clone'){
  assert(c.clones.length>=2&&c.clones.length<=3);
  const all=c.clones.flatMap(p=>p.a.concat(p.b));assert.equal(new Set(all).size,all.length);
  for(const p of c.clones){
   assert.equal(p.a.length,2);assert.equal(p.b.length,2);assert(adjacent(...p.a));assert(adjacent(...p.b));
   const dr=Math.floor(p.b[0]/9)-Math.floor(p.a[0]/9),dc=p.b[0]%9-p.a[0]%9;
   p.a.forEach((cell,i)=>{assert.equal(s[cell],s[p.b[i]]);assert.equal(Math.floor(p.b[i]/9)-Math.floor(cell/9),dr);assert.equal(p.b[i]%9-cell%9,dc);});
   assert(p.a.every(a=>p.b.every(b=>!adjacent(a,b)&&a!==b)),'clone halves do not touch');
  }
 }else{
  assert(c.lines.length>=2&&c.lines.length<=(mode==='region-sum'?3:4));
  const all=c.lines.flatMap(l=>l.cells);assert.equal(new Set(all).size,all.length);
  for(const line of c.lines){
   assert(line.cells.length>=3&&line.cells.length<=(mode==='region-sum'?6:mode==='palindrome'?3:5));
   const values=line.cells.map(i=>s[i]);
   line.cells.forEach((cell,i)=>{if(i)assert(adjacent(line.cells[i-1],cell));for(let j=0;j<i-1;j++)assert(!adjacent(line.cells[j],cell),'no self-touching near loops');});
   if(mode==='palindrome'){assert.deepEqual(values,values.slice().reverse());assert(new Set(line.cells.map(box)).size>1);}
   if(mode==='between'||mode==='lockout'){
    const low=Math.min(values[0],values.at(-1)),high=Math.max(values[0],values.at(-1));assert(high-low>=(mode==='between'?2:4));
    assert(values.slice(1,-1).every(n=>mode==='between'?low<n&&n<high:n<low||n>high));
   }
   if(mode==='entropic'||mode==='modular')for(let i=2;i<values.length;i++)assert.equal(new Set(values.slice(i-2,i+1).map(n=>mode==='entropic'?Math.floor((n-1)/3):(n-1)%3)).size,3);
   if(mode==='region-sum'){
    const parts=[];for(const cell of line.cells){if(!parts.length||parts.at(-1).box!==box(cell))parts.push({box:box(cell),cells:[]});parts.at(-1).cells.push(cell);}
    assert.equal(parts.length,2);assert.notEqual(parts[0].box,parts[1].box);assert(parts.every(p=>p.cells.length>=2&&p.cells.length<=3));
    assert.equal(parts[0].cells.reduce((n,i)=>n+s[i],0),parts[1].cells.reduce((n,i)=>n+s[i],0));
   }
  }
 }
 // The generated rule set is not invariant under every digit permutation:
 // at least one other classic-valid relabelled completion must violate it.
 let witness=false;
 for(let a=1;a<9&&!witness;a++)for(let b=a+1;b<=9&&!witness;b++){
  if(mode==='palindrome'||mode==='clone')break; // Equality is relabel-invariant; checked below with another valid grid.
  const other=s.map(n=>n===a?b:n===b?a:n);if(!E.validateComplete(other,{mode,clues:c}))witness=true;
 }
 if(mode!=='palindrome'&&mode!=='clone')assert(witness,'rules cannot be decoration on every digit relabeling');
}
const solutions=Array.from({length:100},(_,i)=>S.generate({mode:'classic',seed:'marked-audit-'+i}).solution),rows=[];
const bank=E.getPuzzle;E.getPuzzle=()=>{throw Error('new geometry must not consult old bank');};
try{
 for(const mode of modes){
  const classes=new Set(),sameSolutionClasses=new Set(),declines=[];let maxMs=0;
  for(let i=0;i<100;i++){
   const solution=solutions[i],before=solution.slice(),seed='marked-layout-'+i,t=performance.now();let clues;
   try{clues=C.build({mode,solution,seed});}catch(error){assert.equal(error.code,'DIVERSITY_LAYOUT_UNAVAILABLE');declines.push({sample:i,reason:error.message});continue;}
   maxMs=Math.max(maxMs,performance.now()-t);verify(mode,solution,clues);assert.deepEqual(solution,before);
   assert.deepEqual(C.build({mode,solution,seed}),clues,'seed deterministic');
   classes.add(D.layoutSignature(mode,clues,{includeValues:false}));
   if(mode==='palindrome'||mode==='clone')assert(solutions.some(other=>!E.validateComplete(other,{mode,clues})),'equalities constrain other classic-valid solutions');
  }
  for(let i=0;i<100;i++)try{sameSolutionClasses.add(D.layoutSignature(mode,C.build({mode,solution:solutions[0],seed:'geometry-only-'+i}),{includeValues:false}));}catch(e){assert.equal(e.code,'DIVERSITY_LAYOUT_UNAVAILABLE');}
  assert(classes.size>=80,mode+' needs broad D4-distinct geometry across fresh solutions');
  assert(sameSolutionClasses.size>=30,mode+' needs seeded layout variation on one fixed solution');
  rows.push({mode,requests:100,successes:100-declines.length,qualityDeclines:declines,distinctD4GeometryClasses:classes.size,fixedSolution100SeedsD4Classes:sameSolutionClasses.size,maxConstructionMs:Math.round(maxMs)});
 }
}finally{E.getPuzzle=bank;}
const context=vm.createContext({SudokuEngine:E});vm.runInContext(C.workerSource(),context);
for(const mode of modes)assert.deepEqual(JSON.parse(JSON.stringify(context.NineRealmsDiversityClues.build({mode,solution:solutions[0],seed:'worker'}))),C.build({mode,solution:solutions[0],seed:'worker'}));
const report={method:'100 new classic MRV solutions per mode; full normalized rule validation; D4 canonical geometry excludes clue values; second audit holds solution fixed',rows};
fs.mkdirSync('evidence/diversity',{recursive:true});fs.writeFileSync('evidence/diversity/marked-clue-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));console.log('PASS 7 marked clue modes; geometry/semantics/seed/worker/no-bank checks. Not uniqueness, difficulty or screenshot certification.');
