'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),G=require('../src/technique-guides.js');
const modes=E.getModes().map(x=>x.id);assert.equal(modes.length,33);assert.deepEqual(G.modes.slice().sort(),modes.slice().sort());
for(const mode of modes){const g=G.get(mode);assert.equal(g.kind,'general');assert.equal(g.tips.length,2);assert(g.tips.every(t=>t.length>=15&&t.length<=85));assert(!('rating' in g));g.tips[0]='changed';assert.notEqual(G.get(mode).tips[0],'changed');const p=E.getPuzzle(E.getDifficulties(mode)[0].id,'guide-rule-witness',mode);assert(E.validateComplete(p.solution,{mode,clues:p.clues}),mode+' actual catalogue rules');}
assert.equal(G.get('unknown'),null);assert.equal(G.get('__proto__'),null);
const blank=()=>Array(81).fill(0),context=(mode,clues)=>({mode,clues:E.normalizeClues(mode,clues)});
let assertions=0;
function board(cells,values){const b=blank();cells.forEach((i,j)=>b[i]=values[j]);return b;}
function accepts(mode,clues,cells,values,expected=true){const b=board(cells,values);assert.equal(E.getConflicts(b,context(mode,clues)).length===0,expected,mode+' '+values);assertions++;return b;}
function line(mode,cells){return {lines:[{type:mode,cells}]};}
for(const [mode,a,b] of [['diagonal',0,40],['hyper',10,30],['knight',2,13],['king',20,30],['disjoint',0,30]]){const v=board([a],[5]);assert(E.candidates(v,b,'classic').includes(5));assert(!E.candidates(v,b,mode).includes(5));assertions++;}
const jig=E.getPuzzle('easy','guide-jigsaw','jigsaw'),jc=context('jigsaw',jig.clues);let added=false,removed=false;
for(let a=0;a<81;a++)for(let b=a+1;b<81;b++){const cp=E.arePeers(a,b,'classic'),jp=E.arePeers(a,b,jc);if(!cp&&jp){assert(!E.candidates(board([a],[1]),b,jc).includes(1));added=true;}if(cp&&!jp){assert(E.candidates(board([a],[1]),b,jc).includes(1));removed=true;}}assert(added&&removed,'irregular regions replace square boxes');
for(const mode of ['twin','samurai']){const p=E.getPuzzle('easy','guide-overlap',mode),c=context(mode,p.clues),layout=E.getLayout(c),shared=layout.cells.findIndex(x=>x.boards.length>1);assert(shared>=0);const units=E.getUnits(c).filter(u=>u.cells.includes(shared));assert(units.length>=5);assert(units.every(u=>u.cells.filter(i=>i!==shared).every(i=>E.getPeers(shared,c).includes(i))));}
const parity=context('odd-even',{parity:[{cell:0,parity:'odd'},{cell:1,parity:'even'}]});assert.deepEqual(E.candidates(blank(),0,parity),[1,3,5,7,9]);assert.deepEqual(E.candidates(blank(),1,parity),[2,4,6,8]);assert.equal(E.candidates(blank(),80,parity).length,9);
for(const mode of ['killer','thermo-killer']){const p=E.getPuzzle('easy','guide-cage',mode),c=context(mode,p.clues);assert(p.clues.cages.every(cage=>cage.cells.every(a=>cage.cells.every(b=>a===b||E.arePeers(a,b,c)))));if(mode==='thermo-killer'){const i=p.givens.findIndex(v=>!v),e=E.getFusionCandidateEvidence(p.givens,i,c);assert(e.joint.includes(p.solution[i]));assert(e.joint.every(n=>e.thermo.includes(n)&&e.cage.includes(n)));assert(e.cageCombinations.every(a=>new Set(a).size===a.length&&a.reduce((s,n)=>s+n,0)===e.remainingSum));}}
const tc=context('thermo',line('thermo',[0,1,2,3,4]));for(let i=0;i<5;i++)assert.deepEqual(E.candidates(blank(),i,tc),Array.from({length:5},(_,j)=>j+i+1));
accepts('arrow',line('arrow',[11,20,30]),[11,20,30],[2,1,1]);
for(const mode of ['nonconsecutive','miracle']){accepts(mode,{},[0,1],[1,9]);accepts(mode,{},[0,1],[3,4],false);}accepts('miracle',{},[2,13],[5,5],false);accepts('miracle',{},[20,30],[5,5],false);accepts('king',{},[20,30],[5,6]);
for(const type of ['kropki-black','kropki-white'])for(let a=1;a<=9;a++)for(let b=1;b<=9;b++)accepts('kropki',{edges:[{type,cells:[0,1]}]},[0,1],[a,b],type==='kropki-black'?(a===2*b||b===2*a):Math.abs(a-b)===1);
for(const value of [5,10])for(let a=1;a<=9;a++)for(let b=1;b<=9;b++)accepts('xv',{edges:[{type:'xv',cells:[0,1],value}]},[0,1],[a,b],a!==b&&a+b===value);
for(const [mode,type,value] of [['kropki','kropki-white'],['xv','xv',10]]){const c=context(mode,{edges:[{type,cells:[72,73],...(value?{value}:{})}]});for(const v of [2,4,6,9])assert(E.candidates(board([0],[1]),1,c).includes(v),'unmarked edges add no negative rule');}
const greater=context('greater',{edges:[{type:'greater',cells:[0,1]}]});assert(!E.candidates(blank(),0,greater).includes(1));assert(!E.candidates(blank(),1,greater).includes(9));
accepts('renban',line('renban',[0,1,2]),[0,1,2],[3,1,2]);accepts('renban',line('renban',[0,1,2]),[0,1,2],[3,4,6],false);
for(let a=1;a<=9;a++)for(let b=1;b<=9;b++)accepts('whispers',line('whispers',[11,20,30]),[11,20],[a,b],Math.abs(a-b)>=5);
accepts('palindrome',line('palindrome',[2,11,20,30,39]),[2,11,20,30,39],[3,1,7,1,3]);accepts('palindrome',line('palindrome',[2,11,20,30,39]),[2,11,20,30,39],[3,1,7,2,3],false);
accepts('between',line('between',[11,20,30,39]),[11,20,30,39],[1,5,5,9]);accepts('between',line('between',[11,20,30,39]),[11,20,30,39],[5,1,8,9],false);
accepts('lockout',line('lockout',[11,20,30,39]),[11,20,30,39],[2,1,8,7]);accepts('lockout',line('lockout',[11,20,30,39]),[11,20,30,39],[2,3,8,7],false);accepts('lockout',line('lockout',[11,20,30,39]),[11,20,30,39],[2,1,8,5],false);
accepts('entropic',line('entropic',[0,1,2,3,4,5]),[0,1,2,3,4,5],[1,4,7,2,5,8]);accepts('entropic',line('entropic',[0,1,2]),[0,1,2],[1,2,9],false);
accepts('modular',line('modular',[0,1,2,3,4,5]),[0,1,2,3,4,5],[1,2,3,4,5,6]);accepts('modular',line('modular',[0,1,2]),[0,1,2],[1,4,9],false);
accepts('region-sum',line('region-sum',[1,2,3,12,11]),[1,2,3,12,11],[1,4,2,3,5]);accepts('region-sum',line('region-sum',[1,2,3,12,11]),[1,2,3,12,11],[1,4,2,3,6],false);
const row=Array.from({length:9},(_,i)=>i),outside=(type,value,cells=row)=>({outside:[{type,value,cells,side:'left',index:0}]});
accepts('sandwich',outside('sandwich',7),row,[2,1,3,4,9,5,6,7,8]);accepts('sandwich',outside('sandwich',0),row,[1,9,2,3,4,5,6,7,8]);accepts('sandwich',outside('sandwich',8),row,[2,1,3,4,9,5,6,7,8],false);
accepts('skyscraper',outside('skyscraper',1),row,[9,1,2,3,4,5,6,7,8]);accepts('skyscraper',outside('skyscraper',9),row,[1,2,3,4,5,6,7,8,9]);
accepts('xsum',outside('xsum',6),row,[3,1,2,4,5,6,7,8,9]);accepts('xsum',outside('xsum',3),row,[3,1,2,4,5,6,7,8,9],false);
const diag=Array.from({length:9},(_,i)=>i*10);accepts('littlekiller',{outside:[{type:'littlekiller',value:18,cells:diag,side:'top',index:0}]},diag,[1,2,3,1,2,3,1,2,3]);
const clones={clones:[{a:[0,1],b:[30,31]}]};accepts('clone',clones,[0,1,30,31],[1,2,1,2]);accepts('clone',clones,[0,1,30,31],[1,2,2,1],false);
const quads={quadruples:[{cells:[20,21,29,30],values:[1,1,2]}]};accepts('quadruple',quads,[20,21,29,30],[1,2,3,1]);accepts('quadruple',quads,[20,21,29,30],[1,2,3,4],false);
console.log(`PASS all 33 general guides; catalogue validity plus ${assertions} independent rule witnesses, irregular/overlap/extra units, cage/line bounds, negative-dot/XV semantics, repeated values and region re-entry.`);
