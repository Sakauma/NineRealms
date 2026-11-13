'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),E=require('../src/engine.js'),D=require('../src/diversity-clues.js');
// Independent complete-grid fixtures. Production clue construction never reads a bank.
function solution(seed){
 let x=seed+1;function rng(){x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;}
 function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 const bands=shuffle([0,1,2]),stacks=shuffle([0,1,2]);
 const rows=bands.flatMap(b=>shuffle([0,1,2]).map(i=>b*3+i));
 const cols=stacks.flatMap(b=>shuffle([0,1,2]).map(i=>b*3+i));
 const digits=shuffle([1,2,3,4,5,6,7,8,9]);
 return rows.flatMap(r=>cols.map(c=>digits[(r*3+Math.floor(r/3)+c)%9]));
}
const adjacent=(a,b)=>Math.abs(Math.floor(a/9)-Math.floor(b/9))+Math.abs(a%9-b%9)===1;
let total=0,declined=0;
for(const mode of D.supportedModes().filter(mode=>!['palindrome','between','lockout','entropic','modular','region-sum','clone'].includes(mode))){
 const layouts=new Set();
 for(let i=0;i<100;i++){
  const s=solution(i),before=s.slice();let c;
  try{c=D.build({mode,solution:s,seed:'layout-'+i});}catch(error){assert.equal(error.code,'DIVERSITY_LAYOUT_UNAVAILABLE');declined++;continue;}
  total++;
  assert.deepEqual(s,before,'input solution is never mutated');
  assert.deepEqual(D.build({mode,solution:s,seed:'layout-'+i}),c,'deterministic');
  assert.deepEqual(E.normalizeClues(mode,c),c);
  assert(E.validateComplete(s,{mode,clues:c}),mode+' constraints satisfy the supplied solution');
  if(c.lines.length){
   assert(c.lines.length>=2&&c.lines.length<=4);
   assert.equal(new Set(c.lines.flatMap(l=>l.cells)).size,c.lines.reduce((n,l)=>n+l.cells.length,0),'line paths do not share cells');
   c.lines.forEach(l=>{assert(l.cells.length>=3&&l.cells.length<=(mode==='arrow'?5:6));l.cells.slice(1).forEach((cell,j)=>assert(adjacent(l.cells[j],cell),'orthogonal non-crossing geometry'));});
  }
  if(c.cages.length){
   assert.equal(c.cages.flatMap(c=>c.cells).length,81);assert.equal(new Set(c.cages.flatMap(c=>c.cells)).size,81);
   assert(c.cages.filter(c=>c.cells.length===1).length<=4);
   c.cages.forEach(cage=>{
    assert(cage.cells.length<=5);assert.equal(new Set(cage.cells.map(cell=>s[cell])).size,cage.cells.length);
    assert.equal(cage.sum,cage.cells.reduce((sum,cell)=>sum+s[cell],0));
    const reached=new Set([cage.cells[0]]);for(let j=0;j<5;j++)cage.cells.forEach(cell=>{if([...reached].some(other=>adjacent(cell,other)))reached.add(cell);});
    assert.equal(reached.size,cage.cells.length,'every cage is connected');
   });
  }
  if(c.edges.length){assert(c.edges.length>=3&&c.edges.length<=10);assert.equal(new Set(c.edges.flatMap(e=>e.cells)).size,c.edges.length*2);}
  if(c.outside.length){
   assert(D.layoutDiversity(mode));
   assert.equal(c.outside.length,mode==='littlekiller'?8:12);
   assert.equal(new Set(c.outside.map(o=>o.side+':'+o.index)).size,c.outside.length);
   assert.equal(new Set(c.outside.map(o=>o.cells.slice().sort((a,b)=>a-b).join(','))).size,c.outside.length);
   c.outside.forEach(o=>{
    const values=o.cells.map(cell=>s[cell]);
    if(mode==='littlekiller'){
     assert(o.cells.length>=3&&o.cells.length<=8);
     assert(o.index>0&&o.index<8);
     assert.equal(o.value,values.reduce((a,b)=>a+b,0));
     const dr=Math.floor(o.cells[1]/9)-Math.floor(o.cells[0]/9),dc=o.cells[1]%9-o.cells[0]%9;
     assert.equal(Math.abs(dr),1);assert.equal(Math.abs(dc),1);
     o.cells.forEach((cell,j)=>{assert.equal(Math.floor(cell/9),Math.floor(o.cells[0]/9)+dr*j);assert.equal(cell%9,o.cells[0]%9+dc*j);});
     const last=o.cells.at(-1),nr=Math.floor(last/9)+dr,nc=last%9+dc;assert(nr<0||nr>8||nc<0||nc>8);
    }else{
     assert.equal(values.length,9);
     if(mode==='sandwich'){const a=values.indexOf(1),b=values.indexOf(9);assert.equal(o.value,values.slice(Math.min(a,b)+1,Math.max(a,b)).reduce((a,b)=>a+b,0));}
     if(mode==='xsum'){assert(values[0]<9);assert.equal(o.value,values.slice(0,values[0]).reduce((a,b)=>a+b,0));}
     if(mode==='skyscraper')assert.equal(o.value,values.filter((v,j)=>values.slice(0,j).every(n=>n<v)).length);
    }
   });
  }
  if(mode==='odd-even')assert.equal(c.parity.length,12);
  if(mode==='quadruple'){assert.equal(c.quadruples.length,5);assert.equal(new Set(c.quadruples.flatMap(q=>q.cells)).size,20);}
  const geometry=JSON.parse(JSON.stringify(c));geometry.cages.forEach(c=>delete c.sum);geometry.parity.forEach(p=>delete p.parity);geometry.quadruples.forEach(q=>delete q.values);geometry.edges.forEach(e=>delete e.value);geometry.outside.forEach(o=>delete o.value);
  layouts.add(JSON.stringify(geometry));
 }
 assert(layouts.size>=60,mode+' produces genuinely different geometry, not just sums/values');
 // A fixed solution also supports different seeded rule layouts.
 const fixed=solution(0),sameSolution=new Set();
 for(let seed=0;seed<12;seed++)try{sameSolution.add(JSON.stringify(D.build({mode,solution:fixed,seed})));}catch(e){assert.equal(e.code,'DIVERSITY_LAYOUT_UNAVAILABLE');}
 assert(sameSolution.size>=10,mode+' rule layout depends on its seed');
}
assert.throws(()=>D.build({mode:'classic',solution:solution(0),seed:1}),RangeError);
assert.throws(()=>D.build({mode:'thermo',solution:Array(81).fill(1),seed:1}),TypeError);
assert.throws(()=>D.build({mode:'thermo',solution:solution(0)}),TypeError);
const context=vm.createContext({SudokuEngine:E});vm.runInContext(D.workerSource(),context);
assert.deepEqual(JSON.parse(JSON.stringify(context.NineRealmsDiversityClues.build({mode:'arrow',solution:solution(2),seed:'worker'}))),D.build({mode:'arrow',solution:solution(2),seed:'worker'}));
assert.equal(D.supportedModes().length,22);
console.log('PASS fresh clue geometry:',total,'legal deterministic layouts;',declined,'explicit quality declines; 15 modes, seed diversity, bounded disjoint lines, connected partitioned cages and worker parity');
