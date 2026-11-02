'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),V=require('../src/voyage.js'),E=require('../src/engine.js'),T=require('../src/training.js'),B=require('../src/backup.js');
const fixture=require('./fixtures/compatibility.json'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pinned={
 'lines-rise-v1':'4c7594ad121487392399960b515ac6978e4666287b660ef203bde5ccba295a54',
 'lines-mirror-v1':'b24259b1a0ba58cf277d84fbdcc2038d16dc471e6e355710709d7feb3959f38a',
 'lines-spectrum-v1':'490b1b1a21f4bb9b48afa007da6d797f03d610ecd91e538807c77afe17c34909',
 'sums-sparks-v1':'da9a53626a681f9dfaf5066e3d087bc73f45743623c2cfff785110d635608100',
 'sums-arrows-v1':'2262649da7a3a6bd6607cd791ce700deacf9b17934eb2fc4fdc6cdef257f6510',
 'sums-constellation-v1':'5d5940bd2310ddf81d9ddc78e97dce01b73002e9c639afdc89f297559932d68e'
};
const id='fusion-homecoming-v1',stats={elapsedMs:200,mistakes:0,hints:0};
function storage(initial={}){const m=new Map(Object.entries(initial));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
assert.equal(V.chapters().length,16);assert.equal(V.chapters('fusion').length,1);
for(const p of fixture.voyage)assert.equal(hash(V.getPuzzle(p.id)),p.sha256);
for(const [key,expected] of Object.entries(pinned))assert.equal(hash(V.getPuzzle(key)),expected);
let old15={};for(const chapter of V.chapters().filter(c=>c.id!==id))old15=V.award(old15,chapter.id,stats);
const oldCopy=JSON.parse(JSON.stringify(old15));assert.equal(V.getStatus(old15,'all').completed,15);assert(!V.journey(old15).finished);assert(V.canEnter(old15,id));assert.equal(V.nextAfter(old15,'sums-constellation-v1'),id);
const fresh=V.migrateProgress(null,null,{existing:false}),oldEmpty=V.migrateProgress({},null,{existing:true});
assert(!oldEmpty.__journey.granted.includes(id));assert(!V.canEnter(fresh,id));assert(!V.canEnter(oldEmpty,id));assert.deepEqual(V.award(fresh,id,stats),fresh,'locked new chapter cannot earn a record');
assert(!V.normalizeProgress({[id]:{...stats,stars:3}})[id]);
const marked=V.migrateProgress(old15,null,{existing:true});assert(!marked.__journey.granted.includes(id));assert.deepEqual(Object.fromEntries(Object.entries(marked).filter(([key])=>key!=='__journey')),oldCopy);
const current=V.migrateProgress({},id,{existing:true});assert(current.__journey.granted.includes(id));assert(V.canEnter(current,id));assert(V.award(current,id,stats)[id]);
const historical=V.retainCurrent(fresh,id);assert.deepEqual(historical.__journey.granted,[id]);assert(V.canEnter(historical,id));
const puzzle=V.getPuzzle(id),context={mode:puzzle.mode,clues:puzzle.clues};assert.equal(puzzle.sourceId,'F-thermo-killer-hard-v1');assert.equal(puzzle.mode,'thermo-killer');assert(puzzle.clues.lines.length&&puzzle.clues.cages.length);
const proof=E.analyzeSolutions(puzzle.givens,context,{limit:2,maxNodes:1000000});assert.equal(proof.count,1);assert.equal(proof.exhausted,false);assert(E.validateComplete(puzzle.solution,context));assert.deepEqual(proof.solution,puzzle.solution);
assert(V.matchesPuzzle(id,puzzle.givens,puzzle.mode,puzzle.difficulty,puzzle.clues));assert(!V.matchesPuzzle(id,puzzle.givens,puzzle.mode,puzzle.difficulty,{...puzzle.clues,lines:[]}));assert(!V.matchesPuzzle(id,puzzle.givens,puzzle.mode,puzzle.difficulty,{...puzzle.clues,cages:[]}));
const won=V.award(marked,id,stats);assert.equal(V.journey(won).completed,16);assert(V.journey(won).finished);assert.equal(V.nextAfter(won,id),null);
const blankWorld=V.worldState(oldEmpty);assert.equal(blankWorld.total,16);assert.equal(blankWorld.repaired,0);assert(blankWorld.nodes.every(n=>!n.repaired&&!n.stars));assert(blankWorld.edges.every(e=>!e.repaired));
const partialWorld=V.worldState(old15);assert.equal(partialWorld.repaired,15);assert(!partialWorld.finished);assert.equal(partialWorld.phases.find(p=>p.id==='homecoming').repaired,0);assert(partialWorld.phases.filter(p=>p.id!=='homecoming').every(p=>p.complete));
const fullWorld=V.worldState(won);assert(fullWorld.finished);assert(fullWorld.nodes.every(n=>n.repaired));assert(fullWorld.edges.every(e=>e.repaired));assert.deepEqual(fullWorld.phases.map(p=>p.id),['coordinate','lines','energy','convergence','homecoming']);
const practiceId=T.exercises()[0].id,move=T.explain(practiceId,2).eliminations[0];
assert.deepEqual(V.practiceProgress(fresh),{version:1,completed:[]});assert(!Object.hasOwn(V.normalizeProgress(fresh),'__practice'));
assert.throws(()=>V.recordPractice(fresh,practiceId,move.index,0));assert(!Object.hasOwn(fresh,'__practice'));
const practiced=V.recordPractice(fresh,practiceId,move.index,move.values[0]);assert.deepEqual(V.practiceProgress(practiced).completed,[practiceId]);assert.equal(V.getStatus(practiced,'all').completed,0);assert.equal(V.getStatus(practiced,'all').stars,0);assert(!V.canEnter(practiced,id));assert.equal(V.worldState(practiced).repaired,0);assert.equal(V.worldState(practiced).satellites.reduce((n,s)=>n+s.completed,0),1);
assert.deepEqual(V.recordPractice(practiced,practiceId,move.index,move.values[0]),practiced);
for(const invalid of [{version:2,completed:[]},null,{version:1,completed:['unknown']},{version:1,completed:[practiceId,practiceId]},{version:1,completed:[],extra:1}]){
 const raw={...fresh,__practice:invalid},before=JSON.stringify(raw);assert.throws(()=>V.normalizeProgress(raw));assert.throws(()=>V.migrateProgress(raw,null,{existing:true}),e=>e.code==='VOYAGE_PROGRESS_UNSUPPORTED');assert.equal(JSON.stringify(raw),before);
}
const merged=V.recordPractice(won,practiceId,move.index,move.values[0]),source=storage({[B.keys[4]]:JSON.stringify(merged)}),backup=B.create(source,{appVersion:'1.0.1'}),target=storage();assert.equal(B.preview(backup).voyageCount,16);assert(B.replace(target,backup).replaced);assert.deepEqual(JSON.parse(target.getItem(B.keys[4])),merged);
const bad=JSON.parse(JSON.stringify(backup));bad.entries[B.keys[4]].__practice.completed=['unknown'];assert.throws(()=>B.validate(bad));
console.log('PASS voyage expansion: old15 puzzles/stats unchanged, fusion16 full-rule unique and gated, no migration grandfathering, complete clue matching, actual-only world repair, verified optional practice and strict backup/migration.');
