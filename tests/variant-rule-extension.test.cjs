'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),L=require('../src/logic.js'),B=require('../src/backup.js'),F=require('./variant-rule-fixtures.cjs');
const fixtures=F.modes.map(F.openPuzzle),originals={};assert.equal(L.supported.length,33);
for(const p of fixtures){assert(F.valid(p.solution,p.clues));assert(F.valid(p.other,p.clues));assert.notDeepEqual(p.solution,p.other);assert(F.classic(p.bad));assert(!F.valid(p.bad,p.clues));assert.deepEqual(E.getConflicts(p.partial,'classic'),[]);}
for(const name of ['solve','analyzeSolutions','countSolutions','getHint','getPuzzle']){originals[name]=E[name];E[name]=()=>{throw Error('rule-only path used answer/search/catalogue oracle: '+name);};}
try{
 for(const p of fixtures){const c={mode:p.mode,clues:p.clues},before=JSON.stringify(p);assert(L.scope(c).complete);assert(L.complete(p.other,c));assert(!L.complete(p.bad,c));assert(L.conflicts(p.bad,c).length);assert(L.conflicts(p.partial,c).length);
  const near=p.other.slice();near[0]=0;assert(!L.complete(near,c));assert.equal(L.masks(near,c)[0],1<<(p.other[0]-1));
  const snapshot={version:8,game:{sessionId:'extension-'+p.mode,puzzleId:p.id,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,board:p.other,notes:Array(81).fill(0),selected:0,mistakes:0,hints:0,elapsedMs:0,logicMode:true,completed:true,started:true}};
  assert(B.validateWindow(snapshot));assert.equal(JSON.stringify(p),before);
 }
}finally{Object.assign(E,originals);}
const normalize=E.normalizeClues,getModes=E.getModes;
try{E.normalizeClues=(mode,clues)=>mode==='future-rule'?normalize('classic'):normalize(mode,clues);E.getModes=()=>getModes().concat({id:'future-rule',label:'未来规则'});assert(!L.scope('future-rule').complete);assert.match(L.scope('future-rule').message,/附加规则暂未检查/);}finally{E.normalizeClues=normalize;E.getModes=getModes;}
console.log('PASS 18 rule extensions: independent mathematical full-board oracle, different legal completions, rule-only conflicts/candidates, backup compatibility, no answer/search API; future families stay explicit.');
