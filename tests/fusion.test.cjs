'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const E=require('../src/engine'),H=require('../src/hints'),C=require('../src/challenge'),B=require('../src/variant-bank');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const old=B.filter(p=>p.mode!=='thermo-killer');assert.equal(old.length,936);assert.equal(hash(old),'8b5b6b3d66d6fa55844884b3907b8795e7be711dba7581fae90acf77b24b2678','old variant data unchanged');
assert.equal(E.getModes().length,33);assert.equal(E.getPuzzleCatalog('thermo-killer').length,3);
const pinned={easy:'ab0cad746518bb02bda66da7e473a83faa8478c727b8491e553467c4fc437405',medium:'40cc78066001043c333a2ab18a56079d0b2623543d681529a4ae07d0f52af9a5',hard:'1100fe62b98adb9da353e53fc792f374555ad0257253805771842dd911a9f536'};
let steps=0,jointSteps=0;
for(const difficulty of ['easy','medium','hard']){
 const p=E.getPuzzle(difficulty,'fusion-proof','thermo-killer'),ctx={mode:p.mode,clues:p.clues};
 assert.equal(p.sourceId,'F-thermo-killer-'+difficulty+'-v1');assert.equal(hash(B.find(source=>source.id===p.sourceId)),pinned[difficulty]);assert(E.validateComplete(p.solution,ctx));
 const snapshot=JSON.stringify(p),proof=E.analyzeSolutions(p.givens,ctx,{limit:2,maxNodes:250000,timeLimitMs:1000});
 assert.equal(proof.count,1);assert.equal(proof.exhausted,false);assert.deepEqual(proof.solution,p.solution);
 for(const [mode,clues] of [['killer',{...p.clues,lines:[]}],['thermo',{version:1,lines:p.clues.lines}]]){
  const reduced=E.analyzeSolutions(p.givens,{mode,clues},{limit:2,maxNodes:250000,timeLimitMs:1000});
  assert.equal(reduced.count,2,'both rule families must be essential: '+difficulty+'/'+mode);assert.equal(reduced.exhausted,false);
 }
 assert.equal(JSON.stringify(p),snapshot,'solver must not mutate source');
 const b=p.givens.slice();let count=0;
 while(!b.every(Boolean)){
  const before=b.slice(),hint=H.getStep(b,p.givens,p.solution,ctx);assert(hint&&hint.kind!=='solution');assert.equal(hint.value,p.solution[hint.index]);assert.deepEqual(b,before);assert(hint.focusCells.includes(hint.index));
  if(hint.kind==='fusion-single'){
   const e=hint.evidence;assert.deepEqual(e.joint,[hint.value]);assert(e.cage.includes(hint.value));assert(e.thermo.includes(hint.value));assert.deepEqual(e.joint,E.candidates(b,hint.index,ctx));
   assert(e.cageCombinations.every(a=>new Set(a).size===a.length&&a.length===e.remainingCount&&a.reduce((s,n)=>s+n,0)===e.remainingSum));
   const actual=e.cageCells.filter(i=>!b[i]).map(i=>p.solution[i]).sort((a,b)=>a-b);assert(e.cageCombinations.some(a=>JSON.stringify(a)===JSON.stringify(actual)));
   if(e.cage.length>1&&e.thermo.length>1)jointSteps++;
   assert.match(hint.explanation,/温度计/);assert.match(hint.explanation,/笼/);assert.match(hint.explanation,/不是读取答案/);
  }
  b[hint.index]=hint.value;steps++;assert(++count<=81);
 }
 assert(E.validateComplete(b,ctx));const code=C.create(p);assert(code.startsWith('NR2-'));const round=C.decode(code);assert.deepEqual(round.givens,p.givens);assert.deepEqual(round.clues,p.clues);assert.deepEqual(round.solution,p.solution);
 const bad=JSON.parse(JSON.stringify(p.clues));bad.lines[0].cells.reverse();assert(!E.validateComplete(p.solution,{mode:p.mode,clues:bad}));
 const changed=JSON.parse(JSON.stringify(p.clues));const cage=changed.cages.find(c=>c.sum<c.cells.length*(19-c.cells.length)/2);cage.sum++;assert(!E.validateComplete(p.solution,{mode:p.mode,clues:changed}));
}
assert(jointSteps>=2,'at least two actual intersection-only placement explanations');
const p=E.getPuzzle('hard','invalid','thermo-killer'),copy=()=>JSON.parse(JSON.stringify(p.clues));
for(const mutate of [c=>{c.lines=[];},c=>{c.cages=[];},c=>{c.cages[0].cells.push(c.cages[1].cells[0]);},c=>{c.cages[0].unique=false;},c=>{c.lines[0].type='arrow';},c=>{c.lines[0].cells=[0,80];},c=>{c.cages[0].evil=1;},c=>{c.lines[0].evil=1;},c=>{c.lines=Array(49).fill(c.lines[0]);},c=>{c.parity=[{cell:0,parity:'odd'}];},c=>{c.version=2;}]){
 const clues=copy();mutate(clues);assert.throws(()=>E.normalizeClues('thermo-killer',clues));assert.throws(()=>C.create({...p,clues}));
}
assert.throws(()=>E.normalizeClues('killer',p.clues),'old killer still rejects thermometer extras');assert.throws(()=>E.normalizeClues('thermo',p.clues),'old thermo still rejects cage extras');
assert.throws(()=>C.decode('NR2-'+ 'A'.repeat(C.maxInputLength)));assert.throws(()=>C.decode(C.create(p).slice(0,-1)+'Z'));
const legacy=E.getPuzzle('easy','old-compat','classic',{legacyPool:true});const code=C.create(legacy);assert(code.startsWith('NR1-'));assert.deepEqual(C.decode(code).givens,legacy.givens);
// Minimal SVG construction harness: checks both clue families + accessible labels, not pixels.
class Node{constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.style={};this.dataset={};}setAttribute(k,v){this.attrs[k]=v;}appendChild(n){this.children.push(n);return n;}replaceChildren(){this.children=[];}}
const env={SudokuEngine:E,document:{createElementNS:(ns,tag)=>new Node(tag)},console};vm.createContext(env);vm.runInContext(fs.readFileSync('src/variant-view.js','utf8'),env);const svg=new Node('svg');const rendered=env.SudokuVariantView.render(svg,{mode:p.mode,clues:p.clues});
assert.match(rendered.legend,/笼/);assert.match(rendered.legend,/温/);assert(rendered.cellDescriptions.some(s=>s.includes('虚线笼')&&s.includes('温度计')));
const nodes=[];function walk(n){nodes.push(n);n.children.forEach(walk)}walk(svg);assert(nodes.filter(n=>n.tag==='text').length>=p.clues.cages.length);assert(nodes.filter(n=>n.tag==='circle').length>=p.clues.lines.length);
console.log('PASS fusion: 3 pinned joint-rule unique puzzles; removing either family gives multiple solutions; '+steps+' honest hint steps, '+jointSteps+' genuine intersection steps; NR1 preserved/NR2 roundtrip, malformed clues rejected, both SVG families and accessibility descriptions. Not visual rendering.');
