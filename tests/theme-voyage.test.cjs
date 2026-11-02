'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../src/engine.js'),V=require('../src/voyage.js'),H=require('../src/hints.js');
const fixture=require('./fixtures/compatibility.json'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pinned={
 'lines-rise-v1':'4c7594ad121487392399960b515ac6978e4666287b660ef203bde5ccba295a54',
 'lines-mirror-v1':'b24259b1a0ba58cf277d84fbdcc2038d16dc471e6e355710709d7feb3959f38a',
 'lines-spectrum-v1':'490b1b1a21f4bb9b48afa007da6d797f03d610ecd91e538807c77afe17c34909',
 'sums-sparks-v1':'da9a53626a681f9dfaf5066e3d087bc73f45743623c2cfff785110d635608100',
 'sums-arrows-v1':'2262649da7a3a6bd6607cd791ce700deacf9b17934eb2fc4fdc6cdef257f6510',
 'sums-constellation-v1':'5d5940bd2310ddf81d9ddc78e97dce01b73002e9c639afdc89f297559932d68e'
};
const stats={elapsedMs:12345,mistakes:0,hints:0};let progress={};
assert.equal(V.chapters().length,16);assert.deepEqual(V.tracks().map(t=>t.id),['legacy','lines','sums','fusion']);
assert.equal(new Set(V.chapters().map(c=>c.id)).size,16);
for(const p of fixture.voyage)assert.equal(hash(V.getPuzzle(p.id)),p.sha256,'old voyage puzzle '+p.id+' changed');
assert.equal(V.getStatus({}).total,9);assert.equal(V.getStatus({}).nextId,'dawn');
for(const c of V.chapters('legacy'))progress=V.award(progress,c.id,stats);
assert.equal(V.getStatus(progress).completed,9);assert.equal(V.getStatus(progress).stars,27);
const legacy=JSON.parse(JSON.stringify(progress));assert.deepEqual(V.normalizeProgress(legacy),legacy);
assert.equal(V.getStatus(progress,'lines').unlocked,1);assert.equal(V.getStatus(progress,'sums').unlocked,1);
assert.deepEqual(V.award(progress,'lines-spectrum-v1',stats),progress,'locked stage cannot be awarded');
let steps=0;
for(const track of ['lines','sums']){
 const chapters=V.chapters(track);assert.equal(chapters.length,3);assert.deepEqual(chapters.map(c=>c.index),[0,1,2]);
 for(const c of chapters){
  assert(c.lesson&&c.goal&&c.ratingNote);const p=V.getPuzzle(c.id),context={mode:p.mode,clues:p.clues};
  assert.equal(p.sourceId,c.sourceId);assert.equal(hash(p),pinned[c.id]);assert.deepEqual(V.getPuzzle(c.id),p);
  assert(E.validateComplete(p.solution,context));assert(p.givens.every((n,i)=>!n||n===p.solution[i]));
  const a=E.analyzeSolutions(p.givens,context,{limit:2,maxNodes:250000});assert.equal(a.count,1);assert.equal(a.exhausted,false);assert.deepEqual(a.solution,p.solution);
  assert(V.matchesPuzzle(c.id,p.givens,p.mode,p.difficulty,p.clues));
  assert(!V.matchesPuzzle(c.id,p.givens,p.mode,p.difficulty,undefined));
  assert(!V.matchesPuzzle(c.id,p.givens,p.mode,p.difficulty,{version:1,lines:[],cages:[]}));
  assert(!V.matchesPuzzle(c.id,p.givens,p.mode,p.difficulty,Object.assign({},p.clues,{extra:1})));
  const changed=p.givens.slice();changed[changed.findIndex(Boolean)]=0;assert(!V.matchesPuzzle(c.id,changed,p.mode,p.difficulty,p.clues));
  const board=p.givens.slice();let count=0;
  while(board.some(n=>!n)){
   assert(count++<81);const hint=H.getStep(board,p.givens,p.solution,context);assert(hint,'hint path must continue');
   assert(['rule-single','hidden-single','naked-single'].includes(hint.kind),'curated stage needs an answer-reveal fallback: '+hint.kind);
   assert(!board[hint.index]);assert.equal(hint.value,p.solution[hint.index]);board[hint.index]=hint.value;steps++;
  }
  assert(E.validateComplete(board,context));
  progress=V.award(progress,c.id,stats);assert.equal(V.getStatus(progress,track).completed,c.index+1);
 }
}
assert.equal(V.getStatus(progress,'all').total,16);assert.equal(V.getStatus(progress,'all').completed,15);assert.equal(V.getStatus(progress,'all').stars,45);
assert(!V.journey(progress).finished);assert(V.canEnter(progress,'fusion-homecoming-v1'));assert.equal(V.nextAfter(progress,'sums-constellation-v1'),'fusion-homecoming-v1');
const withFusion=V.award(progress,'fusion-homecoming-v1',stats);assert.equal(V.getStatus(withFusion,'all').completed,16);assert.equal(V.getStatus(withFusion,'all').stars,48);assert(V.journey(withFusion).finished);
assert.deepEqual(Object.fromEntries(Object.entries(progress).filter(([id])=>Object.hasOwn(legacy,id))),legacy,'old records lost');
const orphan=JSON.parse(JSON.stringify(progress));delete orphan['lines-mirror-v1'];const clean=V.normalizeProgress(orphan);
assert(clean['lines-rise-v1']);assert(!clean['lines-spectrum-v1']);assert.equal(V.getStatus(clean,'sums').completed,3);assert.equal(V.getStatus(clean).completed,9);
assert.deepEqual(V.award(progress,'lines-rise-v1',{elapsedMs:99999,mistakes:1,hints:1}),progress,'replay must keep best record');
const corrupt=JSON.parse(JSON.stringify(progress));corrupt['sums-arrows-v1'].stars=2;assert(!V.normalizeProgress(corrupt)['sums-constellation-v1']);
const copied=V.chapters();copied[0].title='mutated';assert.notEqual(V.chapters()[0].title,'mutated');
// Fixed explicit source IDs, not a catalog position: preserve options through the public entry point.
const calls=[],context={module:{exports:{}},require:path=>path==='./training.js'?require('../src/training.js'):Object.assign({},E,{getPuzzle(...args){calls.push(args);return E.getPuzzle(...args);}})};
vm.runInNewContext(fs.readFileSync('src/voyage.js','utf8'),context);
for(const c of V.chapters().filter(c=>c.trackId!=='legacy'))context.module.exports.getPuzzle(c.id);
assert.equal(calls.length,7);assert(calls.every(args=>args[3].sourceId&&args[1].startsWith('nine-realms-themed-voyage-v1:')));
// The unchanged backup schema carries both old records and themed in-progress puzzles.
const B=require('../src/backup.js');
function storage(initial={}){const data=new Map(Object.entries(initial));return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
for(const c of V.chapters().filter(c=>c.trackId!=='legacy')){
 const p=V.getPuzzle(c.id),snapshot={version:8,preferences:{theme:'nebula',fx:true,intensity:'balanced'},game:{sessionId:'theme-'+c.id,createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:p.givens.map(()=>0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null,voyageId:c.id}};
 const source=storage({[B.keys[0]]:JSON.stringify(snapshot),[B.keys[4]]:JSON.stringify(progress)}),backup=B.create(source,{appVersion:'1.0.1'}),target=storage();
 assert.equal(B.preview(backup).voyageCount,15);assert(B.replace(target,backup).replaced);assert.equal(target.getItem(B.keys[0]),source.getItem(B.keys[0]));assert.deepEqual(JSON.parse(target.getItem(B.keys[4])),progress);
}
console.log('PASS themed voyages: 9 legacy puzzles and records unchanged; 6 pinned unique full-rule puzzles, '+steps+' verified hint steps without answer fallback; independent unlock/progress/revisit, full clue matching and source stability; old15 completion opens fusion16 without inventing a win.');
